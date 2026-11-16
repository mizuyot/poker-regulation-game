// 戦略別の、各年の手取り・累計の手取り・売却まで入れたトータルリターン（scripts/sim_annual.js と同じ自動プレイ）
// 使い方: node scripts/sim_returns.js [各戦略の回数=40]
// 定義（単位は万円、数値はすべてゲームの架空値）
//   開業時の手元資金 = 5,000万円 − 初期投資 − 許可の申請費
//   年間の手取り     = その年末の手元資金 − 前の年末の手元資金（開業時から）。借入は使わない戦略なので手元資金の増減＝手取り
//   累計の手取り     = その年末の手元資金 − 開業時の手元資金
//   トータルリターン = その年末に売った場合の 手元資金＋売却額−借入 − 元手5,000万円（買収前調査での摘発の確率を期待値に入れる）
//   5年目は実際の結果（5年目の売却）。摘発・倒産した回は、その年以降を「手取り0（元手は全損）」として数える
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '../docs/shop/index.html') + '?test=1';
const N = +process.argv[2] || 40, FUND = 5000;
const strategies = [
  { name: '健全（預入のみ）', style: 'deposit' },
  { name: '黒（換金あり）', style: 'cashout' },
  { name: 'グレー（チケット・コイン）', style: 'token' },
  { name: 'グレー（商品）', style: 'prize' },
  { name: 'グレー（店内飲食割引）', style: 'food' },
];
(async () => {
  const b = await chromium.launch();
  const jobs = []; for (const st of strategies) for (let i = 0; i < N; i++) jobs.push({ st, seed: 'Y' + String(i).padStart(4, '0') });
  const res = {}; let k = 0;
  async function worker(){
    const p = await b.newPage();
    while (k < jobs.length){
      const j = jobs[k++];
      await p.goto(URL); await p.waitForFunction(() => window.__shop);
      await p.evaluate(([st, seed]) => {
        window.__snap = {};
        window.__onMonth = (S) => { if (S.month % 12 === 0 && S.month < 60) window.__snap[S.month / 12] = __shop.sellNow(); };
        __shop.start({ loc: 'metro', tables: 5, style: st.style, seed });
        window.__cash0 = __shop.state().cash;
      }, [j.st, j.seed]);
      await p.waitForFunction(() => __shop.state().over && (__shop.state().over !== 'complete' || __shop.state().sale != null), null, { timeout: 180000 });
      const r = await p.evaluate(() => { const S = __shop.state(); return { over: S.over, month: S.month, cash0: window.__cash0, cash5: S.cash, sale5: S.sale || 0, debt5: S.debt, snap: window.__snap }; });
      (res[j.st.name] ||= []).push(r);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  const out = {};
  for (const st of strategies){
    const runs = res[st.name], rows = [];
    for (let y = 1; y <= 5; y++){
      // y年目末の手元資金（生きている回だけ）と、売った場合の手取り
      const at = (r, yy) => yy === 0 ? { cash: r.cash0 } : yy < 5 ? (r.snap[yy] ? { cash: r.snap[yy].cash, amount: Math.max(0, r.snap[yy].amount) * (1 - r.snap[yy].arrestP) } : null) : (r.over === 'complete' ? { cash: r.cash5, amount: r.cash5 + r.sale5 - r.debt5 } : null);
      const alive = runs.filter((r) => at(r, y));
      const annual = alive.map((r) => at(r, y).cash - at(r, y - 1).cash);
      const cum = alive.map((r) => at(r, y).cash - r.cash0);
      const total = runs.map((r) => (at(r, y) ? at(r, y).amount : 0) - FUND);
      rows.push({ year: y, alive: alive.length, annual: Math.round(mean(annual)), cumulative: Math.round(mean(cum)), totalReturn: Math.round(mean(total)), roi: Math.round(mean(total) / FUND * 100) });
    }
    out[st.name] = { n: runs.length, cash0: Math.round(mean(runs.map((r) => r.cash0))), rows };
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
