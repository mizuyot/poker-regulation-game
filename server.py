#!/usr/bin/env python3
"""Serve the game and append anonymous answer logs as JSONL.

Stored fields only: session_id, question_id, selected, is_match, timestamp.
Shop game scores (/api/shop/score): kind, amount, loc, tables, tier, style, type,
seed, version, timestamp, optional styleHistory, and a private runId for retry
deduplication. Legacy requests without runId can include a display name.
Does not persist IP, User-Agent, Referer, or any other request metadata.
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
DATA_DIR = ROOT / "data"
ANSWERS_PATH = DATA_DIR / "answers.jsonl"
QUESTIONS_PATH = DOCS / "questions.json"
SHOP_PATH = DOCS / "shop" / "shop.json"
HOST = "127.0.0.1"
PORT = 8765

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
QUESTION_IDS = set()
QUESTION_ORDER = []
CHOICES_BY_QUESTION = {}
ANSWERS_LOCK = threading.Lock()
SCORES_PATH = DATA_DIR / "shop_scores.jsonl"
SCORES_LOCK = threading.Lock()
SEED_RE = re.compile(r"^[0-9A-Z]{4,6}$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f<>]")
FINAL_SCORE_KINDS = ("complete", "arrest")
SCORE_BODY_LIMIT = 4096
SHOP_DATA = json.loads(SHOP_PATH.read_text(encoding="utf-8"))
SCORE_MAX_MONTHS = SHOP_DATA["meta"]["months"]
SCORE_STYLE_TIERS = {
    style["id"]: style["tier"]
    for style in SHOP_DATA["styles"]["list"]
}


def clean_text(value, limit):
    if not isinstance(value, str):
        return ""
    return CONTROL_RE.sub("", value).strip()[:limit]


def validate_style_history(value):
    if not isinstance(value, list) or not 0 < len(value) <= SCORE_MAX_MONTHS:
        raise ValueError("invalid_style_history")
    history = []
    total_months = 0
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("invalid_style_history")
        style, months = item.get("style"), item.get("months")
        if (
            not isinstance(style, str)
            or style not in SCORE_STYLE_TIERS
            or type(months) is not int
            or months <= 0
        ):
            raise ValueError("invalid_style_history")
        total_months += months
        if total_months > SCORE_MAX_MONTHS:
            raise ValueError("invalid_style_history")
        history.append({"style": style, "months": months})
    return history


def validate_score(raw):
    kind = raw.get("kind")
    if kind not in ("complete", "bankrupt", "arrest"):
        raise ValueError("invalid_kind")
    seed = raw.get("seed")
    if not isinstance(seed, str) or not SEED_RE.match(seed):
        raise ValueError("invalid_seed")
    tier = raw.get("tier")
    if tier not in ("black", "gray", "clean"):
        raise ValueError("invalid_tier")
    style = raw.get("style")
    if "style" in raw:
        if not isinstance(style, str):
            raise ValueError("invalid_style")
        legacy_prize = style == "prize" and tier == "gray"
        if SCORE_STYLE_TIERS.get(style) != tier and not legacy_prize:
            raise ValueError("invalid_style")
    nums = {}
    for key, lo, hi in (("amount", -1_000_000, 10_000_000), ("tables", 1, 200)):
        value = raw.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not lo <= value <= hi:
            raise ValueError("invalid_" + key)
        nums[key] = int(round(value))
    run_id = raw.get("runId")
    if "runId" in raw and (not isinstance(run_id, str) or not UUID_RE.fullmatch(run_id)):
        raise ValueError("invalid_run_id")
    record = {
        "name": "" if run_id else clean_text(raw.get("name"), 12),
        "kind": kind,
        **nums,
        "loc": clean_text(raw.get("loc"), 20),
        "tier": tier,
        "type": clean_text(raw.get("type"), 20),
        "seed": seed,
        "version": clean_text(raw.get("version"), 12),
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if run_id:
        record["runId"] = run_id.lower()
    if style is not None:
        record["style"] = style
    if "styleHistory" in raw:
        record["styleHistory"] = validate_style_history(raw["styleHistory"])
    return record


def read_score_log():
    """Read the score log while the caller holds SCORES_LOCK."""
    lines = SCORES_PATH.read_text(encoding="utf-8").splitlines() if SCORES_PATH.exists() else []
    out = []
    for line in lines:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            out.append(record)
    return out


def final_rank_at_registration(record, earlier):
    if record["kind"] not in FINAL_SCORE_KINDS:
        return None
    done = [score for score in earlier if score.get("kind") in FINAL_SCORE_KINDS]
    # 同額では先に登録した記録が上位なので、今回より前の同額も数える。
    position = 1 + sum(score.get("amount", 0) >= record["amount"] for score in done)
    return {"position": position, "total": len(done) + 1}


def register_score(record):
    with SCORES_LOCK:
        earlier = read_score_log()
        run_id = record.get("runId")
        if run_id:
            for index, existing in enumerate(earlier):
                if existing.get("runId") == run_id:
                    return final_rank_at_registration(existing, earlier[:index])
        receipt = final_rank_at_registration(record, earlier)
        SCORES_PATH.parent.mkdir(exist_ok=True)
        with SCORES_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return receipt


def ranking(seed, limit=10):
    with SCORES_LOCK:
        scores = read_score_log()
    for score in scores:
        for key in ("evaluation", "peak", "runId"):
            score.pop(key, None)  # 過去の採点や月間利益と、再送識別子は公開しない。
    done = [x for x in scores if x.get("kind") in FINAL_SCORE_KINDS]  # 摘発は罰金・追徴後の手元資金
    final = sorted(done, key=lambda x: -x.get("amount", 0))[:limit]
    same = sorted([x for x in done if x.get("seed") == seed], key=lambda x: -x.get("amount", 0))[:limit]
    return {"ok": True, "count": len(scores), "final": final, "seed": same}


def load_questions():
    payload = json.loads(QUESTIONS_PATH.read_text(encoding="utf-8"))
    QUESTION_IDS.clear()
    QUESTION_ORDER.clear()
    CHOICES_BY_QUESTION.clear()
    for item in payload["questions"]:
        qid = item["id"]
        QUESTION_IDS.add(qid)
        QUESTION_ORDER.append(qid)
        CHOICES_BY_QUESTION[qid] = {choice["id"] for choice in item["choices"]}
    return payload


load_questions()


def compute_stats():
    counts = {
        qid: {cid: 0 for cid in CHOICES_BY_QUESTION[qid]} for qid in QUESTION_ORDER
    }
    totals = {qid: 0 for qid in QUESTION_ORDER}
    sessions = set()
    with ANSWERS_LOCK:
        if ANSWERS_PATH.exists():
            lines = ANSWERS_PATH.read_text(encoding="utf-8").splitlines()
        else:
            lines = []
    for line in lines:
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        qid = rec.get("question_id")
        selected = rec.get("selected")
        if qid in counts and selected in counts[qid]:
            counts[qid][selected] += 1
            totals[qid] += 1
        session_id = rec.get("session_id")
        if isinstance(session_id, str) and session_id:
            sessions.add(session_id)
    questions = {}
    for qid in QUESTION_ORDER:
        total = totals[qid]
        questions[qid] = {
            "total": total,
            "counts": counts[qid],
            "rates": {
                cid: (counts[qid][cid] / total if total else 0)
                for cid in CHOICES_BY_QUESTION[qid]
            },
        }
    return {"ok": True, "sessions": len(sessions), "questions": questions}


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
            html = (DOCS / "index.html").read_bytes()
            self._send(200, html, "text/html; charset=utf-8")
            return
        if path == "/api/stats":
            self._send(
                200,
                json.dumps(compute_stats(), ensure_ascii=False),
                "application/json; charset=utf-8",
            )
            return
        if path == "/api/shop/ranking":
            seed = (parse_qs(parsed.query).get("seed") or [""])[0].upper()
            self._send(200, json.dumps(ranking(seed), ensure_ascii=False), "application/json; charset=utf-8")
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
        if path in ("/shop", "/shop/", "/shop/index.html"):
            if path == "/shop":
                self._send(301, "", "text/plain; charset=utf-8", {"Location": "/shop/"})
                return
            self._send(200, (DOCS / "shop" / "index.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path in ("/styles.css", "/app.js"):
            file_path = DOCS / path.lstrip("/")
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
        if parsed.path == "/api/shop/score":
            self._post_score()
            return
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

        if not isinstance(session_id, str) or not UUID_RE.match(session_id):
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
        with ANSWERS_LOCK:
            with ANSWERS_PATH.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._send(200, json.dumps({"ok": True}), "application/json; charset=utf-8")

    def _post_score(self):
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if not 0 < length <= SCORE_BODY_LIMIT:
            self._json_error(400, "invalid_length")
            return
        try:
            raw = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("invalid_json")
            record = validate_score(raw)
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError):
            self._json_error(400, "invalid_json")
            return
        except ValueError as exc:
            self._json_error(400, str(exc))
            return
        receipt = register_score(record)
        self._send(200, json.dumps({"ok": True, "finalRank": receipt}), "application/json; charset=utf-8")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("合法ポーカー大会設計ゲーム", flush=True)
    print("http://%s:%s" % (HOST, PORT), flush=True)
    print("ポーカー店経営: http://%s:%s/shop/" % (HOST, PORT), flush=True)
    print("回答ログ: %s" % ANSWERS_PATH, flush=True)
    print("店のスコア: %s" % SCORES_PATH, flush=True)
    print("停止: Ctrl+C", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        server.server_close()


if __name__ == "__main__":
    main()
