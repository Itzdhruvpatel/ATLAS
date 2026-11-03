import re
import unicodedata

SHINGLE = 5
SHINGLE_OVERLAP = 0.6
_RANK = ["T0", "T1", "T2", "T3"]


def _norm(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(text)).lower()).strip()


def _shingles(text):
    words = text.split()
    return {" ".join(words[i:i + SHINGLE]) for i in range(max(0, len(words) - SHINGLE + 1))}


class Provenance:
    """Remembers where each piece of session text came from."""

    def __init__(self):
        self.chunks = []
        self.tainted = False

    def add(self, text, trust, source=""):
        self.chunks.append({"text": _norm(text), "trust": trust, "source": source})
        if trust == "T3":
            self.tainted = True

    def origin(self, value):
        """Returns the most trusted level the value appears at, or UNKNOWN if the model made it up."""
        target = _norm(value)
        if not target:
            return "UNKNOWN", []
        matches = [c for c in self.chunks if target in c["text"]]
        if not matches:
            wanted = _shingles(target)
            if wanted:
                matches = [c for c in self.chunks if len(wanted & _shingles(c["text"])) / len(wanted) >= SHINGLE_OVERLAP]
        if not matches:
            return "UNKNOWN", []
        best = min(matches, key=lambda c: _RANK.index(c["trust"]))
        return best["trust"], [c["source"] for c in matches if c["source"]]
