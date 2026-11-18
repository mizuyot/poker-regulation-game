// 1年ごとの「売却する」「方針を変える」を入れても、ゲームとしておかしくならないかの検証。
// 使い方: node scripts/sim_annual.js [各戦略の回数=24]   （ブラウザで docs/shop/index.html を ?test=1 で自動プレイ）
// 戦略：健全のまま／黒のまま／チケット・コインのまま（各年末に「いま売ったら」を記録）、
//       黒・コインで k 年稼いでから健全に切り替えて5年目まで持つ
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '../docs/shop/index.html') + '?test=1';
const N = +process.argv[2] || 24;
const base = { loc: 'metro', tables: 5 };
const ALL = [
  { name: 'healthy', style: 'deposit' },
  { name: 'black', style: 'cashout' },
  { name: 'token', style: 'token' },
  { name: 'prize', style: 'prize' },
  { name: 'food', style: 'food' },
  { name: 'black→healthy@1y', style: 'cashout', switchAt: 12 },
  { name: 'black→healthy@2y', style: 'cashout', switchAt: 24 },
  { name: 'token→healthy@1y', style: 'token', switchAt: 12 },
  { name: 'token→healthy@2y', style: 'token', switchAt: 24 },
  { name: 'token→healthy@3y', style: 'token', switchAt: 36 },
];
const strategies = process.env.ONLY ? ALL.filter((x) => new RegExp(process.env.ONLY).test(x.name)) : ALL;
(async () => {
  const b = await chromium.launch();
  const jobs = []; for (const st of strategies) for (let i = 0; i < N; i++) jobs.push({ st, seed: 'Y' + String(i).padStart(4, '0') });
  const res = {}; let k = 0;
  async function worker(){
    const p = await b.newPage();
    while (k < jobs.length){
      const j = jobs[k++];
      await p.goto(URL); await p.waitForFunction(() => window.__shop);
      await p.evaluate(([st, seed, base]) => {
        window.__snap = {};
        window.__onMonth = (S) => {
          if (st.switchAt && S.month === st.switchAt) __shop.setStyle('deposit');
          if (S.month % 12 === 0 && S.month < 60) window.__snap[S.month / 12] = __shop.sellNow();
        };
        __shop.start({ ...base, style: st.style, seed });
      }, [j.st, j.seed, base]);
      await p.waitForFunction(() => __shop.state().over && (__shop.state().over !== 'complete' || __shop.state().sale != null), null, { timeout: 180000 });
      const r = await p.evaluate(() => { const S = __shop.state(); return { over: S.over, month: S.month, final: S.over === 'complete' ? S.cash + S.sale - S.debt : S.over === 'arrest' ? S.finalAmount : 0 /* v1.4.2：摘発でも罰金・追徴を払った残りの手元資金は残る */, snap: window.__snap }; });
      (res[j.st.name] ||= []).push(r);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const med = (a) => { const z = [...a].sort((x, y) => x - y); return z.length ? z[z.length >> 1] : 0; };
  const out = {};
  for (const st of strategies){
    const r = res[st.name];
    const row = { final_mean: Math.round(mean(r.map((x) => x.final))), final_med: Math.round(med(r.map((x) => x.final))), arrested: r.filter((x) => x.over === 'arrest').length, bankrupt: r.filter((x) => x.over === 'bankrupt').length, n: r.length };
    if (!st.switchAt) for (let y = 1; y <= 4; y++){
      row[`alive@${y}y`] = r.filter((x) => x.snap[y]).length;
      row[`cash@${y}y`] = Math.round(mean(r.map((x) => x.snap[y] ? x.snap[y].cash : 0)));
      // y年目の終わりに売った場合。すでに摘発された回は摘発時の最終手取り額を使う。
      const v = r.map((x) => x.snap[y]?.amount ?? (x.over === 'arrest' ? x.final : 0));
      row[`sell@${y}y_mean`] = Math.round(mean(v));
      row[`sell@${y}y_med`] = Math.round(med(v));
      const live = r.map((x) => x.snap[y]).filter(Boolean);
      if (live.length) row[`sell@${y}y_parts`] = { alive: live.length, cash: Math.round(mean(live.map((s) => s.cash))), sale: Math.round(mean(live.map((s) => s.sale))), dcf: Math.round(mean(live.map((s) => s.dcf))), comps: Math.round(mean(live.map((s) => s.comps))), liq: Math.round(mean(live.map((s) => s.liq))) };
    }
    out[st.name] = row;
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
