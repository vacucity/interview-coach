'use strict';
/* Agent Interview Coach: single-page app over /api/content. Progress lives in localStorage. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const PH = String.fromCharCode(1);

// ---------- persisted state ----------
const KEY = 'agent-coach.v1';
const DEF = { status: {}, leitner: {}, history: [], interviews: [], checks: {}, notes: {}, lang: 'zh', theme: 'light', date: '' };
let S;
try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = { ...DEF }; }
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

let C = null;                       // content.json
let AI = { ok: false, ai: false, model: '' };
let cleanups = [];
const ACT = {};                     // data-act handlers
const CHG = {};                     // data-chg handlers

// ---------- markdown ----------
function inline(t) {
  const codes = [];
  t = esc(t).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return PH + (codes.length - 1) + PH; });
  t = t.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(（])(https?:\/\/[^\s)）<&]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return t.replace(new RegExp(PH + '(\\d+)' + PH, 'g'), (_, i) => `<code>${codes[i]}</code>`);
}

function mdTable(rows) {
  const cells = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  const head = cells(rows[0]);
  let body = rows.slice(1);
  if (body.length && /^[\s|:-]+$/.test(body[0])) body = body.slice(1);
  return `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
    body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function mdList(lines) {
  let html = '';
  const stack = [];
  for (const ln of lines) {
    const m = ln.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!m) { html += '<br>' + inline(ln.trim()); continue; }
    const ind = m[1].length, type = /\d/.test(m[2]) ? 'ol' : 'ul';
    while (stack.length && ind < stack[stack.length - 1].indent) html += `</li></${stack.pop().type}>`;
    const top = stack[stack.length - 1];
    if (!top || ind > top.indent) {
      html += type === 'ol' ? `<ol start="${parseInt(m[2], 10)}">` : '<ul>';
      stack.push({ indent: ind, type });
    } else {
      html += '</li>';
      if (top.type !== type) { html += `</${stack.pop().type}>` + (type === 'ol' ? `<ol start="${parseInt(m[2], 10)}">` : '<ul>'); stack.push({ indent: ind, type }); }
    }
    html += '<li>' + inline(m[3]);
  }
  while (stack.length) html += `</li></${stack.pop().type}>`;
  return html;
}

function md(src) {
  if (!src) return '';
  const L = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  const isLi = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  const isFence = l => /^\s*```/.test(l);
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if (isFence(l)) {
      const buf = []; i++;
      while (i < L.length && !isFence(L[i])) buf.push(L[i++]);
      i++;
      const pad = Math.min(...buf.filter(x => x.trim()).map(x => x.match(/^\s*/)[0].length), 99);
      out.push(`<pre class="code"><code>${esc(buf.map(x => x.slice(pad === 99 ? 0 : pad)).join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*\|/.test(l)) {
      const rows = []; while (i < L.length && /^\s*\|/.test(L[i])) rows.push(L[i++]);
      out.push(mdTable(rows)); continue;
    }
    if ((m = l.match(/^\s*(#{1,6})\s+(.*)/))) { const n = Math.min(6, m[1].length + 2); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) {
      const buf = []; while (i < L.length && /^\s*>/.test(L[i])) buf.push(L[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`); continue;
    }
    if (isLi(l)) {
      const buf = [];
      while (i < L.length && L[i].trim() && !isFence(L[i]) && (isLi(L[i]) || /^\s+/.test(L[i]))) buf.push(L[i++]);
      out.push(mdList(buf)); continue;
    }
    const buf = [];
    while (i < L.length && L[i].trim() && !isLi(L[i]) && !/^\s*(```|\||>|#{1,6}\s)/.test(L[i]) && !/^\s*(---|\*\*\*)\s*$/.test(L[i])) buf.push(L[i++]);
    if (!buf.length) buf.push(L[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

// docx blocks from the interview script
function blocksHtml(bs) {
  let out = '', ul = [];
  const flush = () => { if (ul.length) { out += `<ul>${ul.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`; ul = []; } };
  for (const b of bs) {
    if (b.t === 'li') { ul.push(b.text); continue; }
    flush();
    if (b.t === 'h2') out += `<h3>${inline(b.text)}</h3>`;
    else if (b.t === 'h1' || b.t === 'title') out += `<h2>${inline(b.text)}</h2>`;
    else if (b.t === 'code') out += `<pre class="code"><code>${esc(b.text)}</code></pre>`;
    else if (b.t === 'table') out += `<div class="tbl"><table>${b.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c).replace(/\n/g, '<br>')}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`;
    else out += `<p>${inline(b.text).replace(/\n/g, '<br>')}</p>`;
  }
  flush();
  return out;
}
const blocksText = bs => bs.map(b => b.t === 'table' ? b.rows.map(r => r.join(' | ')).join('\n') : b.text).join('\n');

// ---------- helpers ----------
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({ error: '响应解析失败' }));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const scoreCls = s => s >= 8 ? 'g' : s >= 6 ? 'm' : 'b';
const fmtTime = s => `${String(Math.floor(Math.abs(s) / 60)).padStart(2, '0')}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
const fmtDate = t => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const qById = id => C.questions.find(q => q.id === id);
const secShort = s => s.split(' / ')[0];
const sections = () => [...new Set(C.questions.map(q => q.section))];
const tags = () => [...new Set(C.questions.flatMap(q => q.tags))];
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

function qTitle(q, lang = S.lang) {
  if (lang === 'en') return inline(q.title_en || q.title);
  if (lang === 'both') return `${inline(q.title)}${q.title_en ? `<div class="sub">${inline(q.title_en)}</div>` : ''}`;
  return inline(q.title);
}
// bilingual helpers: English falls back to Chinese when a translation is missing
const L = (zh, en) => S.lang === 'en' ? en : zh;
function biMd(zh, en, lang = S.lang) {
  if (lang === 'en') return md(en || zh);
  if (lang === 'both' && en) return `<div class="ans2"><div><div class="lang-h">中文</div>${md(zh)}</div><div><div class="lang-h">English</div>${md(en)}</div></div>`;
  return md(zh);
}
function biInline(zh, en, lang = S.lang) {
  if (lang === 'en') return inline(en || zh);
  if (lang === 'both' && en && en !== zh) return `${inline(zh)}<div class="alt">${inline(en)}</div>`;
  return inline(zh);
}
function biLabel(zh, en, lang = S.lang) {
  if (lang === 'en') return esc(en || zh);
  if (lang === 'both' && en && en !== zh) return `${esc(zh)}<span class="alt-inline"> / ${esc(en)}</span>`;
  return esc(zh);
}
const pick = (zh, en) => S.lang === 'en' ? (en || zh) : zh;      // compact labels: one language only
const qAnswer = (q, lang = S.lang) => biMd(q.zh, q.en, lang);
function statusBtns(q) {
  const st = S.status[q.id];
  return `<button class="btn sm ${st === 'mastered' ? 'good' : 'ghost'}" data-act="status" data-arg="${q.id}|mastered">✓ 已掌握</button>
    <button class="btn sm ${st === 'review' ? 'mid' : 'ghost'}" data-act="status" data-arg="${q.id}|review">↻ 再练</button>`;
}
ACT.status = el => {
  const [id, st] = el.dataset.arg.split('|');
  S.status[id] = S.status[id] === st ? undefined : st;
  if (!S.status[id]) delete S.status[id];
  save();
  const card = el.closest('.q');
  if (card) { card.classList.remove('mastered', 'review'); if (S.status[id]) card.classList.add(S.status[id]); }
  const box = el.parentElement; box.innerHTML = statusBtns(qById(id));
};

function qCard(q, open = false, hl = '') {
  const st = S.status[q.id] || '';
  const sub = S.lang === 'both' ? '' : `<div class="sub">${esc(secShort(q.section))}</div>`;
  return `<details class="q ${st}" ${open ? 'open' : ''}><summary><span class="code">${esc(q.code)}</span><span class="ttl">${highlight(qTitle(q), hl)}${sub}</span>
    ${q.bank === 'project' ? '<span class="chip brand">项目</span>' : ''}${q.tags.slice(0, 2).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</summary>
    <div class="body">${highlight(qAnswer(q), hl)}<div class="row" style="margin-top:10px"><span class="row">${statusBtns(q)}</span><span class="spacer"></span>
    <a class="btn sm ghost" href="#/q/${encodeURIComponent(q.id)}">详情 / 笔记</a><button class="btn sm" data-act="mock-one" data-arg="${q.id}">🎤 练这题</button></div></div></details>`;
}
function highlight(html, word) {
  if (!word) return html;
  const re = new RegExp('(' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return html.replace(/>([^<]+)</g, (m, t) => '>' + t.replace(re, '<mark>$1</mark>') + '<');
}

// ---------- projects ----------
const projScript = p => (C.script.find(s => s.title.startsWith(p.script)) || { blocks: [] }).blocks;
function projScriptEn(p) {
  const s = C.script.find(x => x.title === 'English Version');
  if (!s) return [];
  let on = false; const out = [];
  for (const b of s.blocks) {
    if (b.t === 'h2') on = b.text.split(/\s+/).slice(0, 2).join(' ') === p.script_en;
    if (on) out.push(b);
  }
  return out;
}
function projQuestions(p) {
  return C.questions.filter(q => q.bank === 'project' && p.codes.some(c => new RegExp('^' + c + '\\d+$').test(q.code)));
}
// revised scripts (materials/07): one unit per project plus "intro"; zh/en are lists of {h, md} sections that line up by index
const revised = id => (C.revised || []).find(u => u.id === id);
const revisedText = u => u.zh.map(s => `## ${s.h}\n${s.md}`).join('\n\n');
function revisedHtml(u, lang = S.lang) {
  const one = (s, i) => `<div class="card" id="rv${i}"><h3>${esc(s.h)}</h3>${md(s.md)}</div>`;
  const en = u.en.length ? u.en : u.zh;
  const chips = (lang === 'en' ? en : u.zh).map((s, i) => `<a class="chip" href="javascript:void 0" data-act="jump" data-arg="rv${i}">${esc(s.h)}</a>`).join('');
  let body;
  if (lang === 'en') body = en.map(one).join('');
  else if (lang === 'both') body = u.zh.map((s, i) => `<div class="card" id="rv${i}"><div class="ans2"><div><h3>${esc(s.h)}</h3>${md(s.md)}</div><div>${
    u.en[i] ? `<h3>${esc(u.en[i].h)}</h3>${md(u.en[i].md)}` : ''}</div></div></div>`).join('');
  else body = u.zh.map(one).join('');
  const confirm = (u.confirm || []).length ? `<div class="card" style="border-color:var(--mid)"><h3>${L('待确认（确认前别在面试里说）', 'To confirm (settle these before you say them)')}</h3>
    <ul>${u.confirm.map(q => `<li>${inline(q)}</li>`).join('')}</ul></div>` : '';
  return `<div class="row small" style="margin-bottom:8px">${chips}</div>${body}${confirm}`;
}
function projContext(p) {
  const u = revised(p.id);
  return [`项目：${p.name}（${p.org}，${p.evidence}）`, `一句话：${p.one_liner}`, `技术栈：${(p.stack || []).join('、')}`,
    `关键数字：\n${(p.numbers || []).map(n => `- ${n.v}：${n.k}`).join('\n')}`,
    `代码核实与复现结论：\n${(p.course || []).map(x => '- ' + x).join('\n')}`,
    `风险提示（容易说错的地方）：\n${(p.risks || []).map(x => '- ' + x).join('\n')}`,
    `面试稿：\n${u ? revisedText(u) : blocksText(projScript(p))}`].join('\n\n').slice(0, 12000);
}
const evCls = e => e === '代码实证' || e === '本地实证' ? 'code' : e === '论文' ? 'paper' : 'sugg';
const EV_EN = { '代码实证': 'Code-verified', '本地实证': 'Verified locally', '建议口径': 'Suggested framing', '论文': 'Paper' };
const evLabel = e => biLabel(e, EV_EN[e]);

// ---------- pitches ----------
function pitches() {
  const out = [];
  if ((C.revised || []).length) {             // revised scripts: 30-second and 1-minute versions in both languages
    for (const u of C.revised) {
      u.zh.forEach((s, i) => {
        const target = /^30/.test(s.h) ? 30 : /^1 分钟/.test(s.h) ? 60 : 0;
        if (!target) return;
        out.push({ id: `rv-${u.id}-${target}-zh`, title: `${u.title} · ${s.h}`, text: s.md, target, lang: 'zh' });
        if (u.en[i]) out.push({ id: `rv-${u.id}-${target}-en`, title: `${u.title_en} · ${u.en[i].h}`, text: u.en[i].md, target, lang: 'en' });
      });
    }
    return out;
  }
  for (const s of C.script) {
    s.blocks.forEach((b, i) => {
      if (b.t === 'h2' && /自我介绍|self-intro/i.test(b.text) && s.blocks[i + 1] && s.blocks[i + 1].t === 'p' && !/模板/.test(b.text))
        out.push({ id: 'intro-' + out.length, title: b.text, text: s.blocks[i + 1].text, target: 60, lang: /English|self-intro/i.test(b.text) ? 'en' : 'zh' });
    });
  }
  for (const n of C.notes) out.push({ id: n.id, title: n.title, text: n.body, target: /30/.test(n.title) ? 30 : /2 ?分钟/.test(n.title) ? 120 : 60, lang: 'zh' });
  for (const p of C.projects) {
    const bs = projScript(p), i = bs.findIndex(b => b.t === 'h2' && b.text.startsWith('项目讲述稿'));
    if (i >= 0 && bs[i + 1]) out.push({ id: 'zh-' + p.id, title: `${p.name} · 1 分钟讲述`, text: bs[i + 1].text, target: 60, lang: 'zh' });
    const en = projScriptEn(p).find(b => b.t === 'p' && b.text.startsWith('Full walkthrough'));
    if (en) out.push({ id: 'en-' + p.id, title: `${p.name} · 1-min walkthrough`, text: en.text.replace(/^Full walkthrough[^.]*\.\s*/, ''), target: 60, lang: 'en' });
  }
  return out;
}

// ---------- router ----------
const ROUTES = {};
function route() {
  cleanups.forEach(f => f()); cleanups = [];
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const name = parts[0] || 'dashboard';
  (ROUTES[name] || ROUTES.dashboard)(...parts.slice(1));
  const navKey = { q: 'bank', search: '' }[name] ?? name;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === navKey));
  $('#main').scrollTop = 0;
}
const view = html => { $('#main').innerHTML = html; };
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------- dashboard ----------
const leadProjects = () => (C.meta.lead || []).map(id => C.projects.find(p => p.id === id)).filter(Boolean);
ACT['focus-tag'] = el => { BF.tag = el.dataset.arg; BF.bank = 'all'; BF.status = 'all'; BF.q = ''; go('#/bank'); };
ROUTES.dashboard = () => {
  const qs = C.questions, mastered = qs.filter(q => S.status[q.id] === 'mastered').length, review = qs.filter(q => S.status[q.id] === 'review').length;
  const dueCards = qs.filter(q => S.leitner[q.id] && S.leitner[q.id].due <= Date.now()).length, newCards = qs.filter(q => !S.leitner[q.id]).length;
  const mocks = S.history.filter(h => h.kind === 'mock'), mockAvg = avg(mocks.map(h => h.avg));
  const days = S.date ? Math.ceil((new Date(S.date + 'T09:00:00') - Date.now()) / DAY) : null;
  const scoreBySec = {};
  for (const h of mocks) for (const it of h.items) { const q = qById(it.id); if (q && it.score != null) (scoreBySec[q.section] = scoreBySec[q.section] || []).push(it.score); }
  const weak = Object.entries(scoreBySec).map(([s, a]) => [s, avg(a), a.length]).sort((a, b) => a[1] - b[1]).slice(0, 4);
  const secRows = sections().map(s => {
    const list = qs.filter(q => q.section === s), m = list.filter(q => S.status[q.id] === 'mastered').length, r = list.filter(q => S.status[q.id] === 'review').length;
    return `<div class="prog"><a href="#/bank/${encodeURIComponent(s)}" title="${esc(s)}">${esc(secShort(s))}</a><div class="bar" style="display:flex"><span style="width:${m / list.length * 100}%"></span><span class="rv" style="width:${r / list.length * 100}%"></span></div><span class="small muted">${m}/${list.length}${r ? ` · ${r} 再练` : ''}</span></div>`;
  }).join('');
  const recent = [...S.history].reverse().slice(0, 6).map(h => `<li>${fmtDate(h.t)} · ${h.kind === 'mock' ? `模拟面试 ${h.n} 题，平均 <b>${h.avg.toFixed(1)}</b>` : h.kind === 'interview' ? `AI 深挖「${esc(h.title)}」${h.avg != null ? `，总评 <b>${h.avg}</b>` : ''}` : h.kind === 'pitch' ? `Pitch「${esc(h.title)}」${h.secs}s` : `闪卡 ${h.n} 张`}</li>`).join('');
  view(`<div class="page-head"><div><h1>${esc(C.meta.title)}</h1><p>${C.questions.length} 道题 · ${C.knowledge.length} 个知识模块 · ${C.mindmaps.length} 张思维导图 · ${C.projects.length} 个项目</p></div><span class="spacer"></span>
    <label class="row small">面试日期 <input type="date" value="${esc(S.date)}" data-chg="date"></label>${days != null ? `<span class="chip ${days <= 3 ? 'bad' : 'brand'}" style="font-size:.95rem">${days >= 0 ? `D-${days}` : '已过'}</span>` : ''}</div>
  <div class="grid">
    <a class="tile" href="#/bank"><div class="v">${mastered}<span class="muted small"> / ${qs.length}</span></div><div class="k">题目已掌握 · ${review} 道待再练</div></a>
    <a class="tile" href="#/cards"><div class="v">${dueCards}</div><div class="k">闪卡今日到期 · 新卡 ${newCards}</div></a>
    <a class="tile" href="#/mock"><div class="v">${mocks.length ? mockAvg.toFixed(1) : '—'}</div><div class="k">模拟面试平均分 · 共 ${mocks.length} 轮</div></a>
    <a class="tile" href="#/interview"><div class="v">${S.interviews.length}</div><div class="k">AI 项目深挖次数</div></a>
  </div>
  <h2>快速开始</h2>
  <div class="row">
    <button class="btn" data-act="quick-mock">🎤 5 题随机模拟</button>
    <a class="btn ghost" href="#/cards">🃏 今日闪卡</a>
    ${leadProjects().map(p => `<a class="btn ghost" href="#/interview/${p.id}">🤖 AI 深挖 ${esc(pick(p.name, p.name_en))}</a>`).join('')}
    <a class="btn ghost" href="#/mock/pitch">⏱ Pitch 计时练习</a>
    <a class="btn ghost" href="#/prep/redlines">🚫 红线清单</a>
  </div>
  ${(C.meta.focus_tags || []).length ? `<p class="small muted" style="margin-top:10px">按目标岗位优先练：${C.meta.focus_tags.map(t => `<a class="chip brand" href="javascript:void 0" data-act="focus-tag" data-arg="${esc(t)}">${esc(t)}</a>`).join('')}</p>` : ''}
  <div class="dash" style="margin-top:18px">
    <div class="card"><h3>分类进度 <span class="small muted">（绿 = 已掌握，橙 = 再练）</span></h3>${secRows}</div>
    <div>
      <div class="card"><h3>弱项（按模拟面试得分）</h3>${weak.length ? `<ul>${weak.map(([s, a, n]) => `<li><a href="#/bank/${encodeURIComponent(s)}">${esc(secShort(s))}</a> · 平均 <b>${a.toFixed(1)}</b>（${n} 题次）</li>`).join('')}</ul>` : '<p class="muted">做几轮模拟面试后，这里会显示得分最低的分类。</p>'}</div>
      <div class="card"><h3>最近练习</h3>${recent ? `<ul>${recent}</ul>` : '<p class="muted">还没有记录。</p>'}</div>
      <div class="card"><h3>使用建议</h3>${md(`1. 先看 **面试准备 → 红线** 和 **我的项目 → 风险提示**，把容易说错的口径改掉。
2. 每天：闪卡 15 分钟 → 模拟面试 5 题（开 AI 评分）→ 低分题进“再练”。
3. 面试前 3 天：每个主推项目做 2 轮 **AI 项目深挖**，再做 Pitch 计时。
4. 用 **思维导图 → 回忆模式** 检查能不能不看提示讲出每个分支。`)}</div>
      <div class="card"><h3>数据与设置</h3><div class="row"><button class="btn sm ghost" data-act="export">导出进度</button><label class="btn sm ghost">导入进度<input type="file" accept=".json" data-chg="import" hidden></label>
        <button class="btn sm ghost" data-act="reset">清空进度</button><span class="spacer"></span><button class="btn sm bad" data-act="shutdown">关闭后台服务</button></div>
        <p class="small muted">进度保存在本机浏览器里。AI：${AI.ai ? `已连接 ${esc(AI.model)}` : '未配置（在 coach.json 指定的 env 文件里设置 LLM_API_KEY 和 LLM_MODEL_ID）'}。</p></div>
    </div>
  </div>`);
};
CHG.date = el => { S.date = el.value; save(); route(); };
ACT['quick-mock'] = () => { MOCK = null; startMock({ pool: 'all', n: 5, secs: 120, ai: AI.ai, lang: S.lang === 'en' ? 'en' : 'zh' }); };
ACT.export = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `agent-coach-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click();
};
CHG.import = async el => {
  try { const j = JSON.parse(await el.files[0].text()); S = Object.assign({}, DEF, j); save(); toast('已导入'); route(); } catch (e) { toast('导入失败：' + e.message); }
};
ACT.reset = () => { if (confirm('清空所有进度（掌握状态、闪卡、历史、笔记）？建议先导出。')) { const keep = { lang: S.lang, theme: S.theme }; S = { ...DEF, ...keep }; save(); route(); } };
ACT.shutdown = async () => {
  if (!confirm('关闭后台服务？关闭后需要从桌面快捷方式重新打开。')) return;
  try { await api('/api/shutdown'); } catch (e) { /* server already gone */ }
  view(`<div class="empty"><h2>后台服务已关闭</h2><p>可以关掉这个页面了。下次双击桌面上的“${esc(C.meta.title)}”即可。</p></div>`);
};

// ---------- knowledge ----------
const MOD_Q = {
  basics: { sec: ['A.'] }, frameworks: { sec: ['K.'] }, langchain: { sec: ['K+.'], tag: ['LangChain'] }, langgraph: { tag: ['LangGraph'] },
  memory: { sec: ['D.'], tag: ['记忆'] }, rag: { sec: ['C.'], tag: ['RAG'] }, context: { tag: ['上下文'] }, protocols: { sec: ['B.'] },
  evaluation: { sec: ['G.'], tag: ['评测'] }, multiagent: { sec: ['E.'], tag: ['多Agent'] }, production: { sec: ['F.', 'H.', 'I.'] }, training: { sec: ['J.'], tag: ['训练'] },
};
ROUTES.knowledge = id => {
  const mod = C.knowledge.find(m => m.id === id);
  const en = S.lang === 'en';
  const nav = `<div class="list-nav">${C.knowledge.map((m, i) => `<a href="#/knowledge/${m.id}" class="${m.id === id ? 'on' : ''}">${i + 1}. ${esc(en ? m.en : m.title)}</a>`).join('')}</div>`;
  if (!mod) {
    view(`<div class="page-head"><div><h1>${L('知识库', 'Knowledge base')}</h1><p>${L('按模块复习 Agent 开发的基础、框架语法和工程细节，数字都来自课程的真实运行。',
      'Review Agent fundamentals, framework syntax and engineering details module by module; every number comes from a real course run.')}</p></div></div>
      <div class="grid">${C.knowledge.map((m, i) => `<a class="tile" href="#/knowledge/${m.id}"><div class="small muted">${i + 1} · ${esc(en ? m.title : m.en)}</div><b>${esc(en ? m.en : m.title)}</b>
        <p class="small muted">${biInline(m.summary, m.summary_en)}</p></a>`).join('')}</div>`);
    return;
  }
  const rule = mod.match || MOD_Q[mod.id] || {};
  const rel = C.questions.filter(q => (rule.sec || []).some(s => q.section.startsWith(s)) || (rule.tag || []).some(t => q.tags.includes(t)));
  view(`<div class="split">${nav}<div>
    <div class="page-head"><div><div class="muted small">${esc(en ? mod.title : mod.en)}</div><h1>${esc(en ? mod.en : mod.title)}</h1></div></div>
    <div class="card"><b>${L('一句话：', 'In one line: ')}</b>${biInline(mod.summary, mod.summary_en)}</div>
    <div class="row small" style="margin-bottom:8px">${mod.sections.map((s, i) => `<a class="chip" href="javascript:void 0" data-act="jump" data-arg="ks${i}">${biLabel(s.h, s.h_en)}</a>`).join('')}</div>
    ${mod.sections.map((s, i) => `<div class="card" id="ks${i}"><h2>${biLabel(s.h, s.h_en)}</h2>${biMd(s.md, s.md_en)}</div>`).join('')}
    <h2>${L('相关题目', 'Related questions')}（${rel.length}）</h2>${rel.map(q => qCard(q)).join('') || `<p class="muted">${L('暂无', 'None')}</p>`}
  </div></div>`);
};
ACT.jump = el => { const t = document.getElementById(el.dataset.arg); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// ---------- mind maps ----------
const MMS = {};   // per map: {closed:Set, hide:boolean}
function mmCount(n) { return (n.c || []).reduce((a, k) => a + 1 + mmCount(k), 0); }
function mmPaths(n, p = '0', depth = 0, out = []) { if ((n.c || []).length) { out.push([p, depth]); n.c.forEach((k, i) => mmPaths(k, p + '.' + i, depth + 1, out)); } return out; }
function mmText(n) {
  if (S.lang === 'en') return inline(n.t_en || n.t);
  if (S.lang === 'both' && n.t_en && n.t_en !== n.t) return `${inline(n.t)}<span class="mm-en">${inline(n.t_en)}</span>`;
  return inline(n.t);
}
function mmNode(n, st, path, depth) {
  const kids = n.c || [], closed = st.closed.has(path);
  const hide = st.hide && depth > 0 && !st.shown.has(path);
  const tip = n.t_en && n.t_en !== n.t ? `${n.t} / ${n.t_en}` : n.t;
  return `<div class="mm d${Math.min(depth, 4)}"><div class="mm-label ${kids.length ? 'kids' : ''} ${closed ? 'closed' : ''} ${hide ? 'hide-text' : ''}" data-act="mm" data-arg="${path}" title="${esc(tip)}">${mmText(n)}${kids.length && closed ? `<span class="mm-count">+${mmCount(n)}</span>` : ''}</div>${
    kids.length && !closed ? `<div class="mm-children">${kids.map((k, i) => mmNode(k, st, path + '.' + i, depth + 1)).join('')}</div>` : ''}</div>`;
}
function mmHtml(map) {
  const st = MMS[map.id] = MMS[map.id] || { closed: new Set(), hide: false, shown: new Set() };
  return `<div class="row small" style="margin-bottom:8px"><button class="btn sm ghost" data-act="mm-all" data-arg="${map.id}|open">${L('全部展开', 'Expand all')}</button>
    <button class="btn sm ghost" data-act="mm-all" data-arg="${map.id}|1">${L('只看一级', 'Level 1 only')}</button><button class="btn sm ghost" data-act="mm-all" data-arg="${map.id}|2">${L('展开两级', 'Two levels')}</button>
    <button class="btn sm ${st.hide ? 'mid' : 'ghost'}" data-act="mm-all" data-arg="${map.id}|hide">${st.hide ? L('退出回忆模式', 'Exit recall mode') : L('🙈 回忆模式', '🙈 Recall mode')}</button>
    <span class="muted">${st.hide ? L('先说出这个分支的内容，再点击方块揭晓。', 'Say what the branch contains first, then click the box to reveal it.')
      : L('点击带子节点的方块可以折叠 / 展开。', 'Click a box that has children to collapse or expand it.')}</span></div>
    <div class="mm-wrap" data-map="${map.id}">${mmNode(map.root, st, '0', 0)}</div>`;
}
const GROUP_EN = { '总览': 'Overview', '专题': 'Topics', '项目': 'Projects' };
let MM_CUR = null;
ROUTES.maps = id => {
  const map = C.mindmaps.find(m => m.id === id) || C.mindmaps[0];
  MM_CUR = map;
  const groups = [...new Set(C.mindmaps.map(m => m.group))];
  view(`<div class="page-head"><div><h1>${L('思维导图', 'Mind maps')}</h1><p>${L('总览 → 专题 → 每个项目。回忆模式会遮住文字，适合面试前自测。',
    'Overview → topics → each project. Recall mode hides the labels so you can test yourself before an interview.')}</p></div></div>
    ${groups.map(g => `<div class="row" style="margin-bottom:6px"><b class="small" style="min-width:64px">${esc(pick(g, GROUP_EN[g]))}</b>${C.mindmaps.filter(m => m.group === g).map(m => `<a class="btn sm ${m.id === map.id ? '' : 'ghost'}" href="#/maps/${m.id}">${esc(pick(m.title, m.title_en))}</a>`).join('')}</div>`).join('')}
    <h2>${biLabel(map.title, map.title_en)}</h2><div id="mm-host">${mmHtml(map)}</div>`);
};
function mmRefresh(mapId) {
  const map = C.mindmaps.find(m => m.id === mapId);
  const host = $(`.mm-wrap[data-map="${mapId}"]`).parentElement;
  host.innerHTML = mmHtml(map);
}
ACT.mm = el => {
  const wrap = el.closest('.mm-wrap'), mapId = wrap.dataset.map, st = MMS[mapId], p = el.dataset.arg;
  if (st.hide && el.classList.contains('hide-text')) { st.shown.add(p); el.classList.remove('hide-text'); return; }
  if (!el.classList.contains('kids')) return;
  st.closed.has(p) ? st.closed.delete(p) : st.closed.add(p);
  mmRefresh(mapId);
};
ACT['mm-all'] = el => {
  const [mapId, mode] = el.dataset.arg.split('|'), st = MMS[mapId], map = C.mindmaps.find(m => m.id === mapId);
  if (mode === 'hide') { st.hide = !st.hide; st.shown = new Set(); if (st.hide) st.closed = new Set(mmPaths(map.root).filter(([, d]) => d >= 1).map(([p]) => p)); }
  else if (mode === 'open') st.closed = new Set();
  else st.closed = new Set(mmPaths(map.root).filter(([, d]) => d >= +mode).map(([p]) => p));
  mmRefresh(mapId);
};

// ---------- projects ----------
const SVG_CACHE = {};
let PROJ_CUR = null;
ROUTES.projects = (id, tab = 'overview') => {
  const p = C.projects.find(x => x.id === id);
  const en = S.lang === 'en';
  const stack = p => (en ? p.stack_en : null) || p.stack || [];
  if (!p) {
    PROJ_CUR = null;
    view(`<div class="page-head"><div><h1>${L('我的项目', 'My projects')}</h1><p>${L('每个项目：一句话、关键数字、架构图、讲稿（中英）、复现结论、风险口径、相关追问。',
      'For each project: a one-liner, key numbers, architecture diagrams, scripts (Chinese and English), reproduction findings, risk notes and follow-up questions.')}</p></div></div>
      <div class="grid wide">${C.projects.map(p => `<a class="tile" href="#/projects/${p.id}"><div class="row"><b>${biLabel(p.name, p.name_en)}</b><span class="spacer"></span><span class="ev ${evCls(p.evidence)}">${evLabel(p.evidence)}</span></div>
        <div class="small muted">${biLabel(p.org, p.org_en)}</div><p class="small">${biInline(p.one_liner, p.one_liner_en)}</p><div>${stack(p).slice(0, 4).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div></a>`).join('')}</div>
      <div class="card" style="margin-top:16px"><h3>${L('证据等级说明', 'Evidence levels')}</h3>${biMd(`- **代码实证**：GitHub 上有代码，面试官可能现场打开，每个数字都要能对上。
- **本地实证**：代码没公开，但你本地的 notebook 能核对；讲稿只用文件里能找到的内容。
- **建议口径**：没有公开代码，讲稿按简历重建，参数要换成你自己的真实数字。
- **论文**：以论文里的设定和结果为准。`, `- **Code-verified**: the code is on GitHub and the interviewer may open it on the spot, so every number has to match.
- **Verified locally**: the code isn't public, but your local notebooks can be checked; the script uses only what's in those files.
- **Suggested framing**: no public code; the script was rebuilt from the résumé, so swap in your own real numbers.
- **Paper**: go by the setup and results in the paper.`)}</div>`);
    return;
  }
  PROJ_CUR = p;
  const qs = projQuestions(p);
  const rv = revised(p.id);
  const T = [['overview', L('概览', 'Overview')], ['diagram', L('架构图', 'Architecture')], ['script', L('讲稿', 'Script')],
    ['map', L('思维导图', 'Mind map')], ['qs', `${L('相关追问', 'Follow-ups')} (${qs.length})`], ...(C.script.length ? [['original', L('原稿（Word）', 'Original (Word)')]] : [])];
  let body = '';
  if (tab === 'overview') {
    body = `<div class="card"><h3>${L('关键数字', 'Key numbers')}</h3><div class="nums">${(p.numbers || []).map(n => `<div class="num"><div class="v">${biInline(n.v, n.v_en)}</div><div class="k">${biInline(n.k, n.k_en)}</div></div>`).join('')}</div></div>
      <div class="dash"><div class="card"><h3>${p.course_title ? biLabel(p.course_title, p.course_title_en) : L('核实结论', 'Verified findings')}</h3><ul>${(p.course || []).map((x, i) => `<li>${biInline(x, (p.course_en || [])[i])}</li>`).join('')}</ul></div>
      <div class="card"><h3>${L('风险提示：这样说才对', 'Risk notes: how to say it right')}</h3><ul class="risk">${(p.risks || []).map((x, i) => `<li>${biInline(x, (p.risks_en || [])[i])}</li>`).join('')}</ul></div></div>
      <div class="card"><h3>${L('技术栈', 'Tech stack')}</h3>${stack(p).map(s => `<span class="chip brand">${esc(s)}</span>`).join('')}</div>`;
  } else if (tab === 'diagram') {
    body = (p.diagrams || []).length ? p.diagrams.map((d, i) => `<div class="card"><h3>${biLabel(d.title, d.title_en)}</h3><p class="small muted">${L('点击任意模块，AI 会结合项目资料讲解这一步。', 'Click any box and the AI explains that step using your project materials.')}</p><div class="diagram" id="dg${i}"><span class="spin"></span></div></div>`).join('')
      : `<div class="card"><p class="muted">${L('这个项目没有课程里画的架构图，可以看“思维导图”页签，或在讲稿里看阶段表。', 'No course diagram for this project; see the Mind map tab, or the stage table in the script.')}</p></div>`;
  } else if (tab === 'script' && rv) {
    body = `<p class="small muted">${L('讲稿跟随右上角的 中 / EN / 双语 切换。', 'The script follows the 中 / EN / 双语 switch at the top.')}</p>${revisedHtml(rv)}`;
  } else if (tab === 'script' || tab === 'original') {
    const zh = blocksHtml(projScript(p)), en = blocksHtml(projScriptEn(p));
    body = !zh && !en ? `<div class="card"><p class="muted">${L('Word 面试稿里没有这一节。', 'The Word script has no section for this project.')}</p></div>`
      : `${zh ? `<div class="card"><div class="lang-h">中文原稿</div>${zh}</div>` : ''}${en ? `<div class="card"><div class="lang-h">English original</div>${en}</div>` : ''}`;
  } else if (tab === 'map') {
    const map = C.mindmaps.find(m => m.id === p.mindmap);
    body = map ? `<div>${mmHtml(map)}</div>` : `<p class="muted">${L('没有思维导图。', 'No mind map.')}</p>`;
  } else if (tab === 'qs') {
    body = qs.map(q => qCard(q)).join('') || `<p class="muted">${L('题库里还没有这个项目的专门追问，可以用 AI 项目深挖来练。', 'The bank has no follow-ups for this project yet; practise with the AI deep-dive.')}</p>`;
  }
  view(`<div class="page-head"><div><a class="small" href="#/projects">${L('← 全部项目', '← All projects')}</a><h1>${biLabel(p.name, p.name_en)}</h1><p>${biLabel(p.org, p.org_en)} · <span class="ev ${evCls(p.evidence)}">${evLabel(p.evidence)}</span>${p.repo ? ` · <a href="${esc(p.repo)}" target="_blank" rel="noopener">${esc(p.repo.replace('https://github.com/', 'GitHub: '))}</a>` : ''}</p></div>
    <span class="spacer"></span><a class="btn" href="#/interview/${p.id}">${L('🤖 AI 深挖这个项目', '🤖 AI deep-dive')}</a><a class="btn ghost" href="#/mock/pitch">${L('⏱ Pitch 练习', '⏱ Pitch practice')}</a></div>
    <div class="card"><b>${L('一句话：', 'In one line: ')}</b>${biInline(p.one_liner, p.one_liner_en)}</div>
    <div class="tabs">${T.map(([k, n]) => `<a href="#/projects/${p.id}/${k}" class="${k === tab ? 'on' : ''}">${n}</a>`).join('')}</div>${body}`);
  if (tab === 'diagram') (p.diagrams || []).forEach(async (d, i) => {
    const host = $('#dg' + i);
    try {
      SVG_CACHE[d.file] = SVG_CACHE[d.file] || await (await fetch('diagrams/' + d.file)).text();
      if (host) host.innerHTML = SVG_CACHE[d.file];
    } catch (e) { if (host) host.textContent = '图加载失败：' + e.message; }
  });
};

// passages from the bank and knowledge base that mention the identifiers in a question (e.g. analysis_ready, Send)
const STOP = new Set('what why how does the and for with into then from this that each explain work node nodes after before only keep'.split(' '));
function relatedFacts(text, limit = 4) {
  const words = [...new Set((text.match(/[A-Za-z_][A-Za-z_+]{2,}/g) || []).map(w => w.toLowerCase()).filter(w => !STOP.has(w)))];
  if (!words.length) return '';
  const docs = [...C.questions.map(q => ({ t: `${q.code} ${q.title}`, b: q.zh })),
    ...C.knowledge.flatMap(m => m.sections.map(s => ({ t: `${m.title} · ${s.h}`, b: s.md })))];
  const scored = docs.map(d => {
    const low = (d.t + ' ' + d.b).toLowerCase();
    return { d, s: words.reduce((a, w) => a + (low.includes(w) ? (w.includes('_') ? 3 : 1) : 0), 0) };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, limit);
  return scored.map(({ d }) => `【${d.t}】\n${d.b.slice(0, 1400)}`).join('\n\n');
}

// SVG nodes call sendPrompt(text): explain that step with the project's facts
window.sendPrompt = async text => {
  const p = PROJ_CUR;
  $('#drawer').classList.remove('hidden');
  $('#drawer-title').textContent = p ? `AI 讲解 · ${p.name}` : 'AI 讲解';
  const bodyEl = $('#drawer-body');
  bodyEl.innerHTML = `<p><b>${esc(text)}</b></p><p class="muted"><span class="spin"></span> 正在结合项目资料讲解…</p>`;
  if (!AI.ai) { bodyEl.innerHTML = `<p><b>${esc(text)}</b></p><p class="muted">AI 未配置：在 coach.json 指定的 env 文件里设置 LLM_API_KEY 和 LLM_MODEL_ID。</p>`; return; }
  try {
    const facts = relatedFacts(text);
    const context = (p ? projContext(p) : '') + (facts ? '\n\n题库与知识库里的相关段落（优先依据这些）：\n' + facts : '');
    const r = await api('/api/explain', { question: text, context, lang: S.lang === 'en' ? 'en' : 'zh' });
    bodyEl.innerHTML = `<p><b>${esc(text)}</b></p>${md(r.answer)}`;
  } catch (e) { bodyEl.innerHTML = `<p><b>${esc(text)}</b></p><p class="err">失败：${esc(e.message)}</p>`; }
};
ACT['drawer-close'] = () => $('#drawer').classList.add('hidden');

// ---------- question bank ----------
const BF = { bank: 'all', status: 'all', tag: 'all', q: '' };
ROUTES.bank = sec => {
  const secs = sections();
  const cur = secs.includes(sec) ? sec : 'all';
  const qs = C.questions.filter(q => (cur === 'all' || q.section === cur) && (BF.bank === 'all' || q.bank === BF.bank) &&
    (BF.tag === 'all' || q.tags.includes(BF.tag)) &&
    (BF.status === 'all' || (BF.status === 'new' ? !S.status[q.id] : S.status[q.id] === BF.status)) &&
    (!BF.q || [q.title, q.title_en, q.zh, q.en, q.code].join(' ').toLowerCase().includes(BF.q.toLowerCase())));
  view(`<div class="page-head"><div><h1>题库</h1><p>通用题 ${C.questions.filter(q => q.bank === 'general').length} 道 + 项目追问 ${C.questions.filter(q => q.bank === 'project').length} 道，中英双语参考答案。</p></div></div>
    <div class="filters">
      <select data-chg="bf-sec"><option value="all">全部分类</option>${secs.map(s => `<option value="${esc(s)}" ${s === cur ? 'selected' : ''}>${esc(secShort(s))}（${C.questions.filter(q => q.section === s).length}）</option>`).join('')}</select>
      <select data-chg="bf" data-k="bank"><option value="all">全部来源</option><option value="general" ${BF.bank === 'general' ? 'selected' : ''}>通用题库</option><option value="project" ${BF.bank === 'project' ? 'selected' : ''}>项目追问</option></select>
      <select data-chg="bf" data-k="tag"><option value="all">全部标签</option>${tags().map(t => `<option ${BF.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select data-chg="bf" data-k="status"><option value="all">全部状态</option><option value="new" ${BF.status === 'new' ? 'selected' : ''}>未标记</option><option value="review" ${BF.status === 'review' ? 'selected' : ''}>再练</option><option value="mastered" ${BF.status === 'mastered' ? 'selected' : ''}>已掌握</option></select>
      <input type="text" placeholder="筛选关键词" value="${esc(BF.q)}" data-chg="bf" data-k="q" style="width:180px">
      <span class="muted small">${qs.length} 道</span><span class="spacer"></span>
      <button class="btn sm ghost" data-act="bank-open">全部展开</button><button class="btn sm" data-act="bank-mock">🎤 用这些题模拟</button>
    </div>
    <div id="bank-list">${qs.map(q => qCard(q, false, BF.q)).join('') || '<p class="empty">没有匹配的题目</p>'}</div>`);
  ROUTES.bank.cur = qs;
};
CHG['bf-sec'] = el => go('#/bank/' + (el.value === 'all' ? '' : encodeURIComponent(el.value)));
CHG.bf = el => { BF[el.dataset.k] = el.value; route(); };
ACT['bank-open'] = () => $$('#bank-list details').forEach(d => { d.open = true; });
ACT['bank-mock'] = () => { const ids = (ROUTES.bank.cur || []).map(q => q.id); if (!ids.length) return; MOCK = null; startMock({ ids: shuffle(ids).slice(0, 10), n: Math.min(10, ids.length), secs: 120, ai: AI.ai, lang: S.lang === 'en' ? 'en' : 'zh' }); };
ACT['mock-one'] = el => { MOCK = null; startMock({ ids: [el.dataset.arg], n: 1, secs: 120, ai: AI.ai, lang: S.lang === 'en' ? 'en' : 'zh' }); };

ROUTES.q = id => {
  const q = qById(id);
  if (!q) return view('<p class="empty">题目不存在</p>');
  const hist = S.history.filter(h => h.kind === 'mock').flatMap(h => h.items.filter(it => it.id === id).map(it => ({ ...it, t: h.t })));
  view(`<a class="small" href="#/bank/${encodeURIComponent(q.section)}">← ${esc(secShort(q.section))}</a>
    <div class="card" style="margin-top:8px"><div class="row"><span class="chip brand">${esc(q.code)}</span>${q.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}<span class="spacer"></span><span class="row">${statusBtns(q)}</span></div>
      <h2>${inline(q.title)}</h2>${q.title_en ? `<p class="muted">${inline(q.title_en)}</p>` : ''}</div>
    <div class="card">${qAnswer(q)}</div>
    <div class="card"><h3>我的版本 / 笔记</h3><p class="small muted">用自己的话把答案写一遍，面试时更顺口。自动保存。</p><textarea data-chg="note" data-arg="${q.id}" placeholder="写下你的回答要点、项目例子、数字口径…">${esc(S.notes[q.id] || '')}</textarea></div>
    <div class="card"><div class="row"><h3 style="margin:0">练习记录</h3><span class="spacer"></span><button class="btn" data-act="mock-one" data-arg="${q.id}">🎤 现在练这题</button></div>
      ${hist.length ? `<ul>${hist.map(h => `<li>${fmtDate(h.t)} · ${h.score != null ? `<b>${h.score}</b> 分` : '未评分'}</li>`).join('')}</ul>` : '<p class="muted">还没练过。</p>'}</div>`);
};
CHG.note = el => { S.notes[el.dataset.arg] = el.value; save(); toast('笔记已保存'); };

// ---------- flashcards (Leitner) ----------
const BOX_DAYS = [0, 1, 2, 4, 8, 16];
let FC = null;
ROUTES.cards = () => {
  if (!FC) {
    const now = Date.now();
    const due = C.questions.filter(q => S.leitner[q.id] && S.leitner[q.id].due <= now).length;
    const boxes = [1, 2, 3, 4, 5].map(b => C.questions.filter(q => S.leitner[q.id] && S.leitner[q.id].box === b).length);
    view(`<div class="page-head"><div><h1>闪卡复习</h1><p>Leitner 间隔重复：记得 → 升一箱、间隔变长（1/2/4/8/16 天）；忘了 → 回到第 1 箱、本轮再出现。</p></div></div>
      <div class="grid">${boxes.map((n, i) => `<div class="tile"><div class="v">${n}</div><div class="k">第 ${i + 1} 箱 · ${BOX_DAYS[i + 1]} 天</div></div>`).join('')}<div class="tile"><div class="v">${due}</div><div class="k">今日到期</div></div></div>
      <div class="card" style="margin-top:14px"><h3>开始一轮</h3><div class="row">
        <select id="fc-deck"><option value="all">全部题目</option><option value="general">通用题库</option><option value="project">项目追问</option><option value="review">我的“再练”</option>
          ${tags().map(t => `<option value="tag:${esc(t)}">标签：${esc(t)}</option>`).join('')}${sections().map(s => `<option value="sec:${esc(s)}">${esc(secShort(s))}</option>`).join('')}</select>
        <label class="row small">新卡上限 <input type="number" id="fc-new" value="15" min="0" max="100" style="width:70px"></label>
        <button class="btn" data-act="fc-start">开始</button></div>
        <p class="small muted">快捷键：<span class="kbd">空格</span> 翻面，<span class="kbd">1</span> 忘了，<span class="kbd">2</span> 模糊，<span class="kbd">3</span> 记得。</p></div>`);
    return;
  }
  const q = qById(FC.queue[FC.i]);
  if (!q) {
    S.history.push({ t: Date.now(), kind: 'cards', n: FC.done }); save();
    const r = FC.rated;
    view(`<div class="flash card"><h2>本轮完成 🎉</h2><p>共 ${FC.done} 次作答：记得 ${r[3]} · 模糊 ${r[2]} · 忘了 ${r[1]}。</p><div class="row"><button class="btn" data-act="fc-exit">返回</button></div></div>`);
    FC = null; return;
  }
  const box = (S.leitner[q.id] || {}).box || 0;
  view(`<div class="flash"><div class="row small muted" style="margin-bottom:8px"><span>${FC.i + 1} / ${FC.queue.length}</span><span class="chip">${esc(secShort(q.section))}</span><span class="chip">${box ? `第 ${box} 箱` : '新卡'}</span><span class="spacer"></span><button class="btn sm ghost" data-act="fc-exit">结束本轮</button></div>
    <div class="card face"><div class="qtext">${qTitle(q)}</div>
      ${FC.flip ? `<hr>${qAnswer(q)}` : '<p class="muted" style="margin-top:40px">先在脑子里（或小声）回答，再翻面对照。</p>'}</div>
    <div class="row end">${FC.flip ? `<button class="btn bad" data-act="fc-rate" data-arg="1">忘了 (1)</button><button class="btn mid" data-act="fc-rate" data-arg="2">模糊 (2)</button><button class="btn good" data-act="fc-rate" data-arg="3">记得 (3)</button>`
      : `<button class="btn" data-act="fc-flip">翻面 (空格)</button>`}</div></div>`);
};
ACT['fc-start'] = () => {
  const deck = $('#fc-deck').value, newMax = +$('#fc-new').value || 0, now = Date.now();
  let pool = C.questions;
  if (deck === 'general' || deck === 'project') pool = pool.filter(q => q.bank === deck);
  else if (deck === 'review') pool = pool.filter(q => S.status[q.id] === 'review');
  else if (deck.startsWith('tag:')) pool = pool.filter(q => q.tags.includes(deck.slice(4)));
  else if (deck.startsWith('sec:')) pool = pool.filter(q => q.section === deck.slice(4));
  const due = pool.filter(q => S.leitner[q.id] && S.leitner[q.id].due <= now);
  const fresh = shuffle(pool.filter(q => !S.leitner[q.id])).slice(0, newMax);
  const queue = shuffle([...due, ...fresh]).map(q => q.id);
  if (!queue.length) return toast('这个范围今天没有到期的卡片，换一个范围或调高新卡上限');
  FC = { queue, i: 0, flip: false, done: 0, rated: { 1: 0, 2: 0, 3: 0 }, again: {} };
  route();
};
ACT['fc-flip'] = () => { if (FC) { FC.flip = true; route(); } };
ACT['fc-exit'] = () => { if (FC && FC.done) { S.history.push({ t: Date.now(), kind: 'cards', n: FC.done }); save(); } FC = null; route(); };
ACT['fc-rate'] = el => {
  const rate = +el.dataset.arg, id = FC.queue[FC.i], now = Date.now();
  const r = S.leitner[id] || { box: 0, due: now, n: 0 };
  if (rate === 1) { r.box = 1; r.due = now; if ((FC.again[id] = (FC.again[id] || 0) + 1) <= 2) FC.queue.push(id); }
  else if (rate === 2) { r.box = Math.max(1, r.box); r.due = now + DAY; }
  else { r.box = Math.min(5, r.box + 1); r.due = now + BOX_DAYS[r.box] * DAY; if (r.box >= 5 && !S.status[id]) S.status[id] = 'mastered'; }
  r.n = (r.n || 0) + 1; S.leitner[id] = r;
  if (rate === 1 && !S.status[id]) S.status[id] = 'review';
  save();
  FC.rated[rate]++; FC.done++; FC.i++; FC.flip = false; route();
};
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
  if (e.key === 'Escape') $('#drawer').classList.add('hidden');
  if (!FC || !location.hash.startsWith('#/cards')) return;
  if (e.key === ' ') { e.preventDefault(); if (!FC.flip) ACT['fc-flip'](); }
  else if (FC.flip && ['1', '2', '3'].includes(e.key)) ACT['fc-rate']({ dataset: { arg: e.key } });
});

