from modal_app.latentsync_lipsync import (
    LATENTSYNC_MAX_CONTAINERS,
    _create_latentsync_web,
    _valid_native_output_path,
)


def test_start_accepts_json_body_instead_of_req_query_parameter():
    schema = _create_latentsync_web().openapi()
    operation = schema["paths"]["/start"]["post"]

    assert "requestBody" in operation
    assert not any(
        parameter.get("name") == "req" and parameter.get("in") == "query"
        for parameter in operation.get("parameters", [])
    )

    body_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert body_schema["$ref"].endswith("/LatentSyncStartRequest")


def test_gpu_concurrency_is_deliberately_bounded():
    assert LATENTSYNC_MAX_CONTAINERS == 2


def test_native_adapter_uses_separate_start_and_status_endpoints():
    schema = _create_latentsync_web().openapi()

    assert "/native/start" in schema["paths"]
    assert "/native/status" in schema["paths"]
    native_start = schema["paths"]["/native/start"]["post"]
    body_schema = native_start["requestBody"]["content"]["application/json"]["schema"]
    assert body_schema["$ref"].endswith("/NativeLatentSyncStartRequest")


def test_native_output_is_restricted_to_one_owned_animation_object():
    valid = (
        "307e628c-96a0-4ad6-b948-60a2f57c2f9a/"
        "06f2da46-62d9-43ce-b875-d0ae2bed0c6e/animated.mp4"
    )
    assert _valid_native_output_path(valid)
    assert not _valid_native_output_path("../animated.mp4")
    assert not _valid_native_output_path(
        "307e628c-96a0-4ad6-b948-60a2f57c2f9a/other/output.mp4"
    )
