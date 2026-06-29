const STORAGE_KEY = "baicai-cup-random-hero-sessions";

/** 6 支队伍，每队 5 人。前 5 队队名=队长名，队长也是队员；第 6 队无单独队长。 */
const TEAMS = [
  {
    no: 1,
    name: "明月",
    captain: "明月",
    skill: 1,
    members: ["光之巨人(霸哥)", "坚哥", "七元", "cola"],
  },
  {
    no: 2,
    name: "王姐",
    captain: "王姐",
    skill: 2,
    members: ["d4u", "源神", "花花", "小雨"],
  },
  {
    no: 3,
    name: "佛系",
    captain: "佛系",
    skill: 3,
    members: ["crazy", "baozi", "衍衍衍珏", "李相赫"],
  },
  {
    no: 4,
    name: "张神",
    captain: "张神",
    skill: 4,
    members: ["好运耶耶", "日会落", "天天小恶霸", "打牌"],
  },
  {
    no: 5,
    name: "暧昧",
    captain: "暧昧",
    skill: 5,
    members: ["ud大王", "教头", "本子", "根本吃不胖啊"],
  },
  {
    no: 6,
    name: "第六队",
    captain: null,
    skill: null,
    members: ["片", "雪乃", "香菇", "安捣", "汤圆"],
  },
];

const champions = window.CHAMPIONS || [];
const championMap = Object.fromEntries(champions.map((c) => [c.id, c]));

let sessions = loadSessions();
let currentSessionId = sessions[0]?.id || null;

function getTeamPlayers(team) {
  if (team.captain) {
    return [team.captain, ...team.members];
  }
  return [...team.members];
}

function getTeamLabel(team) {
  return `${team.no}队 · ${team.name}`;
}

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function getSession(id = currentSessionId) {
  return sessions.find((s) => s.id === id) || null;
}

function createSession() {
  const session = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: `场次 ${sessions.length + 1}`,
    matchup: { teamA: null, teamB: null },
    teams: { blue: [], red: [] },
    teamLabels: { blue: "", red: "" },
    picks: {},
    pickOrder: [],
    currentPickIndex: 0,
    status: "setup",
  };
  sessions.unshift(session);
  currentSessionId = session.id;
  saveSessions();
  return session;
}

function splashSrc(champ) {
  return `data/splash/${champ.splash_key}_${champ.name_zh}.jpg`;
}

function heroLabel(champ) {
  return `${champ.name_zh} - ${champ.title_zh}`;
}

function getTeamByNo(no) {
  return TEAMS.find((t) => t.no === no) || null;
}

function applyMatchup(session) {
  const teamA = getTeamByNo(session.matchup.teamA);
  const teamB = getTeamByNo(session.matchup.teamB);

  if (!teamA || !teamB || session.matchup.teamA === session.matchup.teamB) {
    session.teams.blue = [];
    session.teams.red = [];
    session.teamLabels.blue = "";
    session.teamLabels.red = "";
    return false;
  }

  session.teams.blue = getTeamPlayers(teamA);
  session.teams.red = getTeamPlayers(teamB);
  session.teamLabels.blue = getTeamLabel(teamA);
  session.teamLabels.red = getTeamLabel(teamB);
  return true;
}

function getUsedHeroIds(session) {
  return Object.values(session.picks)
    .map((p) => p.selected)
    .filter(Boolean);
}

