const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { TEAMS, getAllAccounts, findAccount, verifyPassword, getTeamPlayers } = require("./players");
const {
  state,
  loadPersisted,
  persist,
  createToken,
  getUser,
  resetDraftState,
} = require("./store");
const {
  buildSides,
  isInMatch,
  initPlayerDraft,
  rollForPlayer,
  confirmPick,
  pickFromBench,
  allParticipantsDone,
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
  res.json({ ok: true, champions: champions.length });
});

app.get("/api/roster", (_req, res) => {
  res.json({
    teams: TEAMS.map((t) => ({
      no: t.no,
      name: t.name,
      skill: t.skill,
      players: getTeamPlayers(t),
    })),
    totalPlayers: getAllAccounts().filter((a) => a.role === "player").length,
  });
});

app.post("/api/login", (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: "请输入昵称和密码" });

  if (!verifyPassword(name, password)) {
    return res.status(401).json({ error: "昵称或密码错误" });
  }

  const account = name === "管理员" ? { name: "管理员", role: "admin" } : findAccount(name);
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
    bench: { blue: [], red: [] },
    pickedGlobally: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };

  state.drafts = {};
  [...sides.blue, ...sides.red].forEach((p) => {
    state.drafts[p.name] = initPlayerDraft(p.name);
  });

  persist();
  res.json({ ok: true, match: state.match });
});

app.post("/api/admin/match/start", auth, adminOnly, (req, res) => {
  if (!state.match) return res.status(400).json({ error: "请先创建对阵" });
  state.match.status = "drafting";
  state.match.startedAt = new Date().toISOString();
  persist();
  res.json({ ok: true });
});

app.post("/api/admin/match/reset", auth, adminOnly, (_req, res) => {
  state.match = null;
  resetDraftState();
  res.json({ ok: true });
});

app.post("/api/draft/roll", auth, (req, res) => {
  if (!state.match || state.match.status !== "drafting") {
    return res.status(400).json({ error: "当前未开放选英雄" });
  }
  if (!isInMatch(state.match, req.user.name)) {
    return res.status(403).json({ error: "你不在这场比赛的 10 人名单中" });
  }

  if (!state.drafts[req.user.name]) {
    state.drafts[req.user.name] = initPlayerDraft(req.user.name);
  }

  const result = rollForPlayer(state.match, state.drafts, champions, req.user.name);
  if (result.error) return res.status(400).json({ error: result.error });

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.post("/api/draft/pick", auth, (req, res) => {
  const { heroId } = req.body || {};
  if (!heroId) return res.status(400).json({ error: "请选择英雄" });
  if (!state.match || state.match.status !== "drafting") {
    return res.status(400).json({ error: "当前未开放选英雄" });
  }

  const result = confirmPick(state.match, state.drafts, req.user.name, heroId);
  if (result.error) return res.status(400).json({ error: result.error });

  if (allParticipantsDone(state.match, state.drafts)) {
    state.match.status = "complete";
    state.match.completedAt = new Date().toISOString();
    state.history.unshift({
      id: state.match.id,
      completedAt: state.match.completedAt,
      teamA: state.match.teamA,
      teamB: state.match.teamB,
      labels: state.match.labels,
      picks: { ...state.drafts },
    });
  }

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.post("/api/draft/pick-bench", auth, (req, res) => {
  const { heroId } = req.body || {};
  if (!heroId) return res.status(400).json({ error: "请选择英雄" });
  if (!state.match || state.match.status !== "drafting") {
    return res.status(400).json({ error: "当前未开放选英雄" });
  }

  const result = pickFromBench(state.match, state.drafts, req.user.name, heroId);
  if (result.error) return res.status(400).json({ error: result.error });

  if (allParticipantsDone(state.match, state.drafts)) {
    state.match.status = "complete";
    state.match.completedAt = new Date().toISOString();
    state.history.unshift({
      id: state.match.id,
      completedAt: state.match.completedAt,
      teamA: state.match.teamA,
      teamB: state.match.teamB,
      labels: state.match.labels,
      picks: { ...state.drafts },
    });
  }

  persist();
  res.json(buildPublicState(state.match, state.drafts, champions, req.user));
});

app.get("/api/history", auth, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
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
  console.log(`白菜杯随机英雄服务运行于 http://localhost:${PORT}`);
});
