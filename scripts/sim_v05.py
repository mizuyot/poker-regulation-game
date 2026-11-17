#!/usr/bin/env python3
"""v0.5: 立地（坪単価）× 卓数で初期投資が決まり、最終的な手取り額（円）を競う抽象モデル。数値はゲーム用の架空値。
- 面積 = 卓×4坪 + 共用10坪。家賃 = 面積 × 坪単価。敷金 = 家賃6か月。内装 = 面積 × 内装坪単価。卓 = 1台50万円。開業準備200万円。
- 席数 = 卓×9。1日の客数 = 席数 × 満席率 × 回転数。満席率 = min(上限, 立地の需要 ÷ (席数×回転数))。
- 需要は開業時30%から18か月で成熟。毎月8%でトラブル（出費 or 3か月売上30%減）。資金5,000万円、借入なし。
- 60か月目に売却。健全なら DCF 企業価値 + 敷金。違法が見つかったら「ハコとしての価値」（敷金 + 内装・卓の残存価値）。
- スコア = 手元資金 + 売却額（万円）。倒産は0。
python3 scripts/sim_v05.py"""
import random, statistics as st

FUND = 5000
LOCATIONS = {
    #  名前: (坪単価 万円/月, 客単価 万円, 成熟時の需要 人/日, 内装 万円/坪, 満席率の上限)
    '東京都心':     (4.0, 0.55, 64, 35, 0.90),
    '大都市都心':   (2.0, 0.42, 70, 30, 0.85),
    '地方都市中心': (1.2, 0.36, 60, 25, 0.80),
    '郊外':         (0.7, 0.35, 42, 22, 0.75),
}
# v0.6: 競合の出店（毎月の確率, 1回あたりの需要減）。都心ほど激しい
# v0.6: 立地ごとの人件費（1卓/月）とトラブル確率（月）
STAFF = {'東京都心': 50, '大都市都心': 45, '地方都市中心': 36, '郊外': 32}
TROUBLE = {'東京都心': 0.10, '大都市都心': 0.09, '地方都市中心': 0.07, '郊外': 0.05}
# v0.6: 物件の当たり外れ（開業してみるまで分からない需要のぶれ・標準偏差）。都心ほど大きい
DEMAND_SD = {'東京都心': 0.35, '大都市都心': 0.28, '地方都市中心': 0.18, '郊外': 0.10}
COMPETITION = {'東京都心': (0.05, 0.12), '大都市都心': (0.035, 0.10), '地方都市中心': (0.015, 0.08), '郊外': (0.005, 0.08)}
TURNS = 1.5          # 1席あたり1日の回転数
DAYS = 26
STAFF_PER_TABLE = 45 # ディーラー・フロア（万円/月/卓）
OTHER = 60
VARIABLE = 0.15      # ドリンク原価・決済手数料など
RAMP, TROUBLE_P, TROUBLE_COST, SHOCK = 18, 0.08, (200, 1000), 0.3
DISCOUNT, GROWTH = 0.25, 0.02


def build(loc, tables):
    tsubo_rent, spend, demand, fitout, occ_cap = LOCATIONS[loc]
    area = tables * 4 + 10
    rent = area * tsubo_rent
    deposit = rent * 6
    fit = area * fitout
    invest = deposit + fit + tables * 50 + 200
    return dict(area=area, rent=rent, deposit=deposit, fit=fit, invest=invest, spend=spend, demand=demand, occ_cap=occ_cap)


def dcf(fcf_month, r=DISCOUNT, g=GROWTH, g_inf=0.01):
    fcf = fcf_month * 12; pv = 0
    for y in range(1, 6):
        fcf *= 1 + g; pv += fcf / (1 + r) ** y
    return max(0, pv + fcf * (1 + g_inf) / (r - g_inf) / (1 + r) ** 5)


def run(loc, tables, rng):
    b = build(loc, tables)
    cash = FUND - b['invest']; shock = 0; ops = []
    seats = tables * 9
    comp_p, comp_hit = COMPETITION[loc]
    share = max(0.3, rng.gauss(1.0, DEMAND_SD[loc]))  # 物件の当たり外れ
    for t in range(60):
        if rng.random() < comp_p: share *= 1 - comp_hit
        d = b['demand'] * share * min(1, 0.3 + 0.7 * t / RAMP)
        occ = min(b['occ_cap'], d / (seats * TURNS))
        guests = seats * occ * TURNS * DAYS
        rev = guests * b['spend']
        if shock > 0: rev *= 1 - SHOCK; shock -= 1
        op = rev * (1 - VARIABLE) - b['rent'] - STAFF[loc] * tables - OTHER
        cash += op; ops.append(op)
        if rng.random() < TROUBLE[loc]:
            if rng.random() < 0.5: cash -= rng.uniform(*TROUBLE_COST) * (1 + tables / 10)
            else: shock = 3
        if cash < 0: return dict(score=0, bankrupt=True)
    fcf = st.mean(ops[-12:]) - tables * 2
    healthy = cash + dcf(fcf) + b['deposit']
    shell = cash + b['deposit'] + b['fit'] * 0.5 + tables * 50 * 0.3  # ハコとしての価値
    return dict(score=healthy, shell=shell, bankrupt=False, occ=occ, fcf=fcf)


if __name__ == '__main__':
    rng = random.Random(7)
    for loc in LOCATIONS:
        print(f'== {loc}（坪{LOCATIONS[loc][0]}万円/月）')
        print('  卓  初期投資  平均手取り  中央値  倒産率  満席率  ハコ価値の手取り')
        for tables in range(2, 13):
            b = build(loc, tables)
            if b['invest'] > FUND: break
            xs = [run(loc, tables, rng) for _ in range(2000)]
            v = sorted(x['score'] for x in xs)
            alive = [x for x in xs if not x['bankrupt']]
            occ = st.mean(x['occ'] for x in alive) if alive else 0
            shell = st.mean(x['shell'] for x in alive) if alive else 0
            print(f'  {tables:>2}  {b["invest"]:>6.0f}  {st.mean(v):>9.0f}  {v[1000]:>6.0f}  {sum(x["bankrupt"] for x in xs) / 2000:>5.0%}  {occ:>5.0%}  {shell:>8.0f}')
