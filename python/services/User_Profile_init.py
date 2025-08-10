import json

DEFAULT_WEIGHTS = {
    "w_dist": 0.5,
    "w_cluster": 0.4,
    "w_trust": 0.4,
    "w_nonhope": 0.3
}

def init_user_profile(user_id, user_params, default_weights=None):
    if default_weights is None:
        default_weights = DEFAULT_WEIGHTS
    if user_id not in user_params:
        user_params[user_id] = default_weights.copy()
    else:
        for k, v in default_weights.items():
            if k not in user_params[user_id]:
                user_params[user_id][k] = v
    return user_params

def save_user_params_to_json(user_params, filename="user_params.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(user_params, f, indent=4, ensure_ascii=False)
