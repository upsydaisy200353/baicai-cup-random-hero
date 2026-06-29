const API = "";
const TOKEN_KEY = "baicai-cup-token";

let currentUser = null;
let pollTimer = null;
let championMap = {};
let backendOnline = false;

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("登录已过期，请重新登录");
    if (res.status === 404 && path.startsWith("/api/")) {
      throw new Error("后端服务未运行（Render 需使用 Web Service，不能用 Static Site）");
    }
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

async function checkBackend() {
  try {
    const res = await fetch(`${API}/api/health`);
    if (!res.ok) throw new Error();
    backendOnline = true;
    $("backend-warn")?.classList.add("hidden");
    return true;
  } catch {
    backendOnline = false;
    $("backend-warn")?.classList.remove("hidden");
    return false;
  }
}

function fillLoginSelect(teams) {
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
}

function splashSrc(champ) {
  if (!champ) return "";
  return `data/splash/${champ.splash_key}_${champ.name_zh}.jpg`;
}

function heroLabel(champ) {
  if (!champ) return "???";
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
  try {
    const res = await fetch(`${API}/api/champions`);
    if (res.ok) {
      const { champions } = await res.json();
      champions.forEach((c) => {
        championMap[c.id] = c;
      });
      return;
    }
  } catch {
    /* fallback */
  }
  if (window.CHAMPIONS?.length) {
    window.CHAMPIONS.forEach((c) => {
      championMap[c.id] = c;
    });
  }
}

async function initLogin() {
  let teams;
  try {
    ({ teams } = await api("/api/roster"));
  } catch {
    teams = window.ROSTER_TEAMS || [];
  }
  fillLoginSelect(teams);
  await checkBackend();

  $("login-form").onsubmit = async (e) => {
    e.preventDefault();
    $("login-error").classList.add("hidden");
    if (!backendOnline) {
      const ok = await checkBackend();
      if (!ok) {
        $("login-error").textContent =
          "无法连接后端。本地请运行 npm start；Render 请改为 Web Service 部署（非 Static Site）。";
        $("login-error").classList.remove("hidden");
        return;
      }
    }
    try {
      const { token, user } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ name: $("login-name").value }),
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
      ? "管理员控制台 · 每队 15 英雄池 · 120 秒选将"
      : `${currentUser.teamName ? currentUser.teamName + " · " : ""}从本方英雄池选将`;

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
    if (err.message.includes("登录") || err.message.includes("401")) {
      alert("登录已过期，请重新登录");
      logout();
    }
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
  const timerEl = $("admin-timer");

  if (!data.match) {
    statusEl.textContent = "当前无对阵，请选择两队后创建。";
    board.classList.add("hidden");
    timerEl.classList.add("hidden");
    return;
  }

  const m = data.match;
  const statusLabel = { lobby: "准备中", drafting: "选英雄中", complete: "已完成" }[m.status];

  statusEl.innerHTML = `场次 <strong>${m.labels?.blue || ""}</strong> VS <strong>${m.labels?.red || ""}</strong>
    · 状态 <strong>${statusLabel}</strong>
    · 已选 <strong>${m.pickedCount}/10</strong>`;

  if (m.status === "drafting" && m.timerActive) {
    timerEl.classList.remove("hidden");
    timerEl.innerHTML = `⏱ 倒计时 <strong>${m.timerRemaining}</strong> 秒`;
  } else {
    timerEl.classList.add("hidden");
  }

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

  $("player-waiting").classList.add("hidden");
  $("player-not-in-match").classList.add("hidden");
  $("player-draft").classList.remove("hidden");

  const self = data.self;
  const selfSide = self.side;
  const m = data.match;
  const timerActive = m.timerActive;

  const timerDisplay = $("timer-display");
  if (m.status === "drafting") {
    timerDisplay.classList.remove("hidden");
    $("timer-seconds").textContent = String(m.timerRemaining);
    timerDisplay.classList.toggle("timer-urgent", m.timerRemaining <= 30);
  } else {
    timerDisplay.classList.add("hidden");
  }

  renderIncomingSwaps(self.incomingSwaps || []);

  const teammates = data.sides[selfSide].filter((p) => p.name !== currentUser.name);
  $("teammates-list").innerHTML = teammates.map((p) => renderPlayerRow(p)).join("");

  const enemySide = selfSide === "blue" ? "red" : "blue";
  const enemies = data.sides[enemySide];
  $("enemies-list").innerHTML = enemies
    .map((p) => renderEnemyRow(p, timerActive, self, self.outgoingSwaps || []))
    .join("");

  bindSwapButtons();

  const waiting = self.waiting || [];
  $("waiting-pool").innerHTML = waiting.length
    ? waiting
        .map((hero) => renderPoolCard(hero, { available: true, canPick: timerActive }))
        .join("")
    : `<p class="empty-bench">待选池已空</p>`;
  bindPickHandlers($("waiting-pool"));

  const pool = data.teamPools[selfSide] || [];
  $("team-pool").innerHTML = pool.map((entry) => renderPoolEntry(entry, timerActive)).join("");
  bindPickHandlers($("team-pool"));

  const myPickSection = $("my-pick-section");
  if (self.selected) {
    myPickSection.classList.remove("hidden");
    $("my-pick-card").innerHTML = renderHeroCard(self.selected);
  } else {
    myPickSection.classList.add("hidden");
    $("my-pick-card").innerHTML = "";
  }

  $("phase-complete").classList.toggle("hidden", !m.allDone);
  if (m.allDone) {
    $("final-summary").innerHTML = renderSummaryHtml(data, false);
  }
}

