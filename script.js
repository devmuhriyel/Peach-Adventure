// Bantay Ulan - game logic

var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");
var bg = document.createElement("canvas");
var bgCtx = bg.getContext("2d");

var W = 0, H = 0, S = 1;
var groundY, nestX, nestY, catX;

var LINE = "#4a3347";     // pencil color
var CREAM = "#fff6ee";
var PINK = "#ff9fc2";

// ---------- STATE ----------

var mode = "title";       // title, story, play, ending
var storyStep = 0;
var storyTime = 0;
var endTime = 0;
var won = false;
var endShown = false;

var wet = 0;              // how wet the bird is (3 = wakes up)
var wave = 0;
var TOTAL_WAVES = 5;

var drops = [];
var slashes = [];
var particles = [];
var toSpawn = 0;
var bigOnePending = false;
var spawnTimer = 0;
var waveTimer = 0;

var scratchTimer = 0;
var dizzyTimer = 0;
var birdHitTimer = 0;
var time = 0;
var lastFlash = -1;

var DIRS = ["up", "down", "left", "right"];

var storyLines = [
  "Deep in the pine forest of Baguio, a little bird fell fast asleep in its nest.",
  "Peach was out on her evening walk when she spotted it. So tiny. So sleepy.",
  "Then came a rumble... a big grumpy rain cloud was rolling in!",
  "Peach puffed up her fur. Nobody is waking this bird up. Scratch the raindrops with the arrow keys!"
];

// ---------- SOUND + MUSIC ----------

var audio = null;
var master = null;
var muted = false;

function initAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(audio.destination);
  } catch (e) {
    audio = null;
  }
}

function toggleMute() {
  initAudio();
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.6;
  document.getElementById("muteBtn").textContent = muted ? "♪ Sound off" : "♪ Sound on";
}

