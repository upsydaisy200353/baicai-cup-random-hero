/** 6 支队伍 · 共 30 名队员 + 管理员账号 */

const TEAMS = [
  { no: 1, name: "明月", captain: "明月", skill: 1, members: ["光之巨人(霸哥)", "坚哥", "七元", "cola"] },
  { no: 2, name: "王姐", captain: "王姐", skill: 2, members: ["d4u", "源神", "花花", "小雨"] },
  { no: 3, name: "佛系", captain: "佛系", skill: 3, members: ["crazy", "baozi", "衍衍衍珏", "李相赫"] },
  { no: 4, name: "张神", captain: "张神", skill: 4, members: ["好运耶耶", "日会落", "天天小恶霸", "打牌"] },
  { no: 5, name: "暧昧", captain: "暧昧", skill: 5, members: ["ud大王", "教头", "本子", "根本吃不胖啊"] },
  { no: 6, name: "第六队", captain: null, skill: null, members: ["片", "雪乃", "香菇", "安捣", "汤圆"] },
];

function getTeamPlayers(team) {
  return team.captain ? [team.captain, ...team.members] : [...team.members];
}

const ROSTER = TEAMS.flatMap((team) =>
  getTeamPlayers(team).map((name) => ({
    name,
    teamNo: team.no,
    teamName: team.name,
    skill: team.skill,
    isCaptain: team.captain === name,
  }))
);

const ADMIN_ACCOUNT = {
  name: "管理员",
  role: "admin",
  teamNo: null,
  teamName: null,
};

function getAllAccounts() {
  return [...ROSTER.map((p) => ({ ...p, role: "player" })), ADMIN_ACCOUNT];
}

function findAccount(name) {
  if (name === ADMIN_ACCOUNT.name) return ADMIN_ACCOUNT;
  return ROSTER.find((p) => p.name === name) || null;
}

function verifyPassword(name, password) {
  const adminPass = process.env.ADMIN_PASSWORD || "baicai2024";
  const playerPass = process.env.PLAYER_PASSWORD || "123456";
  if (name === ADMIN_ACCOUNT.name) return password === adminPass;
  return findAccount(name) && password === playerPass;
}

module.exports = { TEAMS, ROSTER, ADMIN_ACCOUNT, getAllAccounts, findAccount, verifyPassword, getTeamPlayers };
