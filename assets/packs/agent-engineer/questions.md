# Agent 开发面试题库（中英对照）

> 题目来自下面几个公开题库，答案结合了工程实践。标注“参考实测”的数字来自公开教程 [UCVC-AI-Lab-Agent](https://github.com/vacucity/UCVC-AI-Lab-Agent) 的真实运行，是参考数据，不是你的实验结果：面试时用你自己项目里的例子和数字。
> Questions come from the public sources below; answers combine engineering practice. Numbers labelled "reference measurement" come from real runs in the public [UCVC-AI-Lab-Agent](https://github.com/vacucity/UCVC-AI-Lab-Agent) tutorial: they are reference data, not your results. In an interview, use examples and numbers from your own projects.
## 题目来源 / Sources

| 来源 | 内容 | 可信度说明 |
|---|---|---|
| [Hello-Agents Extra01 面试问题总结](https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra01-面试问题总结.md) | 作者 2025 年秋招在国内大厂面试的真实题目：LLM、RAG、Agent、RLHF、评测 | 作者亲历 |
| [agent-interview-hub · 2026-10 练习题索引](https://github.com/Zchary1106/agent-interview-hub) | 156 道题，按公开面经主题改写，涉及字节、百度、美团、快手等 | 改写的练习题，**不是公司官方真题** |
| [ai-engineering-interview-questions](https://github.com/amitshekhariitbhu/ai-engineering-interview-questions) | 英文市场常见的 AI Engineer / Agent 题目 | 题目汇总 |
| agent-interview-hub · Anthropic 面经汇总 | 上下文工程、Agent 系统设计、提示注入 | 汇总，未逐条核实 |

纯 LLM 原理题（Transformer、RoPE、MoE）和 VLM 题不在本题库范围内。本题库只收录与 Agent 开发相关的题目。
Pure LLM theory (Transformer, RoPE, MoE) and VLM questions are out of scope; this bank covers Agent development.

**答题结构建议 / Answer structure：** 先给结论 → 讲机制 → 讲取舍 → 用你自己的实验或项目举例。
Conclusion → mechanism → trade-off → an example from your own work.

---

## A. Agent 基础与架构 / Agent fundamentals

### A1. 什么是 LLM Agent？由哪些组件构成？和普通的 LLM 调用有什么区别？
**Q:** What is an LLM agent, what are its components, and how does it differ from a plain LLM call?

**答：** Agent 是"LLM 在循环里根据观察决定下一步动作"的系统。它由以下几部分组成：
- 模型：负责推理和决策；
- 工具：执行动作、获取信息；
- 记忆和状态：短期上下文加长期存储；
- 规划和控制循环：决定下一步、判断何时停止；
- 护栏和评测。

和单次调用的区别在于：Agent 会根据工具返回的结果调整行为，有状态，有终止条件，而且会产生副作用。所以重点在运行时工程：工具契约、上下文、重试、持久化、权限和观测，而不只是写提示词。

**A:** An agent is a system where an LLM decides its next action in a loop based on observations. Its parts:
- a model for reasoning and decisions;
- tools that act and fetch information;
- memory and state (short-term context plus long-term storage);
- a planning/control loop that picks the next step and decides when to stop;
- guardrails and evaluation.

Unlike a single call, it adapts to tool results, keeps state, needs a stopping rule and can cause side effects. So the core is runtime engineering — tool contracts, context, retries, persistence, permissions and observability — not just prompting.

### A2. Workflow 和 Agent 有什么区别？什么时候用哪个？
**Q:** Workflow vs agent: what's the difference and when do you use each?

**答：** 区别在于控制流由谁决定。
- Workflow：执行路径由代码预先写好。
- Agent：由 LLM 动态决定调用什么、何时停止。

Anthropic《Building effective agents》的建议是：能用 workflow 就先用 workflow（提示链、路由、并行、中心调度、评估-优化），因为它可预测、可测试、便宜；只有当步骤事先无法预知时才用自主 Agent。

结合我的项目：两个报告类项目都是 workflow。我做过一个对照实验，Supervisor 版本慢约 2 倍，而且执行路径不稳定。

**A:** The difference is who controls the flow.
- A workflow's paths are written in code.
- An agent lets the LLM decide which tool to call next and when to stop.

Anthropic's "Building effective agents" advises starting with workflows (prompt chaining, routing, parallelisation, orchestrator-workers, evaluator-optimizer) because they're predictable, testable and cheap, and using autonomous agents only when the steps can't be known in advance. Both of my report projects are workflows; in a controlled comparison, a supervisor version was about 2× slower and took different paths on repeated runs.

### A3. 解释 ReAct。落成代码时，推理、动作和观察分别是什么数据结构？
**Q:** Explain ReAct. In code, what data structures hold the reasoning, the action and the observation?

**答：** ReAct 把"思考（Thought）→ 行动（Action）→ 观察（Observation）"交替进行：模型先推理该做什么，再调用工具，把结果作为观察加入上下文，循环直到给出最终答案。在现代 function calling 里：
- 推理是 assistant 消息的文本，或者独立的 reasoning 字段；
- 动作是 assistant 消息里的 `tool_calls`，包含 id、name 和 JSON arguments；
- 观察是带 `tool_call_id` 的 tool 消息，内容是结果，或者结构化的错误。

控制循环由代码负责：最大步数、工具执行、错误包装、终止条件。

**A:** ReAct interleaves Thought → Action → Observation: the model reasons about what to do, calls a tool, adds the result to the context as an observation, and repeats until it answers. With modern function calling:
- the reasoning is the assistant message's text or a separate reasoning field;
- the action is the `tool_calls` list (id, name, JSON arguments);
- the observation is a tool message carrying the `tool_call_id` and the result or a structured error.

Code owns the loop: step limits, tool execution, error wrapping and termination.

### A4. ReAct 和"先规划后执行"（Plan-and-Execute）怎么选？
**Q:** How do you choose between ReAct and plan-and-execute?

**答：**
- ReAct：每一步都根据最新的观察来决定，适合探索性、步骤不确定的任务。缺点是每步都要调用一次 LLM，容易绕圈子。
- Plan-and-Execute：先生成整体计划，再按计划执行，适合可以分解的任务。优点是步骤可以并行、成本更低、过程可审计；缺点是遇到意外时需要重新规划。

常见折中是：先规划，执行中加检查点，发现原计划不成立时局部重新规划。参考实测（UCVC-AI-Lab-Agent 教程）：在一个文献综述多 Agent 系统上，Orchestrator-workers（"规划一次再并行执行"）的调用次数和 token 都少于 Supervisor。（面试时换成你自己项目里的例子）

**A:**
- ReAct decides each step from the latest observation, which suits exploratory tasks with uncertain steps; but it costs one LLM call per step and can loop.
- Plan-and-execute writes a plan first and then executes it, which suits decomposable tasks: steps can run in parallel, it's cheaper and auditable, but it needs replanning when surprises appear.

A common middle ground is to plan, add checkpoints during execution, and replan locally when the plan breaks. Reference measurement (UCVC-AI-Lab-Agent tutorial): on a literature-review multi-agent system, orchestrator-workers — plan once, then run in parallel — used fewer calls and tokens than a supervisor. (Use an example from your own project.)

### A5. 什么是 Reflection（反思）？什么时候有效？
**Q:** What is agent reflection, and when does it work?

**答：** 反思是让模型或评审者检查输出，再根据反馈改写，例如 Reflexion、Self-Refine。它有效需要三个前提：
1. 评审有依据：参考答案、证据或可执行的测试；
2. 反馈能改变流程，会真正触发修订；
3. 有轮数上限，并且保留最好的版本。

反面例子，参考实测（UCVC-AI-Lab-Agent 教程）：一个文献综述多 Agent 系统最初的反思在解析失败时当作"没有问题"，结果只写进日志，从不触发修订；一个报告生成 Agent 的 LLM 审核员把干净报告也 3/3 打回。能用代码验证的部分，比用 LLM 反思更可靠。

**A:** Reflection means the model or a critic checks the output and revises it based on feedback (e.g. Reflexion, Self-Refine). It works when three conditions hold:
1. the critique is grounded in a reference, evidence or executable tests;
2. the feedback changes the flow and actually triggers a revision;
3. rounds are capped and the best version is kept.

Counter-examples, reference measurement (UCVC-AI-Lab-Agent tutorial): a literature-review multi-agent system's original reflection treated parse failures as "no issues" and only logged its results, never triggering a revision; a report-writing agent's LLM reviewer rejected 3/3 clean reports. Checks you can do in code beat LLM reflection.

### A6. Agent 怎么判断任务该结束？怎么避免无限循环？
**Q:** How does an agent know when to stop, and how do you prevent infinite loops?

**答：**
- 正常结束：模型给出最终答案、不再调用工具，或者调用一个专门的"结束"工具。
- 硬性保护放在代码里：
  - 最大步数（LangGraph 有 `recursion_limit`）；
  - token 和时间预算；
  - 禁止重复调用相同的工具和参数；
  - 连续 N 步没有进展就终止。
- 到达上限时，交付当前最好的结果并说明原因，而不是报错退出。

我的 Supervisor 实验里就有"最多 6 步"和"同一个 worker 不能跑两次"这两个护栏，写答案的节点是终点，写完直接结束。

**A:**
- Normal termination: the model gives a final answer with no tool calls, or calls a dedicated "finish" tool.
- Hard guards live in code:
  - a step limit (`recursion_limit` in LangGraph);
  - token and time budgets;
  - no repeating the same tool with the same arguments;
  - stopping after N steps without progress.
- When a limit is hit, deliver the best result so far with an explanation instead of crashing.

My supervisor experiment used a 6-step cap and a no-repeat rule, with the writing node as a terminal node.

### A7. 什么是 Harness？哪些职责不应该交给模型？
**Q:** What is a harness, and which responsibilities should never be left to the model?

**答：** Harness 是包在模型外面的运行时，负责：
- 组装上下文；
- 定义和执行工具；
- 循环控制、重试和超时；
- 状态持久化；
- 权限、沙箱和审批；
- 日志和评测。

不应交给模型的：权限判断、金额和数量这类硬校验、幂等和去重、预算与步数上限、敏感操作的审批、数据计算。对编程类 Agent 来说，harness 和模型同样重要：同一个模型，换一个 harness，效果可能差很多。参考实测（UCVC-AI-Lab-Agent 教程）：只是把工具说明改短，准确率就从 1.00 降到 0.92。

**A:** The harness is the runtime around the model:
- context assembly;
- tool definitions and execution;
- loop control, retries and timeouts;
- state persistence;
- permissions, sandboxing and approvals;
- logging and evaluation.

Never leave these to the model: permission checks, hard validation of amounts, idempotency and deduplication, budgets and step limits, approval of sensitive actions, and arithmetic on data. For coding agents the harness matters as much as the model — the same model behaves very differently in different harnesses. In a reference measurement (UCVC-AI-Lab-Agent tutorial), merely shortening tool descriptions dropped accuracy from 1.00 to 0.92.

### A8. 发现原计划不成立时，什么时候重新规划，什么时候继续重试？
**Q:** When the plan stops making sense, when do you replan instead of retrying?

**答：** 先区分失败类型：
- 暂时性失败（超时、429、网络抖动）：带退避重试。
- 输入或参数错误：把错误反馈给模型，让它修正后重试，并设上限。
- 前提不成立（数据不存在、工具不支持、结果和假设矛盾）：重新规划，原样重试没有意义。

判断依据应该写成规则，比如错误码分类、同一步连续失败 N 次，而不是让模型无限尝试。重规划时要带上失败原因和已完成的步骤。

**A:** Classify the failure first:
- Transient failures (timeouts, 429, network blips): retry with backoff.
- Bad input or arguments: feed the error back so the model corrects it, with a retry cap.
- A broken premise (the data doesn't exist, the tool can't do it, results contradict the assumption): replan, because retrying the same thing is pointless.

Encode the decision as rules (error classes, N consecutive failures on one step) rather than letting the model try forever, and pass the failure reason and completed steps into the replan.

### A9. Tool、Skill、Workflow 有什么区别？把固定 workflow 改成 Skill 后，哪些约束仍要由代码保证？
**Q:** Tool vs skill vs workflow — and what must stay in code when a workflow becomes a skill?

**答：**
- Tool 是一个原子能力，有明确的输入输出 schema。
- Skill 是一份打包的"做事说明"，包含指令、示例和脚本，模型按需加载，用来教模型怎么完成某类任务。
- Workflow 是写死的执行流程。

改成 Skill 后，模型获得了灵活性，但这些约束仍要由代码保证：权限、参数校验、幂等、金额和合规类硬规则、审批点、步数和预算上限，以及输出的 schema 校验。Skill 负责"怎么做更好"，代码负责"绝对不能做错的部分"。

**A:**
- A tool is an atomic capability with an input/output schema.
- A skill is a packaged set of instructions, examples and scripts that the model loads on demand to learn how to do a kind of task.
- A workflow is a fixed execution path.

After moving to a skill, code must still enforce permissions, argument validation, idempotency, hard business and compliance rules, approval points, step and budget limits, and output schema checks. The skill teaches how to do it well; code guarantees what must never go wrong.

### A10. 构建复杂 Agent 时，最主要的挑战是什么？
**Q:** What are the main challenges in building a complex agent?

**答：** 主要是五类问题：
1. 可靠性：错误会在多步中累积。每步对 95%，8 步串联只剩约 66%。
2. 上下文管理：越长越容易出错，即所谓上下文腐烂。
3. 工具与外部系统：参数错误、权限、副作用、幂等。
4. 评测难：输出不唯一、结果不确定、端到端成本高。
5. 成本和延迟。

工程上的应对：缩短决策链；把确定性的部分交给代码；做好契约和测试；加持久化和链路追踪；建立评测集，并做成 CI 门禁。

**A:** Five kinds of problem:
1. Reliability: errors compound — 95% per step leaves about 66% after 8 chained steps.
2. Context management: quality degrades as the context grows (context rot).
3. Tools and external systems: bad arguments, permissions, side effects, idempotency.
4. Evaluation: outputs aren't unique, results vary, and end-to-end runs are expensive.
5. Cost and latency.

The engineering answer: shorter decision chains, deterministic work in code, contracts and tests, persistence and tracing, and eval sets wired into CI gates.

---

## B. 工具调用与 MCP / Tool use and MCP

### B1. Function calling 是怎么工作的？模型是怎么学会调用工具的？
**Q:** How does function calling work, and how do models learn to call tools?

**答：**
- 训练：模型在大量"工具描述 + 对话 → 结构化调用"的数据上做了微调，有的还经过强化学习，学会输出符合 JSON Schema 的调用。
- 运行时：我们把工具名、描述和参数 schema 传给模型；模型返回 `tool_calls`（名称和参数）；由应用执行工具，把结果作为 tool 消息传回去，模型再继续生成。

关键在于：模型只负责"提议"调用，真正执行和校验的是你的代码。

**A:**
- Training: models are fine-tuned, and sometimes RL-trained, on data mapping tool descriptions plus conversations to structured calls, so they learn to emit calls that match a JSON Schema.
- Runtime: we pass tool names, descriptions and parameter schemas; the model returns `tool_calls` (name and arguments); the application executes them and returns results as tool messages; the model continues.

The key point: the model only proposes calls — your code executes and validates them.

### B2. Structured output 和 function calling 有什么区别？
**Q:** Structured output vs function calling?

**答：**
- Structured output：要求模型的最终回答符合某个 schema，用来提取信息或在 Agent 之间传递数据。
- Function calling：模型选择要调用哪个工具，并生成参数，是行动的入口。

实现上，很多框架用 function calling 来实现结构化输出。比如 LangChain 的 `with_structured_output(method="function_calling")`，就是把 schema 当成一个"工具"。例如在一个报告生成 Agent 里，把 JSON mode 加手工解析换成这种方式，就能避免输出截断后解析失败。（面试时换成你自己项目里的例子）

**A:**
- Structured output constrains the model's final answer to a schema, for extraction or handing data between agents.
- Function calling lets the model choose a tool and generate its arguments; it's the entry point for actions.

Many frameworks implement structured output via function calling — LangChain's `with_structured_output(method="function_calling")` treats the schema as a tool. For example, in a report-writing agent, replacing JSON mode plus manual parsing with this approach avoids the parse failures that truncated output causes. (Use an example from your own project.)

### B3. 怎么为 Agent 设计好用的工具？
**Q:** How do you design good tools for an agent?

**答：**
- 名字和描述要写清楚"什么时候用、什么时候不用"；
- 参数要有类型、单位、格式和示例（比如"ISO 4217 货币代码""城市名用英文"）；
- 返回结构化结果，出错时返回模型能读懂的错误；
- 一个工具只做一件事，避免功能重叠的近似工具；
- 有副作用的工具要支持幂等；
- 工具总数要控制。

工具描述本身就是提示词。参考实测（UCVC-AI-Lab-Agent 教程）里，代码不变、只把描述改成一个词，难题集准确率就从 16/16 降到 14/16：模型不知道该用哪个搜索工具，参数里把城市名传成了"上海"。

**A:**
- Names and descriptions should say when to use the tool and when not to.
- Parameters need types, units, formats and examples ("ISO 4217 code", "city name in English").
- Return structured results and errors the model can understand.
- One job per tool; avoid overlapping look-alikes.
- Make side-effecting tools idempotent.
- Keep the total number of tools small.

Tool docs are prompts: in a reference measurement (UCVC-AI-Lab-Agent tutorial), with code unchanged, one-word descriptions dropped the hard set from 16/16 to 14/16 — the model couldn't tell which search tool to use and passed the city as "上海".

### B4. 模型生成的工具名或参数不合法时，怎么设计校验、纠错和终止？
**Q:** How do you handle invalid tool names or arguments: validation, correction and termination?

**答：**
1. 执行前用 schema 校验（Pydantic）：工具名必须在白名单里，类型和枚举值必须合法。
2. 不合法时，不执行，把具体错误作为 tool 结果返回给模型，让它修正。错误信息里要带上原始请求和合法取值，不能只给一句错误说明。反面例子：一个文献综述多 Agent 系统最初的重试就是只发了错误说明，所以重试几乎没用。
3. 同一个错误连续出现 N 次，或者总重试次数超限，就终止：降级、转人工或明确失败。
4. 通过了结构校验，仍然要做业务校验和权限校验。

**A:**
1. Validate against the schema before executing (Pydantic): the tool name must be on the allowlist, and types and enums must be valid.
2. On failure, don't execute; return the specific error as the tool result so the model can fix it. Include the original request and the valid options, not just an error note — as a counter-example, a literature-review multi-agent system's original retry sent only the note, which made retries nearly useless.
3. After N identical errors or exceeding the retry budget, stop: fall back, hand off to a person, or fail explicitly.
4. Passing the schema check still requires business and permission checks.

### B5. 工具从十个增长到上千个，怎么选候选工具、控制描述长度？
**Q:** With thousands of tools, how do you select candidates and control description length?

**答：** 不要把所有工具都塞进上下文：
- 按类别分层路由：先选领域，再选工具；
- 用 embedding 检索最相关的 Top-K 个工具描述；
- 常用工具常驻，其余按需加载；
- 描述写得精简，详细的用法放到工具的帮助文档或 Skill 里。

还要评测"工具召回率"，也就是正确的工具是否在候选里。参考实测（UCVC-AI-Lab-Agent 教程）里，工具从 4 个加到 10 个（6 个是干扰项）后，小模型开始在无关问题上过度调用工具。

**A:** Don't put every tool in context:
- route hierarchically (domain first, then tool);
- retrieve the top-K tool descriptions by embedding;
- keep frequent tools resident and load the rest on demand;
- keep descriptions short and move detailed usage into tool help or skills.

Also measure tool recall (is the correct tool among the candidates?). In a reference measurement (UCVC-AI-Lab-Agent tutorial), going from 4 to 10 tools (6 distractors) made a small model start calling tools on irrelevant questions.

### B6. Agent 怎么决定是调用工具还是直接回答？
**Q:** How does an agent decide between calling a tool and answering directly?

**答：** 由模型根据工具描述和系统提示来判断。工程上可以这样控制：
- 在系统提示里写明"只在需要时调用"；
- 在工具描述里写清楚边界；
- 关键场景用 `tool_choice` 强制或禁止调用。

要测两个方向的错误：该调用时没调（参考实测，UCVC-AI-Lab-Agent 教程：只靠提示词的 agentic RAG 没有检索就回答了"Canberra"，用中间件强制 `tool_choice` 才解决），和不该调用时乱调。BFCL 的 irrelevance 类别就是专门测后者的。

**A:** The model decides from tool descriptions and the system prompt. In engineering you can control it by:
- stating "call a tool only when needed" in the system prompt;
- writing clear boundaries in tool descriptions;
- forcing or forbidding calls with `tool_choice` where it matters.

Test both errors: not calling when it should (reference measurement, UCVC-AI-Lab-Agent tutorial: prompt-only agentic RAG answered "Canberra" without searching until middleware forced `tool_choice`), and calling when it shouldn't — BFCL's irrelevance category measures the latter.

### B7. 多个工具可以并行调用时，怎么表达依赖关系、合并失败结果？
**Q:** With parallel tool calls, how do you express dependencies and merge failures?

**答：**
- 没有依赖的调用，让模型在一轮里一起发出（parallel tool calls），用 `tool_call_id` 对应各自的结果。
- 有依赖的调用分轮执行，或者在编排层用 DAG 表达依赖：LangGraph 里用 Send 并行、用汇合边等待。
- 合并结果时：每个调用单独记录成功或失败，部分失败时返回已有结果并标注缺失，不能让一个失败拖垮全部。
- 要测试"有依赖的任务"：参考实测（UCVC-AI-Lab-Agent 教程）里，小模型在"先换算再换算"这道题上，把第二次调用的金额写成了 `result['...']` 这样的占位符。

**A:**
- Independent calls are emitted together in one turn (parallel tool calls) and matched by `tool_call_id`.
- Dependent calls go in separate turns, or the orchestration layer expresses them as a DAG (LangGraph: Send for fan-out, join edges to wait).
- When merging, record success or failure per call and return partial results with gaps marked; one failure shouldn't sink everything.
- Test sequential tasks: in my run, a small model filled the second conversion's amount with a placeholder like `result['...']`.

### B8. MCP 是什么？和普通的 function calling 有什么区别？
**Q:** What is MCP, and how does it differ from plain function calling?

**答：** MCP（Model Context Protocol）是一个开放协议，用 JSON-RPC 把"工具和上下文的提供方"（server）和"使用方"（client 或 host）标准化地连起来。
- Function calling 是模型 API 层的能力：模型如何表达"我要调用某个工具"。
- MCP 解决的是工具如何被发现、描述、调用和复用：一个 server 写一次，任何支持 MCP 的客户端都能用。

两者是互补的：MCP 客户端会把 server 提供的工具转成 function calling 的工具定义，再交给模型。

**A:** MCP (Model Context Protocol) is an open, JSON-RPC-based protocol that standardises how providers of tools and context (servers) connect to the apps that use them (clients and hosts).
- Function calling is a model-API capability: how the model expresses "call this tool".
- MCP covers discovery, description, invocation and reuse: write a server once and any MCP client can use it.

They're complementary: the MCP client converts the server's tools into function-calling definitions for the model.

### B9. MCP 有哪些原语和传输方式？SSE 和 Streamable HTTP 在实际接入中有什么区别？
**Q:** What are MCP's primitives and transports? How do SSE and Streamable HTTP differ in practice?

**答：**
- Server 提供三种原语：tools（由模型调用）、resources（由应用读取的数据）、prompts（由用户选择的模板）。Client 也可以向 server 提供能力：sampling、roots，以及新版规范里的 elicitation。
- 传输方式：
  - stdio：本地子进程，简单安全。
  - Streamable HTTP：2025-03 版规范引入，单一 HTTP 端点，可以按需升级为流式，支持无状态部署，便于负载均衡和鉴权。它取代了旧的 HTTP+SSE 双端点方案（旧方案需要一条长连接，部署和扩容都更麻烦）。

参考实测（UCVC-AI-Lab-Agent 教程）的一个细节：langchain-mcp-adapters 默认每次调用工具都新起一个 stdio 进程，3 次调用用了 5.67 秒；改用 `client.session()` 复用会话后只要 0.32 秒。

**A:**
- Server primitives: tools (model-invoked), resources (app-read data) and prompts (user-chosen templates). Clients can offer sampling, roots and, in newer specs, elicitation.
- Transports:
  - stdio: a local subprocess, simple and safe.
  - Streamable HTTP: introduced in the 2025-03 spec — one HTTP endpoint that can upgrade to streaming, supports stateless deployment, and is easier to load-balance and authenticate. It replaced the older two-endpoint HTTP+SSE transport, which needed a long-lived connection and was harder to deploy and scale.

A reference measurement (UCVC-AI-Lab-Agent tutorial): langchain-mcp-adapters spawns a new stdio process per tool call by default; 3 calls took 5.67 s, versus 0.32 s when reusing a session via `client.session()`.

### B10. MCP 和工具有哪些安全问题？权限应该在哪里校验？
**Q:** What are the security risks of MCP and tools, and where should permissions be checked?

**答：**
- 主要风险：
  - 工具投毒：恶意 server 在工具描述里藏指令。参考实测（UCVC-AI-Lab-Agent 教程）里，DeepSeek 真的把描述里藏的 "BLUE-7731" 写进了笔记。
  - server 更新后描述被悄悄替换（rug pull）。
  - 工具返回内容里夹带的间接提示注入。
  - 权限过大。
- 防护手段：
  - 给工具描述做指纹（hash）白名单，有变化就告警；
  - 扫描描述和返回内容中的注入模式；
  - 最小权限；
  - 权限在工具执行层，也就是服务端校验，不能靠模型自觉；
  - 写操作、外发数据和金额类操作必须经过人工确认。

**A:**
- Risks:
  - tool poisoning — hidden instructions in a tool description; in a reference measurement (UCVC-AI-Lab-Agent tutorial) DeepSeek actually copied the hidden "BLUE-7731" into its notes;
  - rug pulls, where a server silently changes its descriptions after an update;
  - indirect prompt injection in tool outputs;
  - over-broad permissions.
- Defences:
  - fingerprint (hash) allowlists for tool descriptions, alerting on change;
  - scanning descriptions and outputs for injection patterns;
  - least privilege;
  - permission checks in the execution layer on the server side, not left to the model;
  - human confirmation for writes, outbound data and money.

### B11. A2A 是什么？和 MCP 有什么区别？
**Q:** What is A2A, and how is it different from MCP?

**答：** A2A（Agent2Agent，由 Google 在 2025 年发起，后来捐给了 Linux 基金会）解决的是 Agent 和 Agent 之间的协作：
- 通过 Agent Card 发现对方的能力；
- 以 Task 为中心管理生命周期；
- 用消息和 artifact 交换结果；
- 支持长任务和流式更新。

最关键的区别：MCP 连接的是 Agent 和工具或数据，对方是被动的、无状态的能力；A2A 连接的是两个自主的 Agent，对方有自己的推理和状态，任务可能运行很久。现在的工程实践大多以 MCP 为主，A2A 用在跨团队、跨厂商的 Agent 协作场景。

**A:** A2A (Agent2Agent, launched by Google in 2025 and later donated to the Linux Foundation) handles collaboration between agents:
- discovery through Agent Cards;
- a task-centred lifecycle;
- messages and artifacts for exchanging results;
- support for long-running work and streaming updates.

The key difference: MCP connects an agent to tools or data — passive, stateless capabilities — while A2A connects two autonomous agents, each with its own reasoning and state, on tasks that may run for a long time. In practice MCP dominates today; A2A is for cross-team or cross-vendor agent collaboration.

### B12. 依赖的工具暂时不可用时，怎么在替代工具、降级回答和任务失败之间做选择？
**Q:** When a tool is unavailable, how do you choose between an alternative, a degraded answer and failing?

**答：** 按任务的风险和替代方案的质量来定：
- 有等价的替代工具（备用 API、缓存），就自动切换并记录下来；
- 可以接受不完整的结果，就降级回答，但必须明确告诉用户缺了什么。比如一个报告生成 Agent 在 LLM 不可用时改用模板报告，并标注"AI 分析服务暂不可用"；
- 涉及写操作、金额或合规，或者结果会误导用户，就明确失败或转人工。

这些规则要写在代码和配置里，不能让模型临场决定。

**A:** Decide by risk and by the quality of the alternative:
- if an equivalent exists (backup API, cache), switch automatically and log it;
- if a partial result is acceptable, degrade and say clearly what's missing — e.g. a report-writing agent falling back to a template report, labelled "AI analysis unavailable";
- for writes, money or compliance, or when a result could mislead, fail explicitly or hand off to a person.

Encode these rules in code and config, not in the model's judgement.

---

## C. RAG / Retrieval-augmented generation

### C1. RAG 的原理是什么？和微调相比解决了什么问题？
**Q:** How does RAG work, and what does it solve compared with fine-tuning?

**答：** RAG 在生成前先检索相关资料，把资料放进上下文，让模型依据资料回答。它解决的是：
- 知识更新：改文档就行，不用重新训练；
- 私有知识：模型训练时没见过的内容；
- 可追溯：可以给出引用；
- 减少幻觉。

微调更适合教模型"格式、风格、技能"，而不是灌输会变化的事实。两者可以结合：用微调提升模型利用检索结果的能力，用 RAG 提供最新的事实。

**A:** RAG retrieves relevant material before generation and puts it in the context so the model answers from it. It provides:
- freshness: update documents instead of retraining;
- private knowledge the model never saw;
- traceability through citations;
- fewer hallucinations.

Fine-tuning is better for teaching format, style and skills than for injecting changing facts. They combine well: fine-tune to use retrieved context better, and use RAG to supply current facts.

### C2. 一个完整的 RAG 流水线包含哪些步骤？
**Q:** What are the steps of a complete RAG pipeline?

**答：**
- 离线：解析文档（PDF、HTML，保留标题、页码等元数据）→ 清洗 → 切块 → 向量化 → 建索引（向量索引加关键词索引）→ 增量更新。
- 在线：改写或扩展查询 → 混合检索（向量 + BM25）→ 融合（RRF）→ 重排 → 拼接上下文并控制预算 → 带引用生成 → 后处理（校验引用、无答案时拒答）。

还要全程做评测和监控。参考实测（UCVC-AI-Lab-Agent 教程）：用 Postgres 和 pgvector 搭一遍，806 页 PDF 切成 1834 个块，建了 HNSW 和 GIN 两种索引。（面试时换成你自己项目里的例子）

**A:**
- Offline: parse documents (PDF, HTML, keeping headings, pages and other metadata) → clean → chunk → embed → index (vector plus keyword) → incremental updates.
- Online: rewrite or expand the query → hybrid retrieval (vector + BM25) → fusion (RRF) → rerank → assemble the context within a budget → generate with citations → post-check (verify citations, refuse when there's no answer).

Evaluation and monitoring run throughout. Reference measurement (UCVC-AI-Lab-Agent tutorial): a build on Postgres with pgvector turned an 806-page PDF into 1,834 chunks, with HNSW and GIN indexes. (Use an example from your own project.)

### C3. 切块大小和重叠怎么选？切块过大或过小会有什么可观测的问题？
**Q:** How do you choose chunk size and overlap, and what observable problems do too-large or too-small chunks cause?

**答：**
- 切块过大：检索结果里噪声多，相关句子被稀释，排名下降；上下文更贵；还会出现"答案在块里，但模型没注意到"。
- 切块过小：语义不完整，定义和条件被切开，需要更多的 K 才能凑全信息。
- 起点：按结构切（标题、段落），比如 500–1000 token，重叠 10–20%；然后用带证据句的评测集，比较不同切法的 Hit@K 和 MRR，再做决定。
- 可以考虑父子块：用小块检索，返回它所在的大块。

参考实测（UCVC-AI-Lab-Agent 教程）：使用的是 1000/150。

**A:**
- Too large: noisy results, relevant sentences diluted and ranked lower, costlier context, and "the answer is in the chunk but the model missed it".
- Too small: incomplete meaning, definitions split from their conditions, and a larger K needed to collect the facts.
- Start from structure-based splitting (headings, paragraphs), around 500–1000 tokens with 10–20% overlap, then compare Hit@K and MRR on an eval set with evidence sentences before deciding.
- Consider parent-child chunks: retrieve small chunks, return their parent.

Reference measurement (UCVC-AI-Lab-Agent tutorial): 1000/150 was used.

### C4. 怎么选择嵌入模型？评估指标有哪些？
**Q:** How do you choose an embedding model, and which metrics matter?

**答：** 先看公开榜单（MTEB）缩小范围，但最终要在自己的数据上评测：
- 用真实的查询，加上标注好的相关文档或证据句，算 Recall@K、Hit@K、MRR、nDCG；
- 同时考虑语言（中英、跨语言）、长度上限、向量维度和成本、延迟、是否需要本地部署。

参考实测（UCVC-AI-Lab-Agent 教程）里，中文查询用关键词检索和 BM25 完全检索不到英文文档，而 bge-m3 的向量检索可以跨语言召回。这类差异只有在自己的数据上才能测出来。

**A:** Shortlist with public leaderboards (MTEB), but decide on your own data:
- Recall@K, Hit@K, MRR and nDCG on real queries with labelled relevant documents or evidence sentences;
- also language coverage (including cross-lingual), max length, dimension and cost, latency, and whether it must run locally.

In a reference measurement (UCVC-AI-Lab-Agent tutorial), Chinese queries got nothing from keyword or BM25 search over English text, while bge-m3 vectors retrieved across languages — the kind of difference you only see on your own data.

### C5. 为什么要做混合检索？解释 BM25 和 RRF。
**Q:** Why hybrid retrieval? Explain BM25 and RRF.

**答：**
- 两种检索各有所长：向量检索擅长语义相近和同义改写，但对专有名词、编号、缩写不敏感；关键词检索正好相反。
- BM25 按词频（有饱和上限）、逆文档频率（IDF）和文档长度归一化来打分。
- RRF（Reciprocal Rank Fusion）按名次融合多路结果：每个文档的得分是各路结果中 1/(k+名次) 的和，常用 k=60。它不需要校准各路分数的量纲。

参考实测（UCVC-AI-Lab-Agent 教程，14 道题）：

| 方法 | Hit@5 | MRR |
|---|---|---|
| 向量 | 0.86 | 0.70 |
| BM25 | 0.64 | 0.56 |
| 混合 | 0.93 | 0.71 |
| 多查询 | 1.00 | 0.88 |

另外，Postgres 的 `ts_rank_cd` 没有 IDF，不能当 BM25 用。

**A:**
- Each method has blind spots: vectors handle semantic similarity and paraphrase but miss exact names, codes and abbreviations; keyword search is the opposite.
- BM25 scores by term frequency (with saturation), inverse document frequency (IDF) and length normalisation.
- RRF (Reciprocal Rank Fusion) fuses results by rank: each document scores the sum of 1/(k+rank) across lists, usually with k=60, so no score calibration is needed.

Reference measurement (UCVC-AI-Lab-Agent tutorial, 14 questions):

| Method | Hit@5 | MRR |
|---|---|---|
| vector | 0.86 | 0.70 |
| BM25 | 0.64 | 0.56 |
| hybrid | 0.93 | 0.71 |
| multi-query | 1.00 | 0.88 |

Also, Postgres's `ts_rank_cd` has no IDF, so it isn't BM25.

### C6. 重排增加了延迟，怎么证明它带来的质量收益值得？
**Q:** Reranking adds latency — how do you prove it's worth it?

**答：** 在同一个评测集上做对照实验：
- 有没有重排的 MRR、nDCG 对比；
- 端到端的答案正确率；
- P50 和 P95 延迟、成本。

然后看业务要的是什么：如果是"第一条结果要对"，MRR 的提升最关键。参考实测（UCVC-AI-Lab-Agent 教程）里，混合检索加 LLM 重排后，Hit@5 不变（0.93），MRR 从 0.71 提到 0.85。也就是说，重排不负责找到更多相关结果，而是把相关结果排得更靠前。

还可以只对候选数量多的查询做重排，或者用小的交叉编码器（cross-encoder）代替 LLM 重排。

**A:** Run a controlled comparison on one eval set:
- MRR and nDCG with and without reranking;
- end-to-end answer accuracy;
- P50/P95 latency and cost.

Then weigh it against what the product needs: if the first result must be right, MRR gains matter most. In a reference measurement (UCVC-AI-Lab-Agent tutorial), adding LLM reranking to hybrid retrieval kept Hit@5 at 0.93 but raised MRR from 0.71 to 0.85 — reranking doesn't find more, it orders better. You can also rerank only queries with many candidates, or use a small cross-encoder instead of an LLM.

### C7. 解释 "Lost in the Middle"。怎么缓解？
**Q:** Explain "Lost in the Middle" and how to mitigate it.

**答：** 这是 Liu 等人 2023 年发现的现象：相关信息放在长上下文的开头或结尾时，模型用得最好；放在中间时，准确率明显下降。

缓解办法：
- 少放无关内容：精排之后只保留 Top-N；
- 把最相关的放在开头或结尾；
- 先压缩、摘要，再生成；
- 分步回答：先抽取证据句，再基于证据作答。

这和上下文腐烂相关。参考实测（UCVC-AI-Lab-Agent 教程）：加入相似的干扰信息后，准确率从 2k token 时的 23/24 降到了 14k 时的 14/24。

**A:** Liu et al. (2023) found that models use information best at the start or end of a long context, and accuracy drops noticeably for information in the middle.

Mitigations:
- include less: keep only the top-N after reranking;
- put the most relevant items at the edges;
- compress or summarise before generating;
- answer in two steps: extract evidence sentences first, then answer from them.

It's related to context rot. Reference measurement (UCVC-AI-Lab-Agent tutorial): with look-alike distractors, accuracy fell from 23/24 at 2k tokens to 14/24 at 14k.

### C8. 怎么全面评测一个 RAG 系统？
**Q:** How do you evaluate a RAG system end to end?

**答：** 分两段评：
- 检索：Recall@K、Hit@K、MRR、nDCG。最好用"证据句"作为标注，比"相关文档 ID"更稳定。
- 生成：
  - 忠实度（groundedness）：回答是否都有资料支持；
  - 回答相关性；
  - 完整性：参考要点覆盖了几条；
  - 拒答正确率：资料里没有答案时，有没有拒答。

用带参考答案的 LLM 评委，并先用人工标注校准。

**注意：** 忠实不等于完整。参考实测（UCVC-AI-Lab-Agent 教程）里，有的回答每句都有依据，但漏了一半要点。

**A:** Evaluate the two stages separately:
- Retrieval: Recall@K, Hit@K, MRR, nDCG — ideally labelled with evidence sentences, which are more stable than document IDs.
- Generation:
  - groundedness: is every claim supported?
  - answer relevance;
  - completeness: how many reference key points are covered;
  - correct refusals when the answer isn't in the material.

Use an LLM judge with references, calibrated on human labels.

**Note:** groundedness isn't completeness — in reference measurements (UCVC-AI-Lab-Agent tutorial) some fully grounded answers missed half the key points.

### C9. 了解哪些更复杂的 RAG 范式？Agentic RAG 和 Corrective RAG 是什么？
**Q:** What advanced RAG paradigms do you know — agentic RAG, corrective RAG?

**答：**
- Agentic RAG：让 Agent 自己决定何时检索、检索什么、要不要多次检索。
- Self-RAG：训练模型输出"反思 token"，自己决定是否检索、评价检索结果。
- CRAG（Corrective RAG）：用一个评估器判断检索结果是否可靠，不可靠时改写查询或改用网络搜索。

我做过一个修正型 RAG 的 LangGraph 图：
- 先判断"资料是否足够"，并说出缺什么；
- 不够就把问题拆成子查询，每个子查询分别重排；
- 累积已检索到的文档，而不是只保留最后几条。

我踩过的坑：`docs[-8:]` 这一行把最早检索到的定义丢掉了。

**A:**
- Agentic RAG lets the agent decide when, what and how many times to retrieve.
- Self-RAG trains the model to emit reflection tokens to decide on retrieval and grade passages.
- CRAG (Corrective RAG) uses an evaluator to judge retrieval quality and rewrites the query or falls back to web search when it's poor.

I built a corrective LangGraph that:
- grades whether the material is sufficient and says what's missing;
- if not, decomposes the question into sub-queries and reranks each separately;
- accumulates documents instead of keeping only the latest few.

A bug I hit: `docs[-8:]` dropped the earliest-retrieved definition.

### C10. 知识库文档更新或删除后，旧向量和旧引用怎么失效？多租户怎么隔离？
**Q:** How do stale vectors and citations get invalidated after updates or deletions, and how do you isolate tenants?

**答：**
- 更新与删除：
  - 每个块记录来源文档 ID、版本号和内容哈希（我用的是 sha1 作为 ID，所以重复导入是幂等的）；
  - 文档更新时，删除旧版本的块，再写入新块；缓存和已生成的引用按文档版本失效。
- 多租户：
  - 检索时强制带 tenant 过滤条件，在服务端注入，不信任前端传的参数；或者每个租户一个命名空间、一个 collection；
  - 写测试：用 A 租户的查询去搜，断言结果里绝不会出现 B 租户的文档。

**A:**
- Updates and deletions:
  - store the source document ID, version and content hash per chunk (I used sha1 IDs, which makes re-ingest idempotent);
  - on update, delete the old version's chunks and insert the new ones; invalidate caches and stored citations by document version.
- Multi-tenancy:
  - enforce a tenant filter injected on the server, never trusting the client, or use a namespace or collection per tenant;
  - write tests asserting that tenant A's queries never return tenant B's documents.

### C11. 什么时候用知识图谱（GraphRAG）？
**Q:** When would you use a knowledge graph (GraphRAG)?

**答：** 适合三类问题：
- 多跳关系：A 的供应商的子公司是谁；
- 全局汇总：整个语料讲了哪些主题；
- 需要显式的实体关系和约束。

代价是建图成本高、需要实体消歧、图谱需要更新维护。是否值得，要用多跳问题的评测集，对比普通 RAG 的正确率提升有多少。

**A:** It suits three kinds of question:
- multi-hop relations ("who owns A's supplier?");
- global summaries ("what themes run through the corpus?");
- explicit entity relations and constraints.

The costs are graph construction, entity resolution and maintenance. Justify it with a multi-hop eval set showing accuracy gains over plain RAG.

### C12. Top-K 结果噪声大时，怎么判断问题出在切块、召回还是重排？
**Q:** When top-K results are noisy, how do you tell whether the cause is chunking, recall or reranking?

**答：** 逐段排查：
1. 看正确证据在不在索引里、是否被切碎了：直接在原文和切块里搜证据句。
2. 看召回阶段：扩大 K（比如 50），看正确块能不能被召回。召回不到是 embedding、查询或关键词的问题；召回到了但排名靠后，是排序问题。
3. 对比重排前后的名次变化。

每一段都要有指标：先固定其他环节，只改一处。

**A:** Bisect the pipeline:
1. Is the correct evidence in the index, and was it split apart? Search the source and the chunks for the evidence sentence.
2. Recall: widen K (say 50) — if the right chunk never appears, it's an embedding, query or keyword problem; if it appears low, it's ranking.
3. Compare ranks before and after reranking.

Measure each stage, holding the others fixed and changing one thing at a time.

---

## D. 记忆与上下文工程 / Memory and context engineering

### D1. Agent 的记忆有哪些类型？分别存什么？
**Q:** What kinds of agent memory are there, and what does each hold?

**答：**
- 工作记忆：当前上下文窗口里的内容。
- 短期记忆：同一个会话或线程的历史，由 checkpointer 按 thread 保存。
- 长期记忆：跨会话保存，又分三类：
  - 语义记忆：事实和偏好，例如用户画像；
  - 情景记忆：发生过的事，例如上次项目的经历；
  - 程序性记忆：做事的规则和习惯，例如偏好的回答格式。

实现上的一种参考做法（UCVC-AI-Lab-Agent 教程）：用 LangGraph 的 PostgresSaver 存短期记忆，用带 pgvector 索引的 PostgresStore 存长期记忆。用户画像是一份按 key 读取的结构化文档，其他记忆放在一个按语义检索的集合里。

**A:**
- Working memory: what's in the current context window.
- Short-term memory: the session or thread history, saved per thread by a checkpointer.
- Long-term memory: kept across sessions, in three kinds:
  - semantic: facts and preferences, e.g. a user profile;
  - episodic: past events, e.g. a previous project;
  - procedural: rules and habits, e.g. a preferred answer format.

One reference implementation (UCVC-AI-Lab-Agent tutorial) uses LangGraph's PostgresSaver for short-term memory and a PostgresStore with a pgvector index for long-term memory: the profile is one structured document read by key, and other memories sit in a semantically searchable collection.

### D2. 长期记忆怎么写入和更新？用户信息互相矛盾时怎么办？
**Q:** How do you write and update long-term memory, and handle contradictions?

**答：**
- 写入：从对话里抽取候选记忆，再和已有记忆比较，决定 ADD（新增）、UPDATE（更新）、DELETE（删除）或 NOOP（不变），这是 mem0 的做法。
- 我踩过的坑和修法：
  - 只返回部分画像会把其他字段清空 → 改成返回补丁，再在代码里合并；
  - 用户只是重复说了一遍，却被当成 UPDATE → 加 NOOP 规则；
  - 行程取消后被当成 UPDATE → 明确写出"矛盾或取消就 DELETE"；
  - 模型返回的 `target_id` 必须是已有记忆的 ID，在代码里校验。
- 有矛盾时，以时间更新的、用户明确陈述的为准，并保留来源和时间戳。

**A:**
- Writing: extract candidate memories, compare them with existing ones, and decide ADD, UPDATE, DELETE or NOOP (mem0-style).
- Pitfalls I hit and fixed:
  - a partial profile wiped the other fields → return a patch and merge it in code;
  - a restatement became an UPDATE → add a NOOP rule;
  - a cancelled trip became an UPDATE → an explicit "contradiction or cancellation means DELETE" rule;
  - the model's `target_id` must be an existing memory ID, checked in code.
- For contradictions, prefer the newer, explicitly stated fact, and keep source and timestamp.

### D3. 错误信息（比如写错的用户姓名）进入长期记忆后，怎么发现和修复？
**Q:** A wrong fact (e.g. a misspelled name) gets into long-term memory — how do you detect and repair it?

**答：**
- 发现：用户纠正时触发 UPDATE 或 DELETE；定期检查记忆之间的冲突；给每条记忆记录来源和置信度。
- 修复：删除或更新那条记忆，并重新生成依赖它的摘要和画像。
- 预防：
  - 只从用户自己的陈述里抽取，不从助手的复述里抽（我遇到过助手复述导致记忆反复变动）；
  - 敏感字段需要用户确认；
  - 提供"忘记我"的功能，按 user_id 删除全部数据。实测时发现，没有带 user_id 元数据的线程不会被删掉，要专门处理。

**A:**
- Detect it through user corrections (triggering UPDATE or DELETE), periodic conflict checks, and source/confidence on each memory.
- Repair by deleting or updating it and regenerating the summaries and profile that depend on it.
- Prevent it by:
  - extracting only from the user's own statements, not the assistant's restatements (which caused churn in reference measurements (UCVC-AI-Lab-Agent tutorial));
  - requiring confirmation for sensitive fields;
  - offering "forget me" that deletes everything by user_id — in testing, threads without user_id metadata survived it and needed special handling.

### D4. 什么是上下文工程？和提示词工程有什么区别？
**Q:** What is context engineering, and how does it differ from prompt engineering?

**答：**
- 提示词工程关注"怎么写指令"。
- 上下文工程关注每次调用模型时，上下文里到底放什么：系统指令、工具定义、检索结果、记忆、历史、任务状态，以及它们的顺序、预算、压缩和隔离。

核心原则是：用最少但足够的高信号 token。具体手段有：
- 按优先级做预算；
- 即时（JIT）读取，用到时再加载；
- 清理旧的工具结果；
- 摘要；
- 子 Agent 隔离；
- 结构化笔记。

**A:**
- Prompt engineering is about how to write instructions.
- Context engineering decides what goes into the context on every model call — system instructions, tool definitions, retrieved material, memory, history, task state — and how it's ordered, budgeted, compressed and isolated.

The principle is the smallest sufficient set of high-signal tokens. Techniques:
- priority budgets;
- just-in-time loading;
- clearing old tool results;
- summarisation;
- sub-agent isolation;
- structured notes.

### D5. 什么是上下文腐烂（context rot）？
**Q:** What is context rot?

**答：** 上下文越长，模型利用其中信息的能力就越差，尤其当上下文里有相似的干扰信息时（Chroma 2025 年的研究有系统测量）。参考实测（UCVC-AI-Lab-Agent 教程）：
- 简单的"大海捞针"（在长文本里找一条事实）：在 2k、14k、55k token 下都是 8/8，看不出问题；
- 加入"信息被更新过"和相似干扰项后：2k 时 23/24，14k 时降到 14/24。

所以"上下文窗口够大"不等于"效果好"。要控制上下文长度，删掉相似的旧信息。

**A:** As the context grows, the model uses the information in it less reliably, especially when there are look-alike distractors (systematically measured in Chroma's 2025 research). My test:
- simple needle-in-a-haystack retrieval scored 8/8 at 2k, 14k and 55k tokens, showing no problem;
- with updated facts plus look-alike distractors it was 23/24 at 2k but 14/24 at 14k.

A big window doesn't mean good quality; keep contexts short and remove stale look-alikes.

### D6. 对话越来越长，怎么控制上下文预算而不丢失关键信息？
**Q:** How do you control the budget of a growing conversation without losing key information?

**答：** 我比较过四种策略，同一段多轮任务的总输入 token 如下：

| 策略 | 总输入 token | 结果 |
|---|---|---|
| 不处理 | 39,227 | 88% 命中缓存 |
| 截断旧消息 | 15,290 | **忘了早先给出的面试日期** |
| 清理旧工具结果 | 21,593 | 节省 45%，信息仍在 |
| 摘要 | 34,877 | 多了 2 次调用 |

结论：
- 工具结果往往占历史的大头，实测约 84%，所以优先清理工具结果；
- 关键事实要写进结构化状态或笔记，不能只靠对话历史；
- 要用"早期事实是否还记得"这样的测试用例来验证压缩效果。

**A:** I compared four strategies on the same multi-turn task (total input tokens):

| Strategy | Total input tokens | Outcome |
|---|---|---|
| none | 39,227 | 88% cache hits |
| trim old messages | 15,290 | **forgot an interview date given earlier** |
| clear old tool results | 21,593 | 45% saved, information kept |
| summarise | 34,877 | 2 extra calls |

Takeaways:
- tool results are usually the bulk of the history (about 84% in my run), so clear them first;
- keep key facts in structured state or notes, not only in the transcript;
- verify compression with tests such as "does it still remember the early fact?".

### D7. 工具一次返回几十兆数据，进模型之前怎么处理？
**Q:** A tool returns tens of megabytes — how do you handle it before it reaches the model?

**答：** 不要把原始数据直接放进上下文：
- 在工具层先过滤、分页、聚合，只返回模型需要的字段和统计；
- 大结果存成文件或句柄，模型需要时再用工具按需读取片段（JIT）；
- 提供 `grep`、`head` 这类查询工具；
- 必要时由子 Agent 读完原始数据，只返回摘要。

例如在一个预测 + 报告 Agent 里，可以用一个 `_compact_data` 步骤在工具输出和模型之间做压缩：去掉 30 天的原始序列，只保留汇总字段（面试时换成你自己项目里的例子）。

**A:** Never put raw data into context:
- filter, paginate and aggregate in the tool layer, returning only the needed fields and statistics;
- store large results as files or handles and let the model read slices on demand (JIT);
- provide query tools such as `grep` or `head`;
- if needed, have a sub-agent read the raw data and return only a summary.

For example, in a forecasting-and-report agent, a `_compact_data` step can compress between tool output and the model, dropping the raw 30-day series and keeping summary fields (use an example from your own project).

### D8. Prompt caching（KV 缓存）怎么用好？
**Q:** How do you make good use of prompt caching (KV cache)?

**答：** 缓存是按前缀匹配的，所以：
- 稳定不变的内容放在最前面：系统指令、工具定义、长文档；
- 会变化的内容放在最后：时间戳、用户输入、动态检索结果；
- 不要在开头插入每次都不同的内容。

参考实测（UCVC-AI-Lab-Agent 教程）：把时间戳放在提示词开头，缓存命中率是 0%；挪到末尾后，第一次之后每次调用命中 61%。另外，清理工具结果虽然省了 token，但会改变前缀，导致缓存命中下降。这两者之间要权衡。

**A:** Caches match on prefixes, so:
- put stable content first: system instructions, tool definitions, long documents;
- put changing content last: timestamps, user input, dynamic retrieval;
- never insert per-call content at the top.

In a reference measurement (UCVC-AI-Lab-Agent tutorial), a timestamp at the top gave 0% cache hits; moved to the end, every call after the first hit 61%. Clearing tool results saves tokens but changes the prefix and lowers cache hits, so there's a trade-off.

### D9. 主 Agent 和子 Agent 之间怎么传递必要信息，又避免上下文互相污染？
**Q:** How do a lead agent and sub-agents pass what's needed without polluting each other's context?

**答：**
- 主 Agent 给子 Agent 一份明确的任务说明：目标、范围、输出格式、限制；
- 子 Agent 在自己的上下文里探索，只返回压缩过的结构化结果和证据，不返回完整过程；
- 共享的事实放进外部笔记或状态，比如 NOTES.json；多个 Agent 并发写时要加锁（我遇到过并行写笔记丢失一条的情况）。

参考实测（UCVC-AI-Lab-Agent 教程）里，用了子 Agent 之后，主 Agent 单次调用的最大输入只有 1,762 token；子 Agent 那边总共 11 次调用、24,870 token，换来主 Agent 的上下文保持干净。

**A:**
- The lead gives each sub-agent a clear brief: goal, scope, output format, limits.
- The sub-agent explores in its own context and returns only compressed, structured results with evidence, not its full trace.
- Shared facts go into external notes or state (e.g. NOTES.json), with locks for concurrent writes — parallel writes lost a note in a reference measurement (UCVC-AI-Lab-Agent tutorial).

With sub-agents in a reference measurement (UCVC-AI-Lab-Agent tutorial), the lead's largest single call was only 1,762 input tokens; the sub-agents spent 11 calls and 24,870 tokens to keep the lead's context clean.

---

## E. 多 Agent / Multi-agent systems

### E1. 什么时候值得用多 Agent？代价是什么？
**Q:** When is a multi-agent system worth it, and what does it cost?

**答：**
- 值得拆的情况：
  - 上下文要隔离：子任务各自需要大量材料；
  - 任务可以按宽度并行：比如逐篇读论文、多个方向同时调研；
  - 需要不同的角色、模型或权限；
  - 需要独立审核。
- 代价：
  - token 多，Anthropic 公开的数据是约为普通对话的 15 倍；
  - 错误累积；
  - 协调和信息丢失；
  - 延迟；
  - 更难测试。

原则是：先用单 Agent 加工具把任务做出来，遇到上面这些瓶颈时，在依赖少、接口清楚的地方再拆。如果一个普通函数就能做，就不要做成 Agent。

**A:**
- Split when:
  - contexts need isolation because each sub-task needs lots of material;
  - the task parallelises by breadth (reading papers one per agent, researching several directions at once);
  - roles, models or permissions differ;
  - you need independent review.
- Costs:
  - many more tokens (Anthropic reports about 15× a chat);
  - compounding errors;
  - coordination overhead and information loss;
  - latency;
  - harder testing.

Start with a single agent plus tools, and split at low-dependency, well-defined boundaries only when you hit those limits. If a plain function will do, don't make it an agent.

### E2. 常见的多 Agent 拓扑有哪些？
**Q:** What are the common multi-agent topologies?

**答：**

| 拓扑 | 由谁控制 | 适合的场景 |
|---|---|---|
| 顺序流水线 | 代码 | 步骤固定 |
| 并行 fan-out / fan-in（map-reduce） | 代码 | 独立子任务 |
| 路由 | 代码或 LLM | 分类后进入不同分支 |
| Supervisor 中心调度 | LLM | 每一步选下一个 worker |
| Orchestrator-workers | LLM | 动态拆分任务后并行派发 |
| 分层 Supervisor | LLM，多级 | 大型系统 |
| Handoff / Swarm | 每个 Agent | 互相移交对话，比如多领域客服 |
| 黑板 / 共享状态 | 代码 | 多个阶段逐步丰富同一份数据 |
| 生成-审核循环 | 代码加 LLM | 质量要求高 |
| 辩论 / 投票 | 代码 | 判断类问题 |

工程上最常见的是混合型：线性主干，加局部并行，加有次数上限的审核循环。

**A:**

| Topology | Who controls it | Fits |
|---|---|---|
| sequential pipeline | code | fixed steps |
| parallel fan-out/fan-in (map-reduce) | code | independent sub-tasks |
| router | code or LLM | classify, then branch |
| supervisor | LLM | picks the next worker each step |
| orchestrator-workers | LLM | dynamic decomposition, parallel dispatch |
| hierarchical supervisors | LLM, multi-level | large systems |
| handoff / swarm | each agent | passing a conversation along, e.g. multi-domain support |
| blackboard / shared state | code | stages enriching the same data |
| generator-critic loop | code + LLM | high quality bars |
| debate / voting | code | judgement questions |

The most common in practice is a hybrid: a linear backbone, local parallelism and a capped review loop.

### E3. Supervisor、Orchestrator-workers 和固定流水线怎么选？有数据吗？
**Q:** Supervisor vs orchestrator-workers vs fixed pipeline — how do you choose, and do you have data?

**答：** 有参考数据。参考实测（UCVC-AI-Lab-Agent 教程）——在一个文献综述多 Agent 系统上做对照实验：同一批 worker、同一份论文记忆，一个窄问题、一个写综述的宽任务（面试时换成你自己项目里的数据）。

| 架构 | 调用次数 | 耗时 | 特点 |
|---|---|---|---|
| 固定流水线 | 5 | 6–7 秒 | 可预测 |
| Supervisor | 8–10 | 12–13 秒 | 窄问题也调用了大部分 worker；同一任务跑 3 次，worker 组合不完全一样 |
| Orchestrator-workers | 6 | 6–7 秒 | token 最少（约 7.3k，其他两种 9–13k），子 Agent 只看相关论文 |

结论：
- 步骤已知 → 固定流水线；
- 能拆成独立子问题 → Orchestrator-workers；
- worker 种类多、下一步取决于中间结果 → Supervisor，但硬约束要写在代码里。

**A:** Yes, there is reference data. Reference measurement (UCVC-AI-Lab-Agent tutorial) — a controlled comparison on a literature-review multi-agent system with the same workers and paper memories, on one narrow question and one broad review task (use data from your own project).

| Architecture | Calls | Time | Notes |
|---|---|---|---|
| fixed pipeline | 5 | 6–7 s | predictable |
| supervisor | 8–10 | 12–13 s | used most workers even for the narrow question; over 3 runs of one task the worker set wasn't the same each time |
| orchestrator-workers | 6 | 6–7 s | fewest tokens (about 7.3k vs 9–13k); sub-agents saw only relevant papers |

So:
- known steps → fixed pipeline;
- decomposable into independent questions → orchestrator-workers;
- many heterogeneous workers whose next step depends on intermediate results → supervisor, with hard guards in code.

### E4. 多 Agent 之间共享什么、隔离什么？用什么机制保证？
**Q:** What do agents share and what do they keep separate, and how is that enforced?

**答：**
- 共享：任务目标、结构化的中间产物（契约化的 schema，比如文献综述 Agent 先把每篇论文抽成固定字段的"论文卡片"）、全局约束，以及进度和错误。
- 隔离：各自的探索过程、工具原始输出、私有的推理过程。
- 机制：
  - 共享状态加 reducer，或者显式传参；
  - 子图只回传 `output_schema` 里定义的字段；
  - 消息里只放摘要；
  - 外部存储要有明确的读写归属和锁。

关键是"契约 + 字段归属"：每个字段有且只有一个写入者，或者有明确的合并规则。

**A:**
- Shared: the goal, structured intermediate artefacts (contracted schemas, such as the fixed-field "paper card" a literature-review agent extracts from each paper), global constraints, progress and errors.
- Isolated: each agent's exploration, raw tool output and private reasoning.
- Mechanisms:
  - shared state with reducers, or explicit arguments;
  - subgraphs returning only `output_schema` fields;
  - summaries in messages;
  - external stores with clear ownership and locks.

The core is contracts plus field ownership: each field has exactly one writer or an explicit merge rule.

### E5. 子 Agent 超时或崩溃后，父 Agent 怎么决定重试、接管还是终止？
**Q:** A sub-agent times out or crashes — how does the parent choose between retrying, taking over and stopping?

**答：**
- 子任务的结果要可识别：成功、失败或超时，加上原因和部分结果。
- 决策规则：
  - 暂时性错误且子任务幂等 → 退避后重试；
  - 多次失败 → 换策略（换模型、缩小范围）或者跳过，并在最终结果里标注缺口；
  - 关键子任务失败 → 终止并报告，或者转人工。
- 实现上：每个子任务有自己的超时；结果持久化，恢复时不会重复执行已完成的部分；用错误收集字段（比如 `errors` 加 reducer）汇总给父节点。

**A:**
- Sub-task results must be distinguishable: success, failure or timeout, with a reason and any partial result.
- Rules:
  - transient error and an idempotent task → retry with backoff;
  - repeated failure → change strategy (another model, narrower scope) or skip it and mark the gap in the final output;
  - a critical sub-task fails → stop and report, or escalate to a person.
- Implementation: per-task timeouts, persisted results so a resume doesn't redo finished work, and an error field with a reducer (e.g. `errors`) that rolls failures up to the parent.

### E6. 多个 Agent 同时修改同一份文件或状态时，怎么防止覆盖？
**Q:** How do you stop several agents from overwriting the same file or state?

**答：**
- 首选：按分区分配写权限，让每个 Agent 只写自己负责的部分，最后由一个节点合并。
- 必须共享时：
  - 用乐观并发：带版本号写入，冲突时重新读取并合并；
  - 或者加锁或租约，配合 fencing token，防止持有过期锁的旧 worker 再写入；
  - 状态字段用 reducer 合并，而不是直接覆盖。
- 参考实测（UCVC-AI-Lab-Agent 教程）：两个子 Agent 并行保存笔记，丢了一条（典型的丢失更新），加锁后解决。

**A:**
- Prefer partitioned ownership: each agent writes only its own part, and one node merges at the end.
- If sharing is unavoidable:
  - use optimistic concurrency (versioned writes; re-read and merge on conflict);
  - or locks/leases with fencing tokens so a stale worker holding an expired lock can't write;
  - merge state fields with reducers instead of overwriting.
- Reference measurement (UCVC-AI-Lab-Agent tutorial): two sub-agents saving notes in parallel lost one (a classic lost update); a lock fixed it.

### E7. 单 Agent 和多 Agent 的对照评测怎么做，才能保证口径一致？
**Q:** How do you compare single-agent and multi-agent fairly?

**答：** 只能改变编排方式，其他全部固定：
- 同一个模型和温度；
- 同样的工具和数据（我在实验里先把论文记忆读好，三种架构共用）；
- 同样的任务集和评测指标。

同时报告质量、调用次数、token、延迟和稳定性（多跑几次，看 pass^k），并说明样本量。参考实测（UCVC-AI-Lab-Agent 教程）里，覆盖率在三种架构下都是满分，已经饱和区分不出好坏，所以只能对成本、延迟和稳定性下结论。要比质量，得用更难的任务，或者用评委、人工评测。

**A:** Change only the orchestration and hold everything else fixed:
- the same model and temperature;
- the same tools and data (I read the paper memories once and shared them across the three architectures);
- the same task set and metrics.

Report quality, calls, tokens, latency and stability (repeat runs, pass^k), with sample sizes. In a reference measurement (UCVC-AI-Lab-Agent tutorial) coverage was saturated at full marks for all three, so the comparison could only conclude about cost, latency and stability; quality needs harder tasks or judge/human evaluation.

### E8. 子 Agent 的结论需要中心节点审查吗？
**Q:** Should a central node review sub-agent conclusions?

**答：** 要看错误的代价和能不能自动验证：
- 能用代码验证的（数字、引用、格式），在子 Agent 返回时就校验，不必经过中心节点；
- 主观的、高风险的，由中心节点或人工审查。

全部集中审查会造成瓶颈，也会让上下文膨胀；完全不审查，又会出现结论互相矛盾。折中做法：子 Agent 返回结构化结论并附上证据，中心节点只做冲突检测和抽查。

**A:** It depends on the cost of an error and whether it can be checked automatically:
- verify what code can check (numbers, citations, formats) as sub-agents return;
- send subjective or high-risk conclusions to the centre or a person.

Reviewing everything centrally creates a bottleneck and bloats context; reviewing nothing lets contradictions through. The middle ground: sub-agents return structured conclusions with evidence, and the centre only detects conflicts and spot-checks.

### E9. Anthropic 和 Cognition 对多 Agent 有不同观点，你怎么看？
**Q:** Anthropic and Cognition disagree about multi-agent systems — what's your view?

**答：**
- Anthropic（2025.6，研究系统）：一个主 Agent 带多个并行的子 Agent 做广度调研，内部评测比单 Agent 好 90.2%，但 token 多得多；他们也说明了，这种结构不适合需要大量共享上下文、依赖强的任务，比如大部分编程任务。
- Cognition（2025.6，《Don't Build Multi-Agents》）：并行的子 Agent 看不到彼此的决策，最后拼出来的结果不一致。主张共享完整上下文，并强调"每个动作都隐含着决策"。

我的看法：两者并不矛盾，关键在于任务的依赖程度。
- 广度优先、子任务独立 → 多 Agent；
- 一份产物需要处处一致，比如写代码 → 单 Agent，或者把子 Agent 当作只读的研究助手。

**A:**
- Anthropic (June 2025, research system): a lead agent with parallel sub-agents for breadth-first research beat a single agent by 90.2% on their internal eval, at a much higher token cost, and they noted it fits poorly where agents must share lots of context or depend tightly on each other, as in most coding.
- Cognition (June 2025, "Don't Build Multi-Agents"): parallel sub-agents can't see each other's decisions, so results conflict; share full context, because actions carry implicit decisions.

My view: they don't contradict each other — it depends on how interdependent the task is.
- Breadth-first, independent sub-tasks → multi-agent.
- One artefact that must be coherent everywhere, like code → a single agent, or sub-agents used as read-only researchers.

### E10. 多 Agent 系统常见的失败模式有哪些？
**Q:** What are common multi-agent failure modes?

**答：** MAST 论文（2025，《Why Do Multi-Agent LLM Systems Fail?》）把 14 种失败归成三类，每一类在实际项目里都能找到例子（面试时换成你自己项目里的例子）：

| 类别 | 例子 |
|---|---|
| 规格和系统设计问题 | 一个客流预测报告 Agent 里 Analyst 和 Reviewer 的要求互相矛盾；一个文献综述 Agent 汇总时截断 |
| Agent 之间协作失配 | 重试时丢了上下文；上游的空结果被下游当成正常输入 |
| 任务验证和终止问题 | 修订后不复审；反思失败时当作"没问题" |

预防办法：契约、代码验证、失败必须可见、有上限的循环和评测集。

**A:** The MAST paper (2025, "Why Do Multi-Agent LLM Systems Fail?") groups 14 failure modes into three categories, each of which shows up in real projects (use examples from your own project):

| Category | Examples |
|---|---|
| specification and system design | contradictory Analyst/Reviewer rules in a visitor-forecast report agent; truncation in a literature-review agent's assembly step |
| inter-agent misalignment | retries that lost context; downstream steps treating an empty upstream result as normal |
| task verification and termination | no re-review after revision; reflection treating parse failures as "no issues" |

Prevention: contracts, code verification, visible failures, capped loops and eval sets.

### E11. Sequential、Concurrent、Hybrid 三种编排分别是什么？怎么选？
**Q:** What are sequential, concurrent and hybrid orchestration, and how do you choose?

**答：**

| 编排 | 做法 | 适合 | 代价 |
|---|---|---|---|
| Sequential | 每个 Agent 处理上一个 Agent 的输出 | 阶段之间有强依赖（先取数，再分析，再写作） | 总延迟是各阶段之和；上游的错误会传到下游 |
| Concurrent | 同一份输入同时交给多个 Agent，各自从不同角度处理，最后汇总；也包括"不同输入、同一个角色"的分块并行 | 多视角分析；或者子任务互相独立（逐篇读论文） | token 成倍增加；需要汇总和调和冲突；可能部分分支失败 |
| Hybrid | 顺序主干，加局部并行，加有次数上限的循环 | 大多数生产系统 | 设计和调试更复杂 |

怎么选：先画依赖图。有依赖的步骤保持顺序，没有依赖的就并行，需要质量保证的地方加有上限的循环。参考实测（UCVC-AI-Lab-Agent 教程）：一个文献综述 Agent 和一个报告 Agent 原版都是 sequential；文献综述 Agent 改成 hybrid 后，调用次数不变，快了 3 倍。

**A:**

| Pattern | How it works | Fits | Costs |
|---|---|---|---|
| sequential | each agent processes the previous agent's output | stages with strong dependencies (fetch, then analyse, then write) | latency is the sum of the stages; upstream errors flow downstream |
| concurrent | the same input goes to several agents at once, each from its own angle, then results are aggregated; also "different inputs, same role" sectioning | multiple perspectives, or independent sub-tasks (one agent per paper) | multiplied tokens; aggregation and conflict resolution; partial failures |
| hybrid | a sequential backbone plus local parallelism plus capped loops | most production systems | more complex to design and debug |

To choose, draw the dependency graph: keep dependent steps sequential, run independent ones concurrently, and add capped loops where quality needs checking. Reference measurement (UCVC-AI-Lab-Agent tutorial): a literature-review agent and a report agent both started sequential; moving the literature-review agent to a hybrid kept the call count the same and made it 3× faster.

### E12. 顺序编排最大的风险是什么？怎么防？
**Q:** What is the biggest risk of sequential orchestration, and how do you guard against it?

**答：** 最大的风险是错误会顺着流程往下传：每个 Agent 都信任上一个 Agent 的输出，到了末端已经很难发现。

参考实测（UCVC-AI-Lab-Agent 教程）：在一个客流预测报告 Agent 上做实验，让负责取数的 Collector 返回比实际大 10 倍的预测数据。
- 下游的 Analyst 和 Writer 照常写出了报告；
- 末端的数字核对显示 **0 个问题**，因为每个数字确实都能在（已经错了的）数据包里找到；
- 模型其实察觉到了矛盾，却自己编了一个"统计口径不一致"的解释，然后写完了整份报告。

防法：在每个交接处做契约校验和合理性检查，尽早失败。同一个实验里，在 Collector 后面加一道确定性的校验门（预测值和实际值之比、峰值和承载上限之比），0 次 LLM 调用就拦了下来，并列出 4 条具体问题。

**A:** The biggest risk is that errors flow downstream: every agent trusts its predecessor, so by the end the error is hard to see.

Reference measurement (UCVC-AI-Lab-Agent tutorial): in an experiment on a visitor-forecast report agent, the data-fetching Collector was made to return forecasts 10× too large:
- the Analyst and Writer produced a normal-looking report;
- the end-of-pipeline number check found **0 issues**, because every number really was in the (corrupted) package;
- the model even noticed the mismatch but invented a "definition mismatch" explanation and wrote the whole report anyway.

The defence is contract validation and sanity checks at every handoff, failing fast. In the same experiment, a deterministic gate after the Collector (forecast vs actual ratio, peak vs capacity) stopped the run with 0 LLM calls and listed 4 concrete problems.

### E13. Concurrent 编排什么时候值得用？有数据吗？
**Q:** When is concurrent orchestration worth it, and do you have data?

**答：** 当各个视角或子任务真正独立、而且都有实质内容时值得用。参考实测（UCVC-AI-Lab-Agent 教程）：在一个客流预测报告 Agent 上，三个专家（趋势、承载风险、驱动因素）同时分析同一份数据包，和单个分析师对比：

| 指标 | 单个分析师 | 三专家并行 |
|---|---|---|
| 分析阶段耗时 | 20.0 秒 | 8.0 秒（由最慢的分支决定） |
| 总耗时 | 28.1 秒 | 17.5 秒 |
| 调用次数 | 2 | 4 |
| token | 9,896 | 12,740（多 29%） |
| 洞察数 | 7 | 9 |

但"多"不等于"好"。这份数据的驱动因素只有一个主题（"历史客流走势"占 100%），所以驱动因素专家的 3 条洞察基本在重复说同一件事。按视角拆分，要看数据里每个维度是否真的有独立的内容。

**A:** It's worth it when the perspectives or sub-tasks are truly independent and each has real substance. Reference measurement (UCVC-AI-Lab-Agent tutorial): on a visitor-forecast report agent, three specialists (trend, capacity/risk, drivers) analysing the same package in parallel were compared against a single analyst:

| Metric | single analyst | 3 concurrent specialists |
|---|---|---|
| analysis stage | 20.0 s | 8.0 s (set by the slowest branch) |
| total time | 28.1 s | 17.5 s |
| calls | 2 | 4 |
| tokens | 9,896 | 12,740 (+29%) |
| insights | 7 | 9 |

More isn't better, though: the drivers data had a single theme ("historical trend" at 100%), so that specialist's 3 insights largely repeated one point. Split by perspective only where each dimension has independent content.

### E14. 并行分支中有一个失败了，会发生什么？怎么处理？
**Q:** What happens when one parallel branch fails, and how do you handle it?

**答：** 在 LangGraph 里，同一批并行执行的分支中只要有一个抛出未捕获的异常，这一批就会整体失败，其他成功的分支也拿不到下游。处理方法：
- 在分支内部捕获异常，返回 `None` 加上错误信息，错误用 reducer 收集起来；
- 汇总节点记录缺了哪个视角；
- 下游根据缺失情况决定继续还是终止，并在结果里说明。

参考实测（UCVC-AI-Lab-Agent 教程）里，让驱动因素专家模拟超时：另外两个专家的 6 条洞察照常汇总，报告照常交付，一共 3 次调用，并且记录了缺失的视角。

另外，配了 checkpointer 的话，LangGraph 会把同一批里成功分支的结果保存为待写入的数据，恢复运行时不会重跑这些分支。

**A:** In LangGraph, an uncaught exception in any branch of a parallel batch fails the whole batch, so even the successful branches don't reach downstream. To handle it:
- catch exceptions inside the branch and return `None` plus an error, collected with a reducer;
- have the aggregator record which perspective is missing;
- let downstream decide whether to continue or stop, and say so in the output.

When I simulated a timeout in the drivers specialist, the other two specialists' 6 insights were aggregated and the report was still delivered — 3 calls in total, with the missing perspective recorded.

With a checkpointer, LangGraph also saves the successful branches' results from that batch as pending writes, so a resume doesn't rerun them.

### E15. 并行结果怎么汇总？
**Q:** How do you aggregate concurrent results?

**答：** 三种做法：
1. 代码汇总：拼接，标注来源，记录缺失的部分。确定、便宜、可测试，我在实验里用的就是这种。
2. LLM 汇总：能去重、调和冲突、写出统一的结论，但要多一次调用，也可能丢掉信息或引入幻觉，所以汇总结果也需要校验。
3. 投票或多数决：多个 Agent 回答同一个判断题，适合分类和打分。但如果各 Agent 有相同的偏差，投票也纠正不了。

不管哪种做法，都要保留各分支的原始结果和来源，方便追溯；结论互相冲突时要显式标出来，不要悄悄选一个。

**A:** Three options:
1. Code aggregation: concatenate, tag sources and record what's missing — deterministic, cheap and testable; it's what I used.
2. An LLM aggregator: it can deduplicate, reconcile conflicts and write one conclusion, but it costs another call and may drop information or hallucinate, so its output needs checking too.
3. Voting or majority: several agents answer the same judgement question — good for classification and scoring, but it can't correct a bias they all share.

Whichever you use, keep each branch's raw result and source for traceability, and surface conflicts explicitly instead of silently picking one.

### E16. 怎么把一个顺序流水线改造成 Hybrid？
**Q:** How do you turn a sequential pipeline into a hybrid?

**答：**
1. 逐节点计时，找出关键路径。
2. 画依赖图：每个节点实际读了哪些字段。
3. 有依赖的保持顺序，没有依赖的改成并行：多条边，加汇合边 `add_edge([a, b, c], d)`。
4. 对"同一操作作用在多个对象上"的步骤，用 `Send` 做 fan-out，比如逐篇读论文、逐章写作。
5. 给并行写入的字段加 reducer，节点只返回自己更新的部分。
6. 需要质量控制的地方用子图加条件循环，并设上限。
7. 加 checkpointer 和 `max_concurrency`。

参考实测（UCVC-AI-Lab-Agent 教程）：在一个文献综述 Agent 上，只改编排，耗时从 588 秒降到 264 秒；再修复根因后降到 103 秒。在一个简化版上做对照，混合版比纯顺序版快 3.0 倍（28.8 秒对 9.7 秒），调用次数相同。

**A:**
1. Time each node and find the critical path.
2. Draw the dependency graph: which fields each node actually reads.
3. Keep dependent steps sequential and make independent ones concurrent: multiple edges plus a join with `add_edge([a, b, c], d)`.
4. Use `Send` to fan out steps that apply the same operation to many items, such as reading each paper or writing each section.
5. Add reducers for fields written in parallel, and have nodes return partial updates.
6. Put quality control in subgraphs with conditional loops, capped.
7. Add a checkpointer and `max_concurrency`.

Reference measurement (UCVC-AI-Lab-Agent tutorial): on a literature-review agent, orchestration changes alone took it from 588 s to 264 s, and root-cause fixes to 103 s. In a simplified controlled comparison, the hybrid ran 3.0× faster than the purely sequential version (28.8 s vs 9.7 s) with the same number of calls.

### E17. Hybrid 架构里的质量循环要注意什么？
**Q:** What do you watch for in the quality loops inside a hybrid?

**答：**
- 每次修订后都要重新检查。一个常见漏洞就是修订后不复审：参考实现（UCVC-AI-Lab-Agent 教程）里，一个经营报告 Agent 的原版修订后不复审，一个顺序执行的对照版一开始也漏了这一步。
- 设轮数上限。到达上限时，必须把没解决的问题标记出来，不能悄悄交付。参考实测（UCVC-AI-Lab-Agent 教程）：有一个章节修订一次后仍然只覆盖了 3 篇论文，因为到了上限就被当作通过交付了；解决办法是加一个 `unresolved` 字段专门记录这类情况。
- 保留问题最少的那一版，因为修订也可能让结果变差。
- 检查最好用代码做（论文覆盖数、数字能否追溯），LLM 评审要先校准。

**A:**
- Re-check after every revision. A common gap is skipping the re-check: in the reference implementation (UCVC-AI-Lab-Agent tutorial), a report-writing agent's original version didn't re-check, and a sequential baseline initially missed it too.
- Cap the rounds, and when the cap is hit, record what's still unresolved instead of shipping silently. Reference measurement (UCVC-AI-Lab-Agent tutorial): one section still covered only 3 papers after its single revision and was shipped as if it had passed; the fix was an `unresolved` field.
- Keep the version with the fewest problems, since a revision can make things worse.
- Prefer code checks (papers covered, traceable numbers), and calibrate any LLM reviewer first.

### E18. 并发会带来哪些工程问题？
**Q:** What engineering problems does concurrency introduce?

**答：**
- 限流：并发越高越容易触发 429，要设 `max_concurrency`，并做退避重试。
- 状态冲突：并行写同一个字段需要 reducer，外部资源需要锁或版本号。
- 结果顺序不确定：比如并行读论文后记忆列表的顺序每次不同，下游不能依赖顺序。
- 成本：并发省的是时间，不省钱；同一份输入发给多个 Agent，token 是成倍的。
- 调试和观测：要用链路追踪看清每个分支的耗时和错误。
- 部分失败的处理（见 E14）。

**A:**
- Rate limits: higher concurrency hits 429s sooner, so set `max_concurrency` and back off.
- State conflicts: fields written in parallel need reducers, and external resources need locks or versioning.
- Non-deterministic ordering: e.g. the order of paper memories varies run to run, so downstream steps can't rely on it.
- Cost: concurrency saves time, not money; sending the same input to several agents multiplies tokens.
- Debugging and observability: you need tracing to see each branch's timing and errors.
- Partial failures (see E14).

### E19. 除了这三种，还有哪些常见的编排模式？
**Q:** Besides these three, what other orchestration patterns are common?

**答：** 微软 Azure 的 AI Agent 编排模式文档里，除了 sequential 和 concurrent，还有三种：
- Group chat：多个 Agent 在一个共享对话里讨论，由管理者决定下一个发言的人，适合头脑风暴和评审。
- Handoff：当前 Agent 判断自己处理不了，就把控制权交给更合适的 Agent，适合多领域客服。
- Magentic：一个管理者 Agent 动态制定并更新任务清单，协调多个专业 Agent，适合开放式的复杂问题。

再加上 Supervisor 和 Orchestrator-workers，这些都属于"由 LLM 决定下一步"的模式。它们更灵活，但参考实测（UCVC-AI-Lab-Agent 教程）显示 Supervisor 慢约 2 倍，而且执行路径不稳定，所以硬约束要写在代码里。

**A:** Microsoft's Azure guide on AI agent orchestration patterns lists three more alongside sequential and concurrent:
- Group chat: agents discuss in a shared thread while a manager picks the next speaker — good for brainstorming and review.
- Handoff: the current agent passes control to a better-suited agent when it can't handle the request — good for multi-domain support.
- Magentic: a manager agent builds and updates a task ledger dynamically while coordinating specialist agents — for open-ended, complex problems.

Together with supervisor and orchestrator-workers, these let the LLM decide what happens next. They're more flexible, but in a reference measurement (UCVC-AI-Lab-Agent tutorial) a supervisor was about 2× slower and took different paths on repeated runs, so hard limits belong in code.

---

## F. 状态、可靠性与恢复 / State, reliability and recovery

### F1. Agent 服务重启后要继续任务，需要持久化哪些字段？
**Q:** What must be persisted so an agent can resume after a restart?

**答：**
- 任务身份：thread_id 或 task_id、用户和租户、原始请求；
- 当前进度：执行到哪个节点或步骤、下一步是什么；
- 中间产物：已完成步骤的结果，以及这些结果对应的输入版本；
- 工具调用记录：每次调用的 ID、参数、结果和状态（尤其是有副作用的调用）；
- 等待中的事项：比如人工审批请求；
- 预算消耗：步数、token；
- 错误和重试次数。

LangGraph 的 checkpointer 按节点自动保存状态，换成 SQLite 或 Postgres 的版本就能跨进程恢复。参考实测（UCVC-AI-Lab-Agent 教程）：在 assemble 节点处制造崩溃后续跑，只重跑了 assemble，29 秒，1 次调用。

**A:**
- Task identity: thread/task ID, user and tenant, the original request.
- Progress: the current node or step and what comes next.
- Intermediate artefacts: results of completed steps and the input versions they came from.
- Tool-call records: ID, arguments, result and status for each call, especially side-effecting ones.
- Pending items such as an approval request.
- Budget used: steps and tokens.
- Errors and retry counts.

LangGraph checkpointers save state per node; with SQLite or Postgres it survives process restarts. In a reference measurement (UCVC-AI-Lab-Agent tutorial), after a crash at assemble, the resume reran only assemble: 29 s, 1 call.

### F2. 写操作（比如创建工单）请求超时、结果未知，怎么恢复才不会重复创建？
**Q:** A write (e.g. creating a ticket) times out with an unknown result — how do you recover without duplicating it?

**答：**
- 每次调用带一个幂等键（idempotency key），比如 task_id 加步骤号；服务端记录已经处理过的键，重复的请求直接返回之前的结果。
- 恢复时先读后写：按幂等键或业务键查询是否已经创建过。
- 工具的调用状态单独持久化：已发出、已确认、已失败。

不能让模型去"判断上次是否成功"，这件事必须由代码根据事实来判断。

**A:**
- Send an idempotency key with each call (e.g. task_id plus step number); the server records processed keys and returns the earlier result for repeats.
- On recovery, read before writing: look up by idempotency key or business key whether it already exists.
- Persist tool-call status separately: sent, confirmed, failed.

Never ask the model whether the last call succeeded — code decides from the facts.

### F3. 超时、取消和重试怎么配合，避免用户取消后工具还在产生副作用？
**Q:** How do timeouts, cancellation and retries interact, so a cancelled task doesn't keep causing side effects?

**答：**
- 取消信号要能传到每个正在执行的步骤：用协作式取消，每一步执行前检查取消标志；
- 重试之前检查任务是否已被取消；
- 已经发出的副作用不能撤回时，记录下来并做补偿操作（比如撤销已创建的工单）；
- 超时分两层：单步超时和整体超时；
- 只有幂等的操作才能自动重试。

**A:**
- Propagate cancellation to every running step (cooperative cancellation, checking a flag before each step).
- Check for cancellation before retrying.
- Record side effects that can't be undone and run compensating actions (e.g. cancel a created ticket).
- Use per-step and overall timeouts.
- Auto-retry only idempotent operations.

### F4. 人工审批放在规划、参数确认还是执行阶段？各有什么边界？
**Q:** Should human approval sit at planning, argument confirmation or execution, and what are the boundaries?

**答：**
- 规划阶段审批：适合高成本的长任务，能尽早纠正方向；但计划可能和实际执行不一致。
- 参数确认阶段：在执行写操作或敏感操作之前展示具体参数（金额、收件人），最常用，也最精确。
- 执行结果审批：适合"交付前审核"，比如报告发布前。

举例：一个用 LangGraph 实现的经营报告 Agent，可以把审批放在报告交付之前，用 `interrupt()` 暂停，审批人可以批准，也可以带意见退回；退回后的报告要重新经过数字核对。（面试时换成你自己项目里的例子）

**A:**
- At planning: good for expensive long tasks, correcting direction early, but execution may diverge from the plan.
- At argument confirmation: show the concrete arguments (amount, recipient) before writes or sensitive actions — the most common and most precise.
- At results: review before delivery, e.g. before a report is published.

For example, a report-writing agent built on LangGraph can place approval before delivery with `interrupt()`; the approver can approve or send it back with feedback, and the revised report goes through the number check again. (Use an example from your own project.)

### F5. 中断恢复后，怎么防止重复执行已经完成的步骤？
**Q:** After resuming, how do you avoid re-running completed steps?

**答：**
- 每一步完成后保存 checkpoint，恢复时从最后一个 checkpoint 继续。
- 有副作用的步骤必须幂等，因为"执行完了但还没来得及保存 checkpoint"的窗口一定存在。
- 节点内部的批量子任务（比如逐篇论文），按子任务粒度保存结果，跳过已完成的部分。

LangGraph 并行的 superstep 里，如果有一个分支失败，已经成功的分支结果会作为待写入的数据保存下来，恢复时不会重跑这些分支。

**A:**
- Checkpoint after each step and resume from the last checkpoint.
- Make side-effecting steps idempotent, because a window between "done" and "checkpoint saved" always exists.
- For batches inside one node (e.g. one paper at a time), save results per item and skip completed ones.

In a LangGraph parallel superstep, if one branch fails, the successful branches' results are saved as pending writes and aren't rerun on resume.

### F6. 长时间运行的任务出现目标漂移，你会记录和比较哪些证据？
**Q:** A long-running task drifts from its goal — what evidence do you record and compare?

**答：**
- 原始目标和验收标准要固定在状态里，每一步都可以拿来对照；
- 记录每一步的计划、动作和理由（trace）；
- 定期让检查节点对比"当前产出"和"原始目标"，并核对验收清单；
- 记录上下文的变化：压缩丢了什么、新加了什么。

发现漂移时，回到最近一个满足目标的 checkpoint 重新规划。

**A:**
- Pin the original goal and acceptance criteria in state so every step can be checked against them.
- Trace each step's plan, action and rationale.
- Run periodic checks comparing current output with the goal and the acceptance checklist.
- Log context changes: what compression dropped and what was added.

On drift, return to the last checkpoint that met the goal and replan.

---

## G. 评测 / Evaluation

### G1. 为什么评测 Agent 比评测基础 LLM 难？评测分几层？
**Q:** Why is evaluating agents harder than evaluating base LLMs, and what are the layers?

**答：**
- 难在：结果不唯一；运行不确定；涉及多步过程；有外部环境和副作用；单次评测的成本高。
- 分四层：

| 层次 | 评什么 | 怎么判 |
|---|---|---|
| 组件层 | 工具调用、检索 | 规则匹配，比如 AST 匹配、Hit@K |
| 过程层 | 执行轨迹：工具的选择和顺序、有没有多余的步骤 | 和期望轨迹比对 |
| 结果层 | 任务是否完成 | 精确匹配，或带参考答案的 LLM 评委 |
| 系统层 | 延迟、成本、稳定性（pass^k） | 统计数据 |

原则：能用规则判断对错的，就不用 LLM；必须用 LLM 评委的，要先校准评委本身。

**A:**
- It's harder because outputs aren't unique, runs vary, there are many steps, there's an external environment with side effects, and each run is expensive.
- Four layers:

| Layer | What's evaluated | How it's judged |
|---|---|---|
| component | tool calls, retrieval | rule matching, e.g. AST matching, Hit@K |
| trajectory | tool choice and order, unnecessary steps | comparison with the expected trajectory |
| outcome | task completion | exact match or a reference-backed LLM judge |
| system | latency, cost, stability (pass^k) | statistics |

Use rules where you can; calibrate the judge where you can't.

### G2. 你了解哪些专门评测 Agent 能力的基准？
**Q:** Which agent benchmarks do you know?

**答：**
- BFCL（Berkeley Function Calling Leaderboard）：通过 AST 匹配评测工具调用，分单工具、多工具选择、并行、不该调用等类别，后续版本加入了多轮和 agentic 任务。
- τ-bench（Sierra 公司）：让 Agent 和模拟用户在零售、航空场景里交互，用 pass^k 衡量可靠性。
- GAIA：通用助手任务，分 3 个难度等级，答案短且唯一，可以用规则精确判分。
- SWE-bench / SWE-bench Verified：修复真实的 GitHub issue，用测试是否通过来判断。
- WebArena：在真实网站环境里完成任务。
- AgentBench：覆盖多种环境的综合评测。

我自己仿照 BFCL 写过一个评测：36 道题，10 个工具，其中 6 个是干扰项。

**A:**
- BFCL (Berkeley Function Calling Leaderboard): AST-matched tool calls across simple, multiple, parallel and irrelevance categories, with multi-turn and agentic tasks in later versions.
- τ-bench (Sierra): agents interacting with simulated users in retail and airline settings, measured by pass^k.
- GAIA: general-assistant tasks in 3 difficulty levels with short, unique answers that can be scored exactly.
- SWE-bench / SWE-bench Verified: fixing real GitHub issues, judged by whether tests pass.
- WebArena: tasks in realistic web environments.
- AgentBench: a multi-environment suite.

I built a BFCL-style eval of my own: 36 cases with 10 tools, 6 of them distractors.

### G3. pass@k 和 pass^k 有什么区别？
**Q:** What's the difference between pass@k and pass^k?

**答：**
- pass@k：k 次运行里至少有一次成功，适合"可以生成多个、由人挑一个"的场景，比如代码生成。
- pass^k：k 次运行全部成功，衡量可靠性。Agent 上线时应该看 pass^k。

我的实测：temperature=0.7，36 道题，跑 3 次。
- qwen2.5:7b：pass@1 是 0.90，pass^3 只有 0.89。"北京明天会下雨吗"这道题时对时错。
- DeepSeek：三项都是 0.97。

另外，样本少时估计有噪声：DeepSeek 有一道题前 3 次都错，第 4 次又对了。

**A:**
- pass@k: at least one of k runs succeeds — right when a person can pick from several attempts, e.g. code generation.
- pass^k: all k runs succeed — a reliability measure, and what matters for deployed agents.

My numbers at temperature 0.7, 36 cases, 3 runs:
- qwen2.5:7b had pass@1 0.90 but pass^3 0.89, with "Will it rain in Beijing tomorrow?" flipping between runs.
- DeepSeek scored 0.97 on all three.

Small samples are noisy: one DeepSeek case failed 3 runs and passed on the 4th.

### G4. LLM-as-a-Judge 有哪些优点和偏差？怎么校准？
**Q:** What are the strengths and biases of LLM-as-a-judge, and how do you calibrate it?

**答：**
- 优点：便宜、快，能评主观质量。
- 已知的偏差：位置偏差、长度偏差、偏爱自家模型、受文风影响，以及不知道私有事实。

我的实测：
- 私有事实（评委不可能知道的数据）用模糊打分时，和标注的一致率只有 0.50，而且给错误但流畅的答案打 3.8 分，高于正确答案的 2.5 分；
- 给了参考答案、按评分标准判断后，一致率是 1.00；
- 两个回答质量接近时，交换位置后只有 7/18 的结论保持一致；
- 长度偏差没有出现：评委反而给啰嗦的正确答案打了低分（6.1）。

做法：
- 提供参考答案或证据，并写清评分标准；
- 交换位置各评一次，两次不一致就算平局；
- 用人工标注过的数据计算一致率（或 kappa），先校准评委；
- 评委看到的证据要和被评系统看到的一致（证据对等）。

**A:**
- Strengths: cheap, fast, able to assess subjective quality.
- Known biases: position, length, self-preference, style, and blindness to private facts.

My measurements:
- on private facts the judge couldn't know, vague scoring agreed with labels only 0.50 of the time and gave fluent wrong answers 3.8 versus 2.5 for correct ones;
- with a reference and a rubric, agreement was 1.00;
- on near-equal pairs, the verdict survived a position swap only 7/18 times;
- length bias didn't appear — the judge actually penalised padded correct answers (6.1).

Practice:
- give references or evidence and an explicit rubric;
- judge in both orders, and call it a tie when they disagree;
- calibrate against human labels (agreement or kappa);
- keep evidence parity — the judge sees what the system saw.

### G5. 怎么构建 Agent 的端到端评测集？用模型合成测试题时怎么检查质量？
**Q:** How do you build an end-to-end agent eval set, and how do you check synthetic test cases?

**答：**
- 题目来源：真实线上请求（脱敏后）、专家编写的题、从失败案例里补的题，以及合成题。
- 覆盖维度：正常场景、边界情况、信息缺失、干扰工具、有先后依赖的任务、多轮对话、工具失败、恶意输入。按类别统计，避免简单题的高分掩盖难题。
- 合成题要检查：答案能否由事实来源验证、去重、难度分布、人工抽检一部分。

我的经验：简单题集上两个模型都是满分，已经饱和；必须加难题集，才拉开了 16/16 对 13/16 的差距。

**A:**
- Sources: anonymised real requests, expert-written cases, cases added from failures, and synthetic cases.
- Coverage: normal cases, edge cases, missing information, distractor tools, sequential dependencies, multi-turn, tool failures and adversarial input — reported per category so easy wins don't hide hard failures.
- For synthetic cases, check that answers are verifiable against a source, deduplicate, check the difficulty spread, and spot-check by hand.

In my eval the easy set saturated with both models at full marks; only a hard set separated them, at 16/16 versus 13/16.

### G6. 换了能力更强的模型，任务成功率反而下降，你会怎么归因？
**Q:** A stronger model lowers task success — how do you attribute the cause?

**答：** 按层次排查：
1. 看哪些类别、哪些题失败了，对比失败轨迹，而不只是看总分。
2. 检查接口差异：工具调用格式、参数风格、结构化输出、thinking 是否会抢占 `max_tokens`。我在两个项目里都遇到过：开启 thinking 后输出被截断成空。
3. 检查提示词是否针对旧模型过拟合。
4. 检查默认参数是否变了：温度、超时、上下文长度。
5. 排除评测本身的问题：评委是否变了，测试集是否泄漏。

每次只改一个因素，做 A/B 对比。

**A:** Work through the layers:
1. Which categories and cases failed? Compare failure trajectories, not just the total.
2. Check interface differences: tool-call format, argument style, structured output, and whether thinking eats `max_tokens` — in both of my projects thinking truncated outputs to empty.
3. Check whether prompts were overfitted to the old model.
4. Check changed defaults: temperature, timeouts, context length.
5. Rule out evaluation problems: a changed judge, or test-set leakage.

Change one factor at a time and A/B test.

### G7. 怎么把线上 trace 变成回归样本？上线后要监控哪些指标？
**Q:** How do you turn production traces into regression cases, and what do you monitor after launch?

**答：**
- 回归样本：从链路追踪（LangSmith、Langfuse、OpenTelemetry）里挑出失败或差评的 trace，固定当时的输入、工具返回值（mock）和期望结果，加入评测集，放进 CI。我写过一个 pytest 门禁：只把工具说明改短，准确率就从 1.00 降到 0.92，被门禁拦下来了。
- 线上监控：
  - 任务成功率；
  - 拒答和转人工率；
  - 工具错误率；
  - 每个任务的步数和 token；
  - P95 延迟；
  - 成本；
  - 用户反馈（点赞点踩、重新生成）；
  - 抽样请求交给评委打分，看质量趋势。

**A:**
- Regression cases: pick failed or downvoted traces from tracing (LangSmith, Langfuse, OpenTelemetry), freeze the inputs, tool outputs (as mocks) and expected results, add them to the eval set, and run them in CI. In my pytest gate, merely shortening tool descriptions dropped accuracy from 1.00 to 0.92 and the gate blocked it.
- Production monitoring:
  - task success rate;
  - refusal and escalation rates;
  - tool error rate;
  - steps and tokens per task;
  - P95 latency;
  - cost;
  - user feedback (thumbs, regenerations);
  - judge scores on sampled traffic to track quality trends.

### G8. 规则评分、模型评审和人工 Review 怎么组合，避免互相矛盾？
**Q:** How do you combine rule scoring, model judging and human review without contradictions?

**答：** 按层分工：
- 规则：负责客观的硬指标（格式、数字、引用、工具调用是否正确），没通过就直接判失败；
- 模型评委：只评主观维度，并给出理由；
- 人工：定期抽检、处理分歧，并维护校准集。

规则失败时不再交给评委；评委和人工意见不一致时，回头修正评委的提示词或评分标准。例如一个经营报告 Agent 可以这样分工：用代码核对数字，LLM 只评"建议是否可执行"。

**A:** Split by layer:
- rules handle objective hard checks (format, numbers, citations, tool-call correctness), and failing them fails the case;
- the model judge scores only subjective dimensions, with reasons;
- humans spot-check, resolve disagreements and maintain a calibration set.

Rule failures don't go to the judge; judge–human disagreements lead to fixes in the judge's prompt or rubric. For a report-writing agent, for example, that split means code checks numbers, and the LLM judges only whether recommendations are actionable.

### G9. 简历上写"准确率从七成提升到接近九成"，怎么交代口径？
**Q:** Your résumé says "accuracy rose from ~70% to ~90%" — how do you explain the measurement?

**答：** 要说清楚六件事：
1. 分母：多少道题，来自哪里；
2. 题目分布：类别和难度；
3. 判对标准：规则还是评委，评委有没有校准；
4. 对比条件：只改了什么，其他是否都固定；
5. 运行次数：结果是否稳定（pass^k）；
6. 局限。

我的例子："同一组 8 篇论文、同一个模型，单次运行，耗时从 588 秒降到 103 秒；6 个章节全部胜出，但这 6 章来自同一次运行，样本不独立。"

**A:** Explain six things:
1. the denominator — how many cases, from where;
2. the distribution — categories and difficulty;
3. the scoring — rules or a calibrated judge;
4. the comparison — exactly what changed, with everything else fixed;
5. the runs — whether results were stable (pass^k);
6. the limitations.

My example: "Same 8 papers, same model, one run: 588 s to 103 s; v2b won all 6 sections, but those sections come from one run, so they aren't independent samples."

---

## H. 安全与治理 / Safety and governance

### H1. 检索到的文档里夹带了越权指令，为什么只强化系统提示词还不够？
**Q:** Retrieved documents carry malicious instructions — why isn't a stronger system prompt enough?

**答：** 因为模型没有办法可靠地区分"指令"和"数据"，提示词只是一种概率性的防护，攻击者可以不断改写措辞来绕过。要靠架构来防：
- 把外部内容标记为不可信的数据；
- 用最小权限，让 Agent 拿不到危险工具；
- 敏感动作需要人工确认；
- 对输出做过滤；
- 双 LLM 模式：读不可信内容的模型没有工具权限。

参考实测（UCVC-AI-Lab-Agent 教程）：工具投毒确实成功了，模型把藏在描述里的标记写进了笔记，最后靠指纹白名单和扫描器才拦住。

**A:** The model can't reliably separate instructions from data; prompts are probabilistic defences that attackers can rephrase around. Defend through architecture:
- mark external content as untrusted data;
- least privilege, so the agent can't reach dangerous tools;
- human confirmation for sensitive actions;
- output filtering;
- a dual-LLM pattern, where the model that reads untrusted content has no tool access.

Reference measurement (UCVC-AI-Lab-Agent tutorial): tool poisoning actually worked — the model copied a hidden marker into its notes — and only fingerprint allowlists plus a scanner stopped it.

### H2. Agent 会读不可信内容又能调用工具，怎么防止数据外泄？
**Q:** An agent reads untrusted content and can call tools — how do you prevent data exfiltration?

**答：** 警惕"致命三要素"同时出现：能接触私有数据、会读取不可信内容、能向外部通信。三者同时存在时就有外泄风险。防护办法：
- 拆掉其中一个要素：比如读取不可信内容的会话里不给外发工具；
- 外发目标用白名单；
- 外发的内容要先给人确认；
- 禁止模型渲染任意 URL 或图片（这是常见的外泄通道）；
- 记录审计日志。

**A:** Watch for the "lethal trifecta": access to private data, exposure to untrusted content, and the ability to communicate externally. When all three are present, data can leak. Defences:
- remove one leg — e.g. no outbound tools in sessions that read untrusted content;
- allowlist destinations;
- have a person confirm outbound content;
- don't let the model render arbitrary URLs or images (a common exfiltration channel);
- keep audit logs.

### H3. 执行模型生成的代码时，沙箱要限制哪些能力？
**Q:** When executing model-generated code, what should the sandbox restrict?

**答：**
- 文件系统：只能访问指定目录，并尽量只读；
- 网络：默认禁止，或者只允许访问白名单；
- 资源：CPU、内存、执行时间、进程数都要设上限；
- 系统调用和权限：非 root 运行，禁止提权；
- 不能接触密钥和环境变量；
- 每次执行使用独立的容器或 microVM，用完销毁；
- 输出大小受限。

多租户时，每个租户使用独立的沙箱和凭据。

**A:**
- Filesystem: only a designated directory, read-only where possible.
- Network: blocked by default, or allowlisted.
- Resources: caps on CPU, memory, run time and process count.
- Syscalls and privileges: run as non-root, no privilege escalation.
- No access to secrets or environment variables.
- A fresh container or microVM per run, destroyed afterwards.
- Limits on output size.

With multiple tenants, each gets its own sandbox and credentials.

### H4. 怎么给 Agent 加护栏（guardrails）？
**Q:** How do you implement guardrails for agents?

**答：** 分几层：
- 输入护栏：检测注入和越权请求，判断请求是否在服务范围内；
- 工具护栏：参数校验、权限校验、限流，高风险操作需要审批；
- 输出护栏：格式、敏感信息、事实核对（比如用代码核对数字）；
- 运行护栏：步数和预算上限、超时、熔断。

护栏规则尽量用确定性代码实现，LLM 分类器只作为补充。每一层都要评测：拦截率和误拦率。

**A:** In layers:
- input: detect injection and out-of-scope or unauthorised requests;
- tools: argument and permission checks, rate limits, approvals for risky actions;
- output: format, sensitive data, fact checks (e.g. code checks on numbers);
- runtime: step and budget limits, timeouts, circuit breakers.

Implement rules deterministically where possible, with LLM classifiers as a supplement, and measure each layer's block rate and false-block rate.

### H5. 怎么证明一次工具操作是可审计的，而不只是日志里出现了工具名？
**Q:** How do you prove a tool action is auditable, beyond its name appearing in a log?

**答：** 审计记录要能回答"谁、为什么、做了什么、结果如何"：
- 发起的用户和会话；
- 当时的模型输入摘要和决策理由；
- 工具名、完整参数（敏感字段脱敏）、调用 ID、时间戳；
- 权限检查和审批记录：谁批准的；
- 返回结果和副作用的 ID，比如工单号；
- 用到的模型、提示词版本和工具版本。

存储要防篡改（只能追加），并且可以按 task_id 还原出完整的链路。

**A:** The record must answer who, why, what and with what result:
- the initiating user and session;
- a summary of the model's input and its rationale;
- the tool name, full arguments (with sensitive fields masked), call ID and timestamp;
- permission checks and approvals, including who approved;
- the result and side-effect IDs (e.g. a ticket number);
- the model, prompt version and tool version used.

Store it append-only (tamper-evident) and make the full chain reconstructable by task_id.

---

## I. 性能与成本 / Performance and cost

### I1. 端到端延迟变高时，怎么拆分模型、检索、工具和调度各自的贡献？
**Q:** End-to-end latency rose — how do you split it across model, retrieval, tools and orchestration?

**答：**
- 先给每个节点和每次调用打上 span 计时（链路追踪），找出关键路径。
- 模型调用再细分：首 token 时间、输出 token 数、是否开了 thinking。
- 然后看串行还是并行：能并行的步骤是否在串行执行？有没有排队、限流或锁等待？

参考实测（UCVC-AI-Lab-Agent 教程）：在一个文献综述 Agent 上逐节点计时，发现论文是逐篇串行处理的、分析分支也没有并行；改成并行后从 588 秒降到 264 秒，再修复根因后降到 103 秒。

**A:**
- Put spans on every node and call (tracing) to find the critical path.
- Split model calls further: time to first token, output tokens, and whether thinking is on.
- Then check serial versus parallel work: are parallelisable steps running in sequence? Is there queuing, rate limiting or lock waiting?

Reference measurement (UCVC-AI-Lab-Agent tutorial): on a literature-review agent, per-node timing showed papers processed one by one and unparallelised branches; parallelising took it from 588 s to 264 s, and root-cause fixes to 103 s.

### I2. 降低 token 费用时，怎么证明质量没有明显下降？
**Q:** How do you cut token costs while proving quality didn't drop?

**答：** 先固定一个评测集作为基线，每次只改一项，再对比质量指标和成本。常见手段：
- 清理旧的工具结果：参考实测（UCVC-AI-Lab-Agent 教程）里省了 45%，信息没有丢；
- 压缩上下文；
- 提示缓存：把稳定的前缀放在前面；
- 模型分层：简单步骤用小模型；
- 减少不必要的 Agent 步骤：比如 Supervisor 改成规划一次再并行执行；
- 限制输出长度。

报告时同时给出质量（通过率、胜率，以及置信区间或样本量）和成本，两者一起看。

**A:** Fix an eval set as the baseline, change one thing at a time, and compare quality and cost. Common levers:
- clearing old tool results (45% saved in a reference measurement (UCVC-AI-Lab-Agent tutorial) with nothing lost);
- context compression;
- prompt caching with stable prefixes first;
- model tiering (small models for simple steps);
- fewer agent steps (e.g. replace a supervisor with plan-once-then-parallel);
- output length limits.

Report quality (pass rate or win rate, with confidence intervals or sample sizes) alongside cost.

### I3. 怎么做模型路由和分层？
**Q:** How do you do model routing and tiering?

**答：** 按步骤的难度和风险分配模型：
- 解析、分类、格式化、简单的子步骤 → 小模型或快模型；
- 规划、综合、写作、困难推理 → 强模型；
- 先用小模型尝试，置信度低或校验失败时再升级到大模型。

例如一个文献综述 Agent 可以用 fast/reason 双模型分层。但要注意：分层之后，每个节点的 token 预算、是否开 thinking 都要单独配置，否则可能出现这种情况。参考实测（UCVC-AI-Lab-Agent 教程）：fast 子步骤全部返回空。

**A:** Assign models by step difficulty and risk:
- parsing, classification, formatting and simple sub-steps → small/fast models;
- planning, synthesis, writing and hard reasoning → strong models;
- or try small first and escalate on low confidence or a failed check.

A literature-review agent, for example, can use a fast/reason split. But once you tier, configure token budgets and thinking per node, or you can hit this. Reference measurement (UCVC-AI-Lab-Agent tutorial): every fast sub-step returned empty.

### I4. 给定日请求量、每个任务的工具调用次数和延迟，怎么估算并发需求？
**Q:** Given daily requests, tool calls per task and latency, how do you estimate concurrency?

**答：** 用利特尔定律：并发数 ≈ 到达率 × 平均处理时间。

例子：每天 10 万次任务，高峰是平均的 3 倍，每个任务平均 20 秒。
- 平均到达率 ≈ 100,000 / 86,400 ≈ 1.16 个/秒；
- 高峰到达率 ≈ 3.5 个/秒；
- 并发 ≈ 3.5 × 20 ≈ 70 个任务同时在跑。

再换算到下游：每个任务 5 次 LLM 调用、每次 3 秒，LLM 的并发 ≈ 3.5 × 5 × 3 ≈ 52，然后对照供应商的限流（RPM、TPM）和连接池大小。

关键是讲清楚假设：高峰系数、P95 延迟、重试会额外放大请求量。

**A:** Use Little's law: concurrency ≈ arrival rate × average time in system.

Example: 100k tasks a day, with peaks 3× the average, and 20 s per task.
- average rate ≈ 100,000 / 86,400 ≈ 1.16/s;
- peak rate ≈ 3.5/s;
- concurrency ≈ 3.5 × 20 ≈ 70 tasks in flight.

Then derive downstream load: 5 LLM calls of 3 s each gives LLM concurrency ≈ 3.5 × 5 × 3 ≈ 52, which you compare with provider limits (RPM/TPM) and connection pools.

State the assumptions: peak factor, P95 latency, and the extra load from retries.

### I5. 工具描述占满了提示词预算，怎么减少输入，又保证路由正确？
**Q:** Tool descriptions fill the prompt budget — how do you shrink them without breaking routing?

**答：**
- 按需加载工具：先检索出候选工具，或者分层选择；
- 描述精简但保留关键信息："什么时候用"、参数的格式和示例。参考实测（UCVC-AI-Lab-Agent 教程）表明，删掉这些信息准确率就会下降；
- 合并功能重叠的工具；
- 长说明移到 Skill 或帮助文档里，需要时再读。

每次改动之后都要跑工具调用的回归评测。

**A:**
- Load tools on demand (retrieve candidates, or select hierarchically).
- Keep descriptions short but keep the essentials — when to use it, argument formats and examples; my test showed accuracy drops when those go.
- Merge overlapping tools.
- Move long guidance into skills or help docs read on demand.

Run the tool-call regression eval after every change.

---

## J. 模型与训练（和 Agent 相关的部分）/ Models and training for agents

### J1. 什么时候用提示词、RAG 还是微调？
**Q:** When do you use prompting, RAG or fine-tuning?

**答：** 先从提示词和工具开始，最便宜，也最容易迭代：
- 缺事实、需要最新信息或可追溯 → 用 RAG；
- 需要稳定的格式和风格、特定的工具调用习惯、更低的延迟（用小模型替代大模型）、领域技能 → 考虑微调，前提是有足够的高质量数据和评测集。

微调不能替代运行时工程：权限、校验、持久化依然要写在代码里。

**A:** Start with prompts and tools — cheapest and fastest to iterate:
- missing, fresh or citable facts → RAG;
- stable format or style, specific tool-calling habits, lower latency (a small model replacing a large one) or domain skills → consider fine-tuning, if you have enough quality data and an eval set.

Fine-tuning doesn't replace runtime engineering: permissions, validation and persistence still live in code.

### J2. SFT、RLHF 和 DPO 有什么区别？
**Q:** SFT vs RLHF vs DPO?

**答：**
- SFT：用"指令 → 期望回答"的数据做有监督学习，教模型格式和基本能力。
- RLHF：分三步。先 SFT；再用成对的偏好数据训练奖励模型（Bradley-Terry 损失）；最后用 PPO 优化策略，同时加 KL 惩罚，防止偏离参考模型太远。
- DPO：直接用偏好数据推导出一个分类形式的损失来优化策略，不需要单独的奖励模型，也不需要强化学习循环。更简单、更稳定，但对数据分布更敏感。

**A:**
- SFT: supervised learning on instruction→response pairs to teach format and basic skills.
- RLHF: three steps — SFT, then a reward model trained on pairwise preferences (Bradley-Terry loss), then PPO policy optimisation with a KL penalty to stay close to the reference model.
- DPO: optimises the policy directly from preference pairs with a classification-style loss, with no separate reward model and no RL loop — simpler and more stable, but more sensitive to the data distribution.

### J3. GRPO 和 PPO 的主要区别是什么？
**Q:** What's the main difference between GRPO and PPO?

**答：**
- PPO 需要一个价值模型（critic）来估计优势值。
- GRPO（DeepSeekMath / R1）去掉了价值模型：对同一个提示采样一组回答，用组内奖励的均值和标准差做归一化，得到每个回答的相对优势，同时保留 clip 和对参考模型的 KL 约束。

优点是省掉 critic 的显存和训练成本，适合奖励可以自动验证的任务（数学、代码、工具调用是否成功）。缺点是每个提示要采样多次，组内回答全对或全错时没有学习信号。之后的变体（比如 DAPO、GSPO）分别在 clip 策略、采样方式、序列级重要性比等方面做了改进。

**A:**
- PPO needs a value model (critic) to estimate advantages.
- GRPO (DeepSeekMath / R1) drops the critic: it samples a group of responses per prompt and normalises rewards by the group's mean and standard deviation to get relative advantages, while keeping clipping and a KL constraint to the reference model.

That saves the critic's memory and training cost and suits verifiable rewards (maths, code, tool-call success). The costs: many samples per prompt, and no learning signal when a group is all right or all wrong. Later variants such as DAPO and GSPO adjust clipping, sampling and sequence-level importance ratios.

### J4. 什么是 Reward Hacking？举个例子，怎么缓解？
**Q:** What is reward hacking? Give an example and mitigations.

**答：** 模型钻了奖励函数的漏洞，拿到高分，却没有真正完成任务。例子：
- 奖励偏好"长且自信"的回答，模型就变得冗长、奉承；
- 代码 Agent 去修改测试，而不是修改代码。

在评测里也有类似现象：评委不知道答案时，会给流畅但错误的回答打更高的分。

缓解：
- 奖励尽量可验证、多维度；
- 加 KL 约束；
- 用对抗样本检查奖励模型；
- 人工抽检；
- 限制 Agent 修改评测环境的权限。

**A:** The model exploits flaws in the reward to score high without doing the task. Examples:
- rewards favouring long, confident answers produce verbose, sycophantic output;
- a coding agent edits the tests instead of the code.

Evaluation shows something similar: a judge that doesn't know the answer can score fluent wrong answers higher.

Mitigations:
- verifiable, multi-dimensional rewards;
- KL constraints;
- adversarial checks of the reward model;
- human spot checks;
- no permission for the agent to modify its evaluation environment.

### J5. 什么是 Agentic RL？
**Q:** What is agentic RL?

**答：** 在多步交互环境里，用强化学习训练模型：模型生成推理和工具调用，环境返回结果，最后用任务是否成功（比如测试通过、答案正确）作为奖励。

和单轮的 RLHF 相比，难点在于：
- 信用分配：长轨迹里的哪一步该为最终结果负责；
- 环境的成本和稳定性；
- 奖励稀疏。

常见做法：先用 SFT 学会格式和工具调用，再用 GRPO 一类的算法，配合可验证的奖励。工程上要准备沙箱环境、轨迹记录和防止 reward hacking 的手段。

**A:** RL training in multi-step interactive environments: the model produces reasoning and tool calls, the environment returns results, and task success (tests pass, the answer is correct) is the reward.

Compared with single-turn RLHF, the hard parts are:
- credit assignment over long trajectories;
- environment cost and stability;
- sparse rewards.

The usual recipe is SFT for format and tool use, then GRPO-style RL with verifiable rewards. It needs sandboxed environments, trajectory logging and safeguards against reward hacking.

### J6. 微调 Agent 能力时，数据怎么收集？
**Q:** How do you collect data to fine-tune agent capabilities?

**答：**
- 来源：
  - 用强模型在真实或模拟环境里生成成功的轨迹（蒸馏），只保留通过验证的；
  - 线上日志里成功的案例（脱敏后）；
  - 人工修正过的失败案例；
  - 合成的工具调用数据，覆盖不该调用、参数边界、多步依赖等情况。
- 质量控制：格式校验、执行验证、去重、分布平衡，并留出独立的评测集，防止评测集泄漏到训练集。

**A:**
- Sources:
  - successful trajectories from a strong model in real or simulated environments (distillation), keeping only verified ones;
  - anonymised successes from logs;
  - human-corrected failures;
  - synthetic tool-call data covering irrelevance, argument edge cases and multi-step dependencies.
- Quality control: format checks, execution verification, deduplication, balanced distributions, and a held-out eval set to prevent leakage.

---

## K. 框架与选型 / Frameworks

### K1. LangChain、LangGraph 和 LlamaIndex 有什么区别？
**Q:** LangChain vs LangGraph vs LlamaIndex?

**答：**
- LangChain：模型、工具、提示词、检索的统一接口和组件，1.x 版本提供 `create_agent` 和中间件。
- LangGraph：底层的有状态编排框架，提供 State、节点、条件边、并行（Send）、checkpointer、interrupt、子图，适合需要可控流程、持久化和人在回路的 Agent。
- LlamaIndex：以数据和检索为中心，文档解析、索引、查询引擎做得很强，适合 RAG 为主的应用。

可以结合具体项目说明选型，比如：一个多 Agent 文献综述引擎用 LangGraph；一个经营报告 Agent 用纯 Python 实现，之后再用 LangGraph 重写一版原型。（面试时换成你自己项目里的例子）

**A:**
- LangChain: unified interfaces and components for models, tools, prompts and retrieval, with `create_agent` and middleware in 1.x.
- LangGraph: low-level stateful orchestration — state, nodes, conditional edges, Send for parallelism, checkpointers, interrupt and subgraphs — for agents needing controllable flow, persistence and human-in-the-loop.
- LlamaIndex: data- and retrieval-centred, strong at parsing, indexing and query engines, suited to RAG-heavy apps.

Tie the choice to concrete projects, e.g. a multi-agent literature-review engine built on LangGraph, and a report-writing agent written in plain Python and later rebuilt as a LangGraph prototype. (Use an example from your own project.)

### K2. 为什么选择图式编排，而不是直接链式调用？
**Q:** Why graph orchestration instead of simple chains?

**答：** 链式调用适合简单的线性流程。一旦需要下面这些能力，就该用图：
- 条件分支和循环（修订循环）；
- 并行和汇合；
- 共享状态；
- 中断和恢复；
- 人工审批；
- 子图复用；
- 逐节点的可观测性。

图把控制流显式化了，方便测试和定位问题。我能用 `update_state` 注入故障、测试修订循环，就是靠这一点。代价是多了一层抽象和学习成本，所以只有 5 步线性流程时，用纯 Python 也可以。

**A:** Chains fit simple linear flows. Graphs earn their keep once you need:
- branches and loops (revision cycles);
- parallelism and joins;
- shared state;
- interrupt and resume;
- human approval;
- reusable subgraphs;
- per-node observability.

They make control flow explicit, which helps testing and debugging — that's what let me inject faults with `update_state` to test the revision loop. The cost is abstraction and learning, so five linear steps are fine in plain Python.

### K3. 了解 OpenAI Agents SDK、CrewAI、AutoGen 吗？handoff 和 agent-as-tool 有什么区别？
**Q:** Do you know the OpenAI Agents SDK, CrewAI and AutoGen? What's the difference between handoffs and agents-as-tools?

**答：**
- OpenAI Agents SDK 提供 Agent、工具、handoff、guardrail 和 tracing；
- CrewAI 以角色和任务的方式组织团队；
- AutoGen 以多 Agent 对话为核心。

Handoff 是把控制权和对话交给另一个 Agent，由对方接着和用户交互，适合多领域客服。Agent-as-tool 是把子 Agent 当作一个工具来调用，调用完控制权回到主 Agent，主 Agent 始终掌控全局。后者更容易控制，也更容易测试。

**A:**
- The OpenAI Agents SDK offers agents, tools, handoffs, guardrails and tracing.
- CrewAI organises role- and task-based crews.
- AutoGen centres on multi-agent conversation.

A handoff passes control and the conversation to another agent, which then talks to the user — good for multi-domain support. Agent-as-tool calls a sub-agent like a tool and returns control to the main agent, which keeps the overall picture; it's easier to control and test.

### K4. 你怎么做框架选型？最终用什么指标评价？
**Q:** How do you choose a framework, and what metrics do you judge the final system by?

**答：**
- 选型看：流程复杂度（是否需要循环、并行、持久化、人工审批）、团队熟悉度、可观测性、厂商锁定、性能、社区和维护情况。
- 原则：框架只负责编排，契约、校验、评测、权限都要自己掌握，避免被框架锁死。
- 最终评价用业务指标：任务成功率（pass^k）、质量（评委或人工）、P95 延迟、单任务成本、失败可恢复率、人工介入率。

**A:**
- Choose by flow complexity (loops, parallelism, persistence, approvals), team familiarity, observability, vendor lock-in, performance, and community and maintenance.
- Principle: the framework only orchestrates; keep contracts, validation, evaluation and permissions under your own control so you aren't locked in.
- Judge the final system by business metrics: task success (pass^k), quality (judge or human), P95 latency, cost per task, recoverable-failure rate and escalation rate.

---

## K+. LangGraph 与 LangChain 核心语法 / LangGraph and LangChain core syntax

> 下面的代码片段都在 langgraph 1.2 / langchain-core 1.7 上实测过。如果项目锁定的是旧版 `langgraph==0.2.*`，少数写法有差别，比如入口写成 `set_entry_point`，1.x 推荐写成 `add_edge(START, ...)`。
> All snippets were tested on langgraph 1.2 / langchain-core 1.7. Projects pinned to the older `langgraph==0.2.*` differ in a few spellings (e.g. `set_entry_point` instead of `add_edge(START, ...)`).

### K5. LangGraph 的核心概念有哪些？State、Node、Edge、Reducer、Checkpointer 分别是什么？
**Q:** What are LangGraph's core concepts — state, node, edge, reducer, checkpointer?

**答：**
- **State**：一个 TypedDict，是所有节点共享的"黑板"。
- **Node**：一个函数，输入当前 state，返回这个节点要更新的字段（局部更新）。
- **Edge**：决定下一步执行哪个节点，分普通边、条件边、汇合边和 `Send`。
- **Reducer**：用 `Annotated[类型, 函数]` 声明某个字段的多次写入怎么合并。不声明时，先后两步写同一字段是"后写的覆盖先写的"；同一超步里两个并行节点写同一个无 reducer 字段会直接报 `InvalidUpdateError`。
- **Checkpointer**：每一步结束后按 `thread_id` 保存状态，用来做记忆、断点续跑和人工审批。

执行模型是 superstep（超步）：同一步里被触发的节点并行执行，执行完把各自的更新按 reducer 合并，再根据边决定下一步。一个线性的文献综述 Agent（先把每篇论文抽成固定字段的"论文卡片"）最简单的写法就是 `StateGraph(ReportState)`，加 8 次 `add_node`，再用 `add_edge` 连成一条线，最后 `compile(checkpointer=MemorySaver())`。

```python
class ReportState(TypedDict, total=False):
    paper_cards: Annotated[list, operator.add]         # reducer: parallel writers append
    topic_clusters: list                                # no reducer: later step overwrites; two parallel writers -> InvalidUpdateError

g = StateGraph(ReportState)
g.add_node("cluster", cluster)                          # node returns {"topic_clusters": [...]}
g.add_edge(START, "cluster")
graph = g.compile(checkpointer=SqliteSaver(db))
graph.invoke(inputs, {"configurable": {"thread_id": "workspace-1"}})
```

**A:**
- **State** is a TypedDict shared by all nodes, like a blackboard.
- A **node** is a function that takes the state and returns only the fields it updates (a partial update).
- **Edges** decide what runs next: plain edges, conditional edges, joins and `Send`.
- A **reducer**, declared with `Annotated[type, fn]`, says how several writes to one field are merged. Without one, a write in a later step overwrites the earlier value, and two parallel nodes writing the field in the same superstep raise `InvalidUpdateError`.
- A **checkpointer** saves the state after every step under a `thread_id`, enabling memory, resume and human approval.

Execution runs in supersteps: all triggered nodes in a step run in parallel, their updates are merged through the reducers, and the edges decide the next step. The simplest linear literature-review agent (one that first extracts each paper into a fixed-field "paper card") is exactly `StateGraph(ReportState)`, eight `add_node` calls, linear `add_edge`s and `compile(checkpointer=MemorySaver())`.

### K6. Reducer 是什么？没有 reducer 会出什么问题？
**Q:** What is a reducer, and what goes wrong without one?

**答：** Reducer 决定同一个字段的多次写入怎么合并。不加 reducer 有两种问题：
1. 并行的节点写同一个字段，直接报错：`InvalidUpdateError: Can receive only one value per step`。
2. 顺序执行时不报错，但会悄悄覆盖。比如每个阶段都写 `{"timing": {name: t}}`，最后只剩下最后一个阶段的耗时。

常用写法：列表用 `operator.add` 追加，字典用自定义的 `merge` 合并。常见情况：一个线性的文献综述 Agent，state 里没有任何 reducer 也能跑，只是因为图是线性的；一旦改成并行，就要给 `paper_cards`、`section_drafts`、`errors` 这类会被多个节点写入的字段加上 reducer（面试时换成你自己项目里的例子）。

```python
def merge(a: dict, b: dict) -> dict:
    return {**a, **b}

class S(TypedDict, total=False):
    parts: Annotated[dict, merge]                # three specialists each write their own key
    errors: Annotated[list, operator.add]
```

**A:** A reducer defines how multiple writes to one field are combined. Without one you get two problems:
1. Parallel nodes writing the same field raise `InvalidUpdateError: Can receive only one value per step`.
2. Sequential writes silently overwrite each other — e.g. each stage writing `{"timing": {name: t}}` leaves only the last stage's timing.

Use `operator.add` for lists and a custom `merge` for dicts. A typical case: a linear literature-review agent can run with no reducers at all, but only because the graph is linear; once you parallelise it, add reducers to fields with several writers such as `paper_cards`, `section_drafts` and `errors` (use an example from your own project).

### K7. 普通边、条件边、汇合边和 Send 有什么区别？
**Q:** How do plain edges, conditional edges, joins and `Send` differ?

**答：**

| 写法 | 作用 | 例子 |
|---|---|---|
| `add_edge(a, b)` | 固定的顺序 | 线性文献综述 Agent 的 8 个节点；经营报告 Agent 的 coordinator→collector→analyst |
| `add_conditional_edges(a, fn, [目标...])` | 由函数决定下一步去哪里 | 经营报告 Agent：LLM 失败走 template，审核不通过走 revise；文献综述 Agent：章节审核有问题走 revise |
| `add_edge([a, b, c], d)` | 等列表里的节点**全部**完成再执行 d | 文献综述 Agent：gaps、evolution、conflicts 都完成后才进入 analysis_ready |
| 条件边返回 `[Send(节点, 载荷), ...]` | 动态生成 N 个并行任务，每个任务只拿到自己的载荷 | 文献综述 Agent：每篇论文一个 read_paper，每个章节一个子图 |

**坑：** 分支长度不一样时，如果写成三条单独的边而不是列表汇合，汇合节点会被触发两次，而且第一次触发时 gaps 还没算完。

```python
g.add_conditional_edges(START, lambda s: [Send("read_paper", {"paper": p}) for p in s["papers"]], ["read_paper"])
g.add_edge(["gaps", "evolution", "conflicts"], "analysis_ready")
sb.add_conditional_edges("reflect", lambda s: "revise" if s["blocking"] and s["attempts"] < 1 else "finish",
                         ["revise", "finish"])
```

**A:**

| Syntax | Purpose | Example |
|---|---|---|
| `add_edge(a, b)` | fixed order | a linear literature-review agent's eight nodes; a report-writing agent's coordinator→collector→analyst |
| `add_conditional_edges(a, fn, [targets])` | a function picks the next node | report-writing agent: LLM failure → template, failed review → revise; literature-review agent: section issues → revise |
| `add_edge([a, b, c], d)` | run d only after **all** of a, b, c finish | literature-review agent: analysis_ready waits for gaps, evolution and conflicts |
| a conditional edge returning `[Send(node, payload), ...]` | dynamic fan-out: N parallel tasks, each seeing only its payload | literature-review agent: one read_paper per paper, one subgraph per section |

The pitfall: with branches of different lengths, three separate edges instead of a list join fire the join node twice, the first time before gaps exists.

### K8. 子图怎么用？`output_schema` 有什么作用？
**Q:** How do subgraphs work, and what does `output_schema` do?

**答：** 把一个编译好的图直接当作节点 `add_node("section", section_graph)`，子图有自己的 state，内部可以有循环。`output_schema` 规定子图结束后**只回传哪些字段**给父图。

不加 `output_schema` 的后果：子图会把整个 state 都回传，其中包括 Send 进去的 `memories`；父图的 `memories` 字段用的是 `operator.add`，于是会被重复追加。我演示过：3 个子图跑完，父图的记忆从 2 条变成了 8 条，而且不会报错。

```python
sb = StateGraph(SectionState, output_schema=SectionOut)   # SectionOut = {section_drafts, reflection_log}
...
g.add_node("section", sb.compile())
```

**A:** A compiled graph can be added as a node (`add_node("section", section_graph)`); it has its own state and can loop internally. `output_schema` restricts **which fields flow back** to the parent.

Without it, the subgraph returns its whole state, including the `memories` it was sent, and the parent's `operator.add` reducer appends them again. In my demo, three subgraphs turned 2 parent memories into 8, with no error raised.

### K9. Checkpointer 和 thread_id 怎么实现记忆和断点续跑？
**Q:** How do checkpointers and `thread_id` provide memory and resume?

**答：**
- `compile(checkpointer=...)` 之后，每一步结束都会按 `config={"configurable": {"thread_id": ...}}` 保存一次状态。
- 选哪种 checkpointer：
  - `InMemorySaver`（旧名 `MemorySaver`）只存在内存里，进程退出就没了；
  - `SqliteSaver` 或 `PostgresSaver` 是持久化的。
- 恢复：`get_state(config).next` 能看到下一步要执行哪个节点，`invoke(None, config)` 从断点继续。
- 同一批里有一个节点失败时，其他已经成功的节点的结果会被保存为待写入的数据，恢复时不会重跑。

例子：
- **常见的坑**：用 MemorySaver，而且每次请求都重新构建图，所以实际上无法恢复。
- **改进做法**：换成 SqliteSaver。参考实测（UCVC-AI-Lab-Agent 教程）：在 assemble 处模拟崩溃后，`next` 显示 `('assemble',)`，续跑只用了 1.6 秒、1 次调用。

**A:**
- After `compile(checkpointer=...)`, the state is saved after every step under `config={"configurable": {"thread_id": ...}}`.
- Which checkpointer:
  - `InMemorySaver` (formerly `MemorySaver`) lives in memory and dies with the process;
  - `SqliteSaver` or `PostgresSaver` persist.
- To recover, `get_state(config).next` shows what runs next, and `invoke(None, config)` resumes. If one node in a step fails, the others' results are saved as pending writes and aren't rerun.

Example:
- A common pitfall: using MemorySaver and rebuilding the graph on every request, so it can't really resume.
- The fix: switch to SqliteSaver. Reference measurement (UCVC-AI-Lab-Agent tutorial): after a simulated crash at assemble, `next` was `('assemble',)` and the resume took 1.6 s and 1 call.

### K10. 人在回路（human-in-the-loop）用 LangGraph 怎么实现？
**Q:** How do you implement human-in-the-loop in LangGraph?

**答：**
- 在节点里调用 `interrupt(payload)`，图就会暂停，状态存进 checkpoint，`payload` 交给前端展示。
- 人做出决定后，调用 `graph.invoke(Command(resume=决定), config)` 继续，`interrupt()` 的返回值就是这个决定。
- 还可以用 `update_state(config, values, as_node=...)` 直接修改状态，假装是某个节点产出的，常用来人工纠错或注入故障做测试。

以一个经营报告 Agent 的 LangGraph 实现为例：审批人可以批准，也可以带意见退回，退回的稿子会重新经过数字核对。

```python
def human_review(state):
    decision = interrupt({"chars": len(state["draft"]), "untraceable": state["issues"]})
    if decision.get("approve"):
        return {"final": state["draft"]}
    return {"feedback": decision["feedback"]}

app.invoke(Command(resume={"approve": False, "feedback": "add weekend staffing"}), config)
```

**A:**
- Call `interrupt(payload)` inside a node: the graph pauses, the state goes into the checkpoint, and the payload is shown to the user.
- Resume with `graph.invoke(Command(resume=decision), config)`; `interrupt()` returns that decision.
- `update_state(config, values, as_node=...)` edits the state as if a node had produced it — useful for manual corrections or fault injection in tests.

Take a LangGraph implementation of a report-writing agent as an example: the approver can approve or send the draft back with feedback, and the revised draft goes through the number check again.

### K11. `stream` 有哪几种模式？怎么接 SSE？
**Q:** What stream modes exist, and how do you connect them to SSE?

**答：** 常用的几种：
- `stream_mode="updates"`：每完成一个节点，产出这个节点的更新；
- `stream_mode="values"`：每一步结束，产出完整的 state；
- `stream_mode="messages"`：逐 token 输出 LLM 的生成内容。

一种常见做法是用 `async for event in graph.astream(state, config, stream_mode="updates")` 把每个节点的完成事件包装成 `data: {...}\n\n`，再通过 FastAPI 的 `StreamingResponse(..., media_type="text/event-stream")` 推给前端。另一种方案是：后台线程运行，进度写进数据库，前端轮询；这时可以用 `stream_mode="values"` 更新进度。

**A:** The common ones:
- `stream_mode="updates"` yields each node's update as it finishes;
- `"values"` yields the full state after each step;
- `"messages"` streams LLM tokens.

A common pattern is `async for event in graph.astream(state, config, stream_mode="updates")`, wrapping each event as `data: {...}\n\n` and returning FastAPI's `StreamingResponse(..., media_type="text/event-stream")`. An alternative runs a background thread, writes progress to the database and lets the client poll; the progress can then be updated with `stream_mode="values"`.

### K12. `Command(goto=...)` 和条件边有什么区别？
**Q:** How does `Command(goto=...)` differ from conditional edges?

**答：**
- 条件边：路由逻辑写在图的结构里，由一个单独的函数决定下一步。适合规则清楚的分支。
- `Command(goto=..., update=...)`：节点自己在返回值里同时决定"更新什么"和"下一步去哪"。适合 Supervisor 或 handoff 这种由 LLM 决定下一步的场景。函数签名要标注 `-> Command[Literal[...]]`，这样图的结构才画得出来。

用 `Command` 做 Supervisor 时，硬约束仍然要写在代码里。比如一个文献综述 Agent 的 Supervisor：最多 6 步，同一个 worker 不能重复调用（面试时换成你自己项目里的例子）。

```python
def supervisor(state) -> Command[Literal["cluster", "gaps", "evolution", "conflicts", "write"]]:
    if state.get("steps", 0) >= MAX_STEPS:
        return Command(goto="write")
    d = router.invoke(...)                       # LLM picks the next worker
    return Command(goto=d.worker, update={"steps": state.get("steps", 0) + 1})
```

**A:**
- A conditional edge keeps routing in the graph structure, with a separate function choosing the next node — good for clear, rule-based branches.
- `Command(goto=..., update=...)` lets a node return both its update and the next destination — good for supervisors or handoffs where an LLM decides. Annotate the return type as `-> Command[Literal[...]]` so the graph can still be drawn.

When you use `Command` for a supervisor, keep hard limits in code. For example, a literature-review agent's supervisor: at most 6 steps, no repeated worker (use an example from your own project).

### K13. LangChain 的核心抽象有哪些？
**Q:** What are LangChain's core abstractions?

**答：**
- **Chat model**：比如 `ChatOpenAI(model, base_url, temperature, timeout, max_retries, max_tokens, extra_body)`。换 DeepSeek 或本地 Ollama，只需要改 `base_url`。
- **消息**：`[("system", ...), ("user", ...), ("assistant", ...)]`，返回的是 `AIMessage`，用 `.content` 取文本。
- **Runnable 接口**：`invoke`、`batch`（可以设 `max_concurrency` 并发）、`stream`，以及对应的异步版本。
- **结构化输出**：`with_structured_output(PydanticModel, method=...)`。
- **工具**：用 `@tool` 定义工具，`bind_tools` 绑定给模型，从返回值的 `tool_calls` 里取出调用。
- **回调**：`BaseCallbackHandler`，用来统计调用次数和 token（`usage_metadata`），也可以接追踪系统。

**说实话：** 面试时要如实说明项目里到底有没有用 LangChain。例如一个经营报告 Agent 直接用 urllib 调接口，一个文献综述 Agent 用自己写的 httpx `LLMClient`，`requirements.txt` 里列了 `langchain-core` 但代码里从没导入过。复现时可以换成 `ChatOpenAI` 加 `with_structured_output`，用 Pydantic 契约代替正则解析 JSON；工具调用的部分可以放在 BFCL 式评测里做（面试时换成你自己项目里的例子）。

```python
llm = ChatOpenAI(model="deepseek-flash", base_url=BASE_URL, temperature=0, timeout=90, max_retries=2,
                 extra_body={"thinking": {"type": "disabled"}}, callbacks=[USAGE])
cards = llm.with_structured_output(PaperCard, method="function_calling").batch(prompts, config={"max_concurrency": 8})
```

**A:**
- **Chat models**, e.g. `ChatOpenAI(model, base_url, temperature, timeout, max_retries, max_tokens, extra_body)`; switching to DeepSeek or a local Ollama only changes `base_url`.
- **Messages** like `[("system", ...), ("user", ...), ("assistant", ...)]`; the result is an `AIMessage`, read via `.content`.
- **The Runnable interface**: `invoke`, `batch` (with `max_concurrency`), `stream`, and their async versions.
- **Structured output** via `with_structured_output(PydanticModel, method=...)`.
- **Tools**: define with `@tool`, attach with `bind_tools`, and read calls from `tool_calls`.
- **Callbacks**: `BaseCallbackHandler`, used to count calls and tokens (`usage_metadata`) or to feed tracing.

To be honest, say plainly whether your project really uses LangChain. For example, a report-writing agent may call the API directly with urllib, and a literature-review agent may use its own httpx `LLMClient` (`langchain-core` is listed in `requirements.txt` but never imported). When reproducing, you can switch to `ChatOpenAI` plus `with_structured_output`, replacing regex JSON parsing with Pydantic contracts; tool calling can be done in a BFCL-style evaluation (use an example from your own project).

### K14. `with_structured_output` 的几种 method 有什么区别？有哪些坑？
**Q:** How do the `with_structured_output` methods differ, and what are the pitfalls?

**答：**
- `function_calling`：把 schema 当作一个工具交给模型，兼容性最好。接 DeepSeek 时就可以用这种方式。
- `json_mode`：让模型输出 JSON 对象，提示词里必须出现 "JSON" 这个词，并且要自己在提示词里描述字段。适合提示词里已经写好 JSON 格式的情况，比如一个经营报告 Agent 的 Reviewer 要求的 `{"pass", "issues"}`。
- `json_schema`：由服务端按 schema 严格约束输出。较新版本的 `ChatOpenAI` 默认用这种方式，但 OpenAI 兼容的第三方接口不一定支持，所以最好显式指定 method。

**坑：**
1. 模型没有调用 schema 工具时，返回值是 `None` 而不是抛异常。经营报告 Agent 的 Reviewer 节点就出现过这种情况，必须检查返回值，或者用 `include_raw=True` 同时拿到原始输出和 `parsing_error`。
2. 字段名不能是 Python 关键字，比如 `pass`，要用 `Field(alias="pass")` 加 `ConfigDict(populate_by_name=True)`。
3. 输出被截断（`finish_reason=length`）会导致解析失败。开启 thinking 时尤其容易发生，因为推理内容和答案共用 `max_tokens`。

**A:**
- `function_calling` passes the schema as a tool and is the most compatible; it works with DeepSeek.
- `json_mode` asks for a JSON object; the prompt must mention "JSON" and describe the fields itself. It fits prompts that already specify the format, like a report-writing agent's Reviewer `{"pass", "issues"}`.
- `json_schema` has the server enforce the schema strictly. It's the default in newer `ChatOpenAI` versions, but OpenAI-compatible third-party APIs may not support it, so set the method explicitly.

Pitfalls:
1. If the model doesn't call the schema tool, you get `None`, not an exception — this has happened with a report-writing agent's Reviewer node. Check for it, or use `include_raw=True` to get the raw output and `parsing_error`.
2. A field can't be a Python keyword such as `pass`; use `Field(alias="pass")` with `ConfigDict(populate_by_name=True)`.
3. Truncated output (`finish_reason=length`) breaks parsing. It's especially likely with thinking on, because the reasoning shares `max_tokens` with the answer.

### K15. LangChain 1.x 的 `create_agent` 和自己用 LangGraph 画图，怎么选？
**Q:** LangChain 1.x `create_agent` or a hand-built LangGraph graph — how do you choose?

**答：**
- `create_agent(model, tools, system_prompt, middleware=[...], checkpointer=...)` 底层就是 LangGraph 上的一个 ReAct 循环：模型决定调用哪个工具，直到给出最终答案。它通过中间件扩展功能，常用的有：
  - `@dynamic_prompt`：每次调用前注入记忆；
  - `wrap_model_call`：强制模型调用工具（`tool_choice`）或截断历史；
  - `SummarizationMiddleware` 和 `ContextEditingMiddleware`：压缩上下文。
- 适合"一个 Agent 加若干工具"的对话型任务，比如一个 RAG 问答 Agent。
- 步骤固定、需要并行、需要质量循环或人工审批的流程，比如经营报告 Agent 或文献综述 Agent，就自己用 StateGraph 画图，控制流写在代码里，更可控、更好测试。

**A:**
- `create_agent(model, tools, system_prompt, middleware=[...], checkpointer=...)` is a ReAct loop built on LangGraph: the model picks tools until it answers. It's extended with middleware; common ones:
  - `@dynamic_prompt` to inject memories before each call;
  - `wrap_model_call` to force `tool_choice` or trim history;
  - `SummarizationMiddleware` and `ContextEditingMiddleware` to compress context.
- It suits one-agent-plus-tools conversational tasks, like a RAG Q&A agent.
- For fixed-step flows that need parallelism, quality loops or approvals — like a report-writing agent or a literature-review agent — build a StateGraph by hand, so the control flow stays in code and is easier to control and test.

---

## L. 系统设计题 / System design

### L1. 设计一个电商客服 Agent
**Q:** Design an e-commerce customer-service agent.

**答：**
1. 澄清需求：查询订单、退换货、物流、FAQ；哪些操作需要审批；每天的请求量和 SLA。
2. 架构：
   - 意图路由：规则加小模型；
   - FAQ 走 RAG；
   - 订单类走工具：查询订单、发起退款。退款要幂等，金额要校验，超过阈值转人工审批；
   - 多领域可以用 handoff 或者子 Agent 当工具；
   - 会话记忆和用户画像。
3. 可靠性：超时和重试、降级到人工、checkpoint。
4. 安全：用户只能查自己的订单（在服务端鉴权）、防提示注入、脱敏。
5. 评测：用 τ-bench 式的模拟用户，看 pass^k；线上看解决率、转人工率和 CSAT。
6. 成本：缓存，模型分层。

**A:**
1. Clarify: order lookup, returns, shipping, FAQ; which actions need approval; volume and SLA.
2. Architecture:
   - intent routing with rules plus a small model;
   - RAG for FAQs;
   - tools for orders (look up an order, issue a refund), with idempotent refunds, amount checks and approval above a threshold;
   - handoffs or agents-as-tools across domains;
   - session memory and a user profile.
3. Reliability: timeouts, retries, fallback to a person, checkpoints.
4. Security: users see only their own orders (server-side auth), injection defences, masking.
5. Evaluation: τ-bench-style simulated users with pass^k; in production, resolution rate, escalation rate and CSAT.
6. Cost: caching and model tiering.

### L2. 设计一个深度研究（Deep Research）Agent
**Q:** Design a deep-research agent.

**答：**
1. 流程：澄清问题 → 规划，拆成独立的子问题 → 并行派给子 Agent（各自检索、阅读、做笔记）→ 汇总 → 检查引用 → 写报告。
2. 关键设计：
   - 子 Agent 上下文隔离，只返回结构化发现和证据；
   - 统一的引用格式，用代码校验引用；
   - 有预算和轮数上限；
   - 支持断点续跑；
   - 用 SSE 推送进度。
3. 评测：事实核对、引用准确率、覆盖率（参考要点覆盖了几条）、成对比较胜率、成本。

这和多 Agent 文献综述引擎、Orchestrator-workers 模式是同一类设计。参考实测（UCVC-AI-Lab-Agent 教程）：同类 Orchestrator-workers 实验的耗时从 588 秒降到 103 秒（面试时换成你自己项目里的数据）。

**A:**
1. Flow: clarify → plan into independent sub-questions → dispatch to parallel sub-agents (each searches, reads and takes notes) → synthesise → check citations → write.
2. Key design points:
   - isolated sub-agent contexts returning structured findings with evidence;
   - a uniform citation format verified in code;
   - budget and round limits;
   - resumable checkpoints;
   - SSE progress.
3. Evaluation: fact checks, citation accuracy, coverage of reference points, pairwise win rate and cost.

It's the same design family as a multi-agent literature-review engine and the orchestrator-workers pattern. Reference measurement (UCVC-AI-Lab-Agent tutorial): an orchestrator-workers experiment of this kind went from 588 s → 103 s (use an example from your own project).

### L3. 设计一个数据分析 / Text-to-SQL Agent
**Q:** Design a data-analysis / Text-to-SQL agent.

**答：**
1. 数据准备：表结构、字段说明、样例值、常用查询，做成可检索的元数据，表很多时先检索出相关的表。
2. 流程：理解问题 → 选表 → 生成 SQL → 静态校验（只允许 SELECT，加 LIMIT 和超时）→ 在只读副本上执行 → 出错就带着错误信息修正，设上限 → 用代码计算结果和派生指标 → LLM 只负责解读。
3. 防编造：报告里的每个数字都要能追溯到查询结果，可以用代码检查器核对。经营报告类 Agent 也是这样做的。
4. 评测：执行准确率，即结果集是否和标准 SQL 的结果一致。

如果业务直接用 SQL 或接口就能取数，Agent 的价值在于理解自然语言的需求和解释结果，取数这一步仍然应该是确定性的。

**A:**
1. Data prep: schemas, column descriptions, sample values and common queries as searchable metadata; retrieve relevant tables first when there are many.
2. Flow: understand → pick tables → generate SQL → static checks (SELECT only, LIMIT, timeouts) → execute on a read-only replica → fix errors with the error message, capped → compute results and derived metrics in code → the LLM only interprets.
3. Anti-fabrication: every number in the report traces to query results, checkable in code — the same approach a report-writing agent uses.
4. Evaluation: execution accuracy, i.e. whether the result set matches the gold SQL's.

When plain SQL or an API already gets the data, the agent's value is understanding the natural-language request and explaining the results; fetching stays deterministic.

### L4. 设计一个编程 Agent
**Q:** Design a coding agent.

**答：**
1. 工具：读文件、搜索（grep）、编辑（精确替换）、运行测试和命令（在沙箱里）、git。
2. 上下文：即时读取，不把整个仓库塞进上下文；用项目说明文件；长任务做压缩和笔记。
3. 控制：
   - 每次改动后跑测试；
   - 失败时带着错误信息继续，设步数上限；
   - 危险命令需要用户确认；
   - 不能修改测试来"让测试通过"。
4. 评测：SWE-bench 式的"测试是否通过"，再看 pass^k、步数和成本，并人工审查改动的 diff。

这里也呼应了 Cognition 的观点：一份代码需要处处一致，所以通常用单 Agent，子 Agent 只做只读的调研。

**A:**
1. Tools: read files, search (grep), edit (exact replacements), run tests and commands in a sandbox, git.
2. Context: just-in-time reads instead of loading the whole repo; a project instructions file; compaction and notes for long tasks.
3. Control:
   - run tests after each change;
   - continue with the error message on failure, under a step limit;
   - confirm dangerous commands with the user;
   - never edit tests to make them pass.
4. Evaluation: SWE-bench-style test passing, plus pass^k, steps and cost, and human review of the diffs.

It echoes Cognition's point: code must be coherent everywhere, so a single agent is typical, with sub-agents only for read-only research.

---

## M. 开放题 / Open questions

### M1. 你认为限制 Agent 普及的最大瓶颈是什么？
**Q:** What's the biggest bottleneck to agent adoption?

**答：** 是可靠性和可验证性，而不只是模型能力。多步任务中错误会累积，结果不确定，失败时又悄无声息，企业很难信任。突破口在工程上：
- 把确定性工作交给代码；
- 用契约和校验；
- 建评测集和 CI 门禁；
- 人在回路；
- 持久化和可审计。

成本和延迟是第二个瓶颈。

**A:** Reliability and verifiability more than raw model capability: errors compound over many steps, results vary, and failures are silent, so organisations struggle to trust agents. The way forward is engineering:
- deterministic work in code;
- contracts and validation;
- eval sets with CI gates;
- human-in-the-loop;
- persistence and auditability.

Cost and latency come second.

### M2. 最近哪篇 Agent 相关的论文或项目让你印象最深？
**Q:** Which recent agent paper or project impressed you most?

**答（示例，按你真实读过的来替换）：** Anthropic 的多 Agent 研究系统。它用数据讲清了多 Agent 的收益和代价：效果提升 90.2%，token 约为普通对话的 15 倍。还给出了很实用的工程经验：子 Agent 的任务说明要写清楚，按任务复杂度分配工作量，从广到窄地搜索。我在自己的项目上做了对照实验，验证了"规划一次再并行"比"每一步都让 LLM 决策"更快、更省。

**A (example — replace with what you've actually read):** Anthropic's multi-agent research system. It quantified both the benefit and the cost of multi-agent systems (+90.2% on their eval, about 15× the tokens of a chat) and shared practical lessons: clear briefs for sub-agents, scaling effort to task complexity, and searching broad first, then narrowing. I ran a comparison on my own project and confirmed that plan-once-then-parallel was faster and cheaper than letting the LLM decide every step.

### M3. 你认为顶尖的 Agent 工程师应该具备哪些素质？
**Q:** What makes a top agent engineer?

**答：**
1. 系统思维：知道哪些交给模型、哪些交给代码。
2. 测量习惯：先建评测再改代码，结论要给出口径和样本量。
3. 扎实的软件工程：并发、幂等、持久化、可观测性、安全。
4. 对模型行为的直觉：token 预算、上下文、工具描述对行为的影响。
5. 诚实：主动说明局限，不夸大 Demo。

**A:**
1. Systems thinking: knowing what belongs to the model and what belongs to code.
2. A measurement habit: build evals before changing code, and give denominators and sample sizes.
3. Solid software engineering: concurrency, idempotency, persistence, observability, security.
4. Intuition for model behaviour: how token budgets, context and tool descriptions shape it.
5. Honesty: state the limits and don't oversell demos.