function midi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// one note. freq2 = slide to this pitch (optional)
function tone(freq, start, length, type, volume, freq2) {
  if (!audio) return;
  var osc = audio.createOscillator();
  var gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// a burst of static, filtered (rain, scratch, thunder sounds)
function noise(start, length, volume, filterType, filterFreq) {
  if (!audio) return;
  var size = Math.floor(audio.sampleRate * length);
  var buffer = audio.createBuffer(1, size, audio.sampleRate);
  var data = buffer.getChannelData(0);
  for (var i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

  var src = audio.createBufferSource();
  src.buffer = buffer;
  var filter = audio.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  var gain = audio.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(start);
}

function now() {
  return audio ? audio.currentTime : 0;
}

// sound effects
function sfxScratch() { noise(now(), 0.09, 0.35, "highpass", 2500); tone(1400, now(), 0.06, "triangle", 0.05, 700); }
function sfxPop() { tone(880, now(), 0.08, "triangle", 0.15, 1500); }
function sfxWrong() { tone(220, now(), 0.15, "square", 0.06, 150); tone(160, now() + 0.12, 0.2, "square", 0.05, 110); }
function sfxSplash() { noise(now(), 0.35, 0.4, "lowpass", 1200); tone(500, now(), 0.3, "sine", 0.12, 180); }
function sfxThunder() { noise(now(), 1.6, 0.8, "lowpass", 180); noise(now(), 0.3, 0.3, "lowpass", 900); }
function sfxChirp() {
  var t = now();
  tone(2200, t, 0.07, "sine", 0.1, 3200);
  tone(2400, t + 0.1, 0.07, "sine", 0.1, 3400);
  tone(2600, t + 0.2, 0.09, "sine", 0.1, 2000);
}
function sfxMeow() { tone(520, now(), 0.45, "triangle", 0.12, 380); tone(700, now(), 0.15, "triangle", 0.06, 900); }
function sfxWave() { var t = now(); tone(midi(76), t, 0.2, "triangle", 0.12); tone(midi(81), t + 0.12, 0.3, "triangle", 0.12); }
function sfxBigPop() { var t = now(); for (var i = 0; i < 4; i++) tone(midi(72 + i * 4), t + i * 0.07, 0.2, "triangle", 0.12); }
function sfxWin() {
  var t = now();
  var notes = [72, 76, 79, 84, 79, 84, 88];
  for (var i = 0; i < notes.length; i++) tone(midi(notes[i]), t + i * 0.13, 0.35, "triangle", 0.12);
}
function sfxLose() {
  var t = now();
  var notes = [72, 69, 65, 60];
  for (var i = 0; i < notes.length; i++) tone(midi(notes[i]), t + i * 0.22, 0.4, "triangle", 0.1);
}

// background songs (0 = rest). each step is an eighth note
var SONGS = {
  calm: {
    bpm: 92,
    melody: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0,
             72, 0, 76, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0, 0, 0],
    bass: [48, 45, 41, 43, 48, 45, 41, 43],
    hat: false
  },
  play: {
    bpm: 150,
    melody: [69, 72, 76, 72, 74, 72, 69, 0, 67, 69, 72, 69, 67, 64, 0, 0,
             69, 72, 76, 79, 81, 79, 76, 74, 72, 74, 72, 69, 67, 69, 0, 0],
    bass: [45, 45, 41, 41, 43, 43, 40, 40],
    hat: true
  }
};

var song = null;
var songStep = 0;
var nextNoteTime = 0;

function playSong(name) {
  if (!audio) return;
  if (song == SONGS[name]) return;
  song = SONGS[name];
  songStep = 0;
  nextNoteTime = audio.currentTime + 0.1;
}

function stopSong() {
  song = null;
}

// schedules the next few notes a little ahead of time
setInterval(function () {
  if (!audio || !song) return;
  var stepLen = 60 / song.bpm / 2;
  while (nextNoteTime < audio.currentTime + 0.25) {
    var i = songStep % song.melody.length;
    if (song.melody[i]) tone(midi(song.melody[i]), nextNoteTime, stepLen * 1.5, "triangle", 0.05);
    if (i % 4 == 0) {
      var b = song.bass[(i / 4) % song.bass.length];
      tone(midi(b), nextNoteTime, stepLen * 3.5, "sine", 0.09);
    }
    if (song.hat && i % 2 == 1) noise(nextNoteTime, 0.03, 0.05, "highpass", 7000);
    nextNoteTime += stepLen;
    songStep++;
  }
}, 50);

// ---------- SKETCHY DRAWING HELPERS ----------
// lines wiggle a little, and the wiggle changes 8 times a second (like a hand-drawn cartoon)

var seed = 1;

function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function jit(amount) {
  return (rnd() - 0.5) * 2 * amount;
}

// draws a shape from a list of points: crayon fill + two pencil lines
function sketch(c, pts, closed, fill, width) {
  if (fill) {
    var ox = jit(2), oy = jit(2);
    c.fillStyle = fill;
    c.beginPath();
    for (var i = 0; i < pts.length; i++) {
      c.lineTo(pts[i].x + ox, pts[i].y + oy);
    }
    c.closePath();
    c.fill();
  }

  if (width == 0) return;
  c.strokeStyle = LINE;
  c.lineWidth = width || 2.5;
  c.lineCap = "round";
  c.lineJoin = "round";

  for (var pass = 0; pass < 2; pass++) {
    c.globalAlpha = pass == 0 ? 0.9 : 0.45;
    c.beginPath();
    for (var k = 0; k < pts.length; k++) {
      c.lineTo(pts[k].x + jit(1.3), pts[k].y + jit(1.3));
    }
    if (closed) {
      c.lineTo(pts[0].x + jit(1.3), pts[0].y + jit(1.3));
      c.lineTo(pts[1].x + jit(2), pts[1].y + jit(2));
    }
    c.stroke();
  }
  c.globalAlpha = 1;
}

function ellipsePts(x, y, rx, ry, rot) {
  var pts = [];
  var n = 18;
  rot = rot || 0;
  for (var i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2;
    var px = Math.cos(a) * rx;
    var py = Math.sin(a) * ry;
    pts.push({
      x: x + px * Math.cos(rot) - py * Math.sin(rot),
      y: y + px * Math.sin(rot) + py * Math.cos(rot)
    });
  }
  return pts;
}

function oval(c, x, y, rx, ry, fill, width, rot) {
  sketch(c, ellipsePts(x, y, rx, ry, rot), true, fill, width);
}

function line(c, x1, y1, x2, y2, width) {
  sketch(c, [{ x: x1, y: y1 }, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, { x: x2, y: y2 }], false, null, width);
}

function poly(c, list, fill, width) {
  var pts = [];
  for (var i = 0; i < list.length; i += 2) pts.push({ x: list[i], y: list[i + 1] });
  sketch(c, pts, true, fill, width);
}

function write(c, text, x, y, size, color) {
  c.fillStyle = color || LINE;
  c.font = size + "px 'Patrick Hand', cursive";
  c.textAlign = "center";
  c.fillText(text, x, y);
}

// ---------- SETUP ----------

function resize() {
  var dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  if (W == 0 || H == 0) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  bg.width = W * dpr;
  bg.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  S = Math.min(W, H) / 650;
  if (S < 0.6) S = 0.6;
  if (S > 1.3) S = 1.3;

  groundY = Math.max(H * 0.6, H - 200);
  nestX = W / 2 + 55 * S;
  nestY = groundY - 46 * S;
  catX = nestX - 115 * S;
  paintBackground();
}

// ---------- BACKGROUND ----------

function paintBackground() {
  var c = bgCtx;
  seed = 42;

  c.fillStyle = "#fbf3e8";
  c.fillRect(0, 0, W, H);

  var g = c.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, "rgba(196, 180, 228, 0.45)");
  g.addColorStop(1, "rgba(255, 205, 222, 0.3)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, groundY);

  c.fillStyle = "rgba(110, 80, 100, 0.07)";
  for (var i = 0; i < 500; i++) {
    c.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }

  var hill = [];
  for (var x = -20; x <= W + 40; x += 40) {
    hill.push({ x: x, y: groundY - H * 0.2 + Math.sin(x * 0.005) * 25 * S });
  }
  hill.push({ x: W + 40, y: H });
  hill.push({ x: -20, y: H });
  sketch(c, hill, true, "#e8dcf2", 2);

  for (var fx = 10; fx < W; fx += 55 * S) {
    var fy = groundY - H * 0.2 + Math.sin(fx * 0.005) * 25 * S + 8;
    pine(c, fx + jit(10), fy, (55 + rnd() * 35) * S, "#d9cbe9", "#c4b0d6");
  }

  c.fillStyle = "#efe2d0";
  c.fillRect(0, groundY, W, H - groundY);
  var ground = [];
  for (var gx = -10; gx <= W + 30; gx += 30) ground.push({ x: gx, y: groundY + jit(2) });
  sketch(c, ground, false, null, 2.5);

  for (var t = 0; t < W / 40; t++) {
    var tx = rnd() * W;
    var ty = groundY + 10 + rnd() * (H - groundY - 20);
    c.globalAlpha = 0.5;
    line(c, tx, ty, tx - 4, ty - 8, 1.5);
    line(c, tx + 4, ty, tx + 6, ty - 9, 1.5);
    c.globalAlpha = 1;
  }

  for (var nx = -30 * S; nx < W + 60; nx += 75 * S) {
    if (nx > W * 0.2 && nx < W * 0.82) continue;
    pine(c, nx + jit(12), groundY + 4, (150 + rnd() * 70) * S, "#cfe3c9", "#b4d1ad");
  }
}

function pine(c, x, base, h, fill, shade) {
  poly(c, [x - h * 0.04, base, x - h * 0.04, base - h * 0.2, x + h * 0.04, base - h * 0.2, x + h * 0.04, base], "#d8b49a", 2);
  for (var i = 0; i < 3; i++) {
    var ty = base - h * 0.15 - h * 0.24 * i;
    var w = h * 0.32 * (1 - i * 0.22);
    poly(c, [x - w, ty, x + w, ty, x, ty - h * 0.42], i == 0 ? shade : fill, 2);
  }
}

// ---------- STUMP + NEST ----------

function drawStump() {
  ctx.save();
  ctx.translate(nestX, groundY);
  ctx.scale(S, S);
  poly(ctx, [-42, 0, -38, -42, 38, -42, 42, 0], "#d8b49a", 2.5);
  oval(ctx, 0, -42, 38, 9, "#ecd2bb", 2.5);
  oval(ctx, 0, -42, 18, 4, null, 1.2);
  line(ctx, -20, -30, -22, -6, 1.5);
  line(ctx, 14, -28, 16, -8, 1.5);
  ctx.restore();
}

function drawNestBack() {
  ctx.save();
  ctx.translate(nestX, nestY);
  ctx.scale(S, S);
  oval(ctx, 0, 6, 38, 12, "#c9966e", 2.5);
  ctx.restore();
}

function drawNestFront() {
  ctx.save();
  ctx.translate(nestX, nestY);
  ctx.scale(S, S);
  sketch(ctx, [{ x: -40, y: 2 }, { x: -30, y: 16 }, { x: 0, y: 20 }, { x: 30, y: 16 }, { x: 40, y: 2 }], false, "#b98560", 2.5);
  line(ctx, -32, 6, 20, 14, 1.5);
  line(ctx, -20, 14, 34, 4, 1.5);
  ctx.restore();
}

// ---------- THE BIRD ----------
// state: sleep, awake, grumpy, fly

function drawBird(state, x, y, faceRight) {
  ctx.save();
  var shake = birdHitTimer > 0 ? Math.sin(time * 60) * 3 : 0;
  ctx.translate(x + shake, y);
  ctx.scale(faceRight ? -S : S, S);

  var breathe = state == "sleep" ? Math.sin(time * 2) * 1.5 : 0;

  // body
  oval(ctx, 0, -10 - breathe, 22, 18 + breathe, "#bfe0f5", 2.5);
  oval(ctx, 4, -4, 12, 9, "#e4f2fb", 0);

  // wing (flaps when flying)
  if (state == "fly") {
    var flap = Math.sin(time * 25) * 0.9;
    oval(ctx, 6, -24, 16, 7, "#94c3e8", 2, -1.2 + flap);
  } else {
    oval(ctx, 8, -14, 12, 8, "#94c3e8", 2, -0.4);
  }

  // tuft
  line(ctx, -6, -28, -9, -36, 2);
  line(ctx, -3, -28, -2, -37, 2);

  // beak
  poly(ctx, [-20, -14, -30, -11, -20, -8], "#ffc078", 2);

  // eye
  if (state == "sleep") {
    sketch(ctx, [{ x: -15, y: -17 }, { x: -11, y: -15 }, { x: -7, y: -17 }], false, null, 2);
  } else if (state == "grumpy") {
    oval(ctx, -12, -17, 2.5, 2.5, LINE, 1);
    line(ctx, -17, -24, -8, -21, 2);
  } else {
    // happy ^ eye
    sketch(ctx, [{ x: -16, y: -15 }, { x: -12, y: -20 }, { x: -8, y: -15 }], false, null, 2.2);
  }
  oval(ctx, -8, -10, 4, 2.5, "rgba(255, 140, 170, 0.6)", 0);

  // wet drips
  if (state == "grumpy" || (state == "sleep" && wet > 0)) {
    ctx.globalAlpha = 0.8;
    for (var i = 0; i < Math.max(wet, 2); i++) {
      oval(ctx, -10 + i * 9, -32 + (i % 2) * 6, 2.5, 3.5, "#9ec8f0", 1.2);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (state == "sleep") {
    for (var z = 0; z < 3; z++) {
      var t = (time * 0.6 + z / 3) % 1;
      ctx.globalAlpha = 1 - t;
      write(ctx, "z", x + (10 + t * 30 + z * 4) * S, y - (40 + t * 50) * S, (14 + z * 5) * S);
    }
    ctx.globalAlpha = 1;
  }
}

// where the bird is during the happy ending
function birdEnding() {
  var t = endTime;
  var homeY = nestY;

  if (t < 1.4) {
    return { x: nestX, y: homeY, state: t < 0.6 ? "sleep" : "awake", right: false };
  }
  if (t < 2.4) {
    // little happy hops
    var hop = Math.abs(Math.sin((t - 1.4) * Math.PI * 3)) * 14 * S;
    return { x: nestX, y: homeY - hop, state: "awake", right: false };
  }
  var f = t - 2.4;
  var topY = homeY - 110 * S;
  if (f < 0.6) {
    // fly up out of the nest
    return { x: nestX, y: homeY - (homeY - topY) * (f / 0.6), state: "fly", right: false };
  }
  if (f < 2.2) {
    // one loop around Peach
    var a = (f - 0.6) / 1.6 * Math.PI * 2;
    var cx = nestX - 70 * S;
    return { x: cx + Math.cos(a) * 70 * S, y: topY - Math.sin(a) * 40 * S, state: "fly", right: Math.sin(a) < 0 };
  }
  // fly away into the sky
  var g = f - 2.2;
  return { x: nestX + g * 220 * S, y: topY - g * 150 * S + Math.sin(g * 8) * 6, state: "fly", right: true };
}

// ---------- PEACH THE CAT ----------
// pose: sit, walk, alert, guard, scratch, dizzy, wave, sheepish

function drawCat(x, pose, mark) {
  ctx.save();
  var hop = pose == "walk" ? Math.abs(Math.sin(time * 8)) * -6 : 0;
  var puff = (pose == "guard" || pose == "scratch") ? 1.06 : 1;
  ctx.translate(x, groundY + hop);
  ctx.scale(S * puff, S * puff);

  ctx.fillStyle = "rgba(74, 51, 71, 0.12)";
  ctx.beginPath();
  ctx.ellipse(0, 2, 46, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // tail
  var wag = Math.sin(time * 3) * 0.2;
  if (pose == "guard" || pose == "scratch") wag = -0.2;
  if (pose == "wave") wag = Math.sin(time * 8) * 0.3;
  oval(ctx, -40, -40, 8, 30, CREAM, 2.5, -0.5 + wag);
  oval(ctx, -52, -64, 6, 8, PINK, 0, -0.5 + wag);

  // body
  oval(ctx, 0, -34, 38, 34, CREAM, 2.5);
  oval(ctx, 10, -30, 16, 20, "rgba(255, 180, 205, 0.35)", 0);
  oval(ctx, -18, -5, 13, 7, CREAM, 2.2);

  // front paw
  if (pose == "scratch") {
    oval(ctx, 44, -62, 11, 9, CREAM, 2.2, -0.6);
    line(ctx, 52, -72, 58, -78, 2);
    line(ctx, 56, -66, 63, -70, 2);
    line(ctx, 48, -76, 52, -84, 2);
  } else if (pose == "guard") {
    oval(ctx, 30, -48, 10, 9, CREAM, 2.2);
    oval(ctx, 16, -6, 12, 7, CREAM, 2.2);
  } else if (pose == "wave") {
    var w = Math.sin(time * 10) * 8;
    oval(ctx, 40 + w, -78, 10, 9, CREAM, 2.2);
  } else {
    oval(ctx, 16, -6, 12, 7, CREAM, 2.2);
  }

  // ears
  poly(ctx, [-22, -102, -26, -132, -4, -112], CREAM, 2.5);
  poly(ctx, [18, -112, 32, -134, 36, -102], CREAM, 2.5);
  poly(ctx, [-19, -106, -22, -124, -9, -112], PINK, 0);
  poly(ctx, [22, -110, 30, -126, 32, -105], PINK, 0);

  // head
  oval(ctx, 6, -88, 36, 30, CREAM, 2.5);

  // bow
  poly(ctx, [30, -116, 16, -128, 18, -108], "#ff5c9d", 2);
  poly(ctx, [30, -116, 44, -130, 44, -106], "#ff5c9d", 2);
  oval(ctx, 30, -116, 4.5, 4.5, "#e0407f", 1.5);

  // eyes
  if (pose == "dizzy") {
    oval(ctx, -6, -90, 5, 5, null, 2);
    oval(ctx, 20, -90, 5, 5, null, 2);
  } else if (pose == "wave") {
    sketch(ctx, [{ x: -11, y: -88 }, { x: -6, y: -94 }, { x: -1, y: -88 }], false, null, 2.5);
    sketch(ctx, [{ x: 15, y: -88 }, { x: 20, y: -94 }, { x: 25, y: -88 }], false, null, 2.5);
  } else if (pose == "scratch" || pose == "guard") {
    oval(ctx, -6, -90, 3.5, 4.5, LINE, 1);
    oval(ctx, 20, -90, 3.5, 4.5, LINE, 1);
    line(ctx, -12, -100, -1, -97, 2.2);
    line(ctx, 26, -100, 15, -97, 2.2);
  } else {
    var lookUp = pose == "alert" ? -3 : 0;
    oval(ctx, -6, -90 + lookUp, 4, 5, LINE, 1);
    oval(ctx, 20, -90 + lookUp, 4, 5, LINE, 1);
    oval(ctx, -5, -92 + lookUp, 1.3, 1.3, "white", 0);
    oval(ctx, 21, -92 + lookUp, 1.3, 1.3, "white", 0);
  }

  // blush, mouth, whiskers
  oval(ctx, -16, -78, 6, 3.5, "rgba(255, 130, 170, 0.5)", 0);
  oval(ctx, 30, -78, 6, 3.5, "rgba(255, 130, 170, 0.5)", 0);
  if (pose == "alert") {
    oval(ctx, 7, -76, 3, 4, null, 2);
  } else {
    sketch(ctx, [{ x: 2, y: -80 }, { x: 5, y: -77 }, { x: 7, y: -80 }, { x: 9, y: -77 }, { x: 12, y: -80 }], false, null, 2);
  }
  line(ctx, -26, -82, -40, -84, 1.3);
  line(ctx, -26, -78, -40, -76, 1.3);
  line(ctx, 38, -82, 52, -84, 1.3);
  line(ctx, 38, -78, 52, -76, 1.3);

  if (pose == "sheepish") {
    oval(ctx, 40, -104, 4, 6, "#bfe0f5", 1.5);
  }

  ctx.restore();

  if (mark) {
    var my = groundY - (150 + Math.sin(time * 5) * 4) * S;
    write(ctx, mark, x + 6 * S, my, 34 * S, mark == "♥" ? "#ff5c9d" : LINE);
  }
}

// ---------- RAIN CLOUD ----------

function drawCloud(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(S, S);
  var puffs = [[-130, 10, 60, 40], [-60, -15, 75, 52], [30, -20, 80, 55], [115, 5, 65, 42], [-10, 25, 110, 35]];
  for (var i = 0; i < puffs.length; i++) {
    oval(ctx, puffs[i][0], puffs[i][1], puffs[i][2], puffs[i][3], "#a7a2c4", 2.5);
  }
  ctx.globalAlpha = 0.5;
  line(ctx, -80, -40, -40, -50, 2);
  line(ctx, 10, -48, 60, -52, 2);
  ctx.globalAlpha = 1;

  oval(ctx, -30, 8, 5, 6, LINE, 1);
  oval(ctx, 30, 8, 5, 6, LINE, 1);
  line(ctx, -46, -6, -20, 0, 3);
  line(ctx, 46, -6, 20, 0, 3);
  sketch(ctx, [{ x: -16, y: 34 }, { x: 0, y: 26 }, { x: 16, y: 34 }], false, null, 3);
  ctx.restore();
}

function drawDrizzle(amount) {
  ctx.strokeStyle = "rgba(120, 150, 200, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (var i = 0; i < amount; i++) {
    var x = (i * 137.5 + time * 20) % W;
    var y = 120 * S + (i * 89 + time * 380) % (groundY - 120 * S);
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 12);
  }
  ctx.stroke();
}

// ---------- RAINDROPS ----------

function spawnDrop(big) {
  var count;
  if (big) {
    count = 8;
  } else {
    var maxCount = Math.min(3, 1 + Math.floor(wave / 2));
    var minCount = wave >= 4 ? 2 : 1;
    count = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
  }
  var arrows = [];
  for (var i = 0; i < count; i++) arrows.push(DIRS[Math.floor(Math.random() * 4)]);

  drops.push({
    x: W / 2 + (Math.random() - 0.5) * Math.min(W * 0.85, 520 * S),
    y: 150 * S,
    r: (big ? 34 : 18) * S,
    speed: (big ? 45 : 75 + wave * 12) * S,
    arrows: arrows,
    big: big,
    flash: 0,
    phase: Math.random() * 6
  });
}

function drawDrop(d) {
  var r = d.r;
  var pts = [{ x: d.x, y: d.y - r * 2 }];
  for (var i = 0; i <= 12; i++) {
    var a = -Math.PI / 6 + i / 12 * (Math.PI * 4 / 3);
    pts.push({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r });
  }
  sketch(ctx, pts, true, d.flash > 0 ? "#ffffff" : "#bcd8f2", 2.5);

  ctx.globalAlpha = 0.7;
  line(ctx, d.x - r * 0.5, d.y - r * 0.4, d.x - r * 0.4, d.y - r * 0.9, 2);
  ctx.globalAlpha = 1;
  oval(ctx, d.x - r * 0.3, d.y + r * 0.1, 2 * S, 2.5 * S, LINE, 0);
  oval(ctx, d.x + r * 0.3, d.y + r * 0.1, 2 * S, 2.5 * S, LINE, 0);

  var gap = 26 * S;
  var tw = d.arrows.length * gap + 8 * S;
  var th = 28 * S;
  var tx = d.x - tw / 2;
  var ty = d.y - r * 2 - th - 6 * S;
  poly(ctx, [tx, ty, tx + tw, ty, tx + tw, ty + th, tx, ty + th], "#fffaf2", 2);

  for (var k = 0; k < d.arrows.length; k++) {
    drawArrow(d.arrows[k], tx + 4 * S + gap * k + gap / 2, ty + th / 2, 8 * S, k == 0 ? "#ff3d86" : "#a898a8");
  }
}

function drawArrow(dir, x, y, s, color) {
  var angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * S;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.lineTo(s, 0);
  ctx.moveTo(s * 0.2, -s * 0.7);
  ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.2, s * 0.7);
  ctx.stroke();
  ctx.restore();
}

// ---------- SCRATCHING ----------

function press(dir) {
  if (mode == "story") {
    nextStory();
    return;
  }
  if (mode != "play" || dizzyTimer > 0) return;

  var hitAny = false;
  var popped = false;

  for (var i = drops.length - 1; i >= 0; i--) {
    var d = drops[i];
    if (d.arrows[0] != dir) continue;

    hitAny = true;
    d.arrows.shift();
    d.flash = 0.12;
    slashes.push({ x: d.x, y: d.y - d.r * 0.4, size: d.r * 1.4, life: 0.3 });

    if (d.arrows.length == 0) {
      splash(d.x, d.y, d.big ? 30 : 12);
      if (d.big) sfxBigPop();
      popped = true;
      drops.splice(i, 1);
    }
  }

  if (hitAny) {
    scratchTimer = 0.25;
    sfxScratch();
    if (popped) sfxPop();
  } else {
    // wrong key: Peach gets dizzy and can't scratch for a moment
    dizzyTimer = 0.9;
    sfxWrong();
  }
}

function splash(x, y, count) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = (60 + Math.random() * 150) * S;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 60 * S,
      life: 0.5 + Math.random() * 0.4,
      size: (2 + Math.random() * 4) * S,
      color: Math.random() < 0.5 ? "#bcd8f2" : "#ffd1e2"
    });
  }
}

