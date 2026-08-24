const STAGES = ["h1", "h2", "h3"];
const FUNDING_KEYS = { 1: "entry_fee", 2: "mixed", 3: "sponsor" };

const state = {
  data: null,
  view: "intro",
  index: 0,
  answers: {},
  revealed: false,
  detailOpen: false,
  sessionId: crypto.randomUUID(),
  initialTournament: null,
  currentTournament: null,
  decisions: [],
  stageIndex: 0,
  eventIndex: 0,
  stageEvents: [],
  resolvedStages: 0,
  tournamentName: "",
};

const TICK_KEYS = ["tickGambling", "tickProfit", "tickContinue"];
const AUTO_NAMES = {
  1: "ホーム・クラシック",
  2: "シティ・オープン",
  3: "ナショナル・オープン",
  4: "インターナショナル・オープン",
};
const DECISION_ROWS = [
  ["h1_money", "賭博"],
  ["h1_sponsor_ok", "賭博"],
  ["h1_contract", "賭博"],
  ["h1_noprize", "賭博"],
  ["h1_return", "還元"],
  ["h1_satellite", "予選"],
  ["h2_profit", "営利性"],
  ["h3_freq", "継続性"],
  ["h3_venue", "会場"],
];
const DESIGNER_EXTRAS = {
  h1_satellite: "優先権は価値を小さく。誰でも入れる枠を併存",
  h1_return: "広告＋小さな優先権",
  h3_freq: "年1〜2回。間隔で営業を切ろうとしない",
  h3_venue: "許可店とは分けた外部会場",
  h2_profit: "大会自体では儲けない。儲ける場所は外",
};
const AXIS_LABELS = {
  gambling: "賭博",
  profit: "営利性",
  continuity: "継続性",
  venue: "会場",
};
const VERDICT_KEYS = {
  current: "verdictCurrent",
  lawful: "verdictLawful",
  interpret: "verdictInterpret",
  short: "verdictShort",
  permit: "verdictPermit",
  reform: "verdictReform",
};

let advancing = false;

function resetSession() {
  state.view = "intro";
  state.index = 0;
  state.answers = {};
  state.revealed = false;
  state.detailOpen = false;
  state.sessionId = crypto.randomUUID();
  state.initialTournament = null;
  state.currentTournament = null;
  state.decisions = [];
  state.stageIndex = 0;
  state.eventIndex = 0;
  state.stageEvents = [];
  state.resolvedStages = 0;
  state.tournamentName = "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function questionById(id) {
  return state.data.questions.find((question) => question.id === id);
}

function choiceText(questionId, choiceId) {
  const question = questionById(questionId);
  if (!question) return "";
  const found = question.choices.find((choice) => choice.id === choiceId);
  return found ? found.text : "";
}

function live(id) {
  if (state.currentTournament && state.currentTournament[id] != null) {
    return state.currentTournament[id];
  }
  return state.answers[id];
}

function selectedLabel(id, source) {
  const value = source ? source[id] : live(id);
  return choiceText(id, value);
}

function copy(key) {
  return (state.data.copy && state.data.copy[key]) || "";
}

function assignAlias(target, canonical, fallback) {
  if (target[canonical] == null && target[fallback] != null) target[canonical] = target[fallback];
}

function normalizeData(data) {
  assignAlias(data, "diagnosis", "diagnosis");
  assignAlias(data, "provisions", "provisions");
  assignAlias(data, "hurdleMap", "hurdleMap");
  assignAlias(data, "requirementMaps", "requirementMaps");
  assignAlias(data, "designerNotes", "designerNotes");
  assignAlias(data, "sections", "sections");
  assignAlias(data, "copy", "copy");
  assignAlias(data, "playStyles", "playStyles");
  assignAlias(data, "finale", "finale");
  assignAlias(data, "intro", "intro");
  assignAlias(data, "meta", "meta");
  assignAlias(data, "events", "events");
  assignAlias(data, "questions", "questions");
  (data.questions || []).forEach((question) => {
    assignAlias(question, "provisionIds", "provisionIds");
    assignAlias(question, "explanation", "explanation");
  });
  Object.values(data.requirementMaps || {}).forEach((map) => {
    assignAlias(map, "provisionIds", "provisionIds");
    (map.items || []).forEach((item) => assignAlias(item, "focus", "focus"));
  });
  (data.designerNotes || []).forEach((note) => {
    assignAlias(note, "provisionIds", "provisionIds");
    assignAlias(note, "body", "body");
  });
  (data.events || []).forEach((event) => {
    assignAlias(event, "sourceId", "sourceId");
    assignAlias(event, "kicker", "kicker");
    assignAlias(event, "scenario", "scenario");
    assignAlias(event, "prompt", "prompt");
    assignAlias(event, "passThrough", "passThrough");
    assignAlias(event, "injectP2", "injectP2");
    assignAlias(event, "requirementMap", "requirementMap");
    assignAlias(event, "call", "call");
    assignAlias(event, "result", "result");
    assignAlias(event, "insight", "insight");
    assignAlias(event, "provisionIds", "provisionIds");
    assignAlias(event, "stage", "stage");
  });
  const meta = data.meta || {};
  assignAlias(meta, "legalNote", "legalNote");
  assignAlias(meta, "dataNotice", "dataNotice");
  assignAlias(meta, "headerDisclaimer", "headerDisclaimer");
  if (meta.privacy) assignAlias(meta.privacy, "retention", "retention");
  data.meta = meta;
  return data;
}

