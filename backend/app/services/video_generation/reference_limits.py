"""Reference counts keyed by provider and the model ID sent upstream."""

# A model entry replaces the provider default. Missing keys are uncapped.
DEFAULT_REFERENCE_LIMITS = {
    "zhenzhen": {"image": 9, "video": 3, "audio": 3},
}

MODEL_REFERENCE_LIMITS = {
    ("zhenzhen", "doubao-seedance-2-0-260128"): {"total": 9, "image": 9, "video": 3, "audio": 3},
    ("zhenzhen", "doubao-seedance-2.5"): {"total": 50},
}


def validate_reference_limits(
    provider: str, model: str, *, image_count: int, video_count: int, audio_count: int,
) -> str | None:
    limits = MODEL_REFERENCE_LIMITS.get((provider, model), DEFAULT_REFERENCE_LIMITS.get(provider, {}))
    for kind, label, count in (
        ("image", "图片", image_count),
        ("video", "视频", video_count),
        ("audio", "音频", audio_count),
    ):
        limit = limits.get(kind)
        if limit is not None and count > limit:
            return f"当前模型最多支持 {limit} 个{label}引用，当前为 {count} 个。请减少引用后重试。"

    total = image_count + video_count + audio_count
    total_limit = limits.get("total")
    if total_limit is not None and total > total_limit:
        return f"当前模型最多支持 {total_limit} 个引用资产，当前共 {total} 个。请减少引用后重试。"
    return None
