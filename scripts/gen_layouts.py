#!/usr/bin/env python3
"""卓数1〜12の店舗レイアウトを docs/shop/shop.json の layouts に書き出す。

- 床の広さは家賃の計算と同じ「卓数×4坪＋共用10坪」に合わせる（1マス＝1m、1坪＝3.30578㎡）
- 区画：左＝入口通路（エレベーター）、奥＝バーカウンターの帯、右＝ラウンジの帯（内装「上質」以上）、残り＝卓の区画
- 卓は行ごとに均等に並べる（行の卓数をそろえ、行の中も等間隔）。空きが片寄らないようにする
- 卓が増えるほど内装を豪華にする（lux 0〜5）。バーはどの卓数にも置く
"""
from __future__ import annotations

import json
import math
from pathlib import Path

SHOP = Path(__file__).resolve().parents[1] / "docs" / "shop" / "shop.json"
TSUBO_M2 = 3.30578
CELL_W, CELL_H = 3.2, 2.4   # 1卓に要る最小の区画（m）：卓と椅子と通路
LEFT, BACK = 1.3, 1.8       # 入口通路の幅、バーの帯の奥行き
ASPECTS = [round(1.1 + 0.05 * i, 2) for i in range(15)]  # 部屋の横:奥行きの候補（1.1〜1.8）


def lux_of(n: int) -> int:
    return 0 if n <= 2 else 1 if n <= 4 else 2 if n <= 6 else 3 if n <= 8 else 4 if n <= 10 else 5


def rows_split(n: int, r: int) -> list[int]:
    base, extra = divmod(n, r)
    # 奥の行から多めに置く（手前の通路を空ける）
    return [base + (1 if i < extra else 0) for i in range(r)]


def place_tables(n: int, x0: float, y0: float, x1: float, y1: float):
    zw, zh = x1 - x0, y1 - y0
    best = None
    for r in range(1, n + 1):
        split = rows_split(n, r)
        k = max(split)
        cw, ch = zw / k, zh / r
        if cw < CELL_W or ch < CELL_H:
            continue
        score = abs(math.log((cw / ch) / (CELL_W / CELL_H)))
        if best is None or score < best[0]:
            best = (score, split, ch)
    if best is None:
        raise SystemExit(f"{n}卓が区画に入らない: {zw:.1f}x{zh:.1f}")
    _, split, ch = best
    tables, rows = [], []
    for i, k in enumerate(split):
        cy = y0 + ch * (i + 0.5)
        cw = zw / k
        row = [(round(x0 + cw * (j + 0.5), 2), round(cy, 2)) for j in range(k)]
        rows.append(row)
        tables += row
    return tables, rows, ch


def fit(n: int, m2: float, lounge: float):
    """面積を保ったまま、卓の区画がいちばん整う部屋の縦横比を選ぶ"""
    best = None
    for aspect in ASPECTS:
        w = round(math.sqrt(m2 * aspect), 1)
        d = round(m2 / w, 1)
        x0, y0, x1, y1 = LEFT, BACK, w - 0.3 - lounge, d - 0.3
        try:
            tables, rows, ch = place_tables(n, x0, y0, x1, y1)
        except SystemExit:
            continue
        cw = (x1 - x0) / max(len(r) for r in rows)
        score = abs(math.log((cw / ch) / (3.6 / 2.9))) + 0.15 * abs(aspect - 1.45)
        if best is None or score < best[0]:
            best = (score, w, d, (x0, y0, x1, y1), tables, rows, ch)
    if best is None:
        raise SystemExit(f"{n}卓が{m2:.1f}㎡に入らない")
    return best[1:]


