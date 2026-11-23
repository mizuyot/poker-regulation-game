#!/usr/bin/env python3
"""卓数1〜12 × 内装3種（ほぼスケルトン／シンプル＆モダン／豪華）の店舗レイアウトを docs/shop/shop.json の layouts に書き出す。

- 床面積は家賃の計算と同じ「卓数×4坪＋共用10坪」（1坪＝3.30578㎡）
- 広さに合わせて外形を決め、左に入口通路と受付、奥にバー、右にラウンジの余白を取る
- 卓は均等な間隔で並べ、卓数が少ない行も中心を揃える。面積を保ち、部屋の縦横比と卓まわりの余裕で配置を選ぶ
- 内装
  - ほぼスケルトン：豪華と同じ部屋と卓配置に、簡素な受付とドリンク台、タイマー、パレットベンチとドラム缶の小卓
  - シンプル＆モダン：豪華と同じ部屋と卓配置に、L字受付、背面棚とドリンク提供カウンター、直線のソファ、鉢植え
  - 豪華：段差のないフロアにドリンク提供カウンター、L字ソファ、鉢植え、カーテンと壁付け照明。7卓以上はファイナルテーブル（FT）を表示
- 卓のラシャに営業スタイルを示す色をつける（描画側）
"""
from __future__ import annotations

import json
import math
from pathlib import Path

SHOP = Path(__file__).resolve().parents[1] / "docs" / "shop" / "shop.json"
TSUBO_M2 = 3.30578
CELL_W, CELL_H = 3.3, 2.45     # 1卓に要る最小の区画（m）
LEFT = 1.35                    # 入口通路
BACK = 1.75                    # 奥のバー区画
RIGHT = 1.7                    # 右のラウンジ区画
FRONT = 0.43                   # 手前の壁と座席の余白
ASPECTS = [i / 100 for i in range(118, 175, 2)]
TWO_TABLE_ASPECT = 2.22        # 2卓を横に並べ、椅子の間に通路を取る
TIERS = ["none", "simple", "lux"]
TABLE_ANGLES = {1: (-45,), 2: (-45, -45), 3: (15, 15, -15), 4: (15, -15, 15, -15)}
LUX_SIX_TABLES = [(3.20, 2.83), (6.60, 2.86), (10.05, 3.23), (3.38, 6.22), (6.73, 6.25), (9.98, 6.36)]
LUX_NINE_TABLES = [(x, y) for y in (3.17, 6.35, 9.53) for x in (3.20, 6.62, 10.04)]
LUX_TEN_TABLES = [*LUX_NINE_TABLES, (13.08, 6.35)]
LUX_ELEVEN_TABLES = [*LUX_TEN_TABLES, (13.08, 3.17)]


def rows_split(n: int, r: int) -> list[int]:
    base, extra = divmod(n, r)
    return [base + (1 if i < extra else 0) for i in range(r)]


def fit(n: int, m2: float):
    best = None
    aspects = (TWO_TABLE_ASPECT,) if n == 2 else ASPECTS
    for aspect in aspects:
        w = round(math.sqrt(m2 * aspect), 2)
        d = round(m2 / w, 2)
        zone_w, zone_h = w - LEFT - RIGHT, d - BACK - FRONT
        for row_count in range(1, n + 1):
            col_count = math.ceil(n / row_count)
            cw, ch = zone_w / col_count, zone_h / row_count
            if cw < CELL_W or ch < CELL_H:
                continue
            # 縦横に均整の取れた部屋を基本としつつ、空きの少ない卓列を優先する。
            score = (
                1.15 * abs(math.log(aspect / 1.45))
                + 0.4 * abs(math.log((cw / ch) / 1.2))
                + 0.23 * (row_count * col_count - n) / n
            )
            if best is None or score < best[0]:
                best = (score, w, d, row_count, cw, ch)
    if best is None:
        raise SystemExit(f"{n}卓が {m2:.1f}㎡ に入らない")

    _, w, d, row_count, cw, ch = best
    center = (LEFT + w - RIGHT) / 2
    rows = []
    for i, count in enumerate(rows_split(n, row_count)):
        cy = round(BACK + ch * (i + 0.5), 2)
        rows.append([(round(center + cw * (j - (count - 1) / 2), 2), cy) for j in range(count)])
    if n == 2:
        # 斜めの卓を同じ列のまま少し奥へ寄せ、入口から椅子までの通路を空ける。
        rows = [[(x, round(y - 0.23, 2)) for x, y in rows[0]]]
    elif n == 3:
        # 奥の2卓を開いて中央の通路を広げ、提供カウンターの前にも余白を取る。
        rear_y = round(rows[0][0][1] + 0.12, 2)
        front_y = round(rows[1][0][1] + 0.15, 2)
        rows = [[(round(center - 1.98, 2), rear_y), (round(center + 1.98, 2), rear_y)],
                [(round(center, 2), front_y)]]
    return w, d, rows, cw, ch


