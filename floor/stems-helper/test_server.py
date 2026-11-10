"""Protocol tests for the stem helper (uses the --fake backend; needs ffmpeg).

    python -m unittest stems-helper/test_server.py
"""
import io
import json
import math
import os
import shutil
import struct
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
import wave

sys.path.insert(0, os.path.dirname(__file__))
import server  # noqa: E402


def sine_wav(seconds=2.0, sr=44100) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = b"".join(struct.pack("<hh", s, s) for s in (int(8000 * math.sin(2 * math.pi * 110 * i / sr)) for i in range(int(sr * seconds))))
        w.writeframes(frames)
    return buf.getvalue()


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg required")
class HelperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = server.build_server(0, "htdemucs", None, True, {"https://me.github.io"})
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, path, method="GET", data=None, headers=None):
        r = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def test_health_reports_fake_mode(self):
        code, _, body = self.req("/health")
        self.assertEqual(code, 200)
        h = json.loads(body)
        self.assertTrue(h["fake"])
        self.assertEqual(h["model"], "fake-eq-test")

    def test_full_job_roundtrip(self):
        code, hdr, body = self.req("/separate", "POST", sine_wav(), {"X-Filename": "my%20track.wav", "Origin": "http://localhost:5173"})
        self.assertEqual(code, 202)
        self.assertEqual(hdr.get("Access-Control-Allow-Origin"), "http://localhost:5173")
        job = json.loads(body)
        for _ in range(100):
            job = json.loads(self.req(f"/jobs/{job['id']}")[2])
            if job["status"] in ("done", "error"):
                break
            time.sleep(0.1)
        self.assertEqual(job["status"], "done", job)
        self.assertEqual(job["progress"], 100)
        for s in server.STEMS:
            code, hdr, wav = self.req(f"/jobs/{job['id']}/{s}.wav")
            self.assertEqual(code, 200)
            self.assertEqual(hdr["Content-Type"], "audio/wav")
            self.assertEqual(wav[:4], b"RIFF")
        self.assertEqual(self.req(f"/jobs/{job['id']}", "DELETE")[0], 200)
        self.assertEqual(self.req(f"/jobs/{job['id']}")[0], 404)

    def test_cors_blocks_unknown_sites(self):
        code, hdr, _ = self.req("/health", headers={"Origin": "https://evil.example"})
        self.assertEqual(code, 403)
        self.assertNotIn("Access-Control-Allow-Origin", hdr)
        code, hdr, _ = self.req("/health", headers={"Origin": "https://me.github.io"})
        self.assertEqual(code, 200)
        self.assertEqual(hdr["Access-Control-Allow-Origin"], "https://me.github.io")

    def test_private_network_preflight(self):
        code, hdr, _ = self.req(
            "/separate",
            "OPTIONS",
            headers={"Origin": "https://me.github.io", "Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"},
        )
        self.assertEqual(code, 204)
        self.assertEqual(hdr["Access-Control-Allow-Private-Network"], "true")

    def test_bad_requests(self):
        self.assertEqual(self.req("/separate", "POST", b"")[0], 400)
        self.assertEqual(self.req("/jobs/000000000000")[0], 404)
        self.assertEqual(self.req("/jobs/000000000000/vocals.wav")[0], 404)
        self.assertEqual(self.req("/../../etc/passwd")[0], 404)

    def test_bad_audio_reports_error(self):
        code, _, body = self.req("/separate", "POST", b"not audio at all", {"X-Filename": "x.mp3"})
        job = json.loads(body)
        for _ in range(50):
            job = json.loads(self.req(f"/jobs/{job['id']}")[2])
            if job["status"] in ("done", "error"):
                break
            time.sleep(0.1)
        self.assertEqual(job["status"], "error")

    def test_demucs_command(self):
        sep = server.Separator("htdemucs_ft", "mps", False)
        job = server.Job("/tmp/w", "/tmp/w/input.mp3")
        cmd = sep.demucs_command(job)
        self.assertEqual(cmd[1:3], ["-m", "demucs"])
        self.assertIn("htdemucs_ft", cmd)
        self.assertEqual(cmd[cmd.index("-d") + 1], "mps")
        self.assertEqual(cmd[cmd.index("--filename") + 1], "{stem}.{ext}")
        self.assertEqual(cmd[-1], "/tmp/w/input.mp3")


if __name__ == "__main__":
    unittest.main()
