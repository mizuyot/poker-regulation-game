#!/usr/bin/env python3
"""卓数1〜12 × 内装3種（ほぼなし／シンプル／豪華）の店舗レイアウトを docs/shop/shop.json の layouts に書き出す。

- 床の広さは家賃の計算と同じ「卓数×4坪＋共用10坪」（1マス＝1m、1坪＝3.30578㎡）。内装を変えても広さは同じ
- 区画：左＝入口通路（エレベーターと受付の机）、奥＝バーカウンターの帯（シンプル・豪華）、右＝ソファの帯（シンプル・豪華）、残り＝卓の区画
- 卓は行ごとに均等に並べる（行の卓数をそろえ、行の中も等間隔）。面積を保ったまま、区画がいちばん整う縦横比を選ぶ
- 内装（v1.8、ユーザー指定）
  - ほぼなし：卓と受付の机だけ
  - シンプル：＋ソファセット（ソファと低いテーブル）とバーカウンター
  - 豪華：シンプルの全部＋大きなLEDモニター、壇上のファイナルテーブル（FT）、ガラスで仕切ったVIPテーブル
- 色をつけるのは卓のラシャだけ（描画側）。観葉植物・ポスターなどの飾りは置かない
"""
from __future__ import annotations

import json
import math
from pathlib import Path

SHOP = Path(__file__).resolve().parents[1] / "docs" / "shop" / "shop.json"
TSUBO_M2 = 3.30578
CELL_W, CELL_H = 3.2, 2.4      # 1卓に要る最小の区画（m）
LEFT = 1.3                     # 入口通路
BACK = {"none": 1.0, "simple": 1.8, "lux": 1.8}     # 奥の帯（バーがある内装は広く）
LOUNGE = {"none": 0.0, "simple": 1.4, "lux": 1.4}   # 右のソファの帯
ASPECTS = [round(1.1 + 0.05 * i, 2) for i in range(15)]
TIERS = ["none", "simple", "lux"]


def rows_split(n: int, r: int) -> list[int]:
    base, extra = divmod(n, r)
    return [base + (1 if i < extra else 0) for i in range(r)]


def place_tables(n, x0, y0, x1, y1):
    zw, zh = x1 - x0, y1 - y0
    best = None
    for r in range(1, n + 1):
        split = rows_split(n, r)
        k = max(split)
        cw, ch = zw / k, zh / r
        if cw < CELL_W or ch < CELL_H:
            continue
        score = abs(math.log((cw / ch) / (3.6 / 2.9)))
        if best is None or score < best[0]:
            best = (score, split, ch)
    if best is None:
        return None
    _, split, ch = best
    rows = []
    for i, k in enumerate(split):
        cy = y0 + ch * (i + 0.5)
        cw = zw / k
        rows.append([(round(x0 + cw * (j + 0.5), 2), round(cy, 2)) for j in range(k)])
    return rows, ch


def fit(n, m2, tier):
    best = None
    for aspect in ASPECTS:
        w = round(math.sqrt(m2 * aspect), 1)
        d = round(m2 / w, 1)
        box = (LEFT, BACK[tier], w - 0.3 - LOUNGE[tier], d - 0.3)
        got = place_tables(n, *box)
        if not got:
            continue
        rows, ch = got
        cw = (box[2] - box[0]) / max(len(r) for r in rows)
        score = abs(math.log((cw / ch) / (3.6 / 2.9))) + 0.15 * abs(aspect - 1.45)
        if best is None or score < best[0]:
            best = (score, w, d, box, rows, ch)
    if best is None:
        raise SystemExit(f"{n}卓・{tier} が {m2:.1f}㎡ に入らない")
    return best[1:]


