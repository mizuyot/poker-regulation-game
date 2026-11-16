// 立地×卓数ごとの生き残り率（5年目に売却できた割合）と平均手取り。健全（預入のみ）、事件の選択はランダム
// 使い方: node scripts/sim_survival.js [各条件の回数=40] [HTMLのパス（省略時は docs/shop/index.html）]
const { chromium } = require('playwright');
const path = require('path');
const N = +process.argv[2] || 40;
const FILE = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '../docs/shop/index.html');
const LOCS = [['tokyo', '東京都心'], ['metro', '大都市都心'], ['regional', '地方都市'], ['suburb', '郊外']].filter(([id]) => !process.env.LOCS || process.env.LOCS.split(',').includes(id));
const TABLES = (process.env.TABLES || '3,5,8,11,12').split(',').map(Number);
(async () => {
  const b = await chromium.launch(); const jobs = [];
  for (const [loc] of LOCS) for (const t of TABLES) for (let i = 0; i < N; i++) jobs.push({ loc, t, seed: 'S' + String(i).padStart(4, '0') });
  const res = {}; let k = 0;
  async function w(){ const p = await b.newPage(); while (k < jobs.length){ const j = jobs[k++];
    await p.goto('file://' + FILE + '?test=1'); await p.waitForFunction(() => window.__shop);
    await p.evaluate(([c, s]) => __shop.start({ style: 'deposit', ...c, seed: s }), [{ loc: j.loc, tables: j.t }, j.seed]);
    await p.waitForFunction(() => __shop.state().over && (__shop.state().over !== 'complete' || __shop.state().sale != null), null, { timeout: 120000 });
    const r = await p.evaluate(() => ({ over: __shop.state().over, amt: __shop.state().finalAmount || 0, cash0: 0 }));
    ((res[j.loc] ||= {})[j.t] ||= []).push(r); } }
  await Promise.all(Array.from({ length: 6 }, w));
  const out = {};
  for (const [loc, name] of LOCS){ out[name] = {}; for (const t of TABLES){ const r = res[loc][t]; const ok = r.filter((x) => x.over === 'complete');
    out[name][t] = { survive: Math.round(ok.length / r.length * 100), mean: Math.round(r.reduce((a, x) => a + x.amt, 0) / r.length), okMean: ok.length ? Math.round(ok.reduce((a, x) => a + x.amt, 0) / ok.length) : null }; } }
  console.log(JSON.stringify(out));
  await b.close();
})();
