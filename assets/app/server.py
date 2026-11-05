"""Interview Coach: local server (standard library only).

Serves the single-page app, the content JSON and the candidate's original files, and proxies the AI features to an
OpenAI-compatible endpoint using the key file named in app_config.json. The key never reaches the browser.
"""
import json
import os
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP = Path(__file__).resolve().parent
STATIC = APP / "static"
DATA = APP / "data"
CONFIG = json.loads((APP / "app_config.json").read_text(encoding="utf-8"))
WORKSPACE = Path(CONFIG["workspace"])
PACK = Path(CONFIG["pack_dir"]) if CONFIG.get("pack_dir") else None
MATERIALS = WORKSPACE / "files"
ENV_FILE = Path(CONFIG["env_file"]) if CONFIG.get("env_file") else WORKSPACE / ".env"
PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("COACH_PORT", CONFIG.get("port", 48200)))   # optional port for testing


def load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env(ENV_FILE)
API_KEY = ENV.get("LLM_API_KEY") or os.environ.get("LLM_API_KEY", "")
BASE_URL = (ENV.get("LLM_BASE_URL") or os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
MODEL = ENV.get("LLM_MODEL_ID") or os.environ.get("LLM_MODEL_ID") or ""
AI_READY = bool(API_KEY and MODEL)


def ensure_content():
    """Rebuild content.json when any workspace or pack source is newer than it (a subprocess, so edits are re-read)."""
    target = DATA / "content.json"
    sources = [APP / "build_data.py", APP / "app_config.json"] + \
        [p for p in WORKSPACE.glob("*") if p.is_file() and p.suffix in (".md", ".json")]
    if MATERIALS.exists():
        sources += [p for p in MATERIALS.iterdir() if p.is_file()]
    if PACK and PACK.exists():
        sources += [p for p in PACK.iterdir() if p.is_file()]
    if not target.exists() or max(p.stat().st_mtime for p in sources) > target.stat().st_mtime:
        subprocess.run([sys.executable, str(APP / "build_data.py")], cwd=str(APP), capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), check=False)


