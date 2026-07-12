from modal_app.latentsync_lipsync import _create_latentsync_web


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
