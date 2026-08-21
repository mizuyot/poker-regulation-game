const STORAGE_KEY = "regulation-max-game-session";
const COUNTER_API = "https://countapi.mileshilliard.com/api/v1";

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

function renderFooter() {
  const meta = state.data.meta;
  document.getElementById("footer-disclaimer").textContent = meta.legalNote;
  document.getElementById("footer-data").textContent = meta.dataNotice;
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
    document.getElementById("restart-btn").addEventListener("click", () => {
      resetSession();
      render();
    });
    document.getElementById("share-x-btn").addEventListener("click", shareOnX);
    return;
  }
  app.innerHTML = renderQuestion();
  bindQuestion();
}

function renderIntro() {
  const { intro, meta, title, subtitle } = {
    intro: state.data.intro,
    meta: state.data.meta,
    title: state.data.meta.title,
    subtitle: state.data.meta.subtitle,
  };
  const axes = intro.axes
    .map(
      (axis) => `
        <article class="axis-card">
          <h3>${escapeHtml(axis.label)}</h3>
          <p class="axis-law">${escapeHtml(axis.law)}</p>
          <p>${escapeHtml(axis.asks)}</p>
        </article>`
    )
    .join("");
  const body = intro.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return `
    <p class="kicker">${escapeHtml(intro.kicker)}</p>
    <h1>${escapeHtml(title)}<br /><span style="font-size:0.62em;color:var(--muted)">${escapeHtml(subtitle)}</span></h1>
    <p class="lead">${escapeHtml(intro.lead)}</p>
    <div class="prose">${body}</div>
    <h2>${escapeHtml(intro.axesTitle)}</h2>
    <div class="axes">${axes}</div>
    <p class="note">${escapeHtml(intro.axesNote)}</p>
    <p class="note">${escapeHtml(meta.disclaimer)} ${escapeHtml(meta.legalNote)}</p>
    <div class="actions">
      <button class="primary" id="start-btn" type="button">始める</button>
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

function renderStats() {
  if (state.statsSource === "loading" || !state.stats) {
    return `
      <div class="finale-block">
        <h2>みんなの選択</h2>
        <p class="lead">集計しています…</p>
      </div>`;
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
    <div class="finale-block">
      <h2>みんなの選択</h2>
      <p class="lead">${escapeHtml(note)}</p>
      <div class="stats">${blocks}</div>
    </div>`;
}

function renderFinale() {
  const finale = state.data.finale;
  const items = finale.principles.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <p class="kicker">最終画面</p>
    <h1>${escapeHtml(finale.title)}</h1>
    <div class="finale-block prose">
      <p>${escapeHtml(finale.background)}</p>
      <p>${escapeHtml(finale.definition)}</p>
    </div>
    ${renderStats()}
    <div class="finale-block">
      <h2>主要な設計方針</h2>
      <ul class="principles">${items}</ul>
    </div>
    <p class="note">${escapeHtml(finale.caveat)}</p>
    <p class="note">${escapeHtml(state.data.meta.disclaimer)}</p>
    <p class="note">${escapeHtml(state.data.meta.distributionPromise)}</p>
    <p class="note">${escapeHtml(state.data.meta.dataNotice)}</p>
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
    renderFooter();
    render();
  } catch (err) {
    app.innerHTML = `<p class="error">設問データを読み込めませんでした。python3 server.py で起動してください。</p>`;
  }
}

boot();