def chat(messages: list, json_mode: bool, max_tokens: int = 1800, temperature: float = 0.3) -> str:
    payload = {"model": MODEL, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if "deepseek" in BASE_URL:                    # DeepSeek's thinking mode shares max_tokens and truncates JSON
        payload["thinking"] = {"type": "disabled"}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(f"{BASE_URL}/chat/completions", data=json.dumps(payload).encode("utf-8"),
                                 headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        body = json.loads(r.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"]


def lang_rule(lang: str) -> str:
    return "Write every field in English." if lang == "en" else "所有字段用中文书写（技术术语可保留英文）。"


GRADE_SYSTEM = """你是一位严格但友善的 AI Agent 工程师面试官，正在给候选人的口头回答打分。
你会收到：面试题、参考答案（中英，代表应覆盖的要点和事实）、候选人的回答。
评分原则：
1. 只依据参考答案里的要点和事实判断；参考答案没提到但正确的内容不扣分，可以在 feedback 里肯定。
2. 与参考答案事实冲突的内容（数字、名称、项目事实）必须列入 errors。
3. 表达长短本身不是标准；没有覆盖关键要点才扣分。
4. 0–10 分：9–10 覆盖全部要点且有例子和口径；7–8 主要要点都在；5–6 漏了重要要点；0–4 大部分缺失或有事实错误。
5. follow_up 是你作为面试官会继续追问的一个具体问题，针对候选人回答里最薄弱或最值得深挖的地方。
输出 JSON：{"score": int, "verdict": "一句话总评", "hits": ["答到的要点"], "misses": ["漏掉的要点"],
"errors": ["事实错误或夸大"], "feedback": "2–3 句改进建议", "outline": ["更好回答的提纲，3–5 条"], "follow_up": "追问"}"""

INTERVIEW_SYSTEM = """你是一位资深 AI Agent 工程面试官，正在对候选人的一个项目做深挖面试。
你会收到这个项目的事实资料（由候选人整理，含代码核实的结论和需要注意的风险点）以及到目前为止的对话。
规则：
1. 每次只问一个问题，像真实面试官一样由浅入深：业务与目标 → 架构与编排 → 关键设计取舍 → 失败与修复 → 评测与数字口径 → 如果重做。
2. 如果候选人刚回答了问题，先给 1–2 句简短点评并打分（0–10），指出和事实资料冲突或夸大的地方（例如节点数、是否用了某框架、实验还是线上）。
3. 优先追问资料里的“风险提示”和候选人回答中含糊的地方。
4. 问题要具体，能用资料里的事实判断对错。
输出 JSON：{"score": int 或 null（第一轮没有回答时为 null）, "comment": "点评，第一轮为空字符串",
"question": "下一个问题", "focus": "这个问题考察什么（5–10 字）"}"""

FOLLOWUP_RULE = """这是面试官针对原题的追问。参考答案只覆盖原题，追问部分请结合 Agent 工程的通用知识判断；
与参考答案冲突的事实仍然算错误。"""

FINAL_SYSTEM = """面试结束。根据项目资料和整段对话，对候选人做总评。
输出 JSON：{"score": int（0–10 总分）, "summary": "3–4 句总评", "strengths": ["做得好的地方"],
"improve": ["最该改进的地方，具体到怎么说"], "facts_to_fix": ["与事实资料冲突或夸大的说法，以及正确口径"]}"""

EXPLAIN_SYSTEM ="""你是 AI Agent 工程导师。用户在复习自己的项目架构图时点击了一个模块，问了一个问题。
结合给出的项目资料，用 Markdown 简洁回答（150–300 字）：先给结论，再讲机制或原因，最后给一句面试时怎么说。
资料里有明确的结论、次数或数字时直接照用，不要自己推演出不同的数字。
如果资料不足以确定，就明确说明哪些是通用做法、哪些需要对照代码确认。"""


class Handler(SimpleHTTPRequestHandler):
    # explicit types: the Windows registry can map .js to text/plain
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".html": "text/html; charset=utf-8",
                      ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                      ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):            # keep pythonw quiet
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/health":
            return self.send_json({"ok": True, "ai": AI_READY, "model": MODEL})
        if path == "/api/content":
            ensure_content()
            body = (DATA / "content.json").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if path.startswith("/files/"):
            name = path[len("/files/"):]
            target = (MATERIALS / name).resolve()
            if not MATERIALS.exists() or target.parent != MATERIALS.resolve() or not target.is_file():
                return self.send_error(404)
            ctype = {".pdf": "application/pdf", ".md": "text/plain; charset=utf-8", ".py": "text/plain; charset=utf-8",
                     ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}.get(
                target.suffix, "application/octet-stream")
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/shutdown":
            self.send_json({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except json.JSONDecodeError:
            return self.send_json({"error": "bad json"}, 400)
        if not AI_READY:
            return self.send_json({"error": f"AI 未配置：在 {ENV_FILE} 里设置 LLM_API_KEY、LLM_MODEL_ID（和 LLM_BASE_URL）"}, 400)
        try:
            lang = req.get("lang", "zh")
            if path == "/api/grade":
                system = GRADE_SYSTEM + ("\n" + FOLLOWUP_RULE if req.get("followup") else "") + "\n" + lang_rule(lang)
                original = f"原题：{req['original']}\n" if req.get("original") else ""
                user = (f"{original}面试题：{req.get('question', '')}\n\n参考答案（中文）：\n{req.get('reference_zh', '')}\n\n"
                        f"参考答案（English）：\n{req.get('reference_en', '')}\n\n候选人的回答：\n{req.get('answer', '')}")
                out = chat([{"role": "system", "content": system}, {"role": "user", "content": user}], json_mode=True)
                return self.send_json(json.loads(out))
            if path == "/api/interview":
                history = "\n".join(f"{'面试官' if h['role'] == 'ai' else '候选人'}：{h['text']}" for h in req.get("history", []))
                final = bool(req.get("final"))
                user = (f"项目资料：\n{req.get('context', '')}\n\n对话记录：\n{history or '（还没有开始）'}\n\n"
                        + ("请给出总评。" if final else "请给出下一步。"))
                out = chat([{"role": "system", "content": (FINAL_SYSTEM if final else INTERVIEW_SYSTEM) + "\n" + lang_rule(lang)},
                            {"role": "user", "content": user}], json_mode=True, max_tokens=1200 if final else 900)
                return self.send_json(json.loads(out))
            if path == "/api/explain":
                user = f"项目资料：\n{req.get('context', '')}\n\n问题：{req.get('question', '')}"
                out = chat([{"role": "system", "content": EXPLAIN_SYSTEM + "\n" + lang_rule(lang)},
                            {"role": "user", "content": user}], json_mode=False, max_tokens=900)
                return self.send_json({"answer": out})
            return self.send_json({"error": "unknown endpoint"}, 404)
        except urllib.error.HTTPError as e:
            return self.send_json({"error": f"模型接口返回 {e.code}"}, 502)
        except Exception as e:                    # surface the reason instead of failing silently
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 502)


def main():
    if sys.stderr is None:                        # pythonw has no console: keep tracebacks in a small log
        DATA.mkdir(exist_ok=True)
        sys.stdout = sys.stderr = open(DATA / "server.log", "a", encoding="utf-8", buffering=1)
    ensure_content()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
