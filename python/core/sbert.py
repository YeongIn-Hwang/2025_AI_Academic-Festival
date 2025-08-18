# core/sbert.py
import os
import torch
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("SBERT_NAME", "snunlp/KR-SBERT-V40K-klueNLI-augSTS")

def load_sbert():
    # CPU 기준. CUDA 쓰려면 .to("cuda") 가능 (메모리 주의)
    model = SentenceTransformer(MODEL_NAME)
    model.eval()
    try:
        torch.set_num_threads(int(os.getenv("TORCH_THREADS", "4")))
    except Exception:
        pass
    return model
