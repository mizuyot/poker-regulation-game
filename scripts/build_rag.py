#!/usr/bin/env python3
"""Generate RAG JSONL from docs/questions.json. Do not edit the output by hand."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "questions.json"
INDEX = ROOT / "docs" / "index.html"
OUTPUT = ROOT / "data" / "questions_rag.jsonl"
EMBED_START = '<script type="application/json" id="questions-data">'
EMBED_END = "</script>"


def sync_index_embed(data: dict) -> None:
    html = INDEX.read_text(encoding="utf-8")
    start = html.index(EMBED_START) + len(EMBED_START)
    end = html.index(EMBED_END, start)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    INDEX.write_text(html[:start] + "\n" + payload + "\n    " + html[end:], encoding="utf-8")
    print("wrote", INDEX, "questions embed")


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    sync_index_embed(data)
    default_sources = data.get("meta", {}).get("sources", [])
    OUTPUT.parent.mkdir(exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as handle:
        for question in data["questions"]:
            record = {
                "id": question["id"],
                "section": question["section"],
                "prompt": question["prompt"],
                "choices": question["choices"],
                "designerChoice": question.get("designerChoice"),
                "explanation": question.get("explanation", ""),
                "source_urls": question.get("source_urls", default_sources),
            }
            if "axis" in question:
                record["axis"] = question["axis"]
            if "axisLabel" in question:
                record["axisLabel"] = question["axisLabel"]
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    print("wrote", OUTPUT)


if __name__ == "__main__":
    main()
