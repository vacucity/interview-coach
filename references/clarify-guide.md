# Asking the candidate what only they know

The review produces many open questions (130 in one real run). Asking all of them wears the candidate out. Most are drill-down details that matter only if an interviewer digs that deep. The job is to find the 15–25 answers that change what the candidate will actually say, and ask those well.

## 1. Merge and rank

1. Collect every open question from the reviews (and later from the scripts' `### 待确认` lists).
2. Merge duplicates across projects. The same fact often appears 3–4 times: employment type, the dates of a role, publication status, "which part was yours".
3. Rank by impact:
   - **Tier 1, cross-cutting.** Facts that change several scripts or the self-intro: employment type (internship or full-time), which part of each team project was the candidate's, publication status and author position, enrollment and graduation timing, confidentiality limits.
   - **Tier 2, red-line facts.** A résumé claim the evidence contradicts or can't find, such as a technique the code doesn't contain, a company link, a "real-time" system, or "deployed". The candidate either supplies the truth or accepts a résumé change.
   - **Tier 3, the role line in each project's 1-minute version.**
   - **Tier 4, drill-down details.** How a metric was measured, model versions, chunk sizes. Leave these as placeholders in the scripts, and tell the candidate where to find the list.

## 2. Ask in rounds

- Use `AskUserQuestion`: up to 4 questions per round, each with 2–4 concrete options that cover the likely truths. The tool always offers "Other" for free text. Use `multiSelect` for "which parts were yours".
- Put Tier 1 first. Ask before writing the scripts, so the first draft already carries the right role and employment facts; rewriting afterwards costs a full extra pass.
- After each round, say in one or two lines what you recorded and how it changes the scripts. Then ask the next round.
- Stop after Tier 3, or earlier if the candidate wants to. Record everything in `answers.md`, in the candidate's own words.
- If you're running without a user to ask (a subagent, a batch run), skip the rounds. Write placeholders and list the questions in `### 待确认`.

## 3. Read answers carefully

Options are shorthand. Free-text answers sometimes change the question. Read them literally before applying them:

- An answer can be partial. "Did the classifier too" adds to the candidate's role; it doesn't replace it.
- An answer can contradict the evidence. If the candidate says they did X and the files show only Y, accept their statement as theirs, but write it so it doesn't overclaim what the evidence shows. For example: "I also built a retrieval base over the cleaned files", not "retrieval features improved the classifier", when the classifier demonstrably used other inputs. Keep the remaining specifics as placeholders.
- An answer can contain an instruction ("don't stress the source", "only call them cases"). Apply it everywhere, in spoken text and on the fact cards.

## 4. Honesty guard

The point of the whole kit is that everything the candidate says survives a follow-up question. So:

- **Don't invent experience.** If the candidate asks you to "borrow details from another project" or "just fill it in", don't write invented work into a project as fact. Explain briefly that interviewers drill into exactly those details. Then offer honest options:
  - present it as a designed next step ("我会这样加");
  - point to where they really did similar work;
  - drop it from the résumé.

  If they then describe real work, write that.
- **Don't decide ownership.** Commit history, shared accounts and notes can suggest who did what. Only the candidate can confirm it.
- **Confidentiality.** For client or employer work, ask what may be said. Default to the minimum: "a banking client", no names, no figures. Give the candidate a polite line for declining.
- **Sensitive data.** For projects involving vulnerable groups, health data or legal cases, ask how far they may describe the domain. Default to a neutral description, and never show data.
- **The candidate's files are private.** Don't send résumé or project content to any external service beyond the LLM endpoint the candidate configured for the app.

## 5. After the answers

1. Apply the answers to every unit: `workflows/apply.js` in full mode, or inline in lite mode.
2. Update `projects.json`, `mindmaps.json` and `qa_projects.md` the same way.
3. Run the cross-check again.
4. Sweep for anything the answers forbid (e.g. a name the candidate asked to leave out), and check that every remaining match is legitimate. A question asking "full-time or internship?" with the answer "internship" is fine.
5. Rebuild the app.
