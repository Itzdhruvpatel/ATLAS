"""Public arena API. Every limit here exists because this endpoint spends real LLM money.

Run with: uvicorn --factory arena.api:main_app
"""
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from arena.llm import BudgetExceeded, OpenAICompatLLM
from arena.record import scripted_victim
from arena.service import LEVELS, MAX_DOCUMENT, USER_TASK, clean_nickname, play
from atlas.trace import TraceStore

ROOT = Path(__file__).parent.parent
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                               "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
                               "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


class RoundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: int = Field(ge=1, le=5)
    document: str = Field(min_length=1, max_length=MAX_DOCUMENT)
    nickname: str = Field(default="", max_length=64)
    consent: bool


class Limits:
    """Per-visitor and daily caps, kept in SQLite so a restart cannot reset the spend."""

    def __init__(self, store, rounds_per_hour, calls_per_day, salt=None):
        self.store = store
        self.rounds_per_hour = rounds_per_hour
        self.calls_per_day = calls_per_day
        self.salt = salt or secrets.token_bytes(32)

    def _visitor(self, ip):
        # The salt rotates daily via the date, and raw addresses are never stored.
        day = time.strftime("%Y-%m-%d", time.gmtime())
        return hmac.new(self.salt, f"{day}|{ip}".encode(), hashlib.sha256).hexdigest()[:24]

    def _calls_key(self):
        return f"calls:{time.strftime('%Y-%m-%d', time.gmtime())}"

    def take_round(self, ip):
        hour = time.strftime("%Y-%m-%d-%H", time.gmtime())
        return self.store.add(f"rounds:{hour}:{self._visitor(ip)}") <= self.rounds_per_hour

    def budget_left(self):
        return max(0, self.calls_per_day - self.store.count(self._calls_key()))

    def spend(self):
        return self.store.add(self._calls_key()) <= self.calls_per_day


def budgeted(llm, limits):
    def call(messages, tools):
        if not limits.spend():
            raise BudgetExceeded("daily call budget used")
        return llm(messages, tools)
    return call


def scoreboard():
    path = ROOT / "eval" / "reports" / "scoreboard.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"runs": []}


def create_app(store, llm, limits, admin_key="", model="unknown", trust_proxy=False, max_active=4, web_dist=None):
    app = FastAPI(title="ATLAS arena", docs_url=None, redoc_url=None)
    active = threading.BoundedSemaphore(max_active)

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers.update(SECURITY_HEADERS)
        return response

    def client_ip(request):
        if trust_proxy and request.headers.get("x-forwarded-for"):
            return request.headers["x-forwarded-for"].split(",")[-1].strip()
        return request.client.host if request.client else "unknown"

    def run_protected(level, document):
        if not active.acquire(blocking=False):
            raise HTTPException(503, "arena is busy, try again in a moment")
        try:
            return play(level, document, budgeted(llm, limits))
        except BudgetExceeded:
            raise HTTPException(429, detail="budget")
        except httpx.HTTPError:
            raise HTTPException(502, "the model is unavailable right now")
        finally:
            active.release()

    @app.get("/api/status")
    def status():
        return {"budget_left": limits.budget_left() > 0, "model": model, "task": USER_TASK, "max_document": MAX_DOCUMENT,
                "levels": [{"level": n, "name": v[0], "description": v[1]} for n, v in LEVELS.items()]}

    @app.post("/api/rounds")
    def rounds(body: RoundRequest, request: Request):
        if not body.consent:
            raise HTTPException(400, "consent is required to play")
        if limits.budget_left() <= 0:
            raise HTTPException(429, detail="budget")
        if not limits.take_round(client_ip(request)):
            raise HTTPException(429, detail="rate")
        result = run_protected(body.level, body.document)
        replay_id = store.save(
            level=body.level, nickname=clean_nickname(body.nickname), document=body.document, won=result.won,
            blocked_by=result.blocked_by, model=model, final=result.final, events=result.events,
        )
        return {"id": replay_id, "won": result.won, "blocked_by": result.blocked_by}

    @app.get("/api/replays/{replay_id}")
    def replay(replay_id: str):
        found = store.get(replay_id)
        if not found:
            raise HTTPException(404, "replay not found")
        return found

    @app.post("/api/replays/{replay_id}/firewall-off")
    def firewall_off(replay_id: str, request: Request):
        found = store.get(replay_id)
        if not found:
            raise HTTPException(404, "replay not found")
        if found["firewall_off"]:
            return found["firewall_off"]
        if limits.budget_left() <= 0 or not limits.take_round(client_ip(request)):
            raise HTTPException(429, detail="budget")
        result = run_protected(1, found["document"])
        data = {"won": result.won, "final": result.final, "outbox": result.outbox, "network": result.network,
                "model": model, "real_run": True}
        store.set_firewall_off(replay_id, data)
        return data

    @app.get("/api/leaderboard")
    def leaderboard():
        return store.leaderboard()

    @app.get("/api/scoreboard")
    def board():
        return scoreboard()

    @app.post("/api/admin/takedown/{replay_id}")
    def takedown(replay_id: str, request: Request):
        supplied = request.headers.get("x-admin-key", "")
        if not admin_key or not hmac.compare_digest(supplied.encode(), admin_key.encode()):
            raise HTTPException(403, "forbidden")
        if not store.hide(replay_id):
            raise HTTPException(404, "replay not found")
        return {"hidden": True}

    if web_dist and Path(web_dist).exists():
        dist = Path(web_dist)
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}")
        def spa(path: str):
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    @app.exception_handler(Exception)
    async def hide_errors(request, exc):
        return JSONResponse({"detail": "unexpected server error"}, status_code=500)

    return app


def main_app():
    store = TraceStore(os.environ.get("ATLAS_DB", str(ROOT / "arena.db")))
    model = os.environ.get("ATLAS_ARENA_MODEL", "scripted demo")
    if model == "scripted demo":
        # No key needed. The site labels these rounds as scripted, not real LLM results.
        llm = scripted_victim
    else:
        # The call cap lives in Limits, which survives restarts, so the client cap is only a backstop.
        llm = OpenAICompatLLM(os.environ["ATLAS_ARENA_URL"], os.environ.get("ATLAS_ARENA_KEY", "local"), model,
                              max_calls=10**9, timeout=float(os.environ.get("ATLAS_ARENA_TIMEOUT", 120)))
    limits = Limits(store, int(os.environ.get("ATLAS_ROUNDS_PER_HOUR", 10)), int(os.environ.get("ATLAS_CALLS_PER_DAY", 500)),
                    os.environ.get("ATLAS_VISITOR_SALT", "").encode() or None)
    return create_app(store, llm, limits, os.environ.get("ATLAS_ADMIN_KEY", ""), model,
                      os.environ.get("ATLAS_TRUST_PROXY") == "1", web_dist=ROOT / "web" / "dist")
