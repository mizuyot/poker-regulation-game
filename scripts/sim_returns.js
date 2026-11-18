// 戦略別の、各年の手取り・累計の手取り・売却まで入れたトータルリターン（scripts/sim_annual.js と同じ自動プレイ）
// 使い方: node scripts/sim_returns.js [各戦略の回数=40]
// 定義（単位は万円、数値はすべてゲームの架空値。税金（法人税など）は引いた後）
//   開業時の手元資金 = 5,000万円 − 初期投資 − 許可の申請費
//   各年末の手元資金 = 生きていればその年末の値。摘発された回はその時点の手元資金のまま（稼いだお金は残る）。倒産した回は0
//   年間の手取り     = その年末の手元資金 − 前の年末（開業時から）。全回の平均
//   累計の手取り     = その年末の手元資金 − 開業時の手元資金。全回の平均
//   トータルリターン = その年末に売った場合の 手元資金＋売却額−借入 − 元手5,000万円。
//                      すでに摘発されていれば摘発時の最終手取り額。5年目は実際の結果
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
      const r = await p.evaluate(() => { const S = __shop.state(); return { over: S.over, month: S.month, cash0: window.__cash0, cashEnd: S.cash, debtEnd: S.debt, sale5: S.sale || 0, tax: S.taxPaid || 0, finalAmount: S.finalAmount || 0, fine: S.penalty ? S.penalty.total : 0, prison: S.penalty ? S.penalty.prisonMonths : 0, snap: window.__snap }; });
      (res[j.st.name] ||= []).push(r);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  const out = {};
  for (const st of strategies){
    const runs = res[st.name], rows = [];
    // y年目末の状態：{ cash, amount }。amount＝その年末に売った場合の手取り
    const at = (r, y) => {
      if (y === 0) return { cash: r.cash0, amount: r.cash0 };
      const endY = Math.ceil(r.month / 12);
      if (r.over === 'complete' && y === 5) return { cash: r.cashEnd, amount: r.cashEnd + r.sale5 - r.debtEnd, alive: true };
      if (y < 5 && r.snap[y]) { const s = r.snap[y]; return { cash: s.cash, amount: s.amount, alive: true }; }
      if (r.over === 'arrest') return { cash: r.cashEnd, amount: r.finalAmount };
      return { cash: 0, amount: 0 }; // 倒産
    };
    for (let y = 1; y <= 5; y++){
      const alive = runs.filter((r) => at(r, y).alive).length;
      rows.push({ year: y, alive, annual: Math.round(mean(runs.map((r) => at(r, y).cash - at(r, y - 1).cash))), cumulative: Math.round(mean(runs.map((r) => at(r, y).cash - r.cash0))), totalReturn: Math.round(mean(runs.map((r) => at(r, y).amount - FUND))), roi: Math.round(mean(runs.map((r) => at(r, y).amount - FUND)) / FUND * 100) });
    }
    out[st.name] = { n: runs.length, cash0: Math.round(mean(runs.map((r) => r.cash0))), arrested: runs.filter((r) => r.over === 'arrest').length, bankrupt: runs.filter((r) => r.over === 'bankrupt').length, tax: Math.round(mean(runs.map((r) => r.tax))), penalty: Math.round(mean(runs.filter((r) => r.over === 'arrest').map((r) => r.fine))), prisonMonths: +mean(runs.filter((r) => r.over === 'arrest' && r.prison).map((r) => r.prison)).toFixed(1), rows };
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
