"""MAI-Reel extractor: turns a platform link into subtitles or into an audio file.

The browser cannot do this by itself. YouTube, TikTok and Instagram serve their media from
hosts with no CORS and behind tokens that change constantly, so every "paste a link and get
the transcript" site runs something like this on a server. yt-dlp is the piece that keeps up
with those changes; this is a thin, boring wrapper around it.

Endpoints
  GET /health                     -> {"ok": true, "ytdlp": "..."}
  GET /transcript?url=&lang=es    -> {"source":"captions","title":...,"cues":[{start,end,text}]}
                                     or 404 {"error":"nocaptions"} when the video has none
  GET /audio?url=                 -> audio/* body, so the browser can run Whisper on it
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import yt_dlp

PORT = int(os.environ.get("PORT", "8787"))
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")
MAX_DURATION = int(os.environ.get("MAX_DURATION", "3600"))  # seconds of source video
RATE_PER_MIN = int(os.environ.get("RATE_PER_MIN", "20"))

ALLOWED_HOSTS = (
    "youtube.com", "youtu.be", "youtube-nocookie.com",
    "tiktok.com", "instagram.com", "facebook.com", "fb.watch",
    "twitter.com", "x.com", "vimeo.com", "twitch.tv", "dailymotion.com",
    "reddit.com", "soundcloud.com",
)

_hits: dict[str, list[float]] = {}
_lock = threading.Lock()


def rate_limited(ip: str) -> bool:
    now = time.time()
    with _lock:
        hits = [t for t in _hits.get(ip, []) if now - t < 60]
        hits.append(now)
        _hits[ip] = hits
        return len(hits) > RATE_PER_MIN


def host_allowed(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return False
    host = host.lower().removeprefix("www.")
    return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def ydl_options(**extra) -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "skip_download": True,
        "socket_timeout": 30,
        "retries": 2,
        "extractor_args": {"youtube": {"player_client": ["web", "android", "ios"]}},
    }
    opts.update(extra)
    return opts


def cues_from_json3(raw: str) -> list[dict]:
    """YouTube's json3 caption format -> plain cues."""
    data = json.loads(raw)
    cues: list[dict] = []
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if not text:
            continue
        start = event.get("tStartMs", 0) / 1000
        end = start + event.get("dDurationMs", 0) / 1000
        cues.append({"start": round(start, 3), "end": round(max(end, start + 0.4), 3), "text": text})
    return cues


def cues_from_vtt(raw: str) -> list[dict]:
    """Fallback for extractors that only offer vtt."""
    stamp = re.compile(
        r"(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})"
    )
    cues: list[dict] = []
    lines = raw.splitlines()
    for i, line in enumerate(lines):
        m = stamp.search(line)
        if not m:
            continue
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (int(x) for x in m.groups())
        start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000
        end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000
        text_lines = []
        for follow in lines[i + 1:]:
            if not follow.strip() or stamp.search(follow):
                break
            text_lines.append(re.sub(r"<[^>]+>", "", follow).strip())
        text = " ".join(t for t in text_lines if t).strip()
        if text and (not cues or cues[-1]["text"] != text):
            cues.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    return cues


def pick_track(info: dict, lang: str) -> tuple[str, str] | None:
    """Prefers a real subtitle track, then an automatic one, in the requested language."""
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    wanted = [lang, lang.split("-")[0]] if lang and lang != "auto" else []
    original = info.get("language")
    if original:
        wanted.append(original)

    for source in (manual, auto):
        for code in wanted:
            for key in source:
                if key == code or key.startswith(code + "-") or key.startswith(code):
                    return key, _best_url(source[key])
    for source in (manual, auto):
        if source:
            key = next(iter(source))
            return key, _best_url(source[key])
    return None


def _best_url(formats: list[dict]) -> str:
    for fmt in formats:
        if fmt.get("ext") == "json3":
            return fmt["url"]
    for fmt in formats:
        if fmt.get("ext") in ("vtt", "srv3", "srv1"):
            return fmt["url"]
    return formats[0]["url"]


def fetch_transcript(url: str, lang: str) -> dict:
    with yt_dlp.YoutubeDL(ydl_options(writesubtitles=True, writeautomaticsub=True)) as ydl:
        info = ydl.extract_info(url, download=False)
        if info.get("duration") and info["duration"] > MAX_DURATION:
            return {"error": "toolong", "duration": info["duration"]}

        picked = pick_track(info, lang)
        if not picked:
            return {"error": "nocaptions", "title": info.get("title"), "duration": info.get("duration")}

        code, sub_url = picked
        raw = ydl.urlopen(sub_url).read().decode("utf-8", "replace")

    cues = cues_from_json3(raw) if raw.lstrip().startswith("{") else cues_from_vtt(raw)
    if not cues:
        return {"error": "nocaptions", "title": info.get("title")}
    return {
        "source": "captions",
        "title": info.get("title"),
        "duration": info.get("duration"),
        "lang": code,
        "cues": cues,
    }


def fetch_audio(url: str) -> tuple[bytes, str]:
    """Downloads the smallest audio-only stream so the browser can transcribe it locally."""
    tmp = tempfile.mkdtemp(prefix="maireel-")
    try:
        opts = ydl_options(
            skip_download=False,
            format="bestaudio[filesize<80M]/bestaudio/best",
            outtmpl=os.path.join(tmp, "audio.%(ext)s"),
        )
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info.get("duration") and info["duration"] > MAX_DURATION:
                raise ValueError("toolong")
        files = [f for f in os.listdir(tmp) if not f.endswith(".part")]
        if not files:
            raise ValueError("nomedia")
        path = os.path.join(tmp, files[0])
        with open(path, "rb") as fh:
            data = fh.read()
        ext = os.path.splitext(path)[1].lstrip(".") or "m4a"
        mime = {"m4a": "audio/mp4", "mp4": "audio/mp4", "webm": "audio/webm", "opus": "audio/ogg",
                "mp3": "audio/mpeg", "ogg": "audio/ogg"}.get(ext, "application/octet-stream")
        return data, mime
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "MAIReelExtractor/1.0"

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", ALLOW_ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        url = (query.get("url") or [""])[0].strip()
        lang = (query.get("lang") or ["auto"])[0]

        if parsed.path == "/health":
            self._json({"ok": True, "ytdlp": yt_dlp.version.__version__})
            return

        ip = self.headers.get("cf-connecting-ip") or self.client_address[0]
        if rate_limited(ip):
            self._json({"error": "ratelimited"}, 429)
            return

        if parsed.path not in ("/transcript", "/audio"):
            self._json({"error": "notfound"}, 404)
            return
        if not url or not host_allowed(url):
            self._json({"error": "badurl"}, 400)
            return

        try:
            if parsed.path == "/transcript":
                result = fetch_transcript(url, lang)
                self._json(result, 404 if result.get("error") == "nocaptions" else 200)
                return

            data, mime = fetch_audio(url)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:  # noqa: BLE001 - any extractor failure is a 502 for the client
            self._json({"error": "extractor", "detail": str(exc)[:200]}, 502)

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    io.DEFAULT_BUFFER_SIZE = 1 << 16
    print(f"MAI-Reel extractor on :{PORT} (yt-dlp {yt_dlp.version.__version__})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