def layout(n: int, tier: str) -> dict:
    tsubo = n * 4 + 10
    m2 = tsubo * TSUBO_M2
    w, d, (x0, y0, x1, y1), rows, ch = fit(n, m2, tier)
    tables = [t for r in rows for t in r]
    deco: list[dict] = []
    # 受付の机（全内装）：入口の通路の奥寄り
    deco.append({"t": "desk", "x": 0.75, "y": round(max(1.0, d - 3.4), 2)})
    bar = None
    if tier in ("simple", "lux"):
        bar_len = round(min(w - LEFT - 1.0, 2.6 + 0.25 * n), 2)
        bar = {"x0": round(w - 0.4 - bar_len, 2), "x1": round(w - 0.4, 2)}
        # ソファセット：右の帯に、ソファ＋低いテーブルを等間隔に
        lx = round(w - 0.3 - LOUNGE[tier] / 2, 2)
        k = max(1, int((d - BACK[tier] - 0.4) // 2.8))
        step = (d - BACK[tier] - 0.3) / k
        for i in range(k):
            y = round(BACK[tier] + step * (i + 0.5), 2)
            deco.append({"t": "sofa", "x": round(lx + 0.25, 2), "y": y, "len": 1.8})
            deco.append({"t": "lowtable", "x": round(lx - 0.35, 2), "y": y})
    special = {}
    if tier == "lux":
        # 大きなLEDモニター：奥の壁、バーより左
        x_end = (bar["x0"] - 0.5) if bar else (w - 0.5)
        span = round(min(6.0, x_end - LEFT - 0.3), 2)
        if span > 1.5:
            mid = (LEFT + x_end) / 2
            deco.append({"t": "screen", "x0": round(mid - span / 2, 2), "x1": round(mid + span / 2, 2)})
        # 壇上のファイナルテーブル：いちばん奥の行の真ん中の卓
        ft = min(rows[0], key=lambda t: abs(t[0] - (x0 + x1) / 2))
        deco.append({"t": "stage", "x0": round(ft[0] - 1.8, 2), "y0": round(ft[1] - 1.25, 2), "x1": round(ft[0] + 1.8, 2), "y1": round(ft[1] + 1.15, 2)})
        special["ft"] = list(ft)
        # ガラスで仕切ったVIPテーブル：手前の行の右端（FTと別の卓があるとき）
        vt = rows[-1][-1]
        if vt != ft:
            cw = (x1 - x0) / len(rows[-1])
            deco.append({"t": "vip", "x0": round(vt[0] - cw / 2 + 0.1, 2), "y0": round(vt[1] - ch / 2 + 0.1, 2), "x1": round(vt[0] + cw / 2 - 0.1, 2), "y1": round(min(d - 0.1, vt[1] + ch / 2), 2)})
            special["vip"] = list(vt)
    return {
        "w": w, "d": d, "tsubo": tsubo, "m2": round(m2, 1), "interior": tier,
        "tables": [[x, y] for x, y in tables],
        "elevator": {"y0": round(d - 2.6, 2), "y1": round(d - 1.2, 2)},
        "bar": bar,
        "deco": deco,
        **special,
    }


def main() -> None:
    shop = json.loads(SHOP.read_text(encoding="utf-8"))
    L = shop["layout"]
    assert L["tsuboPerTable"] == 4 and L["commonTsubo"] == 10, "面積の式が変わったら、このスクリプトも直す"
    shop["layouts"] = {tier: {str(n): layout(n, tier) for n in range(1, 13)} for tier in TIERS}
    shop.pop("layoutLux", None)
    shop["layout"]["minTables"] = 1
    shop["layout"]["layoutNote"] = "床の広さは家賃の計算と同じ（卓×4坪＋10坪、1マス＝1m）。卓数×内装ごとに scripts/gen_layouts.py で生成。"
    SHOP.write_text(json.dumps(shop, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for tier in TIERS:
        print(tier, " ".join(f"{n}:{shop['layouts'][tier][str(n)]['w']}x{shop['layouts'][tier][str(n)]['d']}" for n in range(1, 13)))


if __name__ == "__main__":
    main()
