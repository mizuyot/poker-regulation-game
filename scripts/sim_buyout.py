#!/usr/bin/env python3
"""v0.3: 5年後の買収（買収前調査つき）で、どの違法戦略も健全営業に勝てないかを検証する抽象モデル。
違法の確率モデルは v0.2 推奨値のまま。数値はゲーム用の架空パラメータ。
最終スコア = 累計利益 + 買収額（摘発エンドなら失格=0、調査で違法が見つかれば破談=0）。
戦略 = 違法の開始月 × 期間 × 命令後に撤退/継続（固定戦略だけでなく途中開始・終盤だけを含む）。
python3 scripts/sim_buyout.py"""
import random, statistics as st

N = 60
P = dict(m=5, pa=0.02, g=0.002, po=0.15, olen=2, fine=6, drop=0.5, recov=6, jump=4, tail=12, tailf=0.5)


def run(start, stop, cont, rng, R, C, buy_mult, q, window):
    W = 0; k = 0; ol = 0; rec = 0; used = 0; last = None; months = []
    best_month = 0
    for t in range(N):
        il = start <= t < stop and k < cont and ol == 0
        rev = R * (P['m'] if il else 1)
        if rec > 0: rev *= 1 - P['drop']; rec -= 1
        W += rev - C; best_month = max(best_month, rev - C)
        if il: used += 1; last = t; months.append(t); pa = (P['pa'] + P['g'] * used) * P['jump'] ** k
        elif last is not None and t - last <= P['tail']: pa = P['pa'] * P['tailf'] * P['jump'] ** k
        else: pa = 0
        if rng.random() < pa: return 0, 'arrest', best_month
        if il and rng.random() < P['po']:
            k += 1; ol = P['olen'] + 1; W -= P['fine'] * (R - C)
        if ol > 0:
            ol -= 1
            if ol == 0: rec = P['recov']
    recent = sum(1 for t in months if t >= N - window)
    found = rng.random() < 1 - (1 - q) ** recent
    buy = 0 if found else buy_mult * R * (0.5 ** k)  # 是正指摘の履歴は信頼を下げ、買収額を半減させる
    return W + buy, ('dd_fail' if found else 'ok'), best_month


def worst(R, C, buy_mult, q, window, runs=2000, seed=1):
    rng = random.Random(seed)
    legal = N * (R - C) + buy_mult * R
    best = None
    for start in (0, 12, 24, 36, 48, 54, 57, 59):
        for length in (1, 3, 6, 12, 24, 60):
            for cont in (1, 99):
                xs = [run(start, start + length, cont, rng, R, C, buy_mult, q, window) for _ in range(runs)]
                ev = st.mean(x[0] for x in xs) / legal
                if not best or ev > best[0]:
                    best = (ev, start + 1, length, 'retreat' if cont == 1 else 'continue',
                            sum(x[1] == 'arrest' for x in xs) / runs, sum(x[1] == 'dd_fail' for x in xs) / runs,
                            max(x[2] for x in xs) / (R - C))
    return best


if __name__ == '__main__':
    for buy_mult, q, window in ((12, 0.3, 36), (15, 0.3, 36), (15, 0.4, 36), (18, 0.4, 36)):
        print(f'買収額=月商×{buy_mult} 調査で見つかる率=1-(1-{q})^(直近{window}か月の違法月数)')
        for R, C, lab in ((2.0, 1.0, '売上:費用=2:1'), (1.3, 1.0, '薄利 1.3:1')):
            b = worst(R, C, buy_mult, q, window)
            print(f'  {lab}: 最善の違法 {b[0]:.2f}倍（{b[1]}か月目から{b[2]}か月・命令後{b[3]}） 逮捕{b[4]:.0%} 破談{b[5]:.0%} | 最高月利は合法の{b[6]:.1f}倍')
