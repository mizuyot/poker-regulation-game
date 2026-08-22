const STORAGE_KEY = "regulation-max-game-session";
const COUNTER_API = "https://countapi.mileshilliard.com/api/v1";
const GATES = ["gate1", "gate2", "gate3", "gate4"];

const state = {
  data: null,
  view: "intro",
  index: 0,
  answers: {},
  revealed: false,
  sessionId: getOrCreateSessionId(),
  saveJobs: [],
  stats: null,
  statsSource: null,
};

function getOrCreateSessionId() {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch (err) {
    return crypto.randomUUID();
  }
}

function resetSession() {
  state.view = "intro";
  state.index = 0;
  state.answers = {};
  state.revealed = false;
  state.saveJobs = [];
  state.stats = null;
  state.statsSource = null;
  state.sessionId = crypto.randomUUID();
  try {
    sessionStorage.setItem(STORAGE_KEY, state.sessionId);
  } catch (err) {
    /* ignore */
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function choiceText(question, choiceId) {
  const found = question.choices.find((choice) => choice.id === choiceId);
  return found ? found.text : "";
}

function currentQuestion() {
  return state.data.questions[state.index];
}

function progressRatio() {
  if (state.view === "intro") return 0;
  if (state.view === "finale") return 1;
  return state.index / state.data.questions.length;
}

function updateProgress() {
  const bar = document.getElementById("progress-bar");
  bar.style.width = `${Math.round(progressRatio() * 100)}%`;
}

function gateState() {
  const result = { gate1: false, gate2: false, gate3: false, gate4: false };
  GATES.forEach((gate) => {
    const qs = state.data.questions.filter((q) => q.section === gate);
    result[gate] = qs.length > 0 && qs.every((q) => Boolean(state.answers[q.id]));
  });
  if (state.view === "finale") {
    GATES.forEach((gate) => {
      result[gate] = true;
    });
  }
  return result;
}

function compareSummary() {
  const compareQs = state.data.questions.filter((q) => q.mode === "compare");
  const same = [];
  const split = [];
  compareQs.forEach((q) => {
    if (state.answers[q.id] === q.designerChoice) same.push(q);
    else split.push(q);
  });
  return { same, split, total: compareQs.length };
}

function renderFooter() {
  const meta = state.data.meta;
  document.getElementById("footer-disclaimer").textContent = meta.legalNote;
  document.getElementById("footer-data").textContent = meta.distributionPromise;
  document.getElementById("footer-privacy").textContent =
    `保存するのは ${meta.privacy.stored.join("、")} のみ。${meta.privacy.notStored.join("・")}は取得しません。保持期間は${meta.privacy.retention}。`;
}

function render() {
  const app = document.getElementById("app");
  updateProgress();
  if (state.view === "intro") {
    app.innerHTML = renderIntro();
    document.getElementById("start-btn").addEventListener("click", () => {
      state.view = "question";
      state.index = 0;
      state.revealed = false;
      render();
    });
    return;
  }
  if (state.view === "finale") {
    app.innerHTML = renderFinale();
    const restart = document.getElementById("restart-btn");
    if (restart) {
      restart.addEventListener("click", () => {
        resetSession();
        render();
      });
    }
    const share = document.getElementById("share-x-btn");
    if (share) share.addEventListener("click", shareOnX);
    return;
  }
  app.innerHTML = renderPlay();
  bindQuestion();
}

function renderIntro() {
  const intro = state.data.intro;
  const meta = state.data.meta;
  const gates = (intro.gates || [])
    .map(
      (gate) => `
        <article class="axis-card">
          <h3>${escapeHtml(gate.label)}</h3>
          <p class="axis-law">${escapeHtml(gate.law)}</p>
          <p>${escapeHtml(gate.asks)}</p>
        </article>`
    )
    .join("");
  const body = intro.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return `
    <p class="kicker">${escapeHtml(intro.kicker)}</p>
    <h1>${escapeHtml(meta.title)}<br /><span style="font-size:0.62em;color:var(--muted)">${escapeHtml(meta.subtitle)}</span></h1>
    <p class="lead">${escapeHtml(intro.lead)}</p>
    <div class="prose">${body}</div>
    <p class="lead">${escapeHtml(intro.gatesLead)}</p>
    <div class="axes">${gates}</div>
    <p class="note">${escapeHtml(intro.close)}</p>
    <p class="note">${escapeHtml(meta.disclaimer)} ${escapeHtml(meta.legalNote)}</p>
    <div class="actions">
      <button class="primary" id="start-btn" type="button">始める</button>
    </div>
  `;
}

function renderPlay() {
  return `
    <div class="play-layout">
      <div class="play-main">${renderQuestion()}</div>
      <aside class="blueprint-panel">${renderBlueprint()}</aside>
    </div>
  `;
}

function renderQuestion() {
  const question = currentQuestion();
  const total = state.data.questions.length;
  const section = state.data.sections[question.section];
  const showSectionLead =
    state.index === 0 ||
    question.section !== state.data.questions[state.index - 1].section;
  const selected = state.answers[question.id];
  const designer = question.designerChoice;
  const choices = question.choices
    .map((choice) => {
      let dataState = "";
      if (state.revealed && selected === choice.id) dataState = "selected";
      if (state.revealed && question.mode === "compare" && choice.id === designer) {
        dataState = dataState || "designer";
      }
      return `
        <button
          class="choice"
          type="button"
          data-choice="${escapeHtml(choice.id)}"
          data-state="${dataState}"
          ${state.revealed ? "disabled" : ""}
        >${escapeHtml(choice.text)}</button>`;
    })
    .join("");

  let followup = "";
  if (state.revealed) {
    if (question.mode === "compare") {
      const same = selected === designer;
      followup = `
        <section class="compare" aria-live="polite">
          <p class="compare-label">比較</p>
          <p class="compare-result ${same ? "same" : "split"}">${
            same ? "同じ考えでした" : "考えが分かれました"
          }</p>
          <p>設計者の選択：${escapeHtml(choiceText(question, designer))}</p>
        </section>`;
    } else {
      followup = `
        <section class="survey-note" aria-live="polite">
          <p class="compare-label">アンケート</p>
          <p>この問いに比較はありません。規模の理想に、法的な正誤はないためです。</p>
        </section>`;
    }
    followup += `
      <section class="explanation">
        <p class="disclaimer">${escapeHtml(state.data.meta.disclaimer)}</p>
        <p><strong>設計者の考え方</strong></p>
        <p>${escapeHtml(question.explanation)}</p>
      </section>`;
  }

  const nextLabel = state.index === total - 1 ? "まとめを見る" : "次へ";
  return `
    ${
      showSectionLead
        ? `<p class="kicker">${escapeHtml(section.title)}</p><p class="lead">${escapeHtml(section.lead)}</p>`
        : ""
    }
    <div class="meta-row">
      <span>${String(state.index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span>
      <span>${escapeHtml(question.axisLabel)}</span>
    </div>
    <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
    <div class="choices">${choices}</div>
    ${followup}
    <div class="actions">
      <button class="primary" id="next-btn" type="button" ${state.revealed ? "" : "disabled"}>${nextLabel}</button>
    </div>
  `;
}

function blueprintClassList(gates) {
  return GATES.filter((gate) => gates[gate])
    .map((gate) => `is-${gate}`)
    .join(" ");
}

function renderBlueprint(options) {
  const complete = Boolean(options && options.complete);
  const gates = complete
    ? { gate1: true, gate2: true, gate3: true, gate4: true }
    : gateState();
  const heading = complete ? "これが、今の法律の枠組みで作れる形" : "大会の設計図";
  return `
    <p class="blueprint-kicker">${escapeHtml(heading)}</p>
    <p class="blueprint-note">図は設計者の設計です。関門を考え終えると、構造が組み上がります。</p>
    <svg class="blueprint ${blueprintClassList(gates)}" viewBox="0 0 360 620" role="img" aria-label="大会の設計図">
      <g class="part part-gate1">
        <rect class="node" x="16" y="16" width="110" height="44" rx="4"></rect>
        <text x="71" y="43" text-anchor="middle">参加者</text>
        <path class="flow" d="M71 60 v28"></path>
        <text class="label" x="118" y="78">参加費</text>
        <rect class="node" x="16" y="92" width="110" height="44" rx="4"></rect>
        <text x="71" y="119" text-anchor="middle">運営費</text>
        <path class="blocked" d="M126 38 H210"></path>
        <path class="block-x" d="M160 28 l20 20 M180 28 l-20 20"></path>
        <text class="label blocked-label" x="168" y="22">遮断</text>
        <rect class="node prize" x="210" y="16" width="134" height="44" rx="4"></rect>
        <text x="277" y="43" text-anchor="middle">賞金プール</text>
        <path class="flow" d="M277 60 v118"></path>
        <rect class="node" x="210" y="182" width="134" height="44" rx="4"></rect>
        <text x="277" y="209" text-anchor="middle">入賞者</text>
      </g>
      <g class="part part-gate2">
        <rect class="node sponsor" x="16" y="250" width="328" height="52" rx="4"></rect>
        <text x="180" y="272" text-anchor="middle">全国のアミューズ店舗（分散スポンサー）</text>
        <text class="label" x="180" y="292" text-anchor="middle">スポンサー料</text>
        <path class="flow" d="M277 250 V60"></path>
        <path class="flow return" d="M40 302 v48 H277 v-48"></path>
        <text class="label" x="158" y="338" text-anchor="middle">広告掲出・優先権（価値は小さく保つ）</text>
      </g>
      <g class="part part-gate3">
        <rect class="node venue" x="16" y="390" width="200" height="52" rx="4"></rect>
        <text x="116" y="413" text-anchor="middle">会場：許可店の外</text>
        <text class="label" x="116" y="431" text-anchor="middle">独立会場</text>
        <rect class="node cal" x="232" y="390" width="112" height="52" rx="4"></rect>
        <text x="288" y="413" text-anchor="middle">年2回</text>
        <text class="label" x="288" y="431" text-anchor="middle">事業上の判断</text>
      </g>
      <g class="part part-gate4">
        <rect class="node ledger" x="16" y="470" width="328" height="56" rx="4"></rect>
        <text x="180" y="494" text-anchor="middle">記録・証憑</text>
        <text class="label" x="180" y="512" text-anchor="middle">契約書 / 資金フロー</text>
      </g>
    </svg>
  `;
}

function bindQuestion() {
  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => onChoose(button.dataset.choice));
  });
  const next = document.getElementById("next-btn");
  next.addEventListener("click", onNext);
}

