# interview-coach

A [Claude Code](https://claude.com/claude-code) skill that turns anyone's résumé into an honest, interview-ready kit and a local AI practice app.

**中文简介：** 给任何人的简历做面试准备。它把每个简历项目对上证据（代码仓库、本地文件、论文），核实简历里的说法，只问候选人自己才知道的事；然后写出讲得出口的 30 秒 / 1 分钟 / 展开版讲稿（中文、英文或双语），并生成追问问答、思维导图、"不要这样说"红线和简历修改清单；最后搭一个本地练习 App：AI 评分的模拟面试、AI 项目深挖面试官、闪卡和 Pitch 计时。

## Why

A résumé bullet that reads well often falls apart under one follow-up question: "86 nodes", "real-time", "led a team", "reduced X by 35%". This skill checks each claim against the evidence before you have to defend it. It also writes scripts sized and phrased for speaking, not reading. A "1-minute" script that takes 90 seconds to say is a common failure, and the skill counts every script against its time budget.

It was developed on a real candidate's materials. Those reviews caught résumé claims the code contradicted, team projects with no stated personal role, and strong measured results missing from every script.

## What you get

All output goes in one workspace folder (`./interview-prep/` by default):

| File | Contents |
|---|---|
| `scripts.md` | A self-introduction, plus each project in 11 sections: positioning, 30-second, 1-minute, deep dive, architecture table, design trade-offs, challenges, results and how they were measured, limitations, follow-ups, don't-say |
| `projects.json` / `mindmaps.json` / `qa_projects.md` | Fact cards, one mind map per project, and 6–8 follow-up questions per project |
| `extras.json` | STAR stories, red lines, English phrases, whiteboard drills |
| `resume_fixes.md` | Résumé lines that won't survive questioning, with corrected wording |
| `app/` | The practice app, with an optional desktop shortcut (Windows, macOS, Linux) |

The app includes:
- a script viewer that switches between Chinese, English and both;
- pitch drills timed against the 30-second and 1-minute versions;
- mock interviews graded by an LLM against reference answers, with follow-up questions;
- an AI interviewer that drills into one project at a time and flags claims that contradict the facts;
- flashcards (Leitner boxes);
- a domain pack's knowledge base and question bank.

## Install

```bash
git clone https://github.com/vacucity/interview-coach ~/.claude/skills/interview-coach
```

Then start a new Claude Code session. You can also install the packaged `.skill` file from the [Releases](https://github.com/vacucity/interview-coach/releases) page, if one is published.

Requirements:
- **Python 3.9+.** The app server uses only the standard library.
- **`pypdf`**, for PDF résumés only (`pip install pypdf`).
- **Optional:** an OpenAI-compatible API key for the AI features (DeepSeek, OpenAI and others), set in a `.env` file:

  ```
  LLM_API_KEY=...
  LLM_BASE_URL=https://api.deepseek.com
  LLM_MODEL_ID=...
  ```

## Use

Just ask, for example:

> Here's my résumé (resume.pdf). Help me prepare for AI application engineer interviews.

> 这是我的简历，帮我准备大模型应用开发的面试：讲稿要中英双语，再搭一个练习 App。

The skill runs in phases:

1. **Setup:** role or job description, languages, mode.
2. **Intake:** résumé → project inventory.
3. **Evidence and review:** each claim checked against the evidence.
4. **Ask first:** roles, employment type, publication status, confidentiality.
5. **Write, verify, cross-check.**
6. **Project content:** fact cards, mind maps, follow-up questions.
7. **Optional second round of questions.**
8. **Build the app.**

Two modes:

- **lite** (default for 1–4 projects): Claude does every step itself, in the conversation.
- **full**: parallel multi-agent workflows (a reviewer, a writer and an independent checker per project, plus a cross-check). Best quality, but token-heavy: roughly 400–700k tokens per project.

## Honesty rules

These are built into the skill:

- Facts come only from evidence or from the candidate's own answers. Unknowns become `【待确认】` / `[to confirm]` placeholders, never invented details.
- If asked to "borrow" details from another project, the skill declines and offers honest framings instead.
- Ownership on team projects is the candidate's to confirm; commit history alone doesn't decide it.
- Confidential employers and sensitive domains get the minimum description by default.
- Your résumé and project files go nowhere except the LLM endpoint you configure for the app.

## Layout

```
SKILL.md                    phases, modes, rules
references/                 data formats, script template, review checklist, clarify guide, packs, app guide
workflows/                  review.js, write.js, extras.js, apply.js (full mode)
scripts/                    extract_resume, count_lengths, validate, wf_save, apply_cross, build_app
assets/app/                 the practice app (server, content builder, single-page frontend, launchers)
assets/packs/agent-engineer the AI Agent engineer domain pack
evals/                      test cases for `claude plugin eval`
```

## Domain packs

`agent-engineer` covers AI Agent, LLM application, RAG and AI engineer roles. It has 12 knowledge modules, a bilingual bank of 115 questions, 7 topic mind maps and generic prep pages. Numbers labelled "参考实测 / reference measurement" come from real runs in the public [UCVC-AI-Lab-Agent](https://github.com/vacucity/UCVC-AI-Lab-Agent) tutorial. They are reference data, not your results.

Other roles work with `pack: "none"`. See `references/packs.md` to build your own pack.

## Limitations

- Much of the app's interface text is Chinese-only. The content itself follows the language switch.
- Projects without evidence get "suggested framing" scripts full of placeholders. The kit is only as good as the clarification answers.
- The full mode can hit usage limits on large résumés. Finished agents are cached, so a run can be resumed.

## Credits

- The question bank draws on public sources listed in its header, including Datawhale's [Hello-Agents](https://github.com/datawhalechina/hello-agents) interview notes.
- The default app icon is the LangChain logo, a trademark of LangChain, Inc. To use your own, put `icon.png` and `icon.ico` in a pack folder.

## License

[MIT](LICENSE)