function p2QuestionId(p1) {
  return { 1: "p2a", 2: "p2b", 3: "p2c" }[p1] || null;
}

function isNoPrize(source) {
  const t = source || state.currentTournament || state.answers;
  return t.p1 === "4";
}

function hasPrize(source) {
  return !isNoPrize(source);
}

function isNational(source) {
  const t = source || state.currentTournament || state.answers;
  return t.d1 === "3" || t.d1 === "4";
}

function fundingKey(source) {
  const t = source || state.currentTournament || state.answers;
  if (t.p1 === "4") return "none";
  return FUNDING_KEYS[t.d3] || "none";
}

function visibleDesignIds() {
  const p1 = state.answers.p1;
  const ids = ["p1"];
  if (!p1) return ids;
  if (p1 === "4") {
    ids.push("d1");
    return ids;
  }
  const p2 = p2QuestionId(p1);
  if (p2) ids.push(p2);
  ids.push("d1", "d2", "d3");
  return ids;
}

function currentQuestion() {
  return state.data.questions[state.index];
}

function indexOfId(id) {
  return state.data.questions.findIndex((question) => question.id === id);
}

function isLastDesignQuestion(question) {
  const seq = visibleDesignIds();
  return question && question.id === seq[seq.length - 1];
}

function typeNameFrom(source) {
  const diag = state.data.diagnosis;
  if (!diag) return "";
  if (isNoPrize(source)) return (diag.funding["4"] && diag.funding["4"].name) || "";
  const funding = diag.funding[source.d3];
  return funding ? funding.name : "";
}

function prizeNameFrom(source) {
  const t = source || state.currentTournament || state.answers;
  if (isNoPrize(t)) return "";
  const prize = state.data.diagnosis.prize[t.p1];
  return prize ? prize.name : "";
}

function formDetail(source) {
  const t = source || state.currentTournament || state.answers;
  if (isNoPrize(t) || !t.p2) return "";
  const qid = p2QuestionId(t.p1);
  return qid ? choiceText(qid, t.p2) : "";
}

function handoverLabel(source) {
  const form = prizeNameFrom(source) || choiceText("p1", (source || state.answers).p1);
  const detail = formDetail(source);
  if (!form) return "";
  return detail ? `${form}（${detail}）` : form;
}

function typeLockup(source) {
  const name = typeNameFrom(source);
  const prize = prizeNameFrom(source);
  if (!name) return "";
  return prize ? `${name} × ${prize}` : name;
}

function snapshotTournament() {
  return {
    p1: state.answers.p1,
    p2: state.answers.p2 || null,
    d1: state.answers.d1,
    d2: state.answers.d2 || null,
    d3: state.answers.d3 || null,
  };
}

function progressRatio() {
  if (state.view === "intro") return 0;
  if (state.view === "epilogue") return 1;
  if (state.view === "name") return 0.88;
  if (state.view === "launch") return 0.92;
  if (state.view === "tournament") return 0.28;
  if (state.view === "question") {
    const seq = visibleDesignIds();
    return (seq.filter((id) => state.answers[id]).length / Math.max(seq.length, 1)) * 0.25;
  }
  if (state.view === "survive") {
    const stageLen = Math.max(state.stageEvents.length, 1);
    const local = (state.eventIndex + (state.revealed ? 0.6 : 0)) / stageLen;
    return 0.3 + 0.6 * ((state.resolvedStages + local) / STAGES.length);
  }
  return 0.5;
}

function updateProgress() {
  document.getElementById("progress-bar").style.width = `${Math.round(progressRatio() * 100)}%`;
}

function updateChrome() {
  document.body.classList.remove("is-intro", "is-playing", "is-diagnosis", "is-finale");
  if (state.view === "intro") document.body.classList.add("is-intro");
  else if (state.view === "tournament") document.body.classList.add("is-diagnosis");
  else if (state.view === "name" || state.view === "launch" || state.view === "epilogue") document.body.classList.add("is-finale");
  else document.body.classList.add("is-playing");
}

function eventMatches(event, source) {
  const cond = event.conditions || {};
  const t = source || state.currentTournament || state.answers;
  if (cond.funding && !cond.funding.includes(fundingKey(t))) return false;
  if (cond.hasPrize === true && isNoPrize(t)) return false;
  if (cond.hasPrize === false && hasPrize(t)) return false;
  if (cond.national === true && !isNational(t)) return false;
  if (cond.national === false && isNational(t)) return false;
  if (cond.p1 && !cond.p1.includes(t.p1)) return false;
  return true;
}