function drawSlash(s) {
  ctx.globalAlpha = s.life / 0.3;
  var z = s.size;
  for (var i = -1; i <= 1; i++) {
    var ox = i * z * 0.35;
    ctx.strokeStyle = "#ff3d86";
    ctx.lineWidth = 5 * S;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x - z * 0.6 + ox, s.y - z * 0.7);
    ctx.lineTo(s.x + z * 0.4 + ox, s.y + z * 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---------- WAVES ----------

function startWave() {
  wave++;
  toSpawn = 6 + wave * 2;
  bigOnePending = (wave == TOTAL_WAVES);
  spawnTimer = 1.2;
  showBanner(wave == TOTAL_WAVES ? "Downpour!" : "Rain " + wave);
  sfxWave();
  updateHud();
}

function showBanner(text) {
  var b = document.getElementById("banner");
  b.textContent = text;
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
}

// ---------- UPDATE ----------

function update(dt) {
  time += dt;
  storyTime += dt;
  if (scratchTimer > 0) scratchTimer -= dt;
  if (dizzyTimer > 0) dizzyTimer -= dt;
  if (birdHitTimer > 0) birdHitTimer -= dt;

  // story sounds
  if (mode == "story" && storyStep == 1 && storyTime > 2.2 && storyTime - dt <= 2.2) sfxMeow();
  if (mode == "story" && storyStep == 2) {
    var flash = Math.floor((storyTime + 1.2) / 2.4);
    if (flash != lastFlash && storyTime % 2.4 > 1.2) {
      lastFlash = flash;
      sfxThunder();
    }
  }

  if (mode == "play") {
    spawnTimer -= dt;
    // only a few drops on screen at once (more in later rounds)
    var maxOnScreen = 3 + Math.floor(wave / 2);
    if (toSpawn > 0 && spawnTimer <= 0 && drops.length < maxOnScreen) {
      spawnDrop(false);
      toSpawn--;
      spawnTimer = Math.max(0.8, 1.4 - wave * 0.12) * (0.8 + Math.random() * 0.4);
    } else if (toSpawn == 0 && bigOnePending && drops.length == 0) {
      spawnDrop(true);
      bigOnePending = false;
    }

    if (toSpawn == 0 && !bigOnePending && drops.length == 0) {
      waveTimer += dt;
      if (waveTimer > 1.5) {
        waveTimer = 0;
        if (wave >= TOTAL_WAVES) endGame(true);
        else startWave();
      }
    }

    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i];
      var dx = nestX - d.x;
      var dy = (nestY - 20 * S) - d.y;
      var dist = Math.hypot(dx, dy);
      d.x += dx / dist * d.speed * dt + Math.sin(time * 2.5 + d.phase) * 25 * S * dt;
      d.y += dy / dist * d.speed * dt;
      if (d.flash > 0) d.flash -= dt;

      if (dist < 28 * S) {
        drops.splice(i, 1);
        wet++;
        birdHitTimer = 0.6;
        splash(nestX, nestY - 20 * S, 18);
        sfxSplash();
        updateHud();
        if (wet >= 3) {
          endGame(false);
          break;
        }
      }
    }
  }

  // ending
  if (mode == "ending") {
    endTime += dt;
    if (won) {
      if (endTime > 0.6 && endTime - dt <= 0.6) sfxChirp();
      if (endTime > 1.6 && endTime - dt <= 1.6) sfxChirp();
      if (endTime > 3.0 && endTime - dt <= 3.0) sfxMeow();
      if (endTime > 4.4 && endTime - dt <= 4.4) sfxChirp();

      // music notes and hearts follow the flying bird
      if (endTime > 1.4 && Math.random() < dt * 4) {
        var b = birdEnding();
        particles.push({
          x: b.x, y: b.y - 30 * S,
          vx: (Math.random() - 0.5) * 30, vy: -50 * S,
          life: 1.2, size: 0, color: Math.random() < 0.5 ? "♥" : "♪"
        });
      }
    }
    var wait = won ? 6.5 : 1.2;
    if (!endShown && endTime > wait) {
      endShown = true;
      show("ending");
    }
  }

  for (var k = particles.length - 1; k >= 0; k--) {
    var p = particles[k];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.size > 0) p.vy += 400 * S * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(k, 1);
  }

  for (var s = slashes.length - 1; s >= 0; s--) {
    slashes[s].life -= dt;
    if (slashes[s].life <= 0) slashes.splice(s, 1);
  }
}

