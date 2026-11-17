#!/usr/bin/env python3
"""v0.4: 資金5,000万円のうち初期投資をいくらにするかで、最終リターンがどう変わるかを見る抽象モデル（単位: 万円/月、架空値）。
- 初期投資 I = 基礎費（保証金・内装・許認可）+ 卓ごとの費用。残りは手元資金（トラブルへの備え）。
- 開業から需要が立ち上がるまで赤字が続く。毎月、確率でトラブル（出費・売上減）が起きる。
- 手元資金が尽きたら倒産（リターン0）。卓は満卓が続けば手元資金から増やせる（追加投資）。
- 60か月目に買収：DCFで企業価値を出し、最終リターン =（手元資金 + 買収額）/ 5,000。
python3 scripts/sim_invest.py"""
import random, statistics as st

FUND = 5000
DISCOUNT = 0.25     # 割引率（小規模店舗のリスクを反映）
GROWTH = 0.02       # 予測期間の成長率
BASE = 700          # 保証金・内装の基礎・許認可・開業準備
PER_TABLE = 150     # 卓1台ぶんの内装・設備
CAP = 140           # 卓1台あたり月の来客上限（人）
SPEND = 0.55        # 客単価（万円）
RENT, OTHER, DEALER = 80, 50, 30
DEMAND_MATURE = 1600  # 成熟時の月の需要（人）
RAMP = 18           # 需要が成熟するまでの月数（30%から立ち上がる）
TROUBLE_P = 0.08    # 毎月のトラブル確率
TROUBLE_COST = (300, 1500)
SHOCK = 0.3         # 売上減トラブルの減少幅（3か月）
QUALITY_FULL = 1000 # 基礎費を超えた投資がこの額で「店の格」が上限に届く
LATE_TABLE = 260    # 開業後の増卓は営業しながらの工事で割高
FIXED_PER_TABLE = 6 # 卓が空いていてもかかる費用（リース・保守・面積ぶんの家賃）


def dcf(fcf_month, growth, r, years=5, g_inf=0.01):
    """直近の月次FCF×12を起点に、5年分の予測FCFを割り引き、6年目以降はターミナルバリューで足す。"""
    fcf = fcf_month * 12
    pv = 0
    for y in range(1, years + 1):
        fcf *= 1 + growth
        pv += fcf / (1 + r) ** y
    tv = fcf * (1 + g_inf) / (r - g_inf)
    return max(0, pv + tv / (1 + r) ** years)


def run(I, rng, expand=True):
    T = (I - BASE) // PER_TABLE
    cash = FUND - I
    quality = 0.55 + 0.45 * min(1, (I - BASE) / QUALITY_FULL)  # 店の格：最初の作り込みで決まり、後からは上げにくい
    shock = 0
    recent = []
    for t in range(60):
        demand = DEMAND_MATURE * quality * min(1, 0.3 + 0.7 * t / RAMP)
        served = min(demand, T * CAP)
        rev = served * SPEND
        if shock > 0: rev *= 1 - SHOCK; shock -= 1
        staffed = min(T, -(-served // CAP))
        op = rev - (RENT * (1 + T / 20) + OTHER + DEALER * staffed + FIXED_PER_TABLE * T)
        cash += op
        if rng.random() < TROUBLE_P:
            if rng.random() < 0.5: cash -= rng.uniform(*TROUBLE_COST) * (1 + T / 15)
            else: shock = 3
        if expand and demand > T * CAP * 1.05 and cash > 1500:
            T += 1; cash -= LATE_TABLE
        if cash < 0: return 0, True, 0, 0
        recent.append(op)
    fcf = st.mean(recent[-12:]) - T * 2  # 維持投資
    ev = dcf(fcf, growth=GROWTH, r=DISCOUNT)
    return (cash + ev) / FUND, False, cash, ev


if __name__ == '__main__':
    rng = random.Random(11)
    print('初期投資  卓数  平均リターン  中央値  下位10%  倒産率  内訳(手元資金/買収額)')
    for I in range(1000, 4501, 250):
        xs = [run(I, rng) for _ in range(4000)]
        v = sorted(x[0] for x in xs)
        alive = [x for x in xs if not x[1]] or [(0, 0, 0, 0)]
        print(f'{I:>6}  {(I - BASE) // PER_TABLE:>4}  {st.mean(v):>8.2f}倍  {v[2000]:.2f}倍  {v[400]:.2f}倍  {sum(x[1] for x in xs) / 4000:>5.0%}'
              f'  {st.mean(x[2] for x in alive):>6.0f} / {st.mean(x[3] for x in alive):>6.0f}')
