# Script template, timing budgets and speaking style

Each project unit has the same 11 sections, in the same order, in every language the candidate prepares. The `intro` unit (self-introduction) has 4. The headings are parsed by the app, so use them exactly.

## Project units

| # | Chinese heading | English heading | Content |
|---|---|---|---|
| 1 | `#### 定位` | `#### Positioning` | 2–4 short lines: evidence level (【代码实证】/【本地实证】/【论文】/【建议口径】, [Code-verified] / [Verified locally] / [Paper] / [Suggested framing]); the candidate's role, time frame, solo or team; where to point an interviewer (repo + key files) |
| 2 | `#### 30 秒版本` | `#### 30-second version` | One spoken paragraph: one problem, what I built, one result |
| 3 | `#### 1 分钟讲述` | `#### 1-minute walkthrough` | One or two spoken paragraphs: who it's for and what hurt → what I built and my part → 2–3 key design points → result and how it was measured |
| 4 | `#### 展开讲（2–3 分钟）` | `#### Going deeper (2–3 minutes)` | For "tell me more": 5–8 numbered talking points in walkthrough order, 1–3 sentences each |
| 5 | `#### 架构与各环节` | `#### Architecture and stages` | One sentence naming the orchestration style, then a table `\| 环节 \| 输入 \| 处理 \| 输出 \|` / `\| Stage \| Input \| Processing \| Output \|` with short cells. Keep only rows the candidate can explain |
| 6 | `#### 关键设计与取舍` | `#### Key design decisions and trade-offs` | 3–5 bullets: "**决定**：为什么；放弃了什么 / 代价" |
| 7 | `#### 难点与踩坑` | `#### Challenges and fixes` | 2–4 mini-STAR bullets: what went wrong → how it was found → the fix → the result. Verified ones only |
| 8 | `#### 结果与口径` | `#### Results and how they were measured` | A table `\| 数字 \| 含义与口径 \|` / `\| Number \| What it means and how it was measured \|`, then one line on what must not be claimed |
| 9 | `#### 局限与改进` | `#### Limitations and what I'd change` | 2–4 honest bullets, plus what I'd change in a rebuild |
| 10 | `#### 高频追问` | `#### Likely follow-ups` | 6–8 items: `- **问：…**` then `  答：…` on an indented next line (`- **Q: …**` / `  A: …`). Spoken answers, 1–3 sentences |
| 11 | `#### 不要这样说` | `#### Don't say this` | 2–5 bullets: `❌ wrong wording → ✅ right wording`. Every résumé-vs-fact gap for this project goes here |

## The intro unit

| Chinese heading | English heading | Content |
|---|---|---|
| `#### 30 秒版本` | `#### 30-second version` | Name, current status, the one or two strongest facts, one strength |
| `#### 1 分钟版本` | `#### 1-minute version` | Education → experience (1 line per employer) → the lead project and its best result → the strength, with one principle |
| `#### 按岗位侧重换一句` | `#### Swap one line for the role` | 3 variants of the closing line for common JD emphases, each with the evidence behind it and the likely follow-up |
| `#### 讲的时候注意` | `#### Delivery notes` | When to use which version; how to pace it; a table of every claim and its source; ready one-liners for the obvious follow-ups (role, dates, gaps); the intro's "don't say this" list |

## Timing budgets

Spoken Chinese runs at about 230–270 characters a minute and spoken English at about 140–160 words a minute. Count only Han characters (no punctuation, Latin text or placeholders) and only English words. `scripts/count_lengths.py` does the counting.

| Section | Chinese | English |
|---|---|---|
| 30-second version | 100–130 characters | 65–85 words |
| 1-minute version | 230–280 characters | 140–170 words |
| Going deeper | 5–8 points | 5–8 points |

## Speaking style: why it matters

Interviewers judge a story partly by how easily it comes out. A script that reads well on paper but packs five terms into one breath makes the candidate sound rehearsed, or lost. These rules are what made the difference in practice:

### Chinese

- Keep clauses short: 25 characters or fewer, and one new technical term per clause.
- Say the plain idea first, then the term: "先把同类特征分成一组、每组留一个代表，也就是聚类加互信息选特征". Never write a chain of terms.
- Use at most 2 numbers per sentence. In spoken parts, round numbers where precision isn't the point; the exact values go in 结果与口径.
- Use spoken connectives: 先……再……最后……；之所以……是因为……；举个例子……；结果是……
- Speak in the first person ("我负责……", "我发现……"). On team projects, say what the team did and what I did.
- Avoid stacked modifiers (……的……的……的) and written-style verbs (进行、实现了对……的、基于……的……框架).
- Keep English only for terms interviewers use too (LangGraph, RAG, SSE, checkpoint, ROC-AUC).

### English

- Use natural spoken English and short sentences; contractions are fine.
- Avoid noun stacks ("leakage-safe time-series feature engineering pipeline") and anything that sounds translated.
- Use the first person, and keep "we" (the team) separate from "I".

## Facts in the scripts

- Use only facts from the sources: code, the candidate's files, `answers.md`, verified review findings, and the résumé where nothing contradicts it.
- A specific you don't have becomes a placeholder, 【待确认：…】 / [to confirm: …]. Put it in a clause the candidate can drop without breaking the sentence. Don't put placeholders mid-sentence where the filled-in text would derail the grammar.
- Where the résumé disagrees with the evidence, the script uses the verified version, and 不要这样说 quotes the résumé wording.
- Keep three things apart: what is in the code, what was measured (by whom, and how often), and what was only a design goal.
- The language versions must carry the same facts and structure. They need not be word-for-word translations.

### When a project has no evidence ("suggested framing")

The candidate still needs a usable script, so the template stays complete. Fill it from what the résumé states; everything specific becomes a marked slot:
- Design reasons and trade-offs: you may state the usual reason for such a choice, but mark it as a slot to replace, e.g. "a common reason is …, [to confirm: your actual reason]".
- Challenges and STAR stories: never invent one. Leave a clearly marked slot with "places to look" (incidents, eval runs, review feedback) so the candidate can fill it from memory.
- Numbers: state the résumé figure in the spoken text, and put how it was measured in a removable placeholder.
