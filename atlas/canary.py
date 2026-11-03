import base64
import hashlib
import hmac

from atlas.decode import carries


def make_canary(key, session_id, purpose="context"):
    digest = hmac.new(key, f"{session_id}|{purpose}".encode(), hashlib.sha256).digest()
    return "sk-canary-" + base64.b32encode(digest).decode().lower().rstrip("=")[:24]


def hits(text, canary):
    return carries(text, canary)
