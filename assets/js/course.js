/* 계획서 데이터(_data/quests.csv)와 제출한 리포트로 진도, 일정, 출석부, 배지를 계산해 화면에 그려요. */
(function () {
  "use strict";

  /* ── 테마 전환 ─────────────────────────────────── */
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  function effectiveTheme() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function syncToggle() {
    if (!toggle) return;
    var dark = effectiveTheme() === "dark";
    toggle.querySelector(".theme-label").textContent = dark ? "라이트 모드" : "다크 모드";
    toggle.setAttribute("aria-label", dark ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기");
  }
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      syncToggle();
      drawBadges();
    });
    syncToggle();
  }

  /* ── 픽셀 배지 ─────────────────────────────────── */
  // 시즌마다 8x8 글리프. 1이 칠할 칸이에요.
  var GLYPHS = {
    S0: ["11111...", "1111111.", "11111...", "1.......", "1.......", "1.......", "1.......", "11......"],
    S1: [".11.....", "...1....", "...1....", "...11...", "..1.1...", "..1..1..", ".1...1..", "1.....11"],
    S2: [".1.11.1.", "11111111", ".1....1.", "11.11.11", "11.11.11", ".1....1.", "11111111", ".1.11.1."],
    S3: ["...11...", ".1.11.1.", "..1111..", "111..111", "111..111", "..1111..", ".1.11.1.", "...11..."],
    S4: ["11111111", "11......", ".11.....", "..11....", "..11....", ".11.....", "11......", "11111111"],
    S5: ["11....11", "11....11", "..1..1..", "...11...", "...11...", "..1..1..", "11....11", "11....11"],
    S6: [".111111.", "1......1", "..1111..", ".1....1.", "...11...", "..1..1..", "...11...", "...11..."],
    S7: [".111111.", "1......1", ".111111.", "1......1", "1......1", ".111111.", "1......1", ".111111."],
    S8: ["..1..1..", ".1....1.", ".1....1.", "1......1", ".1....1.", ".1....1.", "..1..1..", "........"],
    S9: ["...11...", "...11...", "..1..1..", "..1..1..", ".1....1.", "11....11", "11111111", "........"]
  };
  var COLORS = { S0: "#4fb3d9", S1: "#8a63d2", S2: "#3f8fe0", S3: "#25ad9e", S4: "#48b058", S5: "#e2a52c", S6: "#f0843a", S7: "#e0483e", S8: "#d457a8", S9: "#4a5bd6" };
  // 14x14 팔각형 바탕
  var BASE = [
    "....111111....", "...11111111...", "..1111111111..", ".111111111111.",
    "11111111111111", "11111111111111", "11111111111111", "11111111111111",
    "11111111111111", "11111111111111", ".111111111111.", "..1111111111..",
    "...11111111...", "....111111...."
  ];
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function badgeSVG(code, unlocked) {
    var line = cssVar("--line") || "#33415c";
    var fill = unlocked ? (COLORS[code] || "#7d93ad") : (cssVar("--lock-fill") || "#c9d2dd");
    var glyphColor = unlocked ? "#ffffff" : (cssVar("--lock-glyph") || "#a3afbf");
    var rects = [];
    var y, x;
    for (y = 0; y < 14; y++) for (x = 0; x < 14; x++) {
      if (BASE[y][x] !== "1") continue;
      var edge = y === 0 || y === 13 || x === 0 || x === 13 || BASE[y - 1][x] !== "1" || BASE[y + 1][x] !== "1" || BASE[y][x - 1] !== "1" || BASE[y][x + 1] !== "1";
      rects.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + (edge ? line : fill) + '"/>');
    }
    // 밝은 하이라이트 한 줄
    if (unlocked) for (x = 4; x < 8; x++) rects.push('<rect x="' + x + '" y="2" width="1" height="1" fill="#ffffff" fill-opacity="0.45"/>');
    var g = GLYPHS[code] || GLYPHS.S0;
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      if (g[y][x] === "1") rects.push('<rect x="' + (x + 3) + '" y="' + (y + 3) + '" width="1" height="1" fill="' + glyphColor + '"/>');
    }
    return '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">' + rects.join("") + "</svg>";
  }

  var C = window.COURSE;
  var unlockedBySeason = {};

  function drawBadges() {
    document.querySelectorAll("[data-badge]").forEach(function (el) {
      var code = el.getAttribute("data-badge");
      var unlocked = el.hasAttribute("data-unlocked") ? true : el.hasAttribute("data-locked") ? false : (code in unlockedBySeason ? unlockedBySeason[code] : true);
      el.innerHTML = badgeSVG(code, unlocked);
    });
  }

  if (!C) { drawBadges(); return; }
  C.drawBadges = drawBadges;
  var cfg = C.config;
  var DAY = 86400000;

  function bool(v) { return v === true || String(v).trim().toUpperCase() === "TRUE"; }
  function pad(n) { n = String(parseInt(n, 10)); return n.length < 2 ? "0" + n : n; }
  function ymd(v) {
    var m = String(v || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? m[1] + "-" + pad(m[2]) + "-" + pad(m[3]) : "";
  }
  function toDate(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function key(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + Math.round(n)); return x; }
  function fmtFull(d) { return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일"; }
  function fmtMonth(d) { return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function sumHours(list) { return list.reduce(function (a, q) { return a + q.hours; }, 0); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function codeOf(seasonId) { return String(seasonId || "").split(" ")[0]; }

  /* ── 데이터 정리 ───────────────────────────────── */
  var reportsByQuest = {};
  (C.reports || []).forEach(function (r) {
    (reportsByQuest[r.quest] = reportsByQuest[r.quest] || []).push(r);
  });

  var quests = (C.quests || []).map(function (q) {
    var rs = reportsByQuest[q.id] || [];
    var doneByReport = rs.filter(function (r) { return r.complete; }).map(function (r) { return r.date; }).sort()[0];
    return {
      id: q.id, season: q.season, type: q.type, quest: q.quest, recall: q.recall,
      hours: parseFloat(q.hours) || 0,
      done: bool(q.done) || !!doneByReport,
      recalled: bool(q.recalled) || rs.some(function (r) { return r.recalled; }),
      doneDate: ymd(q.date) || doneByReport || "",
      main: q.type !== "사이드"
    };
  });

  var seasons = (C.seasons || []).map(function (meta) {
    var qs = quests.filter(function (q) { return q.season === meta.id; });
    var mains = qs.filter(function (q) { return q.main; });
    var mainsDone = mains.filter(function (q) { return q.done; });
    return {
      meta: meta, quests: qs,
      mainCount: mains.length, mainDone: mainsDone.length,
      mainHours: sumHours(mains), mainDoneHours: sumHours(mainsDone),
      boss: qs.filter(function (q) { return q.type === "보스"; })[0] || null
    };
  });
  seasons.forEach(function (s) {
    s.ratio = s.mainCount ? s.mainDone / s.mainCount : 0;
    s.cleared = s.mainCount > 0 && s.mainDone === s.mainCount;
    s.bossBeaten = !!(s.boss && s.boss.done);
  });

  var currentIndex = seasons.findIndex(function (s) { return !s.cleared; });
  var allDone = currentIndex === -1;
  var current = allDone ? null : seasons[currentIndex];

  // 배지는 보스를 깨면 켜져요. S0는 보스가 없으니 시즌을 끝내면 켜져요.
  seasons.forEach(function (s, i) {
    unlockedBySeason[s.meta.code] = s.boss ? s.bossBeaten : (s.cleared || i <= currentIndex || allDone);
  });

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var start = cfg.start ? toDate(cfg.start) : null;
  var weekly = cfg.weeklyHours || 7;

  /* 주차 배정: 시트의 '주차' 열과 같은 계산이에요.
     메인·보스·복습 과제를 주당 공부 시간으로 채워 나가고, 시즌은 항상 새 주차에서 시작해요. 사이드는 '선택'. */
  var EPS = 1e-6, cum = 0, prevSeason = null;
  quests.forEach(function (q) {
    if (prevSeason !== null && q.season !== prevSeason) cum = Math.ceil(cum / weekly - EPS) * weekly;
    prevSeason = q.season;
    if (!q.main) { q.optional = true; return; }
    var from = cum, to = cum + q.hours;
    cum = to;
    q.weekStart = Math.floor(from / weekly + EPS) + 1;
    q.weekEnd = Math.max(q.weekStart, Math.ceil(to / weekly - EPS));
  });
  var totalWeeks = Math.max(1, Math.ceil(cum / weekly - EPS));
  function weekLabel(q) { return q.optional ? "선택" : q.weekStart === q.weekEnd ? q.weekStart + "주차" : q.weekStart + "~" + q.weekEnd + "주차"; }
  function weekStartDate(w) { return addDays(start, (w - 1) * 7); }
  function fmtShort(d) { return (d.getMonth() + 1) + "월 " + d.getDate() + "일"; }
  function weekDates(w) { return start ? fmtShort(weekStartDate(w)) + " ~ " + fmtShort(addDays(weekStartDate(w), 6)) : ""; }

  var totalMain = 0;
  seasons.forEach(function (s) {
    totalMain += s.mainHours;
    var mains = s.quests.filter(function (q) { return !q.optional; });
    s.weekFrom = Math.min.apply(null, mains.map(function (q) { return q.weekStart; }));
    s.weekTo = Math.max.apply(null, mains.map(function (q) { return q.weekEnd; }));
    if (start && mains.length) {
      s.planStart = weekStartDate(s.weekFrom);
      s.planEnd = addDays(weekStartDate(s.weekTo), 6);
    }
  });
  var currentWeek = start ? Math.floor((today - start) / DAY / 7) + 1 : 1;
  var viewWeek = Math.max(1, Math.min(currentWeek, totalWeeks));
  var courseEnd = start ? addDays(weekStartDate(totalWeeks), 6) : null;
  var overdue = quests.filter(function (q) { return !q.optional && !q.done && q.weekEnd < currentWeek; });
  var ahead = quests.filter(function (q) { return !q.optional && q.done && q.weekStart > currentWeek; });
  // 글쓰기 화면(write.js)도 같은 주차 계산을 써요.
  C.computed = { quests: quests, currentWeek: currentWeek, totalWeeks: totalWeeks, overdue: overdue, weekLabel: weekLabel, weekDates: weekDates };
  var doneMain = seasons.reduce(function (a, s) { return a + s.mainDoneHours; }, 0);
  var mainCount = seasons.reduce(function (a, s) { return a + s.mainCount; }, 0);
  var mainDoneCount = seasons.reduce(function (a, s) { return a + s.mainDone; }, 0);
  var overallPct = mainCount ? Math.round(mainDoneCount / mainCount * 100) : 0;

  var xp = Math.round(sumHours(quests.filter(function (q) { return q.done; })) * cfg.xpPerHour +
    quests.filter(function (q) { return q.recalled; }).length * cfg.xpPerRecall);
  var level = Math.floor(xp / cfg.xpPerLevel) + 1;
  var xpInLevel = xp % cfg.xpPerLevel;

  var activity = {};
  (C.reports || []).forEach(function (r) { if (r.date) activity[r.date] = (activity[r.date] || 0) + 1; });
  quests.forEach(function (q) { if (q.doneDate) activity[q.doneDate] = (activity[q.doneDate] || 0) + 1; });

  function mondayOf(d) { var x = new Date(d.getTime()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  function weekHasActivity(monday) {
    for (var i = 0; i < 7; i++) if (activity[key(addDays(monday, i))]) return true;
    return false;
  }
  var streak = 0;
  var wk = mondayOf(today);
  if (!weekHasActivity(wk)) wk = addDays(wk, -7);
  while (weekHasActivity(wk)) { streak++; wk = addDays(wk, -7); }

  function $(id) { return document.getElementById(id); }

  /* ── 대시보드 ──────────────────────────────────── */
  var statusEl = $("status-line");
  if (statusEl) {
    var text;
    if (start && today < start) {
      text = "개강까지 " + Math.round((start - today) / DAY) + "일 남았어요. 첫 시즌은 " + seasons[0].meta.code + " " + seasons[0].meta.title + "이에요.";
    } else if (allDone) {
      text = "아홉 시즌을 모두 마쳤어요. 1년 동안 수고했어요!";
    } else {
      text = (currentWeek > totalWeeks ? "예정된 " + totalWeeks + "주차가 지났어요. " : "지금은 " + currentWeek + "주차, ") +
        current.meta.code + " " + current.meta.title + " 수강 중이에요. 전체 메인 과제의 " + overallPct + "%를 끝냈어요.";
    }
    statusEl.textContent = text;
  }

  var noteEl = $("schedule-note");
  if (noteEl && start) {
    var note;
    if (today < start) note = (start.getMonth() + 1) + "월 " + start.getDate() + "일에 개강해요. 첫 과제부터 천천히 가봐요.";
    else if (allDone) note = "모든 배지를 모았어요.";
    else if (overdue.length) note = "지난 주차에서 밀린 과제가 " + overdue.length + "개 있어요. 오늘 15분만 해볼까요?";
    else if (ahead.length) note = "다음 주차 과제를 " + ahead.length + "개 미리 끝냈어요. 일정보다 앞서 있어요.";
    else note = "딱 일정대로 가고 있어요.";
    noteEl.textContent = note;
  }

  var trackEl = $("track");
  if (trackEl) {
    trackEl.innerHTML = seasons.map(function (s, i) {
      var state = s.cleared ? "is-done" : (i === currentIndex ? "is-current" : "is-upcoming");
      var lockedAttr = state === "is-upcoming" ? " data-locked" : " data-unlocked";
      return '<li class="stop ' + state + '">' +
        (s.bossBeaten ? '<span class="clear-mark">격파!</span>' : "") +
        '<a href="' + esc(cfg.syllabusUrl) + "#" + esc(s.meta.slug) + '">' +
        '<span class="badge" data-badge="' + esc(s.meta.code) + '"' + lockedAttr + ' aria-hidden="true"></span>' +
        '<span class="stop-code">' + esc(s.meta.code) + "</span>" +
        '<span class="stop-name">' + esc(s.meta.title) + "</span>" +
        '<span class="stop-count">' + s.mainDone + "/" + s.mainCount + "</span>" +
        '<span class="sr">' + (state === "is-done" ? "완료" : state === "is-current" ? "수강 중" : "예정") + "</span>" +
        "</a></li>";
    }).join("");
  }

  /* 이번 주차 강의: 밀린 과제 → 이번 주차 과제. 다 끝냈으면 다음 주차 미리 보기 */
  var nextEl = $("next-quests");
  if (nextEl) {
    var w = viewWeek;
    var titleEl = $("todo-title"), datesEl = $("week-dates");
    if (titleEl) titleEl.textContent = w + "주차 강의";
    if (datesEl) datesEl.textContent = (start ? weekDates(w) + ", " : "") + "주 " + weekly + "시간 기준" + (currentWeek < 1 ? ". 개강 전이라 1주차를 보여줘요." : "");
    var thisWeek = quests.filter(function (q) { return !q.optional && q.weekStart <= w && q.weekEnd >= w; });
    var late = currentWeek >= 1 ? overdue.filter(function (q) { return thisWeek.indexOf(q) === -1; }) : [];
    function item(q, extraTag) {
      var tags = (extraTag ? '<span class="tag tag-밀림">' + extraTag + "</span> " : "") +
        (q.type !== "메인" ? '<span class="tag tag-' + esc(q.type) + '">' + esc(q.type) + "</span> " : "");
      return '<li class="' + (q.done ? "is-done" : "") + '"><span class="todo-title">' + tags + esc(q.quest) + "</span>" +
        '<span class="todo-meta">' + esc(weekLabel(q)) + ", " + esc(q.season) + ", 약 " + q.hours + "시간" + (q.done ? ", 끝냄" : "") + "</span>" +
        (q.recall && !q.done ? '<span class="todo-recall">인출: ' + esc(q.recall) + "</span>" : "") + "</li>";
    }
    var html = late.map(function (q) { return item(q, "밀림"); }).join("") + thisWeek.map(function (q) { return item(q); }).join("");
    var left = late.length + thisWeek.filter(function (q) { return !q.done; }).length;
    if (!left) {
      var preview = quests.filter(function (q) { return !q.optional && !q.done && q.weekStart > w; }).slice(0, 2);
      html += '<li class="week-clear">이번 주차 강의를 다 들었어요!' + (preview.length ? " 다음 주차를 미리 시작해도 좋아요." : "") + "</li>" +
        preview.map(function (q) { return item(q, "예습"); }).join("");
    }
    nextEl.innerHTML = html || '<li class="empty">남은 과제가 없어요.</li>';
    var first = nextEl.querySelector("li:not(.is-done):not(.week-clear)");
    if (first) first.classList.add("is-cursor");
  }

  var cardEl = $("student-card");
  if (cardEl) {
    var photoCode = current ? current.meta.code : seasons[seasons.length - 1].meta.code;
    var last = seasons[seasons.length - 1];
    var badges = seasons.filter(function (s) { return s.meta.code !== "S0"; }).map(function (s) {
      return '<span class="badge" data-badge="' + esc(s.meta.code) + '"' + (s.bossBeaten ? "" : " data-locked") + ' title="' + esc(s.meta.code + " " + s.meta.title + (s.bossBeaten ? " 배지" : " 배지 (보스를 깨면 켜져요)")) + '"></span>';
    }).join("");
    var stats = [
      ["연속 출석", streak + "주"],
      ["백지 인출", quests.filter(function (q) { return q.recalled; }).length + "회"],
      ["제출 리포트", (C.reports || []).length + "편"],
      ["종강 예정", courseEnd ? totalWeeks + "주차, " + fmtMonth(courseEnd) : totalWeeks + "주차"]
    ];
    cardEl.innerHTML =
      '<div class="card-top">' +
        '<div class="card-photo" data-badge="' + esc(photoCode) + '" data-unlocked aria-hidden="true"></div>' +
        '<dl class="card-id"><dt>이름</dt><dd>' + esc(cfg.student) + "</dd><dt>소속</dt><dd>" + (current ? esc(current.meta.code + " " + current.meta.title) : "졸업") + "</dd><dt>레벨</dt><dd>Lv. " + level + "</dd></dl>" +
      "</div>" +
      '<div class="bar-row"><span class="bar-label">진도</span><span class="bar bar-hp"><span style="width:' + overallPct + '%"></span></span><span class="bar-num">' + mainDoneCount + "/" + mainCount + "</span></div>" +
      '<div class="bar-row"><span class="bar-label">XP</span><span class="bar bar-xp"><span style="width:' + Math.round(xpInLevel / cfg.xpPerLevel * 100) + '%"></span></span><span class="bar-num">' + xpInLevel + "/" + cfg.xpPerLevel + "</span></div>" +
      '<div class="badge-case" aria-label="배지 케이스, ' + seasons.filter(function (s) { return s.bossBeaten; }).length + '개 획득">' + badges + "</div>" +
      '<dl class="card-stats">' + stats.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>";
  }

  var heatEl = $("heatmap");
  if (heatEl) {
    var weeks = 26;
    var first = addDays(mondayOf(today), -7 * (weeks - 1));
    var cells = [];
    for (var w = 0; w < weeks; w++) {
      for (var d = 0; d < 7; d++) {
        var day = addDays(first, w * 7 + d);
        var k = key(day), n = activity[k] || 0;
        var lv = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : 3;
        cells.push('<span class="cell l' + lv + (day > today ? " future" : "") + (k === key(today) ? " today" : "") + '" title="' + k + (n ? ", 기록 " + n + "개" : "") + '"></span>');
      }
    }
    heatEl.innerHTML = '<div class="cells">' + cells.join("") + '</div><div class="heat-axis"><span>26주 전</span><span>이번 주</span></div>';
  }

  /* ── 계획서 ────────────────────────────────────── */
  var byId = {};
  quests.forEach(function (q) { byId[q.id] = q; });
  document.querySelectorAll("tr[data-quest]").forEach(function (tr) {
    var q = byId[tr.getAttribute("data-quest")];
    if (q && q.done) {
      tr.classList.add("is-done");
      var c = tr.querySelector(".check");
      if (c) c.setAttribute("aria-label", "완료");
    }
  });
  function sel(attr, id) { return document.querySelectorAll("[" + attr + '="' + id.replace(/"/g, '\\"') + '"]'); }
  seasons.forEach(function (s, i) {
    var sec = document.querySelector('.season[data-season="' + s.meta.id.replace(/"/g, '\\"') + '"]');
    if (sec) {
      if (i === currentIndex) sec.classList.add("is-current");
      var b = sec.querySelector(".season-badge");
      if (b) b.setAttribute(allDone || i <= currentIndex ? "data-unlocked" : "data-locked", "");
    }
    sel("data-season-dates", s.meta.id).forEach(function (el) {
      el.textContent = s.planStart ? s.weekFrom + "~" + s.weekTo + "주차 (" + fmtFull(s.planStart) + " ~ " + fmtFull(s.planEnd) + ")" : s.weekFrom + "~" + s.weekTo + "주차";
    });
    sel("data-season-progress", s.meta.id).forEach(function (el) {
      el.textContent = s.mainDone + "/" + s.mainCount + (s.bossBeaten ? ", 보스 격파" : "");
    });
    sel("data-season-fill", s.meta.id).forEach(function (el) {
      el.style.width = Math.round(s.ratio * 100) + "%";
    });
  });

  document.querySelectorAll(".season tbody").forEach(function (tbody) {
    var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr[data-quest]"));
    if (!rows.length) return;
    var cols = rows[0].children.length;
    function headRow(label, sub, cls) {
      var tr = document.createElement("tr");
      tr.className = "week-row" + (cls ? " " + cls : "");
      tr.innerHTML = '<th scope="rowgroup" colspan="' + cols + '">' + esc(label) + (sub ? ' <span class="week-sub">' + esc(sub) + "</span>" : "") +
        (cls === "is-now" ? ' <span class="now-tag">이번 주</span>' : "") + "</th>";
      return tr;
    }
    var main = [], side = [];
    rows.forEach(function (r) { var q = byId[r.getAttribute("data-quest")]; (q && q.optional ? side : main).push(r); });
    var frag = document.createDocumentFragment(), lastWeek = null;
    main.forEach(function (r) {
      var q = byId[r.getAttribute("data-quest")];
      if (q && q.weekStart !== lastWeek) {
        lastWeek = q.weekStart;
        frag.appendChild(headRow(q.weekStart + "주차", weekDates(q.weekStart), q.weekStart === currentWeek ? "is-now" : ""));
      }
      if (q && q.weekEnd > q.weekStart) {
        var cell = r.querySelector(".c-quest");
        if (cell) cell.insertAdjacentHTML("beforeend", ' <span class="span-weeks">' + esc(weekLabel(q)) + "에 걸쳐</span>");
      }
      frag.appendChild(r);
    });
    if (side.length) {
      frag.appendChild(headRow("선택 과제", "주차에 넣지 않았어요. 재밌어서 더 하고 싶을 때만 해요.", "is-side"));
      side.forEach(function (r) { frag.appendChild(r); });
    }
    tbody.appendChild(frag);
  });

  drawBadges();

  /* ── 리포트 목록 필터 ──────────────────────────── */
  var chips = document.querySelectorAll(".chip[data-filter]");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.getAttribute("data-filter");
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
      var shown = 0;
      document.querySelectorAll(".report-list-full li").forEach(function (li) {
        var ok = f === "all" || li.getAttribute("data-season") === f;
        li.hidden = !ok;
        if (ok) shown++;
      });
      var empty = document.getElementById("filter-empty");
      if (empty) empty.hidden = shown !== 0;
    });
  });
})();
