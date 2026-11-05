"""Build the app's content.json from a candidate workspace plus an optional content pack.

usage: python build_data.py            (reads app_config.json next to this file)
"""
import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
EV_EN = {"代码实证": "Code-verified", "本地实证": "Verified locally", "论文": "Paper", "建议口径": "Suggested framing"}


def load_config() -> dict:
    return json.loads((APP / "app_config.json").read_text(encoding="utf-8"))


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


# ---------- question banks (pack questions.md, workspace qa_projects.md) ----------
TAG_RULES = [("RAG", r"RAG|检索|切块|BM25|重排|嵌入|Embedding"), ("记忆", r"记忆|memory"),
             ("上下文", r"上下文|context|缓存|cache"), ("工具/MCP", r"工具|MCP|A2A|function|tool"),
             ("多Agent", r"多 ?Agent|Supervisor|编排|拓扑|Sequential|Concurrent|Hybrid|并行"),
             ("LangGraph", r"LangGraph|StateGraph|Reducer|Send|子图|Checkpointer|interrupt|stream|Command"),
             ("LangChain", r"LangChain|structured_output|create_agent"), ("评测", r"评测|评委|pass|基准|胜率|judge"),
             ("安全", r"注入|安全|沙箱|护栏|审计|外泄"), ("性能成本", r"延迟|成本|token|并发|路由"),
             ("训练", r"SFT|RLHF|DPO|GRPO|PPO|微调|Reward|RL"), ("系统设计", r"设计一个")]


def tags_for(section: str, title: str, extra: list) -> list:
    s = f"{section} {title}"
    return [t for t, pat in TAG_RULES + extra if re.search(pat, s, re.I)]


def parse_bank(path: Path, bank: str, extra_tags: list) -> list:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    items, section = [], ""
    for chunk in re.split(r"(?m)^(?=## |### )", text):
        if chunk.startswith("## "):
            section = chunk.splitlines()[0][3:].strip()
            continue
        if not chunk.startswith("### "):
            continue
        lines = chunk.rstrip().splitlines()
        head = lines[0][4:].strip()
        m = re.match(r"([A-Z]{1,2}\+?\d*)\.\s*(.*)", head)          # A1, K+5, PA3
        if not m:
            continue
        qid, title = m.group(1), m.group(2)
        body = lines[1:]
        q_en = next((l.split(":**", 1)[1].strip() for l in body if l.startswith("**Q:**")), "")
        zh_start = next((i for i, l in enumerate(body) if l.startswith("**答")), None)
        en_start = next((i for i, l in enumerate(body) if re.match(r"\*\*A[ :(]", l)), None)
        if zh_start is None and en_start is None:
            continue
        zh = body[zh_start:en_start] if zh_start is not None else []
        en = body[en_start:] if en_start is not None else []
        if zh:
            zh[0] = re.sub(r"^\*\*答[^*]*\*\*\s*", "", zh[0])
        if en:
            en[0] = re.sub(r"^\*\*A[^*]*\*\*\s*", "", en[0])
        zh_text, en_text = "\n".join(zh).strip(), "\n".join(en).strip()
        items.append({"id": f"{bank}-{qid}", "code": qid, "bank": bank, "kind": "qa", "section": section,
                      "title": title, "title_en": q_en or title, "zh": zh_text or en_text, "en": en_text or zh_text,
                      "tags": tags_for(section, title, extra_tags)})
    return items


# ---------- scripts.md: "## id | 中文标题 | English title" / "### 中文" / "### English" / "### 待确认" / "#### section" ----------
def parse_scripts(path: Path) -> list:
    if not path.exists():
        return []
    units = []
    for chunk in re.split(r"(?m)^## ", path.read_text(encoding="utf-8"))[1:]:
        head, _, body = chunk.partition("\n")
        parts = [x.strip() for x in head.split("|")]
        if len(parts) != 3:
            print(f"warning: bad script heading: {head!r}")
            continue
        unit = {"id": parts[0], "title": parts[1], "title_en": parts[2]}
        for lang, marker in (("zh", "中文"), ("en", "English")):
            m = re.search(rf"(?ms)^### {marker}\s*$(.*?)(?=^### |\Z)", body)
            text = m.group(1).strip() if m else ""
            unit[lang] = [{"h": h.strip(), "md": md.strip()} for h, _, md in
                          (sec.partition("\n") for sec in re.split(r"(?m)^#### ", text)[1:])]
        m = re.search(r"(?ms)^### (?:待确认|To confirm)\s*$(.*?)(?=^### |\Z)", body)
        unit["confirm"] = [x.strip()[2:] for x in m.group(1).strip().splitlines() if x.strip().startswith("- ")] if m else []
        if not unit["zh"]:                      # English-only workspace: the app's base language falls back to English
            unit["zh"] = unit["en"]
        units.append(unit)
    return units


