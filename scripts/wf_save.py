"""Save a finished interview-coach workflow's result into the workspace.

usage: python wf_save.py <workflow output file> <workspace>

The output file is the task output path from the workflow's completion notice (or a copy of it).
The result's "kind" decides what is written:
  review  -> reviews/<unit>.json
  write   -> scripts.md (units in order; existing units not in the result are kept), cross_issues.json, card_corrections.json
  extras  -> projects.json, mindmaps.json, qa_projects.md, extras.json, resume_fixes.md
  apply   -> updated units in scripts.md, projects.json, mindmaps.json, qa_projects.md, cross_issues.json
"""
import json
import re
import sys
from pathlib import Path

from common import expected_heads, parse_scripts, sections, write_scripts


def load_result(path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw.get("result", raw)


def heads_ok(uid: str, lang: str, body: str) -> bool:
    return not body.strip() or [h for h, _ in sections(body)] == expected_heads(uid, lang)


def save_units(ws: Path, new_units: list, order: list = None):
    path = ws / "scripts.md"
    existing = {u["id"]: u for u in parse_scripts(path)}
    for n in new_units:
        uid = n["id"]
        old = existing.get(uid, {"id": uid, "title": n.get("title", uid), "title_en": n.get("title_en", uid)})
        for lang in ("zh", "en"):
            body = (n.get(lang) or "").strip()
            body = re.sub(r"(?m)^#{1,3} .*$\n?", "", body)          # bodies may not carry ##/### lines
            if body and not heads_ok(uid, lang, body):
                print(f"!! {uid} [{lang}]: headings differ from the template; saved anyway, fix before building")
            if body or lang not in old:
                old[lang] = body
        old["title"] = n.get("title") or old.get("title", uid)
        old["title_en"] = n.get("title_en") or old.get("title_en", uid)
        if "to_confirm" in n:
            old["confirm"] = n["to_confirm"]
        existing[uid] = old
    ids = list(existing)
    if order:
        ids = [i for i in order if i in existing] + [i for i in ids if i not in order]
    if "intro" in ids:
        ids.remove("intro")
        ids.insert(0, "intro")
    write_scripts(path, [existing[i] for i in ids])
    print(f"scripts.md: {len(new_units)} unit(s) written, {len(ids)} total")


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    res = load_result(Path(sys.argv[1]))
    ws = Path(sys.argv[2])
    kind = res.get("kind")
    if res.get("missing"):
        print(f"note: not finished in this run: {res['missing']} — resume the workflow with resumeFromRunId to retry them")

    if kind == "review":
        (ws / "reviews").mkdir(exist_ok=True)
        for r in res["reviews"]:
            (ws / "reviews" / f"{r['unit']}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"reviews: {len(res['reviews'])} saved")

    elif kind == "write":
        save_units(ws, res["units"], res.get("order"))
        (ws / "cross_issues.json").write_text(json.dumps(res.get("cross", {}), ensure_ascii=False, indent=1), encoding="utf-8")
        cards = {u["id"]: u.get("card_corrections", []) for u in res["units"] if u.get("card_corrections")}
        (ws / "card_corrections.json").write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf-8")
        for u in res["units"]:
            print(f"  {u['id']:14s} stats {u.get('stats', {})}  open questions {len(u.get('to_confirm', []))}")
        print(f"cross_issues.json: {len(res.get('cross', {}).get('issues', []))} issue(s) — review them, then run apply_cross.py")

    elif kind == "extras":
        projects, maps, qa = [], [], []
        for p in res["projects"]:
            projects.append(json.loads(p["card_json"]))
            maps.append(json.loads(p["map_json"]))
            qa.append(p["qa_md"].strip())
        order = [u["id"] for u in parse_scripts(ws / "scripts.md") if u["id"] != "intro"]
        projects.sort(key=lambda p: order.index(p["id"]) if p["id"] in order else 99)
        (ws / "projects.json").write_text(json.dumps(projects, ensure_ascii=False, indent=1), encoding="utf-8")
        (ws / "mindmaps.json").write_text(json.dumps(maps, ensure_ascii=False, indent=1), encoding="utf-8")
        (ws / "qa_projects.md").write_text("# 项目追问 / Project follow-up questions\n\n" + "\n\n".join(qa) + "\n", encoding="utf-8")
        c = res.get("candidate") or {}
        if c:
            (ws / "extras.json").write_text(json.dumps(json.loads(c["extras_json"]), ensure_ascii=False, indent=1), encoding="utf-8")
            (ws / "resume_fixes.md").write_text(c["resume_fixes_md"].strip() + "\n", encoding="utf-8")
        print(f"projects.json {len(projects)}, mindmaps.json {len(maps)}, qa_projects.md {len(qa)} section(s), extras {'yes' if c else 'MISSING'}")

    elif kind == "apply":
        save_units(ws, res["units"])
        c = res.get("content") or {}
        if c:
            (ws / "projects.json").write_text(json.dumps(json.loads(c["projects_json"]), ensure_ascii=False, indent=1), encoding="utf-8")
            (ws / "mindmaps.json").write_text(json.dumps(json.loads(c["mindmaps_json"]), ensure_ascii=False, indent=1), encoding="utf-8")
            (ws / "qa_projects.md").write_text(c["qa_md"].strip() + "\n", encoding="utf-8")
        (ws / "cross_issues.json").write_text(json.dumps(res.get("cross", {}), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"applied to {len(res['units'])} unit(s); content {'updated' if c else 'NOT updated'}; "
              f"{len(res.get('cross', {}).get('issues', []))} cross-check issue(s)")
    else:
        raise SystemExit(f"unknown result kind: {kind!r}")


if __name__ == "__main__":
    main()
