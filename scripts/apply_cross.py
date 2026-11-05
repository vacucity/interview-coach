"""Apply cross-check fixes (cross_issues.json) to scripts.md, each scoped to its own unit.

usage: python apply_cross.py <workspace> [--skip 3,7] [--list]
  --list   print the issues with their numbers and whether each quote is found, without changing anything
A fix is applied only when its quote occurs exactly once inside its unit.
"""
import argparse
import json
from pathlib import Path

from common import parse_scripts, write_scripts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workspace")
    ap.add_argument("--skip", default="")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    ws = Path(a.workspace)
    issues = json.loads((ws / "cross_issues.json").read_text(encoding="utf-8")).get("issues", [])
    skip = {int(x) for x in a.skip.split(",") if x.strip()}
    units = parse_scripts(ws / "scripts.md")
    by_id = {u["id"]: u for u in units}

    def locate(it):
        u = by_id.get(it["unit"])
        if not u:
            return None, 0
        lang = "en" if it.get("lang", "").lower().startswith("en") else "zh"
        n = u.get(lang, "").count(it["quote"])
        if n == 0:                                          # the checker may mislabel the language
            other = "zh" if lang == "en" else "en"
            if u.get(other, "").count(it["quote"]) == 1:
                return (u, other), 1
        return (u, lang), n

    applied = 0
    for k, it in enumerate(issues):
        loc, n = locate(it)
        if a.list:
            print(f"[{k}] {it['unit']}/{it.get('lang')} found={n} :: {it['problem'][:150]}\n    Q: {it['quote'][:150]}\n    R: {it['replacement'][:150]}")
            continue
        if k in skip:
            continue
        if not loc or n != 1:
            print(f"   [{k}] {it['unit']}: quote found {n}x, not applied")
            continue
        u, lang = loc
        u[lang] = u[lang].replace(it["quote"], it["replacement"])
        applied += 1
    if not a.list:
        write_scripts(ws / "scripts.md", units)
        print(f"applied {applied} of {len(issues)} (skipped {len(skip)})")


if __name__ == "__main__":
    main()