function eventsForStage(stageId) {
  return (state.data.events || []).filter(
    (event) => event.stage === stageId && eventMatches(event)
  );
}

function currentEvent() {
  return state.stageEvents[state.eventIndex] || null;
}

function sourceQuestion(event) {
  return event && event.sourceId ? questionById(event.sourceId) : null;
}

function eventChoices(event) {
  if (event.passThrough) {
    return [{
      id: "go",
      text: copy("continue") || "このまま進む →",
      status: event.status || "kept",
      verdict: event.verdict || "",
    }];
  }
  if (event.choices && event.choices.length) return event.choices;
  const source = sourceQuestion(event);
  return source ? source.choices.map((choice) => ({ id: choice.id, text: choice.text })) : [];
}

function beginSurvive() {
  state.initialTournament = snapshotTournament();
  state.currentTournament = snapshotTournament();
  state.decisions = [];
  state.stageIndex = 0;
  state.resolvedStages = 0;
  state.view = "survive";
  openStage(0);
}

function openStage(index) {
  state.stageIndex = index;
  state.stageEvents = eventsForStage(STAGES[index]);
  if (!state.stageEvents.length) {
    state.resolvedStages = index + 1;
    if (index >= STAGES.length - 1) {
      state.view = "name";
      return;
    }
    openStage(index + 1);
    return;
  }
  state.eventIndex = 0;
  state.revealed = false;
  state.detailOpen = false;
}

function copyChoice(event, choice) {
  return {
    call: choice.call || event.call || "",
    result: choice.result || event.result || "",
    status: choice.status || event.status || "kept",
    insight: event.insight || "",
    verdict: choice.verdict || event.verdict || "",
  };
}

function verdictMeta(verdict) {
  const label = copy(VERDICT_KEYS[verdict] || "") || "";
  if (!label) return null;
  const tone =
    verdict === "current" || verdict === "lawful"
      ? "is-green"
      : verdict === "interpret"
        ? "is-amber"
        : "is-red";
  return { label, tone };
}

function renderVerdictBadge(verdict) {
  const meta = verdictMeta(verdict);
  if (!meta) return "";
  return `<p class="verdict-line"><span class="feas-badge ${meta.tone}">${escapeHtml(meta.label)}</span></p>`;
}

function renderVerdictMatrix() {
  if (!state.decisions.length) return "";
  const rows = state.decisions
    .map((item) => {
      const meta = verdictMeta(item.verdict);
      const axis = AXIS_LABELS[item.axis] || "";
      const badge = meta
        ? `<span class="feas-badge ${meta.tone}">${escapeHtml(meta.label)}</span>`
        : "—";
      return `<tr><th>${escapeHtml(axis)}</th><td>${escapeHtml(item.choiceText)}</td><td>${badge}</td></tr>`;
    })
    .join("");
  return `
    <section class="verdict-matrix">
      <p class="sheet-kicker">${escapeHtml(copy("verdictLead"))}</p>
      <div class="matrix-scroll"><table class="ba-table">
        <tr><th>${escapeHtml(copy("verdictAxis"))}</th><th>${escapeHtml(copy("verdictMeasure"))}</th><th>${escapeHtml(copy("verdictLabel"))}</th></tr>
        ${rows}
      </table></div>
    </section>`;
}

function applyMutate(mutate) {
  if (!mutate || !state.currentTournament) return;
  Object.keys(mutate).forEach((key) => {
    state.currentTournament[key] = mutate[key];
  });
}

function saveAnswer(payload) {
  if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") return;
  fetch("api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
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
    body.innerHTML = `<p>条文の逐語は確認中です。</p>`;
  }
  const source = document.getElementById("provision-panel-source");
  source.innerHTML = item.url
    ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">出典を開く</a>`
    : "";
  panel.hidden = false;
}

