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
import time

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 客户端心跳：浏览器每隔几秒 POST /api/heartbeat，服务端超过阈值无心跳则自动退出。
# 这是 sendBeacon 不可靠场景下的兜底机制（关闭浏览器时 beforeunload 可能在发包前被销毁）。
HEARTBEAT_TIMEOUT = 15.0   # 秒：超过这么久没收到任何前端请求，认为浏览器已关闭
_last_client_seen = time.time()

# 皮卡鱼引擎路径（按优先级探测）
_CANDIDATE_DIRS = [
    os.path.join(DIRECTORY, "nnue"),                              # 项目下 nnue/ 文件夹（推荐）
    r"D:\Program Files (x86)\皮卡鱼\Chinese-chess\src",          # 本地安装路径
    r"C:\Program Files (x86)\皮卡鱼\Chinese-chess\src",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "pikafish", "src"),
]

def _find_pikafish_exe(directory):
    """在目录中查找 pikafish.exe，支持带 CPU 后缀的文件名（如 pikafish-bmi2.exe）。"""
    # 优先精确匹配 pikafish.exe
    exact = os.path.join(directory, "pikafish.exe")
    if os.path.isfile(exact):
        return exact
    # 其次匹配 pikafish-*.exe，按 CPU 优先级排序（高性能优先）
    _cpu_order = ["vnni512", "avx512icl", "avx512", "avxvnni", "bmi2", "avx2", "sse41-popcnt"]
    for suffix in _cpu_order:
        exe = os.path.join(directory, f"pikafish-{suffix}.exe")
        if os.path.isfile(exe):
            return exe
    # 兜底：匹配任何 pikafish*.exe
    try:
        for f in os.listdir(directory):
            if f.lower().startswith("pikafish") and f.lower().endswith(".exe"):
                return os.path.join(directory, f)
    except OSError:
        pass
    return None

PIKAFISH_EXE = None
PIKAFISH_DIR = None
for _d in _CANDIDATE_DIRS:
    _exe = _find_pikafish_exe(_d)
    if _exe:
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

    def _touch_heartbeat(self):
        """任何前端请求都视为「浏览器还活着」。"""
        global _last_client_seen
        _last_client_seen = time.time()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self._touch_heartbeat()
        if self.path == "/api/status":
            self._send_json(200, {"connected": engine.ready, "engine": "pikafish"})
            return
        super().do_GET()

    def do_POST(self):
        self._touch_heartbeat()
        if self.path == "/api/heartbeat":
            self._send_json(200, {"ok": True})
            return
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


def _heartbeat_watcher():
    """守护线程：浏览器关闭后 sendBeacon 不可靠，靠心跳超时兜底退出。"""
    # 启动后给 30 秒宽限期，让浏览器先连上
    grace_deadline = time.time() + 30.0
    while True:
        time.sleep(2.0)
        # 宽限期内不退出（即使没收到请求，也可能是浏览器还没连上）
        if time.time() < grace_deadline:
            continue
        idle = time.time() - _last_client_seen
        if idle > HEARTBEAT_TIMEOUT:
            print(f"[心跳超时] 已 {idle:.0f}s 未收到前端请求，判定浏览器已关闭，自动退出。")
            try:
                engine.stop()
            except Exception:
                pass
            os._exit(0)


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

    # 启动心跳守护线程：浏览器关闭后自动退出
    threading.Thread(target=_heartbeat_watcher, daemon=True).start()

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
