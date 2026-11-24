/* 출석부: 홈의 '오늘' 카드와 출석부 화면.
   출석 버튼을 누르면 그날이 출석으로 남아요(하루 하나, 끝내기 없음).
   얼마나 공부했는지는 나중에 그날 기록을 열어 적어요. 보는 건 누구나, 출석과 고치기는 블로그 주인만 해요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var cfg = C.config || {};
  var A = window.BlogAuth;
  var API = String(cfg.apiBase || "").replace(/\/+$/, "");
  var state = { list: normalize(C.checkins || []) };
  var isOwner = false;

  function $(id) { return document.getElementById(id); }
  function node(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function kstDay(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 10); }
  function today() { return kstDay(Date.now()); }
  function dur(m) {
    if (m == null) return "";
    if (m < 60) return m + "분";
    return Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "");
  }
  function dayLabel(d) {
    var dt = new Date(d + "T00:00:00+09:00");
    return (dt.getMonth() + 1) + "월 " + dt.getDate() + "일 (" + "일월화수목금토".charAt(dt.getDay()) + ")";
  }
  /** 예전 기록(start, end)이 섞여 있어도 하루 하나로 맞춰요. 서버와 같은 규칙이에요. */
  function normalize(items) {
    var by = {};
    items.forEach(function (c) {
      if (c.date) { var dd = String(c.date).slice(0, 10); by[dd] = Object.assign({}, c, { date: dd }); return; }
      if (!c.start) return;
      var s = String(c.start), d = s.slice(0, 10);
      var m = c.end ? Math.round((new Date(c.end) - new Date(s)) / 60000) : null;
      if (!(m > 0 && m <= 720)) m = null;
      if (!by[d]) by[d] = { date: d, at: s.slice(11, 16), text: c.text, minutes: m == null ? undefined : m, note: c.note };
      else if (m != null) by[d].minutes = (by[d].minutes || 0) + m;
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }
  function find(d) { return state.list.filter(function (c) { return c.date === d; })[0] || null; }
  function streak() {
    var n = 0, d = Date.now();
    if (!find(kstDay(d))) d -= 86400000; // 오늘 아직이면 어제부터 세요
    while (find(kstDay(d))) { n++; d -= 86400000; }
    return n;
  }

  /* ── 오늘 카드 ───────────────────────────────── */
  function renderNow() {
    var body = $("now-body");
    if (!body) return;
    body.textContent = "";
    var c = find(today());
    var s = streak();
    if (c) {
      var line = node("p", { "class": "now-line" });
      line.appendChild(node("span", { "class": "now-stamp", "aria-hidden": "true" }, "출석"));
      line.appendChild(document.createTextNode(" 오늘 " + c.at + "에 출석했어요" + (c.text ? ". " + c.text : "")));
      body.appendChild(line);
      body.appendChild(node("p", { "class": "now-meta" },
        (c.minutes != null ? "공부 " + dur(c.minutes) + " 적었어요." : "얼마나 했는지는 나중에 적으면 돼요.") + (s > 1 ? " " + s + "일째 연속 출석이에요." : "")));
    } else {
      body.appendChild(node("p", { "class": "now-line is-idle" }, "오늘은 아직 출석 전이에요."));
      if (s) body.appendChild(node("p", { "class": "now-meta" }, "어제까지 " + s + "일 연속 출석했어요."));
    }
    renderForm(c);
  }

  function renderForm(c) {
    var form = $("now-form");
    if (!form) return;
    form.textContent = "";
    form.hidden = !isOwner;
    if (!isOwner) return;
    if (c) {
      form.onsubmit = function (e) { e.preventDefault(); };
      var d = node("details", { "class": "ck-today" });
      d.appendChild(node("summary", null, c.minutes == null ? "오늘 공부한 시간 적기" : "오늘 기록 고치기"));
      d.appendChild(editor(c));
      form.appendChild(d);
      return;
    }
    var text = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "오늘 할 것 한 마디 (선택). 예: S1 1.1 읽기", "aria-label": "오늘 할 것 한 마디" });
    var go = node("button", { type: "submit", "class": "px-btn is-primary" }, "출석");
    var msg = node("span", { "class": "mini-msg", role: "status" });
    form.appendChild(text); form.appendChild(go); form.appendChild(msg);
    form.onsubmit = function (e) {
      e.preventDefault();
      go.disabled = true;
      msg.textContent = "출석하고 있어요.";
      A.api("/api/checkins", { method: "POST", body: { text: text.value.trim() } }).then(apply, function (err) {
        go.disabled = false;
        msg.textContent = err.message;
      });
    };
  }

  /** 그날 공부 시간, 한 마디, 메모를 적는 칸 */
  function editor(c) {
    var box = node("div", { "class": "ck-edit" });
    var h = node("input", { type: "number", "class": "cell-input ck-num", min: "0", max: "24", step: "1", value: c.minutes != null ? String(Math.floor(c.minutes / 60)) : "", placeholder: "0", "aria-label": "공부한 시간(시간)" });
    var m = node("input", { type: "number", "class": "cell-input ck-num", min: "0", max: "59", step: "5", value: c.minutes != null ? String(c.minutes % 60) : "", placeholder: "0", "aria-label": "공부한 시간(분)" });
    var timeRow = node("div", { "class": "ck-row" });
    timeRow.appendChild(node("span", { "class": "ck-label" }, "공부한 시간"));
    timeRow.appendChild(h); timeRow.appendChild(node("span", null, "시간"));
    timeRow.appendChild(m); timeRow.appendChild(node("span", null, "분"));
    [[30, "+30분"], [60, "+1시간"]].forEach(function (x) {
      var b = node("button", { type: "button", "class": "px-btn is-ghost ck-plus" }, x[1]);
      b.addEventListener("click", function () {
        var total = (Number(h.value) || 0) * 60 + (Number(m.value) || 0) + x[0];
        h.value = String(Math.floor(total / 60)); m.value = String(total % 60);
      });
      timeRow.appendChild(b);
    });
    var text = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", value: c.text || "", placeholder: "한 마디 (선택)", "aria-label": "한 마디" });
    var note = node("textarea", { "class": "cell-input ck-note", maxlength: "500", rows: "2", placeholder: "메모 (선택). 예: 셸 강의 2강까지, 파이프가 재밌었음", "aria-label": "메모" });
    note.value = c.note || "";
    var save = node("button", { type: "button", "class": "px-btn is-primary" }, "저장");
    var msg = node("span", { "class": "mini-msg", role: "status" });
    var actRow = node("div", { "class": "ck-row" });
    actRow.appendChild(save); actRow.appendChild(msg);
    box.appendChild(timeRow); box.appendChild(text); box.appendChild(note); box.appendChild(actRow);
    save.addEventListener("click", function () {
      var hv = h.value.trim(), mv = m.value.trim();
      var minutes = hv === "" && mv === "" ? "" : (Number(hv) || 0) * 60 + (Number(mv) || 0);
      save.disabled = true;
      msg.textContent = "저장하고 있어요.";
      A.api("/api/checkins/edit", { method: "POST", body: { date: c.date, minutes: minutes, text: text.value.trim(), note: note.value.trim() } }).then(apply, function (err) {
        save.disabled = false;
        msg.textContent = err.message;
      });
    });
    return box;
  }

  function apply(r) {
    var byDate = {};
    state.list.forEach(function (c) { byDate[c.date] = c; });
    normalize(r.recent || []).forEach(function (c) { byDate[c.date] = c; });
    state.list = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
    renderNow();
    renderLog();
  }

  /* ── 출석부 ─────────────────────────────────── */
  function renderLog() {
    var box = $("checkin-days");
    if (!box) return;
    box.textContent = "";
    var list = state.list.slice().reverse();
    if (!list.length) box.appendChild(node("p", { "class": "empty" }, "아직 출석 기록이 없어요. 공부하는 날 출석 버튼을 눌러 보세요."));
    var ul = node("ul", { "class": "ck-list" });
    list.forEach(function (c) {
      var li = node("li", { "class": "ck-day" + (c.minutes == null ? " is-blank" : "") });
      li.appendChild(node("span", { "class": "ck-date" }, dayLabel(c.date)));
      li.appendChild(node("span", { "class": "ck-at" }, c.at ? c.at + " 출석" : ""));
      var main = node("span", { "class": "ck-main" });
      if (c.text) main.appendChild(node("span", null, c.text));
      if (c.note) main.appendChild(node("span", { "class": "checkin-note" }, c.note));
      li.appendChild(main);
      li.appendChild(node("span", { "class": "ck-min" }, c.minutes != null ? dur(c.minutes) : "시간 안 적음"));
      if (isOwner) {
        var acts = node("span", { "class": "checkin-acts" });
        var edit = node("button", { type: "button", "class": "link-btn" }, c.minutes == null ? "시간 적기" : "고치기");
        edit.addEventListener("click", function () {
          var open = li.querySelector(".ck-edit");
          if (open) { open.remove(); return; }
          var ed = editor(c);
          li.appendChild(ed);
          ed.querySelector("input").focus();
        });
        acts.appendChild(edit);
        acts.appendChild(deleteButton(c));
        li.appendChild(acts);
      }
      ul.appendChild(li);
    });
    box.appendChild(ul);
    var sum = $("checkin-summary");
    if (sum) {
      var month = today().slice(0, 7);
      var mine = state.list.filter(function (c) { return c.date.slice(0, 7) === month; });
      var mins = mine.reduce(function (a, c) { return a + (c.minutes || 0); }, 0);
      var blank = state.list.filter(function (c) { return c.minutes == null; }).length;
      sum.textContent = "이번 달 " + mine.length + "일 출석, 적은 공부 시간 " + (dur(mins) || "0분") + ". 연속 " + streak() + "일, 전체 " + state.list.length + "일 출석했어요." +
        (blank ? " 시간을 안 적은 날이 " + blank + "일 있어요." : "");
    }
  }

  function deleteButton(c) {
    var b = node("button", { type: "button", "class": "link-btn checkin-del" }, "지우기");
    var armed = null;
    b.addEventListener("click", function () {
      if (!armed) { b.textContent = "한 번 더 누르면 지워져요"; armed = setTimeout(function () { armed = null; b.textContent = "지우기"; }, 4000); return; }
      clearTimeout(armed);
      b.disabled = true;
      A.api("/api/checkins?date=" + encodeURIComponent(c.date), { method: "DELETE" }).then(function (r) {
        state.list = state.list.filter(function (x) { return x.date !== c.date; });
        apply(r);
      }, function (e) { b.disabled = false; b.textContent = e.message; });
    });
    return b;
  }

  /* ── 시작 ───────────────────────────────────── */
  renderNow();
  renderLog();
  if (API) {
    fetch(API + "/api/status").then(function (r) { return r.ok ? r.json() : null; }).then(function (r) {
      // 예전 서버(재배포 전)가 주는 start, end 기록도 하루 하나로 맞춰 보여요
      if (r && r.recent) apply(r);
    }, function () {});
  }
  if (A) A.onChange(function (u) { isOwner = !!(u && u.role === "owner"); renderNow(); renderLog(); });
})();
