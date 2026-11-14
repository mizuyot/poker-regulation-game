#!/usr/bin/env python3
"""Balance check for docs/shop/shop.json (static strategy, 300 runs each).
Usage: python3 scripts/sim_shop.py docs/shop/shop.json
Note: mirrors docs/shop/index.html monthTick(); cashout tail risk is not modeled (static strategy never switches)."""
import json,random,sys,statistics as st
D=json.load(open(sys.argv[1]));E=D['economy'];R=D['risk'];M=D['meta']
L={x['id']:x for x in D['locations']};RU={x['id']:x for x in D['rules']};LI={x['id']:x for x in D['licenses']}
def run(loc,rule,lic,tables,ad,keep=True):
  l,r,li=L[loc],RU[rule],LI[lic];cash=M['startCash']-tables*E['tablePrice']-li['fee'];profit=cash-M['startCash'];rep=E['reputation']['start'];heat=0;wait=li['waitMonths'];sus=0;strikes=0
  for m in range(M['months']):
    a=E['ads'][ad];waiting=wait>0;open_=wait<=0 and sus<=0;rev=0
    if open_:
      dem=E['baseVisitors']*l['traffic']*r['demand']*a['mult']*rep;cap=tables*E['tableCapacity'];sv=min(dem,cap);rev=sv*(r['spend']-r['prizeCost'])
      er=E['reputation']
      if dem>=cap*.95: rep=min(er['max'],rep+er['gainWhenFull'])
      elif sv/cap<.5: rep=max(er['min'],rep-er['lossWhenIdle'])
      else: rep=min(er['max'],rep+er['gainWhenFull']/3)
    else:
      if wait>0: wait-=1
      if sus>0: sus-=1
    cost=l['rent']+(0 if waiting else tables*E['dealerPerTable']+a['cost']);net=rev-cost;cash+=net;profit+=net
    if r['id']=='cashout' and open_: heat=min(R['heat']['max'],heat+R['heat']['cashoutPerMonth'])
    else: heat=max(0,heat-R['heat']['decay'])
    v=[x for x in (r['violation'],li['violation']) if x]
    if open_ and v:
      hz=min(.6,sum(R['base'][k] for k in v)*l['visibility']*(1+R['adFactor']*ad)*(1+tables/R['tablesDivisor'])*(1+heat))
      if random.random()<hz:
        if 'criminal' in v: return 0,'arrest'
        strikes+=1;st_=R['ladder'][min(strikes,3)-1]
        if st_.get('end'): return profit-100,'closed'
        heat+=R['heat']['afterWarning'];sus=st_['suspendMonths']
        if not keep and strikes==1: r=RU['noprize']
    if cash<M['bankruptAt']: return profit,'bankrupt'
  return profit,'ok'
for loc in L:
 for rule in RU:
  for lic in LI:
   best=None
   for t in range(1,13):
    for ad in range(4):
     xs=[run(loc,rule,lic,t,ad) for _ in range(300)];mean=st.mean(x[0] for x in xs)
     if not best or mean>best[0]: best=(mean,t,ad,sum(x[1]=='arrest' for x in xs)/300, sum(x[1]=='ok' for x in xs)/300)
   print(f"{L[loc]['name']:8} {rule:8} {lic:10} 期待{best[0]:7.0f} 卓{best[1]} 広告{best[2]} 逮捕{best[3]:.0%} 完走{best[4]:.0%}")
