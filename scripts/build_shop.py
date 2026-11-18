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
    groups = [shop["illegal"], shop["styles"]["list"], [shop["license"]], [{"provisionIds": shop["operations"].get("legalCloseProvisionIds", [])}], [shop.get("tax", {})]]
    for group in groups:
        for item in group:
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

    def prov_refs(pids):
        return [{"id": pid, "name": cited[pid]["name"], "verified": cited[pid].get("verified", False),
                 "url": cited[pid].get("url")} for pid in pids]

    fictional = "ゲーム用の架空パラメータ。実在の市場・物件・運用の統計ではない。"
    OUTPUT.parent.mkdir(exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as handle:
        def write(record: dict) -> None:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

        write({"id": "shop_meta", "kind": "meta", **shop["meta"]})
        for loc in shop["locations"]:
            write({"id": f"shop_loc_{loc['id']}", "kind": "location", **loc, "note_fictional": fictional})
        write({"id": "shop_layout", "kind": "layout", **shop["layout"], "note_fictional": fictional})
        ops = dict(shop["operations"])
        write({"id": "shop_operations", "kind": "operations", **ops,
               "provisions": prov_refs(ops.get("legalCloseProvisionIds", [])), "note_fictional": fictional})
        write({"id": "shop_license", "kind": "license", **shop["license"], "provisions": prov_refs(shop["license"]["provisionIds"])})
        for item in shop["illegal"]:
            write({"id": f"shop_illegal_{item['id']}", "kind": "illegal_action", **item,
                   "provisions": prov_refs(item.get("provisionIds", [])), "note_fictional": shop["risk"]["note"]})
        write({"id": "shop_risk", "kind": "risk", **shop["risk"]})
        write({"id": "shop_valuation", "kind": "valuation", **shop["valuation"], "note_fictional": fictional})
        write({"id": "shop_finance", "kind": "finance", **shop["finance"], "note_fictional": fictional})
        write({"id": "shop_annual_news", "kind": "annual_news", **shop["annualNews"], "note_fictional": fictional})
        for st in shop["styles"]["list"]:
            write({"id": f"shop_style_{st['id']}", "kind": "business_style", **st,
                   "provisions": prov_refs(st.get("provisionIds", [])), "note_fictional": shop["styles"]["note"]})
        write({"id": "shop_staff", "kind": "staff_policy", **shop["staff"], "note_fictional": fictional})
        for fac in shop.get("facilities", []):
            write({"id": f"shop_facility_{fac['id']}", "kind": "facility", **fac, "note_fictional": fictional})
        for t in shop.get("shopTypes", {}).get("list", []):
            write({"id": f"shop_type_{t['id']}", "kind": "shop_type", **t, "note_fictional": "架空の店のタイプ。実在の店舗を指さない。"})
        if "comps" in shop:
            write({"id": "shop_comps", "kind": "comparable_deals", **shop["comps"], "note_fictional": "架空の取引事例。実在の取引ではない。"})
        if "liquidation" in shop:
            write({"id": "shop_liquidation", "kind": "liquidation", **shop["liquidation"], "note_fictional": fictional})
        if "tax" in shop:
            write({"id": "shop_tax", "kind": "tax", **shop["tax"], "provisions": prov_refs(shop["tax"]["provisionIds"])})
        if "market" in shop:
            write({"id": "shop_market", "kind": "market", **shop["market"]})
        write({"id": "shop_staff_system", "kind": "staff_system", **shop.get("staffSystem", {}), "note_fictional": fictional})
        for ev in shop["events"]:
            write({"id": f"shop_event_{ev['id']}", "kind": "event", **ev, "note_fictional": "実在の事件の構造だけを取り出した架空の事件。"})
    print("wrote", OUTPUT)


if __name__ == "__main__":
    main()
