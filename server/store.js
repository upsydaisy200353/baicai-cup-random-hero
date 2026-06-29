const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "runtime-state.json");

const state = {
  tokens: new Map(),
  match: null,
  drafts: {},
  history: [],
};

function loadPersisted() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (raw.match) state.match = raw.match;
    if (raw.drafts) state.drafts = raw.drafts;
    if (raw.history) state.history = raw.history;
  } catch {
    /* ignore corrupt file */
  }
}

function persist() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        { match: state.match, drafts: state.drafts, history: state.history },
        null,
        2
      )
    );
  } catch {
    /* non-fatal on read-only fs */
  }
}

function createToken(account) {
  const token = crypto.randomUUID();
  state.tokens.set(token, {
    name: account.name,
    role: account.role,
    teamNo: account.teamNo,
    teamName: account.teamName,
    loginAt: new Date().toISOString(),
  });
  return token;
}

function getUser(token) {
  return state.tokens.get(token) || null;
}

function resetDraftState() {
  state.drafts = {};
  if (state.match) {
    state.match.bench = { blue: [], red: [] };
    state.match.pickedGlobally = [];
    state.match.startedAt = null;
    state.match.completedAt = null;
  }
  persist();
}

module.exports = { state, loadPersisted, persist, createToken, getUser, resetDraftState };
