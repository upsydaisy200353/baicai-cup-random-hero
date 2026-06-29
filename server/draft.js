const crypto = require("crypto");
const { TEAMS, getTeamPlayers } = require("./players");

const POOL_SIZE = 15;
const TIMER_SECONDS = 120;

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateTeamPools(champions) {
  const ids = shuffle(champions.map((c) => c.id));
  if (ids.length < POOL_SIZE * 2) return null;
  return {
    blue: ids.slice(0, POOL_SIZE),
    red: ids.slice(POOL_SIZE, POOL_SIZE * 2),
  };
}

function initPlayerDraft() {
  return { selected: null, pickedAt: null };
}

function getSidePlayerNames(match, side) {
  return match.sides[side].map((p) => p.name);
}

function getHeroOwner(match, drafts, side, heroId, excludePlayer = null) {
  for (const name of getSidePlayerNames(match, side)) {
    if (name === excludePlayer) continue;
    if (drafts[name]?.selected === heroId) return name;
  }
  return null;
}

function getWaitingPool(match, drafts, side) {
  const pool = match.teamPools?.[side] || [];
  return pool.filter((heroId) => !getHeroOwner(match, drafts, side, heroId));
}

function isTimerActive(match) {
  if (match.status !== "drafting" || !match.timerEndsAt) return false;
  return Date.now() < new Date(match.timerEndsAt).getTime();
}

function getTimerRemaining(match) {
  if (!match.timerEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(match.timerEndsAt).getTime() - Date.now()) / 1000));
}

function expireTimerIfNeeded(match) {
  if (match.status === "drafting" && !isTimerActive(match)) {
    match.status = "complete";
    match.completedAt = new Date().toISOString();
    return true;
  }
  return false;
}

function startDraftTimer(match) {
  match.timerDuration = TIMER_SECONDS;
  match.timerEndsAt = new Date(Date.now() + TIMER_SECONDS * 1000).toISOString();
  match.status = "drafting";
  match.startedAt = new Date().toISOString();
  match.swapRequests = match.swapRequests || [];
}

function pickHero(match, drafts, playerName, heroId) {
  if (!isTimerActive(match)) return { error: "选英雄时间已结束" };

  const side = getSideForPlayer(match, playerName);
  if (!side) return { error: "你不在这场比赛的 10 人名单中" };

  if (!match.teamPools[side].includes(heroId)) {
    return { error: "该英雄不在本方英雄池内" };
  }

  const owner = getHeroOwner(match, drafts, side, heroId, playerName);
  if (owner) return { error: `该英雄已被队友 ${owner} 选用` };

  if (!drafts[playerName]) drafts[playerName] = initPlayerDraft();
  drafts[playerName].selected = heroId;
  drafts[playerName].pickedAt = new Date().toISOString();

  return { ok: true };
}

