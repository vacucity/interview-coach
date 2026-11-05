export const meta = {
  name: 'interview-coach-apply',
  description: "Apply the candidate's newly confirmed answers to every script unit and the project content, then cross-check",
  phases: [
    { title: 'Apply', detail: 'one editor per unit, plus one for cards, mind maps and Q&A' },
    { title: 'Cross-check', detail: 'consistency with the answers and across units' },
  ],
}

// args: { ws, skill, units: [{ id }], langs }   (include "intro")
const A = args || {}
const WS = A.ws, SK = A.skill

const RULES = `
Read first: ${WS}/answers.md (the candidate's confirmed answers — the only new information you may add; they override placeholders and earlier assumptions) and ${SK}/references/script-template.md (structure, budgets, speaking style).
Rules:
- Do not write files; return everything through the structured output.
- Change only what the answers settle: fill resolved placeholders with natural spoken wording; update positioning, spoken versions, deep dive, follow-ups, don't-say and the open-question list. Keep every other sentence unless it now contradicts an answer.
- Never add facts beyond answers.md and what the text already says; unsettled placeholders stay.
- Remove a red line only if an answer makes it obsolete; add one if an answer creates a new risk.
- Keep exact #### headings and order and the timing budgets (count Han characters / English words of the 30-second and 1-minute sections and report them).
- Languages stay parallel. Return the REMAINING open questions only.
`

const SCHEMA = {
  type: 'object',
  properties: { zh: { type: 'string' }, en: { type: 'string' }, to_confirm: { type: 'array', items: { type: 'string' } }, changes: { type: 'array', items: { type: 'string' } },
    stats: { type: 'object', properties: { zh_30s_chars: { type: 'integer' }, zh_1min_chars: { type: 'integer' }, en_30s_words: { type: 'integer' }, en_1min_words: { type: 'integer' } } } },
  required: ['zh', 'en', 'to_confirm', 'changes', 'stats'],
}

phase('Apply')
const [edited, content] = await Promise.all([
  pipeline(A.units || [], u => agent(`${RULES}
UNIT "${u.id}": the "## ${u.id} | …" block in ${WS}/scripts.md ("### 中文" and/or "### English" bodies with #### sections, then "### 待确认"). Apply the answers and return the full updated bodies (#### sections only; return "" for a language the workspace doesn't use) and the remaining open questions.`,
    { label: `apply:${u.id}`, phase: 'Apply', schema: SCHEMA }).then(r => r ? { id: u.id, ...r } : null)),
  agent(`${RULES}
Apply the answers to ${WS}/projects.json, ${WS}/mindmaps.json and ${WS}/qa_projects.md (formats: ${SK}/references/data-formats.md). Return the three files' full updated contents (JSON as strings, Markdown as text). Keep ids, codes and structure; mind maps keep t / t_en node for node.`, {
    label: 'apply:content', phase: 'Apply',
    schema: { type: 'object', properties: { projects_json: { type: 'string' }, mindmaps_json: { type: 'string' }, qa_md: { type: 'string' }, changes: { type: 'array', items: { type: 'string' } } }, required: ['projects_json', 'mindmaps_json', 'qa_md', 'changes'] },
  }),
])

const done = edited.filter(Boolean)
phase('Cross-check')
const pick = (md, names) => (md || '').split(/^#### /m).filter(s => names.some(n => s.startsWith(n))).map(s => '#### ' + s.trim()).join('\n\n')
const digest = done.map(r => `===== ${r.id} =====\n${pick(r.zh, ['定位', '30 秒', '1 分钟', '不要这样说'])}\n----- en -----\n${pick(r.en, ['Positioning', '30-second', '1-minute', "Don't say"])}`).join('\n\n')
const cross = await agent(`You are the final consistency checker. The candidate confirmed the facts in ${WS}/answers.md (READ-ONLY; do not write files). Below are the updated positioning lines, 30-second and 1-minute versions and don't-say sections of all units.
Find every remaining problem: anything contradicting answers.md, the same fact stated differently in two units, language disagreements, and spoken text still hard to say aloud. For each give the unit id, language, the exact quote copied verbatim, and the exact replacement. Don't propose fixes that push a spoken section over its budget.

${digest}`, {
  label: 'cross-check', phase: 'Cross-check',
  schema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { unit: { type: 'string' }, lang: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' }, replacement: { type: 'string' } }, required: ['unit', 'lang', 'quote', 'problem', 'replacement'] } }, summary: { type: 'string' } }, required: ['issues', 'summary'] },
})

return { kind: 'apply', units: done, content, cross, missing: (A.units || []).map(u => u.id).filter(id => !done.some(d => d.id === id)) }
