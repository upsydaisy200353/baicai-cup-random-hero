const API = "";
const TOKEN_KEY = "baicai-cup-token";

let currentUser = null;
let pollTimer = null;
let championMap = {};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function splashSrc(champ) {
  if (!champ) return "";
  return `data/splash/${champ.splash_key}_${champ.name_zh}.jpg`;
}

function heroLabel(champ) {
  return `${champ.name_zh} - ${champ.title_zh}`;
}

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
}

function $(id) {
  return document.getElementById(id);
}

async function loadChampionMap() {
  if (window.CHAMPIONS?.length) {
    window.CHAMPIONS.forEach((c) => { championMap[c.id] = c; });
    return;
  }
  try {
    const { champions } = await api("/api/champions");
    champions.forEach((c) => { championMap[c.id] = c; });
  } catch {
    /* server will provide in state */
  }
}

async function initLogin() {
  const { teams } = await api("/api/roster");
  const select = $("login-name");
  select.innerHTML = "";

  const adminOpt = document.createElement("option");
  adminOpt.value = "管理员";
  adminOpt.textContent = "管理员";
  select.appendChild(adminOpt);

  teams.forEach((team) => {
    const group = document.createElement("optgroup");
    group.label = `${team.no}队 · ${team.name}`;
    team.players.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  });

  $("login-form").onsubmit = async (e) => {
    e.preventDefault();
    $("login-error").classList.add("hidden");
    try {
      const { token, user } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          name: $("login-name").value,
          password: $("login-password").value,
        }),
      });
      localStorage.setItem(TOKEN_KEY, token);
      currentUser = user;
      enterApp();
    } catch (err) {
      $("login-error").textContent = err.message;
      $("login-error").classList.remove("hidden");
    }
  };
}