function renderIncomingSwaps(swaps) {
  const panel = $("swap-incoming");
  if (!swaps.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <h3>收到交换请求</h3>
    ${swaps
      .map(
        (s) => `
      <div class="swap-request" data-id="${s.id}">
        <p><strong>${s.from}</strong> 想用 <strong>${heroLabel(s.fromHero)}</strong> 换你的 <strong>${heroLabel(s.toHero)}</strong></p>
        <div class="swap-actions">
          <button class="btn btn-primary btn-sm btn-swap-accept">同意</button>
          <button class="btn btn-ghost btn-sm btn-swap-decline">拒绝</button>
        </div>
      </div>`
      )
      .join("")}`;

  panel.querySelectorAll(".btn-swap-accept").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.closest(".swap-request")?.dataset.id;
      if (!id) return;
      try {
        await api("/api/draft/swap-respond", {
          method: "POST",
          body: JSON.stringify({ requestId: id, accept: true }),
        });
        refreshState();
      } catch (e) {
        alert(e.message);
      }
    };
  });

  panel.querySelectorAll(".btn-swap-decline").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.closest(".swap-request")?.dataset.id;
      if (!id) return;
      try {
        await api("/api/draft/swap-respond", {
          method: "POST",
          body: JSON.stringify({ requestId: id, accept: false }),
        });
        refreshState();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderPlayerRow(p) {
  let heroHtml = '<span class="muted">未选</span>';
  if (p.selected?.hidden) heroHtml = '<span class="hidden-pick">???</span>';
  else if (p.selected) {
    heroHtml = `<img class="mini-splash" src="${splashSrc(p.selected)}" alt="" onerror="this.src='${p.selected.splash_url || ""}'">
      <span>${heroLabel(p.selected)}</span>`;
  }

  const statusIcon = p.hasPick ? "✓" : "○";
  return `<li class="teammate-row ${p.hasPick ? "done" : ""}">
    <span class="status-icon">${statusIcon}</span>
    <span class="p-name">${p.name}</span>
    <span class="p-hero">${heroHtml}</span>
  </li>`;
}

function renderEnemyRow(p, timerActive, self, outgoingSwaps) {
  let heroHtml = '<span class="muted">未选</span>';
  if (p.selected?.hidden) heroHtml = '<span class="hidden-pick">???</span>';
  else if (p.selected) {
    heroHtml = `<img class="mini-splash" src="${splashSrc(p.selected)}" alt="" onerror="this.src='${p.selected.splash_url || ""}'">
      <span>${heroLabel(p.selected)}</span>`;
  }

  const pending = outgoingSwaps.some((s) => s.to === p.name);
  const canSwap = timerActive && self.selected && p.hasPick && !pending;

  return `<li class="teammate-row enemy-row">
    <span class="p-name">${p.name}</span>
    <span class="p-hero">${heroHtml}</span>
    ${
      pending
        ? '<span class="swap-pending">等待回应</span>'
        : canSwap
          ? `<button class="btn btn-secondary btn-sm btn-swap" data-to="${p.name}">交换</button>`
          : ""
    }
  </li>`;
}

function bindSwapButtons() {
  document.querySelectorAll(".btn-swap").forEach((btn) => {
    btn.onclick = async () => {
      const toPlayer = btn.dataset.to;
      if (!toPlayer || !confirm(`向 ${toPlayer} 发起英雄交换？需对方同意。`)) return;
      try {
        await api("/api/draft/swap-request", {
          method: "POST",
          body: JSON.stringify({ toPlayer }),
        });
        refreshState();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderPoolEntry(entry, timerActive) {
  if (!entry.hero) return "";
  if (entry.taken && entry.owner?.hidden) {
    return `<div class="pool-card taken hidden-card">???</div>`;
  }
  const available = entry.available && timerActive;
  return renderPoolCard(entry.hero, {
    available,
    taken: entry.taken,
    owner: entry.owner,
    heroId: entry.heroId,
  });
}

function renderPoolCard(hero, opts = {}) {
  const { available, taken, owner, heroId, canPick } = opts;
  const id = heroId || hero?.id;
  const cls = ["pool-card"];
  if (taken) cls.push("taken");
  if (available || canPick) cls.push("clickable");

  return `
    <div class="${cls.join(" ")}" data-id="${id}">
      <img src="${splashSrc(hero)}" alt="" onerror="this.src='${hero?.splash_url || ""}'">
      <div class="pool-label">${heroLabel(hero)}</div>
      ${owner && typeof owner === "string" ? `<div class="pool-owner">${owner}</div>` : ""}
      ${taken && !owner ? '<div class="pool-owner">已选</div>' : ""}
    </div>`;
}

function bindPickHandlers(container) {
  container.querySelectorAll(".pool-card.clickable").forEach((card) => {
    card.onclick = async () => {
      const heroId = card.dataset.id;
      const champ = championMap[heroId];
      const action = $("my-pick-section").classList.contains("hidden") ? "选择" : "替换为";
      if (!heroId || !confirm(`确认${action} ${heroLabel(champ)} ？`)) return;
      try {
        await api("/api/draft/pick", { method: "POST", body: JSON.stringify({ heroId }) });
        refreshState();
      } catch (e) {
        alert(e.message);
      }
    };
  });
}

function renderHeroCard(champ) {
  return `
    <div class="hero-card">
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
