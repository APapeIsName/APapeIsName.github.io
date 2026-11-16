/* 블로그 로파이 플레이어.
   음원 파일 없이 브라우저에서 바로 합성해요 (전자 피아노, 콘트라베이스, 붐뱁 드럼, LP 잡음, 빗소리).
   서울의 시간대와 날씨, 생활 시간표, 출석 상태에 따라 템포와 분위기가 바뀌고,
   16마디마다 화음 진행과 악기 디테일이 조금씩 바뀌어요. 바뀌는 곳은 필인과 템포 램프로 이어 붙여요. */
(function () {
  "use strict";

  /* ── 음악 재료 ─────────────────────────────── */
  // 화음: [구성음..., 베이스 근음] (MIDI 번호)
  var PROGS = [
    { key: "F", chords: [[53, 57, 60, 64, 67, 41], [52, 55, 59, 62, 66, 40], [50, 53, 57, 60, 64, 38], [55, 60, 62, 65, 69, 43]] }, // Fmaj9 Em9 Dm9 G9sus
    { key: "C", chords: [[50, 53, 57, 60, 64, 38], [55, 59, 62, 65, 69, 43], [48, 52, 55, 59, 62, 36], [57, 60, 64, 67, 71, 45]] }, // Dm9 G9 Cmaj9 Am9
    { key: "Eb", chords: [[51, 55, 58, 62, 65, 39], [50, 53, 57, 60, 64, 38], [48, 51, 55, 58, 62, 36], [46, 50, 53, 57, 60, 34]] }, // Ebmaj9 Dm9 Cm9 Bbmaj9
    { key: "G", chords: [[57, 60, 64, 67, 71, 45], [50, 54, 57, 60, 64, 38], [55, 59, 62, 66, 69, 43], [48, 52, 55, 59, 62, 36]] }, // Am9 D9 Gmaj9 Cmaj9
  ];
  var SECTION = 16; // 마디
  var SWING = 0.62;
  // 오프라인 렌더로 맞춘 음량 (피아노 대비: 베이스 0.45, 드럼 0.6, 빗소리 0.27 정도)
  var LEVEL = { keys: 1, bass: 0.81, drums: 1.21, rain: 0.069, drops: 2.2, wind: 0.09, rumble: 0.3, crackle: 1.0, hiss: 0.013, master: 0.62 };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  /** 날씨와 시간대, 하는 일로 분위기를 정해요 */
  function moodOf(s) {
    s = s || {};
    var phase = s.phase || "night", weather = s.weather || "clear", act = s.activity || "study";
    var base = { night: [70, 2600], dawn: [74, 3000], day: [80, 3600], dusk: [75, 2900] }[phase] || [72, 2800];
    var m = { bpm: base[0], bright: base[1], drums: "boombap", melody: 0.5, ambience: "none", label: "" };
    if (act === "sleep") { m.bpm -= 8; m.bright -= 600; m.drums = "none"; m.melody = 0.15; }
    else if (act === "rest") { m.bpm -= 3; m.drums = "half"; }
    else if (act === "study" || s.checkin) { m.drums = "ghost"; m.melody = 0.35; }
    if (weather === "rain" || weather === "drizzle") m.ambience = "rain";
    else if (weather === "thunder") m.ambience = "storm";
    else if (weather === "snow") m.ambience = "snow";
    else if (weather === "fog") m.ambience = "wind";
    var adj = { rain: "비 오는", drizzle: "비 오는", thunder: "비 오는", snow: "눈 오는", fog: "안개 낀", cloudy: "흐린" }[weather] || "맑은";
    var noun = { night: "밤", dawn: "새벽", day: "낮", dusk: "저녁" }[phase] || "밤";
    m.label = act === "sleep" ? "조용한 " + noun : adj + " " + noun;
    return m;
  }

  /** 노이즈 버퍼 (흰 잡음, 빗방울, LP 잡음) */
  function makeBuffers(ctx, rnd) {
    var sr = ctx.sampleRate;
    function buf(sec, fill) {
      var b = ctx.createBuffer(1, Math.floor(sr * sec), sr);
      fill(b.getChannelData(0), sr);
      return b;
    }
    return {
      white: buf(2, function (d) { for (var i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }),
      drops: buf(6, function (d, sr) {
        for (var k = 0; k < 150; k++) {
          var at = Math.floor(rnd() * (d.length - 300)), amp = 0.02 + rnd() * 0.06;
          for (var j = 0; j < 200; j++) d[at + j] += (rnd() * 2 - 1) * amp * Math.exp(-j / 30);
        }
      }),
      crackle: buf(7, function (d) {
        for (var k = 0; k < 126; k++) {
          var at = Math.floor(rnd() * (d.length - 4)), a = 0.05 + rnd() * 0.15;
          d[at] += a; d[at + 1] -= a * 0.6; d[at + 2] += a * 0.3;
        }
      }),
    };
  }

  /** 씨앗을 넣으면 같은 흐름이 나오는 난수 */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── 엔진: 실시간(AudioContext)과 미리 렌더(OfflineAudioContext) 둘 다 써요 ── */
  function createEngine(ctx, out, opts) {
    opts = opts || {};
    var rnd = rng(opts.seed || 7);
    var B = makeBuffers(ctx, rng(11));
    var mood = moodOf(opts.state);
    var pending = null; // 다음 구간에서 적용할 분위기

    // 버스: 각 악기 → 마스터 (저역/고역 정리) → 압축기 → 출력
    var master = ctx.createGain(); master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 35;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9000;
    hp.connect(lp); lp.connect(master); master.connect(comp); comp.connect(out);

    var keysTone = ctx.createBiquadFilter(); keysTone.type = "lowpass"; keysTone.frequency.value = mood.bright;
    var keysLow = ctx.createBiquadFilter(); keysLow.type = "highpass"; keysLow.frequency.value = 120;
    var trem = ctx.createGain(); trem.gain.value = 1;
    var keysBus = ctx.createGain(); keysBus.gain.value = LEVEL.keys;
    keysBus.connect(trem); trem.connect(keysLow); keysLow.connect(keysTone); keysTone.connect(hp);
    var lfo = ctx.createOscillator(); lfo.frequency.value = 4.5;
    var lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.08;
    lfo.connect(lfoAmt); lfoAmt.connect(trem.gain); lfo.start();
    // 테이프 흔들림: 피아노 음높이를 아주 살짝 흔들어요
    var wow = ctx.createOscillator(); wow.frequency.value = 0.5;
    var wowAmt = ctx.createGain(); wowAmt.gain.value = 3.5; // 센트
    wow.connect(wowAmt); wow.start();

    var bassBus = ctx.createGain(); bassBus.gain.value = LEVEL.bass; bassBus.connect(hp);
    var drumBus = ctx.createGain(); drumBus.gain.value = LEVEL.drums;
    var drumTone = ctx.createBiquadFilter(); drumTone.type = "lowpass"; drumTone.frequency.value = 6000;
    drumBus.connect(drumTone); drumTone.connect(hp);

    // 환경음: 계속 돌면서 음량만 천천히 바꿔요 (크로스페이드)
    function loop(buffer, chain, level) {
      var src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      var g = ctx.createGain(); g.gain.value = level;
      var node = src;
      chain.forEach(function (f) { node.connect(f); node = f; });
      node.connect(g); g.connect(hp); src.start(0, rnd() * buffer.duration);
      return g;
    }
    function filt(type, f, q) { var n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; }
    var amb = {
      crackle: loop(B.crackle, [filt("lowpass", 4000)], LEVEL.crackle),
      hiss: loop(B.white, [filt("highpass", 3000)], LEVEL.hiss),
      rain: loop(B.white, [filt("highpass", 400), filt("lowpass", 5000)], 0),
      drops: loop(B.drops, [filt("highpass", 3000)], 0),
      wind: loop(B.white, [filt("bandpass", 500, 0.7), filt("lowpass", 900)], 0),
      rumble: loop(B.white, [filt("lowpass", 110)], 0),
    };
    // 바람 소리는 천천히 오르내려요 (음량 단계 앞에 흔들림 단계를 따로 둬서, 꺼져 있을 땐 정말 조용해요)
    var windMod = ctx.createGain(); windMod.gain.value = 1;
    var windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.07;
    var windLfoAmt = ctx.createGain(); windLfoAmt.gain.value = 0.6;
    windLfo.connect(windLfoAmt); windLfoAmt.connect(windMod.gain); windLfo.start();
    amb.wind.disconnect(); amb.wind.connect(windMod); windMod.connect(hp);

    function setAmbience(kind, at, tc) {
      var want = { rain: 0, drops: 0, wind: 0, rumble: 0 };
      if (kind === "rain") { want.rain = LEVEL.rain; want.drops = LEVEL.drops; }
      if (kind === "storm") { want.rain = LEVEL.rain * 1.2; want.drops = LEVEL.drops; want.rumble = LEVEL.rumble * 0.25; }
      if (kind === "snow") { want.wind = LEVEL.wind; }
      if (kind === "wind") { want.wind = LEVEL.wind * 0.8; }
      Object.keys(want).forEach(function (k) { amb[k].gain.setTargetAtTime(want[k], at, tc); });
    }
    setAmbience(mood.ambience, ctx.currentTime, 0.01);

    /* ── 소리 하나하나 ── */
    function env(g, t, peak, attack, rate, dur) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setTargetAtTime(0, t + attack, 1 / rate);
      return t + Math.min(dur, attack + 6 / rate);
    }
    function osc(type, f, t, end, dest, detuneSrc) {
      var o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      if (detuneSrc) {
        detuneSrc.connect(o.detune);
        o.onended = function () { try { detuneSrc.disconnect(o.detune); } catch (e) {} }; // 끝난 음은 연결을 풀어 메모리를 돌려줘요
      }
      o.connect(dest); o.start(t); o.stop(end + 0.05);
      return o;
    }
    // 피아노 음색 세 가지: 로즈(기본), 우리처(배음 많음), 비브라폰(종소리 배음, 길게)
    var KEYSETS = {
      rhodes: [[1, 1, 0], [2, 0.35, 4], [3.01, 0.12, 6], [1.003, 0.5, 0]],
      wurli: [[1, 1, 0], [2, 0.55, 3], [3, 0.25, 5], [1.004, 0.4, 0]],
      vibes: [[1, 1, 0], [4.0, 0.18, 2.5], [1.002, 0.45, 0]],
    };
    var sec = { prog: 0, keyset: "rhodes", spread: 0, decay: 1.6, melody: true, drums: mood.drums };
    function epiano(n, t, dur, vel) {
      var f = midi(n);
      var g = ctx.createGain(); g.connect(keysBus);
      var end = env(g, t, vel / 2, 0.008, sec.keyset === "vibes" ? 0.9 : sec.decay, dur);
      KEYSETS[sec.keyset].forEach(function (p) {
        var pg = ctx.createGain(); pg.connect(g);
        if (p[2]) { pg.gain.setValueAtTime(p[1], t); pg.gain.setTargetAtTime(0, t, 1 / p[2]); } else pg.gain.value = p[1];
        osc("sine", f * p[0], t, end, pg, wowAmt);
      });
    }
    function bass(n, t, dur, vel) {
      var f = midi(n);
      var tone = filt("lowpass", 900); var low = filt("highpass", 45);
      var g = ctx.createGain(); g.connect(tone); tone.connect(low); low.connect(bassBus);
      var end = env(g, t, vel, 0.005, 5.5, dur);
      osc("sine", f, t, end, g);
      var h2 = ctx.createGain(); h2.gain.setValueAtTime(0.45, t); h2.gain.setTargetAtTime(0, t, 1 / 9); h2.connect(g);
      osc("sine", f * 2, t, end, h2);
      noiseHit(t, 0.004, 0.012, vel * 0.25, filt("lowpass", 900), bassBus);
    }
    function noiseHit(t, attack, decay, peak, filter, dest) {
      var src = ctx.createBufferSource(); src.buffer = B.white;
      var g = ctx.createGain();
      src.connect(filter); filter.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setTargetAtTime(0, t + attack, decay);
      src.start(t, rnd() * 1.5); src.stop(t + attack + decay * 8);
    }
    function kick(t, vel) {
      var o = ctx.createOscillator(); var g = ctx.createGain();
      o.frequency.setValueAtTime(127, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.12);
      o.connect(g); g.connect(drumBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, 1 / 16);
      o.start(t); o.stop(t + 0.4);
      noiseHit(t, 0.001, 0.003, 0.15 * vel, filt("highpass", 2000), drumBus);
    }
    function snare(t, vel) {
      noiseHit(t, 0.002, 1 / 18, 0.35 * vel, (function () { var f = filt("bandpass", 2400, 0.6); return f; })(), drumBus);
      var o = ctx.createOscillator(); var g = ctx.createGain(); o.frequency.value = 190;
      o.connect(g); g.connect(drumBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15 * vel, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, 1 / 25);
      o.start(t); o.stop(t + 0.3);
    }
    function hat(t, vel, open) {
      noiseHit(t, 0.001, open ? 1 / 14 : 1 / 60, 0.12 * vel, filt("highpass", 7000), drumBus);
    }

    /* ── 흐름 ── */
    var bar = opts.bar || 0;
    var beat = 60 / mood.bpm, nextBeat = beat; // 템포 램프용
    var t0 = ctx.currentTime + 0.12; // 다음 마디 시작 시각
    var lastProg = -1;

    function newSection() {
      if (pending) { mood = pending; pending = null; setAmbience(mood.ambience, t0, 2.5); }
      var p;
      do { p = Math.floor(rnd() * PROGS.length); } while (p === lastProg && PROGS.length > 1);
      lastProg = p;
      var r = rnd();
      sec = {
        prog: p,
        keyset: r < 0.7 ? "rhodes" : r < 0.85 ? "wurli" : "vibes",
        spread: rnd() < 0.4 ? 12 : 0, // 맨 위 음을 한 옥타브 띄우기
        decay: 1.3 + rnd() * 0.6,
        melody: rnd() < mood.melody * 1.6,
        drums: mood.drums === "boombap" && rnd() < 0.3 ? "ghost" : mood.drums,
      };
      lfo.frequency.setTargetAtTime(3.5 + rnd() * 2, t0, 1);
      lfoAmt.gain.setTargetAtTime(0.04 + rnd() * 0.08, t0, 1);
      keysTone.frequency.setTargetAtTime(mood.bright * (sec.keyset === "vibes" ? 1.2 : 1), t0, 1.5);
      if (opts.onSection) opts.onSection({ bar: bar, prog: PROGS[p].key, keyset: sec.keyset, mood: mood });
    }

    function scheduleBar() {
      var inSec = bar % SECTION;
      if (inSec === 0) newSection();
      var fill = inSec === SECTION - 1;
      // 마지막 마디는 다음 구간 템포로 천천히 맞춰 가요 (필인과 함께)
      var target = 60 / (fill && pending ? pending.bpm : mood.bpm);
      var b0 = beat, b1 = fill ? target : b0;
      function at(beats) { return t0 + beats * b0 + (b1 - b0) * beats * beats / 8; } // 마디 안에서 박 길이가 b0→b1로 선형 변화
      var c = PROGS[sec.prog].chords[bar % 4];
      var notes = c.slice(0, 5), root = c[5];
      var hum = function () { return rnd() * 0.03; };
      var barLen = at(4) - t0;
      // 피아노
      var hits = fill ? [0] : [0, 2.5];
      hits.forEach(function (bt) {
        var h = hum();
        notes.forEach(function (n, i) {
          var nn = i === 4 ? n + sec.spread : n;
          epiano(nn, at(bt) + h + i * 0.012, barLen * (fill ? 1.2 : 0.9), 0.18 + rnd() * 0.04);
        });
      });
      if (sec.melody && bar % 2 === 1 && !fill) {
        [[1.5, notes[4] + 12], [3, notes[3] + 12]].forEach(function (m) { epiano(m[0] ? m[1] : m[1], at(m[0]) + rnd() * 0.02, 1.2, 0.14); });
      }
      if (fill && sec.melody) [[2, notes[2] + 12], [2.5, notes[3] + 12], [3, notes[4] + 12], [3.5, notes[3] + 24]].forEach(function (m) { epiano(m[1], at(m[0]), 0.8, 0.1); });
      // 베이스
      bass(root, at(0), b0 * 1.6, 0.3);
      if (!fill) bass(root + 7, at(2.5), b0 * 0.9, 0.2);
      // 드럼 (처음 한 마디는 피아노만)
      var d = sec.drums;
      if (bar > (opts.introBars === undefined ? 1 : opts.introBars) - 1 && d !== "none") {
        var soft = d === "ghost" ? 0.75 : d === "half" ? 0.65 : 1;
        for (var q = 0; q < 4; q++) {
          if (fill && q >= 2) break;
          var on = at(q), off = at(q + SWING);
          if (d === "half") {
            if (q === 0) kick(on, 0.9);
            if (q === 2) snare(on + 0.015, 0.8);
          } else {
            if (q === 0) kick(on, 1);
            if (q === 2) kick(off, 0.7);
            if (q === 1 || q === 3) snare(on + 0.015, 1);
            if (d === "ghost" && rnd() < 0.35) snare(at(q + 0.75), 0.18);
          }
          hat(on, soft);
          hat(off, 0.6 * soft);
        }
        if (fill) { // 필인: 스네어를 점점 세게, 끝에 열린 하이햇
          for (var k = 0; k < 8; k++) snare(at(2 + k * 0.25), 0.25 + k * 0.08);
          hat(at(3.75), 0.8, true);
        }
      }
      // 천둥: 폭풍일 때 가끔 낮게 우르릉
      if (mood.ambience === "storm" && rnd() < 0.08) {
        var rg = amb.rumble.gain; var tt = at(rnd() * 3);
        rg.setTargetAtTime(LEVEL.rumble, tt, 0.4); rg.setTargetAtTime(LEVEL.rumble * 0.25, tt + 1.5, 1.2);
      }
      t0 += barLen;
      beat = b1;
      bar++;
    }

    return {
      /** time(초)까지 미리 예약해요 */
      scheduleUntil: function (time) { while (t0 < time) scheduleBar(); },
      /** 분위기 바꾸기: 환경음은 바로 천천히, 템포와 드럼은 다음 구간에서 (필인으로 이어서) */
      setMood: function (state, at) {
        var m = moodOf(state);
        pending = m;
        setAmbience(m.ambience, at === undefined ? ctx.currentTime : at, 2.5);
      },
      fade: function (to, sec2) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(to, ctx.currentTime, sec2 / 3); },
      setVolume: function (v) { this.volume = v; },
      realign: function (t) { t0 = Math.max(t0, t); },
      jumpTo: function (t) { t0 = t; },
      get bar() { return bar; },
      get mood() { return pending || mood; },
      get bpm() { return mood.bpm; },
      master: master,
    };
  }

  /* ── 미리 렌더 (테스트와 미리듣기용) ── */
  function renderOffline(seconds, plan, sampleRate) {
    sampleRate = sampleRate || 44100;
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx = new Off(2, Math.floor(seconds * sampleRate), sampleRate);
    var sections = [];
    var e = createEngine(ctx, ctx.destination, { state: plan[0].state, seed: plan[0].seed || 7, onSection: function (s) { sections.push(s); } });
    e.master.gain.setValueAtTime(0, 0);
    e.master.gain.linearRampToValueAtTime(LEVEL.master, 2);
    // 상태 변화를 시간 순서대로 넣어 가며 예약해요
    var times = plan.map(function (p) { return p.at || 0; });
    for (var i = 1; i < plan.length; i++) {
      e.scheduleUntil(plan[i].at);
      e.setMood(plan[i].state, plan[i].at);
    }
    e.scheduleUntil(seconds);
    e.master.gain.setValueAtTime(LEVEL.master, seconds - 2);
    e.master.gain.linearRampToValueAtTime(0, seconds);
    return ctx.startRendering().then(function (buf) { return { buffer: buf, sections: sections, times: times }; });
  }

  window.Lofi = { createEngine: createEngine, moodOf: moodOf, renderOffline: renderOffline, LEVEL: LEVEL, PROGS: PROGS };

  /* ── 화면의 작은 플레이어 ─────────────────────── */
  var box = document.getElementById("lofi");
  if (!box || !(window.AudioContext || window.webkitAudioContext)) return;
  var C = window.COURSE || {};
  var API = String((C.config || {}).apiBase || "").replace(/\/+$/, "");
  var KEY = "cs_lofi";
  var btn = box.querySelector(".lofi-btn"), label = box.querySelector(".lofi-label"), vol = box.querySelector(".lofi-vol");
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var volume = typeof saved.volume === "number" ? saved.volume : 0.7;
  vol.value = String(Math.round(volume * 100));
  var ctx = null, engine = null, timer = null, playing = false, state = null;

  function save(extra) {
    var o = { volume: volume, playing: playing, seed: saved.seed || Math.floor(Math.random() * 1e9), bar: engine ? engine.bar : saved.bar || 0, bpm: engine ? engine.bpm : saved.bpm || 72, at: Date.now() };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    saved = o;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  function localState() {
    var h = new Date(Date.now() + 9 * 3600000).getUTCHours();
    return { phase: h >= 5 && h < 7 ? "dawn" : h >= 7 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night", weather: "clear", activity: "study" };
  }
  function fetchState() {
    if (!API) return Promise.resolve(localState());
    return fetch(API + "/api/now").then(function (r) { return r.ok ? r.json() : localState(); }, function () { return localState(); });
  }

  function show() {
    btn.innerHTML = playing ? '<span class="lofi-pause"></span>' : "▶";
    btn.setAttribute("aria-label", playing ? "로파이 멈추기" : "로파이 틀기");
    box.classList.toggle("is-playing", playing);
    label.textContent = engine && playing ? engine.mood.label + "의 로파이" : saved.playing && !playing ? "이어 듣기" : "로파이 틀기";
  }

  function start(resume) {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 페이지를 옮겨 왔으면, 떠난 뒤 흐른 시간만큼 마디를 넘겨서 이어지는 느낌을 줘요
      var bar = 0;
      if (resume && saved.at) bar = (saved.bar || 0) + Math.floor((Date.now() - saved.at) / 1000 / (240 / (saved.bpm || 72)));
      engine = createEngine(ctx, ctx.destination, { state: state || localState(), seed: saved.seed || Math.floor(Math.random() * 1e9), bar: bar, introBars: resume ? 0 : 1 });
      timer = setInterval(function () {
        if (!playing) return;
        engine.scheduleUntil(ctx.currentTime + 0.6);
        if (Math.random() < 0.02) save();
      }, 120);
      setInterval(function () { fetchState().then(function (s) { state = s; if (engine) engine.setMood(s); show(); }); }, 10 * 60 * 1000);
    }
    ctx.resume().then(function () {
      playing = true;
      engine.realign(ctx.currentTime + 0.1);
      engine.scheduleUntil(ctx.currentTime + 0.6);
      engine.fade(LEVEL.master * volume, resume ? 2.5 : 1.5); // 서서히 들어와요
      save();
      show();
    });
  }
  function stop() {
    if (!ctx) return;
    playing = false;
    engine.fade(0, 1.2); // 서서히 줄이고 멈춰요
    setTimeout(function () { if (!playing) ctx.suspend(); }, 1500);
    save();
    show();
  }

  btn.addEventListener("click", function (e) { e.stopPropagation(); playing ? stop() : start(false); });
  vol.addEventListener("input", function () {
    volume = Number(vol.value) / 100;
    if (engine && playing) engine.fade(LEVEL.master * volume, 0.2);
    save();
  });
  // 페이지를 옮기기 전에 위치를 저장해요
  window.addEventListener("pagehide", function () { if (engine) save(); });

  fetchState().then(function (s) { state = s; show(); });
  // 이전 페이지에서 듣고 있었다면, 이 페이지에서 처음 누르거나 키를 칠 때 이어서 틀어요 (브라우저 규칙상 한 번의 동작이 필요해요)
  if (saved.playing && saved.at && Date.now() - saved.at < 30 * 60 * 1000) {
    box.classList.add("is-waiting");
    var once = function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("#lofi")) return; // 플레이어 버튼은 따로 처리해요
      document.removeEventListener("pointerdown", once, true);
      document.removeEventListener("keydown", once, true);
      box.classList.remove("is-waiting");
      if (!playing) start(true);
    };
    document.addEventListener("pointerdown", once, true);
    document.addEventListener("keydown", once, true);
  } else if (saved.playing) {
    save({ playing: false });
  }
  show();
})();
