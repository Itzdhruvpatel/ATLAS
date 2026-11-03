import ipaddress
import math
import re
import socket
from collections import Counter
from pathlib import PurePosixPath
from urllib.parse import urlsplit

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError, TokenError

_FORBIDDEN_NODES = (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Alter, exp.Command)
_MD_LINK = re.compile(r"(!?)\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)")


def check_sql(query, rules):
    try:
        statements = [s for s in sqlglot.parse(query, dialect="sqlite") if s is not None]
    except (ParseError, TokenError):
        return ["sql: could not be parsed"]
    if len(statements) != 1:
        return ["sql: must be exactly one statement"]
    tree = statements[0]
    if not isinstance(tree, (exp.Select, exp.Union)) or tree.find(*_FORBIDDEN_NODES):
        return ["sql: only SELECT is allowed"]

    problems = []
    allowed = {t.lower() for t in rules.get("tables_allow", [])}
    tables = {t.name.lower() for t in tree.find_all(exp.Table)}
    problems += [f"sql: table {t} is not allowed" for t in sorted(tables - allowed)]
    denied = {c.lower() for c in rules.get("columns_deny", [])}
    for column in tree.find_all(exp.Column):
        name = column.name.lower()
        if name in denied or any(f"{t}.{name}" in denied for t in tables):
            problems.append(f"sql: column {name} is not allowed")
    if denied and tree.find(exp.Star) and any(d.split(".")[0] in tables for d in denied):
        problems.append("sql: SELECT * would include a denied column")
    return problems


def _entropy(text):
    if not text:
        return 0.0
    counts = Counter(text)
    return -sum(n / len(text) * math.log2(n / len(text)) for n in counts.values())


def _bad_ip(host):
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return not ip.is_global


def host_allowed(host, allow):
    return any(host == h or host.endswith(f".{h}") for h in allow)


def check_url(url, rules, resolver=None):
    try:
        parts = urlsplit(str(url))
        host = (parts.hostname or "").lower()
    except ValueError:
        return ["url: could not be parsed"]
    problems = []
    if parts.scheme not in rules.get("schemes_allow", ["https"]):
        problems.append(f"url: scheme {parts.scheme or 'none'} is not allowed")
    if not host:
        return problems + ["url: no host"]
    if parts.username or parts.password:
        problems.append("url: credentials in URL are not allowed")
    if host == "localhost" or host.endswith(".localhost") or _bad_ip(host):
        problems.append("url: private or local address")
    allow = rules.get("hosts_allow")
    if allow is not None and not host_allowed(host, allow):
        problems.append(f"url: host {host} is not on the allowlist")
    query = f"{parts.query}{parts.path}"
    if len(query) > rules.get("max_query_len", 200):
        problems.append("url: path and query too long")
    if parts.query and _entropy(parts.query) > rules.get("max_query_entropy", 4.2):
        problems.append("url: query looks like encoded data")
    # ponytail: length and entropy heuristic, misses short chunks spread over many requests.
    if any(len(label) > 24 or (len(label) > 16 and _entropy(label) > 3.0) for label in host.split(".")):
        problems.append("url: hostname looks like encoded data")
    if resolver and not problems:
        # Resolving here and re-checking the address stops DNS names that point inside the network.
        try:
            addresses = resolver(host)
        except OSError:
            return ["url: host did not resolve"]
        if any(_bad_ip(a) for a in addresses):
            problems.append("url: resolves to a private address")
    return problems


def system_resolver(host):
    return [info[4][0] for info in socket.getaddrinfo(host, None)]


def check_email(to, rules):
    recipients = to if isinstance(to, list) else [to]
    problems = []
    allow = rules.get("recipient_domains_allow")
    for recipient in recipients:
        address = str(recipient).strip().lower()
        if address.count("@") != 1 or "." not in address.split("@")[1]:
            problems.append("email: malformed recipient")
        elif allow is not None and address.split("@")[1] not in allow:
            problems.append(f"email: domain of {address} is not allowed")
    return problems


def check_path(path, rules):
    root = PurePosixPath(rules.get("root", "/sandbox"))
    candidate = PurePosixPath(str(path).replace("\\", "/"))
    if ".." in candidate.parts or not candidate.is_relative_to(root):
        return [f"path: must stay inside {root}"]
    return []


def sanitize_markdown(text, hosts_allow):
    """Rewrites images and links that point outside the allowlist, which kills image exfiltration."""
    removed = []

    def replace(match):
        bang, label, url = match.groups()
        host = (urlsplit(url).hostname or "").lower()
        if host and host_allowed(host, hosts_allow):
            return match.group(0)
        removed.append(url)
        return label if not bang else "[image removed]"

    return _MD_LINK.sub(replace, text), removed
