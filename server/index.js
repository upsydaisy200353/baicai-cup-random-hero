const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { TEAMS, findLoginAccount, getTeamPlayers } = require("./players");
const { state, loadPersisted, persist, createToken, getUser, resetDraftState } = require("./store");
const {
  buildSides,
  isInMatch,
  initPlayerDraft,
  generateTeamPools,
  startDraftTimer,
  pickHero,
  requestSwap,
  respondSwap,
  buildPublicState,
} = require("./draft");

const app = express();
const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8765;

let champions = [];

function loadChampions() {
  const file = path.join(ROOT, "data", "champions.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  champions = data.champions.map((c) => ({
    id: c.id,
    name_zh: c.name_zh,
    title_zh: c.title_zh,
    splash_key: c.splash_key,
    splash_url: c.splash_url,
  }));
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
  if (!token) return res.status(401).json({ error: "未登录" });
  const user = getUser(token);
  if (!user) return res.status(401).json({ error: "登录已过期，请重新登录" });
  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  next();
}

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, champions: champions.length, version: 3 });
});

app.get("/api/roster", (_req, res) => {
  res.json({
    teams: TEAMS.map((t) => ({
      no: t.no,
      name: t.name,
      skill: t.skill,
      players: getTeamPlayers(t),
    })),
    totalPlayers: 30,
  });
});

app.post("/api/login", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "请选择昵称" });

  const account = findLoginAccount(name);
  if (!account) return res.status(400).json({ error: "昵称不在名单中" });

  const token = createToken(account);
  res.json({
    token,
    user: {
      name: account.name,
      role: account.role,
      teamNo: account.teamNo ?? null,
      teamName: account.teamName ?? null,
    },
  });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/champions", (_req, res) => {
  res.json({ champions });
});

app.get("/api/match", auth, (req, res) => {
  if (!state.match) return res.json({ match: null });
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.post("/api/admin/match", auth, adminOnly, (req, res) => {
  const { teamA, teamB } = req.body || {};
  if (!teamA || !teamB || teamA === teamB) {
    return res.status(400).json({ error: "请选择两支不同的队伍" });
  }

  const sides = buildSides(Number(teamA), Number(teamB));
  if (!sides) return res.status(400).json({ error: "队伍无效" });

  state.match = {
    id: crypto.randomUUID(),
    status: "lobby",
    teamA: Number(teamA),
    teamB: Number(teamB),
    sides: { blue: sides.blue, red: sides.red },
    labels: sides.labels,
    teamPools: { blue: [], red: [] },
    swapRequests: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    timerEndsAt: null,
    timerDuration: 120,
  };

  state.drafts = {};
  [...sides.blue, ...sides.red].forEach((p) => {
    state.drafts[p.name] = initPlayerDraft();
  });

  persist();
  res.json({ ok: true });
});

app.post("/api/admin/match/start", auth, adminOnly, (req, res) => {
  if (!state.match) return res.status(400).json({ error: "请先创建对阵" });

  const pools = generateTeamPools(champions);
  if (!pools) return res.status(400).json({ error: "英雄数据不足" });

  state.match.teamPools = pools;
  startDraftTimer(state.match);
  persist();
  res.json({ ok: true });
});

app.post("/api/admin/match/reset", auth, adminOnly, (_req, res) => {
  state.match = null;
  resetDraftState();
  persist();
  res.json({ ok: true });
});

app.post("/api/draft/pick", auth, (req, res) => {
  const { heroId } = req.body || {};
  if (!heroId) return res.status(400).json({ error: "请选择英雄" });
  if (!state.match) return res.status(400).json({ error: "当前无对阵" });

  const result = pickHero(state.match, state.drafts, req.user.name, heroId);
  if (result.error) return res.status(400).json({ error: result.error });

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.post("/api/draft/swap-request", auth, (req, res) => {
  const { toPlayer } = req.body || {};
  if (!toPlayer) return res.status(400).json({ error: "请指定交换对象" });
  if (!state.match) return res.status(400).json({ error: "当前无对阵" });

  const result = requestSwap(state.match, state.drafts, req.user.name, toPlayer);
  if (result.error) return res.status(400).json({ error: result.error });

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.post("/api/draft/swap-respond", auth, (req, res) => {
  const { requestId, accept } = req.body || {};
  if (!requestId) return res.status(400).json({ error: "无效请求" });
  if (!state.match) return res.status(400).json({ error: "当前无对阵" });

  const result = respondSwap(state.match, state.drafts, req.user.name, requestId, !!accept);
  if (result.error) return res.status(400).json({ error: result.error });

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.get("/api/history", auth, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  res.json({ history: state.history });
});

app.use(
  express.static(ROOT, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
      }
    },
  })
);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (path.extname(req.path)) return res.status(404).send("Not found");
  res.sendFile(path.join(ROOT, "index.html"));
});

loadPersisted();
loadChampions();

app.listen(PORT, () => {
  console.log(`白菜杯随机英雄 v3 运行于 http://localhost:${PORT}`);
});
