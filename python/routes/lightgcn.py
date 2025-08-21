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
    모든 users의 trips_log/{title}/days/{date} 문서를 collection_group('days')로 한 번에 순회해서
    (uid, item_name, rating) 엣지를 수집한다.
    """
    edges: List[Tuple[str, str, float]] = []
    user_ids: set[str] = set()
    item_names: set[str] = set()

    # 디버그: 현재 프로젝트/DB/에뮬레이터 확인
    import os
    try:
        client = firestore.client()
        proj = getattr(client, "project", None)
        dbstr = getattr(client, "_database_string", None)
        print(f"[LGN-DEBUG] Firestore project={proj} database={dbstr} EMULATOR={os.getenv('FIRESTORE_EMULATOR_HOST')}", flush=True)
    except Exception as e:
        print(f"[LGN-DEBUG] client introspection failed: {e}", flush=True)

    days_iter = db.collection_group("days").stream()
    day_count = 0
    sched_total = 0
    sched_with_rating = 0

    for day_doc in days_iter:
        day_count += 1
        data = day_doc.to_dict() or {}
        sched = data.get("schedule", [])
        if not isinstance(sched, list):
            continue
        sched_total += len(sched)

        # 경로: user_trips/{uid}/trips_log/{title}/days/{date}
        # day_doc.reference.parent == Collection('days')
        # parent.parent == Document('trips_log/{title}')
        # parent.parent.parent == Collection('trips_log')
        # parent.parent.parent.parent == Document('user_trips/{uid}')
        try:
            uid = day_doc.reference.parent.parent.parent.parent.id
        except Exception:
            # 혹시 구조가 다르면 스킵
            continue

        for s in sched:
            if "user_rating" in s:
                sched_with_rating += 1
            r = s.get("user_rating")
            name = (s.get("title") or "").strip()
            if r is None or not name:
                continue
            try:
                rr = float(r)
            except Exception:
                print(f"[LGN-DEBUG] non-float user_rating: uid={uid} title={name} raw={r}", flush=True)
                continue

            edges.append((uid, name, rr))
            user_ids.add(uid)
            item_names.add(name)

    print(
        f"[LGN-DEBUG] days={day_count} sched_total={sched_total} sched_with_rating={sched_with_rating} "
        f"edges={len(edges)} unique_users={len(user_ids)} unique_items={len(item_names)}",
        flush=True
    )

    uid2idx = {u: i for i, u in enumerate(sorted(user_ids))}
    item2idx = {it: i for i, it in enumerate(sorted(item_names))}
    print(f"[LGN] edges={len(edges)} users={len(uid2idx)} items={len(item2idx)}", flush=True)
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
    
    try:
        _load_artifacts_from_storage.cache_clear()
    except Exception:
        pass

# ====== 엔드포인트 ======

@router.post("/build_from_log")
@router.post("/build_from_log")
def build_from_log():
    print("[LGN] build_from_log called", flush=True)
    edges, uid2idx, item2idx = _fetch_edges_from_trips()
    print(f"[LGN] after fetch: edges={len(edges)} users={len(uid2idx)} items={len(item2idx)}", flush=True)

    if not edges:
        print("[LGN] no edges -> 400", flush=True)
        raise HTTPException(400, "엣지가 없습니다. (user_rating 없음)")

    A_hat, num_u, num_i = _build_norm_adj(edges, uid2idx, item2idx)
    print(f"[LGN] adj built: U={num_u} I={num_i} nnz={A_hat._nnz()}", flush=True)

    model = LightGCN(num_u, num_i, embedding_dim=32, n_layers=2)
    model = _train(model, A_hat, edges, uid2idx, item2idx, epochs=50, lr=1e-2)
    print("[LGN] train finished", flush=True)

    users, items = model(A_hat)
    users_np = users.detach().cpu().numpy()
    items_np = items.detach().cpu().numpy()
    print(f"[LGN] emb shapes: users={users_np.shape} items={items_np.shape}", flush=True)

    _save_artifacts_to_storage(users_np, items_np, uid2idx, item2idx)
    print("[LGN] artifacts saved to storage", flush=True)

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

from functools import lru_cache
from pydantic import BaseModel

@lru_cache(maxsize=1)
def _load_artifacts_from_storage():
    """Firebase Storage에서 인덱스/임베딩을 읽어 메모리에 캐시."""
    b = storage.bucket()
    uidx_blob = b.blob("lightgcn/user_index.json")
    iidx_blob = b.blob("lightgcn/item_index.json")
    uemb_blob = b.blob("lightgcn/users_emb.npy")
    iemb_blob = b.blob("lightgcn/items_emb.npy")
    if not (uidx_blob.exists() and iidx_blob.exists() and uemb_blob.exists() and iemb_blob.exists()):
        raise RuntimeError("artifacts not found in storage")
    uid2idx = json.loads(uidx_blob.download_as_text())["uid2idx"]
    item2idx = json.loads(iidx_blob.download_as_text())["item2idx"]
    u_bytes = io.BytesIO(uemb_blob.download_as_bytes())
    i_bytes = io.BytesIO(iemb_blob.download_as_bytes())
    users_emb = np.load(u_bytes)
    items_emb = np.load(i_bytes)
    return uid2idx, item2idx, users_emb, items_emb

class ScoreReq(BaseModel):
    uid: str

    items: list[str]   # 장소 이름 리스트 (trips/{uid}/trips/{title}/places 의 name 기준)
    
@router.post("/score")
def score_items(payload: ScoreReq):
    """
    입력된 items(이름)들에 대해 유저/아이템 임베딩 내적 점수 반환.
    매칭되는 아이템이 없으면 score=None.
    """
    try:
        uid2idx, item2idx, users_emb, items_emb = _load_artifacts_from_storage()
    except Exception as e:
        return {"ok": False, "reason": f"artifacts not ready: {e}", "scores": []}

    if payload.uid not in uid2idx:
        # 학습셋에 없는 유저
        return {"ok": True, "scores": [], "reason": "user not in model"}

    # (선택) 이름 정규화 키 – 공백 trim/소문자
    norm = lambda s: (s or "").strip().lower()
    item2idx_norm = {norm(k): v for k, v in item2idx.items()}

    uvec = users_emb[uid2idx[payload.uid]]
    out = []
    for name in payload.items:
        idx = item2idx.get(name)
        if idx is None:
            # 정규화 매칭 시도
            idx = item2idx_norm.get(norm(name))
        if idx is None:
            out.append({"name": name, "score": None})
            continue
        ivec = items_emb[idx]
        score = float(np.dot(uvec, ivec))  # 필요시 cosine으로 변경 가능
        out.append({"name": name, "score": score})

    return {"ok": True, "scores": out}