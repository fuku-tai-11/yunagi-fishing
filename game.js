"use strict";

const byId = (id) => document.getElementById(id);
const fishTimeLimit = 5000;
const tiers = [
  { from: 0, name: "フナ", keys: 1, points: 100, letters: "FJDKSL" },
  { from: 3, name: "コイ", keys: 2, points: 250, letters: "ASDFGHJKL" },
  { from: 6, name: "ニジマス", keys: 3, points: 450, letters: "QWERTYUIOPASDFGHJKL" },
  { from: 10, name: "イワナ", keys: 4, points: 700, letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { from: 15, name: "イトウ", keys: 5, points: 1000, letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
];
const recordKey = "yunagi-fishing-history-v1";
const number = new Intl.NumberFormat("ja-JP");
const date = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
let records = readRecords() ?? [];
let round;
let bestThisRound;
let frameId;

function typingResult(hits, misses) {
  const accuracy = hits + misses ? Math.round(100 * hits / (hits + misses)) + "%" : "—";
  return `正打 ${hits} · 正確率 ${accuracy}`;
}

function readRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(recordKey) ?? "[]");
    if (Array.isArray(saved)) {
      return saved.filter((item) => item && Number.isFinite(item.score) &&
        Number.isFinite(item.caught) && Number.isFinite(new Date(item.at).getTime()));
    }
  } catch {
    byId("storage-note").hidden = false;
  }
  return null;
}

function renderRecords() {
  const best = records.reduce((high, item) => Math.max(high, item.score), 0);
  byId("best").textContent = records.length ? number.format(best) : "—";
  byId("empty").hidden = records.length > 0;
  byId("records").replaceChildren(...records.map((item) => {
    const row = document.createElement("li");
    const stamp = document.createElement("time");
    stamp.dateTime = item.at;
    stamp.textContent = date.format(new Date(item.at)) + " · " + item.caught + "匹";
    const score = document.createElement("strong");
    score.textContent = number.format(item.score) + " 点";
    row.append(stamp, score);
    if (Number.isFinite(item.hits) && Number.isFinite(item.misses)) {
      const typing = document.createElement("small");
      typing.textContent = typingResult(item.hits, item.misses);
      row.append(typing);
    }
    return row;
  }));
}

function showStats() {
  byId("score").textContent = number.format(round.score);
  byId("count").textContent = round.caught;
}

function nextFish(now, message) {
  const tier = tiers.findLast((candidate) => round.caught >= candidate.from);
  const choices = [...tier.letters];
  const keys = new Map();
  while (keys.size < tier.keys) {
    const [key] = choices.splice(Math.floor(Math.random() * choices.length), 1);
    const button = document.createElement("button");
    button.className = "key";
    button.type = "button";
    button.textContent = key.toLowerCase();
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => pressKey(key, performance.now()));
    keys.set(key, button);
  }
  round.fish = { tier, keys, pressed: new Set(), expires: Math.min(now + fishTimeLimit, round.expires) };
  byId("fish").textContent = tier.name;
  byId("value").textContent = "+" + number.format(tier.points) + " 点";
  byId("keys").replaceChildren(...keys.values());
  byId("feedback").textContent = message;
}

function start() {
  if (round) return;
  const now = performance.now();
  round = { score: 0, caught: 0, hits: 0, misses: 0, expires: now + 60000 };
  bestThisRound = records.reduce((high, item) => Math.max(high, item.score), -1);
  showStats();
  byId("menu").hidden = true;
  byId("challenge").hidden = false;
  nextFish(now, "順不同で押せます");
  frame(now);
}

function finish() {
  const { score, caught, hits, misses } = round;
  cancelAnimationFrame(frameId);
  round = undefined;
  records = [{ at: new Date().toISOString(), score, caught, hits, misses }, ...(readRecords() ?? records)];
  try {
    localStorage.setItem(recordKey, JSON.stringify(records));
  } catch {
    byId("storage-note").hidden = false;
  }
  renderRecords();
  byId("time").textContent = "0.0";
  byId("challenge").hidden = true;
  byId("menu").hidden = false;
  byId("message").textContent = `終了！ ${caught}匹 · ${number.format(score)} 点` +
    (score > bestThisRound ? " · 自己ベスト更新" : "") + " ／ " + typingResult(hits, misses);
  byId("start").firstChild.textContent = "もう一度釣る ";
  byId("start").focus({ preventScroll: true });
}

function checkTime(now) {
  if (now >= round.expires) {
    finish();
    return false;
  }
  if (now >= round.fish.expires) {
    nextFish(now, "魚が逃げた！ 次の魚に挑戦");
    return false;
  }
  return true;
}

function pressKey(key, now) {
  if (!round || !checkTime(now)) return;
  const { fish } = round;
  const button = fish.keys.get(key);
  if (!button || fish.pressed.has(key)) {
    round.misses++;
    byId("feedback").textContent = "まだ押していないキーを探そう";
    return;
  }
  round.hits++;
  fish.pressed.add(key);
  button.setAttribute("aria-pressed", "true");
  if (fish.pressed.size === fish.keys.size) {
    round.caught++;
    round.score += fish.tier.points;
    showStats();
    nextFish(now, `${fish.tier.name}を釣った！ ＋${number.format(fish.tier.points)}点`);
  }
}

