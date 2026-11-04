import json
import re
import secrets
import sqlite3
import threading
import time

_API_KEY = re.compile(r"\b(sk-(?!canary)[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b")


def redact(value):
    """Removes real-looking credentials. Arena flags and canaries are fake, so they stay visible."""
    if isinstance(value, str):
        return _API_KEY.sub("[REDACTED]", value)
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, dict):
        return {k: redact(v) for k, v in value.items()}
    return value


class TraceStore:
    def __init__(self, path=":memory:"):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS replays (
                id TEXT PRIMARY KEY, created REAL, level INTEGER, nickname TEXT, document TEXT,
                won INTEGER, blocked_by TEXT, model TEXT, final TEXT, events TEXT,
                firewall_off TEXT, curated INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);
        """)

    def save(self, *, level, nickname, document, won, blocked_by, model, final, events, curated=False):
        replay_id = secrets.token_urlsafe(12)
        with self.lock:
            self.db.execute(
                "INSERT INTO replays (id, created, level, nickname, document, won, blocked_by, model, final, events, curated)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (replay_id, time.time(), level, nickname, document, int(won), blocked_by, model,
                 redact(final), json.dumps(redact(events)), int(curated)),
            )
            self.db.commit()
        return replay_id

    def _row(self, row):
        data = dict(row)
        data["won"] = bool(data["won"])
        data["events"] = json.loads(data["events"])
        data["firewall_off"] = json.loads(data["firewall_off"]) if data["firewall_off"] else None
        del data["hidden"]
        return data

    def get(self, replay_id):
        with self.lock:
            row = self.db.execute("SELECT * FROM replays WHERE id = ? AND hidden = 0", (replay_id,)).fetchone()
        return self._row(row) if row else None

    def set_firewall_off(self, replay_id, result):
        with self.lock:
            self.db.execute("UPDATE replays SET firewall_off = ? WHERE id = ?", (json.dumps(redact(result)), replay_id))
            self.db.commit()

    def hide(self, replay_id):
        with self.lock:
            changed = self.db.execute("UPDATE replays SET hidden = 1 WHERE id = ?", (replay_id,)).rowcount
            self.db.commit()
        return bool(changed)

    def gallery(self, limit=24):
        with self.lock:
            rows = self.db.execute(
                "SELECT * FROM replays WHERE curated = 1 AND hidden = 0 ORDER BY level, created LIMIT ?", (limit,)
            ).fetchall()
        return [self._row(r) for r in rows]

    def leaderboard(self, limit=20):
        with self.lock:
            rows = self.db.execute(
                "SELECT nickname, MAX(level) AS best_level, COUNT(*) AS wins, MIN(created) AS first_win FROM replays"
                " WHERE won = 1 AND hidden = 0 AND curated = 0 AND nickname != 'anonymous'"
                " GROUP BY nickname ORDER BY best_level DESC, first_win ASC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def add(self, name, amount=1):
        with self.lock:
            self.db.execute(
                "INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + ?",
                (name, amount, amount),
            )
            self.db.commit()
            return self.db.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()[0]

    def count(self, name):
        with self.lock:
            row = self.db.execute("SELECT value FROM counters WHERE name = ?", (name,)).fetchone()
        return row[0] if row else 0
