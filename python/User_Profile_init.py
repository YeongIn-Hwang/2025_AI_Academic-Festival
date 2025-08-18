import json 

def init_user_profile(user_id, user_params, default_weights=None):
    if default_weights is None:
        default_weights = {
            "w_dist": 0.5,
            "w_cluster": 0.4,
            "w_trust": 0.4,
            "w_nonhope": 0.3
        }

    # user_id가 없으면 새로 생성
    if user_id not in user_params:
        user_params[user_id] = default_weights.copy()

    # user_id가 있는데 w_* 값이 누락되어 있으면만 기본값 추가
    else:
        for key, value in default_weights.items():
            if key not in user_params[user_id]:
                user_params[user_id][key] = value

    return user_params

def save_user_params_to_json(user_params, filename="user_params.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(user_params, f, indent=4, ensure_ascii=False)