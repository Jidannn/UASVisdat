"""
serve.py — server lokal untuk folder docs TANPA cache, supaya perubahan berkas selalu terbaca.

Pemakaian (dari folder proyek poverty-story):
  python scripts/serve.py            # port 8000
  python scripts/serve.py 8080       # port lain
Lalu buka http://localhost:8000
"""
import functools
import http.server
import socketserver
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DOCS = Path("docs")
if not DOCS.is_dir():
    sys.exit("Folder 'docs' tidak ditemukan. Jalankan dari folder poverty-story.")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), functools.partial(Handler, directory=str(DOCS))) as httpd:
    print(f"Menyajikan {DOCS.resolve()} di http://localhost:{PORT}  (tekan Ctrl+C untuk berhenti)")
    httpd.serve_forever()