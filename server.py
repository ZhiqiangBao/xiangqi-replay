"""一键启动本地服务器，浏览器自动打开象棋复盘工具。

用法：
    python server.py

然后浏览器会自动打开 http://localhost:8000
按 Ctrl+C 停止。
"""

import http.server
import socketserver
import webbrowser
import os
import sys

DEFAULT_PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    os.chdir(DIRECTORY)
    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            url = f"http://localhost:{port}"
            print(f"服务器已启动：{url}")
            print(f"正在打开浏览器...")
            print(f"按 Ctrl+C 停止")
            webbrowser.open(url)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        sys.exit(0)
    except OSError as e:
        print(f"启动失败（端口 {port} 可能被占用）：{e}")
        print(f"换一个端口试试：python server.py 8080")
        sys.exit(1)


if __name__ == "__main__":
    main()