// ---------- DRAW ----------

function render() {
  seed = Math.floor(time * 8) % 997 * 131 + 7;
  ctx.drawImage(bg, 0, 0, W, H);

  var catPose = "sit";
  var catMark = "";
  var catDrawX = catX;
  var showCat = true;
  var cloudX = -9999;
  var drizzle = 0;
  var bird = { x: nestX, y: nestY, state: "sleep", right: false };

  if (mode == "story") {
    if (storyStep == 0) {
      showCat = false;
    }
    if (storyStep == 1) {
      var t = Math.min(1, storyTime / 2.2);
      catDrawX = -100 + (catX + 100) * t;
      catPose = t < 1 ? "walk" : "sit";
      if (t >= 1) catMark = "♥";
    }
    if (storyStep == 2) {
      cloudX = W + 300 * S - (W / 2 + 300 * S) * Math.min(1, storyTime / 2);
      catPose = "alert";
      catMark = "!";
      if (storyTime > 1.5) drizzle = 20;
    }
    if (storyStep == 3) {
      cloudX = W / 2;
      catPose = "guard";
      drizzle = 30;
    }
  }

  if (mode == "play") {
    cloudX = W / 2;
    drizzle = 25 + wave * 8;
    catPose = dizzyTimer > 0 ? "dizzy" : scratchTimer > 0 ? "scratch" : "guard";
    if (dizzyTimer > 0) catMark = "?";
  }

  if (mode == "ending") {
    if (won) {
      drawRainbow();
      bird = birdEnding();
      catPose = endTime > 2.8 ? "wave" : "sit";
      if (endTime > 0.6 && endTime < 2.8) catMark = "!";
    } else {
      cloudX = W / 2;
      drizzle = 40;
      catPose = "sheepish";
      bird.state = "grumpy";
    }
  }

  if (cloudX > -9000) drawCloud(cloudX, 95 * S);
  if (drizzle) drawDrizzle(drizzle);

  drawStump();
  drawNestBack();
  var birdInNest = bird.state != "fly";
  if (birdInNest) drawBird(bird.state, bird.x, bird.y, bird.right);
  drawNestFront();
  if (showCat) drawCat(catDrawX, catPose, catMark);
  if (!birdInNest) drawBird(bird.state, bird.x, bird.y, bird.right);

  for (var i = 0; i < drops.length; i++) drawDrop(drops[i]);
  for (var j = 0; j < slashes.length; j++) drawSlash(slashes[j]);

  for (var k = 0; k < particles.length; k++) {
    var p = particles[k];
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    if (p.size == 0) write(ctx, p.color, p.x, p.y, 22 * S, p.color == "♥" ? "#ff5c9d" : LINE);
    else oval(ctx, p.x, p.y, p.size, p.size, p.color, 0);
  }
  ctx.globalAlpha = 1;

  if (mode == "story" && storyStep == 2 && storyTime % 2.4 > 1.2 && storyTime % 2.4 < 1.3) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawRainbow() {
  var colors = ["#ffb3c7", "#ffd3a8", "#fff1a8", "#c8ecc0", "#bcd8f2", "#d6c4f0"];
  var grow = Math.min(1, endTime / 1.5);
  for (var i = 0; i < colors.length; i++) {
    var r = (W * 0.42) - i * 14 * S;
    ctx.globalAlpha = 0.8 * grow;
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 14 * S;
    ctx.beginPath();
    for (var a = 0; a <= 20; a++) {
      var ang = Math.PI + a / 20 * Math.PI;
      ctx.lineTo(W / 2 + Math.cos(ang) * r + jit(1), groundY + Math.sin(ang) * r * 0.75 + jit(1));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  oval(ctx, W * 0.82, 90 * S, 34 * S, 34 * S, "#ffe08a", 2.5);
  for (var s = 0; s < 8; s++) {
    var ang2 = s / 8 * Math.PI * 2 + time * 0.3;
    line(ctx, W * 0.82 + Math.cos(ang2) * 44 * S, 90 * S + Math.sin(ang2) * 44 * S,
              W * 0.82 + Math.cos(ang2) * 58 * S, 90 * S + Math.sin(ang2) * 58 * S, 2.5);
  }
}

// ---------- LOOP ----------

var lastTime = 0;

function loop(nowMs) {
  requestAnimationFrame(loop);

  // if the window size changed (or was 0 when the page loaded), redo the layout
  if (window.innerWidth != W || window.innerHeight != H) resize();
  if (W == 0 || H == 0) return;

  var dt = (nowMs - lastTime) / 1000;
  lastTime = nowMs;
  if (dt > 0.05) dt = 0.05;
  update(dt);
  render();
}

// ---------- SCREENS ----------

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

var isTouch = window.matchMedia("(pointer: coarse)").matches;

function startStory() {
  initAudio();
  if (audio && audio.state == "suspended") audio.resume();
  playSong("calm");
  mode = "story";
  storyStep = 0;
  storyTime = 0;
  wet = 0;
  lastFlash = -1;
  hide("title");
  show("caption");
  setCaption();
}

function setCaption() {
  document.getElementById("captionText").textContent = storyLines[storyStep];
  document.getElementById("nextBtn").textContent = storyStep == storyLines.length - 1 ? "Let's go!" : "Next ▶";
}

function nextStory() {
  if (mode != "story") return;
  storyStep++;
  storyTime = 0;
  if (storyStep >= storyLines.length) startPlay();
  else setCaption();
}

function startPlay() {
  initAudio();
  playSong("play");
  mode = "play";
  wet = 0;
  wave = 0;
  drops = [];
  particles = [];
  slashes = [];
  waveTimer = 0;
  dizzyTimer = 0;
  hide("title");
  hide("caption");
  hide("ending");
  show("hud");
  if (isTouch) show("pad");
  startWave();
}

function endGame(win) {
  mode = "ending";
  won = win;
  endTime = 0;
  endShown = false;
  drops = [];
  particles = [];

  if (win) {
    playSong("calm");
    sfxWin();
  } else {
    stopSong();
    sfxLose();
  }

  document.getElementById("endTitle").textContent = win ? "The sky cleared up!" : "Splash!";
  document.getElementById("endText").textContent = win
    ? "The little bird woke up, sang a thank-you song for Peach, and flew off into the rainbow."
    : "The little bird woke up soaked and grumpy. Peach made it to Rain " + wave + " of " + TOTAL_WAVES + ". Try again!";

  hide("hud");
  hide("pad");
  hide("ending");
}

function goMenu() {
  mode = "title";
  drops = [];
  particles = [];
  wet = 0;
  playSong("calm");
  hide("hud");
  hide("pad");
  hide("caption");
  hide("ending");
  show("title");
}

function updateHud() {
  var hearts = "";
  for (var i = 0; i < 3; i++) hearts += i < 3 - wet ? "♥" : "♡";
  document.getElementById("hearts").textContent = hearts;
  document.getElementById("wave").textContent = "Rain " + wave + "/" + TOTAL_WAVES;
}

// ---------- INPUT ----------

var keyMap = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right"
};

document.addEventListener("keydown", function (e) {
  if (e.repeat) return;
  if (mode == "story" && (e.key == " " || e.key == "Enter")) {
    e.preventDefault();
    nextStory();
    return;
  }
  var dir = keyMap[e.key];
  if (dir) {
    e.preventDefault();
    press(dir);
  }
});

canvas.addEventListener("click", function () {
  if (mode == "story") nextStory();
});

var padButtons = document.querySelectorAll("#pad button");
for (var b = 0; b < padButtons.length; b++) {
  padButtons[b].addEventListener("pointerdown", function (e) {
    e.preventDefault();
    press(this.dataset.dir);
  });
}

// ---------- START ----------

requestAnimationFrame(loop);
