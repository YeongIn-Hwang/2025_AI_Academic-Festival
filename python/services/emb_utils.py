# services/emb_utils.py
import numpy as np
import html
import re

def get_sbert_embedding(text, model):
    dim = model.get_sentence_embedding_dimension()
    if not isinstance(text, str) or not text.strip():
        return np.zeros(dim)
    return model.encode(text, convert_to_numpy=True)

def get_sbert_review_vector(reviews, model):
    dim = model.get_sentence_embedding_dimension()
    embeddings = [
        get_sbert_embedding(review, model)
        for review in reviews if isinstance(review, str) and review.strip()
    ]
    return np.mean(embeddings, axis=0) if embeddings else np.zeros(dim)

def get_place_vector_with_name(place, review_weight=1.0, name_weight=0.0, model=None):
    dim = model.get_sentence_embedding_dimension()
    reviews = place.get("reviews", [])
    name = place.get("name", "")

    review_vec = get_sbert_review_vector(reviews, model)
    name_vec = get_sbert_embedding(name, model)

    total_weight = review_weight + name_weight
    if total_weight == 0:
        return np.zeros(dim)

    return (review_weight * review_vec + name_weight * name_vec) / total_weight

def add_review_vectors_to_places(all_places, model, review_weight=1.0, name_weight=0.0):
    for place in all_places:
        if "reviews" in place and "name" in place:
            place["review_vector"] = get_place_vector_with_name(
                place, review_weight=review_weight, name_weight=name_weight, model=model
            )
    return all_places

def clean_review(text):
    if not isinstance(text, str):
        return None

    text = html.unescape(text)
    text = text.strip()

    if len(text) < 3:
        return None

    if not re.search("[가-힣]", text):  # 한글 없는 외국어 리뷰 제거
        return None

    text = re.sub(r"(.)\1{2,}", r"\1\1", text)            # 반복 문자 축소
    text = re.sub(r"[^\w\s가-힣.,!?]", "", text)          # 특수문자, 이모지 제거
    text = text[:300]                                     # 최대 길이 제한

    return text if text else None

def clean_reviews_in_places(all_places: list) -> list:
    for place in all_places:
        original_reviews = place.get("reviews", [])
        cleaned_reviews = [clean_review(r) for r in original_reviews]
        cleaned_reviews = [r for r in cleaned_reviews if r]  # None 제거
        place["reviews"] = cleaned_reviews
    return all_places

def clean_keyword(text):
    if not isinstance(text, str):
        return None

    text = html.unescape(text)
    text = text.strip()

    if not re.search("[가-힣]", text):  # 한글 없는 외국어 리뷰 제거
        return None

    text = re.sub(r"(.)\1{2,}", r"\1\1", text)  # 반복 문자 정리
    text = re.sub(r"[^\w\s가-힣.,!?]", "", text)  # 이모지, 특수문자 제거
    text = text[:300]  # 너무 긴 키워드 자르기

    return text if text else None