function randomHeroes(count, excludeIds) {
  const pool = champions.filter((c) => !excludeIds.includes(c.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function buildPickOrder(session) {
  const order = [];
  for (let i = 0; i < 5; i++) {
    if (session.teams.blue[i]) {
      order.push({ player: session.teams.blue[i], team: "blue" });
    }
    if (session.teams.red[i]) {
      order.push({ player: session.teams.red[i], team: "red" });
    }
  }
  return order;
}

function getCurrentPicker(session) {
  if (!session.pickOrder.length) return null;
  return session.pickOrder[session.currentPickIndex] || null;
}

function getPlayerTeamSide(session, player) {
  if (session.teams.blue.includes(player)) return "blue";
  if (session.teams.red.includes(player)) return "red";
  return "";
}

function renderSessionSelect() {
  const select = document.getElementById("session-select");
  const filter = document.getElementById("history-session-filter");
  select.innerHTML = "";
  filter.innerHTML = '<option value="">全部场次</option>';

  if (!sessions.length) createSession();

  sessions.forEach((s) => {
    const label = `${s.name} · ${new Date(s.createdAt).toLocaleString("zh-CN")}`;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = label;
    if (s.id === currentSessionId) opt.selected = true;
    select.appendChild(opt);
    filter.appendChild(opt.cloneNode(true));
  });
}

function renderMatchupSelects() {
  const session = getSession();
  const selectA = document.getElementById("matchup-team-a");
  const selectB = document.getElementById("matchup-team-b");

  const optionsHtml = [
    '<option value="">— 选择队伍 —</option>',
    ...TEAMS.map(
      (t) =>
        `<option value="${t.no}">${getTeamLabel(t)}${t.skill ? ` · 实力${t.skill}` : ""}</option>`
    ),
  ].join("");

  selectA.innerHTML = optionsHtml;
  selectB.innerHTML = optionsHtml;

  if (session?.matchup.teamA) selectA.value = String(session.matchup.teamA);
  if (session?.matchup.teamB) selectB.value = String(session.matchup.teamB);
}

function renderTeamsGrid() {
  const session = getSession();
  const container = document.getElementById("teams-grid");
  container.innerHTML = "";

  TEAMS.forEach((team) => {
    const players = getTeamPlayers(team);
    const isA = session?.matchup.teamA === team.no;
    const isB = session?.matchup.teamB === team.no;
    const card = document.createElement("div");
    card.className = `team-card${isA ? " side-a" : ""}${isB ? " side-b" : ""}`;

    const sideBadge = isA
      ? '<span class="side-badge a">A 队</span>'
      : isB
        ? '<span class="side-badge b">B 队</span>'
        : "";

    card.innerHTML = `
      <div class="team-card-header">
        <div>
          <div class="team-no">${team.no} 队</div>
          <h3>${team.name}${team.skill ? ` <span class="skill-tag">实力${team.skill}</span>` : ""}</h3>
        </div>
        ${sideBadge}
      </div>
      <ul class="team-card-players"></ul>
    `;

    const list = card.querySelector(".team-card-players");
    players.forEach((name) => {
      const li = document.createElement("li");
      const isCaptain = team.captain && name === team.captain;
      if (isCaptain) li.classList.add("captain");
      li.textContent = isCaptain ? `${name}（队长）` : name;
      list.appendChild(li);
    });

    container.appendChild(card);
  });
}

function onMatchupChange() {
  const session = getSession();
  if (!session) return;

  const teamA = parseInt(document.getElementById("matchup-team-a").value, 10) || null;
  const teamB = parseInt(document.getElementById("matchup-team-b").value, 10) || null;

  if (teamA && teamB && teamA === teamB) {
    alert("请选择两支不同的队伍对阵");
    return;
  }

  session.matchup = { teamA, teamB };
  applyMatchup(session);

  if (session.status === "setup") {
    session.picks = {};
    session.pickOrder = [];
    session.currentPickIndex = 0;
  }

  saveSessions();
  renderTeamsGrid();
  renderDraft();
}

function randomMatchup() {
  const session = getSession();
  if (!session) return;

  const indices = [...TEAMS].sort(() => Math.random() - 0.5).slice(0, 2);
  session.matchup = { teamA: indices[0].no, teamB: indices[1].no };
  applyMatchup(session);
  session.picks = {};
  session.pickOrder = [];
  session.currentPickIndex = 0;
  session.status = "setup";
  saveSessions();
  renderMatchupSelects();
  renderTeamsGrid();
}

function clearMatchup() {
  const session = getSession();
  if (!session) return;
  if (!confirm("确定清空当前场次的对阵和选英雄记录？")) return;

  session.matchup = { teamA: null, teamB: null };
  session.teams = { blue: [], red: [] };
  session.teamLabels = { blue: "", red: "" };
  session.picks = {};
  session.pickOrder = [];
  session.currentPickIndex = 0;
  session.status = "setup";
  saveSessions();
  renderMatchupSelects();
  renderTeamsGrid();
  renderDraft();
}

function startDraft() {
  const session = getSession();
  if (!session) return;

  if (!applyMatchup(session)) {
    alert("请先选择两支不同的队伍对阵（各 5 人）");
    return;
  }

  if (session.teams.blue.length !== 5 || session.teams.red.length !== 5) {
    alert("每队必须为 5 人，请检查队伍配置");
    return;
  }

  session.pickOrder = buildPickOrder(session);
  const firstUnpicked = session.pickOrder.findIndex(
    (p) => !session.picks[p.player]?.selected
  );
  session.currentPickIndex = firstUnpicked >= 0 ? firstUnpicked : 0;
  session.status = "drafting";
  saveSessions();

  switchTab("draft");
  renderDraft();
}

function teamSideLabel(session, side) {
  return session.teamLabels?.[side] || (side === "blue" ? "A 队" : "B 队");
}

function renderDraft() {
  const session = getSession();
  const idle = document.getElementById("draft-idle");
  const active = document.getElementById("draft-active");
  const orderEl = document.getElementById("pick-order");
  const usedEl = document.getElementById("used-heroes");

  if (!session || (session.status !== "drafting" && session.status !== "completed")) {
    idle.classList.remove("hidden");
    active.classList.add("hidden");
    orderEl.innerHTML = "";
    usedEl.innerHTML = "";
    document.getElementById("used-count").textContent = "0";
    return;
  }

  if (session.status === "completed") {
    idle.classList.add("hidden");
    active.classList.remove("hidden");
    document.getElementById("draft-phase-roll").classList.add("hidden");
    document.getElementById("draft-phase-pick").classList.add("hidden");
    document.getElementById("draft-phase-done").classList.remove("hidden");
    renderDraftSummary(session);
    renderPickOrderSidebar(session, orderEl);
    renderUsedHeroes(session, usedEl);
    return;
  }

  idle.classList.add("hidden");
  active.classList.remove("hidden");
  renderPickOrderSidebar(session, orderEl);
  renderUsedHeroes(session, usedEl);

  const picker = getCurrentPicker(session);
  const rollPhase = document.getElementById("draft-phase-roll");
  const pickPhase = document.getElementById("draft-phase-pick");
  const donePhase = document.getElementById("draft-phase-done");

  if (!picker || session.picks[picker.player]?.selected) {
    const allDone = session.pickOrder.every(
      (p) => session.picks[p.player]?.selected
    );
    if (allDone) {
      rollPhase.classList.add("hidden");
      pickPhase.classList.add("hidden");
      donePhase.classList.remove("hidden");
      renderDraftSummary(session);
      session.status = "completed";
      saveSessions();
      return;
    }
    session.currentPickIndex = session.pickOrder.findIndex(
      (p) => !session.picks[p.player]?.selected
    );
    saveSessions();
    return renderDraft();
  }

  donePhase.classList.add("hidden");
  document.getElementById("current-player").textContent = picker.player;
  const badge = document.getElementById("current-team-badge");
  badge.textContent = teamSideLabel(session, picker.team);
  badge.className = `team-badge ${picker.team}`;

  const existing = session.picks[picker.player];
  if (existing?.offered && !existing.selected) {
    rollPhase.classList.add("hidden");
    pickPhase.classList.remove("hidden");
    renderHeroOptions(existing.offered, picker.player);
  } else if (existing?.selected) {
    session.currentPickIndex++;
    saveSessions();
    renderDraft();
  } else {
    rollPhase.classList.remove("hidden");
    pickPhase.classList.add("hidden");
    document.getElementById("btn-roll").disabled = false;
  }
}

function renderHeroOptions(offeredIds, playerName) {
  const container = document.getElementById("hero-options");
  container.innerHTML = "";

  offeredIds.forEach((id) => {
    const champ = championMap[id];
    if (!champ) return;

    const card = document.createElement("div");
    card.className = "hero-card";
    card.innerHTML = `
      <div class="splash-wrap">
        <img src="${splashSrc(champ)}" alt="${heroLabel(champ)}"
             onerror="this.src='${champ.splash_url}'">
      </div>
      <div class="hero-info">
        <div class="hero-display">${champ.name_zh} - ${champ.title_zh}</div>
      </div>
    `;
    card.onclick = () => confirmPick(playerName, id, offeredIds);
    container.appendChild(card);
  });
}

function rollHeroes() {
  const session = getSession();
  const picker = getCurrentPicker(session);
  if (!session || !picker) return;

  const used = getUsedHeroIds(session);
  if (used.length > champions.length - 3) {
    alert("可用英雄不足，无法继续随机");
    return;
  }

  const offered = randomHeroes(3, used).map((c) => c.id);
  session.picks[picker.player] = {
    offered,
    selected: null,
    rolledAt: new Date().toISOString(),
  };
  saveSessions();

  document.getElementById("draft-phase-roll").classList.add("hidden");
  document.getElementById("draft-phase-pick").classList.remove("hidden");
  renderHeroOptions(offered, picker.player);
}

function confirmPick(playerName, heroId, offeredIds) {
  const session = getSession();
  if (!session) return;

  const champ = championMap[heroId];
  if (!confirm(`确认选择 ${heroLabel(champ)} ？`)) return;

  const used = getUsedHeroIds(session);
  if (used.includes(heroId)) {
    alert("该英雄已被其他人选择，请重新随机");
    delete session.picks[playerName];
    saveSessions();
    document.getElementById("draft-phase-roll").classList.remove("hidden");
    document.getElementById("draft-phase-pick").classList.add("hidden");
    return;
  }

  session.picks[playerName] = {
    offered: offeredIds,
    selected: heroId,
    pickedAt: new Date().toISOString(),
  };
  session.currentPickIndex++;
  saveSessions();
  renderDraft();
}

function renderPickOrderSidebar(session, orderEl) {
  orderEl.innerHTML = "";
  session.pickOrder.forEach((entry, i) => {
    const li = document.createElement("li");
    const done = !!session.picks[entry.player]?.selected;
    if (i === session.currentPickIndex && !done) li.classList.add("current");
    if (done) li.classList.add("done");
    li.innerHTML = `
      <span class="team-dot ${entry.team}"></span>
      <span>${entry.player}</span>
    `;
    li.title = teamSideLabel(session, entry.team);
    orderEl.appendChild(li);
  });
}

function renderUsedHeroes(session, usedEl) {
  const used = getUsedHeroIds(session);
  document.getElementById("used-count").textContent = used.length;
  usedEl.innerHTML = used
    .map((id) => {
      const c = championMap[id];
      return c ? `<span class="used-hero-tag">${c.name_zh}</span>` : "";
    })
    .join("");
}

function renderDraftSummary(session) {
  const container = document.getElementById("draft-summary");
  container.innerHTML = "";

  ["blue", "red"].forEach((team) => {
    const div = document.createElement("div");
    div.className = `summary-team ${team}`;
    div.innerHTML = `<h3>${teamSideLabel(session, team)}</h3>`;

    session.teams[team].forEach((name) => {
      const pick = session.picks[name];
      const champ = pick?.selected ? championMap[pick.selected] : null;
      const item = document.createElement("div");
      item.className = "summary-item";
      if (champ) {
        item.innerHTML = `
          <img src="${splashSrc(champ)}" alt="" onerror="this.src='${champ.splash_url}'">
          <span class="player">${name}</span>
          <span class="hero-label">${heroLabel(champ)}</span>
        `;
      } else {
        item.innerHTML = `<span class="player">${name}</span><span>未选择</span>`;
      }
      div.appendChild(item);
    });
    container.appendChild(div);
  });
}

function renderHistory() {
  const search = document.getElementById("history-search").value.trim().toLowerCase();
  const sessionFilter = document.getElementById("history-session-filter").value;
  const container = document.getElementById("history-results");
  container.innerHTML = "";

  const records = [];
  sessions.forEach((session) => {
    if (sessionFilter && session.id !== sessionFilter) return;
    Object.entries(session.picks).forEach(([player, pick]) => {
      if (!pick.offered?.length) return;
      if (search && !player.toLowerCase().includes(search)) return;
      records.push({ session, player, pick });
    });
  });

  if (!records.length) {
    container.innerHTML = '<div class="empty-state">暂无记录</div>';
    return;
  }

  records.forEach(({ session, player, pick }) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const side = getPlayerTeamSide(session, player);
    const teamLabel = side ? teamSideLabel(session, side) : "";

    card.innerHTML = `
      <div class="history-card-header">
        <div>
          <div class="player-name">${player} ${teamLabel ? `<span class="team-badge ${side}">${teamLabel}</span>` : ""}</div>
          <div class="session-date">${session.name} · ${new Date(session.createdAt).toLocaleString("zh-CN")}</div>
        </div>
      </div>
      <div class="history-pick-row">
        <div class="history-hero-block">
          <h4>抽到的 3 个英雄</h4>
          <div class="offered-list"></div>
        </div>
        <div class="history-hero-block">
          <h4>最终选择</h4>
          <div class="selected-list"></div>
        </div>
      </div>
    `;

    const offeredList = card.querySelector(".offered-list");
    pick.offered.forEach((id) => {
      const champ = championMap[id];
      if (!champ) return;
      offeredList.appendChild(createHistoryHeroItem(champ, id === pick.selected));
    });

    const selectedList = card.querySelector(".selected-list");
    if (pick.selected && championMap[pick.selected]) {
      selectedList.appendChild(createHistoryHeroItem(championMap[pick.selected], true));
    } else {
      selectedList.innerHTML = '<span style="color:var(--text-muted)">未确认选择</span>';
    }

    container.appendChild(card);
  });
}

function createHistoryHeroItem(champ, selected) {
  const div = document.createElement("div");
  div.className = `history-hero-item${selected ? " selected" : ""}`;
  div.innerHTML = `
    <img src="${splashSrc(champ)}" alt="${heroLabel(champ)}"
         onerror="this.src='${champ.splash_url}'">
    <div class="label">${heroLabel(champ)}</div>
  `;
  return div;
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("active", p.id === `panel-${tabName}`);
  });
  if (tabName === "history") renderHistory();
  if (tabName === "draft") renderDraft();
}

function renderSetup() {
  renderMatchupSelects();
  renderTeamsGrid();
}

function init() {
  if (!sessions.length) createSession();

  renderSessionSelect();
  renderSetup();
  renderDraft();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  document.getElementById("session-select").onchange = (e) => {
    currentSessionId = e.target.value;
    renderSetup();
    renderDraft();
  };

  document.getElementById("btn-new-session").onclick = () => {
    createSession();
    renderSessionSelect();
    renderSetup();
    renderDraft();
  };

  document.getElementById("matchup-team-a").onchange = onMatchupChange;
  document.getElementById("matchup-team-b").onchange = onMatchupChange;
  document.getElementById("btn-random-matchup").onclick = randomMatchup;
  document.getElementById("btn-clear-matchup").onclick = clearMatchup;
  document.getElementById("btn-start-draft").onclick = startDraft;
  document.getElementById("btn-roll").onclick = rollHeroes;
  document.getElementById("btn-back-setup").onclick = () => switchTab("setup");

  document.getElementById("history-search").oninput = renderHistory;
  document.getElementById("history-session-filter").onchange = renderHistory;
}

init();
