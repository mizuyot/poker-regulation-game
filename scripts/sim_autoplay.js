const { chromium } = require('playwright');
// 使い方: python3 server.py を起動してから node scripts/sim_autoplay.js [各条件の回数=16]
// FAC_ONLY=1 で設備・企画だけ。条件コード R0000〜 を全条件で共通に使う（対になった比較）。
const N = +process.argv[2] || 16;
const configs = [];
if (!process.env.FAC_ONLY) for (const style of ["cashout","token","prize","food","deposit"]) configs.push({ name: "style:"+style, cfg: { loc:"metro", tables:5, style } });
configs.push({ name: "fac:none", cfg: { loc:"metro", tables:5, style:"deposit" } });
for (const f of ["stream","lesson","tournament","bar","camera","vip"]) configs.push({ name: "fac:"+f, cfg: { loc:"metro", tables:5, style:"deposit", fac:[f] } });
if (!process.env.FAC_ONLY) for (const loc of ["tokyo","regional","suburb"]) configs.push({ name: "loc:"+loc, cfg: { loc, tables:5, style:"deposit" } });
(async () => {
  const b = await chromium.launch(); const jobs = [];
  for (const c of configs) for (let i = 0; i < N; i++) jobs.push({ c, seed: "R" + String(i).padStart(4, "0") });
  const res = {}; let k = 0;
  async function worker(){
    const p = await b.newPage();
    while (k < jobs.length){
      const j = jobs[k++];
      await p.goto('http://127.0.0.1:8765/shop/?test=1');
      await p.waitForFunction(() => window.__shop);
      await p.evaluate(([c, s]) => __shop.start({ ...c, seed: s }), [j.c.cfg, j.seed]);
      await p.waitForFunction(() => __shop.state().over && (__shop.state().over !== "complete" || __shop.state().sale != null), null, { timeout: 180000 });
      const r = await p.evaluate(() => { const S = __shop.state(); return { over: S.over, amt: S.over === "complete" ? S.cash + S.sale - S.debt : 0, peak: S.peakMonth }; });
      (res[j.c.name] ||= []).push(r);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const c of configs){ const r = res[c.name]; const a = r.map(x => x.amt).sort((x,y)=>x-y);
    const mean = a.reduce((s,x)=>s+x,0)/a.length; const cnt = (k) => r.filter(x=>x.over===k).length;
    console.log(c.name.padEnd(16), "mean", Math.round(mean), "med", Math.round(a[a.length>>1]), "arrest", cnt("arrest"), "bk", cnt("bankrupt"), "peak", Math.round(Math.max(...r.map(x=>x.peak)))); }
  await b.close();
})();
