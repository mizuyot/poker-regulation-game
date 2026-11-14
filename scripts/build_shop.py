#!/usr/bin/env python3
"""Embed docs/shop/shop.json and the provisions it cites (from docs/questions.json)
into docs/shop/index.html, and write data/shop_rag.jsonl. Do not edit outputs by hand.

正本:
  - ゲームのパラメータ: docs/shop/shop.json
  - 条文: docs/questions.json の provisions（ここでは複製せず、参照IDで抜き出すだけ）
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOP = ROOT / "docs" / "shop" / "shop.json"
QUESTIONS = ROOT / "docs" / "questions.json"
INDEX = ROOT / "docs" / "shop" / "index.html"
OUTPUT = ROOT / "data" / "shop_rag.jsonl"


def embed(html: str, element_id: str, data: dict) -> str:
    start_tag = f'<script type="application/json" id="{element_id}">'
    start = html.index(start_tag) + len(start_tag)
    end = html.index("</script>", start)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    return html[:start] + "\n" + payload + "\n    " + html[end:]


def cited_ids(shop: dict) -> list[str]:
    ids: list[str] = []
    for group in ("rules", "licenses"):
        for item in shop[group]:
            for pid in item.get("provisionIds", []):
                if pid not in ids:
                    ids.append(pid)
    return ids


def main() -> None:
    shop = json.loads(SHOP.read_text(encoding="utf-8"))
    provisions = json.loads(QUESTIONS.read_text(encoding="utf-8"))["provisions"]
    ids = cited_ids(shop)
    missing = [pid for pid in ids if pid not in provisions]
    if missing:
        raise SystemExit(f"provisions に無いIDを参照している: {missing}")
    cited = {pid: provisions[pid] for pid in ids}

    html = INDEX.read_text(encoding="utf-8")
    html = embed(html, "shop-data", shop)
    html = embed(html, "provisions-data", cited)
    INDEX.write_text(html, encoding="utf-8")
    print("wrote", INDEX)

    sources = sorted({p["url"] for p in cited.values() if p.get("url")})
    OUTPUT.parent.mkdir(exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as handle:
        def write(record: dict) -> None:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

        write({"id": "shop_meta", "kind": "meta", **shop["meta"]})
        for loc in shop["locations"]:
            write({"id": f"shop_loc_{loc['id']}", "kind": "location", **loc,
                   "note_fictional": "ゲーム用の架空パラメータ"})
        for group, kind in (("rules", "rule"), ("licenses", "license")):
            for item in shop[group]:
                write({
                    "id": f"shop_{kind}_{item['id']}",
                    "kind": kind,
                    **item,
                    "provisions": [
                        {"id": pid, "name": cited[pid]["name"], "verified": cited[pid].get("verified", False),
                         "url": cited[pid].get("url")}
                        for pid in item.get("provisionIds", [])
                    ],
                    "source_urls": sources,
                })
        write({"id": "shop_risk", "kind": "risk", **shop["risk"],
               "note_fictional": "摘発確率・処分段階はゲーム上の抽象化。実際の運用ではない。"})
    print("wrote", OUTPUT)


if __name__ == "__main__":
    main()
