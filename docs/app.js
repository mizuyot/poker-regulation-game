const HURDLES = ["hurdle1", "hurdle2", "hurdle3", "hurdle4"];

const state = {
  data: null,
  view: "intro",
  index: 0,
  answers: {},
  revealed: false,
  sessionId: crypto.randomUUID(),
  stats: null,
  statsSource: null,
};

function resetSession() {
  state.view = "intro";
  state.index = 0;
  state.answers = {};
  state.revealed = false;
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
  const total = state.data.questions.length + 1;
  if (state.view === "designSheet") return visibleDesignIds().length / total;
  if (state.view === "typeLaw") return indexOfId("q00") / total;
  return (state.index + 1) / total;
}

function updateProgress() {
  const bar = document.getElementById("progress-bar");
  bar.style.width = `${Math.round(progressRatio() * 100)}%`;
}

function interpolate(template) {
  return String(template || "")
    .replaceAll("{{typeName}}", typeName() || "（未選択）")
    .replace(/\{\{(q01|d[1-4])\}\}/g, (_, id) => selectedLabel(id) || "（未選択）");
}

function isNoPrize() {
  return state.answers.d3 === "4";
}

function visibleDesignIds() {
  const ids = ["q01", "d1", "d2", "d3"];
  if (state.answers.d3 && state.answers.d3 !== "4") ids.push("d4");
  return ids;
}

function typeName() {
  const funding = state.data.diagnosis && state.data.diagnosis.funding[state.answers.d3];
  return funding ? funding.name : "";
}

function diagnosisLockup() {
  const name = typeName();
  if (!name) return "";
  if (isNoPrize()) return name;
  const prize = state.data.diagnosis.prize[state.answers.d4];
  return prize ? `${name} × ${prize.name}` : name;
}

function diagnosisReady() {
  return Boolean(state.answers.d3 && (isNoPrize() || state.answers.d4));
}

function diagnosisBlurb() {
  const diag = state.data.diagnosis;
  if (!diag || !state.answers.d3) return "";
  const funding = diag.funding[state.answers.d3];
  if (!funding) return "";
  if (isNoPrize()) return funding.blurb;
  const prize = diag.prize[state.answers.d4];
  const scale = interpolate(diag.scaleLine);
  return [funding.blurb, prize ? prize.blurb : "", scale].filter(Boolean).join("");
}

function diagnosisHook() {
  const hooks = state.data.diagnosis && state.data.diagnosis.hooks;
  if (!hooks) return "";
  return isNoPrize() ? hooks.noprize : hooks.prize;
}

const LETTERS = ["A", "B", "C", "D"];
let advancing = false;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function choiceLetter(choiceId) {
  const index = Number(choiceId) - 1;
  return LETTERS[index] || String(choiceId);
}

function hurdleShortTitle(id) {
  const title = (state.data.sections[id] && state.data.sections[id].title) || "";
  return title.replace(/^ハードル\d｜/, "");
}

function hurdleIndexLabel(id) {
  return String(HURDLES.indexOf(id) + 1).padStart(2, "0");
}

function diagnosisTypeLines() {
  const name = typeName();
  if (!name) return { type: "", prize: "" };
  if (isNoPrize()) return { type: name, prize: "" };
  const prize = state.data.diagnosis.prize[state.answers.d4];
  return { type: name, prize: prize ? `× ${prize.name}` : "" };
}

function diagnosisFundingBlurb() {
  const funding = state.data.diagnosis && state.data.diagnosis.funding[state.answers.d3];
  return funding ? funding.blurb : "";
}

function diagnosisPrizeBlurb() {
  if (isNoPrize()) return "";
  const prize = state.data.diagnosis && state.data.diagnosis.prize[state.answers.d4];
  return prize ? prize.blurb : "";
}

function updateChrome() {
  document.body.classList.remove("is-intro", "is-playing", "is-diagnosis", "is-finale", "is-type-law");
  if (state.view === "intro") document.body.classList.add("is-intro");
  else if (state.view === "designSheet") document.body.classList.add("is-diagnosis");
  else if (state.view === "typeLaw") document.body.classList.add("is-playing", "is-type-law");
  else if (state.view === "finale") document.body.classList.add("is-finale");
  else document.body.classList.add("is-playing");
}