def serving_stools(x0: float, x1: float, tables: list[tuple[float, float]], angles: tuple[int, ...] | None) -> list[float]:
    # 卓と椅子をまとめた外形から、スツールの半径0.26mと余白0.12mを確保する。
    bounds = []
    for (tx, ty), degrees in zip(tables, angles if angles else (0,) * len(tables)):
        angle = math.radians(degrees)
        bounds.append((tx, ty, math.cos(angle), math.sin(angle)))

    def clear(x: float) -> bool:
        for tx, ty, cos, sin in bounds:
            dx, dy = x - tx, 1.63 - ty
            # スツールの位置を卓の軸に戻し、斜めの卓でも同じ外形を使う。
            side = abs(dx * cos + dy * sin)
            front = abs(dy * cos - dx * sin)
            if math.hypot(max(side - 1.69, 0), max(front - 1.15, 0)) < 0.38:
                return False
        return True

    stools = []
    x = round(x0 + 0.45, 2)
    while x < x1 - 0.25:
        if clear(x):
            stools.append(x)
        x = round(x + 0.77, 2)
    return stools


def shared_shell(approved: dict) -> dict:
    return {key: approved[key] for key in ("w", "d", "tsubo", "m2", "tables", "elevator", "ft") if key in approved}


def skeleton_layout(n: int) -> dict:
    approved = layout(n, "lux")
    w, d = approved["w"], approved["d"]
    if n == 1:
        desk = {"t": "desk", "x0": 0.10, "y0": round(d - 1.05, 2), "x1": 1.50, "y1": round(d - 0.52, 2)}
    else:
        desk = {"t": "desk", "x0": 0.62, "y0": 0.80, "x1": 1.12, "y1": 2.20}

    # 奥の端に置いたドリンク台と、右手前の簡素な待合だけを置く。
    drink_x0, drink_x1 = round(w - 1.78, 2), round(w - 0.43, 2)
    bar = {"x0": drink_x0, "x1": drink_x1,
           "serving": {"x0": drink_x0, "y0": 0.18, "x1": drink_x1, "y1": 0.62, "stools": []}}
    clock_center = w / 2
    deco = [
        desk,
        {"t": "clock", "x0": round(clock_center - 0.72, 2), "x1": round(clock_center + 0.72, 2)},
        {"t": "pallet", "x": round(w - 0.43, 2), "y": round(d - 1.28, 2), "len": 1.55},
        {"t": "drum", "x": round(w - 0.46, 2), "y": round(d - 2.44, 2)},
    ]
    return {**shared_shell(approved), "interior": "none", "bar": bar, "deco": deco}


def modern_layout(n: int) -> dict:
    approved = layout(n, "lux")
    w, d = approved["w"], approved["d"]
    desk = next(obj for obj in approved["deco"] if obj["t"] == "desk")
    plant = next(obj for obj in approved["deco"] if obj["t"] == "plant")
    bar = approved["bar"]
    serving = bar["serving"]
    positions = [(table[0], table[1]) for table in approved["tables"]]
    angles = tuple(table[2] if len(table) > 2 else 0 for table in approved["tables"])
    stools = serving_stools(serving["x0"], serving["x1"], positions, angles)
    clock_right = min(w / 2 + 0.72, bar["x0"] - 0.45)
    deco = [
        desk,
        {"t": "sofa", "x": round(w - 0.45, 2), "y": round(d - 1.14, 2), "len": 1.8},
        {"t": "lowtable", "x": round(w - 1.18, 2), "y": round(d - 1.25, 2)},
        plant,
        {"t": "clock", "x0": round(clock_right - 1.44, 2), "x1": round(clock_right, 2)},
    ]
    return {**shared_shell(approved), "interior": "simple", "bar": {**bar, "serving": {**serving, "stools": stools}}, "deco": deco}


