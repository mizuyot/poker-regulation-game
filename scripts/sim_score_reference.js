// 基準プレイを実行して、結果画面用の最終手取り額を検証する。
// node scripts/sim_score_reference.js
// node scripts/sim_score_reference.js --json で再計算した金額の配列を出力する。
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

const gamePath = resolve(__dirname, "../docs/shop/index.html");
const source = readFileSync(gamePath, "utf8");
const { locations, resultBenchmark } = JSON.parse(readFileSync(resolve(__dirname, "../docs/shop/shop.json"), "utf8"));
const { config, runsPerLocation, seedPrefix, values } = resultBenchmark;
const script = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const bootstrap = script?.indexOf("readColors(); buildTimeBar(); resize(); syncHUD(); openTitle();") ?? -1;
assert.ok(bootstrap >= 0, "ゲームの初期化処理が見つからない");

// ゲーム本体の計算を再利用し、画面の描画・通信・保存を省略する。
const elements = new Map();
for (const id of ["shop-data", "provisions-data"]) {
  const data = source.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`));
  assert.ok(data, `ゲーム内の設定が見つからない: ${id}`);
  elements.set(id, { textContent: data[1] });
}
const ignore = () => {};
const sandbox = vm.createContext({
  window: {},
  document: {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          classList: { remove: ignore },
          addEventListener: ignore,
          getContext: () => ({})
        });
      }
      return elements.get(id);
    }
  },
  location: { search: "?test=1" },
  URLSearchParams,
  performance: { now: () => 0 },
  matchMedia: () => ({ matches: false, addEventListener: ignore }),
  addEventListener: ignore,
  setTimeout: ignore,
  clearInterval: ignore,
  localStorage: { getItem: () => null, removeItem: ignore }
});
vm.runInContext(script.slice(0, bootstrap) + `
  note = hide = resetScene = () => {};
  show = (_, initialize) => initialize?.();
  makeShareImage = async () => "";
  loadGlobal = () => {};
  window.playReference = (config) => {
    startGame(config);
    for (let month = 0; month < M.months && !S.over; month++) {
      monthTick();
      if (S.annualReport) $("okBtn").onclick();
    }
    if (!S.over) throw new Error("基準プレイが終了しなかった");
    return { kind: S.over, amount: S.finalAmount };
  };
})();`, sandbox, { filename: gamePath });

const totals = { complete: 0, arrest: 0, bankrupt: 0 };
const actual = [];
const outputJson = process.argv.includes("--json");
if (!outputJson) assert.equal(locations.length * runsPerLocation, values.length, "基準プレイの件数が一致しない");
for (const { id } of locations) {
  for (let n = 0; n < runsPerLocation; n++) {
    const seed = seedPrefix + n.toString(36).toUpperCase().padStart(3, "0");
    const { kind, amount } = sandbox.window.playReference({ ...config, loc: id, seed });
    assert.ok(Number.isFinite(amount), `最終手取り額を取得できない: ${id}/${seed}`);
    if (!outputJson) assert.equal(amount, values[actual.length], `最終手取り額が一致しない: ${id}/${seed}`);
    totals[kind]++;
    actual.push(amount);
  }
}

if (outputJson) {
  console.log(JSON.stringify(actual, null, 2));
} else {
  console.log(JSON.stringify({ runs: actual.length, ...totals }));
}