// ---------- mock interview ----------
let MOCK = null, PITCH = null, REC = null;
function startMock(cfg) {
  let ids = cfg.ids;
  if (!ids) {
    let pool = C.questions;
    if (cfg.pool === 'general' || cfg.pool === 'project') pool = pool.filter(q => q.bank === cfg.pool);
    else if (cfg.pool === 'review') pool = pool.filter(q => S.status[q.id] === 'review');
    else if (cfg.pool === 'unmastered') pool = pool.filter(q => S.status[q.id] !== 'mastered');
    else if (cfg.pool && cfg.pool.startsWith('sec:')) pool = pool.filter(q => q.section === cfg.pool.slice(4));
    else if (cfg.pool && cfg.pool.startsWith('tag:')) pool = pool.filter(q => q.tags.includes(cfg.pool.slice(4)));
    ids = shuffle(pool.map(q => q.id)).slice(0, cfg.n);
  }
  if (!ids.length) return toast('这个范围里没有题目');
  MOCK = { cfg, ids, i: 0, results: [], phase: 'answer', start: Date.now(), grade: null, follow: null, draft: '' };
  go('#/mock');
}
function micBtn(target) { return SR ? `<button class="btn ghost" data-act="mic" data-arg="${target}">🎤 语音输入</button>` : ''; }
ACT.mic = el => {
  if (REC) { REC.stop(); return; }
  const ta = $(el.dataset.arg); if (!ta) return;
  try {
    REC = new SR();
    REC.lang = (MOCK && MOCK.cfg.lang === 'en') || (PITCH && PITCH.lang === 'en') || (IV && IV.lang === 'en') ? 'en-US' : 'zh-CN';
    REC.continuous = true; REC.interimResults = true;
    let base = ta.value;
    REC.onresult = e => { let fin = '', tmp = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; e.results[i].isFinal ? fin += t : tmp += t; } base += fin; ta.value = base + tmp; ta.dispatchEvent(new Event('input')); };
    REC.onerror = e => toast('语音识别出错：' + e.error);
    REC.onend = () => { REC = null; el.classList.remove('on'); el.textContent = '🎤 语音输入'; ta.value = base; ta.dispatchEvent(new Event('input')); };
    REC.start(); el.classList.add('on'); el.textContent = '⏹ 停止录音';
  } catch (e) { REC = null; toast('语音识别不可用：' + e.message); }
};
ROUTES.mock = mode => {
  if (REC) REC.stop();
  if (mode === 'pitch') return viewPitch();
  if (!MOCK) {
    const last = [...S.history].reverse().filter(h => h.kind === 'mock').slice(0, 8);
    view(`<div class="page-head"><div><h1>模拟面试</h1><p>限时作答 → AI 面试官按参考答案评分、指出漏点和事实错误 → 回答追问。</p></div><span class="spacer"></span><a class="btn ghost" href="#/mock/pitch">⏱ Pitch 计时练习</a></div>
      <div class="card"><h3>设置</h3><div class="row">
        <label>题目范围 <select id="mk-pool"><option value="all">全部</option><option value="general">通用题库</option><option value="project">项目追问</option><option value="unmastered">未掌握的</option><option value="review">我的“再练”</option>
          ${sections().map(s => `<option value="sec:${esc(s)}">${esc(secShort(s))}</option>`).join('')}${tags().map(t => `<option value="tag:${esc(t)}">标签：${esc(t)}</option>`).join('')}</select></label>
        <label>题数 <select id="mk-n"><option>3</option><option selected>5</option><option>8</option><option>10</option><option>15</option></select></label>
        <label>每题限时 <select id="mk-secs"><option value="0">不限时</option><option value="60">60 秒</option><option value="120" selected>2 分钟</option><option value="180">3 分钟</option></select></label>
        <label>作答语言 <select id="mk-lang"><option value="zh" ${S.lang !== 'en' ? 'selected' : ''}>中文</option><option value="en" ${S.lang === 'en' ? 'selected' : ''}>English</option></select></label>
        <label class="row"><input type="checkbox" id="mk-ai" ${AI.ai ? 'checked' : 'disabled'}> AI 评分${AI.ai ? '' : '（未配置）'}</label>
        <button class="btn" data-act="mock-start">开始</button></div>
        <p class="small muted">提示：可以点“语音输入”口述回答（Edge / Chrome 支持），更接近真实面试。低于 6 分的题会自动加入“再练”。</p></div>
      <div class="card"><h3>最近几轮</h3>${last.length ? `<div class="tbl"><table><tr><th>时间</th><th>题数</th><th>平均分</th><th>题目</th></tr>${last.map(h => `<tr><td>${fmtDate(h.t)}</td><td>${h.n}</td><td><b>${h.avg.toFixed(1)}</b></td><td class="small">${h.items.map(it => { const q = qById(it.id); return q ? `<a href="#/q/${encodeURIComponent(q.id)}">${esc(q.code)}</a>${it.score != null ? `(${it.score})` : ''}` : ''; }).join(' · ')}</td></tr>`).join('')}</table></div>` : '<p class="muted">还没有记录。</p>'}</div>`);
    return;
  }
  if (MOCK.phase === 'done') return viewMockDone();
  const q = qById(MOCK.ids[MOCK.i]);
  const lang = MOCK.cfg.lang;
  const head = `<div class="row" style="margin-bottom:10px"><b>第 ${MOCK.i + 1} / ${MOCK.ids.length} 题</b><span class="chip">${esc(secShort(q.section))}</span><span class="chip brand">${esc(q.code)}</span><span class="spacer"></span>
    ${MOCK.phase === 'answer' && MOCK.cfg.secs ? `<span class="timer" id="mk-timer">${fmtTime(MOCK.cfg.secs)}</span>` : ''}<button class="btn sm ghost" data-act="mock-quit">结束</button></div>`;
  const qhtml = `<div class="card"><div class="qtext" style="font-size:1.18rem;font-weight:600">${qTitle(q, S.lang === 'both' ? 'both' : lang)}</div></div>`;
  if (MOCK.phase === 'answer') {
    view(head + qhtml + `<div class="card"><textarea id="mk-ans" placeholder="${lang === 'en' ? 'Answer as you would out loud: conclusion first, then mechanism, trade-offs and your own example.' : '像面试时一样回答：先结论，再机制、取舍和你自己的例子（带数字和口径）。'}">${esc(MOCK.draft)}</textarea>
      <div class="row" style="margin-top:10px">${micBtn('#mk-ans')}<span class="spacer"></span><button class="btn ghost" data-act="mock-skip">跳过</button><button class="btn ghost" data-act="mock-giveup">不会，看答案</button>
      <button class="btn" data-act="mock-submit">${MOCK.cfg.ai ? '提交，AI 评分' : '提交，看参考答案'}</button></div></div>`);
    const ta = $('#mk-ans'); ta.focus(); ta.addEventListener('input', () => { MOCK.draft = ta.value; });
    if (MOCK.cfg.secs) {
      MOCK.qStart = MOCK.qStart || Date.now();
      const tick = () => { const el = $('#mk-timer'); if (!el) return; const left = MOCK.cfg.secs - Math.floor((Date.now() - MOCK.qStart) / 1000); el.textContent = (left < 0 ? '超时 +' : '') + fmtTime(left); el.classList.toggle('over', left < 0); };
      tick(); const h = setInterval(tick, 500); cleanups.push(() => clearInterval(h));
    }
    return;
  }
  // review phase
  const res = MOCK.results[MOCK.i] || {};
  const g = MOCK.grade;
  const gradeHtml = g === 'loading' ? '<div class="card"><span class="spin"></span> AI 面试官正在评分…</div>'
    : g && g.error ? `<div class="card"><p class="err">AI 评分失败：${esc(g.error)}</p>${selfRate()}</div>`
    : g ? feedbackHtml(g) : res.answer != null ? `<div class="card">${selfRate()}</div>` : '';
  const f = MOCK.follow;
  const followHtml = g && g.follow_up && !g.error ? `<div class="card"><h3>追问</h3><p><b>${inline(g.follow_up)}</b></p>
    ${f && f.grade && f.grade !== 'loading' ? (f.grade.error ? `<p class="err">${esc(f.grade.error)}</p>` : `<p class="muted small">你的回答：${esc(f.answer)}</p>${feedbackHtml(f.grade, true)}`)
      : f && f.grade === 'loading' ? '<p><span class="spin"></span> 评分中…</p>'
      : `<textarea id="mk-follow" style="min-height:100px" placeholder="回答追问（可选）"></textarea><div class="row" style="margin-top:8px">${micBtn('#mk-follow')}<span class="spacer"></span><button class="btn" data-act="mock-follow">提交追问回答</button></div>`}</div>` : '';
  view(head + qhtml + (res.answer ? `<div class="card"><h3>你的回答</h3><p style="white-space:pre-wrap">${esc(res.answer)}</p>${res.secs != null ? `<p class="small muted">用时 ${fmtTime(res.secs)}</p>` : ''}</div>` : '')
    + gradeHtml + followHtml
    + `<details class="card" ${g && !g.error && g !== 'loading' ? '' : 'open'}><summary><b>参考答案</b></summary>${qAnswer(q, S.lang === 'both' ? 'both' : lang)}</details>
    <div class="row end"><span class="row">${statusBtns(q)}</span><button class="btn" data-act="mock-next">${MOCK.i + 1 < MOCK.ids.length ? '下一题 →' : '完成，看总结'}</button></div>`);
};
function selfRate() {
  const cur = (MOCK.results[MOCK.i] || {}).score;
  return `<p>自评：</p><div class="row">${[[3, '没答出'], [6, '答了一部分'], [9, '答得好']].map(([s, t]) => `<button class="btn sm ${cur === s ? '' : 'ghost'}" data-act="mock-self" data-arg="${s}">${t}（${s}）</button>`).join('')}</div>`;
}
function feedbackHtml(g, compact = false) {
  const list = (a, cls) => (a || []).length ? `<ul class="fb-list ${cls}">${a.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : '<p class="muted small">无</p>';
  return `<div class="${compact ? '' : 'card '}fb"><div class="row"><div class="score ${scoreCls(g.score)}">${g.score ?? '?'}</div><div><b>${inline(g.verdict || '')}</b></div></div>
    <div class="grid wide" style="margin-top:6px"><div><h4 class="hit">✓ 答到的要点</h4>${list(g.hits, 'hit')}</div><div><h4 class="miss">△ 漏掉的要点</h4>${list(g.misses, 'miss')}</div></div>
    ${(g.errors || []).length ? `<h4 class="err">✗ 事实错误 / 夸大</h4>${list(g.errors, 'err')}` : ''}
    <h4>改进建议</h4><p>${inline(g.feedback || '')}</p>${(g.outline || []).length ? `<h4>更好的回答提纲</h4><ol>${g.outline.map(x => `<li>${inline(x)}</li>`).join('')}</ol>` : ''}</div>`;
}
ACT['mock-start'] = () => startMock({ pool: $('#mk-pool').value, n: +$('#mk-n').value, secs: +$('#mk-secs').value, lang: $('#mk-lang').value, ai: $('#mk-ai').checked });
ACT['mock-quit'] = () => { if (MOCK.results.some(r => r)) { MOCK.phase = 'done'; route(); } else { MOCK = null; route(); } };
function recordAnswer(answer) {
  const secs = MOCK.qStart ? Math.floor((Date.now() - MOCK.qStart) / 1000) : null;
  MOCK.results[MOCK.i] = { id: MOCK.ids[MOCK.i], answer, secs, score: null };
  MOCK.phase = 'review'; MOCK.grade = null; MOCK.follow = null; MOCK.draft = '';
}
ACT['mock-submit'] = async () => {
  const answer = $('#mk-ans').value.trim();
  if (!answer) return toast('先写点什么，或者点“不会，看答案”');
  if (REC) REC.stop();
  recordAnswer(answer);
  const q = qById(MOCK.ids[MOCK.i]), idx = MOCK.i, run = MOCK;
  if (!MOCK.cfg.ai) return route();
  MOCK.grade = 'loading'; route();
  try {
    const g = await api('/api/grade', { question: `${q.title}\n${q.title_en}`, reference_zh: q.zh, reference_en: q.en, answer, lang: MOCK.cfg.lang });
    g.score = Math.max(0, Math.min(10, Math.round(+g.score)));
    run.results[idx].score = g.score; run.results[idx].grade = g;
    if (run === MOCK && MOCK.i === idx) MOCK.grade = g;
  } catch (e) { if (run === MOCK && MOCK.i === idx) MOCK.grade = { error: e.message }; }
  if (location.hash.startsWith('#/mock') && run === MOCK && MOCK.i === idx) route();
};
ACT['mock-giveup'] = () => { recordAnswer(''); MOCK.results[MOCK.i].score = 0; MOCK.results[MOCK.i].gaveUp = true; route(); };
ACT['mock-skip'] = () => { MOCK.results[MOCK.i] = { id: MOCK.ids[MOCK.i], skipped: true, score: null }; nextQ(); };
ACT['mock-self'] = el => { MOCK.results[MOCK.i].score = +el.dataset.arg; route(); };
ACT['mock-follow'] = async () => {
  const answer = $('#mk-follow').value.trim(); if (!answer) return;
  if (REC) REC.stop();
  const q = qById(MOCK.ids[MOCK.i]), g = MOCK.grade, run = MOCK, idx = MOCK.i;
  MOCK.follow = { answer, grade: 'loading' }; route();
  try {
    const fg = await api('/api/grade', { question: g.follow_up, reference_zh: q.zh, reference_en: q.en, answer, lang: MOCK.cfg.lang, followup: true, original: q.title });
    run.results[idx].follow = { q: g.follow_up, score: fg.score };
    if (run === MOCK && MOCK.i === idx) MOCK.follow.grade = fg;
  } catch (e) { if (run === MOCK && MOCK.i === idx) MOCK.follow.grade = { error: e.message }; }
  if (location.hash.startsWith('#/mock') && run === MOCK && MOCK.i === idx) route();
};
ACT['mock-next'] = () => nextQ();
function nextQ() {
  const r = MOCK.results[MOCK.i];
  if (r && r.score != null && r.score < 6 && S.status[r.id] !== 'mastered') { S.status[r.id] = 'review'; save(); }
  MOCK.i++; MOCK.phase = 'answer'; MOCK.grade = null; MOCK.follow = null; MOCK.qStart = null; MOCK.draft = '';
  if (MOCK.i >= MOCK.ids.length) MOCK.phase = 'done';
  route();
}
function viewMockDone() {
  const rs = MOCK.results.filter(Boolean);
  const scored = rs.filter(r => r.score != null);
  const a = avg(scored.map(r => r.score));
  if (!MOCK.saved && scored.length) {
    S.history.push({ t: Date.now(), kind: 'mock', n: rs.length, avg: a, items: rs.map(r => ({ id: r.id, score: r.score, follow: r.follow ? r.follow.score : null })) });
    S.history = S.history.slice(-200); save(); MOCK.saved = true;
  }
  view(`<div class="page-head"><div><h1>本轮总结</h1><p>${rs.length} 题 · 已评分 ${scored.length} 题</p></div><span class="spacer"></span>${scored.length ? `<div class="score ${scoreCls(a)}">${a.toFixed(1)}</div>` : ''}</div>
    <div class="card"><div class="tbl"><table><tr><th>题目</th><th>得分</th><th>追问</th><th>用时</th><th>主要漏点</th></tr>${rs.map(r => { const q = qById(r.id); return `<tr><td><a href="#/q/${encodeURIComponent(q.id)}">${esc(q.code)}</a> ${inline(q.title)}</td>
      <td>${r.skipped ? '跳过' : r.score != null ? `<b>${r.score}</b>` : '—'}</td><td>${r.follow ? r.follow.score : '—'}</td><td>${r.secs != null ? fmtTime(r.secs) : '—'}</td>
      <td class="small">${r.grade ? (r.grade.misses || []).slice(0, 2).map(inline).join('；') : ''}</td></tr>`; }).join('')}</table></div>
    <p class="small muted">低于 6 分的题已加入“再练”，会出现在闪卡和模拟的“再练”范围里。</p></div>
    <div class="row"><button class="btn" data-act="mock-again">再来一轮</button><a class="btn ghost" href="#/bank">去题库</a></div>`);
}
ACT['mock-again'] = () => { MOCK = null; route(); };

// pitch practice
function viewPitch() {
  const list = pitches();
  if (!PITCH) {
    view(`<div class="page-head"><div><a class="small" href="#/mock">← 模拟面试</a><h1>Pitch 计时练习</h1><p>自我介绍和项目讲述：看不到稿子，按目标时长讲一遍，再对照原稿（可选 AI 点评）。</p></div></div>
      <div class="grid wide">${list.map(p => `<div class="tile"><div class="row"><b>${esc(p.title)}</b><span class="spacer"></span><span class="chip">${p.target}s</span><span class="chip">${p.lang === 'en' ? 'EN' : '中'}</span></div>
        <p class="small muted">${esc(p.text.replace(/[*#]/g, '').slice(0, 70))}…</p><button class="btn sm" data-act="pitch-start" data-arg="${p.id}">开始</button></div>`).join('')}</div>`);
    return;
  }
  const p = list.find(x => x.id === PITCH.id);
  if (PITCH.phase === 'run') {
    view(`<div class="page-head"><div><h1>${esc(p.title)}</h1><p>目标 ${p.target} 秒。不看稿，讲出来；可以用语音输入把内容记下来，结束后对照。</p></div><span class="spacer"></span><span class="timer" id="pt-timer">00:00</span></div>
      <div class="card"><textarea id="pt-ans" placeholder="（可选）语音输入或打字，结束后可让 AI 点评">${esc(PITCH.text || '')}</textarea>
      <div class="row" style="margin-top:10px">${micBtn('#pt-ans')}<span class="spacer"></span><button class="btn ghost" data-act="pitch-cancel">取消</button><button class="btn" data-act="pitch-stop">结束</button></div></div>`);
    $('#pt-ans').addEventListener('input', e => { PITCH.text = e.target.value; });
    const tick = () => { const el = $('#pt-timer'); if (!el) return; const s = Math.floor((Date.now() - PITCH.start) / 1000); el.textContent = fmtTime(s); el.classList.toggle('over', s > p.target * 1.25); };
    tick(); const h = setInterval(tick, 500); cleanups.push(() => clearInterval(h));
    return;
  }
  const diff = PITCH.secs - p.target;
  const g = PITCH.grade;
  view(`<div class="page-head"><div><h1>${esc(p.title)}</h1></div><span class="spacer"></span><span class="timer ${Math.abs(diff) > p.target * .25 ? 'over' : ''}">${fmtTime(PITCH.secs)}</span></div>
    <div class="card"><b>用时 ${PITCH.secs} 秒</b>，目标 ${p.target} 秒：${Math.abs(diff) <= p.target * .15 ? '节奏很好 👍' : diff > 0 ? `超了 ${diff} 秒，删掉次要细节，只留一个亮点和一个数字。` : `短了 ${-diff} 秒，补一个具体的数字或取舍。`}</div>
    ${PITCH.text ? `<div class="card"><h3>你讲的内容</h3><p style="white-space:pre-wrap">${esc(PITCH.text)}</p>
      ${g === 'loading' ? '<p><span class="spin"></span> AI 点评中…</p>' : g && g.error ? `<p class="err">${esc(g.error)}</p>` : g ? feedbackHtml(g, true) : AI.ai ? '<button class="btn" data-act="pitch-grade">AI 点评</button>' : ''}</div>` : ''}
    <div class="card"><h3>原稿</h3>${md(p.text)}</div>
    <div class="row"><button class="btn" data-act="pitch-start" data-arg="${p.id}">再讲一遍</button><button class="btn ghost" data-act="pitch-cancel">换一个</button></div>`);
}
ACT['pitch-start'] = el => { PITCH = { id: el.dataset.arg, phase: 'run', start: Date.now(), text: '' }; PITCH.lang = (pitches().find(x => x.id === PITCH.id) || {}).lang; go('#/mock/pitch'); };
ACT['pitch-cancel'] = () => { if (REC) REC.stop(); PITCH = null; route(); };
ACT['pitch-stop'] = () => {
  if (REC) REC.stop();
  PITCH.secs = Math.floor((Date.now() - PITCH.start) / 1000); PITCH.phase = 'result'; PITCH.text = ($('#pt-ans').value || '').trim();
  const p = pitches().find(x => x.id === PITCH.id);
  S.history.push({ t: Date.now(), kind: 'pitch', title: p.title, secs: PITCH.secs }); save();
  route();
};
ACT['pitch-grade'] = async () => {
  const p = pitches().find(x => x.id === PITCH.id), run = PITCH;
  PITCH.grade = 'loading'; route();
  try {
    run.grade = await api('/api/grade', { question: `请做「${p.title}」（目标 ${p.target} 秒，实际 ${run.secs} 秒）`, reference_zh: p.lang === 'en' ? '' : p.text, reference_en: p.lang === 'en' ? p.text : '', answer: run.text, lang: p.lang });
  } catch (e) { run.grade = { error: e.message }; }
  if (run === PITCH && location.hash.startsWith('#/mock/pitch')) route();
};

// ---------- AI project deep-dive ----------
let IV = null;
ROUTES.interview = pid => {
  if (REC) REC.stop();
  if (IV && ((pid && IV.pid !== pid) || (!pid && IV.readonly))) IV = null;   // in-progress rounds are already saved
  if (!IV) {
    const sel = pid || (leadProjects()[0] || C.projects[0] || {}).id;
    const past = [...S.interviews].reverse().slice(0, 10);
    view(`<div class="page-head"><div><h1>AI 项目深挖</h1><p>AI 面试官读了你的项目资料（代码核实结论 + 风险点），一次问一个问题，由浅入深追问，并指出和事实冲突的说法。</p></div></div>
      <div class="card"><div class="row"><label>项目 <select id="iv-p">${C.projects.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label>语言 <select id="iv-lang"><option value="zh">中文</option><option value="en" ${S.lang === 'en' ? 'selected' : ''}>English</option></select></label>
        <button class="btn" data-act="iv-start" ${AI.ai ? '' : 'disabled'}>开始面试</button>${AI.ai ? '' : '<span class="err small">AI 未配置</span>'}</div>
        <p class="small muted">建议每个主推项目做 2 轮，每轮 6–8 个问题，最后点“结束并总结”。</p></div>
      <div class="card"><h3>历史记录</h3>${past.length ? `<ul>${past.map((h, i) => `<li><a href="javascript:void 0" data-act="iv-view" data-arg="${S.interviews.length - 1 - i}">${fmtDate(h.t)} · ${esc(h.title)}</a> · ${h.msgs.filter(m => m.role === 'me').length} 轮${h.final ? ` · 总评 <b>${h.final.score}</b>` : ''}</li>`).join('')}</ul>` : '<p class="muted">还没有记录。</p>'}</div>`);
    return;
  }
  const p = C.projects.find(x => x.id === IV.pid);
  const msgs = IV.msgs.map(m => m.role === 'ai'
    ? `<div class="msg ai"><div class="meta">面试官${m.focus ? ` · 考察：${esc(m.focus)}` : ''}${m.score != null ? ` · 上一题 <b>${m.score}</b> 分` : ''}</div>${m.comment ? `<div class="cmt">${inline(m.comment)}</div>` : ''}<div>${inline(m.text)}</div></div>`
    : `<div class="msg me"><div class="meta">我</div><div style="white-space:pre-wrap">${esc(m.text)}</div></div>`).join('');
  const fin = IV.final;
  view(`<div class="page-head"><div><h1>深挖：${esc(p.name)}</h1><p>${IV.readonly ? '历史记录（只读）' : `第 ${IV.msgs.filter(m => m.role === 'me').length + 1} 个问题`}</p></div><span class="spacer"></span>
      ${IV.readonly ? '' : `<button class="btn ghost" data-act="iv-end" ${IV.busy || fin ? 'disabled' : ''}>结束并总结</button>`}<button class="btn ghost" data-act="iv-close">${IV.readonly || fin ? '返回' : '放弃'}</button></div>
    <div class="chat">${msgs}${IV.busy ? '<div class="msg ai"><span class="spin"></span> 面试官在想…</div>' : ''}</div>
    ${IV.error ? `<p class="err">出错：${esc(IV.error)} <button class="btn sm ghost" data-act="iv-retry">重试</button></p>` : ''}
    ${fin ? `<div class="card" style="margin-top:14px"><div class="row"><div class="score ${scoreCls(fin.score)}">${fin.score}</div><h3 style="margin:0">面试总结</h3></div><p>${inline(fin.summary || '')}</p>
      <div class="grid wide"><div><h4 class="hit">做得好的</h4><ul>${(fin.strengths || []).map(x => `<li>${inline(x)}</li>`).join('')}</ul></div><div><h4 class="miss">要改进的</h4><ul>${(fin.improve || []).map(x => `<li>${inline(x)}</li>`).join('')}</ul></div></div>
      ${(fin.facts_to_fix || []).length ? `<h4 class="err">需要改的说法</h4><ul>${fin.facts_to_fix.map(x => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
    ${!IV.readonly && !fin ? `<div class="card" style="margin-top:14px"><textarea id="iv-ans" style="min-height:110px" placeholder="回答面试官的问题（Ctrl+Enter 发送）" ${IV.busy ? 'disabled' : ''}>${esc(IV.draft || '')}</textarea>
      <div class="row" style="margin-top:8px">${micBtn('#iv-ans')}<span class="spacer"></span><button class="btn" data-act="iv-send" ${IV.busy ? 'disabled' : ''}>发送</button></div></div>` : ''}`);
  const ta = $('#iv-ans');
  if (ta) {
    ta.addEventListener('input', () => { IV.draft = ta.value; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) ACT['iv-send'](); });
    if (!IV.busy) ta.focus();
  }
  const last = $('#main .chat .msg:last-child'); if (last) last.scrollIntoView({ block: 'nearest' });
};
async function ivAsk(final = false) {
  const p = C.projects.find(x => x.id === IV.pid), run = IV;
  IV.busy = true; IV.error = null; route();
  try {
    const history = IV.msgs.map(m => ({ role: m.role, text: m.role === 'ai' ? `${m.comment ? '（点评）' + m.comment + '\n' : ''}${m.text}` : m.text }));
    const r = await api('/api/interview', { context: projContext(p), history, lang: IV.lang, final });
    if (final) run.final = { ...r, score: Math.round(+r.score) };
    else run.msgs.push({ role: 'ai', text: r.question, comment: r.comment || '', score: r.score == null ? null : Math.round(+r.score), focus: r.focus || '' });
    if (final || run.msgs.length > 1) saveInterview(run);
  } catch (e) { run.error = e.message; }
  run.busy = false;
  if (run === IV && location.hash.startsWith('#/interview')) route();
}
function saveInterview(run) {
  const p = C.projects.find(x => x.id === run.pid);
  const rec = { t: run.t, pid: run.pid, title: p.name, lang: run.lang, msgs: run.msgs, final: run.final || null };
  const i = S.interviews.findIndex(x => x.t === run.t);
  if (i >= 0) S.interviews[i] = rec; else S.interviews.push(rec);
  S.interviews = S.interviews.slice(-40);
  if (run.final && !run.histSaved) { S.history.push({ t: Date.now(), kind: 'interview', title: p.name, avg: run.final.score }); run.histSaved = true; }
  save();
}
ACT['iv-start'] = () => { IV = { pid: $('#iv-p').value, lang: $('#iv-lang').value, msgs: [], t: Date.now() }; go('#/interview/' + IV.pid); ivAsk(); };
ACT['iv-send'] = () => {
  const ta = $('#iv-ans'); if (!ta || IV.busy) return;
  const text = ta.value.trim(); if (!text) return;
  if (REC) REC.stop();
  IV.msgs.push({ role: 'me', text }); IV.draft = ''; ivAsk();
};
ACT['iv-retry'] = () => ivAsk(false);
ACT['iv-end'] = () => { if (IV.msgs.some(m => m.role === 'me')) ivAsk(true); else toast('至少回答一个问题再总结'); };
ACT['iv-close'] = () => { if (!IV.readonly && !IV.final && IV.msgs.some(m => m.role === 'me') && !confirm('放弃这一轮？对话已自动保存在历史记录里。')) return; IV = null; go('#/interview'); };
ACT['iv-view'] = el => { const h = S.interviews[+el.dataset.arg]; IV = { ...h, readonly: true }; go('#/interview/' + h.pid); };

// ---------- prep extras ----------
ROUTES.prep = id => {
  const items = [...C.extras, { id: 'pitches', title: '项目介绍模板（30 秒 / 2 分钟）', title_en: 'Project pitch templates (30 s / 2 min)', kind: 'notes' }];
  const cur = items.find(x => x.id === id) || items[0];
  let body;
  if (cur.kind === 'md') body = biMd(cur.md, cur.md_en);
  else if (cur.kind === 'checklist') body = cur.groups.map((g, gi) => `<h3>${biLabel(g.t, g.t_en)}</h3>${g.items.map((it, ii) => { const k = `${cur.id}:${gi}:${ii}`; return `<label class="check ${S.checks[k] ? 'done' : ''}"><input type="checkbox" data-chg="check" data-arg="${k}" ${S.checks[k] ? 'checked' : ''}><span>${biInline(it, (g.items_en || [])[ii])}</span></label>`; }).join('')}`).join('')
    + `<p><button class="btn sm ghost" data-act="check-clear">${L('清空勾选', 'Clear all ticks')}</button></p>`;
  else if (cur.kind === 'cards') body = cur.items.map(it => `<details class="q" open><summary><span class="ttl"><b>${biLabel(it.t, it.t_en)}</b></span></summary><div class="body" style="padding-left:16px">${biMd(it.b, it.b_en)}</div></details>`).join('');
  else if (cur.kind === 'list') body = `<ul>${cur.items.map((x, i) => `<li style="margin:6px 0">${biInline(x, (cur.items_en || [])[i])}</li>`).join('')}</ul>`;
  else if (cur.kind === 'table') body = `<input type="text" id="gl-q" placeholder="${L('筛选术语', 'Filter terms')}" style="margin-bottom:8px;width:240px"><div class="tbl"><table id="gl"><tr><th>English</th><th>中文</th><th>${L('说明', 'Description')}</th></tr>${
    cur.rows.map(r => `<tr><td>${inline(r[0])}</td><td>${inline(r[1])}</td><td>${biInline(r[2], r[3])}</td></tr>`).join('')}</table></div>`;
  else if (cur.kind === 'notes') body = C.notes.map(n => `<h3>${esc(n.title)}</h3>${md(n.body)}`).join('<hr>');
  view(`<div class="split"><div class="list-nav">${items.map(x => `<a href="#/prep/${x.id}" class="${x.id === cur.id ? 'on' : ''}">${esc(pick(x.title, x.title_en))}</a>`).join('')}</div>
    <div><h1>${biLabel(cur.title, cur.title_en)}</h1><div class="card">${body}</div></div></div>`);
  const gq = $('#gl-q');
  if (gq) gq.addEventListener('input', () => { const w = gq.value.toLowerCase(); $$('#gl tr').forEach((tr, i) => { if (i) tr.style.display = tr.textContent.toLowerCase().includes(w) ? '' : 'none'; }); });
};
CHG.check = el => { S.checks[el.dataset.arg] = el.checked; if (!el.checked) delete S.checks[el.dataset.arg]; save(); el.parentElement.classList.toggle('done', el.checked); };
ACT['check-clear'] = () => { for (const k of Object.keys(S.checks)) if (k.startsWith('checklist:')) delete S.checks[k]; save(); route(); };

// ---------- script ----------
ROUTES.script = id => {
  const units = C.revised || [];
  const rvCur = units.find(u => 'rv-' + u.id === id) || (!id || !C.script.some(s => s.id === id) ? units[0] : null);
  const cur = rvCur ? null : (C.script.find(s => s.id === id) || C.script[1] || C.script[0]);
  const nav = `<div class="list-nav">${units.length ? `<b class="small muted" style="padding:4px 10px">${L('修订版讲稿', 'Revised scripts')}</b>${units.map(u =>
    `<a href="#/script/rv-${u.id}" class="${rvCur && rvCur.id === u.id ? 'on' : ''}">${esc(pick(u.title, u.title_en))}</a>`).join('')}
    <b class="small muted" style="padding:10px 10px 4px">${L('原稿（Word）', 'Original (Word)')}</b>` : ''}${C.script.map(s => `<a href="#/script/${s.id}" class="${cur && s.id === cur.id ? 'on' : ''}">${esc(s.title)}</a>`).join('')}
</div>`;
  view(`<div class="split">${nav}<div>${rvCur ? `<h1>${biLabel(rvCur.title, rvCur.title_en)}</h1>${revisedHtml(rvCur)}`
    : `<h1>${esc(cur.title)}</h1><div class="card">${blocksHtml(cur.blocks)}</div>`}</div></div>`);
};

// ---------- files ----------
ROUTES.files = () => {
  const repos = C.projects.filter(p => p.repo);
  const links = C.meta.links || [];
  view(`<div class="page-head"><div><h1>${L('原始资料', 'Files')}</h1><p>${L('工作区 files/ 文件夹里的文件；改了讲稿或资料后，重启应用会自动重新生成内容。', 'Files from the workspace files/ folder; edit the workspace and restart the app to rebuild the content.')}</p></div></div>
    ${C.files.length ? `<div class="card"><div class="tbl"><table><tr><th>${L('文件', 'File')}</th><th>${L('说明', 'Notes')}</th><th>${L('大小', 'Size')}</th></tr>${C.files.map(f => `<tr><td><a href="/files/${encodeURIComponent(f.name)}" target="_blank">${esc(f.name)}</a></td>
      <td class="small">${esc(f.desc || '')}</td><td class="small muted">${(f.size / 1024).toFixed(0)} KB</td></tr>`).join('')}</table></div></div>` : `<div class="card"><p class="muted">${L('还没有文件：把简历、论文等放进工作区的 files/ 文件夹即可。', 'No files yet: put your résumé, papers and so on in the workspace files/ folder.')}</p></div>`}
    ${repos.length || links.length ? `<div class="card"><h3>${L('相关链接', 'Links')}</h3><ul>
      ${repos.map(p => `<li><a href="${esc(p.repo)}" target="_blank">${esc(p.repo.replace('https://github.com/', ''))}</a>：${esc(pick(p.name, p.name_en))}</li>`).join('')}
      ${links.map(l => `<li><a href="${esc(l.url)}" target="_blank">${esc(l.title)}</a>${l.desc ? '：' + esc(l.desc) : ''}</li>`).join('')}</ul></div>` : ''}`);
};

// ---------- search ----------
ROUTES.search = (w = '') => {
  w = w.trim();
  const lw = w.toLowerCase(), hit = s => String(s || '').toLowerCase().includes(lw);
  const snip = s => { s = String(s || '').replace(/[#*`|>]/g, ' ').replace(/\s+/g, ' '); const i = s.toLowerCase().indexOf(lw); return esc((i > 40 ? '…' : '') + s.slice(Math.max(0, i - 40), i + 80) + '…'); };
  const res = [];
  if (w) {
    for (const q of C.questions) if (hit(q.title) || hit(q.title_en) || hit(q.zh) || hit(q.en) || q.code.toLowerCase() === lw)
      res.push({ type: '题目', href: '#/q/' + encodeURIComponent(q.id), title: `${q.code} ${q.title}`, sn: snip(hit(q.zh) ? q.zh : q.en) });
    for (const m of C.knowledge) m.sections.forEach(s => {
      if (hit(s.h) || hit(s.md)) res.push({ type: '知识', href: '#/knowledge/' + m.id, title: `${m.title} · ${s.h}`, sn: snip(s.md) });
      else if (hit(s.h_en) || hit(s.md_en)) res.push({ type: '知识', href: '#/knowledge/' + m.id, title: `${m.en} · ${s.h_en}`, sn: snip(s.md_en) });
    });
    for (const p of C.projects) {
      const texts = [p.name, p.one_liner, ...(p.course || []), ...(p.risks || []), p.name_en, p.one_liner_en, ...(p.course_en || []), ...(p.risks_en || [])];
      const t = texts.find(hit);
      if (t) res.push({ type: '项目', href: '#/projects/' + p.id, title: p.name, sn: snip(t) });
    }
    for (const s of C.script) { const t = blocksText(s.blocks); if (hit(t)) res.push({ type: '面试稿', href: '#/script/' + s.id, title: s.title, sn: snip(t) }); }
    for (const e of C.extras) {
      const t = [e.md || JSON.stringify(e.items || e.rows || e.groups || ''), e.md_en || JSON.stringify(e.items_en || '')].find(hit);
      if (t) res.push({ type: '准备', href: '#/prep/' + e.id, title: e.title, sn: snip(t) });
    }
    const walk = (n, m) => { if (hit(n.t) || hit(n.t_en)) res.push({ type: '导图', href: '#/maps/' + m.id, title: `${m.title} · ${hit(n.t) ? n.t : n.t_en}`, sn: '' }); (n.c || []).forEach(k => walk(k, m)); };
    C.mindmaps.forEach(m => walk(m.root, m));
  }
  view(`<div class="page-head"><div><h1>搜索：${esc(w)}</h1><p>${res.length} 条结果</p></div></div>
    ${res.slice(0, 120).map(r => `<a class="card" style="display:block;color:inherit;text-decoration:none" href="${r.href}"><span class="chip brand">${r.type}</span> <b>${esc(r.title)}</b>${r.sn ? `<div class="small muted">${highlight('>' + r.sn + '<', w).slice(1, -1)}</div>` : ''}</a>`).join('') || '<p class="empty">没有结果</p>'}`);
};

// ---------- global wiring ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const f = ACT[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e); });
ACT.lang = el => { S.lang = el.dataset.arg; save(); paintTop(); route(); };
ACT.theme = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); paintTop(); };
function paintTop() {
  document.documentElement.dataset.theme = S.theme;
  $$('#lang button').forEach(b => b.classList.toggle('on', b.dataset.arg === S.lang));
}
$('#search').addEventListener('keydown', e => { if (e.key === 'Enter') go('#/search/' + encodeURIComponent(e.target.value)); });
window.addEventListener('hashchange', route);

(async function init() {
  paintTop();
  try {
    C = await (await fetch('/api/content')).json();
  } catch (e) { view(`<p class="empty">内容加载失败：${esc(e.message)}</p>`); return; }
  C.meta = C.meta || { title: 'Interview Coach', langs: ['zh', 'en'], lead: [] };
  document.title = C.meta.title; $('#brand-title').textContent = C.meta.title;
  const langs = C.meta.langs || ['zh', 'en'];
  if (!localStorage.getItem(KEY) || !langs.includes(S.lang) && S.lang !== 'both') { S.lang = langs[0]; save(); }
  if (langs.length < 2) { S.lang = langs[0]; $('#lang').style.display = 'none'; }
  paintTop();
  try { AI = await (await fetch('/api/health')).json(); } catch (e) { AI = { ok: false, ai: false }; }
  $('#ai-dot').className = 'dot ' + (AI.ai ? 'ok' : 'off');
  $('#ai-text').textContent = AI.ai ? `AI 已连接 · ${AI.model}` : 'AI 未配置';
  route();
})();
