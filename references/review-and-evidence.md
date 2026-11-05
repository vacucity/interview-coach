# Evidence, review checklist and fact checks

## 1. Finding evidence for each project

Ask the candidate where each project's evidence lives before searching on your own. Their own folders are private, so search only what they point you to, plus public sources such as their GitHub.

| Source | How to read it | Notes |
|---|---|---|
| Local repo or folder | `Glob` / `Grep` / `Read`; `git log --format='%an %ad %s'` for authorship | Read-only. Never modify the candidate's repos. |
| GitHub repo | `curl -s "https://api.github.com/repos/<owner>/<repo>/git/trees/HEAD?recursive=1"`, then raw files from `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>`; contributors and commits from the API | Save downloads in their own folder under the workspace (`evidence/<id>/`). Never run downloaded code. Read model files and pickles as bytes, never unpickle them. |
| Notebooks | Read the cells; note which outputs back which number | The printed output is the evidence, not the markdown text |
| Papers | Read the PDF with the `pages` parameter | Use the latest version; early drafts often carry numbers the final version overturned |
| Nothing | Mark evidence level `none` ("suggested framing") | The script still works, but every specific becomes a placeholder or the candidate's own statement |

Authorship matters as much as content. Commit authors, shared team accounts and the candidate's own dev notes all bear on "which part was mine". When the sources disagree, ask the candidate; never decide it for them.

## 2. What to record per project (review output)

- **Speakability**: count the current 30-second and 1-minute versions against the budgets in `script-template.md`. Quote the worst sentences and give a smoother spoken version of each.
- **Completeness**: check against the 11 template sections. Gaps that matter most:
  - no personal role stated;
  - no result, or no account of how it was measured;
  - no challenge or fix story;
  - no limitations;
  - English missing or much thinner than Chinese.
- **Facts**: check every claim against the evidence. Give each a verdict (wrong / unsupported / conflicts_with_resume / risky_wording / verified_ok) and cite what you checked.
- **Keep**: strong parts the rewrite must not lose.
- **Facts for the rewrite**: verified facts the current script is missing, with their sources. Measured experiments the candidate ran are usually the strongest material and are often absent.

## 3. Claim patterns that usually need checking

These came up again and again in real reviews:

- **Scale words**: "86 nodes", "multi-agent", "end-to-end", "framework", "platform", "real-time", "production", "deployed". Check what the code or dashboards actually do.
- **Framework names**: the résumé says LangChain/LangGraph, but the code calls an HTTP client directly; or the framework only appears in a dependency list.
- **Ownership**: "Architected / Developed" on a team project; core commits by a teammate; an AI assistant's notes standing in for the candidate's own work.
- **Employer framing**: hackathon or course projects listed under a company; internship vs full-time; titles that differ between the résumé and other materials.
- **Numbers**: a percentage without a baseline or test set; "53% lower" taken from an early draft; accuracy on circular labels; tiny test sets; metrics dominated by the majority class.
- **Domain claims**: "for X company's customers", "ADHD care", "government platform". Check that a real link exists.
- **Experiments vs shipped**: the candidate's own improvement experiments described as what the system does in production.

## 4. Independent verification (full mode)

A second agent, not the writer, checks each rewritten unit:

1. It re-verifies every fact against the sources and `answers.md`.
2. It reads every spoken section aloud in its head and fixes what trips.
3. It counts lengths with `scripts/count_lengths.py`.
4. It confirms the template headings and Chinese–English parity.
5. It lists corrections needed in `projects.json` and `mindmaps.json`.

Last, one cross-check agent reads the positioning, 30-second, 1-minute and "don't say" sections of all units side by side and finds contradictions between them. It gives an exact quote and replacement for each, so the fixes can be applied mechanically and scoped to their unit.
