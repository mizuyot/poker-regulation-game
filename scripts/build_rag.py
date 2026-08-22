#!/usr/bin/env python3
"""Generate RAG JSONL from docs/questions.json. Do not edit the output by hand."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "questions.json"
OUTPUT = ROOT / "data" / "questions_rag.jsonl"


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    default_sources = data.get("meta", {}).get("sources", [])
    OUTPUT.parent.mkdir(exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as handle:
        for question in data["questions"]:
            record = {
                "id": question["id"],
                "gate": question["section"],
                "prompt": question["prompt"],
                "choices": question["choices"],
                "designerChoice": question["designerChoice"],
                "explanation": question["explanation"],
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
