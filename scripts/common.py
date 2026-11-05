"""Shared helpers: parse and write scripts.md, count spoken lengths, expected headings."""
import json
import re
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]

PROJECT_ZH = ["定位", "30 秒版本", "1 分钟讲述", "展开讲（2–3 分钟）", "架构与各环节", "关键设计与取舍", "难点与踩坑", "结果与口径", "局限与改进", "高频追问", "不要这样说"]
PROJECT_EN = ["Positioning", "30-second version", "1-minute walkthrough", "Going deeper (2–3 minutes)", "Architecture and stages",
              "Key design decisions and trade-offs", "Challenges and fixes", "Results and how they were measured",
              "Limitations and what I'd change", "Likely follow-ups", "Don't say this"]
INTRO_ZH = ["30 秒版本", "1 分钟版本", "按岗位侧重换一句", "讲的时候注意"]
INTRO_EN = ["30-second version", "1-minute version", "Swap one line for the role", "Delivery notes"]
BUDGETS = {"zh": {"30": (100, 130), "60": (230, 280)}, "en": {"30": (65, 85), "60": (140, 170)}}
TOLERANCE = {"zh": 5, "en": 4}          # counting methods differ slightly; flag only clear overruns


def expected_heads(unit_id: str, lang: str) -> list:
    if unit_id == "intro":
        return INTRO_ZH if lang == "zh" else INTRO_EN
    return PROJECT_ZH if lang == "zh" else PROJECT_EN


def load_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def parse_scripts(path: Path) -> list:
    """[{id, title, title_en, zh: body text, en: body text, confirm: [str]}] — bodies keep their #### sections."""
    if not path.exists():
        return []
    units = []
    for chunk in re.split(r"(?m)^## ", path.read_text(encoding="utf-8"))[1:]:
        head, _, body = chunk.partition("\n")
        parts = [x.strip() for x in head.split("|")]
        if len(parts) != 3:
            continue
        u = {"id": parts[0], "title": parts[1], "title_en": parts[2]}
        for lang, marker in (("zh", "中文"), ("en", "English")):
            m = re.search(rf"(?ms)^### {marker}\s*$(.*?)(?=^### |\Z)", body)
            u[lang] = m.group(1).strip() if m else ""
        m = re.search(r"(?ms)^### (?:待确认|To confirm)\s*$(.*?)(?=^### |\Z)", body)
        u["confirm"] = [x.strip()[2:] for x in m.group(1).strip().splitlines() if x.strip().startswith("- ")] if m else []
        units.append(u)
    return units


def write_scripts(path: Path, units: list, title: str = "面试讲稿 / Interview scripts") -> None:
    out = [f"# {title}", ""]
    for u in units:
        out += [f"## {u['id']} | {u['title']} | {u['title_en']}", ""]
        if u.get("zh", "").strip():
            out += ["### 中文", "", u["zh"].strip(), ""]
        if u.get("en", "").strip():
            out += ["### English", "", u["en"].strip(), ""]
        if u.get("confirm"):
            out += ["### 待确认", ""] + [f"- {q.strip()}" for q in u["confirm"]] + [""]
    path.write_text("\n".join(out), encoding="utf-8")


def sections(body: str) -> list:
    """[(heading, text)] for the #### sections of one language body."""
    return [(h.strip(), t.strip()) for h, _, t in (s.partition("\n") for s in re.split(r"(?m)^#### ", body)[1:])]


def han_count(text: str) -> int:
    text = re.sub(r"【[^】]*】", "", text)
    text = re.sub(r"(?m)^\s*\*[^*\n].*\*\s*$", "", text)       # italic length notes
    return sum(0x4E00 <= ord(c) <= 0x9FFF for c in text)


def word_count(text: str) -> int:
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r"(?m)^\s*\*[^*\n].*\*\s*$", "", text)
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’%.,–-]*", text))


def spoken_lengths(unit: dict) -> dict:
    """{'zh': {'30': n, '60': n}, 'en': {...}} for the 30-second and 1-minute sections."""
    out = {}
    for lang in ("zh", "en"):
        secs = sections(unit.get(lang, ""))
        if not secs:
            continue
        counter = han_count if lang == "zh" else word_count
        d = {}
        for h, t in secs:
            if h.startswith("30"):
                d["30"] = counter(t)
            elif h.startswith("1 分钟") or h.startswith("1-minute"):
                d["60"] = counter(t)
        out[lang] = d
    return out
