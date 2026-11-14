#!/usr/bin/env python3
"""v0.2方針の確率設計を検証する抽象モデル（合法: 売上2・費用1・月利1、60か月）。
戦略 = 何回目の改善命令で撤退するか × 何か月目で違法をやめるか。値は合法の何倍か。
数値はゲーム用の架空パラメータ。python3 scripts/sim_orders.py"""
import random, statistics as st
N=60; C=1.0; R=2.0
def run(P, cont_orders, stop_month, rng):
    W=0;k=0;order_left=0;recov=0;used=0;last_illegal=None
    for t in range(N):
        illegal = k<cont_orders and t<stop_month and order_left==0
        rev=R*(P['m'] if illegal else 1)
        if recov>0: rev*=1-P['drop']; recov-=1
        W+=rev-C
        # 逮捕：違法中 or やめた後の遡及期間
        if illegal:
            used+=1; last_illegal=t
            pa=(P['pa']+P['g']*used)*(P['jump']**k)
        elif last_illegal is not None and t-last_illegal<=P['tail']:
            pa=P['pa']*P['tailf']*(P['jump']**k)
        else: pa=0
        if rng.random()<pa: return 0,'arrest'
        if illegal and rng.random()<P['po']:
            k+=1; order_left=P['olen']+1; W-=P['fine']
        if order_left>0:
            order_left-=1
            if order_left==0: recov=P['recov']
    return W,'ok'
def best(P,runs=3000):
    rng=random.Random(7);legal=N*(R-C);out=[]
    for co in (1,2,99):
        for sm in (3,6,12,24,36,60):
            xs=[run(P,co,sm,rng) for _ in range(runs)]
            v=sorted(x[0] for x in xs)
            out.append((st.mean(v)/legal,co,sm,v[int(runs*.9)]/legal,sum(x[1]=='arrest' for x in xs)/runs))
    out.sort(reverse=True);return out
base=dict(m=5,pa=0.02,g=0.001,po=0.10,olen=2,fine=6,drop=0.5,recov=6,jump=4,tail=12,tailf=0.5)
for g in (0.001,0.002,0.004):
  for po in (0.10,0.15):
    for fine in (6,12):
      P=dict(base,g=g,po=po,fine=fine);o=best(P);b=o[0]
      always=[x for x in o if x[1]==99 and x[2]==60][0]
      print(f"増加+{g*100:.1f}%/月 命令{po:.0%} 罰金{fine}か月分: 最善{b[0]:.2f}倍(命令{b[1]}回目で撤退/{b[2]}か月) 上位10%{b[3]:.1f}倍 逮捕{b[4]:.0%} | ずっと違法{always[0]:.2f} 逮捕{always[4]:.0%}")
print('--- 推奨値: 12か月だけ違法して撤退した場合の分布')
P=dict(base,g=0.002,po=0.15,fine=6)
rng=random.Random(3);xs=[run(P,1,12,rng) for _ in range(5000)];v=sorted(x[0]/60 for x in xs)
print('期待',round(st.mean(v),2),'逮捕',sum(x[1]=='arrest' for x in xs)/5000,'中央',round(v[2500],2),'上位10%',round(v[4500],2),'最大',round(v[-1],2))
