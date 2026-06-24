#!/usr/bin/env python3
"""No-cache static server for the house bench.

Browsers cache ES modules aggressively, so after an edit a reload can show a
stale (or blank) page. This server sends no-store headers so every reload pulls
fresh code. Serves the project root.

    python3 game/serve.py [port]      # default 8126
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8126
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, *a):
        pass  # quiet


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as httpd:
    print(f"no-cache server on http://localhost:{PORT}  (serving {ROOT})")
    httpd.serve_forever()
