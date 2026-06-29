const { TEAMS, getTeamPlayers } = require("./players");

function getTeamByNo(no) {
  return TEAMS.find((t) => t.no === no) || null;
}

function buildSides(teamANo, teamBNo) {
  const a = getTeamByNo(teamANo);
  const b = getTeamByNo(teamBNo);
  if (!a || !b) return null;
  return {
    blue: getTeamPlayers(a).map((name) => ({ name, teamNo: a.no, teamName: a.name })),
    red: getTeamPlayers(b).map((name) => ({ name, teamNo: b.no, teamName: b.name })),
    labels: { blue: `${a.no}队 · ${a.name}`, red: `${b.no}队 · ${b.name}` },
  };
}

function getSideForPlayer(match, playerName) {
  if (match.sides.blue.some((p) => p.name === playerName)) return "blue";
  if (match.sides.red.some((p) => p.name === playerName)) return "red";
  return null;
}

function isInMatch(match, playerName) {
  return !!getSideForPlayer(match, playerName);
}

function getAvailablePool(match, champions) {
  const used = new Set(match.pickedGlobally || []);
  return champions.filter((c) => !used.has(c.id));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rollOffer(match, champions, count = 3) {
  const pool = getAvailablePool(match, champions);
  if (pool.length < count) return null;
  return shuffle(pool)
    .slice(0, count)
    .map((c) => c.id);
}

function initPlayerDraft(name) {
  return {
    status: "idle",
    offered: [],
    selected: null,
    rollCount: 0,
    pickedAt: null,
    lastRolledAt: null,
  };
}

/** 确认选择：未选中的 2 个进入本方待选池（ARAM 队友可抢） */
function confirmPick(match, drafts, playerName, heroId) {
  const draft = drafts[playerName];
  if (!draft || draft.status !== "offered") {
    return { error: "当前没有可确认的英雄，请先随机" };
  }
  if (!draft.offered.includes(heroId)) {
    return { error: "只能从本次随机结果中选择" };
  }
  if ((match.pickedGlobally || []).includes(heroId)) {
    return { error: "该英雄已被选用" };
  }

  const side = getSideForPlayer(match, playerName);
  if (!side) return { error: "你不在这场比赛的 10 人名单中" };

  const toBench = draft.offered.filter((id) => id !== heroId);
  match.bench[side].push(
    ...toBench.map((id) => ({
      heroId: id,
      fromPlayer: playerName,
      addedAt: new Date().toISOString(),
    }))
  );

  draft.selected = heroId;
  draft.status = "done";
  draft.offered = [];
  draft.pickedAt = new Date().toISOString();
  match.pickedGlobally.push(heroId);

  return { ok: true };
}

/** 从本方待选池直接选用（不消耗随机次数） */
function pickFromBench(match, drafts, playerName, heroId) {
  const draft = drafts[playerName];
  if (!draft || draft.status === "done") {
    return { error: "你已经选完英雄了" };
  }
  const side = getSideForPlayer(match, playerName);
  if (!side) return { error: "你不在这场比赛的 10 人名单中" };

  const idx = match.bench[side].findIndex((b) => b.heroId === heroId);
  if (idx < 0) return { error: "待选池中没有该英雄" };
  if ((match.pickedGlobally || []).includes(heroId)) {
    return { error: "该英雄已被选用" };
  }

  match.bench[side].splice(idx, 1);
  draft.selected = heroId;
  draft.status = "done";
  draft.offered = [];
  draft.pickedAt = new Date().toISOString();
  match.pickedGlobally.push(heroId);

  return { ok: true };
}

function rollForPlayer(match, drafts, champions, playerName) {
  const draft = drafts[playerName];
  if (!draft) return { error: "未加入选英雄" };
  if (draft.status === "done") return { error: "你已经选完英雄了" };

  const offered = rollOffer(match, champions);
  if (!offered) return { error: "可用英雄不足，无法继续随机" };

  draft.offered = offered;
  draft.status = "offered";
  draft.rollCount += 1;
  draft.lastRolledAt = new Date().toISOString();

  return { ok: true, offered };
}

function allParticipantsDone(match, drafts) {
  const names = [...match.sides.blue, ...match.sides.red].map((p) => p.name);
  return names.every((n) => drafts[n]?.status === "done");
}

function buildPublicState(match, drafts, champions, viewer) {
  const champMap = Object.fromEntries(champions.map((c) => [c.id, c]));
  const viewerSide = viewer.role === "admin" ? "admin" : getSideForPlayer(match, viewer.name);
  const allDone = allParticipantsDone(match, drafts);

  const mapPlayer = (p, side) => {
    const d = drafts[p.name] || {};
    const base = { name: p.name, teamNo: p.teamNo, status: d.status || "idle" };

    if (viewer.role === "admin" || viewerSide === side) {
      base.selected = d.selected ? champMap[d.selected] : null;
      base.rollCount = d.rollCount || 0;
    } else if (allDone) {
      base.selected = d.selected ? champMap[d.selected] : null;
    } else {
      base.selected = d.status === "done" ? { hidden: true } : null;
    }
    return base;
  };

  const mapBench = (side) => {
    const bench = match.bench[side] || [];
    if (viewer.role === "admin" || viewerSide === side) {
      return bench.map((b) => ({
        heroId: b.heroId,
        hero: champMap[b.heroId],
        fromPlayer: b.fromPlayer,
      }));
    }
    if (allDone) {
      return bench.map((b) => ({ heroId: b.heroId, hero: champMap[b.heroId], fromPlayer: b.fromPlayer }));
    }
    return bench.map(() => ({ hidden: true }));
  };

  const selfDraft = drafts[viewer.name] || null;
  const selfOffered =
    selfDraft?.status === "offered" && selfDraft.offered
      ? selfDraft.offered.map((id) => champMap[id])
      : [];

  return {
    match: {
      id: match.id,
      status: match.status,
      labels: match.labels,
      teamA: match.teamA,
      teamB: match.teamB,
      allDone,
      pickedCount: (match.pickedGlobally || []).length,
    },
    sides: {
      blue: match.sides.blue.map((p) => mapPlayer(p, "blue")),
      red: match.sides.red.map((p) => mapPlayer(p, "red")),
    },
    bench: {
      blue: mapBench("blue"),
      red: mapBench("red"),
    },
    self: viewer.role === "player" && isInMatch(match, viewer.name)
      ? {
          status: selfDraft?.status || "idle",
          offered: selfOffered,
          selected: selfDraft?.selected ? champMap[selfDraft.selected] : null,
          rollCount: selfDraft?.rollCount || 0,
          canRoll: selfDraft?.status !== "done",
          canPick: selfDraft?.status === "offered",
          side: viewerSide,
        }
      : null,
    rules: {
      rollSize: 3,
      benchFromUnpicked: 2,
      globalUnique: true,
      enemyHiddenUntilComplete: true,
    },
  };
}

module.exports = {
  buildSides,
  getSideForPlayer,
  isInMatch,
  initPlayerDraft,
  rollForPlayer,
  confirmPick,
  pickFromBench,
  allParticipantsDone,
  buildPublicState,
};
