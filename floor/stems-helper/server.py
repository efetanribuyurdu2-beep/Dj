#!/usr/bin/env python3
"""FLOOR stem helper: separates your own local audio files into stems with Demucs.

Runs only on 127.0.0.1. Files are written to a temp folder and deleted when the
browser has downloaded the stems (or after an hour).

    pip install demucs          # once (installs PyTorch too)
    python server.py            # then open FLOOR → Deck → Stem yardımcısı

Options: --port 7777  --model htdemucs  --device cpu|cuda|mps
         --allow-origin https://<your-pages-site>   (repeatable)
         --fake   (TEST ONLY: crude ffmpeg filters instead of Demucs)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Queue
from urllib.parse import urlparse

VERSION = "1.0.0"
STEMS = ("vocals", "drums", "bass", "other")
MAX_UPLOAD = 400 * 1024 * 1024
JOB_TTL = 3600
LOCAL_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$")
PROGRESS = re.compile(r"(\d{1,3})%\|")
SAFE_EXT = re.compile(r"\.(mp3|wav|aiff?|flac|m4a|ogg)$", re.I)


class Job:
    def __init__(self, workdir: str, src: str):
        self.id = uuid.uuid4().hex[:12]
        self.workdir = workdir
        self.src = src
        self.status = "queued"
        self.progress = 0
        self.error: str | None = None
        self.created = time.time()
        self.cancelled = False
        self.proc: subprocess.Popen | None = None

    def public(self) -> dict:
        d = {"id": self.id, "status": self.status, "progress": self.progress}
        if self.error:
            d["error"] = self.error
        if self.status == "done":
            d["stems"] = list(STEMS)
        return d

    def stem_path(self, stem: str) -> str:
        return os.path.join(self.workdir, "out", f"{stem}.wav")


class Separator:
    """Runs one job at a time (Demucs uses all cores / the GPU anyway)."""

    def __init__(self, model: str, device: str | None, fake: bool):
        self.model = model
        self.device = device
        self.fake = fake
        self.jobs: dict[str, Job] = {}
        self.queue: Queue[Job] = Queue()
        self.lock = threading.Lock()
        threading.Thread(target=self._worker, daemon=True).start()
        threading.Thread(target=self._janitor, daemon=True).start()

    def submit(self, data: bytes, filename: str) -> Job:
        ext = SAFE_EXT.search(filename)
        workdir = tempfile.mkdtemp(prefix="floor-stems-")
        src = os.path.join(workdir, "input" + (ext.group(0).lower() if ext else ".wav"))
        with open(src, "wb") as f:
            f.write(data)
        job = Job(workdir, src)
        with self.lock:
            self.jobs[job.id] = job
        self.queue.put(job)
        return job

    def get(self, job_id: str) -> Job | None:
        with self.lock:
            return self.jobs.get(job_id)

    def remove(self, job_id: str) -> bool:
        with self.lock:
            job = self.jobs.pop(job_id, None)
        if not job:
            return False
        job.cancelled = True
        if job.proc and job.proc.poll() is None:
            job.proc.terminate()
        shutil.rmtree(job.workdir, ignore_errors=True)
        return True

    def _janitor(self):
        while True:
            time.sleep(60)
            now = time.time()
            for jid, job in list(self.jobs.items()):
                if now - job.created > JOB_TTL:
                    self.remove(jid)

    def _worker(self):
        while True:
            job = self.queue.get()
            if job.cancelled:
                continue
            job.status = "running"
            try:
                os.makedirs(os.path.join(job.workdir, "out"), exist_ok=True)
                if self.fake:
                    self._fake(job)
                else:
                    self._demucs(job)
                missing = [s for s in STEMS if not os.path.exists(job.stem_path(s))]
                if job.cancelled:
                    continue
                if missing:
                    raise RuntimeError("Eksik stem: " + ", ".join(missing))
                job.progress = 100
                job.status = "done"
            except Exception as e:  # noqa: BLE001 – report any failure to the browser
                job.status = "error"
                job.error = str(e)[-600:]

    def demucs_command(self, job: Job) -> list[str]:
        cmd = [sys.executable, "-m", "demucs", "-n", self.model, "-o", os.path.join(job.workdir, "demucs"), "--filename", "{stem}.{ext}"]
        if self.device:
            cmd += ["-d", self.device]
        return cmd + [job.src]

    def _demucs(self, job: Job):
        job.proc = subprocess.Popen(self.demucs_command(job), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        tail: list[str] = []
        assert job.proc.stdout is not None
        buf = ""
        while True:
            ch = job.proc.stdout.read(1)
            if not ch:
                break
            if ch in "\r\n":
                m = PROGRESS.findall(buf)
                if m:
                    job.progress = max(job.progress, min(99, int(m[-1])))
                if buf.strip():
                    tail = (tail + [buf.strip()])[-8:]
                buf = ""
            else:
                buf += ch
        code = job.proc.wait()
        if job.cancelled:
            return
        if code != 0:
            raise RuntimeError("Demucs hata verdi:\n" + "\n".join(tail))
        produced = os.path.join(job.workdir, "demucs", self.model)
        for s in STEMS:
            shutil.move(os.path.join(produced, f"{s}.wav"), job.stem_path(s))

    def _fake(self, job: Job):
        """TEST ONLY. Crude EQ splits so the browser ↔ helper protocol can be exercised without Demucs."""
        if not shutil.which("ffmpeg"):
            raise RuntimeError("--fake modu için ffmpeg gerekli")
        filters = {
            "vocals": "highpass=f=300,lowpass=f=3400",
            "drums": "highpass=f=5000",
            "bass": "lowpass=f=150",
            "other": "highpass=f=3400,lowpass=f=5000",
        }
        for i, (stem, af) in enumerate(filters.items()):
            if job.cancelled:
                return
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", job.src, "-af", af, "-c:a", "pcm_s16le", job.stem_path(stem)],
                check=True,
                capture_output=True,
            )
            job.progress = int((i + 1) / len(filters) * 95)


def make_handler(sep: Separator, extra_origins: set[str]):
    class Handler(BaseHTTPRequestHandler):
        server_version = f"floor-stems/{VERSION}"

        def log_message(self, fmt, *args):  # quieter log
            sys.stderr.write("[stems] " + (fmt % args) + "\n")

        # --- CORS: only local pages and explicitly allowed origins ---
        def _origin_ok(self) -> str | None:
            origin = self.headers.get("Origin")
            if origin is None:
                return None  # same-origin / curl
            if LOCAL_ORIGIN.match(origin) or origin in extra_origins:
                return origin
            return ""

        def _cors(self, origin: str | None):
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _json(self, code: int, body: dict, origin: str | None):
            data = json.dumps(body).encode()
            self.send_response(code)
            self._cors(origin)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _guard(self) -> str | None | bool:
            origin = self._origin_ok()
            if origin == "":
                self._json(403, {"error": "Bu kaynağa izin verilmiyor. --allow-origin ile ekleyin."}, None)
                return False
            return origin

        def do_OPTIONS(self):
            origin = self._guard()
            if origin is False:
                return
            self.send_response(204)
            self._cors(origin)  # type: ignore[arg-type]
            self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename")
            # Chrome Private Network Access: a public https page may call this local helper.
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
            self.end_headers()

        def do_GET(self):
            origin = self._guard()
            if origin is False:
                return
            path = urlparse(self.path).path.rstrip("/")
            if path == "/health":
                return self._json(
                    200,
                    {"ok": True, "model": "fake-eq-test" if sep.fake else sep.model, "device": sep.device or "auto", "fake": sep.fake, "version": VERSION},
                    origin,  # type: ignore[arg-type]
                )
            m = re.fullmatch(r"/jobs/([0-9a-f]{12})", path)
            if m:
                job = sep.get(m.group(1))
                return self._json(200, job.public(), origin) if job else self._json(404, {"error": "İş bulunamadı"}, origin)  # type: ignore[arg-type]
            m = re.fullmatch(r"/jobs/([0-9a-f]{12})/(vocals|drums|bass|other)\.wav", path)
            if m:
                job = sep.get(m.group(1))
                if not job or job.status != "done":
                    return self._json(404, {"error": "Stem hazır değil"}, origin)  # type: ignore[arg-type]
                p = job.stem_path(m.group(2))
                size = os.path.getsize(p)
                self.send_response(200)
                self._cors(origin)  # type: ignore[arg-type]
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(size))
                self.end_headers()
                with open(p, "rb") as f:
                    shutil.copyfileobj(f, self.wfile)
                return
            self._json(404, {"error": "Bulunamadı"}, origin)  # type: ignore[arg-type]

        def do_POST(self):
            origin = self._guard()
            if origin is False:
                return
            if urlparse(self.path).path.rstrip("/") != "/separate":
                return self._json(404, {"error": "Bulunamadı"}, origin)  # type: ignore[arg-type]
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0:
                return self._json(400, {"error": "Boş dosya"}, origin)  # type: ignore[arg-type]
            if length > MAX_UPLOAD:
                return self._json(413, {"error": "Dosya 400 MB sınırını aşıyor"}, origin)  # type: ignore[arg-type]
            data = self.rfile.read(length)
            from urllib.parse import unquote

            name = unquote(self.headers.get("X-Filename", "track.wav"))[:200]
            job = sep.submit(data, name)
            self._json(202, job.public(), origin)  # type: ignore[arg-type]

        def do_DELETE(self):
            origin = self._guard()
            if origin is False:
                return
            m = re.fullmatch(r"/jobs/([0-9a-f]{12})", urlparse(self.path).path.rstrip("/"))
            ok = bool(m) and sep.remove(m.group(1))  # type: ignore[union-attr]
            self._json(200 if ok else 404, {"ok": ok}, origin)  # type: ignore[arg-type]

    return Handler


def build_server(port: int, model: str, device: str | None, fake: bool, origins: set[str]) -> ThreadingHTTPServer:
    sep = Separator(model, device, fake)
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(sep, origins))


def main():
    ap = argparse.ArgumentParser(description="FLOOR stem helper (Demucs)")
    ap.add_argument("--port", type=int, default=7777)
    ap.add_argument("--model", default="htdemucs", help="htdemucs (varsayılan), htdemucs_ft (daha iyi, 4× yavaş), mdx_extra")
    ap.add_argument("--device", choices=["cpu", "cuda", "mps"], default=None)
    ap.add_argument("--allow-origin", action="append", default=[], help="ör. https://kullanici.github.io")
    ap.add_argument("--fake", action="store_true", help="YALNIZCA TEST: Demucs yerine kaba ffmpeg filtreleri")
    a = ap.parse_args()
    if not a.fake and importlib.util.find_spec("demucs") is None:
        print("Demucs kurulu değil. Kurmak için:\n  pip install demucs\n(ffmpeg de gerekli: macOS'ta `brew install ffmpeg`)", file=sys.stderr)
        sys.exit(1)
    if not a.fake and not shutil.which("ffmpeg"):
        print("Uyarı: ffmpeg bulunamadı; MP3 dosyaları açılamayabilir. macOS: brew install ffmpeg", file=sys.stderr)
    srv = build_server(a.port, a.model, a.device, a.fake, set(a.allow_origin))
    mode = "SAHTE TEST MODU" if a.fake else f"Demucs {a.model}"
    print(f"FLOOR stem yardımcısı hazır: http://127.0.0.1:{a.port}  ({mode})")
    print("Durdurmak için Ctrl+C.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
