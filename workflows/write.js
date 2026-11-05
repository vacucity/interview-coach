export const meta = {
  name: 'interview-coach-write',
  description: 'Write each interview script unit in the template, verify it independently, then cross-check all units',
  phases: [
    { title: 'Write', detail: 'one writer per unit' },
    { title: 'Verify', detail: 'independent facts + speakability + length check per unit' },
    { title: 'Cross-check', detail: 'consistency across all units' },
  ],
}

// args: { ws, skill, units: [{ id, note }], langs: ['zh','en'] }
const A = args || {}
const WS = A.ws, SK = A.skill
const LANGS = A.langs || ['zh', 'en']
const LANG_RULE = LANGS.length === 2
  ? 'Write both a Chinese body ("zh") and an English body ("en"); they carry the same facts and structure.'
  : (LANGS[0] === 'zh' ? 'Write only the Chinese body ("zh"); return "en" as an empty string.' : 'Write only the English body ("en"); return "zh" as an empty string.')

const SHARED = `
Read first:
- ${SK}/references/script-template.md — required #### headings in order, timing budgets, speaking-style rules, fact rules. Follow it exactly.
- ${SK}/references/clarify-guide.md, section "Honesty guard".
- ${WS}/inventory.json, ${WS}/resume.txt, ${WS}/answers.md (the candidate's confirmed answers; they override everything else), ${WS}/reviews/<unit>.json (the review of this unit — fix every problem it raises and keep what it says to keep), and ${WS}/jd.txt if present.

Rules:
- Do not create, modify or delete files. Return content only through the structured output.
- Facts only from the evidence, answers.md, the review's verified facts and the résumé where nothing contradicts it. Never invent numbers, names, roles, dates or results. Unknown specifics become placeholders 【待确认：…】 / [to confirm: …] in a clause that can be dropped.
- Where the résumé conflicts with the evidence, use the verified version and put the résumé wording in the "don't say" section.
- Team projects: say what the team built and what the candidate did; if the candidate's part is not established, use a placeholder.
- Count the spoken sections (Han characters / English words) against the budgets before returning; you may run python ${SK}/scripts/count_lengths.py on a temporary copy, or count yourself.
- ${LANG_RULE}
- Bodies contain ONLY #### sections (no #, ## or ### lines).
`

const DRAFT = {
  type: 'object',
  properties: { title: { type: 'string', description: 'Chinese display title (or English if English-only)' }, title_en: { type: 'string' }, zh: { type: 'string' }, en: { type: 'string' }, to_confirm: { type: 'array', items: { type: 'string' } } },
  required: ['title', 'title_en', 'zh', 'en', 'to_confirm'],
}
const FINAL = {
  type: 'object',
  properties: {
    title: { type: 'string' }, title_en: { type: 'string' }, zh: { type: 'string' }, en: { type: 'string' },
    to_confirm: { type: 'array', items: { type: 'string' } },
    changes_made: { type: 'array', items: { type: 'string' } },
    stats: { type: 'object', properties: { zh_30s_chars: { type: 'integer' }, zh_1min_chars: { type: 'integer' }, en_30s_words: { type: 'integer' }, en_1min_words: { type: 'integer' } } },
    card_corrections: { type: 'array', description: 'facts the fact card / mind map for this project must reflect (empty for intro)', items: { type: 'string' } },
  },
  required: ['title', 'title_en', 'zh', 'en', 'to_confirm', 'changes_made', 'stats', 'card_corrections'],
}

const units = A.units || []
const results = await pipeline(
  units,
  u => agent(`${SHARED}
UNIT "${u.id}". ${u.note || ''}
${u.id === 'intro' ? 'This is the self-introduction: use the INTRO headings from the template. Title: 自我介绍 / Self-introduction.' : 'Write the project script with the 11 project headings. Title it like "项目一：Name" / "Project 1 — Name" following the unit order.'}
Make it genuinely easy to say aloud and complete: every section filled with real content from the sources.`, { label: `write:${u.id}`, phase: 'Write', schema: DRAFT }),
  (d, u) => d ? agent(`${SHARED}
UNIT "${u.id}". You are the independent checker for a draft written by someone else. ${u.note || ''}

DRAFT (title: ${d.title} / ${d.title_en}):
===== zh =====
${d.zh}
===== en =====
${d.en}
===== writer's open questions =====
${(d.to_confirm || []).join('\n')}

Do all of this, then return the corrected FINAL version in full:
1. Check every factual claim against the sources yourself; fix or placeholder anything wrong or unsupported; make sure every problem in the review is resolved.
2. Read each spoken section aloud in your head; shorten long clauses, split term chains, explain jargon, max 2 numbers per sentence; English must sound like natural speech.
3. Bring the 30-second and 1-minute sections inside the budgets and report the counts in stats.
4. Exact headings and order; every section substantive; 6–8 follow-ups in the Q/A format; "don't say" covers every résumé-vs-evidence gap.
5. Language parity.
6. List in card_corrections the facts the project's fact card and mind map must carry (roles, corrected numbers, red lines).`, { label: `verify:${u.id}`, phase: 'Verify', schema: FINAL }).then(f => f ? { id: u.id, ...f } : null) : null,
)

const done = results.filter(Boolean)
const missing = units.map(u => u.id).filter(id => !done.some(r => r.id === id))
if (missing.length) log(`not finished: ${missing.join(', ')} — resume this run to retry them`)

phase('Cross-check')
const pick = (md, names) => (md || '').split(/^#### /m).filter(s => names.some(n => s.startsWith(n))).map(s => '#### ' + s.trim()).join('\n\n')
const digest = done.map(r => `===== ${r.id} =====\n${pick(r.zh, ['定位', '30 秒', '1 分钟', '不要这样说'])}\n----- en -----\n${pick(r.en, ['Positioning', '30-second', '1-minute', "Don't say"])}`).join('\n\n')
const cross = done.length > 1 ? await agent(`You are the final consistency checker for one candidate's interview scripts. Below are the positioning lines, 30-second and 1-minute versions and "don't say" sections of every unit. Read ${WS}/answers.md and ${WS}/resume.txt (READ-ONLY; do not write files).
Find every problem ACROSS units: the self-intro contradicting a project script (roles, employer, titles, dates, team vs solo, numbers, tools), the same fact stated differently in two places, a red line in one unit violated by another unit's spoken text, language disagreements, anything contradicting answers.md, and spoken text still hard to say aloud. For each issue give the unit id, language, the exact quote copied verbatim from that unit, and the exact replacement. Don't propose a fix that pushes a spoken section over its time budget.

${digest}`, {
  label: 'cross-check', phase: 'Cross-check',
  schema: { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { unit: { type: 'string' }, lang: { type: 'string' }, quote: { type: 'string' }, problem: { type: 'string' }, replacement: { type: 'string' } }, required: ['unit', 'lang', 'quote', 'problem', 'replacement'] } }, summary: { type: 'string' } }, required: ['issues', 'summary'] },
}) : { issues: [], summary: 'single unit, no cross-check' }

return { kind: 'write', order: units.map(u => u.id), units: done, missing, cross }