function closeProvision() {
  const panel = document.getElementById("provision-panel");
  if (panel) panel.hidden = true;
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

function renderFooter() {
  const meta = state.data.meta;
  document.getElementById("footer-disclaimer").textContent = meta.legalNote;
  document.getElementById("footer-data").textContent = meta.dataNotice;
  document.getElementById("footer-privacy").textContent = meta.privacy.retention;
}

function renderLaunchTicks() {
  const cells = STAGES.map((id, index) => {
    const done = index < state.resolvedStages || state.view === "launch" || state.view === "epilogue" || state.view === "name";
    const current = state.view === "survive" && index === state.stageIndex;
    const mark = done ? "■" : "□";
    const label = copy(TICK_KEYS[index]) || "";
    return `<span class="tick-cell ${done ? "is-done" : ""} ${current ? "is-current" : ""}"><span class="tick" aria-hidden="true">${mark}</span><span class="tick-label">${escapeHtml(label)}</span></span>`;
  }).join("");
  return `<div class="launch-meter"><p class="sheet-kicker">${escapeHtml(copy("untilLaunch"))}</p><p class="ticks">${cells}</p></div>`;
}

function factRows(source) {
  const rows = [
    ["規模", selectedLabel("d1", source)],
    ["渡すもの", handoverLabel(source)],
  ];
  if (!isNoPrize(source)) {
    rows.push(["賞金の規模感", selectedLabel("d2", source)]);
    rows.push(["原資", selectedLabel("d3", source)]);
  }
  return rows.filter((row) => row[1]);
}

function latestDecision(...eventIds) {
  const ids = eventIds.flat();
  for (const eventId of ids) {
    const found = [...state.decisions].reverse().find((item) => item.eventId === eventId);
    if (found) return found.choiceText;
  }
  return "";
}

function autoTournamentName() {
  return AUTO_NAMES[state.currentTournament && state.currentTournament.d1] || AUTO_NAMES[state.answers.d1] || "オープン";
}

function resolvedTournamentName() {
  const name = (state.tournamentName || "").trim();
  return name || autoTournamentName();
}

function renderIssuePreview(source) {
  const noprize = isNoPrize(source);
  const gray = noprize ? " is-dim" : "";
  const gambling = noprize ? copy("issueGamblingClosed") : copy("issueGambling");
  return `
    <section class="issue-map">
      <p class="sheet-kicker">${escapeHtml(copy("issueLead"))}</p>
      <p class="issue-line${gray}"><strong>${escapeHtml(copy("tickGambling"))}</strong> — ${escapeHtml(gambling)}</p>
      <p class="issue-line"><strong>${escapeHtml(copy("tickProfit"))} / ${escapeHtml(copy("tickContinue"))}</strong> — ${escapeHtml(copy("issueFuei"))}</p>
    </section>`;
}

function renderRequirementMap(mapId) {
  const map = state.data.requirementMaps && state.data.requirementMaps[mapId];
  if (!map) return "";
  const items = (map.items || [])
    .map(
      (item) =>
        `<li class="${item.focus ? "is-focus" : ""}"><span class="req-mark">${escapeHtml(item.mark)}</span><div><p class="req-title">${escapeHtml(item.title)}</p><p>${escapeHtml(item.text)}</p></div></li>`
    )
    .join("");
  return `
    <div class="requirement-map">
      <p>${escapeHtml(map.lead || "")}</p>
      <ul>${items}</ul>
      ${map.close ? `<p>${escapeHtml(map.close)}</p>` : ""}
      ${renderProvisionChips(map.provisionIds || [])}
    </div>`;
}

function renderTournamentCard(source, options) {
  const compact = Boolean(options && options.compact);
  const rows = factRows(source)
    .map(
      ([label, value]) =>
        `<div class="sheet-row"><p class="sheet-kicker">${escapeHtml(label)}</p><p class="sheet-value">${escapeHtml(
          value
        )}</p></div>`
    )
    .join("");
  const lockup = typeLockup(source);
  return `
    <section class="tourney-card ${compact ? "is-compact" : ""}">
      <p class="sheet-kicker">YOUR TOURNAMENT</p>
      <h2 class="tourney-lockup">${escapeHtml(lockup)}</h2>
      <div class="sheet-rows">${rows}</div>
    </section>`;
}

function renderHud() {
  if (!state.currentTournament) return "";
  return `
    <aside class="hud">
      ${renderTournamentCard(state.currentTournament, { compact: true })}
      ${renderLaunchTicks()}
    </aside>`;
}

function renderIntro() {
  const intro = state.data.intro;
  const meta = state.data.meta;
  const body = intro.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  return `
    <p class="kicker">${escapeHtml(intro.kicker)}</p>
    <h1>${escapeHtml(meta.title)}<br /><span style="font-size:0.62em;color:var(--muted)">${escapeHtml(
      meta.subtitle
    )}</span></h1>
    <p class="lead">${escapeHtml(intro.lead)}</p>
    <div class="prose">${body}</div>
    <p class="note">${escapeHtml(intro.close)}</p>
    <div class="actions">
      <button class="primary" id="start-btn" type="button">始める</button>
    </div>`;
}

function renderDesignQuestion() {
  const question = currentQuestion();
  const section = state.data.sections.design;
  const seq = visibleDesignIds();
  const showLead = question.id === seq[0];
  const ratio = Math.round((seq.filter((id) => state.answers[id]).length / Math.max(seq.length, 1)) * 100);
  const choices = question.choices
    .map(
      (choice) => `
        <button class="choice is-survey" type="button" data-choice="${escapeHtml(choice.id)}">
          <span class="choice-text">${escapeHtml(choice.text)}</span>
          <span class="choice-arrow" aria-hidden="true">→</span>
        </button>`
    )
    .join("");
  const lead = showLead
    ? `<div class="part-head"><p class="part-label">ACT 1</p><h2>${escapeHtml(
        section.title.replace(/^ACT 1｜/, "")
      )}</h2><p class="lead">${escapeHtml(section.lead)}</p></div>`
    : `<p class="part-label">ACT 1</p>`;
  return `
    <button class="back-link" id="back-link" type="button">← 戻る</button>
    ${lead}
    <div class="design-progress" aria-hidden="true">
      <p>大会を設計中</p>
      <div class="design-progress-track"><div class="design-progress-fill" style="width:${ratio}%"></div></div>
    </div>
    <h2 class="prompt">${escapeHtml(question.prompt)}</h2>
    <div class="choices" role="group">${choices}</div>`;
}

function renderTournamentScreen() {
  const map = state.data.hurdleMap || {};
  const t = snapshotTournament();
  return `
    <button class="back-link" id="back-link" type="button">← 戻る</button>
    <p class="part-label">ACT 1</p>
    ${renderTournamentCard(t)}
    ${renderIssuePreview(t)}
    <p class="turn-copy">${escapeHtml(map.preface || "")}</p>
    ${renderLaunchTicks()}
    <div class="actions">
      <button class="next-btn" id="continue-btn" type="button">${escapeHtml(
        map.continueLabel || "この大会を開催する"
      )} →</button>
    </div>`;
}

function statusLabel(status) {
  if (status === "changed") return copy("statusChanged");
  if (status === "issue") return copy("statusIssue");
  return copy("statusKept");
}

function renderSurvive() {
  const event = currentEvent();
  if (!event) return `<p>イベントを読み込めませんでした。</p>`;
  const choices = eventChoices(event);
  const selected = state.answers[event.id];
  const choiceButtons = choices
    .map((choice) => {
      const dataState = selected === choice.id && state.revealed ? "selected" : "";
      return `
        <button class="choice" type="button" data-choice="${escapeHtml(choice.id)}" data-state="${dataState}" ${
        state.revealed ? "disabled" : ""
      }>
          <span class="choice-text">${escapeHtml(choice.text)}</span>
          <span class="choice-arrow" aria-hidden="true">→</span>
        </button>`;
    })
    .join("");
  const scenario = (event.scenario || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  let followup = "";
  if (state.revealed) {
    const picked = choices.find((choice) => choice.id === selected) || {};
    const pack = copyChoice(event, picked);
    const source = sourceQuestion(event);
    const detail = source ? source.explanation : "";
    const provisions = (source && source.provisionIds) || event.provisionIds || [];
    let insight = pack.insight || "";
    if (event.injectP2) {
      const detailLabel = formDetail(state.currentTournament) || prizeNameFrom(state.currentTournament);
      if (detailLabel) insight = (copy("p2Insight") || "").replace("{detail}", detailLabel);
    }
    followup = `
      <section class="consequence" aria-live="polite">
        <p class="sheet-kicker">${escapeHtml(copy("yourCall"))}</p>
        <p class="compare-result">${escapeHtml(pack.call)}</p>
        <p class="status-line">${escapeHtml(statusLabel(pack.status))}</p>
        ${renderVerdictBadge(pack.verdict)}
        <p>${escapeHtml(pack.result)}</p>
        <p class="sheet-kicker">${escapeHtml(copy("why"))}</p>
        <p>${escapeHtml(insight)}</p>
        ${
          detail || event.requirementMap
            ? `<details class="more-detail" ${state.detailOpen ? "open" : ""}>
                <summary>${escapeHtml(copy("more"))}</summary>
                <p class="note">${escapeHtml(copy("detailDisclaimer"))}</p>
                ${event.requirementMap ? renderRequirementMap(event.requirementMap) : ""}
                <div class="prose">${(detail || "")
                  .split(/\n\n+/)
                  .filter(Boolean)
                  .map((p) => `<p>${formatInline(p)}</p>`)
                  .join("")}</div>
                ${renderProvisionChips(provisions)}
              </details>`
            : renderProvisionChips(provisions)
        }
      </section>`;
  }
  const lastInStage = !state.stageEvents.slice(state.eventIndex + 1).some((event) => eventMatches(event));
  const clearText =
    state.revealed && lastInStage && state.data.copy && state.data.copy.stageClear
      ? state.data.copy.stageClear[event.stage]
      : "";
  const clear = clearText ? `<p class="stage-clear">${escapeHtml(clearText)}</p>` : "";
  const next =
    state.revealed
      ? `<div class="next-dock">
        <button class="next-btn" id="next-btn" type="button">${escapeHtml(copy("next"))}</button>
      </div>`
      : "";
  return `
    <div class="play-layout survive-layout">
      <div class="play-main">
        <p class="part-label">ACT 2</p>
        <p class="kicker">${escapeHtml(event.kicker || "")}</p>
        <div class="prose scenario">${scenario}</div>
        <h2 class="prompt">${escapeHtml(event.prompt)}</h2>
        <div class="choices" role="group">${choiceButtons}</div>
        ${followup}
        ${clear}
        ${next}
      </div>
      ${renderHud()}
    </div>
    ${renderProvisionPanelShell()}`;
}

function fieldChanged(id) {
  if (!state.initialTournament || !state.currentTournament) return false;
  return state.initialTournament[id] !== state.currentTournament[id];
}

function playStyle() {
  const styles = state.data.playStyles || {};
  if (isNoPrize(state.currentTournament)) return styles.noprize;
  const initFund = fundingKey(state.initialTournament);
  const nowFund = fundingKey(state.currentTournament);
  if (initFund === "sponsor" && nowFund === "sponsor") return styles.sponsor;
  if (initFund !== nowFund && nowFund === "sponsor") return styles.kept;
  if (fieldChanged("d2") && Number(state.currentTournament.d2) < Number(state.initialTournament.d2)) {
    return styles.simple;
  }
  if (nowFund === "entry_fee") return styles.bold;
  return styles.kept;
}


function renderPoster() {
  const t = state.currentTournament;
  const name = resolvedTournamentName();
  const rows = [
    ["渡すもの", handoverLabel(t)],
    ["規模", selectedLabel("d1", t)],
    ["賞金の規模感", isNoPrize(t) ? "—" : selectedLabel("d2", t)],
    ["原資", isNoPrize(t) ? "—" : selectedLabel("d3", t)],
    ["賭博", latestDecision("h1_money", "h1_sponsor_ok", "h1_contract", "h1_noprize") || "—"],
    ["還元", latestDecision("h1_return") || "—"],
    ["予選", latestDecision("h1_satellite") || "—"],
    ["営利性", latestDecision("h2_profit") || "—"],
    ["継続性", latestDecision("h3_freq") || "—"],
    ["会場", latestDecision("h3_venue") || "—"],
  ].filter((row) => row[1] && row[1] !== "—");
  const body = rows
    .map(([label, value]) => `<div class="poster-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  return `
    <article class="poster-card">
      <p class="poster-kicker">TOURNAMENT BRIEF</p>
      <h2 class="poster-title">${escapeHtml(name)}</h2>
      <p class="poster-type">${escapeHtml(typeLockup(t))}</p>
      ${body}
      <p class="poster-foot">${escapeHtml(copy("posterFiction"))}<br />${escapeHtml(copy("posterDisclaimer"))}</p>
    </article>`;
}

function renderNameScreen() {
  return `
    <p class="part-label">ACT 3</p>
    <p class="kicker">${escapeHtml(copy("nameLead"))}</p>
    <h2 class="prompt">${escapeHtml(copy("namePrompt"))}</h2>
    <form id="name-form" class="name-form">
      <label class="sr-only" for="tournament-name">${escapeHtml(copy("namePlaceholder"))}</label>
      <input id="tournament-name" name="tournament-name" type="text" maxlength="20" autocomplete="off" placeholder="${escapeHtml(copy("namePlaceholder"))}" />
      <div class="actions">
        <button class="next-btn" type="submit">この名前で開催する →</button>
        <button class="ghost" id="skip-name-btn" type="button">${escapeHtml(copy("nameSkip"))}</button>
      </div>
    </form>`;
}

function finishNaming(raw) {
  const text = (raw || "").trim().slice(0, 20);
  state.tournamentName = text || autoTournamentName();
  state.view = "launch";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function compareValue(id, source) {
  if (id === "handover") return handoverLabel(source) || "—";
  return selectedLabel(id, source) || "—";
}

function renderDesignerNotes() {
  const notes = state.data.designerNotes || [];
  if (!notes.length) return "";
  const items = notes
    .map((note) => {
      const paras = (note.body || "")
        .split(/\n\n+/)
        .map((part) => `<p>${formatInline(part)}</p>`)
        .join("");
      return `
        <details class="designer-note">
          <summary>${escapeHtml(note.title)}</summary>
          <div class="prose">${paras}</div>
          ${renderProvisionChips(note.provisionIds || [])}
        </details>`;
    })
    .join("");
  return `
    <section class="designer-notes">
      <h2>設計者ノート</h2>
      <p class="note">${escapeHtml(copy("notesIntro") || "これは設計者個人の現時点の考えの一覧です。適法性の判断ではありません。")}</p>
      ${items}
    </section>`;
}

function renderCompareTable() {
  const keys = [
    ["規模", "d1"],
    ["渡すもの", "handover"],
    ["賞金の規模感", "d2"],
    ["原資", "d3"],
  ];
  const designRows = keys
    .map(([label, id]) => {
      const before = compareValue(id, state.initialTournament);
      const after = compareValue(id, state.currentTournament);
      if (before === "—" && after === "—") return "";
      return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(before)}</td><td>${escapeHtml(after)}</td></tr>`;
    })
    .join("");
  const decisionRows = DECISION_ROWS.map(([eventId, label]) => {
    const after = latestDecision(eventId) || "—";
    if (after === "—") return "";
    return `<tr><th>${escapeHtml(label)}</th><td>—</td><td>${escapeHtml(after)}</td></tr>`;
  }).join("");
  return `<div class="matrix-scroll"><table class="ba-table">
    <tr><th></th><th>${escapeHtml(copy("before"))}</th><th>${escapeHtml(copy("after"))}</th></tr>
    ${designRows}${decisionRows}
  </table></div>`;
}

function keptChangedLists() {
  const labels = { d1: "大会規模", handover: "渡すもの", d2: "賞金の規模感", d3: "賞金原資" };
  const kept = [];
  const changed = [];
  Object.keys(labels).forEach((id) => {
    const before = compareValue(id, state.initialTournament);
    const after = compareValue(id, state.currentTournament);
    if (before === "—" && after === "—") return;
    if (before === after) kept.push(labels[id]);
    else changed.push(labels[id]);
  });
  DECISION_ROWS.forEach(([eventId, label]) => {
    const text = latestDecision(eventId);
    if (!text) return;
    const status = ([...state.decisions].reverse().find((item) => item.eventId === eventId) || {}).status;
    if (status === "changed" || status === "issue") changed.push(label);
    else kept.push(label);
  });
  return { kept, changed };
}

function renderLaunch() {
  const style = playStyle() || {};
  const lists = keptChangedLists();
  const kept = lists.kept.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || `<li>${escapeHtml(copy("unchanged"))}</li>`;
  const changed =
    lists.changed.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || `<li>${escapeHtml(copy("unchanged"))}</li>`;
  return `
    <p class="part-label">ACT 3</p>
    <p class="kicker">${escapeHtml(copy("launchKicker"))}</p>
    <h1>${escapeHtml(copy("launchTitle"))}</h1>
    ${renderPoster()}
    ${renderVerdictMatrix()}
    <div class="actions poster-share">
      <button class="ghost" id="share-x-btn" type="button">Xで広める</button>
    </div>
    ${renderLaunchTicks()}
    <h2>${escapeHtml(copy("before"))} / ${escapeHtml(copy("after"))}</h2>
    ${renderCompareTable()}
    <div class="finale-compare-grid">
      <section class="finale-side"><p class="finale-side-label">${escapeHtml(copy("kept"))}</p><ul>${kept}</ul></section>
      <section class="finale-side"><p class="finale-side-label">${escapeHtml(copy("changed"))}</p><ul>${changed}</ul></section>
    </div>
    <section class="finale-block">
      <p class="sheet-kicker">${escapeHtml(copy("style"))}</p>
      <h2>${escapeHtml(style.name || "")}</h2>
      <p>${escapeHtml(style.blurb || "")}</p>
    </section>
    <div class="actions">
      <button class="next-btn" id="continue-btn" type="button">主催者の設計を見る →</button>
    </div>`;
}

function renderEpilogue() {
  const finale = state.data.finale;
  const closing = escapeHtml(finale.closing).replace("。", "。<br />");
  const pairs = [
    ["規模", selectedLabel("d1", state.currentTournament), "全国規模を想定"],
    ["渡すもの", handoverLabel(state.currentTournament), "賞金（現金。現物も可）"],
    ["原資", selectedLabel("d3", state.currentTournament) || "賞品なし", "スポンサー提供。参加費は賞品に入れない"],
    ["会場", latestDecision("h3_venue") || "（未選択）", DESIGNER_EXTRAS.h3_venue],
    ["予選", latestDecision("h1_satellite") || "—", DESIGNER_EXTRAS.h1_satellite],
    ["還元", latestDecision("h1_return") || "—", DESIGNER_EXTRAS.h1_return],
    ["営利性", latestDecision("h2_profit") || "—", DESIGNER_EXTRAS.h2_profit],
    ["継続性", latestDecision("h3_freq") || "—", DESIGNER_EXTRAS.h3_freq],
  ];
  const rows = pairs
    .map(
      ([label, yours, designer]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(yours || "—")}</td><td>${escapeHtml(designer)}</td></tr>`
    )
    .join("");
  return `
    <p class="part-label">EPILOGUE</p>
    <p class="lead">${escapeHtml(copy("epilogueLead"))}</p>
    <div class="matrix-scroll"><table class="ba-table">
      <tr><th></th><th>${escapeHtml(copy("yourDesign"))}</th><th>${escapeHtml(copy("designerDesign"))}</th></tr>
      ${rows}
    </table></div>
    <p class="note">${escapeHtml(copy("epilogueNote"))}</p>
    <p class="closing">${escapeHtml(copy("endingTitle"))}</p>
    <p class="lead">${closing}</p>
    <p class="note">${escapeHtml(finale.disclaimer)}</p>
    ${renderDesignerNotes()}
    <div class="actions">
      <button class="next-btn" id="restart-btn" type="button">${escapeHtml(copy("replay"))}</button>
    </div>`;
}

function render() {
  const app = document.getElementById("app");
  updateChrome();
  updateProgress();
  if (state.view === "intro") {
    app.innerHTML = renderIntro();
    document.getElementById("start-btn").addEventListener("click", () => {
      state.view = "question";
      state.index = 0;
      render();
    });
    return;
  }
  if (state.view === "tournament") {
    app.innerHTML = renderTournamentScreen();
    document.getElementById("continue-btn").addEventListener("click", () => {
      beginSurvive();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.getElementById("back-link").addEventListener("click", goBackDesign);
    return;
  }
  if (state.view === "survive") {
    app.innerHTML = renderSurvive();
    document.querySelectorAll(".choice").forEach((button) => {
      button.addEventListener("click", () => onSurviveChoose(button.dataset.choice));
    });
    const next = document.getElementById("next-btn");
    if (next) next.addEventListener("click", onSurviveNext);
    const more = document.querySelector(".more-detail");
    if (more) {
      more.addEventListener("toggle", () => {
        state.detailOpen = more.open;
      });
    }
    bindProvisionUi();
    return;
  }
  if (state.view === "name") {
    app.innerHTML = renderNameScreen();
    const form = document.getElementById("name-form");
    const input = document.getElementById("tournament-name");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      finishNaming(input.value);
    });
    document.getElementById("skip-name-btn").addEventListener("click", () => finishNaming(""));
    if (input) input.focus();
    return;
  }
  if (state.view === "launch") {
    app.innerHTML = renderLaunch();
    document.getElementById("continue-btn").addEventListener("click", () => {
      state.view = "epilogue";
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const share = document.getElementById("share-x-btn");
    if (share) share.addEventListener("click", shareOnX);
    return;
  }
  if (state.view === "epilogue") {
    app.innerHTML = renderEpilogue();
    document.getElementById("restart-btn").addEventListener("click", () => {
      resetSession();
      render();
    });
    bindProvisionUi();
    return;
  }
  app.innerHTML = `<div class="play-main">${renderDesignQuestion()}</div>`;
  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => onDesignChoose(button.dataset.choice));
  });
  const back = document.getElementById("back-link");
  if (back) back.addEventListener("click", goBackDesign);
}

function goBackDesign() {
  advancing = false;
  const seq = visibleDesignIds();
  if (state.view === "tournament") {
    state.view = "question";
    state.index = indexOfId(seq[seq.length - 1]);
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
  render();
}

function onDesignChoose(choiceId) {
  const question = currentQuestion();
  if (advancing) return;
  state.answers[question.id] = choiceId;
  if (question.id === "p1") {
    delete state.answers.p2;
    delete state.answers.p2a;
    delete state.answers.p2b;
    delete state.answers.p2c;
    if (choiceId === "4") {
      delete state.answers.d2;
      delete state.answers.d3;
    }
  }
  if (question.id.startsWith("p2")) {
    state.answers.p2 = choiceId;
  }
  saveAnswer({
    session_id: state.sessionId,
    question_id: question.id,
    selected: choiceId,
    is_match: null,
    timestamp: new Date().toISOString(),
  });
  advancing = true;
  render();
  window.setTimeout(() => {
    advancing = false;
    if (isLastDesignQuestion(currentQuestion())) {
      state.view = "tournament";
      state.resolvedStages = 0;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const seq = visibleDesignIds();
    const i = seq.indexOf(currentQuestion().id);
    state.index = indexOfId(seq[i + 1]);
    render();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, prefersReducedMotion() ? 0 : 130);
}

function onSurviveChoose(choiceId) {
  const event = currentEvent();
  if (!event || state.revealed) return;
  const choice = eventChoices(event).find((item) => item.id === choiceId);
  if (!choice) return;
  applyMutate(choice.mutate);
  state.answers[event.id] = choiceId;
  state.decisions.push({
    eventId: event.id,
    stage: event.stage,
    axis: event.axis || "",
    choiceId,
    choiceText: choice.text,
    status: choice.status || event.status,
    verdict: choice.verdict || event.verdict || "",
  });
  if (!event.passThrough) {
    const source = sourceQuestion(event);
    const allowed = source && source.choices.some((item) => item.id === choiceId);
    if (allowed) {
      saveAnswer({
        session_id: state.sessionId,
        question_id: event.sourceId,
        selected: choiceId,
        is_match: null,
        timestamp: new Date().toISOString(),
      });
    }
  }
  state.revealed = true;
  render();
}

function onSurviveNext() {
  if (!state.revealed) return;
  const last = state.eventIndex >= state.stageEvents.length - 1;
  if (!last) {
    state.eventIndex += 1;
    while (
      state.eventIndex < state.stageEvents.length &&
      !eventMatches(state.stageEvents[state.eventIndex])
    ) {
      state.eventIndex += 1;
    }
    if (state.eventIndex < state.stageEvents.length) {
      state.revealed = false;
      state.detailOpen = false;
      render();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }
  }
  state.resolvedStages = state.stageIndex + 1;
  if (state.stageIndex >= STAGES.length - 1) {
    state.view = "name";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  openStage(state.stageIndex + 1);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function shareOnX() {
  const name = resolvedTournamentName();
  const type = typeLockup(state.currentTournament);
  const text = `私の大会『${name}』は${type}になった。あなたはどんな大会を作る？\nhttps://mizuyot.github.io/poker-regulation-game/`;
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
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
    state.data = normalizeData(await loadQuestions());
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
