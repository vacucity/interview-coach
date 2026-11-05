# The practice app

A local web app; `scripts/build_app.py` builds it into `<workspace>/app/`. The server uses only the Python standard library, so it needs no installs. It runs on `127.0.0.1:<port>`, and progress is saved in the browser (localStorage).

## Pages

- **Dashboard**: progress by question-bank section, flashcards due, mock-interview average and weak spots, quick-start buttons for the lead projects, "practise first" tags from the JD, and an interview-date countdown. Progress can be exported and imported here.
- **Knowledge base, mind maps** (from the pack): the mind maps have a recall mode that hides labels.
- **My projects**: per project, the fact card (key numbers, verified findings, risk notes), the architecture diagrams (click a box and the AI explains that step), the script (follows the 中 / EN / 双语 switch), the mind map and the follow-up questions. A 待确认 card lists open questions.
- **Question bank** (pack bank + project follow-ups): filter by section, tag or status; mark questions 掌握 (mastered) or 再练 (practise again); keep your own notes per question.
- **Flashcards**: Leitner boxes with intervals of 1, 2, 4, 8 and 16 days. Keys: space, 1, 2, 3.
- **Mock interview**: timed answers, typed or by voice (Chrome / Edge). The LLM grades each against the reference answer (points covered, points missed, factual errors, a better outline) and asks a follow-up. Questions scoring below 6 go to 再练. **Pitch practice** times the 30-second and 1-minute versions from `scripts.md`.
- **AI project deep-dive**: an interviewer that has read the project's card and script asks one question at a time, scores each answer, flags claims that contradict the facts, and ends with a summary.
- **Prep pages, scripts, files**: the generic prep pages from the pack, plus the candidate's own STAR stories and red lines; all script units; the files in `<workspace>/files/`.

## AI configuration

`coach.json` → `env_file` points to a dotenv file:

```
LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com      # any OpenAI-compatible endpoint; defaults to https://api.openai.com/v1
LLM_MODEL_ID=...                           # the model to use; AI features stay off without it
```

- The key stays in the local server; the browser never sees it.
- For DeepSeek endpoints the server disables thinking mode automatically: it shares `max_tokens` and truncates JSON.
- Without a key, everything works except grading, the deep-dive interviewer and diagram explanations.

## Launching

- Use the desktop shortcut (`build_app.py --shortcut`), or run `launch.ps1` (Windows) or `launch.sh` (macOS / Linux) in `<workspace>/app/`.
- The launcher starts the server hidden if it isn't running, waits for `/api/health`, then opens the browser.
- **关闭后台服务** on the dashboard stops the server.
- After editing the workspace files, reload the page: the server rebuilds `content.json` when any source file is newer than it.

## Known limitations

- The content (scripts, cards, mind maps, questions, knowledge base) follows the 中 / EN / 双语 switch. Much of the interface chrome is Chinese only: dashboard labels, filters, flashcard and mock-interview controls. In an English-only workspace, tell the candidate this up front.
- The pack's tags and section titles are Chinese-first (`中文 / English`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The local server did not start" | The port is taken: change `port` in `coach.json` and rebuild. Tracebacks are in `app/data/server.log` (Windows windowless mode). |
| A page shows raw headings or empty scripts | Run `scripts/validate.py <workspace>`; it reports heading or format problems. |
| AI says it isn't configured | Check `env_file` in `coach.json` and that the file has both `LLM_API_KEY` and `LLM_MODEL_ID`. |
| Shortcut does nothing (Windows) | Run `powershell -ExecutionPolicy Bypass -File <ws>\app\launch.ps1` to see the error. Re-saving `launch.ps1` as UTF-8 with BOM fixes garbled Chinese in message boxes. |
| Old content after an edit | Delete `app/data/content.json` and reload. |
