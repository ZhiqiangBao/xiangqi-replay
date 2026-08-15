"""一键启动本地服务器 + 皮卡鱼引擎分析服务。

用法：
    python engine_server.py

浏览器会自动打开 http://localhost:8000
在页面中按 E 键连接引擎，获取局面评估。
按 Ctrl+C 停止。
"""

import http.server
import socketserver
import webbrowser
import subprocess
import threading
import json
import os
import sys
import re
import queue

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 皮卡鱼引擎路径（按优先级探测）
_CANDIDATE_DIRS = [
    os.path.join(DIRECTORY, "nnue"),                              # 项目下 nnue/ 文件夹（推荐）
    r"D:\Program Files (x86)\皮卡鱼\Chinese-chess\src",          # 本地安装路径
    r"C:\Program Files (x86)\皮卡鱼\Chinese-chess\src",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "pikafish", "src"),
]
PIKAFISH_EXE = None
PIKAFISH_DIR = None
for _d in _CANDIDATE_DIRS:
    _exe = os.path.join(_d, "pikafish.exe")
    if os.path.isfile(_exe):
        PIKAFISH_EXE = _exe
        PIKAFISH_DIR = _d
        break


class Engine:
    """皮卡鱼 UCI 引擎封装。"""

    def __init__(self):
        self.proc = None
        self.responses = queue.Queue()
        self.lock = threading.Lock()
        self.ready = False

    def start(self):
        if not PIKAFISH_EXE:
            return False
        try:
            self.proc = subprocess.Popen(
                [PIKAFISH_EXE],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                cwd=PIKAFISH_DIR,
                bufsize=1,
            )
        except Exception:
            return False
        threading.Thread(target=self._read_loop, daemon=True).start()
        self.send("uci")
        if not self._wait_for("uciok", timeout=15):
            return False
        self.send("isready")
        if not self._wait_for("readyok", timeout=30):
            return False
        # 限制搜索线程数，减少本地资源占用
        self.send("setoption name Threads value 2")
        self.send("setoption name Hash value 128")
        self.ready = True
        return True

    def _read_loop(self):
        try:
            for line in self.proc.stdout:
                self.responses.put(line.strip())
        except Exception:
            pass

    def send(self, cmd):
        if not self.proc:
            return
        try:
            self.proc.stdin.write(cmd + "\n")
            self.proc.stdin.flush()
        except Exception:
            self.ready = False

    def _wait_for(self, token, timeout=30):
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                line = self.responses.get(timeout=1)
                if token in line:
                    return True
            except queue.Empty:
                continue
        return False

    def evaluate(self, fen, depth=15):
        if not self.ready:
            return {"error": "engine not ready"}
        with self.lock:
            self.responses.queue.clear()
            self.send(f"position fen {fen}")
            self.send(f"go depth {depth}")
            score = None
            score_type = None
            bestmove = None
            pv = None
            import time
            deadline = time.time() + 30
            while time.time() < deadline:
                try:
                    line = self.responses.get(timeout=1)
                except queue.Empty:
                    continue
                if line.startswith("info") and "score" in line:
                    m = re.search(r"score (cp|mate)\s+(-?\d+)", line)
                    if m:
                        score_type = m.group(1)
                        score = int(m.group(2))
                    m2 = re.search(r" pv (.+)", line)
                    if m2:
                        pv = m2.group(1)
                elif line.startswith("bestmove"):
                    parts = line.split()
                    if len(parts) >= 2:
                        bestmove = parts[1]
                    break
            return {
                "score": score,
                "scoreType": score_type,
                "bestMove": bestmove,
                "pv": pv,
            }

    def stop(self):
        self.ready = False
        if self.proc:
            try:
                self.send("quit")
                self.proc.wait(timeout=3)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass


engine = Engine()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            self._send_json(200, {"connected": engine.ready, "engine": "pikafish"})
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/evaluate":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                req = json.loads(body)
                fen = req.get("fen", "")
                depth = req.get("depth", 15)
                if not fen:
                    self._send_json(400, {"error": "missing fen"})
                    return
                result = engine.evaluate(fen, depth)
                self._send_json(200, result)
            except Exception as e:
                self._send_json(500, {"error": str(e)})
            return
        if self.path == "/api/shutdown":
            self._send_json(200, {"ok": True})
            threading.Thread(target=lambda: (engine.stop(), os._exit(0)), daemon=True).start()
            return
        self._send_json(404, {"error": "not found"})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    os.chdir(DIRECTORY)

    # 启动引擎
    if PIKAFISH_EXE:
        print(f"正在启动皮卡鱼引擎：{PIKAFISH_EXE}")
        if engine.start():
            print("引擎已就绪")
        else:
            print("警告：引擎启动失败，按 E 键将无法使用")
    else:
        print("提示：未找到 pikafish.exe，引擎功能不可用")
        print("      请安装皮卡鱼或将 pikafish.exe 放到以下目录之一：")
        for d in _CANDIDATE_DIRS:
            print(f"        {d}")

    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            url = f"http://localhost:{port}"
            print(f"服务器已启动：{url}")
            print(f"正在打开浏览器...")
            print(f"按 Ctrl+C 停止")
            webbrowser.open(url)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止...")
        engine.stop()
        print("服务器已停止")
        sys.exit(0)
    except OSError as e:
        print(f"启动失败（端口 {port} 可能被占用）：{e}")
        print(f"换一个端口试试：python engine_server.py 8080")
        sys.exit(1)


if __name__ == "__main__":
    main()