function onChoose(choiceId) {
  if (state.revealed) return;
  const question = currentQuestion();
  state.answers[question.id] = choiceId;
  state.revealed = true;
  const isMatch =
    question.mode === "compare" ? choiceId === question.designerChoice : null;
  saveAnswer({
    session_id: state.sessionId,
    question_id: question.id,
    selected: choiceId,
    is_match: isMatch,
    timestamp: new Date().toISOString(),
  });
  render();
}

async function onNext() {
  if (!state.revealed) return;
  if (state.index >= state.data.questions.length - 1) {
    await showFinale();
    return;
  }
  state.index += 1;
  state.revealed = Boolean(state.answers[currentQuestion().id]);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function counterKey(questionId, choiceId) {
  const prefix = state.data.meta.counterPrefix || "kop-regmax";
  return `${prefix}-${questionId}-${choiceId}`;
}

function saveAnswer(payload) {
  const job = Promise.all([
    fetch("api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn("answer save failed", err);
    }),
    fetch(`${COUNTER_API}/hit/${encodeURIComponent(counterKey(payload.question_id, payload.selected))}`).catch(
      (err) => {
        console.warn("counter hit failed", err);
      }
    ),
  ]);
  state.saveJobs.push(job);
}

async function showFinale() {
  state.view = "finale";
  state.stats = null;
  state.statsSource = "loading";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  await Promise.all(state.saveJobs);
  const loaded = await loadStats();
  state.stats = loaded.stats;
  state.statsSource = loaded.source;
  render();
}