function designAnsweredCount() {
  return visibleDesignIds().filter((id) => Boolean(state.answers[id])).length;
}

function sectionLeadText(section, sectionId) {
  if (!section) return "";
  let lead = interpolate(section.lead);
  if (sectionId === "hurdle1" && section.conditionByFunding) {
    const d3 = state.answers.d3;
    let extra = "";
    if (d3 === "1" || d3 === "2") extra = section.conditionByFunding.includesEntry;
    else if (d3 === "3") extra = section.conditionByFunding.separated;
    else if (d3 === "4") extra = section.conditionByFunding.noprize;
    lead += extra;
  }
  return lead;
}

function indexOfId(id) {
  return state.data.questions.findIndex((question) => question.id === id);
}

function isLastDesignQuestion(question) {
  const seq = visibleDesignIds();
  return question && question.id === seq[seq.length - 1];
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
  document.getElementById("footer-data").textContent = meta.dataNotice;
  document.getElementById("footer-privacy").textContent = meta.privacy.retention;
}

function render() {
  const app = document.getElementById("app");
  updateChrome();
  updateProgress();
  if (
    state.view === "question" &&
    currentQuestion() &&
    currentQuestion().id === "d4" &&
    isNoPrize()
  ) {
    state.view = "designSheet";
  }
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
      state.view = "typeLaw";
      state.revealed = false;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const back = document.getElementById("back-link");
    if (back) back.addEventListener("click", goBackDesign);
    return;
  }
  if (state.view === "typeLaw") {
    app.innerHTML = renderTypeLaw();
    document.getElementById("continue-btn").addEventListener("click", () => {
      state.view = "question";
      state.index = indexOfId("q00");
      state.revealed = Boolean(state.answers.q00);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const back = document.getElementById("back-link");
    if (back) back.addEventListener("click", goBackDesign);
    bindProvisionUi();
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
  return `
    <div class="play-layout">
      <div class="play-main is-entering">${renderQuestion()}</div>
      <aside class="sheet-panel-wrap">${renderPlayerSheet()}</aside>
    </div>
    ${renderProvisionPanelShell()}
  `;
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function badgeMeta(tier) {
  if (!tier) return null;
  return (state.data.badges || {})[tier] || null;
}

function renderBadge(tier) {
  const meta = badgeMeta(tier);
  if (!meta) return "";
  return `<span class="feas-badge is-${escapeHtml(tier)}">
    <span class="feas-shape" aria-hidden="true">${escapeHtml(meta.shape)}</span>
    <span class="feas-label">${escapeHtml(meta.label)}</span>
  </span>`;
}

function renderBadgeLegend() {
  const badges = state.data.badges || {};
  const items = ["green", "amber", "red"]
    .map((tier) => {
      const item = badges[tier];
      if (!item) return "";
      return `<li class="badge-legend-item">
        ${renderBadge(tier)}
        <p>${escapeHtml(item.definition)}</p>
      </li>`;
    })
    .join("");
  return `<section class="badge-legend" aria-label="実現可能性バッジの凡例">
    <p class="sheet-heading">実現可能性</p>
    <ul>${items}</ul>
    <p class="badge-disclaimer">${escapeHtml(state.data.badgeDisclaimer || "")}</p>
  </section>`;
}

function provisionById(id) {
  return (state.data.provisions || {})[id] || null;
}

function renderProvisionChips(ids) {
  const list = (ids || []).map((id) => provisionById(id)).filter(Boolean);
  if (!list.length) return "";
  return `<div class="provision-chips">${list
    .map(
      (item) =>
        `<button type="button" class="provision-chip" data-provision="${escapeHtml(item.id)}">${escapeHtml(
          item.name
        )}</button>`
    )
    .join("")}</div>`;
}

function renderProvisionPanelShell() {
  return `<div class="provision-panel" id="provision-panel" hidden>
    <div class="provision-panel-backdrop" data-close-panel="1"></div>
    <div class="provision-panel-sheet" role="dialog" aria-modal="true" aria-labelledby="provision-panel-title">
      <button type="button" class="provision-panel-close" data-close-panel="1">閉じる</button>
      <p class="provision-kicker" id="provision-panel-kicker"></p>
      <h3 id="provision-panel-title"></h3>
      <div class="prose" id="provision-panel-body"></div>
      <p class="provision-source" id="provision-panel-source"></p>
    </div>
  </div>`;
}

function openProvision(id) {
  const item = provisionById(id);
  const panel = document.getElementById("provision-panel");
  if (!item || !panel) return;
  document.getElementById("provision-panel-kicker").textContent = item.verified
    ? "逐語（確認済み）"
    : "条番号参照";
  document.getElementById("provision-panel-title").textContent = item.name;
  const body = document.getElementById("provision-panel-body");
  if (item.verified && item.text) {
    body.innerHTML = `<blockquote>${escapeHtml(item.text)}</blockquote>${
      item.note ? `<p class="provision-note">${escapeHtml(item.note)}</p>` : ""
    }`;
  } else {
    body.innerHTML = `<p>条文の逐語は確認中です。</p><p class="provision-note">画面には条番号のみを出しています。リーガルレビューで逐語を補完します。</p>`;
  }
  const source = document.getElementById("provision-panel-source");
  if (item.url) {
    source.innerHTML = `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">出典を開く</a>`;
  } else {
    source.textContent = "";
  }
  panel.hidden = false;
  document.body.classList.add("provision-open");
}

function closeProvision() {
  const panel = document.getElementById("provision-panel");
  if (panel) panel.hidden = true;
  document.body.classList.remove("provision-open");
}

function bindProvisionUi() {
  document.querySelectorAll(".provision-chip").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openProvision(button.dataset.provision);
    });
  });
  const panel = document.getElementById("provision-panel");
  if (!panel) return;
  panel.querySelectorAll("[data-close-panel]").forEach((el) => {
    el.addEventListener("click", closeProvision);
  });
}

