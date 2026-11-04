from dataclasses import dataclass, field
from pathlib import Path

import yaml
from pydantic import ConfigDict, ValidationError, create_model

from atlas.sanitize import check_email, check_path, check_sql, check_url, system_resolver

ALLOW, DENY, APPROVE = "ALLOW", "DENY", "REQUIRE_APPROVAL"
_TYPES = {"string": str, "strings": str | list[str], "integer": int}


@dataclass
class Decision:
    verdict: str
    reasons: list = field(default_factory=list)
    rules: list = field(default_factory=list)


class Policy:
    def __init__(self, data):
        self.data = data
        self.tools = data.get("tools", {})
        self.schemas = {
            name: create_model(
                f"{name}_args",
                __config__=ConfigDict(extra="forbid", strict=True),
                **{arg: (_TYPES[kind], ...) for arg, kind in tool.get("args", {}).items()},
            )
            for name, tool in self.tools.items()
        }

    @classmethod
    def load(cls, path):
        return cls(yaml.safe_load(Path(path).read_text(encoding="utf-8")))

    @property
    def markdown_hosts(self):
        return self.data.get("markdown", {}).get("hosts_allow", [])

    @property
    def max_tool_calls(self):
        return self.data.get("rate_limits", {}).get("tool_calls_per_session", 50)

    @property
    def resolve_dns(self):
        return self.data.get("resolve_dns", False)

    def output_trust(self, tool):
        return self.tools.get(tool, {}).get("output_trust", "T3")

    def is_egress(self, tool):
        return self.tools.get(tool, {}).get("tier") in ("external_egress", "destructive")

    def check_schema(self, tool, args):
        if tool not in self.schemas:
            return [f"schema: unknown tool {tool}"]
        try:
            self.schemas[tool].model_validate(args)
        except ValidationError as e:
            return [f"schema: {err['loc'][0] if err['loc'] else tool}: {err['msg']}" for err in e.errors()]
        return []

    def check_structure(self, tool, args):
        rules = self.tools.get(tool, {})
        kind = rules.get("kind")
        arg = rules.get("target_arg")
        value = args.get(arg) if arg else None
        if kind == "sql":
            return check_sql(value, rules)
        if kind == "url":
            return check_url(value, rules, system_resolver if self.resolve_dns else None)
        if kind == "email":
            return check_email(value, rules)
        if kind == "path":
            return check_path(value, rules)
        return []

    def destination_authorized(self, tool, args, provenance):
        """True when every destination came from the user or operator, so a document can only have shaped the content."""
        required = self.tools.get(tool, {}).get("arg_origin_required", {})
        if not required:
            return False
        for arg in required:
            values = args.get(arg, [])
            values = values if isinstance(values, list) else [values]
            if not values or any(provenance.origin(v)[0] not in ("T0", "T1") for v in values):
                return False
        return True

    def check_origin(self, tool, args, provenance):
        rules = self.tools.get(tool, {})
        problems = []
        for arg, allowed in rules.get("arg_origin_required", {}).items():
            values = args.get(arg, [])
            for value in values if isinstance(values, list) else [values]:
                origin, sources = provenance.origin(value)
                if origin not in allowed:
                    where = f" (seen in {', '.join(sources)})" if sources else ""
                    problems.append(f"origin: {arg}={value} came from {origin}{where}")
        if provenance.tainted and rules.get("when_session_tainted") == "deny":
            problems.append(f"taint: {tool} is not allowed once untrusted content was read")
        return problems
