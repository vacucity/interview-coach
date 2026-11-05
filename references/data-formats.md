# Workspace and data formats

Everything for one candidate lives in one workspace folder (default: `interview-prep/` in the current directory). The pipeline writes these files. The app builder (`scripts/build_app.py`) reads them, so keep the formats exact.

```
<workspace>/
  coach.json          config: name, languages, pack, port, LLM key file, lead projects
  resume.txt          extracted résumé text (scripts/extract_resume.py)
  jd.txt              optional job description
  inventory.json      projects and facts pulled from the résumé, plus evidence links
  reviews/<id>.json   the phase-2 review of each unit (written in both modes)
  answers.md          the candidate's confirmed answers, appended round by round
  scripts.md          the interview scripts: one unit per project, plus "intro"
  projects.json       fact cards shown on the project pages
  mindmaps.json       one mind map per project
  qa_projects.md      follow-up Q&A per project (question-bank format)
  extras.json         candidate-specific prep pages (STAR stories, red lines, …)
  resume_fixes.md     résumé lines to change, with the corrected wording
  files/              optional originals to show in the app (PDFs, docs)
  diagrams/           optional SVG architecture diagrams referenced by projects.json
  app/                the built practice app (scripts/build_app.py)
```

Contents:

1. [coach.json](#coachjson)
2. [inventory.json](#inventoryjson)
3. [scripts.md](#scriptsmd)
4. [projects.json](#projectsjson)
5. [mindmaps.json](#mindmapsjson)
6. [qa_projects.md](#qa_projectsmd)
7. [extras.json](#extrasjson)
8. [answers.md and resume_fixes.md](#answersmd-and-resume_fixesmd)

## coach.json

```json
{
  "candidate": "Jane Doe",
  "title": "Agent 面试训练营",
  "langs": ["zh", "en"],
  "pack": "agent-engineer",
  "port": 48200,
  "env_file": "C:/path/to/.env",
  "lead_projects": ["proj-a", "proj-b"],
  "mode": "full",
  "target_role": "AI Agent Engineer"
}
```

- `langs`: `["zh"]`, `["en"]` or both. The first language is the default view in the app.
- `pack`: the name of a folder under `assets/packs/`. It supplies the knowledge base, the general question bank, the topic mind maps and generic prep pages. Use `"none"` for roles without a pack; the app then shows only the candidate's own content.
- `env_file`: a dotenv file with `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL_ID` (any OpenAI-compatible endpoint). If it's missing, the app runs without AI features. The key is read only by the local server and never reaches the browser.
- `lead_projects`: the project ids shown as quick-start buttons on the dashboard (the 1–2 projects to lead with for this target role).

## inventory.json

```json
{
  "candidate": { "name": "", "education": [""], "headline": "" },
  "projects": [
    {
      "id": "proj-a",
      "title": "Project title as on the résumé",
      "org": "Company / lab / hackathon",
      "kind": "work | internship | research | project | hackathon",
      "role": "Title on the résumé",
      "dates": "Jun 2025 – Sep 2026",
      "bullets": ["résumé bullet, verbatim"],
      "claims": ["every checkable claim: numbers, frameworks, scale, ownership"],
      "tech": ["LangGraph", "FastAPI"],
      "evidence": {
        "level": "code | local | paper | none",
        "sources": [{ "type": "github | local | paper | doc", "path": "url or absolute path", "note": "" }]   // "doc" = existing scripts or talking points; don't list the résumé itself
      },
      "relevance": 0
    }
  ]
}
```

- `id`: lowercase, hyphenated, stable. It becomes the URL and the key in every other file.
- `relevance`: 0–3, how well the project fits the target role. It drives `lead_projects` and the script order.
- Evidence levels map to the badge text shown in the app:

  | Level | Chinese badge | English badge |
  |---|---|---|
  | `code` | 代码实证 | Code-verified |
  | `local` | 本地实证 | Verified locally |
  | `paper` | 论文 | Paper |
  | `none` | 建议口径 | Suggested framing |

## scripts.md

One unit per project plus a unit with the id `intro` (the self-introduction). The headings are machine-parsed: keep them exact.

```markdown
# 面试讲稿 / Interview scripts

## intro | 自我介绍 | Self-introduction

### 中文

#### 30 秒版本
…

### English

#### 30-second version
…

### 待确认

- an open question for the candidate (in the candidate's language)

## proj-a | 项目一：Title | Project 1 — Title

### 中文

#### 定位
…(the 11 project sections from references/script-template.md)

### English

#### Positioning
…

### 待确认

- …
```

- Include only the languages listed in `coach.json`. With a single language, omit the other `###` block.
- The `####` headings and their order come from `references/script-template.md`. Don't put `#`, `##` or `###` lines inside a section, because they break the parser.
- `### 待确认` (or `### To confirm` in an English-only workspace) is optional. Write it in the candidate's main language.

## projects.json

A JSON array with one fact card per project, in display order. English fields sit next to the Chinese ones; omit `*_en` when the workspace is Chinese-only, or fill only `*_en` and repeat the text in the base field when it is English-only.

```json
[
  {
    "id": "proj-a",
    "name": "Project name", "name_en": "Project name",
    "org": "Org · role", "org_en": "Org · role",
    "evidence": "代码实证",
    "repo": "https://github.com/…",
    "mindmap": "p-proj-a",
    "codes": ["PA"],
    "one_liner": "One sentence: what it is and why it matters.", "one_liner_en": "…",
    "stack": ["LangGraph", "FastAPI"], "stack_en": ["LangGraph", "FastAPI"],
    "numbers": [{ "v": "588s → 103s", "k": "what it measures and how", "v_en": "588s → 103s", "k_en": "…" }],
    "findings_title": "核实结论", "findings_title_en": "Verified findings",
    "findings": ["verified fact, with source"], "findings_en": ["…"],
    "risks": ["résumé-vs-fact gap or claim an interviewer could catch, with the safe wording"], "risks_en": ["…"],
    "diagrams": [{ "title": "Architecture", "title_en": "Architecture", "file": "proj-a.svg" }]
  }
]
```

- `evidence` holds the Chinese badge text from the table above (代码实证 / 本地实证 / 论文 / 建议口径).
- `codes`: the question-code prefix used for this project in `qa_projects.md`, 1–2 uppercase letters, unique across projects. A code is the prefix plus a number, e.g. `PA1`.
- `numbers[].k` always says how the number was measured, and whether it came from production, an offline test or the candidate's own experiment.
- `diagrams[].file` refers to an SVG in `<workspace>/diagrams/`. Nodes in the SVG may call `sendPrompt('question')` on click; the app answers with the project facts as context.

## mindmaps.json

```json
[
  { "id": "p-proj-a", "title": "Project name", "title_en": "Project name", "group": "项目",
    "root": { "t": "Root", "t_en": "Root", "c": [ { "t": "Branch", "t_en": "Branch", "c": [ { "t": "Leaf", "t_en": "Leaf", "c": [] } ] } ] } }
]
```

- `group` stays `"项目"` for candidate maps; the pack supplies the topic maps.
- Use 4–6 branches with 2–5 short leaves each.

## qa_projects.md

This is the question-bank format, shared with the pack's general bank. `##` lines are section titles. Each `###` block is one question.

```markdown
## 一、Project A 追问 / Project A follow-up questions

### PA1. 中文问题？
**Q:** English question?

**答：** 中文回答（口语，2–5 句；可以有列表、表格、代码）。

**追问提示：** 可选。

**A:** English answer.

**Follow-up tip:** optional.
```

- The code is the project's prefix from `projects.json` plus a number, and is unique.
- The prefix `X` is reserved for cross-project and behavioural questions ("compare your two projects", "what would you redo"); put them in their own `##` section.
- With a single language, write the `### PA1.` heading in that language and fill both answers in it (keep both labels).
- Section titles are shown up to the first " / ", so in an English-only workspace put the English title first.
- Mark facts the candidate must fill in as `【待补：…】` / `[TBC: …]`.

## extras.json

Candidate-specific prep pages. The app shows them after the pack's generic pages; an entry with the same `id` as a pack page replaces it.

```json
[
  { "id": "star", "title": "STAR 故事库", "title_en": "STAR stories", "kind": "cards",
    "items": [ { "t": "Story title", "t_en": "…", "b": "**S** … **T** … **A** … **R** …", "b_en": "…" } ] },
  { "id": "redlines", "title": "红线：不要这样说", "title_en": "Red lines", "kind": "list",
    "items": ["❌ … → ✅ …"], "items_en": ["❌ … → ✅ …"] },
  { "id": "english", "title": "英文面试常用表达", "title_en": "English phrases", "kind": "cards",
    "items": [ { "t": "开场", "t_en": "Opening", "b": "I'm …" } ] },
  { "id": "whiteboard", "title": "白板画图练习", "title_en": "Whiteboard drills", "kind": "list", "items": ["…"], "items_en": ["…"] }
]
```

`kind` takes one of these values:

- `md`: one Markdown text, in `md` / `md_en`.
- `list`: `items` / `items_en`.
- `cards`: `items` of `{t, b}` objects.
- `checklist`: `groups` of `{t, items}`, with `t_en` and `items_en` for English.
- `table`: `rows` of `[term, 中文, 说明, description_en]`.

## answers.md and resume_fixes.md

`answers.md` is plain Markdown. Group the answers by "Cross-cutting" and then by project id, and write each answer as the candidate gave it, in their words. Every writer and checker reads it, and it overrides earlier assumptions.

`resume_fixes.md` has one row per résumé line that should change:

```markdown
| Project | Résumé says | Problem | Suggested wording |
|---|---|---|---|
```
