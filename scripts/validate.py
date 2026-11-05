"""Validate a workspace before building the app: config, scripts.md structure, cards, mind maps, Q&A codes, extras.

usage: python validate.py <workspace>
Exit code 1 on errors (warnings don't fail).
"""
import re
import sys
from pathlib import Path

from common import SKILL, expected_heads, load_json, parse_scripts, sections

EVIDENCE = {"代码实证", "本地实证", "论文", "建议口径"}
KINDS = {"md", "list", "cards", "checklist", "table"}


def main():
    ws = Path(sys.argv[1])
    errors, warnings = [], []
    err, warn = errors.append, warnings.append

    coach = load_json(ws / "coach.json")
    if coach is None:
        err("coach.json is missing")
        coach = {}
    langs = coach.get("langs", ["zh", "en"])
    pack = coach.get("pack", "none")
    if pack != "none" and not (SKILL / "assets" / "packs" / pack).exists():
        err(f"coach.json pack '{pack}' not found under assets/packs/")
    if coach.get("env_file") and not Path(coach["env_file"]).exists():
        warn(f"env_file {coach['env_file']} does not exist: the app will run without AI features")

    # scripts.md
    units = parse_scripts(ws / "scripts.md")
    ids = [u["id"] for u in units]
    if not units:
        err("scripts.md has no units")
    if units and "intro" not in ids:
        warn("scripts.md has no 'intro' unit (self-introduction)")
    if len(ids) != len(set(ids)):
        err(f"duplicate unit ids in scripts.md: {sorted({i for i in ids if ids.count(i) > 1})}")
    for u in units:
        for lang in ("zh", "en"):
            body = u.get(lang, "")
            if lang in langs and not body:
                err(f"scripts.md {u['id']}: missing the {'中文' if lang == 'zh' else 'English'} block")
                continue
            if not body:
                continue
            heads = [h for h, _ in sections(body)]
            if heads != expected_heads(u["id"], lang):
                err(f"scripts.md {u['id']} [{lang}]: headings {heads} differ from the template")
            if re.search(r"(?m)^#{1,3} ", body):
                err(f"scripts.md {u['id']} [{lang}]: contains a #, ## or ### line inside the sections")
            empty = [h for h, t in sections(body) if not t.strip()]
            if empty:
                warn(f"scripts.md {u['id']} [{lang}]: empty sections {empty}")

    # projects.json
    projects = load_json(ws / "projects.json", [])
    pids = [p.get("id") for p in projects]
    codes = {}
    maps = load_json(ws / "mindmaps.json", [])
    map_ids = {m.get("id") for m in maps}
    for p in projects:
        pid = p.get("id", "?")
        for f in ("id", "name", "org", "evidence", "one_liner"):
            if not p.get(f):
                err(f"projects.json {pid}: missing '{f}'")
        if p.get("evidence") and p["evidence"] not in EVIDENCE:
            err(f"projects.json {pid}: evidence '{p['evidence']}' must be one of {sorted(EVIDENCE)}")
        for c in p.get("codes", []):
            if not re.fullmatch(r"[A-Z]{1,2}", c):
                err(f"projects.json {pid}: code '{c}' must be 1–2 uppercase letters")
            if c in codes:
                err(f"projects.json: code '{c}' used by both {codes[c]} and {pid}")
            codes[c] = pid
        if p.get("mindmap") and p["mindmap"] not in map_ids:
            warn(f"projects.json {pid}: mind map '{p['mindmap']}' not in mindmaps.json")
        for n in p.get("numbers", []):
            if not (n.get("v") and n.get("k")):
                err(f"projects.json {pid}: every number needs 'v' and 'k'")
        if "en" in langs:
            for base in ("stack", "findings", "risks"):
                if p.get(base) and p.get(base + "_en") is not None and len(p[base]) != len(p[base + "_en"]):
                    err(f"projects.json {pid}: '{base}' and '{base}_en' have different lengths")
        for d in p.get("diagrams", []):
            if not (ws / "diagrams" / d.get("file", "")).exists():
                err(f"projects.json {pid}: diagram file diagrams/{d.get('file')} not found")
        if pid not in ids:
            warn(f"projects.json {pid}: no unit with this id in scripts.md")

    # mindmaps.json
    def walk(node, mid, depth=0):
        if "t" not in node or not isinstance(node.get("c", []), list):
            err(f"mindmaps.json {mid}: every node needs 't' and a 'c' list")
            return
        if "en" in langs and len(langs) > 1 and "t_en" not in node:
            warn(f"mindmaps.json {mid}: node '{node['t']}' has no t_en")
        for k in node.get("c", []):
            walk(k, mid, depth + 1)
    for m in maps:
        if not m.get("id") or "root" not in m:
            err("mindmaps.json: each map needs 'id' and 'root'")
            continue
        walk(m["root"], m["id"])

    # qa_projects.md
    qa = (ws / "qa_projects.md").read_text(encoding="utf-8") if (ws / "qa_projects.md").exists() else ""
    qcodes = re.findall(r"(?m)^### ([A-Z]{1,2})(\d+)\.", qa)
    seen = set()
    for pre, num in qcodes:
        code = pre + num
        if code in seen:
            err(f"qa_projects.md: duplicate code {code}")
        seen.add(code)
        if pre not in codes and pre != "X":                  # X is reserved for cross-project / behavioural questions
            err(f"qa_projects.md: code {code} has prefix '{pre}', which no project in projects.json declares")
    for block in re.split(r"(?m)^(?=### )", qa)[1:]:
        if not re.match(r"### [A-Z]{1,2}\d+\.", block):
            warn(f"qa_projects.md: '{block.splitlines()[0][:40]}' has no question code, so the app ignores it")
        elif not re.search(r"(?m)^\*\*(答|A)[：: (]", block):
            err(f"qa_projects.md: '{block.splitlines()[0][:40]}' has no **答：** or **A:** answer")

    # extras.json
    for x in load_json(ws / "extras.json", []):
        if x.get("kind") not in KINDS:
            err(f"extras.json {x.get('id')}: kind must be one of {sorted(KINDS)}")

    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"{len(units)} script units, {len(projects)} projects, {len(maps)} mind maps, {len(qcodes)} follow-up questions — "
          f"{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