function emptyStats() {
  const questions = {};
  state.data.questions.forEach((question) => {
    const counts = {};
    question.choices.forEach((choice) => {
      counts[choice.id] = 0;
    });
    questions[question.id] = { total: 0, counts, rates: {} };
  });
  return { sessions: 0, questions };
}

function statsFromSession() {
  const stats = emptyStats();
  Object.entries(state.answers).forEach(([qid, selected]) => {
    if (!stats.questions[qid] || !(selected in stats.questions[qid].counts)) return;
    stats.questions[qid].counts[selected] += 1;
    stats.questions[qid].total += 1;
  });
  Object.values(stats.questions).forEach((item) => {
    item.rates = {};
    Object.keys(item.counts).forEach((cid) => {
      item.rates[cid] = item.total ? item.counts[cid] / item.total : 0;
    });
  });
  stats.sessions = 1;
  return stats;
}

function withRates(stats) {
  Object.values(stats.questions || {}).forEach((item) => {
    item.rates = item.rates || {};
    Object.keys(item.counts || {}).forEach((cid) => {
      item.rates[cid] = item.total ? item.counts[cid] / item.total : 0;
    });
  });
  return stats;
}

async function fetchLocalStats() {
  const response = await fetch("api/stats");
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || !data.ok || !data.questions) return null;
  if (!data.sessions) return null;
  return withRates({ sessions: data.sessions, questions: data.questions });
}