function requestSwap(match, drafts, fromPlayer, toPlayer) {
  if (!isTimerActive(match)) return { error: "选英雄时间已结束" };

  const fromSide = getSideForPlayer(match, fromPlayer);
  const toSide = getSideForPlayer(match, toPlayer);
  if (!fromSide || !toSide) return { error: "玩家不在本场名单中" };
  if (fromSide !== toSide) return { error: "只能与队友交换英雄" };

  const fromDraft = drafts[fromPlayer];
  const toDraft = drafts[toPlayer];
  if (!fromDraft?.selected) return { error: "你还未选择英雄" };
  if (!toDraft?.selected) return { error: "对方还未选择英雄" };
  if (fromPlayer === toPlayer) return { error: "不能与自己交换" };

  const pending = (match.swapRequests || []).find(
    (r) => r.status === "pending" && r.from === fromPlayer && r.to === toPlayer
  );
  if (pending) return { error: "已向对方发送交换请求，请等待回应" };

  const req = {
    id: crypto.randomUUID(),
    from: fromPlayer,
    to: toPlayer,
    fromHeroId: fromDraft.selected,
    toHeroId: toDraft.selected,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  match.swapRequests.push(req);
  return { ok: true, request: req };
}

function respondSwap(match, drafts, playerName, requestId, accept) {
  if (!isTimerActive(match)) return { error: "选英雄时间已结束" };

  const req = (match.swapRequests || []).find((r) => r.id === requestId);
  if (!req || req.to !== playerName) return { error: "交换请求不存在" };
  if (req.status !== "pending") return { error: "该请求已处理" };

  if (!accept) {
    req.status = "declined";
    req.resolvedAt = new Date().toISOString();
    return { ok: true };
  }

  const fromDraft = drafts[req.from];
  const toDraft = drafts[req.to];
  if (fromDraft?.selected !== req.fromHeroId || toDraft?.selected !== req.toHeroId) {
    req.status = "declined";
    req.resolvedAt = new Date().toISOString();
    return { error: "英雄已变更，交换失败" };
  }

  const tmp = fromDraft.selected;
  fromDraft.selected = toDraft.selected;
  toDraft.selected = tmp;
  fromDraft.pickedAt = new Date().toISOString();
  toDraft.pickedAt = new Date().toISOString();

  req.status = "accepted";
  req.resolvedAt = new Date().toISOString();
  return { ok: true };
}

function allParticipantsPicked(match, drafts) {
  const names = [...match.sides.blue, ...match.sides.red].map((p) => p.name);
  return names.every((n) => drafts[n]?.selected);
}

function buildPublicState(match, drafts, champions, viewer) {
  expireTimerIfNeeded(match);

  const champMap = Object.fromEntries(champions.map((c) => [c.id, c]));
  const viewerSide = viewer.role === "admin" ? "admin" : getSideForPlayer(match, viewer.name);
  const timerActive = isTimerActive(match);
  const allDone = match.status === "complete";

  const mapPlayer = (p, side) => {
    const d = drafts[p.name] || {};
    const base = { name: p.name, teamNo: p.teamNo, hasPick: !!d.selected };

    if (viewer.role === "admin" || viewerSide === side) {
      base.selected = d.selected ? champMap[d.selected] : null;
    } else if (allDone) {
      base.selected = d.selected ? champMap[d.selected] : null;
    } else {
      base.selected = d.selected ? { hidden: true } : null;
    }
    return base;
  };

  const mapPoolHero = (heroId, side) => {
    const owner = getHeroOwner(match, drafts, side, heroId);
    const hero = champMap[heroId];
    const entry = { heroId, hero, taken: !!owner };

    if (viewer.role === "admin" || viewerSide === side) {
      entry.owner = owner;
      entry.available = !owner;
    } else if (allDone) {
      entry.owner = owner;
      entry.available = !owner;
    } else {
      entry.available = !owner;
      if (owner) entry.owner = { hidden: true };
    }
    return entry;
  };

  const mapWaiting = (side) => {
    const waiting = getWaitingPool(match, drafts, side);
    return waiting.map((id) => {
      const hero = champMap[id];
      if (viewer.role === "admin" || viewerSide === side || allDone) {
        return { heroId: id, hero };
      }
      return { hidden: true };
    });
  };

  const selfDraft = drafts[viewer.name] || null;
  const selfSide = viewerSide !== "admin" ? viewerSide : null;
  const hideEnemy = viewer.role !== "admin" && !allDone && selfSide;

  const incomingSwaps = (match.swapRequests || [])
    .filter((r) => r.to === viewer.name && r.status === "pending")
    .map((r) => ({
      id: r.id,
      from: r.from,
      fromHero: champMap[r.fromHeroId],
      toHero: champMap[r.toHeroId],
    }));

  const outgoingSwaps = (match.swapRequests || [])
    .filter((r) => r.from === viewer.name && r.status === "pending")
    .map((r) => ({
      id: r.id,
      to: r.to,
      fromHero: champMap[r.fromHeroId],
      toHero: champMap[r.toHeroId],
    }));

  return {
    match: {
      id: match.id,
      status: match.status,
      labels: match.labels,
      teamA: match.teamA,
      teamB: match.teamB,
      timerRemaining: getTimerRemaining(match),
      timerActive,
      poolSize: POOL_SIZE,
      allDone,
      pickedCount: Object.values(drafts).filter((d) => d?.selected).length,
    },
    teamPools: {
      blue: hideEnemy && selfSide !== "blue" ? [] : (match.teamPools?.blue || []).map((id) => mapPoolHero(id, "blue")),
      red: hideEnemy && selfSide !== "red" ? [] : (match.teamPools?.red || []).map((id) => mapPoolHero(id, "red")),
    },
    waitingPool: {
      blue: hideEnemy && selfSide !== "blue" ? [] : mapWaiting("blue"),
      red: hideEnemy && selfSide !== "red" ? [] : mapWaiting("red"),
    },
    sides: {
      blue: hideEnemy && selfSide !== "blue" ? [] : match.sides.blue.map((p) => mapPlayer(p, "blue")),
      red: hideEnemy && selfSide !== "red" ? [] : match.sides.red.map((p) => mapPlayer(p, "red")),
    },
    self:
      viewer.role === "player" && isInMatch(match, viewer.name)
        ? {
            selected: selfDraft?.selected ? champMap[selfDraft.selected] : null,
            side: selfSide,
            timerActive,
            canPick: timerActive,
            waiting: selfSide ? getWaitingPool(match, drafts, selfSide).map((id) => champMap[id]) : [],
            incomingSwaps,
            outgoingSwaps,
          }
        : null,
    rules: {
      poolSize: POOL_SIZE,
      timerSeconds: TIMER_SECONDS,
      teamUnique: true,
      teammateSwap: true,
      enemyHiddenUntilEnd: true,
    },
  };
}

module.exports = {
  POOL_SIZE,
  TIMER_SECONDS,
  buildSides,
  getSideForPlayer,
  isInMatch,
  initPlayerDraft,
  generateTeamPools,
  startDraftTimer,
  pickHero,
  requestSwap,
  respondSwap,
  allParticipantsPicked,
  buildPublicState,
  expireTimerIfNeeded,
};
