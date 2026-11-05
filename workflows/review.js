export const meta = {
  name: 'interview-coach-review',
  description: 'Review each résumé project (and the self-intro) against its evidence: speakability, completeness, facts',
  phases: [{ title: 'Review', detail: 'one reviewer per unit, in parallel' }],
}

// args: { ws: workspace path, skill: skill path, units: [{ id, note }], langs: ['zh','en'] }
const A = args || {}
const WS = A.ws, SK = A.skill
const LANGS = (A.langs || ['zh', 'en']).join(' + ')

const COMMON = `
You review one unit of a job candidate's interview preparation. A unit is one résumé project, or "intro" (the self-introduction). The goal of the whole effort is a kit where every claim survives follow-up questions and every script can be said aloud within its time limit. Your review drives the rewrite, so be concrete.

Read first:
- ${SK}/references/review-and-evidence.md — how to find and read evidence, what to record, claim patterns that usually fail.
- ${SK}/references/script-template.md — the target structure, timing budgets and speaking style.
- ${WS}/inventory.json — the résumé facts and evidence links for every project.
- ${WS}/resume.txt — the résumé text. Also ${WS}/jd.txt and ${WS}/answers.md if they exist.

Rules:
- READ-ONLY on the candidate's repos and folders. Save anything you download under ${WS}/evidence/<unit id>/ and never execute downloaded code or unpickle model files.
- Cite evidence (path + line, cell, commit or quote) for every claim you call wrong or unsupported. If you couldn't verify something, say "unverifiable".
- Authorship matters: note what the commit history, shared accounts or notes say about who built what, but leave ownership for the candidate to confirm.
- Languages the candidate prepares in: ${LANGS}.
`

const SCHEMA = {
  type: 'object',
  properties: {
    unit: { type: 'string' },
    overall: { type: 'string', description: '2-4 sentences: the main problems' },
    length: { type: 'object', properties: { zh_1min_chars: { type: 'integer' }, en_1min_words: { type: 'integer' }, comment: { type: 'string' } }, required: ['comment'] },
    speakability: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' }, smoother: { type: 'string' } }, required: ['where', 'quote', 'problem', 'smoother'] } },
    gaps: { type: 'array', items: { type: 'object', properties: { missing: { type: 'string' }, why: { type: 'string' }, material: { type: 'string' } }, required: ['missing', 'why', 'material'] } },
    fact_issues: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, where: { type: 'string' }, verdict: { type: 'string', enum: ['wrong', 'unsupported', 'conflicts_with_resume', 'risky_wording', 'verified_ok'] }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['claim', 'where', 'verdict', 'evidence', 'fix'] } },
    open_questions: { type: 'array', items: { type: 'string' }, description: 'questions only the candidate can answer (role, dates, confidentiality, missing numbers), in the candidate language' },
    keep: { type: 'array', items: { type: 'string' } },
    facts_for_rewrite: { type: 'array', items: { type: 'string' }, description: 'verified facts with their source that the scripts should use' },
  },
  required: ['unit', 'overall', 'length', 'speakability', 'gaps', 'fact_issues', 'open_questions', 'keep', 'facts_for_rewrite'],
}

phase('Review')
const reviews = await parallel((A.units || []).map(u => () => agent(`${COMMON}
UNIT "${u.id}". ${u.note || ''}
${u.id === 'intro'
    ? 'Review the self-introduction: the existing one if the inventory or answers point to one, otherwise review what the résumé gives you to build one (strongest facts, gaps, dates and titles that need confirming, anything an interviewer would ask about first).'
    : 'Find this project in inventory.json and check its evidence sources. If the candidate already has a script or talking points for it (listed as a "doc" source), review that text for speakability and completeness too; otherwise review the résumé bullets as the starting script.'}
Return the structured review with "unit": "${u.id}".`, { label: `review:${u.id}`, phase: 'Review', schema: SCHEMA })))

return { kind: 'review', reviews: reviews.filter(Boolean), missing: (A.units || []).map(u => u.id).filter(id => !reviews.some(r => r && r.unit === id)) }