function onProvisionKey(event) {
  if (event.key === "Escape") closeProvision();
}

function renderPathMinimap(question) {
  const selected = state.answers[question.id];
  const designer = question.designerChoice;
  return `<ol class="path-minimap">${question.choices
    .map((choice) => {
      const markers = [];
      if (choice.id === selected) markers.push("あなた");
      if (choice.id === designer) markers.push("設計者");
      return `<li>
        ${renderBadge(choice.tier)}
        <span class="minimap-letter">${escapeHtml(choiceLetter(choice.id))}</span>
        <span class="minimap-text">${escapeHtml(choice.text)}</span>
        ${
          markers.length
            ? `<span class="minimap-marks">${markers
                .map((mark) => `<span>${escapeHtml(mark)}</span>`)
                .join("")}</span>`
            : ""
        }
      </li>`;
    })
    .join("")}</ol>`;
}

function renderOriginMatrix() {
  const matrix = state.data.originMatrix;
  if (!matrix) return "";
  const head = `<tr><th scope="col">原資 \\ 内容</th>${matrix.cols
    .map((col) => `<th scope="col">${escapeHtml(col)}</th>`)
    .join("")}</tr>`;
  const body = matrix.rows
    .map((row) => {
      const tierClass = row.tier || "none";
      const cell = row.tier ? renderBadge(row.tier) : "—";
      const cells = matrix.cols
        .map(() => `<td class="matrix-cell is-${escapeHtml(tierClass)}">${cell}</td>`)
        .join("");
      return `<tr class="is-${escapeHtml(tierClass)}"><th scope="row">${escapeHtml(row.name)}</th>${cells}</tr>`;
    })
    .join("");
  return `<section class="origin-matrix">
    <p class="compare-label">${escapeHtml(matrix.heading || "原資 × 内容")}</p>
    <div class="matrix-scroll">
      <table>${head}${body}</table>
    </div>
    <p class="matrix-caption">${escapeHtml(matrix.caption)}</p>
  </section>`;
}

function renderCompareResult(question) {
  const selected = state.answers[question.id];
  const designer = question.designerChoice;
  const same = selected === designer;
  const letter = choiceLetter(designer);
  return `
      <p class="compare-result ${same ? "same" : "split"}">${
        same ? "同じ考えでした" : "考えが分かれました"
      }</p>
      <p>${
        same
          ? `設計者の選択も ${escapeHtml(letter)} でした`
          : `設計者の選択は ${escapeHtml(letter)} でした`
      }</p>`;
}

