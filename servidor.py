#!/usr/bin/env python3
"""Servidor local SOLO para probar la página en tu computador.

    python3 servidor.py            →  http://localhost:8000
    python3 servidor.py 8080       →  otro puerto

Por qué no usar "python3 -m http.server": ese servidor no entiende las
peticiones "Range", y sin ellas el navegador no puede saltar dentro de un
video, así que no avanzaría al hacer scroll. Este sí lo soporta.
No hace falta subir este archivo a GitHub (GitHub Pages ya soporta Range).
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)$")


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        header = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not header or not os.path.isfile(path):
            return super().send_head()

        m = RANGE_RE.match(header.strip())
        if not m:
            return super().send_head()

        size = os.path.getsize(path)
        start, end = m.groups()
        if start == "":                        # "bytes=-500" → los últimos 500 bytes
            if end == "":
                return super().send_head()
            start, end = max(0, size - int(end)), size - 1
        else:
            start = int(start)
            end = int(end) if end else size - 1
        end = min(end, size - 1)

        if start >= size or start > end:
            self.send_error(416, "Requested Range Not Satisfiable")
            self.send_header("Content-Range", f"bytes */{size}")
            return None

        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(chunk)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")   # que veas los cambios al recargar
        super().end_headers()

    def log_message(self, fmt, *args):
        if "206" in fmt % args or "200" in fmt % args:   # menos ruido en la terminal
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    folder = os.path.dirname(os.path.abspath(__file__))
    handler = partial(RangeHandler, directory=folder)
    with ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"Página en http://localhost:{port}   (Ctrl+C para detener)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
