import re
import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser

from atlas.decode import decodings, tokens

MAX_CHARS = 200_000
MAX_DECODE_DEPTH = 3
REMOVED = "[REMOVED: suspected instruction]"

_INVISIBLE = {"Cf"}
_CONFUSABLES = str.maketrans("аеорсухіјѕԁԛԝАЕОРСХНКМТВ", "aeopcyxijsdqwAEOPCXHKMTB")
_HIDDEN_STYLE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0(?:[;\s]|$)", re.I)
_VOID = {"br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"}

# Deterministic rules aimed at text addressing an AI, not at harmful content in general.
# They only catch lazy attacks. Rephrasing passes, and enforcement lives in the outbound checks.
_AGENT_DIRECTED = [
    re.compile(p, re.I | re.S) for p in (
        r"(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)*(previous|prior|above|earlier|system)\b[^.\n]*[.\n]?",
        r"\b(assistant|ai agent|ai assistant|llm|chatbot)\s*[:,][^\n]*",
        r"</?(system|document|instructions?|data)\s*>",
        r"\b(new|updated)\s+(policy|instructions?)\s*:[^\n]*",
    )
]


@dataclass
class Normalized:
    text: str
    signals: list = field(default_factory=list)
    removed: list = field(default_factory=list)


class _Hidden(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.visible, self.hidden = [], []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag not in _VOID:
            self.stack.append(bool(_HIDDEN_STYLE.search(dict(attrs).get("style") or "")))

    def handle_endtag(self, tag):
        if tag not in _VOID and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        (self.hidden if any(self.stack) else self.visible).append(data)

    def handle_comment(self, data):
        self.hidden.append(data)


def _strip_hidden_html(text, result):
    if "<" not in text:
        return text
    parser = _Hidden()
    parser.feed(text)
    parser.close()
    found = [h.strip() for h in parser.hidden if h.strip()]
    if not found:
        return text
    result.signals.append("hidden_text")
    result.removed.extend(found)
    return "".join(parser.visible)


def _strip_invisible(text, result):
    kept = "".join(c for c in text if unicodedata.category(c) not in _INVISIBLE or c in "\n\t")
    if len(kept) != len(text):
        result.signals.append("invisible_characters")
    return kept


def _replace_encoded(text, result, depth=0):
    for token in set(tokens(text)):
        for decoded in decodings(token):
            printable = sum(c.isprintable() for c in decoded)
            if len(decoded) >= 12 and printable == len(decoded) and " " in decoded:
                result.signals.append("encoded_text")
                result.removed.append(decoded)
                text = text.replace(token, REMOVED)
                if depth < MAX_DECODE_DEPTH:
                    _replace_encoded(decoded, result, depth + 1)
                break
    return text


def _redact_agent_directed(text, result):
    for rule in _AGENT_DIRECTED:
        for match in rule.findall(text) and list(rule.finditer(text)):
            result.signals.append("agent_directed")
            result.removed.append(match.group(0).strip())
        text = rule.sub(REMOVED, text)
    return text


def normalize(raw):
    result = Normalized("")
    if len(raw) > MAX_CHARS:
        result.signals.append("truncated")
        raw = raw[:MAX_CHARS]
    text = _strip_invisible(unicodedata.normalize("NFKC", raw), result)
    folded = text.translate(_CONFUSABLES)
    if folded != text:
        result.signals.append("homoglyphs")
    text = _strip_hidden_html(folded, result)
    text = _replace_encoded(text, result)
    result.text = _redact_agent_directed(text, result)
    result.signals = sorted(set(result.signals))
    return result