async function fetchPublicStats() {
  const stats = emptyStats();
  const jobs = [];
  state.data.questions.forEach((question) => {
    question.choices.forEach((choice) => {
      jobs.push(
        fetch(`${COUNTER_API}/get/${encodeURIComponent(counterKey(question.id, choice.id))}`)
          .then(async (response) => {
            if (response.status === 404) return 0;
            if (!response.ok) return 0;
            const data = await response.json();
            return Number(data.value) || 0;
          })
          .then((value) => {
            stats.questions[question.id].counts[choice.id] = value;
          })
          .catch(() => {})
      );
    });
  });
  await Promise.all(jobs);
  let maxTotal = 0;
  Object.values(stats.questions).forEach((item) => {
    item.total = Object.values(item.counts).reduce((sum, value) => sum + value, 0);
    maxTotal = Math.max(maxTotal, item.total);
    item.rates = {};
    Object.keys(item.counts).forEach((cid) => {
      item.rates[cid] = item.total ? item.counts[cid] / item.total : 0;
    });
  });
  stats.sessions = maxTotal;
  return maxTotal > 0 ? stats : null;
}

async function loadStats() {
  const [localResult, publicResult] = await Promise.allSettled([
    fetchLocalStats(),
    fetchPublicStats(),
  ]);
  const local = localResult.status === "fulfilled" ? localResult.value : null;
  const pub = publicResult.status === "fulfilled" ? publicResult.value : null;
  if (pub) return { stats: pub, source: "public" };
  if (local) return { stats: local, source: "local" };
  return { stats: statsFromSession(), source: "session" };
}