def layout(n: int, tier: str) -> dict:
    if tier == "none":
        return skeleton_layout(n)
    if tier == "simple":
        return modern_layout(n)

    tsubo = n * 4 + 10
    m2 = tsubo * TSUBO_M2
    w, d, rows, cw, ch = fit(n, m2)
    tables = [t for r in rows for t in r]
    angles = TABLE_ANGLES.get(n)
    small_lux = tier == "lux" and n <= 12
    finished_lux = small_lux and n >= 2
    flat_final_table = finished_lux and n >= 7
    if n == 3 and finished_lux:
        # 2卓版と向きをそろえ、奥の卓を受付から離して、手前の2卓の間に見える位置に置く。
        tables = [(3.75, 2.14), (7.65, 3.25), (4.30, 5.22)]
        angles = (-45, -45, -45)
    elif n == 4 and finished_lux:
        # 45度にそろえた椅子同士に余白ができるよう、手前の列を少し右にずらす。
        tables = [(3.10, 2.80), (7.05, 3.13), (3.60, 5.88), (7.85, 5.98)]
        angles = (-45, -45, -45, -45)
    elif n == 5 and finished_lux:
        # 奥に3卓、手前に2卓。バーに面する奥の右卓は、カウンターから離す。
        tables = [(3.20, 2.64), (6.43, 2.76), (10.20, 3.19), (3.72, 5.85), (7.46, 5.87)]
        angles = (-45, -45, -45, -45, -45)
    elif n == 6 and finished_lux:
        # 3卓ずつの2列に並べ、右手前にラウンジとの間隔を取る。
        tables = LUX_SIX_TABLES
        angles = (-45,) * 6
    elif n == 7 and finished_lux:
        # 右隣に4列目を設け、FTを3列目の2卓の中間に合わせる。
        w = 14.90
        d = round(m2 / w, 2)
        tables = [*LUX_SIX_TABLES, (13.18, 4.80)]
        angles = (-45,) * 7
    elif n == 8 and finished_lux:
        # 4列目も2卓にして、手前側をFTにする。
        w = 15.85
        d = round(m2 / w, 2)
        tables = [*LUX_SIX_TABLES, (13.18, 3.28), (13.25, 6.58)]
        angles = (-45,) * 8
    elif n == 9 and finished_lux:
        # 奥行きを取り、9卓を縦横3卓ずつの等間隔で並べる。
        w = 13.41
        d = round(m2 / w, 2)
        tables = LUX_NINE_TABLES
        angles = (-45,) * 9
    elif n == 10 and finished_lux:
        # 9卓版の3×3を保ち、中段の右隣にFTを置く。
        w = 14.81
        d = round(m2 / w, 2)
        tables = LUX_TEN_TABLES
        angles = (-45,) * 10
    elif n == 11 and finished_lux:
        # 10卓版と同じ並びに、FTの奥の1卓を加える。
        w = 15.77
        d = round(m2 / w, 2)
        tables = LUX_ELEVEN_TABLES
        angles = (-45,) * 11
    elif n == 12 and finished_lux:
        # 右端の手前を埋めて、4列に3卓ずつ並べる。
        tables = [*LUX_ELEVEN_TABLES, (13.08, 9.53)]
        angles = (-45,) * 12
    elevator = {"y0": round(d - 2.6, 2), "y1": round(d - 1.2, 2)}
    # 入口脇の受付カウンター。卓側の端を折り返し、床の手前に足元を残す。
    desk = {"t": "desk", "x0": 0.10, "y0": round(d - 1.05, 2), "x1": 1.90, "y1": round(d - 0.50, 2),
            "returnX": 1.45, "returnY": round(d - 0.28, 2)}
    if n == 2 or finished_lux:
        # カーテンの下に受付を置き、入口側の端を壁へ折り返す。
        desk_end = 2.21 if n == 2 else 2.72
        desk = {"t": "desk", "axis": "depth", "x0": 0.62, "y0": 0.05, "x1": 1.25, "y1": desk_end,
                "returnX": 0.14, "returnY": round(desk_end - 0.52, 2)}
    deco = [desk]
    lounge_depth = d - BACK - FRONT
    if tier in ("simple", "lux"):
        bar_len = round(min(w - LEFT - 1.0, 2.6 + 0.25 * n), 2)
        x0, x1 = round(w - 0.4 - bar_len, 2), round(w - 0.4, 2)
        serving_x0, serving_x1 = round(x0 + 0.15, 2), round(x1 - 0.15, 2)
        bar = {
            "x0": x0, "x1": x1,
            "serving": {"x0": serving_x0, "y0": 0.90, "x1": serving_x1, "y1": 1.36,
                        "stools": [] if small_lux else serving_stools(serving_x0, serving_x1, tables, angles)},
        }
        # ソファセット：右壁に寄せ、中央の卓列から離す。
        k = 1 if small_lux else max(1, int(lounge_depth // 2.8))
        step = lounge_depth / k
        plant_y = d - 0.33
        for i in range(k):
            y = round(BACK + step * (i + 0.5), 2)
            front_lux = tier == "lux" and i == k - 1
            if front_lux:
                # L字ソファを右手前の角へ寄せ、低いテーブルと鉢植えを奥側へ置く。
                length = 2.05
                back_y = d - 0.14 - length
                deco.append({"t": "sofa", "x": round(w - 0.42, 2), "y": round(back_y + length / 2, 3), "len": length,
                             "return": 1.10 if small_lux else 0.85})
                lowtable_inset, lowtable_offset = (1.18, 0.81) if n == 8 and finished_lux else (1.29, 0.58)
                deco.append({"t": "lowtable", "x": round(w - lowtable_inset, 2), "y": round(back_y + lowtable_offset, 2)})
                plant_y = back_y - 0.30
            else:
                deco.append({"t": "sofa", "x": round(w - 0.45, 2), "y": y, "len": 1.8})
                deco.append({"t": "lowtable", "x": round(w - 1.29, 2), "y": y})
        deco.append({"t": "plant", "x": round(w - 0.43, 2), "y": round(plant_y, 2)})

    special = {}
    if flat_final_table:
        # 9卓と11〜12卓は右端の中段をFTにする。
        special["ft"] = list(tables[{9: 5, 11: 9, 12: 9}.get(n, -1)])
    if tier == "lux":
        # カーテンは左壁に掛け、エレベーター前は開ける。
        curtains = {"t": "curtains", "y0": 0.30, "y1": round(min(elevator["y0"] - 0.27, 3.0), 2)}
        if finished_lux:
            curtains["sill"] = 0.37
        deco.append(curtains)
        # 小規模店では全卓から見える共有モニター、大規模店ではFT用のモニターを置く。
        ft = rows[0][(len(rows[0]) - 1) // 2]
        screen_left, screen_right = LEFT, bar["x0"] - 0.4
        screen_half = min(3.0, (screen_right - screen_left) / 2)
        screen_target = sum(x for x, _ in tables) / n if small_lux else ft[0]
        screen_center = max(screen_left + screen_half, min(screen_target, screen_right - screen_half))
        if small_lux:
            deco.append({"t": "flutedWall", "x0": 0.18, "x1": round(bar["x0"] - 0.12, 2)})
        screen_x0, screen_x1 = round(screen_center - screen_half, 2), round(screen_center + screen_half, 2)
        deco.append({"t": "screen", "x0": screen_x0, "x1": screen_x1})
        # モニターを両側から挟み、入口側はカーテンと反対のエレベーター手前に灯りを置く。
        light_right = min(screen_x1 + 0.27, (screen_x1 + bar["x0"]) / 2)
        deco.extend([
            {"t": "wallLight", "wall": "back", "along": round(screen_x0 - 0.27, 2)},
            {"t": "wallLight", "wall": "back", "along": round(light_right, 2)},
            {"t": "wallLight", "wall": "left", "along": round(elevator["y1"] + 0.52, 2)},
        ])
        if finished_lux:
            deco.extend([
                {"t": "floorLamp", "x": 0.50, "y": round(d - 0.48, 2)},
                {"t": "wallLight", "wall": "back", "along": 0.52, "style": "reeded"},
                {"t": "wallLight", "wall": "back", "along": round(w - 0.20, 2), "style": "reeded"},
            ])

    if tier == "lux" and not small_lux:
        # ファイナルテーブルの壇は自分の卓区画に収める。
        deco.append({"t": "stage", "x0": round(ft[0] - 1.62, 2), "y0": round(ft[1] - 1.15, 2), "x1": round(ft[0] + 1.62, 2), "y1": round(ft[1] + 1.15, 2)})
        special["ft"] = list(ft)
        # ガラスの区画は出入口側の列の右端。FTと同じ卓に重ねない。
        vt = rows[-1][-1]
        if vt != ft:
            dx, dy = min(1.85, cw / 2 - 0.03), min(1.38, ch / 2 - 0.03)
            deco.append({"t": "vip", "x0": round(vt[0] - dx, 2), "y0": round(vt[1] - dy, 2), "x1": round(vt[0] + dx, 2), "y1": round(vt[1] + dy, 2)})
            special["vip"] = list(vt)
    return {
        "w": w, "d": d, "tsubo": tsubo, "m2": round(m2, 1), "interior": tier,
        "tables": [[x, y, angle] for (x, y), angle in zip(tables, angles)] if angles else [[x, y] for x, y in tables],
        "elevator": elevator,
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
