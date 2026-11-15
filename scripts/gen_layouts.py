#!/usr/bin/env python3
"""卓数1〜12の店舗レイアウトを docs/shop/shop.json の layouts に書き出す。

卓数ごとに配置を変え、卓が増えるほど内装を豪華にする（lux 0〜5）。
バーカウンターはどの卓数にも置く。座標は店の床の単位（1＝タイル1枚）。数値は描画用で、面積・家賃の計算には使わない。
"""
from __future__ import annotations

import json
from pathlib import Path

SHOP = Path(__file__).resolve().parents[1] / "docs" / "shop" / "shop.json"

# 卓の中心（x, y）。奥の壁が y=0、左の壁（エレベーター）が x=0。
TABLES = {
    1: (7.6, 6.0, [(3.4, 3.3)]),
    2: (9.6, 6.2, [(2.8, 3.0), (6.6, 3.8)]),
    3: (11.4, 6.2, [(2.4, 2.6), (6.0, 3.4), (9.6, 2.6)]),
    4: (9.4, 8.6, [(2.4, 2.4), (6.6, 2.4), (2.4, 5.6), (6.6, 5.6)]),
    5: (11.8, 8.6, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (4.0, 5.8), (7.6, 5.8)]),
    6: (13.0, 8.8, [(2.2, 2.4), (5.8, 3.0), (9.4, 2.4), (2.2, 6.0), (5.8, 6.6), (9.4, 6.0)]),
    7: (15.4, 8.8, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (13.0, 2.4), (4.0, 5.8), (7.6, 5.8), (11.2, 5.8)]),
    8: (15.4, 11.4, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (13.0, 2.4), (2.2, 5.8), (13.0, 5.8), (5.8, 9.0), (9.4, 9.0)]),
    9: (12.2, 11.6, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (2.2, 5.6), (5.8, 5.6), (9.4, 5.6), (2.2, 8.8), (5.8, 8.8), (9.4, 8.8)]),
    10: (16.6, 11.6, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (13.0, 2.4), (4.0, 5.6), (7.6, 5.6), (11.2, 5.6), (2.2, 8.8), (5.8, 8.8), (14.4, 8.6)]),
    11: (17.0, 11.8, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (13.0, 2.4), (2.2, 5.6), (5.8, 5.6), (9.4, 5.6), (13.0, 5.6), (2.2, 8.8), (5.8, 8.8), (14.6, 9.0)]),
    12: (19.6, 12.0, [(2.2, 2.4), (5.8, 2.4), (9.4, 2.4), (13.0, 2.4), (2.2, 5.6), (5.8, 5.6), (9.4, 5.6), (13.0, 5.6), (2.2, 8.8), (5.8, 8.8), (9.4, 8.8), (16.8, 8.4)]),
}


def lux_of(n: int) -> int:
    return 0 if n <= 2 else 1 if n <= 4 else 2 if n <= 6 else 3 if n <= 8 else 4 if n <= 10 else 5


def layout(n: int) -> dict:
    w, d, tables = TABLES[n]
    lux = lux_of(n)
    bar_len = [2.6, 3.0, 3.4, 4.2, 4.8, 5.6][lux]
    bar = {"x0": round(w - 0.4 - bar_len, 2), "x1": round(w - 0.4, 2)}
    deco: list[dict] = []
    # 0: 小さなバーとスツール、観葉植物
    deco.append({"t": "plant", "x": 0.7, "y": 0.7})
    if lux >= 1:
        deco += [{"t": "poster", "x0": 1.6, "x1": 3.2}, {"t": "plant", "x": w - 0.7, "y": d - 0.8}]
    if lux >= 2:
        deco += [{"t": "rug", "x0": 0.9, "y0": 1.2, "x1": max(t[0] for t in tables) + 1.9, "y1": max(t[1] for t in tables) + 1.5}]
        deco += [{"t": "lamp", "x": t[0], "y": t[1]} for t in tables]
        deco.append({"t": "shelf", "x0": bar["x0"] + 0.2, "x1": bar["x1"] - 0.2})
    if lux >= 3:
        deco += [{"t": "sofa", "x": w - 1.0, "y": d - 3.2, "len": 2.2}, {"t": "molding"}]
        if n == 8:
            deco += [{"t": "sofa", "x": 7.6, "y": 5.8, "len": 2.4}, {"t": "plant", "x": 7.6, "y": 4.6}]
    if lux >= 4:
        deco = [x for x in deco if x["t"] != "poster"]
        deco += [{"t": "screen", "x0": 1.4, "x1": min(bar["x0"] - 0.6, 6.4)}, {"t": "chandelier", "x": w / 2, "y": d / 2}]
        vt = tables[-1]
        deco.append({"t": "vip", "x0": round(vt[0] - 2.2, 2), "y0": round(vt[1] - 1.9, 2), "x1": round(min(w - 0.1, vt[0] + 2.2), 2), "y1": round(min(d - 0.1, vt[1] + 1.8), 2)})
    if lux >= 5:
        deco += [{"t": "chandelier", "x": w / 4, "y": d / 2.6}, {"t": "statue", "x": w - 0.8, "y": 1.6}, {"t": "plant", "x": 0.7, "y": d - 3.0}, {"t": "checker"}]
    return {
        "w": w, "d": d, "lux": lux,
        "tables": [[x, y] for x, y in tables],
        "elevator": {"y0": round(d - 2.4, 2), "y1": round(d - 1.0, 2)},
        "bar": bar,
        "deco": deco,
    }


def main() -> None:
    shop = json.loads(SHOP.read_text(encoding="utf-8"))
    shop["layouts"] = {str(n): layout(n) for n in range(1, 13)}
    shop["layoutLux"] = ["素朴", "ととのった", "落ち着いた", "上質", "豪華", "旗艦店"]
    shop["layout"]["minTables"] = 1
    SHOP.write_text(json.dumps(shop, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote layouts 1-12")


if __name__ == "__main__":
    main()