async function enterApp() {
  showView("view-app");
  $("user-badge").textContent = `${currentUser.name}${currentUser.role === "admin" ? " · 管理员" : ""}`;
  $("header-subtitle").textContent =
    currentUser.role === "admin"
      ? "管理员控制台 · 创建对阵并开启 10 人同时选英雄"
      : `${currentUser.teamName ? currentUser.teamName + " · " : ""}队员选英雄`;

  if (currentUser.role === "admin") {
    $("admin-main").classList.remove("hidden");
    $("player-main").classList.add("hidden");
    await initAdmin();
  } else {
    $("admin-main").classList.add("hidden");
    $("player-main").classList.remove("hidden");
    startPolling();
  }
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startPolling() {
  stopPolling();
  refreshState();
  pollTimer = setInterval(refreshState, 2000);
}

async function refreshState() {
  try {
    const data = await api("/api/match");
    if (currentUser.role === "admin") {
      renderAdminLive(data);
    } else {
      renderPlayerView(data);
    }
  } catch (err) {
    if (err.message.includes("登录")) logout();
  }
}

/* ─── 管理员 ─── */

async function initAdmin() {
  const { teams } = await api("/api/roster");
  const opts = ['<option value="">— 选择 —</option>']
    .concat(teams.map((t) => `<option value="${t.no}">${t.no}队 · ${t.name}</option>`))
    .join("");
  $("admin-team-a").innerHTML = opts;
  $("admin-team-b").innerHTML = opts;

  const grid = $("admin-teams-grid");
  grid.innerHTML = teams
    .map(
      (t) => `
    <div class="team-card">
      <div class="team-card-header"><div><div class="team-no">${t.no} 队</div><h3>${t.name}</h3></div></div>
      <ul class="team-card-players">${t.players.map((p) => `<li>${p}</li>`).join("")}</ul>
    </div>`
    )
    .join("");

  $("btn-admin-create").onclick = async () => {
    const teamA = $("admin-team-a").value;
    const teamB = $("admin-team-b").value;
    if (!teamA || !teamB) return alert("请选择两支队伍");
    try {
      await api("/api/admin/match", {
        method: "POST",
        body: JSON.stringify({ teamA: Number(teamA), teamB: Number(teamB) }),
      });
      refreshState();
    } catch (e) {
      alert(e.message);
    }
  };

  $("btn-admin-start").onclick = async () => {
    try {
      await api("/api/admin/match/start", { method: "POST" });
      refreshState();
    } catch (e) {
      alert(e.message);
    }
  };

  $("btn-admin-reset").onclick = async () => {
    if (!confirm("确定重置当前场次？")) return;
    try {
      await api("/api/admin/match/reset", { method: "POST" });
      refreshState();
    } catch (e) {
      alert(e.message);
    }
  };

  startPolling();
}

function renderAdminLive(data) {
  const statusEl = $("admin-match-status");
  const board = $("admin-live-board");

  if (!data.match) {
    statusEl.textContent = "当前无对阵，请选择两队后创建。";
    board.classList.add("hidden");
    return;
  }

  const m = data.match;
  statusEl.innerHTML = `场次 <strong>${m.labels?.blue || ""}</strong> VS <strong>${m.labels?.red || ""}</strong>
    · 状态 <strong>${{ lobby: "准备中", drafting: "选英雄中", complete: "已完成" }[m.status]}</strong>
    · 已选 <strong>${m.pickedCount}/10</strong>`;

  board.classList.remove("hidden");
  board.innerHTML = renderSummaryHtml(data, true);
}

/* ─── 队员 ─── */

function renderPlayerView(data) {
  if (!data.match) {
    $("player-waiting").classList.remove("hidden");
    $("player-not-in-match").classList.add("hidden");
    $("player-draft").classList.add("hidden");
    return;
  }

  if (!data.self) {
    $("player-waiting").classList.add("hidden");
    $("player-not-in-match").classList.remove("hidden");
    $("player-draft").classList.add("hidden");
    return;
  }

  if (data.match.status === "lobby") {
    $("player-waiting").classList.remove("hidden");
    $("player-waiting").querySelector("h2").textContent = "对阵已就绪";
    $("player-waiting").querySelector("p").textContent =
      `${data.match.labels?.blue} VS ${data.match.labels?.red} · 等待管理员点击「开始选英雄」`;
    $("player-not-in-match").classList.add("hidden");
    $("player-draft").classList.add("hidden");
    return;
  }

  $("player-waiting").querySelector("h2").textContent = "等待管理员开始";
  $("player-waiting").querySelector("p").textContent = "对阵创建并开始选英雄后，你可以与队友同时选英雄。";

  $("player-waiting").classList.add("hidden");
  $("player-not-in-match").classList.add("hidden");
  $("player-draft").classList.remove("hidden");

  const selfSide = data.self.side;
  const teammates = data.sides[selfSide].filter((p) => p.name !== currentUser.name);
  const enemies = data.sides[selfSide === "blue" ? "red" : "blue"];

  $("teammates-list").innerHTML = teammates
    .map((p) => renderPlayerRow(p))
    .join("");

  $("enemies-list").innerHTML = enemies.map((p) => renderPlayerRow(p, true)).join("");

  const bench = data.bench[selfSide] || [];
  $("team-bench").innerHTML = bench.length
    ? bench
        .map((b) => {
          if (b.hidden) return `<div class="bench-card hidden-card">???</div>`;
          return `
        <div class="bench-card" data-id="${b.heroId}">
          <img src="${splashSrc(b.hero)}" alt="" onerror="this.src='${b.hero?.splash_url || ""}'">
          <div class="bench-label">${heroLabel(b.hero)}</div>
          <div class="bench-from">来自 ${b.fromPlayer}</div>
          ${data.self.canRoll && data.self.status !== "done" ? `<button class="btn btn-secondary btn-sm btn-pick-bench">选用</button>` : ""}
        </div>`;
        })
        .join("")
    : `<p class="empty-bench">暂无待选英雄，等队友选将后会出现</p>`;

  document.querySelectorAll(".btn-pick-bench").forEach((btn) => {
    btn.onclick = async (e) => {
      const card = e.target.closest(".bench-card");
      const heroId = card?.dataset.id;
      if (!heroId || !confirm("确认从待选池选用该英雄？")) return;
      try {
        await api("/api/draft/pick-bench", { method: "POST", body: JSON.stringify({ heroId }) });
        refreshState();
      } catch (err) {
        alert(err.message);
      }
    };
  });

  const self = data.self;
  $("self-status").innerHTML = `你的状态：<strong>${{ idle: "未随机", offered: "已随机待确认", done: "已选完" }[self.status]}</strong>
    · 已随机 ${self.rollCount} 次 · 本方 ${data.match.labels?.[selfSide] || ""}`;

  $("phase-roll").classList.toggle("hidden", self.status === "done" || self.status === "offered");
  $("phase-pick").classList.toggle("hidden", self.status !== "offered");
  $("phase-done").classList.toggle("hidden", self.status !== "done" || data.match.allDone);
  $("phase-complete").classList.toggle("hidden", !data.match.allDone);

  if (self.status === "offered") renderHeroOptions(self.offered);
  if (self.status === "done" && !data.match.allDone) {
    $("self-pick-summary").innerHTML = self.selected
      ? renderHeroCard(self.selected, false)
      : "";
  }
  if (data.match.allDone) {
    $("final-summary").innerHTML = renderSummaryHtml(data, false);
  }

  $("btn-roll").onclick = async () => {
    try {
      await api("/api/draft/roll", { method: "POST" });
      refreshState();
    } catch (e) {
      alert(e.message);
    }
  };
}

function renderPlayerRow(p, isEnemy = false) {
  let heroHtml = '<span class="muted">未选</span>';
  if (p.selected?.hidden) heroHtml = '<span class="hidden-pick">???</span>';
  else if (p.selected) {
    heroHtml = `<img class="mini-splash" src="${splashSrc(p.selected)}" alt="" onerror="this.src='${p.selected.splash_url || ""}'">
      <span>${heroLabel(p.selected)}</span>`;
  } else if (p.status === "done") {
    heroHtml = '<span class="hidden-pick">???</span>';
  }

  const statusIcon = p.status === "done" ? "✓" : p.status === "offered" ? "…" : "○";
  return `<li class="teammate-row ${p.status}"><span class="status-icon">${statusIcon}</span><span class="p-name">${p.name}</span><span class="p-hero">${heroHtml}</span></li>`;
}

function renderHeroOptions(offered) {
  const container = $("hero-options");
  container.innerHTML = offered
    .map(
      (champ) => `
    <div class="hero-card" data-id="${champ.id}">
      <div class="splash-wrap">
        <img src="${splashSrc(champ)}" alt="${heroLabel(champ)}" onerror="this.src='${champ.splash_url}'">
      </div>
      <div class="hero-info"><div class="hero-display">${heroLabel(champ)}</div></div>
    </div>`
    )
    .join("");

  container.querySelectorAll(".hero-card").forEach((card) => {
    card.onclick = async () => {
      const heroId = card.dataset.id;
      const champ = championMap[heroId] || offered.find((c) => c.id === heroId);
      if (!confirm(`确认选将 ${heroLabel(champ)} ？\n另外 2 个将进入队友待选池。`)) return;
      try {
        await api("/api/draft/pick", { method: "POST", body: JSON.stringify({ heroId }) });
        refreshState();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderHeroCard(champ, clickable) {
  return `
    <div class="hero-card ${clickable ? "clickable" : ""}">
      <div class="splash-wrap"><img src="${splashSrc(champ)}" alt="" onerror="this.src='${champ.splash_url}'"></div>
      <div class="hero-info"><div class="hero-display">${heroLabel(champ)}</div></div>
    </div>`;
}

function renderSummaryHtml(data, isAdmin) {
  if (!data.match) return "";
  const renderSide = (side, label) => `
    <div class="summary-team ${side}">
      <h3>${label}</h3>
      ${data.sides[side]
        .map((p) => {
          const sel = p.selected?.hidden ? "???" : p.selected ? heroLabel(p.selected) : "未选";
          return `<div class="summary-item"><span class="player">${p.name}</span><span class="hero-label">${sel}</span></div>`;
        })
        .join("")}
    </div>`;
  return `${renderSide("blue", data.match.labels?.blue || "蓝队")}${renderSide("red", data.match.labels?.red || "红队")}`;
}

function logout() {
  stopPolling();
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  showView("view-login");
}

async function init() {
  await loadChampionMap();
  await initLogin();

  $("btn-logout").onclick = logout;

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      const { user } = await api("/api/me");
      currentUser = user;
      enterApp();
    } catch {
      logout();
    }
  } else {
    showView("view-login");
  }
}

init();
