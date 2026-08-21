const STORAGE_KEY = "regulation-max-game-session";

const state = {
  data: null,
  view: "intro",
  index: 0,
  answers: {},
  revealed: false,
  sessionId: getOrCreateSessionId(),
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

function onNext() {
  if (!state.revealed) return;
  if (state.index >= state.data.questions.length - 1) {
    state.view = "finale";
    render();
    return;
  }
  state.index += 1;
  state.revealed = Boolean(state.answers[currentQuestion().id]);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveAnswer(payload) {
  try {
    await fetch("api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("answer save failed", err);
  }
}

function shareOnX() {
  const text = state.data.meta.shareText || state.data.meta.title;
  const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
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
