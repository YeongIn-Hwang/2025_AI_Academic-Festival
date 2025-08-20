# routes/lightgcn.py
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Tuple
import numpy as np
import math, time, io, json, asyncio
import firebase_admin
from firebase_admin import firestore, storage

import torch
import torch.nn as nn
import torch.nn.functional as F

db = firestore.client()
router = APIRouter(prefix="/api/lightgcn", tags=["lightgcn"])

# ====== 간단한 LightGCN 구현 (미니버전) ======
class LightGCN(nn.Module):
    def __init__(self, num_users:int, num_items:int, embedding_dim:int=32, n_layers:int=2):
        super().__init__()
        self.num_users = num_users
        self.num_items = num_items
        self.embedding_dim = embedding_dim
        self.n_layers = n_layers

        self.user_emb = nn.Embedding(num_users, embedding_dim)
        self.item_emb = nn.Embedding(num_items, embedding_dim)
        nn.init.xavier_uniform_(self.user_emb.weight)
        nn.init.xavier_uniform_(self.item_emb.weight)

    def forward(self, A_hat: torch.sparse.FloatTensor):
        # concat user/item 임베딩
        x0 = torch.cat([self.user_emb.weight, self.item_emb.weight], dim=0)  # (U+I, D)
        all_layers = [x0]
        x = x0
        for _ in range(self.n_layers):
            x = torch.sparse.mm(A_hat, x)  # message passing
            all_layers.append(x)
        x = torch.stack(all_layers, dim=0).mean(dim=0)  # layer-mean
        users, items = torch.split(x, [self.num_users, self.num_items], dim=0)
        return users, items

# ====== (1) Firestore → 엣지/인덱스 ======
def _fetch_edges_from_trips() -> Tuple[List[Tuple[str,str,float]], Dict[str,int], Dict[str,int]]:
    """
    trips_log 전 유저/여행제목을 순회해서 (user_id, item_name, rating) 엣지로 수집.
    item은 '장소명' title 기준(같은 이름이면 같은 item으로 취급).
    """
    edges: List[Tuple[str,str,float]] = []
    user_ids: set[str] = set()
    item_names: set[str] = set()

    users_col = db.collection("user_trips").stream()
    for user_doc in users_col:
        uid = user_doc.id
        # 각 유저별 모든 trips_log 하위 제목들
        titles = db.collection("user_trips").document(uid).collection("trips_log").stream()
        for tdoc in titles:
            days_col = tdoc.reference.collection("days").stream()
            for day in days_col:
                d = day.to_dict() or {}
                sched = d.get("schedule", [])
                if not isinstance(sched, list):
                    continue
                # 각 슬롯 중 user_rating 있는 것만 edge로 수집
                for s in sched:
                    r = s.get("user_rating")
                    name = (s.get("title") or "").strip()
                    if r is None or not name:
                        continue
                    edges.append((uid, name, float(r)))
                    user_ids.add(uid)
                    item_names.add(name)

    # 인덱스 매핑
    uid2idx = {u:i for i,u in enumerate(sorted(user_ids))}
    item2idx = {it:i for i,it in enumerate(sorted(item_names))}
    return edges, uid2idx, item2idx

# ====== (2) 그래프 정규화 인접행렬 ======
def _build_norm_adj(edges, uid2idx, item2idx):
    """
    U-I 이분그래프 A 구성 후 A_hat = D^{-1/2} A D^{-1/2} 스파스 텐서 반환
    rating은 가중치로 쓰되, 0.5~5.0 범위 → 간단히 min-max 정규화(0~1) 후 (기본 1.0) 섞음.
    """
    num_u = len(uid2idx)
    num_i = len(item2idx)
    N = num_u + num_i

    # rating 정규화 (간단)
    if edges:
        all_r = [r for _,_,r in edges]
        rmin, rmax = min(all_r), max(all_r)
    else:
        rmin, rmax = 0.5, 5.0

    rows, cols, vals = [], [], []
    deg = np.zeros(N, dtype=np.float32)

    for u_raw, it_raw, r in edges:
        u = uid2idx[u_raw]
        i = item2idx[it_raw] + num_u  # item index offset
        if rmax > rmin:
            w = (r - rmin) / (rmax - rmin)  # 0~1
            w = 0.5 + 0.5 * w               # 0.5~1.0 (너무 과한 가중치 방지)
        else:
            w = 1.0

        rows += [u, i]
        cols += [i, u]
        vals += [w, w]
        deg[u] += w
        deg[i] += w

    # 정규화 계수
    deg[deg == 0] = 1.0
    norm_vals = []
    for r,c,v in zip(rows, cols, vals):
        norm_vals.append(v / math.sqrt(deg[r] * deg[c]))

    i_idx = torch.tensor([rows, cols], dtype=torch.long)
    v_val = torch.tensor(norm_vals, dtype=torch.float32)
    A_hat = torch.sparse_coo_tensor(i_idx, v_val, size=(N, N))
    return A_hat.coalesce(), num_u, num_i

