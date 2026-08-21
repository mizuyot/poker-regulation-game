#!/usr/bin/env python3
"""Serve the game and append anonymous answer logs as JSONL.

Stored fields only: session_id, question_id, selected, is_match, timestamp.
Does not persist IP, User-Agent, Referer, or any other request metadata.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA_DIR = ROOT / "data"
ANSWERS_PATH = DATA_DIR / "answers.jsonl"
QUESTIONS_PATH = ROOT / "questions.json"
HOST = "127.0.0.1"
PORT = 8765

SESSION_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
QUESTION_IDS = set()
CHOICES_BY_QUESTION = {}


def load_questions():
    payload = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    QUESTION_IDS.clear()
    CHOICES_BY_QUESTION.clear()
    for item in payload["questions"]:
        qid = item["id"]
        QUESTION_IDS.add(qid)
        CHOICES_BY_QUESTION[qid] = {choice["id"] for choice in item["choices"]}
    return payload


load_questions()


def parse_timestamp(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp")
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Intentionally omit client address so request metadata is not retained.
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))

    def _send(self, code, body, content_type, extra_headers=None):
        payload = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def _json_error(self, code, message):
        self._send(code, json.dumps({"ok": False, "error": message}), "application/json; charset=utf-8")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            html = (STATIC / "index.html").read_bytes()
            self._send(200, html, "text/html; charset=utf-8")
            return
        if path == "/api/answers":
            self._json_error(405, "method_not_allowed")
            return
        if path == "/questions.json":
            self._send(
                200,
                QUESTIONS_PATH.read_bytes(),
                "application/json; charset=utf-8",
            )
            return
        if path in ("/styles.css", "/app.js"):
            file_path = STATIC / path.lstrip("/")
            content_type = (
                "text/css; charset=utf-8"
                if path.endswith(".css")
                else "text/javascript; charset=utf-8"
            )
            self._send(200, file_path.read_bytes(), content_type)
            return
        self._send(404, "Not found", "text/plain; charset=utf-8")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/answers":
            self._json_error(404, "not_found")
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > 4096:
            self._json_error(400, "invalid_length")
            return
        try:
            raw = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_error(400, "invalid_json")
            return
        if not isinstance(raw, dict):
            self._json_error(400, "invalid_json")
            return

        session_id = raw.get("session_id")
        question_id = raw.get("question_id")
        selected = raw.get("selected")
        is_match = raw.get("is_match")
        try:
            timestamp = parse_timestamp(raw.get("timestamp"))
        except (ValueError, TypeError):
            self._json_error(400, "invalid_timestamp")
            return

        if not isinstance(session_id, str) or not SESSION_RE.match(session_id):
            self._json_error(400, "invalid_session")
            return
        if question_id not in QUESTION_IDS:
            self._json_error(400, "invalid_question")
            return
        if not isinstance(selected, str) or selected not in CHOICES_BY_QUESTION[question_id]:
            self._json_error(400, "invalid_choice")
            return
        if is_match not in (True, False, None):
            self._json_error(400, "invalid_match")
            return

        record = {
            "session_id": str(uuid.UUID(session_id)),
            "question_id": question_id,
            "selected": selected,
            "is_match": is_match,
            "timestamp": timestamp,
        }
        DATA_DIR.mkdir(exist_ok=True)
        with ANSWERS_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._send(200, json.dumps({"ok": True}), "application/json; charset=utf-8")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("規制内最大化ゲーム", flush=True)
    print("http://%s:%s" % (HOST, PORT), flush=True)
    print("回答ログ: %s" % ANSWERS_PATH, flush=True)
    print("停止: Ctrl+C", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()
