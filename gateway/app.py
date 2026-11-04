"""OpenAI-compatible firewall gateway. Point an agent's base_url here to protect it."""
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

from atlas.firewall import Firewall
from atlas.policy import Policy

MAX_BODY = 2_000_000


def _session_id(headers, messages):
    explicit = headers.get("x-atlas-session")
    if explicit:
        return explicit[:128]
    # Identical conversations share a session without the header, so the docs recommend setting it.
    seed = json.dumps([m for m in messages if m.get("role") in ("system", "user")][:2], sort_keys=True)
    return hashlib.sha256(seed.encode()).hexdigest()


def _completion(model, message):
    finish = "tool_calls" if message.get("tool_calls") else "stop"
    return {
        "id": f"chatcmpl-{secrets.token_hex(8)}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "message": message, "finish_reason": finish}],
    }


def _stream(model, message):
    # ponytail: buffers the whole reply and sends it as one chunk, which keeps checks simple.
    # Time to first token suffers. Pass plain text through chunk by chunk if that matters.
    finish = "tool_calls" if message.get("tool_calls") else "stop"
    delta = {"role": "assistant", "content": message.get("content")}
    if message.get("tool_calls"):
        delta["tool_calls"] = [{"index": i, **c} for i, c in enumerate(message["tool_calls"])]
    base = {"id": f"chatcmpl-{secrets.token_hex(8)}", "object": "chat.completion.chunk", "created": int(time.time()), "model": model}
    yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': delta, 'finish_reason': None}]})}\n\n"
    yield f"data: {json.dumps({**base, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': finish}]})}\n\n"
    yield "data: [DONE]\n\n"


def create_app(policy, gateway_key, upstream_factory, layers=None):
    """upstream_factory(body) returns a callable taking (messages, tools) and returning a message dict."""
    if not gateway_key:
        raise ValueError("ATLAS_GATEWAY_KEY is required, otherwise this is an open LLM proxy")
    firewall = Firewall(policy, layers)
    app = FastAPI(title="ATLAS gateway")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        supplied = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(supplied.encode(), gateway_key.encode()):
            raise HTTPException(401, "invalid gateway key")
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise HTTPException(413, "request too large")
        try:
            body = json.loads(raw)
            messages, model = body["messages"], body["model"]
        except (ValueError, KeyError, TypeError):
            raise HTTPException(400, "body must be JSON with model and messages")
        upstream = upstream_factory(body)
        try:
            reply = await run_in_threadpool(
                firewall.complete, _session_id(request.headers, messages), messages, body.get("tools") or [], upstream
            )
        except httpx.HTTPError:
            return JSONResponse({"error": {"message": "upstream LLM request failed"}}, status_code=502)
        except Exception:
            # Fail closed: a broken check must never let the model's reply through.
            return JSONResponse({"error": {"message": "firewall check failed, reply withheld"}}, status_code=500)
        if body.get("stream"):
            return StreamingResponse(_stream(model, reply), media_type="text/event-stream")
        return _completion(model, reply)

    return app


def upstream_from_env(body):
    client = httpx.Client(
        base_url=os.environ["ATLAS_UPSTREAM_URL"],
        headers={"Authorization": f"Bearer {os.environ.get('ATLAS_UPSTREAM_KEY', 'local')}"},
        timeout=float(os.environ.get("ATLAS_UPSTREAM_TIMEOUT", 120)),
    )
    extras = {k: body[k] for k in ("temperature", "max_tokens", "top_p") if k in body}

    def call(messages, tools):
        payload = {"model": body["model"], "messages": messages, **extras}
        if tools:
            payload["tools"] = tools
        response = client.post("/chat/completions", json=payload)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]

    return call


def main_app():
    policy_path = os.environ.get("ATLAS_POLICY", Path(__file__).parent.parent / "policies" / "arena.yaml")
    return create_app(Policy.load(policy_path), os.environ.get("ATLAS_GATEWAY_KEY", ""), upstream_from_env)
