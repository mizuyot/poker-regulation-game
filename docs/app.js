const COUNTER_API = "https://countapi.mileshilliard.com/api/v1";
const HURDLES = ["hurdle1", "hurdle2", "hurdle3", "hurdle4"];
const DESIGN_IDS = ["q01", "d1", "d2", "d3"];

const state = {
  data: null,
  view: "intro",
  index: 0,
  answers: {},
  revealed: false,
  sessionId: crypto.randomUUID(),
  saveJobs: [],
  stats: null,
  statsSource: null,
};

function resetSession() {
  state.view = "intro";
  state.index = 0;
  state.answers = {};
  state.revealed = false;
  state.saveJobs = [];
  state.stats = null;
  state.statsSource = null;
  state.sessionId = crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function questionById(id) {
  return state.data.questions.find((question) => question.id === id);
}

function choiceText(question, choiceId) {
  if (!question) return "";
  const found = question.choices.find((choice) => choice.id === choiceId);
  return found ? found.text : "";
}

function selectedLabel(id) {
  const question = questionById(id);
  return choiceText(question, state.answers[id]);
}

function currentQuestion() {
  return state.data.questions[state.index];
}

function progressRatio() {
  if (state.view === "intro") return 0;
  if (state.view === "finale") return 1;
  const total = state.data.questions.length + 2;
  if (state.view === "designSheet") return DESIGN_IDS.length / total;
  if (state.view === "hurdleMap") return (indexOfId("q00") + 1) / total;
  return (state.index + 1) / total;
}

function updateProgress() {
  const bar = document.getElementById("progress-bar");
  bar.style.width = `${Math.round(progressRatio() * 100)}%`;
}

function interpolate(template) {
  return String(template || "").replace(/\{\{(q01|d[1-3])\}\}/g, (_, id) => selectedLabel(id) || "（未選択）");
}

function fundingLeadKey() {
  const selected = state.answers.d3;
  if (selected === "1") return "fullReturn";
  if (selected === "3") return "separated";
  return "unseparated";
}

function sectionLeadText(section, sectionId) {
  if (!section) return "";
  if (sectionId === "hurdle1" && section.leadByFunding) {
    return interpolate(section.leadByFunding[fundingLeadKey()]);
  }
  return interpolate(section.lead);
}

function indexOfId(id) {
  return state.data.questions.findIndex((question) => question.id === id);
}

function isLastDesignQuestion(question) {
  return question && question.id === DESIGN_IDS[DESIGN_IDS.length - 1];
}

function hurdleQuestions(sectionId) {
  return state.data.questions.filter((question) => question.section === sectionId);
}

function hurdleComplete(sectionId) {
  const qs = hurdleQuestions(sectionId);
  return qs.length > 0 && qs.every((question) => Boolean(state.answers[question.id]));
}

function isLastInHurdle(question) {
  if (!HURDLES.includes(question.section)) return false;
  const qs = hurdleQuestions(question.section);
  return qs[qs.length - 1].id === question.id;
}

function hurdleState() {
  const result = { hurdle1: false, hurdle2: false, hurdle3: false, hurdle4: false };
  HURDLES.forEach((hurdle) => {
    result[hurdle] = hurdleComplete(hurdle);
  });
  if (state.view === "finale") {
    HURDLES.forEach((hurdle) => {
      result[hurdle] = true;
    });
  }
  return result;
}

function scaleValue(id) {
  const selected = state.answers[id];
  if (!selected) return null;
  const value = Number(selected);
  return Number.isFinite(value) ? value : null;
}

function qualitativeCompare() {
  const scale = scaleValue("d1");
  const prize = scaleValue("d2");
  if (scale == null || prize == null) return "";
  if (prize > scale) return "賞金の規模感は、大会の規模を大きく上回りそう";
  if (prize < scale) return "賞金の規模感は、大会の規模を下回りそう";
  return "賞金の規模感は、大会の規模と同じくらいになりそう";
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
    `保存するのはセッションID・設問ID・選択肢・時刻のみ。${meta.privacy.notStored.join("・")}は取得しません。保持期間は${meta.privacy.retention}。`;
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
  if (state.view === "designSheet") {
    app.innerHTML = renderDesignReveal();
    document.getElementById("continue-btn").addEventListener("click", () => {
      state.view = "question";
      state.index = indexOfId("q00");
      state.revealed = Boolean(state.answers.q00);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return;
  }
  if (state.view === "hurdleMap") {
    app.innerHTML = renderHurdleMapPage();
    document.getElementById("continue-btn").addEventListener("click", () => {
      state.view = "question";
      state.index = indexOfId("q18");
      state.revealed = Boolean(state.answers.q18);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
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
  const body = intro.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return `
    <p class="kicker">${escapeHtml(intro.kicker)}</p>
    <h1>${escapeHtml(meta.title)}<br /><span style="font-size:0.62em;color:var(--muted)">${escapeHtml(meta.subtitle)}</span></h1>
    <p class="lead">${escapeHtml(intro.lead)}</p>
    <div class="prose">${body}</div>
    <p class="note">${escapeHtml(intro.close)}</p>
    <div class="actions">
      <button class="primary" id="start-btn" type="button">始める</button>
    </div>
  `;
}

function renderPlay() {
  const showMap = HURDLES.includes(currentQuestion().section);
  return `
    <div class="play-layout">
      <div class="play-main">${renderQuestion()}</div>
      <aside class="sheet-panel-wrap">
        ${renderPlayerSheet()}
        ${showMap ? renderHurdleMapCompact() : ""}
      </aside>
    </div>
  `;
}

function renderParagraphs(text) {
  return String(text || "")
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
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
  if (state.revealed && question.mode === "compare") {
    const same = selected === designer;
    followup = `
      <section class="compare" aria-live="polite">
        <p class="compare-label">比較</p>
        <p class="compare-result ${same ? "same" : "split"}">${
          same ? "同じ考えでした" : "考えが分かれました"
        }</p>
        <p>設計者の選択：${escapeHtml(choiceText(question, designer))}</p>
      </section>
      <section class="explanation">
        <p class="disclaimer">${escapeHtml(state.data.meta.disclaimer)}</p>
        <p><strong>設計者の考え方</strong></p>
        ${renderParagraphs(question.explanation)}
      </section>`;
  }

  if (state.revealed && isLastInHurdle(question) && hurdleComplete(question.section)) {
    const hurdle = state.data.sections[question.section];
    followup += `
      <section class="fun-payoff" aria-live="polite">
        <p class="compare-label">この制約が生む面白さ</p>
        <p>${escapeHtml(hurdle.funPayoff)}</p>
      </section>
      <div class="inline-blueprint">${renderBlueprint()}</div>`;
  }

  const nextLabel = isLastDesignQuestion(question)
    ? "あなたの大会を見る"
    : question.id === "q00"
      ? "ハードルを見る"
      : state.index === total - 1
        ? "まとめを見る"
        : "次へ";
  const lead = showSectionLead
    ? `<p class="kicker">${escapeHtml(section.title)}</p><p class="lead">${escapeHtml(sectionLeadText(section, question.section))}</p>`
    : "";
  return `
    ${lead}
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

function renderSheetCards(ids, heading) {
  const cards = ids
    .map((id) => {
      const question = questionById(id);
      const label = selectedLabel(id);
      if (!question || !label) return "";
      const title = question.sheetLabel || question.axisLabel;
      return `
        <article class="sheet-card">
          <p class="sheet-kicker">${escapeHtml(title)}</p>
          <p class="sheet-value">${escapeHtml(label)}</p>
        </article>`;
    })
    .join("");
  if (!cards) return "";
  return `<p class="sheet-heading">${escapeHtml(heading)}</p><div class="sheet-cards">${cards}</div>`;
}

function renderPlayerSheet() {
  const compare = qualitativeCompare();
  const hurdleIds = state.data.questions.filter((q) => HURDLES.includes(q.section)).map((q) => q.id);
  return `
    <details class="sheet-panel" open>
      <summary>あなたの大会</summary>
      ${renderSheetCards(DESIGN_IDS, "Part 1")}
      ${compare ? `<p class="sheet-compare">${escapeHtml(compare)}</p>` : ""}
      ${renderSheetCards(hurdleIds, "Part 2の解決")}
    </details>
  `;
}

function hurdleItemState(hurdleId) {
  if (hurdleComplete(hurdleId) || state.view === "finale") return "cleared";
  if (state.view === "hurdleMap") return hurdleId === "hurdle1" ? "current" : "locked";
  const current = state.view === "question" ? currentQuestion() : null;
  if (current && current.section === hurdleId) return "current";
  const currentIndex = current ? HURDLES.indexOf(current.section) : -1;
  const thisIndex = HURDLES.indexOf(hurdleId);
  if (currentIndex >= 0 && thisIndex < currentIndex) return "cleared";
  return "locked";
}

function renderHurdleMapList() {
  return HURDLES.map((id) => {
    const section = state.data.sections[id];
    const status = hurdleItemState(id);
    const mark = status === "cleared" ? "解錠" : status === "current" ? "いま" : "未解錠";
    const lock = status === "locked" ? "🔒" : status === "cleared" ? "🔓" : "▶";
    return `
      <article class="hurdle-map-item is-${status}">
        <span class="hurdle-map-lock" aria-hidden="true">${lock}</span>
        <div>
          <p class="hurdle-map-status">${mark}</p>
          <h3>${escapeHtml(section.title)}</h3>
        </div>
      </article>`;
  }).join("");
}

function renderHurdleMapCompact() {
  const map = state.data.hurdleMap || {};
  return `
    <div class="hurdle-map compact">
      <p class="sheet-heading">${escapeHtml(map.preface || "この4つを越えてきた。")}</p>
      ${renderHurdleMapList()}
    </div>
  `;
}

function renderDesignReveal() {
  const reveal = state.data.designReveal || {};
  return `
    <div class="play-layout">
      <div class="play-main">
        <p class="kicker">${escapeHtml(reveal.kicker || "Part 1")}</p>
        <h1>${escapeHtml(reveal.title || "あなたの大会")}</h1>
        <p class="lead">${escapeHtml(reveal.lead || "")}</p>
        <div class="actions">
          <button class="primary" id="continue-btn" type="button">${escapeHtml(reveal.continueLabel || "次へ")}</button>
        </div>
      </div>
      <aside class="sheet-panel-wrap">${renderPlayerSheet()}</aside>
    </div>
  `;
}

function renderHurdleMapPage() {
  const map = state.data.hurdleMap || {};
  return `
    <p class="kicker">${escapeHtml(map.kicker || "Part 2")}</p>
    <p class="lead">${escapeHtml(map.preface)}</p>
    <div class="hurdle-map page">${renderHurdleMapList()}</div>
    <div class="actions">
      <button class="primary" id="continue-btn" type="button">${escapeHtml(map.continueLabel || "最初のハードルへ")}</button>
    </div>
  `;
}

function partClass(hurdle, revealed) {
  return revealed[hurdle] ? "part revealed" : "part locked";
}

function renderBlueprint(options) {
  const complete = Boolean(options && options.complete);
  const revealed = complete
    ? { hurdle1: true, hurdle2: true, hurdle3: true, hurdle4: true }
    : hurdleState();
  const heading = complete ? "設計者の大会" : "設計者の設計図";
  const note = complete
    ? state.data.finale.diagramNote
    : "図は設計者の設計です。ハードルを考え終えると、構造が組み上がります。";
  return `
    <p class="blueprint-kicker">${escapeHtml(heading)}</p>
    <p class="blueprint-note">${escapeHtml(note)}</p>
    <svg class="blueprint" viewBox="0 0 360 620" role="img" aria-label="設計者の大会設計図">
      <g class="${partClass("hurdle1", revealed)} part-hurdle1">
        <rect class="node" x="16" y="16" width="110" height="44" rx="4"></rect>
        <text x="71" y="43" text-anchor="middle">参加者</text>
        <path class="flow" d="M71 60 v28"></path>
        <text class="label" x="118" y="78">参加費→運営費のみ</text>
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
      <g class="${partClass("hurdle2", revealed)} part-hurdle2">
        <rect class="node sponsor" x="16" y="250" width="328" height="52" rx="4"></rect>
        <text x="180" y="272" text-anchor="middle">全国のアミューズ店舗（分散スポンサー）</text>
        <text class="label" x="180" y="292" text-anchor="middle">スポンサー料 → 賞金プール</text>
        <path class="flow" d="M277 250 V60"></path>
        <path class="flow return" d="M40 302 v48 H277 v-48"></path>
        <text class="label" x="158" y="338" text-anchor="middle">広告掲出・優先権（価値は小さく保つ）</text>
      </g>
      <g class="${partClass("hurdle3", revealed)} part-hurdle3">
        <rect class="node venue" x="16" y="390" width="200" height="52" rx="4"></rect>
        <text x="116" y="413" text-anchor="middle">会場：許可店の外</text>
        <text class="label" x="116" y="431" text-anchor="middle">独立会場</text>
        <rect class="node cal" x="232" y="390" width="112" height="52" rx="4"></rect>
        <text x="288" y="413" text-anchor="middle">年2回</text>
        <text class="label" x="288" y="431" text-anchor="middle">カレンダー</text>
      </g>
      <g class="${partClass("hurdle4", revealed)} part-hurdle4">
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
  const question = currentQuestion();
  if (isLastDesignQuestion(question)) {
    state.view = "designSheet";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (question.id === "q00") {
    state.view = "hurdleMap";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
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
  const labels = (finale.designerLabels || [])
    .map((label) => `<li>${escapeHtml(label)}</li>`)
    .join("");
  return `
    <p class="kicker">Part 3｜両立</p>
    <h1>${escapeHtml(finale.title)}</h1>
    <div class="finale-compare-grid">
      <section class="finale-side">
        ${renderPlayerSheet()}
      </section>
      <section class="finale-side">
        ${renderBlueprint({ complete: true })}
        <ul class="designer-labels">${labels}</ul>
      </section>
    </div>
    ${renderCompareSummary()}
    <div class="finale-block">
      <h2>分布の公開</h2>
      <p class="note">${escapeHtml(finale.distributionPromise)}</p>
      ${renderStats()}
    </div>
    <p class="closing">${escapeHtml(finale.closing)}</p>
    <p class="note">${escapeHtml(finale.disclaimer)}</p>
    <div class="actions">
      <button class="primary" id="restart-btn" type="button">もう一度最初から</button>
      <button class="ghost" id="share-x-btn" type="button">Xで広める</button>
    </div>
  `;
}

function questionsUrl() {
  const script = document.querySelector("script[src*='app.js']");
  const base = script && script.src ? script.src : window.location.href;
  return new URL("questions.json", base).toString();
}

function readEmbeddedQuestions() {
  const node = document.getElementById("questions-data");
  if (!node) return null;
  const raw = node.textContent.trim();
  if (!raw || raw === "{}") return null;
  return JSON.parse(raw);
}

async function loadQuestions() {
  const embedded = readEmbeddedQuestions();
  if (embedded) return embedded;
  const response = await fetch(questionsUrl(), { cache: "no-store" });
  if (!response.ok) throw new Error("failed to load questions");
  return response.json();
}

async function boot() {
  const app = document.getElementById("app");
  try {
    state.data = await loadQuestions();
    document.title = `${state.data.meta.title} — ${state.data.meta.subtitle}`;
    const brand = document.querySelector(".brand");
    const brandSub = document.querySelector(".brand-sub");
    const headerDisclaimer = document.getElementById("header-disclaimer");
    if (brand) brand.textContent = state.data.meta.title;
    if (brandSub) brandSub.textContent = state.data.meta.subtitle;
    if (headerDisclaimer) {
      headerDisclaimer.textContent =
        state.data.meta.headerDisclaimer || "このゲームは適法性の判断・法的助言ではありません。";
    }
    renderFooter();
    render();
  } catch (err) {
    app.innerHTML =
      `<p class="error">設問データを読み込めませんでした。ページを再読み込みするか、ローカルなら <code>python3 server.py</code> で開いてください。</p>`;
  }
}

boot();
