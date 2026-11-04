"""Builds the public scoreboard strictly from saved reports. It never takes a number from anywhere else."""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
REPORTS = ROOT / "eval" / "reports"
NOTE = ("Attack success can read low for the wrong reason. A model too weak to use its tools can't be hijacked "
        "either, so read it next to normal tasks done.")


def build(reports=REPORTS):
    runs = []
    for path in sorted(Path(reports).glob("baseline-*.json")):
        r = json.loads(path.read_text(encoding="utf-8"))
        if r.get("complete"):
            runs.append({"model": r["model"], "config": "No firewall", "attack": r["attack"], "benign": r["benign"], "commit": r["commit"]})
    for path in sorted(Path(reports).glob("ablation-*.json")):
        r = json.loads(path.read_text(encoding="utf-8"))
        runs += [{"model": r["model"], "config": row["config"], "attack": row["attack"], "benign": row["benign"], "commit": r["commit"]} for row in r["rows"]]
    for run in runs:
        for key in ("attack", "benign"):
            if run[key]:
                run[key] = {k: run[key][k] for k in ("rate", "ci95", "n")}
    return {"runs": runs, "note": NOTE}


def main():
    data = json.dumps(build(), indent=1)
    (REPORTS / "scoreboard.json").write_text(data, encoding="utf-8")
    (ROOT / "web" / "public").mkdir(exist_ok=True)
    (ROOT / "web" / "public" / "scoreboard.json").write_text(data, encoding="utf-8")
    print(data[:400])


if __name__ == "__main__":
    main()
