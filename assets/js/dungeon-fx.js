/* 히든 던전 등장 연출.
   새로 열린 던전이 있으면, 어느 페이지를 열든 화면 가운데에 한 번 크게 띄워요. 본 던전은 이 브라우저에 기억해요.
   분야마다 그림과 연출이 달라요: 서버는 랙이 부팅되고, 프론트는 화면이 위에서부터 그려지고,
   AI는 신경망 점이 반짝이며 이어지고, 히든 보스는 경고와 함께 화면이 흔들려요.
   미리 보기: 아무 페이지 주소 끝에 ?dungeon-demo=server (front, ai, boss) */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var K = C.computed || {};
  var cfg = C.config || {};
  var SEEN_KEY = "cs_seen_dungeons";

  var SPRITES = {
    server: [
      "................",
      ".##############.",
      ".#LLLLLLLLLLLL#.",
      ".#L--------gyL#.",
      ".#LLLLLLLLLLLL#.",
      ".##############.",
      ".#LLLLLLLLLLLL#.",
      ".#L--------gyL#.",
      ".#LLLLLLLLLLLL#.",
      ".##############.",
      ".#LLLLLLLLLLLL#.",
      ".#L--------gyL#.",
      ".#LLLLLLLLLLLL#.",
      ".##############.",
      "..#..........#..",
      ".###........###."
    ],
    front: [
      "................",
      ".##############.",
      ".#TrTyTgTTTTTT#.",
      ".##############.",
      ".#WWWWWWWWWWWW#.",
      ".#WppppppWWWWW#.",
      ".#WWWWWWWWWWWW#.",
      ".#WqqqqWWqqqqW#.",
      ".#WqqqqWWqqqqW#.",
      ".#WqqqqWWqqqqW#.",
      ".#WWWWWWWWWWWW#.",
      ".#WppppppppppW#.",
      ".#WppppppWWWWW#.",
      ".#WWWWWWWWWWWW#.",
      ".##############.",
      "................"
    ],
    ai: [
      "................",
      "...##......##...",
      "..#nn#....#nn#..",
      "..#nn#....#nn#..",
      "...##l....l##...",
      ".....l....l.....",
      "......l..l......",
      ".......##.......",
      "......#nn#......",
      "......#nn#......",
      ".......##.......",
      "......l..l......",
      ".....l....l.....",
      "...##l....l##...",
      "..#nn#....#nn#..",
      "...##......##..."
    ],
    boss: [
      "................",
      "..#..........#..",
      "..##........##..",
      "...##########...",
      "..#MMMMMMMMMM#..",
      ".#MMMMMMMMMMMM#.",
      ".#MEEMMMMMMEEM#.",
      ".#MEEMMMMMMEEM#.",
      ".#MMMMMMMMMMMM#.",
      ".#MMMMMMMMMMMM#.",
      ".#MtMtMtMtMtMt#.",
      ".#MMMMMMMMMMMM#.",
      "..#MMMMMMMMMM#..",
      "...##########...",
      "................",
      "................"
    ]
  };
  var THEME = {
    server: { color: "#3f6fb5", light: "#9fc0ec", title: "히든 던전 등장", log: ["랙 전원 켜는 중", "/dungeon 마운트 ... ok", "포트 열림. 들어갈 수 있어요"] },
    front: { color: "#b5603f", light: "#f3c9a8", title: "히든 던전 등장", log: ["파싱 ... DOM 트리 완성", "레이아웃 ... 페인트 ... 합성", "첫 화면이 그려졌어요"] },
    ai: { color: "#6b4fb0", light: "#cbbcf0", title: "히든 던전 등장", log: ["가중치 불러오는 중", "다음 토큰: 던전", "확률 0.97로 열렸어요"] },
    boss: { color: "#c7372d", light: "#ff9b8f", title: "히든 보스 출현", log: ["경고: 강한 기운이 느껴져요", "이 분야의 던전을 모두 깼어요", "마지막 상대가 기다려요"] }
  };
  function colorFor(ch, th) {
    return {
      "#": "#141a2b", "L": th.light, "B": th.color, "-": "#2a3350", "g": "#55d468", "y": "#f2c14a",
      "T": th.color, "r": "#ff6a5c", "W": "#fbfcfe", "p": th.color, "q": th.light,
      "n": th.color, "l": th.light, "M": th.color, "E": "#ffe066", "t": "#fbfcfe"
    }[ch];
  }

  function fieldKey(d) { return d.type === "히든 보스" ? "boss" : d.field === "서버" ? "server" : d.field === "프론트" ? "front" : "ai"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function seen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch (e) { return []; } }
  function markSeen(id) {
    try { var s = seen(); if (s.indexOf(id) < 0) s.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* 기억 못 해도 다음에 또 보여 줄 뿐이에요 */ }
  }

  function spriteSvg(key, th) {
    var rows = SPRITES[key], cells = [], n = 0;
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var col = colorFor(row.charAt(x), th);
        if (!col) continue;
        // 연출마다 칸이 나타나는 순서가 달라요
        var delay = key === "front" ? y * 70 : key === "ai" ? ((x * 7 + y * 13) % 17) * 45 : key === "boss" ? 0 : (15 - y) * 40 + x * 6;
        var cls = "px" + ("gyE".indexOf(row.charAt(x)) >= 0 ? " px-glow" : "") + (row.charAt(x) === "l" ? " px-link" : "");
        cells.push('<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="1.02" height="1.02" fill="' + col + '" style="animation-delay:' + delay + 'ms"/>');
        n++;
      }
    });
    return '<svg class="dfx-sprite" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">' + cells.join("") + "</svg>";
  }

  var queue = [], showing = false;
  function show(d) {
    showing = true;
    var key = fieldKey(d), th = THEME[key];
    var wrap = document.createElement("div");
    wrap.className = "dfx dfx-" + key;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "dfx-title");
    wrap.style.setProperty("--dfx", th.color);
    wrap.style.setProperty("--dfx-light", th.light);
    var rooms = d.rooms ? d.rooms.length : 0;
    var href = (cfg.treeUrl || "/tree/") + "#" + encodeURIComponent(d.id);
    wrap.innerHTML =
      (key === "boss" ? '<div class="dfx-warn dfx-warn-top" aria-hidden="true"><span>WARNING 히든 보스 출현 WARNING 히든 보스 출현 WARNING 히든 보스 출현</span></div><div class="dfx-warn dfx-warn-bottom" aria-hidden="true"><span>WARNING 히든 보스 출현 WARNING 히든 보스 출현 WARNING 히든 보스 출현</span></div>' : "") +
      '<div class="dfx-panel">' +
        '<p class="dfx-kicker">' + esc(d.field) + (key === "boss" ? " 분야의 끝" : " 히든 던전") + "</p>" +
        '<h2 class="dfx-title" id="dfx-title">' + esc(th.title) + "!</h2>" +
        spriteSvg(key, th) +
        '<p class="dfx-name">' + esc(d.name) + "</p>" +
        '<ol class="dfx-log">' + th.log.map(function (l, i) { return '<li style="animation-delay:' + (900 + i * 450) + 'ms">' + esc(l) + "</li>"; }).join("") + "</ol>" +
        '<p class="dfx-meta">' + (rooms ? "방 " + rooms + "개, " : "") + "약 " + d.hours + "시간</p>" +
        '<div class="dfx-actions"><a class="px-btn is-primary dfx-go" href="' + esc(href) + '">들어가 보기</a> <button type="button" class="px-btn dfx-later">나중에</button></div>' +
      "</div>";
    document.body.appendChild(wrap);
    document.body.classList.add("dfx-open");
    if (key === "boss") document.documentElement.classList.add("dfx-shake");
    var go = wrap.querySelector(".dfx-go");
    var later = wrap.querySelector(".dfx-later");
    setTimeout(function () { (go || later).focus(); }, 50);
    if (!d.demo) markSeen(d.id);
    function close() {
      document.removeEventListener("keydown", onKey);
      wrap.classList.add("is-leaving");
      document.documentElement.classList.remove("dfx-shake");
      setTimeout(function () {
        wrap.remove();
        document.body.classList.remove("dfx-open");
        showing = false;
        next();
      }, 220);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") { // 대화상자 안에서만 돌아요
        var f = [go, later];
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener("keydown", onKey);
    later.addEventListener("click", close);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
  }
  function next() { if (!showing && queue.length) show(queue.shift()); }

  /* 데모 */
  var demo = (location.search.match(/[?&]dungeon-demo=(server|front|ai|boss)/) || [])[1];
  if (demo) {
    var fields = { server: "서버", front: "프론트", ai: "AI", boss: "서버" };
    queue.push({ id: "demo", demo: true, field: fields[demo], type: demo === "boss" ? "히든 보스" : "히든 던전",
      name: demo === "boss" ? "히든 보스: 미리 보기" : "미리 보기 던전", rooms: [1, 2, 3, 4, 5, 6, 7, 8], hours: 8 });
  }

  /* 새로 열린 던전 */
  var fresh = (K.dungeons || []).filter(function (d) { return d.open && !d.done && seen().indexOf(d.id) < 0; });
  // 보스는 맨 마지막에 나와요
  fresh.sort(function (a, b) { return (a.type === "히든 보스") - (b.type === "히든 보스"); });
  fresh.forEach(function (d) { queue.push(d); });
  // 트리와 계획서에서는 새로 열린 칸이 한 번 반짝여요
  fresh.forEach(function (d) {
    document.querySelectorAll('[data-id="' + d.id + '"], [data-dungeon="' + d.id + '"]').forEach(function (el) { el.classList.add("is-new"); });
  });
  if (queue.length) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(next, 400); });
    else setTimeout(next, 400);
  }
})();
