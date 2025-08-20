# routers/user.py (핵심만)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.firebase import db
from services.User_Profile_init import init_user_profile

router = APIRouter()

class InitReq(BaseModel):
    uid: str

@router.post("/user_param_init")  # ← 프론트 fetch 경로와 일치!
def init_user_params(req: InitReq):
    uid = req.uid.strip()
    if not uid:
        raise HTTPException(400, "uid가 비어있습니다.")

    doc_ref = db.collection("user_params").document(uid)
    snap = doc_ref.get()

    user_params = {}
    if snap.exists:
        data = snap.to_dict() or {}
        current = { k: data[k] for k in ["w_dist","w_cluster","w_trust","w_nonhope"] if k in data }
        user_params[uid] = current

    updated = init_user_profile(uid, user_params)
    weights = updated[uid]

    doc_ref.set({
        "user_id": uid,
        **weights,
    }, merge=True)

    return {"ok": True, "weights": weights}