function renderDesignerWord(question, options) {
  const includeCompare = !(options && options.compare === false);
  return `
    <section class="compare designer-word">
      <p class="compare-label">設計者の一言</p>
      ${includeCompare ? renderCompareResult(question) : ""}
      <p class="disclaimer">${escapeHtml(state.data.meta.disclaimer)}</p>
      ${renderParagraphs(question.explanation)}
    </section>`;
}

function renderPathFollowup(question) {
  const selected = question.choices.find((choice) => choice.id === state.answers[question.id]);
  if (!selected) return "";
  const pathNote = question.pathNote
    ? `<p class="path-special-note">${formatInline(question.pathNote)}</p>`
    : "";
  return `
    <section class="path-reveal" aria-live="polite">
      <div class="path-yours">
        ${renderBadge(selected.tier)}
        ${renderProvisionChips(selected.provisionIds || question.provisionIds)}
        <p class="path-note">${escapeHtml(selected.note || "")}</p>
        ${pathNote}
      </div>
      <div class="path-minimap-wrap">
        <p class="compare-label">4つの道</p>
        ${renderPathMinimap(question)}
      </div>
      ${renderDesignerWord(question)}
    </section>`;
}

function renderBeliefFollowup(question) {
  const cards = (question.provisionIds || [])
    .map((id) => {
      const item = provisionById(id);
      if (!item) return "";
      return `<button type="button" class="provision-chip provision-card" data-provision="${escapeHtml(
        item.id
      )}">
        <span>${escapeHtml(item.name)}</span>
        ${item.verified ? "" : `<span class="provision-pending">参照のみ</span>`}
      </button>`;
    })
    .join("");
  const cardNote = question.cardNote
    ? `<p class="belief-card-note">${escapeHtml(question.cardNote)}</p>`
    : "";
  const matrix = question.id === "q02" ? renderOriginMatrix() : "";
  return `
    <section class="compare" aria-live="polite">
      ${renderCompareResult(question)}
    </section>
    <section class="belief-provisions">
      ${cards}
      ${cardNote}
    </section>
    ${renderDesignerWord(question, { compare: false })}
    ${matrix}`;
}

function renderTypeLawCard() {
  const d3 = state.answers.d3 || "4";
  const card = (state.data.typeLawCards || {})[d3] || {};
  const name = typeName() || "（未選択）";
  const badge = card.tier ? renderBadge(card.tier) : "";
  return `<section class="type-law-card">
    <h2>あなたの「${escapeHtml(name)}」は、ここに触れる。</h2>
    <div class="type-law-meta">${badge}${renderProvisionChips(card.provisionIds)}</div>
    <p>${escapeHtml(card.note || "")}</p>
  </section>`;
}

function renderTypeLaw() {
  const section = state.data.sections.hurdle1;
  return `
    <div class="play-layout">
      <div class="play-main">
        <button class="back-link" id="back-link" type="button">← 戻る</button>
        <div class="part-head">
          <p class="part-label">Hurdle 1</p>
          <h2>${escapeHtml(hurdleShortTitle("hurdle1"))}</h2>
          <p class="lead">${escapeHtml(sectionLeadText(section, "hurdle1"))}</p>
        </div>
        <div class="hurdle-map page">${renderHurdleMapList(false)}</div>
        ${renderBadgeLegend()}
        ${renderTypeLawCard()}
        <div class="actions">
          <button class="next-btn" id="continue-btn" type="button">最初の問いへ →</button>
        </div>
      </div>
      <aside class="sheet-panel-wrap">${renderPlayerSheet()}</aside>
    </div>
    ${renderProvisionPanelShell()}
  `;
}

