# Domain packs

A pack supplies the general, role-level content: a knowledge base, a general question bank, topic mind maps and generic prep pages. The candidate's own content (scripts, project cards, project Q&A) always comes from the workspace. Packs live in `assets/packs/<name>/`.

## Available packs

| Pack | Use for | Contents |
|---|---|---|
| `agent-engineer` | AI Agent / LLM application / RAG / AI engineer roles | 12 knowledge modules, a 115-question bilingual bank (A–M, K+), 7 topic mind maps, 6 generic prep pages. Numbers labelled "参考实测" are reference measurements from a public tutorial, never the candidate's own results. |
| `none` | Anything else | No general content; the app shows only the candidate's material |

## Choosing

Pick `agent-engineer` when the target role or the JD mentions agents, LLMs, RAG, LangChain or LangGraph, prompt engineering or AI applications. Otherwise use `none`, and offer to build a pack if the candidate will interview for that role family repeatedly.

Set `focus_tags` in `coach.json` from the JD: the bank's tags that the JD stresses, such as `["RAG", "评测", "多Agent"]`. Without a JD, pick them from the target role and the résumé. The dashboard shows them as "practise first" links. Use the bank's tag names exactly; in the agent-engineer pack they are `RAG, 记忆, 上下文, 工具/MCP, 多Agent, LangGraph, LangChain, 评测, 安全, 性能成本, 训练, 系统设计`.

## Building a new pack

A pack folder holds:

| File | Format |
|---|---|
| `pack.json` | `{name, title, title_en, for_roles: [], contents, focus_tags: [], links: [{title, url, desc}]}` |
| `knowledge.json` | `[{id, title, en, summary, summary_en, match: {sec: ["A."], tag: ["RAG"]}, sections: [{h, h_en, md, md_en}]}]`. `match` links a module to bank sections (title prefixes) or tags for its "related questions" list |
| `questions.md` | The bank format from `data-formats.md`, with `## X. Section / English` headings and `### X1.` codes (single letters, or a letter plus "+") |
| `mindmaps.json` | `[{id, title, title_en, group: "总览" or "专题", root}]` |
| `extras.json` | Generic prep pages in the `extras.json` format |
| `icon.png` / `icon.ico` | Optional app icon |

Write general content only. Tie no answer to one person's projects; where an example helps, keep it generic and add "（面试时换成你自己项目里的例子）". Cite sources for questions collected from public question banks.
