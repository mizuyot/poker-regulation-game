#!/usr/bin/env python3
"""v0.2推奨値に対する「途中から違法」「終盤だけ違法」攻略の検証（抽象モデル、架空値）。
開始月 × 期間 × 命令後に撤退/継続 を総当たりし、合法比の期待値上位を出す。python3 scripts/sim_endgame.py"""
import random,statistics as st
N=60;C=1.0;R=2.0
P=dict(m=5,pa=0.02,g=0.002,po=0.15,olen=2,fine=6,drop=0.5,recov=6,jump=4,tail=12,tailf=0.5)
def run(start,stop,cont,rng,margin=R):
    W=0;k=0;ol=0;rec=0;used=0;last=None
    for t in range(N):
        il= start<=t<stop and k<cont and ol==0
        rev=margin*(P['m'] if il else 1)
        if rec>0: rev*=1-P['drop'];rec-=1
        W+=rev-C
        if il: used+=1;last=t;pa=(P['pa']+P['g']*used)*P['jump']**k
        elif last is not None and t-last<=P['tail']: pa=P['pa']*P['tailf']*P['jump']**k
        else: pa=0
        if rng.random()<pa: return 0,1
        if il and rng.random()<P['po']:
            k+=1;ol=P['olen']+1;W-=P['fine']*(margin-C)
        if ol>0:
            ol-=1
            if ol==0: rec=P['recov']
    return W,0
rng=random.Random(5)
for margin,lab in ((2.0,'売上:費用=2:1'),(1.3,'薄利の店 1.3:1')):
  legal=N*(margin-C); print('==',lab)
  rows=[]
  for start in (0,24,48,54,57):
    for length in (1,2,3,6,12):
      for cont in (1,99):
        xs=[run(start,start+length,cont,rng,margin) for _ in range(4000)]
        v=sorted(x[0] for x in xs)
        rows.append((st.mean(v)/legal,start,length,cont,v[3600]/legal,sum(x[1] for x in xs)/4000))
  rows.sort(reverse=True)
  for r in rows[:5]: print(f' 期待{r[0]:.2f} 開始{r[1]+1}か月目 {r[2]}か月 命令後{"撤退" if r[3]==1 else "継続"} 上位10%{r[4]:.2f} 逮捕{r[5]:.0%}')