def layout(n: int) -> dict:
    tsubo = n * 4 + 10
    m2 = tsubo * TSUBO_M2
    lux = lux_of(n)
    lounge = 1.3 if lux >= 3 else 0.0
    w, d, (x0, y0, x1, y1), tables, rows, ch = fit(n, m2, lounge)

    bar_len = min(w - LEFT - 1.0, [2.6, 3.0, 3.6, 4.2, 4.8, 5.6][lux])
    bar = {"x0": round(w - 0.4 - bar_len, 2), "x1": round(w - 0.4, 2)}
    wall_free = (LEFT, bar["x0"] - 0.4)  # 奥の壁でバーより左の空き（掲示物・画面を置く）

    deco: list[dict] = []
    # どの店にも：奥の左角・入口・手前の右角に観葉植物（空きを片寄らせない）
    deco += [{"t": "plant", "x": 0.6, "y": 0.7}, {"t": "plant", "x": 0.6, "y": round(d - 0.6, 2)}, {"t": "plant", "x": round(w - 0.6, 2), "y": round(d - 0.6, 2)}]
    mid_wall = (wall_free[0] + wall_free[1]) / 2
    if lux >= 1:
        deco.append({"t": "poster", "x0": round(mid_wall - 0.9, 2), "x1": round(mid_wall + 0.9, 2)})
    if lux >= 2:
        deco.append({"t": "rug", "x0": round(x0 - 0.1, 2), "y0": round(y0 - 0.1, 2), "x1": round(x1 + 0.1, 2), "y1": round(y1, 2)})
        deco += [{"t": "lamp", "x": x, "y": y} for x, y in tables]
        deco.append({"t": "shelf", "x0": round(bar["x0"] + 0.2, 2), "x1": round(bar["x1"] - 0.2, 2)})
    if lux >= 3:
        # 右の壁ぞいのラウンジ：ソファを等間隔に
        lx = round(w - 0.3 - lounge / 2, 2)
        k = max(1, int((d - BACK - 0.6) // 2.6))
        step = (d - BACK - 0.3) / k
        deco += [{"t": "sofa", "x": lx, "y": round(BACK + step * (i + 0.5), 2), "len": 2.0} for i in range(k)]
        deco.append({"t": "molding"})
    if lux >= 4:
        deco = [x for x in deco if x["t"] != "poster"]
        span = min(5.0, wall_free[1] - wall_free[0])
        deco.append({"t": "screen", "x0": round(mid_wall - span / 2, 2), "x1": round(mid_wall + span / 2, 2)})
        # シャンデリアは卓の行の間に
        for i in range(len(rows) - 1):
            deco.append({"t": "chandelier", "x": round((x0 + x1) / 2, 2), "y": round((rows[i][0][1] + rows[i + 1][0][1]) / 2, 2)})
        # VIP：手前の行の一番右の卓を仕切る
        vx, vy = rows[-1][-1]
        cw = (x1 - x0) / len(rows[-1])
        deco.append({"t": "vip", "x0": round(vx - cw / 2 + 0.1, 2), "y0": round(vy - ch / 2 + 0.1, 2), "x1": round(vx + cw / 2 - 0.1, 2), "y1": round(min(d - 0.1, vy + ch / 2), 2)})
    if lux >= 5:
        deco += [{"t": "statue", "x": round(LEFT + 0.5, 2), "y": 1.0}, {"t": "checker"}]
    return {
        "w": w, "d": d, "lux": lux, "tsubo": tsubo, "m2": round(m2, 1),
        "tables": [[x, y] for x, y in tables],
        "elevator": {"y0": round(d - 2.6, 2), "y1": round(d - 1.2, 2)},
        "bar": bar,
        "deco": deco,
    }


def main() -> None:
    shop = json.loads(SHOP.read_text(encoding="utf-8"))
    L = shop["layout"]
    assert L["tsuboPerTable"] == 4 and L["commonTsubo"] == 10, "面積の式が変わったら、このスクリプトも直す"
    shop["layouts"] = {str(n): layout(n) for n in range(1, 13)}
    shop["layoutLux"] = ["素朴", "ととのった", "落ち着いた", "上質", "豪華", "旗艦店"]
    shop["layout"]["minTables"] = 1
    shop["layout"]["layoutNote"] = "床の広さは家賃の計算と同じ（卓×4坪＋10坪、1マス＝1m）。scripts/gen_layouts.py で生成。"
    SHOP.write_text(json.dumps(shop, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for n in range(1, 13):
        x = shop["layouts"][str(n)]
        rows = sorted({t[1] for t in x["tables"]})
        print(f"{n:2}卓 {x['tsubo']}坪 {x['m2']}㎡  床 {x['w']}x{x['d']}={x['w']*x['d']:.1f}㎡  行{len(rows)}  lux{x['lux']}")


if __name__ == "__main__":
    main()