# ====== (3) 학습 ======
def _train(lightgcn: LightGCN, A_hat, edges, uid2idx, item2idx, epochs:int=50, lr:float=1e-2):
    """
    매우 단순한 BPR 유사 학습(양성만 있는 상황이므로 pointwise 회귀로 대체 가능).
    여기서는 pointwise 회귀(예측 점수 ~ rating)를 최소구성으로 사용.
    """
    opt = torch.optim.Adam(lightgcn.parameters(), lr=lr)
    # rating을 0~1로 스케일하여 회귀 타겟
    if edges:
        all_r = [r for _,_,r in edges]
        rmin, rmax = min(all_r), max(all_r)
    else:
        rmin, rmax = 0.5, 5.0

    def scale(r):
        if rmax > rmin:
            return (r - rmin) / (rmax - rmin)
        return 0.5

    for ep in range(epochs):
        users, items = lightgcn(A_hat)
        loss = 0.0
        cnt = 0
        for uid_raw, item_raw, r in edges:
            u = uid2idx[uid_raw]
            i = item2idx[item_raw]
            score = (users[u] * items[i]).sum()    # 내적
            target = torch.tensor(scale(r), dtype=torch.float32)
            loss = loss + F.mse_loss(score, target)
            cnt += 1
        if cnt > 0:
            loss = loss / cnt
        else:
            loss = torch.tensor(0.0)

        opt.zero_grad()
        loss.backward()
        opt.step()

    return lightgcn

# ====== (4) 아티팩트 저장 (인덱스 + 임베딩) ======
def _save_artifacts_to_storage(users_emb: np.ndarray, items_emb: np.ndarray,
                               uid2idx: Dict[str,int], item2idx: Dict[str,int]):
    """
    Firebase Storage에 다음 업로드:
      - lightgcn/user_index.json
      - lightgcn/item_index.json
      - lightgcn/users_emb.npy
      - lightgcn/items_emb.npy
    """
    bucket = storage.bucket()  # 기본 버킷
    ts = int(time.time())

    # 인덱스 (역인덱스 포함)
    user_index = {"uid2idx": uid2idx}
    item_index = {"item2idx": item2idx}

    for name, obj in [("user_index.json", user_index), ("item_index.json", item_index)]:
        blob = bucket.blob(f"lightgcn/{name}")
        blob.upload_from_string(json.dumps(obj, ensure_ascii=False), content_type="application/json")

    # numpy 배열
    for name, arr in [("users_emb.npy", users_emb), ("items_emb.npy", items_emb)]:
        buf = io.BytesIO()
        np.save(buf, arr)
        buf.seek(0)
        blob = bucket.blob(f"lightgcn/{name}")
        blob.upload_from_file(buf, content_type="application/octet-stream")

    # 메타(버전)
    meta = {"updated_at": ts, "dim": users_emb.shape[1] if users_emb.size else 0,
            "num_users": users_emb.shape[0], "num_items": items_emb.shape[0]}
    bucket.blob("lightgcn/meta.json").upload_from_string(json.dumps(meta), content_type="application/json")

    # 파이어스토어에도 버전 기록(선택)
    db.collection("lightgcn").document("meta").set(meta, merge=True)

# ====== 엔드포인트 ======

@router.post("/build_from_log")
def build_from_log():
    edges, uid2idx, item2idx = _fetch_edges_from_trips()
    if not edges:
        raise HTTPException(400, "엣지가 없습니다. (user_rating 없음)")

    A_hat, num_u, num_i = _build_norm_adj(edges, uid2idx, item2idx)
    model = LightGCN(num_u, num_i, embedding_dim=32, n_layers=2)

    model = _train(model, A_hat, edges, uid2idx, item2idx, epochs=50, lr=1e-2)
    users, items = model(A_hat)

    # numpy 변환
    users_np = users.detach().cpu().numpy()
    items_np = items.detach().cpu().numpy()

    _save_artifacts_to_storage(users_np, items_np, uid2idx, item2idx)
    return {"ok": True, "users": int(users_np.shape[0]), "items": int(items_np.shape[0]), "dim": int(users_np.shape[1])}

@router.post("/warm_start")  # 서버 기동시 백그라운드 호출용
def warm_start():
    try:
        return build_from_log()
    except HTTPException as e:
        # 학습할 엣지가 없으면 조용히 통과
        if e.status_code == 400:
            return {"ok": False, "reason": e.detail}
        raise

@router.get("/status")
def status():
    # 저장된 메타를 알려줌
    snap = db.collection("lightgcn").document("meta").get()
    if snap.exists:
        return {"ok": True, "meta": snap.to_dict()}
    return {"ok": False, "meta": None}
