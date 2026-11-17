// 極端な卓数・設定での自動プレイ実験（バグと攻略の穴を探す）
// 使い方: node scripts/sim_extremes.js [各条件の回数=16]   （?test=1、事件の選択はランダム、条件コード Z0000〜 を共通で使う）
// 出力：条件ごとの 平均手取り（摘発は罰金・追徴後の手元資金、倒産は0）・中央値・摘発・倒産・最高月利益・画面のエラー・NaN
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '../docs/shop/index.html') + '?test=1';
const N = +process.argv[2] || 16;
const H = { loc: 'metro', tables: 5, style: 'deposit' };
const ALLFAC = ['stream', 'lesson', 'tournament', 'bar', 'camera', 'vip'];
const configs = [
  ['基準：大都市・5卓・17-24時・100%', {}],
  ['1卓', { tables: 1 }], ['2卓', { tables: 2 }], ['3卓', { tables: 3 }], ['8卓', { tables: 8 }], ['12卓', { tables: 12 }],
  ['1卓・東京都心', { tables: 1, loc: 'tokyo' }], ['12卓・東京都心', { tables: 12, loc: 'tokyo' }], ['12卓・郊外', { tables: 12, loc: 'suburb' }], ['1卓・郊外', { tables: 1, loc: 'suburb' }],
  ['料金70%', { price: 0.7 }], ['料金130%', { price: 1.3 }], ['12卓・料金70%', { tables: 12, price: 0.7 }], ['1卓・料金130%', { tables: 1, price: 1.3 }],
  ['営業4時間（20-24時）', { open: 20, close: 24 }], ['昼から（12-24時）', { open: 12, close: 24 }], ['朝6時から（6-24時）', { open: 6, close: 24 }],
  ['24時間（5-29時・深夜営業）', { open: 5, close: 29 }], ['12卓・24時間', { tables: 12, open: 5, close: 29 }],
  ['未経験採用', { hiring: 'rookie' }],
  ['内装ほぼなし・教育0円', { interior: 'none', edu: '0' }], ['内装豪華・教育30万円', { interior: 'lux', edu: '30' }], ['12卓・豪華・東京', { tables: 12, interior: 'lux', loc: 'tokyo' }],
  ['無許可ですぐ開く', { unlicensed: true }],
  ['黒・12卓', { style: 'cashout', tables: 12 }], ['黒・1卓', { style: 'cashout', tables: 1 }], ['黒・24時間・無許可', { style: 'cashout', open: 5, close: 29, unlicensed: true }],
  ['コイン・12卓・130%', { style: 'token', tables: 12, price: 1.3 }],
  ['全部盛り：黒・12卓・東京・24時間・無許可・豪華・130%', { style: 'cashout', tables: 12, loc: 'tokyo', open: 5, close: 29, unlicensed: true, interior: 'lux', price: 1.3 }],
];
(async () => {
  const b = await chromium.launch();
  const jobs = []; configs.forEach(([name, cfg], ci) => { for (let i = 0; i < N; i++) jobs.push({ ci, name, cfg, seed: 'Z' + String(i).padStart(4, '0') }); });
  const res = configs.map(() => ({ runs: [], errors: new Set() })); let k = 0;
  async function worker(){
    const p = await b.newPage(); let cur = null;
    p.on('pageerror', (e) => { if (cur) res[cur.ci].errors.add(e.message.slice(0, 120)); });
    while (k < jobs.length){
      const j = jobs[k++]; cur = j;
      await p.goto(URL); await p.waitForFunction(() => window.__shop);
      await p.evaluate(([cfg, seed]) => __shop.start({ ...cfg, seed }), [{ ...H, ...j.cfg }, j.seed]);
      try {
        await p.waitForFunction(() => __shop.state().over && (__shop.state().over !== 'complete' || __shop.state().sale != null), null, { timeout: 120000 });
        res[j.ci].runs.push(await p.evaluate(() => { const S = __shop.state(); return { over: S.over, month: S.month, amount: S.finalAmount, peak: S.peakMonth, tax: S.taxPaid || 0, nan: [S.cash, S.finalAmount, S.sale || 0, S.debt].some((x) => typeof x !== 'number' || isNaN(x)) }; }));
      } catch (e) { res[j.ci].errors.add('timeout/stuck at month ' + (await p.evaluate(() => __shop.state().month))); }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  const med = (a) => { const z = [...a].sort((x, y) => x - y); return z.length ? z[z.length >> 1] : NaN; };
  const out = configs.map(([name], ci) => {
    const r = res[ci].runs, amt = r.map((x) => x.amount || 0);
    return { name, n: r.length, mean: Math.round(mean(amt)), median: Math.round(med(amt)), arrest: r.filter((x) => x.over === 'arrest').length, bankrupt: r.filter((x) => x.over === 'bankrupt').length, bkMonth: Math.round(mean(r.filter((x) => x.over === 'bankrupt').map((x) => x.month))), peak: Math.round(Math.max(...r.map((x) => isFinite(x.peak) ? x.peak : -1e9))), nan: r.filter((x) => x.nan).length, errors: [...res[ci].errors] };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