def normalize_project(p: dict) -> dict:
    """Workspace cards use findings*; the app reads course*. English fields fall back to the base ones."""
    p = dict(p)
    for a, b in (("findings", "course"), ("findings_en", "course_en"), ("findings_title", "course_title"), ("findings_title_en", "course_title_en")):
        if a in p:
            p[b] = p.pop(a)
    p.setdefault("course", [])
    p.setdefault("risks", [])
    p.setdefault("numbers", [])
    p.setdefault("stack", [])
    p.setdefault("diagrams", [])
    p.setdefault("codes", [])
    p.setdefault("repo", "")
    p.setdefault("mindmap", f"p-{p['id']}")
    p.setdefault("evidence", "建议口径")
    p.setdefault("script", "")
    p.setdefault("script_en", "")
    return p


def main():
    cfg = load_config()
    ws = Path(cfg["workspace"])
    pack = Path(cfg["pack_dir"]) if cfg.get("pack_dir") else None
    coach = read_json(ws / "coach.json", {})
    projects = [normalize_project(p) for p in read_json(ws / "projects.json", [])]

    # questions: the pack's general bank + the candidate's project follow-ups. Project questions are linked to their
    # project by code prefix (PA1 -> the project declaring "PA") and tagged with that project's short name.
    questions = []
    if pack:
        questions += parse_bank(pack / "questions.md", "general", [])
    by_code = {c: p for p in projects for c in p.get("codes", [])}
    for q in parse_bank(ws / "qa_projects.md", "project", []):
        owner = by_code.get(re.match(r"[A-Z]+", q["code"]).group(0))
        if owner:
            q["tags"].append(re.split(r" [(·—/（]", owner["name"])[0].strip())
        questions.append(q)

    knowledge = read_json(pack / "knowledge.json", []) if pack else []
    topic_maps = read_json(pack / "mindmaps.json", []) if pack else []
    pack_extras = read_json(pack / "extras.json", []) if pack else []
    pack_meta = read_json(pack / "pack.json", {}) if pack else {}
    ws_extras = read_json(ws / "extras.json", [])
    by_id = {x["id"]: x for x in pack_extras}
    for x in ws_extras:                          # candidate pages replace pack pages with the same id
        by_id[x["id"]] = x
    extras = list(by_id.values())

    files_dir = ws / "files"
    files = [{"name": f.name, "size": f.stat().st_size, "desc": ""} for f in sorted(files_dir.iterdir()) if f.is_file()] if files_dir.exists() else []
    for f in coach.get("files", []):
        for x in files:
            if x["name"] == f.get("name"):
                x["desc"] = f.get("desc", "")

    out = {
        "meta": {"title": coach.get("title") or cfg.get("title") or "Interview Coach", "candidate": coach.get("candidate", ""),
                 "langs": coach.get("langs", ["zh", "en"]), "lead": coach.get("lead_projects", [p["id"] for p in projects[:2]]),
                 "focus_tags": coach.get("focus_tags", []), "links": pack_meta.get("links", []), "pack": coach.get("pack", "none")},
        "questions": questions,
        "notes": [],
        "script": [],
        "revised": parse_scripts(ws / "scripts.md"),
        "knowledge": knowledge,
        "mindmaps": topic_maps + read_json(ws / "mindmaps.json", []),
        "projects": projects,
        "extras": extras,
        "files": files,
    }
    (APP / "data").mkdir(exist_ok=True)
    (APP / "data" / "content.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"questions {len(questions)} ({len([q for q in questions if q['bank'] == 'general'])} general, "
          f"{len([q for q in questions if q['bank'] == 'project'])} project) | scripts {len(out['revised'])} | knowledge {len(knowledge)} | "
          f"mind maps {len(out['mindmaps'])} | projects {len(projects)} | extras {len(extras)} | files {len(files)}")


if __name__ == "__main__":
    sys.exit(main())