function renderParagraphs(text) {
  return String(text || "")
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${formatInline(p)}</p>`)
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
  const isSurvey = question.mode !== "compare";
  const choices = question.choices
    .map((choice) => {
      let dataState = "";
      if (selected === choice.id && (state.revealed || isSurvey)) dataState = "selected";
      if (state.revealed && !isSurvey && choice.id === designer) {
        dataState = selected === choice.id ? "selected" : "designer";
      }
      const letter = isSurvey
        ? ""
        : `<span class="choice-letter">${escapeHtml(choiceLetter(choice.id))}</span>`;
      return `
        <button
          class="choice ${isSurvey ? "is-survey" : ""}"
          type="button"
          data-choice="${escapeHtml(choice.id)}"
          data-state="${dataState}"
          ${state.revealed && !isSurvey ? "disabled" : ""}
        >${letter}<span class="choice-text">${escapeHtml(choice.text)}</span><span class="choice-arrow" aria-hidden="true">→</span></button>`;
    })
    .join("");

  let followup = "";
  if (state.revealed && question.mode === "compare") {
    followup =
      question.format === "path" ? renderPathFollowup(question) : renderBeliefFollowup(question);
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

  const nextLabel = state.index === total - 1 ? "まとめを見る →" : "次の問いへ →";
  const back =
    question.section === "design"
      ? `<button class="back-link" id="back-link" type="button">← 戻る</button>`
      : "";
  const next =
    isSurvey || !state.revealed
      ? ""
      : `<div class="next-dock">
      <button class="next-btn" id="next-btn" type="button">${nextLabel}</button>
    </div>`;

  if (isSurvey) {
    const seq = visibleDesignIds();
    const ratio = Math.round((designAnsweredCount() / Math.max(seq.length, 1)) * 100);
    const lead = showSectionLead
      ? `<div class="part-head">
          <p class="part-label">Part 1</p>
          <h2>${escapeHtml(section.title.replace(/^Part 1｜/, ""))}</h2>
          <p class="lead">${escapeHtml(section.lead)}</p>
        </div>`
      : `<p class="part-label">Part 1</p>`;
    return `
      ${back}
      ${lead}
      <div class="design-progress" aria-hidden="true">
        <p>大会を設計中</p>
        <div class="design-progress-track"><div class="design-progress-fill" style="width:${ratio}%"></div></div>
      </div>
      <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
      <div class="choices" role="group" aria-label="選択肢">${choices}</div>
    `;
  }

  const hurdleId = question.section;
  const qs = hurdleQuestions(hurdleId);
  const step = qs.findIndex((item) => item.id === question.id) + 1;
  const lead = showSectionLead
    ? `<div class="part-head">
        <p class="part-label">Hurdle ${HURDLES.indexOf(hurdleId) + 1}</p>
        <h2>${escapeHtml(hurdleShortTitle(hurdleId))}</h2>
        <p class="lead">${escapeHtml(sectionLeadText(section, hurdleId))}</p>
      </div>`
    : `<p class="part-label">Hurdle ${HURDLES.indexOf(hurdleId) + 1}</p>
       <p class="hurdle-place">Hurdle ${HURDLES.indexOf(hurdleId) + 1} — ${step}つ目の問い</p>`;
  return `
    ${lead}
    <p class="mobile-hurdle hurdle-place">${escapeHtml(hurdleShortTitle(hurdleId))} — ${step}つ目の問い</p>
    <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
    <div class="choices" role="group" aria-label="選択肢">${choices}</div>
    ${renderProvisionChips(question.provisionIds)}
    ${followup}
    ${next}
  `;
}

function renderSheetRows(ids) {
  return ids
    .map((id) => {
      const question = questionById(id);
      const label = selectedLabel(id);
      if (!question || !label) return "";
      const title = question.sheetLabel || question.axisLabel;
      return `
        <div class="sheet-row">
          <p class="sheet-kicker">${escapeHtml(title)}</p>
          <p class="sheet-value">${escapeHtml(label)}</p>
        </div>`;
    })
    .join("");
}

function latestHurdlePick(hurdleId) {
  const answered = hurdleQuestions(hurdleId).filter(
    (question) => state.answers[question.id] && question.sheetLabel
  );
  if (!answered.length) return "";
  const last = answered[answered.length - 1];
  const text = selectedLabel(last.id);
  return text.length > 22 ? `${text.slice(0, 22)}…` : text;
}

function renderPlayerSheet(options) {
  const finale = Boolean(options && options.finale);
  const compare = isNoPrize() ? "" : qualitativeCompare();
  const lines = diagnosisTypeLines();
  const lockup = diagnosisReady()
    ? `<p class="sheet-type">${escapeHtml(lines.type)}${
        lines.prize ? `<span class="times">${escapeHtml(lines.prize)}</span>` : ""
      }</p>`
    : "";
  const inPart2 =
    state.view === "typeLaw" ||
    (state.view === "question" &&
      currentQuestion() &&
      HURDLES.includes(currentQuestion().section));
  const map = inPart2
    ? `<p class="sheet-heading">4つのハードル</p><div class="hurdle-map compact">${renderHurdleMapList(true)}</div>${
        state.view === "typeLaw" ? "" : renderBadgeLegend()
      }`
    : "";
  const rows = renderSheetRows(visibleDesignIds());
  if (finale) {
    return `
      ${lockup}
      <div class="sheet-rows">${rows}</div>
      ${compare ? `<p class="sheet-compare">${escapeHtml(compare)}</p>` : ""}
    `;
  }
  const open = isMobileLayout() ? "" : "open";
  const summary = isMobileLayout() ? "あなたの大会を見る" : "あなたの大会";
  return `
    <details class="sheet-panel" ${open}>
      <summary>${summary}</summary>
      ${lockup}
      <div class="sheet-rows">${rows}</div>
      ${compare ? `<p class="sheet-compare">${escapeHtml(compare)}</p>` : ""}
      ${map}
    </details>
  `;
}

function hurdleItemState(hurdleId) {
  if (hurdleComplete(hurdleId) || state.view === "finale") return "cleared";
  if (state.view === "designSheet") return "locked";
  if (state.view === "typeLaw") return hurdleId === "hurdle1" ? "current" : "locked";
  const current = state.view === "question" ? currentQuestion() : null;
  if (current && current.section === hurdleId) return "current";
  const currentIndex = current ? HURDLES.indexOf(current.section) : -1;
  const thisIndex = HURDLES.indexOf(hurdleId);
  if (currentIndex >= 0 && thisIndex < currentIndex) return "cleared";
  return "locked";
}

function renderHurdleMapList(compact) {
  return HURDLES.map((id) => {
    const status = hurdleItemState(id);
    const mark =
      status === "cleared" ? "見た" : status === "current" ? "← 現在" : compact ? "" : "LOCKED";
    const pick = compact ? latestHurdlePick(id) : "";
    return `
      <article class="hurdle-map-item is-${status}">
        <span class="hurdle-map-num">${hurdleIndexLabel(id)}</span>
        <div>
          <h3>${escapeHtml(hurdleShortTitle(id))}</h3>
          ${
            compact && mark
              ? `<p class="hurdle-map-status">${mark}</p>`
              : ""
          }
          ${pick ? `<p class="hurdle-picked">${escapeHtml(pick)}</p>` : ""}
        </div>
        ${compact ? "" : `<p class="hurdle-map-status">${mark}</p>`}
      </article>`;
  }).join("");
}

function renderDesignReveal() {
  const map = state.data.hurdleMap || {};
  const lines = diagnosisTypeLines();
  const funding = diagnosisFundingBlurb();
  const prize = diagnosisPrizeBlurb();
  const scale = selectedLabel("d2");
  const fundingParas = funding
    .split(/(?<=。)/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  const prizeParas = prize
    .split(/(?<=。)/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  const turn = escapeHtml(map.preface || "").replace("。そして、", "。<br />そして、");
  return `
    <div class="play-layout">
      <div class="play-main diagnosis-screen">
        <button class="back-link" id="back-link" type="button">← 戻る</button>
        <p class="diagnosis-kicker">${escapeHtml(state.data.diagnosis.heading)}</p>
        <h1 class="diagnosis-lockup">${escapeHtml(lines.type)}${
          lines.prize ? `<span class="times">${escapeHtml(lines.prize)}</span>` : ""
        }</h1>
        <div class="diagnosis-copy prose">${fundingParas}${prizeParas}</div>
        ${
          scale && !isNoPrize()
            ? `<div class="diagnosis-scale">
                <p class="sheet-kicker">賞金・賞品の規模感</p>
                <p class="sheet-value">${escapeHtml(scale)}</p>
              </div>`
            : ""
        }
        <p class="diagnosis-hook">${escapeHtml(diagnosisHook())}</p>
        <p class="turn-copy">${turn}</p>
        <div class="hurdle-map page">${renderHurdleMapList(false)}</div>
        <div class="actions">
          <button class="next-btn" id="continue-btn" type="button">${escapeHtml(
            map.continueLabel || "ハードル1へ進む"
          )} →</button>
        </div>
      </div>
      <aside class="sheet-panel-wrap">${renderPlayerSheet()}</aside>
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
    <svg class="blueprint" viewBox="0 0 360 560" role="img" aria-label="設計者の大会設計図。参加費は運営費のみに充当し、賞金プールへは通さない。">
      <g class="${partClass("hurdle1", revealed)} part-hurdle1">
        <rect class="node" x="18" y="18" width="108" height="40" rx="0"></rect>
        <text x="72" y="43" text-anchor="middle">参加者</text>
        <path class="flow quiet" d="M72 58 v24"></path>
        <text class="label" x="124" y="74">参加費は運営費のみ</text>
        <rect class="node" x="18" y="86" width="108" height="40" rx="0"></rect>
        <text x="72" y="111" text-anchor="middle">運営費</text>
        <path class="blocked" d="M126 38 H158"></path>
        <text class="block-x" x="176" y="43" text-anchor="middle">×</text>
        <path class="blocked" d="M194 38 H210"></path>
        <rect class="node" x="210" y="18" width="132" height="40" rx="0"></rect>
        <text x="276" y="43" text-anchor="middle">賞金プール</text>
        <path class="flow" d="M276 58 v96"></path>
        <rect class="node" x="210" y="158" width="132" height="40" rx="0"></rect>
        <text x="276" y="183" text-anchor="middle">入賞者</text>
      </g>
      <g class="${partClass("hurdle2", revealed)} part-hurdle2">
        <rect class="node" x="18" y="230" width="324" height="48" rx="0"></rect>
        <text x="180" y="250" text-anchor="middle">全国のアミューズ店舗（分散スポンサー）</text>
        <text class="label" x="180" y="268" text-anchor="middle">スポンサー料 → 賞金プール</text>
        <path class="flow" d="M276 230 V58"></path>
        <path class="flow quiet" d="M48 278 v36 H276 v-36"></path>
        <text class="label" x="162" y="308" text-anchor="middle">広告掲出・優先権（価値は小さく保つ）</text>
      </g>
      <g class="${partClass("hurdle3", revealed)} part-hurdle3">
        <rect class="node" x="18" y="360" width="196" height="48" rx="0"></rect>
        <text x="116" y="380" text-anchor="middle">会場：許可店の外</text>
        <text class="label" x="116" y="396" text-anchor="middle">独立会場</text>
        <rect class="node" x="230" y="360" width="112" height="48" rx="0"></rect>
        <text x="286" y="380" text-anchor="middle">年2回</text>
        <text class="label" x="286" y="396" text-anchor="middle">カレンダー</text>
      </g>
      <g class="${partClass("hurdle4", revealed)} part-hurdle4">
        <rect class="node" x="18" y="438" width="324" height="48" rx="0"></rect>
        <text x="180" y="458" text-anchor="middle">記録・証憑</text>
        <text class="label" x="180" y="474" text-anchor="middle">契約書 / 資金フロー</text>
      </g>
    </svg>
  `;
}

function onChoiceKey(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (state.view !== "question" || state.revealed) return;
  const question = currentQuestion();
  if (!question || question.mode !== "compare") return;
  const id = { a: "1", b: "2", c: "3", d: "4", "1": "1", "2": "2", "3": "3", "4": "4" }[
    event.key.toLowerCase()
  ];
  if (!id || !question.choices.some((choice) => choice.id === id)) return;
  event.preventDefault();
  onChoose(id);
}

function bindQuestion() {
  window.removeEventListener("keydown", onChoiceKey);
  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => onChoose(button.dataset.choice));
  });
  const next = document.getElementById("next-btn");
  if (next) next.addEventListener("click", onNext);
  const back = document.getElementById("back-link");
  if (back) back.addEventListener("click", goBackDesign);
  window.addEventListener("keydown", onChoiceKey);
  bindProvisionUi();
}

function goBackDesign() {
  advancing = false;
  const seq = visibleDesignIds();
  if (state.view === "typeLaw") {
    state.view = "designSheet";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (state.view === "designSheet") {
    state.view = "question";
    state.index = indexOfId(seq[seq.length - 1]);
    state.revealed = false;
    render();
    return;
  }
  const question = currentQuestion();
  const i = seq.indexOf(question.id);
  if (i <= 0) {
    state.view = "intro";
    render();
    return;
  }
  state.index = indexOfId(seq[i - 1]);
  state.revealed = false;
  render();
}

function onChoose(choiceId) {
  const question = currentQuestion();
  if (question.mode === "compare" && state.revealed) return;
  if (advancing) return;
  state.answers[question.id] = choiceId;
  if (question.id === "d3" && choiceId === "4") delete state.answers.d4;
  const isMatch =
    question.mode === "compare" ? choiceId === question.designerChoice : null;
  saveAnswer({
    session_id: state.sessionId,
    question_id: question.id,
    selected: choiceId,
    is_match: isMatch,
    timestamp: new Date().toISOString(),
  });
  if (question.mode !== "compare") {
    advancing = true;
    render();
    const wait = prefersReducedMotion() ? 0 : 130;
    window.setTimeout(() => {
      advancing = false;
      advanceDesign();
    }, wait);
    return;
  }
  state.revealed = true;
  render();
  const payoff = document.querySelector(".fun-payoff");
  if (payoff) {
    payoff.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "nearest",
    });
  }
}

function advanceDesign() {
  if (isLastDesignQuestion(currentQuestion())) {
    state.view = "designSheet";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const seq = visibleDesignIds();
  const i = seq.indexOf(currentQuestion().id);
  state.index = indexOfId(seq[i + 1]);
  state.revealed = false;
  render();
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

async function onNext() {
  if (!state.revealed) return;
  if (state.index >= state.data.questions.length - 1) {
    await showFinale();
    return;
  }
  state.index += 1;
  if (currentQuestion().id === "d4" && isNoPrize()) {
    state.index = indexOfId("q00");
  }
  state.revealed = Boolean(state.answers[currentQuestion().id]);
  render();
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function saveAnswer() {
  // 案A: 公開ページでは回答を送信しない。バッジはログに含めない。
}

async function showFinale() {
  state.view = "finale";
  state.stats = statsFromSession();
  state.statsSource = "session";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
      : `<p>特に考えが分かれたのは——</p><ul class="split-list">${summary.split
          .map((q) => `<li>${escapeHtml(q.prompt)}</li>`)
          .join("")}</ul>`;
  return `
    <div class="finale-block">
      <h2>比較サマリ</h2>
      <p>設計者と同じ考えだった問い：${summary.same.length}</p>
      <p>考えが分かれた問い：${summary.split.length}</p>
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
    "集計版は準備中です。いまは、今回この端末で選んだ内容だけを表示しています。";
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
  const closing = escapeHtml(finale.closing).replace("。", "。<br />");
  return `
    <p class="part-label">Part 3</p>
    <h1>${escapeHtml(finale.title)}</h1>
    <div class="finale-compare-grid">
      <section class="finale-side">
        <p class="finale-side-label">あなたの大会</p>
        ${renderPlayerSheet({ finale: true })}
      </section>
      <section class="finale-side">
        <p class="finale-side-label">設計者の大会</p>
        <ul class="designer-labels">${labels}</ul>
        ${renderBlueprint({ complete: true })}
      </section>
    </div>
    ${renderCompareSummary()}
    <div class="finale-block">
      <h2>分布の公開</h2>
      <p class="note">${escapeHtml(finale.distributionPromise)}</p>
      ${renderStats()}
    </div>
    <p class="closing">${closing}</p>
    <p class="note">${escapeHtml(finale.disclaimer)}</p>
    <div class="actions">
      <button class="ghost" id="restart-btn" type="button">もう一度最初から</button>
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
    window.addEventListener("keydown", onProvisionKey);
    render();
  } catch (err) {
    app.innerHTML =
      `<p class="error">設問データを読み込めませんでした。ページを再読み込みするか、ローカルなら <code>python3 server.py</code> で開いてください。</p>`;
  }
}

boot();
