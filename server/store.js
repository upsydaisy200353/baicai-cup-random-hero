const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "runtime-state.json");
const SESSION_SECRET =
  process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "baicai-cup-session-secret";

const state = {
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
      JSON.stringify({ match: state.match, drafts: state.drafts, history: state.history }, null, 2)
    );
  } catch {
    /* non-fatal on read-only fs */
  }
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function createToken(account) {
  return signToken({
    name: account.name,
    role: account.role || "player",
    teamNo: account.teamNo ?? null,
    teamName: account.teamName ?? null,
    loginAt: new Date().toISOString(),
  });
}

function getUser(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
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