function shareOnX() {
  const text = state.data.meta.shareText || state.data.meta.title;
  const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function percentLabel(rate) {
  return `${Math.round((rate || 0) * 100)}%`;
}

function renderCompareSummary() {
  const summary = compareSummary();
  const splits =
    summary.split.length === 0
      ? "<p>今回、考えが分かれた設問はありませんでした。</p>"
      : `<ul class="split-list">${summary.split
          .map((q) => `<li>${escapeHtml(q.prompt)}</li>`)
          .join("")}</ul>`;
  return `
    <div class="finale-block">
      <h2>比較サマリ</h2>
      <p>設計者と同じ考えだった設問は ${summary.total} 問中 ${summary.same.length} 問。考えが分かれたのは ${summary.split.length} 問です。</p>
      ${splits}
    </div>
  `;
}

function renderStats() {
  if (state.statsSource === "loading" || !state.stats) {
    return `<p class="lead">集計しています…</p>`;
  }
  const stats = state.stats;
  const note =
    state.statsSource === "session"
      ? "全体の集計に届かなかったため、今回の回答のみを表示しています。"
      : `匿名の回答 ${stats.sessions} 件をもとに、各選択肢が選ばれた割合です。`;
  const blocks = state.data.questions
    .map((question, index) => {
      const item = stats.questions[question.id] || { total: 0, counts: {}, rates: {} };
      const rows = question.choices
        .map((choice) => {
          const rate = (item.rates && item.rates[choice.id]) || 0;
          const count = (item.counts && item.counts[choice.id]) || 0;
          const badges = [];
          if (state.answers[question.id] === choice.id) badges.push("あなた");
          if (question.mode === "compare" && question.designerChoice === choice.id) {
            badges.push("設計者");
          }
          return `
            <div class="stat-row">
              <div class="stat-head">
                <span>${escapeHtml(choice.text)}</span>
                <span class="stat-pct">${percentLabel(rate)}　${count}件</span>
              </div>
              <div class="stat-track" aria-hidden="true">
                <div class="stat-fill" style="width:${Math.round(rate * 100)}%"></div>
              </div>
              ${
                badges.length
                  ? `<p class="stat-badges">${badges.map((b) => `<span>${escapeHtml(b)}</span>`).join("")}</p>`
                  : ""
              }
            </div>`;
        })
        .join("");
      return `
        <article class="stat-card">
          <h3><span>${String(index + 1).padStart(2, "0")}</span> ${escapeHtml(question.prompt)}</h3>
          ${rows}
        </article>`;
    })
    .join("");
  return `
    <p class="lead">${escapeHtml(note)}</p>
    <div class="stats">${blocks}</div>
  `;
}

function renderFinale() {
  const finale = state.data.finale;
  return `
    <p class="kicker">最終画面</p>
    <h1>${escapeHtml(finale.title)}</h1>
    <div class="finale-blueprint">
      ${renderBlueprint({ complete: true })}
    </div>
    ${renderCompareSummary()}
    <div class="finale-block">
      <h2>分布の公開</h2>
      <p class="note">${escapeHtml(finale.distributionPromise)}</p>
      ${renderStats()}
    </div>
    <p class="note">${escapeHtml(finale.disclaimer)}</p>
    <div class="actions">
      <button class="primary" id="restart-btn" type="button">もう一度最初から</button>
      <button class="ghost" id="share-x-btn" type="button">Xで広める</button>
    </div>
  `;
}

async function boot() {
  const app = document.getElementById("app");
  try {
    const response = await fetch("questions.json");
    if (!response.ok) throw new Error("failed to load questions");
    state.data = await response.json();
    document.title = `${state.data.meta.title} — ${state.data.meta.subtitle}`;
    const brand = document.querySelector(".brand");
    const brandSub = document.querySelector(".brand-sub");
    if (brand) brand.textContent = state.data.meta.title;
    if (brandSub) brandSub.textContent = state.data.meta.subtitle;
    renderFooter();
    render();
  } catch (err) {
    app.innerHTML = `<p class="error">設問データを読み込めませんでした。python3 server.py で起動してください。</p>`;
  }
}

boot();
