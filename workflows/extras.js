export const meta = {
  name: 'interview-coach-extras',
  description: 'Build fact cards, mind maps and follow-up Q&A per project, plus STAR stories, red lines and résumé fixes',
  phases: [
    { title: 'Projects', detail: 'one agent per project: fact card + mind map + follow-up Q&A' },
    { title: 'Candidate', detail: 'STAR stories, red lines, English phrases, whiteboard drills, résumé fixes' },
  ],
}

// args: { ws, skill, units: [{ id, code }], langs }   (units = projects only, no "intro"; code = 1–2 uppercase letters, unique)
const A = args || {}
const WS = A.ws, SK = A.skill
const LANGS = A.langs || ['zh', 'en']
const BOTH = LANGS.length === 2
const LANG_NOTE = BOTH ? 'Fill both the Chinese fields and the *_en fields.' : (LANGS[0] === 'zh' ? 'Chinese only: fill the base fields and copy them into the *_en fields.' : 'English only: write English into the base fields and the *_en fields alike.')

const SHARED = `
Read first: ${SK}/references/data-formats.md (exact formats: projects.json card, mindmaps.json map, qa_projects.md question format, extras.json pages), ${WS}/scripts.md (the final interview scripts — everything you produce must agree with them), ${WS}/answers.md, ${WS}/inventory.json and ${WS}/reviews/.
Rules: facts only from those files; nothing invented; unknown specifics as 【待补：…】 / [TBC: …]. ${LANG_NOTE} Do not write files — return content through the structured output only.
`

phase('Projects')
const perProject = await parallel((A.units || []).map(u => () => agent(`${SHARED}
PROJECT "${u.id}", question-code prefix "${u.code}". Produce:
1. card_json: the projects.json card for this project as a JSON object string (id "${u.id}", mindmap "p-${u.id}", codes ["${u.code}"], evidence = the Chinese badge text for its evidence level). numbers[].k must say how each number was measured; findings = verified facts (with source); risks = résumé-vs-fact gaps and claims an interviewer could catch, each with the safe wording.
2. map_json: the mindmaps.json entry as a JSON object string (id "p-${u.id}", group "项目", 4–6 branches, 2–5 short leaves each${BOTH ? ', t_en mirroring t node for node' : ''}).
3. qa_md: a qa_projects.md section starting with "## " (a title naming the project) followed by 6–8 questions coded ${u.code}1, ${u.code}2, … in the exact bank format. Pick the questions an interviewer is most likely to ask about THIS project (role, design choices, failures, numbers and how measured, what you'd change); answers are spoken and consistent with the script.`, {
  label: `project:${u.id}`, phase: 'Projects',
  schema: { type: 'object', properties: { id: { type: 'string' }, card_json: { type: 'string' }, map_json: { type: 'string' }, qa_md: { type: 'string' } }, required: ['id', 'card_json', 'map_json', 'qa_md'] },
})))

phase('Candidate')
const cand = await agent(`${SHARED}
Produce the candidate-level prep content:
1. extras_json: a JSON array string of extras.json pages with ids "star" (cards: one STAR story per real challenge in the scripts' challenges sections), "redlines" (list: every ❌ → ✅ line from the scripts' don't-say sections, deduplicated), "english" (cards: 8–10 English phrases tailored to this candidate's projects and positioning), "whiteboard" (list: the diagrams the candidate should be able to draw in 3 minutes, one per lead project plus core concepts).
2. resume_fixes_md: the resume_fixes.md table (Project | Résumé says | Problem | Suggested wording) covering every résumé claim the scripts' don't-say sections or answers.md say must change.`, {
  label: 'candidate', phase: 'Candidate',
  schema: { type: 'object', properties: { extras_json: { type: 'string' }, resume_fixes_md: { type: 'string' } }, required: ['extras_json', 'resume_fixes_md'] },
})

return { kind: 'extras', projects: perProject.filter(Boolean), candidate: cand, missing: (A.units || []).map(u => u.id).filter(id => !perProject.some(p => p && p.id === id)) }