function frame(now) {
  if (!round) return;
  checkTime(now);
  drawLake(now, Boolean(round));
  if (!round) return;
  const remaining = round.fish.expires - now;
  byId("time").textContent = (Math.ceil((round.expires - now) / 100) / 10).toFixed(1);
  byId("bite-time").textContent = (Math.ceil(remaining / 100) / 10).toFixed(1) + " 秒";
  byId("meter-fill").style.transform = `scaleX(${remaining / fishTimeLimit})`;
  frameId = requestAnimationFrame(frame);
}

const canvas = byId("lake");
const ctx = canvas.getContext("2d");

function rect(color, x, y, width, height) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function polygon(color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function drawLake(now, playing = false) {
  if (!ctx) return;
  const sky = ["#52677e", "#687789", "#8d8490", "#ad8c92", "#ce9993", "#eaa890", "#f8bd94"];
  sky.forEach((color, index) => rect(color, 0, index * 13, 360, 13));
  ctx.fillStyle = "#ffe3a4";
  ctx.beginPath();
  ctx.arc(249, 66, 17, 0, Math.PI * 2);
  ctx.fill();
  rect("#f9bc92", 232, 71, 35, 2);
  for (const [x, y, w] of [[41, 28, 48], [110, 42, 55], [270, 31, 53], [209, 46, 25]]) {
    rect("#c6a0a1", x, y, w, 2);
    rect("#ad929b", x + 10, y + 3, w - 13, 1);
  }
  polygon("#7e7685", [[0,61],[17,56],[36,61],[57,59],[83,73],[113,79],[140,64],[160,68],[185,80],[216,87],[266,87],[293,76],[322,65],[339,67],[360,57],[360,99],[0,99]]);
  polygon("#4e5d6b", [[0,75],[21,70],[48,77],[75,85],[106,87],[142,86],[173,91],[255,92],[293,88],[317,79],[341,75],[360,78],[360,104],[0,104]]);
  rect("#465f6c", 0, 96, 360, 72);
  rect("#576e77", 0, 96, 360, 13);
  rect("#3d5865", 0, 126, 360, 42);
  for (let index = 0; index < 64; index++) {
    const y = 98 + (index * 19) % 69;
    const x = (index * 67 + Math.floor(now / 140) * (index % 3)) % 360;
    rect(index % 3 === 0 ? "#74838a" : "#526e77", x, y, 6 + (index * 11) % 28, 1);
  }
  for (let index = 0; index < 19; index++) {
    const y = 96 + index * 3;
    const width = 10 + (index * 17) % (22 + index * 3);
    const x = 249 - Math.floor(width / 2) + Math.round(Math.sin(index + now / 600) * 7);
    rect(index < 8 ? "#d1a28b" : "#a48884", x, y, width, 1);
  }
  polygon("#263c45", [[0,140],[27,139],[64,128],[103,128],[103,137],[62,168],[0,168]]);
  polygon("#825f51", [[0,139],[64,125],[103,125],[64,159],[0,167]]);
  for (let i = 0; i < 7; i++) rect("#5e4a47", i * 12, 143 - i * 2, 23, 1);
  rect("#382e31", 101, 127, 4, 18);
  rect("#382e31", 59, 145, 5, 23);
  rect("#303540", 63, 111, 13, 15);
  rect("#25343c", 66, 104, 9, 9);
  rect("#d29873", 72, 105, 5, 5);
  rect("#b68063", 63, 101, 12, 4);
  rect("#d4a482", 61, 105, 18, 2);
  rect("#a4665d", 65, 112, 9, 8);
  rect("#25343c", 71, 122, 12, 4);
  rect("#b68063", 72, 115, 9, 3);
  ctx.strokeStyle = "#f3c59c";
  ctx.beginPath();
  ctx.moveTo(78, 116);
  ctx.quadraticCurveTo(111, 89, 142, 96);
  ctx.stroke();
  const bobY = 118 + (playing ? Math.round(Math.sin(now / 130) * 2) : 0);
  rect("#b4a7a0", 142, 96, 1, bobY - 96);
  rect("#f7e5ad", 141, bobY, 3, 2);
  rect("#f28877", 140, bobY + 2, 5, 2);
  rect("#9ba7a1", 135, bobY + 5, 15, 1);
  polygon("#213a41", [[299,168],[316,154],[335,152],[351,144],[360,144],[360,168]]);
  for (const [x, y, h] of [[322,156,20],[331,156,25],[338,153,15],[348,151,28],[355,148,23]]) {
    rect("#29464b", x, y - h, 2, h);
    rect("#957864", x - 1, y - h - 4, 4, 6);
  }
}

byId("start").addEventListener("click", start);
document.addEventListener("keydown", (event) => {
  if (!round || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  const physicalKey = /^Key([A-Z])$/.exec(event.code)?.[1];
  const key = (event.isComposing || event.key === "Process" ? physicalKey : event.key)?.toUpperCase();
  if (key && /^[A-Z]$/.test(key)) {
    event.preventDefault();
    pressKey(key, performance.now());
  }
});
renderRecords();
drawLake(0);
