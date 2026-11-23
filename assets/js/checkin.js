/* 출석 체크: 홈의 '지금' 카드와 출석부 화면.
   보는 건 누구나(글쓰기 서버의 /api/status), 출석 체크와 상황 종료는 블로그 주인만 해요.
   출석할 때 "얼마나 할지"를 고르고, 그 시간이 지나면 저절로 끝나요. 끝내기를 잊어도 기록이 끝없이 늘지 않게요.
   저절로 끝난 기록은 실제 끝난 시간으로 고칠 수 있고, 출석을 깜빡한 공부는 나중에 시간으로 남겨요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var cfg = C.config || {};
  var A = window.BlogAuth;
  var API = String(cfg.apiBase || "").replace(/\/+$/, "");
  var KINDS = ["공부", "작업", "독서", "회고", "기타"];
  var BOXES = [[30, "30분"], [60, "1시간"], [120, "2시간"], [180, "3시간"]];
  var DEFAULT_BOX = 120;
  var LEGACY_CAP = 180; // 정한 시간이 없는 옛 기록 (서버와 같아요)
  var MIN = 60000;
  var state = { list: (C.checkins || []).slice(), current: null, live: false };
  var isOwner = false;
  var SKIP_KEY = "cs_checkin_fix_skip";

  function $(id) { return document.getElementById(id); }
  function node(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function t(iso) { return new Date(iso).getTime(); }
  function hm(iso) { return String(iso).slice(11, 16); }
  function kst(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 19) + "+09:00"; }
  function todayKst() { return kst(Date.now()).slice(0, 10); }
  function dur(ms) {
    var m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return m + "분";
    return Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "");
  }
  function dayLabel(d) {
    var dt = new Date(d + "T00:00:00+09:00");
    return (dt.getMonth() + 1) + "월 " + dt.getDate() + "일 (" + "일월화수목금토".charAt(dt.getDay()) + ")";
  }
  function limitOf(c) { return c.until ? t(c.until) : t(c.start) + LEGACY_CAP * MIN; }
  /** 서버와 같은 규칙: 정한 시간이 지난 출석은 그 시각에 끝난 걸로 쳐요. */
  function settle(list) {
    var now = Date.now();
    list.forEach(function (c) {
      if (c.end) return;
      var lim = limitOf(c);
      if (now >= lim) { c.end = kst(lim); c.auto = true; }
    });
  }
  function currentOf(list) { var l = list[list.length - 1]; return l && !l.end ? l : null; }
  function skipped() { try { return JSON.parse(localStorage.getItem(SKIP_KEY) || "[]"); } catch (e) { return []; } }
  function skip(id) { try { var s = skipped(); s.push(id); localStorage.setItem(SKIP_KEY, JSON.stringify(s.slice(-30))); } catch (e) { /* 저장 못 해도 괜찮아요 */ } }

  /** 서버에서 받은 최근 기록을 빌드된 전체 기록과 합쳐요 (id 기준, 서버 것이 최신) */
  function merge(recent) {
    var byId = {};
    state.list.forEach(function (c) { byId[c.id] = c; });
    recent.forEach(function (c) { byId[c.id] = c; });
    state.list = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    settle(state.list);
  }

  /* ── '지금' 카드 ─────────────────────────────── */
  var timer = null;
  function renderNow() {
    var body = $("now-body");
    if (!body) return;
    var cur = state.current;
    body.textContent = "";
    clearInterval(timer);
    if (cur) {
      var line = node("p", { "class": "now-line" });
      line.appendChild(node("span", { "class": "now-dot", "aria-hidden": "true" }));
      line.appendChild(node("span", { "class": "kind-pill is-note" }, cur.kind));
      line.appendChild(document.createTextNode(" " + cur.text));
      body.appendChild(line);
      var bar = node("div", { "class": "now-box", role: "img" });
      var fill = node("span");
      bar.appendChild(fill);
      body.appendChild(bar);
      var meta = node("p", { "class": "now-meta" });
      body.appendChild(meta);
      var tick = function () {
        var now = Date.now(), lim = limitOf(cur), total = lim - t(cur.start);
        if (now >= lim) {
          // 정한 시간이 다 됐어요: 저절로 끝난 걸로 다시 그려요
          clearInterval(timer);
          settle(state.list);
          state.current = currentOf(state.list);
          renderNow(); renderLog();
          return;
        }
        var pct = Math.min(100, Math.round((now - t(cur.start)) / total * 100));
        fill.style.width = pct + "%";
        bar.setAttribute("aria-label", "정한 시간의 " + pct + "% 지남");
        bar.classList.toggle("is-ending", lim - now <= 10 * MIN);
        meta.textContent = hm(cur.start) + "부터 " + hm(kst(lim)) + "까지, " + dur(lim - now) + " 남았어요" +
          (lim - now <= 10 * MIN ? ". 더 하려면 연장하세요." : ".");
      };
      tick();
      timer = setInterval(tick, 30000);
    } else {
      body.appendChild(node("p", { "class": "now-line is-idle" }, "지금은 출석 중이 아니에요."));
      var done = state.list.filter(function (c) { return c.end; });
      var last = done[done.length - 1];
      var todayN = state.list.filter(function (c) { return String(c.start).slice(0, 10) === todayKst(); }).length;
      if (last) {
        var msg = "마지막 출석: " + dayLabel(last.start.slice(0, 10)) + " " + hm(last.start) + "~" + hm(last.end) + " (" + dur(t(last.end) - t(last.start)) + (last.auto ? ", 저절로 끝남" : "") + "), " + last.text;
        if (last.note) msg += ' → "' + last.note + '"';
        body.appendChild(node("p", { "class": "now-meta" }, msg));
      }
      body.appendChild(node("p", { "class": "now-meta" }, todayN ? "오늘 " + todayN + "번 출석했어요." : "오늘은 아직 출석 전이에요."));
    }
    renderForm();
  }

  function boxPicker(name, value) {
    var wrap = node("div", { "class": "box-pick", role: "radiogroup", "aria-label": "얼마나 할까요" });
    wrap.appendChild(node("span", { "class": "box-label" }, "얼마나"));
    BOXES.forEach(function (b) {
      var id = name + "-" + b[0];
      var r = node("input", { type: "radio", name: name, id: id, value: String(b[0]) });
      if (b[0] === value) r.checked = true;
      var l = node("label", { "for": id }, b[1]);
      wrap.appendChild(r); wrap.appendChild(l);
    });
    return wrap;
  }

  function renderForm() {
    var form = $("now-form");
    if (!form) return;
    form.textContent = "";
    form.hidden = !isOwner;
    var fix = $("now-fix");
    if (fix) fix.remove();
    if (!isOwner) return;
    var msg = node("span", { "class": "mini-msg", role: "status" });
    if (state.current) {
      var more = node("div", { "class": "now-extend" });
      [[30, "+30분"], [60, "+1시간"]].forEach(function (x) {
        var b = node("button", { type: "button", "class": "px-btn is-ghost" }, x[1]);
        b.addEventListener("click", function () { send("/api/checkins/extend", { minutes: x[0] }, b, msg, x[1] + " 연장했어요."); });
        more.appendChild(b);
      });
      var note = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "마무리 한 마디 (선택). 예: 3장 끝!", "aria-label": "마무리 한 마디" });
      var end = node("button", { type: "submit", "class": "px-btn is-primary" }, "상황 종료");
      form.appendChild(more); form.appendChild(note); form.appendChild(end); form.appendChild(msg);
      form.onsubmit = function (e) {
        e.preventDefault();
        send("/api/checkins/end", { note: note.value.trim() }, end, msg, "상황 종료했어요. 수고했어요!");
      };
    } else {
      var kind = node("select", { "class": "cell-input now-kind", "aria-label": "무엇을 하나요" });
      KINDS.forEach(function (k) { kind.appendChild(node("option", { value: k }, k)); });
      var text = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "지금 무엇을 하나요? 예: OS 3장 읽는 중", "aria-label": "한 마디", required: "" });
      var go = node("button", { type: "submit", "class": "px-btn is-primary" }, "출석 체크");
      form.appendChild(kind); form.appendChild(text);
      form.appendChild(boxPicker("now-box", DEFAULT_BOX));
      form.appendChild(go); form.appendChild(msg);
      form.appendChild(node("p", { "class": "now-hint" }, "고른 시간이 지나면 저절로 끝나요. 더 하고 싶으면 그때 연장하면 돼요."));
      form.appendChild(pastForm());
      form.onsubmit = function (e) {
        e.preventDefault();
        if (!text.value.trim()) { msg.textContent = "한 마디를 적어 주세요."; text.focus(); return; }
        var box = form.querySelector('input[name="now-box"]:checked');
        send("/api/checkins", { kind: kind.value, text: text.value.trim(), minutes: box ? Number(box.value) : DEFAULT_BOX }, go, msg, "출석했어요!");
      };
      fixPrompt(form);
    }
  }

  /** 저절로 끝난 마지막 기록이 있으면, 실제로 끝난 시간을 물어봐요. */
  function fixPrompt(form) {
    var done = state.list.filter(function (c) { return c.end; });
    var last = done[done.length - 1];
    if (!last || !last.auto || skipped().indexOf(last.id) >= 0) return;
    var box = node("div", { "class": "now-fix", id: "now-fix" });
    box.appendChild(node("p", null, dayLabel(last.start.slice(0, 10)) + " " + hm(last.start) + "에 시작한 \"" + last.text + "\"이(가) 정한 시간 " + hm(last.end) + "에 저절로 끝났어요. 실제로 끝난 시간이 다르면 고쳐 주세요."));
    var row = node("div", { "class": "now-fix-row" });
    var time = node("input", { type: "time", "class": "cell-input", value: hm(last.end), "aria-label": "실제로 끝난 시간" });
    var note = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "마무리 한 마디 (선택)", "aria-label": "마무리 한 마디" });
    var save = node("button", { type: "button", "class": "px-btn is-primary" }, "끝난 시간 고치기");
    var keep = node("button", { type: "button", "class": "px-btn is-ghost" }, "이대로 둘게요");
    var msg = node("span", { "class": "mini-msg", role: "status" });
    row.appendChild(time); row.appendChild(note); row.appendChild(save); row.appendChild(keep); row.appendChild(msg);
    box.appendChild(row);
    save.addEventListener("click", function () {
      var body = { id: last.id, end: time.value };
      if (note.value.trim()) body.note = note.value.trim();
      send("/api/checkins/edit", body, save, msg, "끝난 시간을 고쳤어요.");
    });
    keep.addEventListener("click", function () { skip(last.id); box.remove(); });
    form.parentNode.insertBefore(box, form);
  }

  /** 출석을 깜빡한 공부를 시간으로 남기는 칸 */
  function pastForm() {
    var d = node("details", { "class": "now-past" });
    d.appendChild(node("summary", null, "출석을 깜빡했어요"));
    var row = node("div", { "class": "now-fix-row" });
    var date = node("input", { type: "date", "class": "cell-input", value: todayKst(), max: todayKst(), "aria-label": "날짜" });
    var s = node("input", { type: "time", "class": "cell-input", "aria-label": "시작 시간" });
    var e = node("input", { type: "time", "class": "cell-input", "aria-label": "끝난 시간" });
    var kind = node("select", { "class": "cell-input", "aria-label": "무엇을 했나요" });
    KINDS.forEach(function (k) { kind.appendChild(node("option", { value: k }, k)); });
    var text = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "무엇을 했나요? 예: 셸 강의 1~2강", "aria-label": "한 마디" });
    var save = node("button", { type: "button", "class": "px-btn" }, "지난 출석 남기기");
    var msg = node("span", { "class": "mini-msg", role: "status" });
    row.appendChild(date); row.appendChild(s); row.appendChild(node("span", null, "~")); row.appendChild(e);
    row.appendChild(kind); row.appendChild(text); row.appendChild(save); row.appendChild(msg);
    d.appendChild(row);
    save.addEventListener("click", function () {
      if (!s.value || !e.value) { msg.textContent = "시작과 끝 시간을 골라 주세요."; return; }
      if (!text.value.trim()) { msg.textContent = "무엇을 했는지 적어 주세요."; text.focus(); return; }
      send("/api/checkins/past", { date: date.value, start: s.value, end: e.value, kind: kind.value, text: text.value.trim() }, save, msg, "지난 출석을 남겼어요.");
    });
    return d;
  }

  function send(path, body, btn, msg, okText) {
    btn.disabled = true;
    msg.textContent = "저장하고 있어요.";
    A.api(path, { method: "POST", body: body }).then(function (r) {
      apply(r);
      var m = $("now-form") && $("now-form").querySelector(".mini-msg");
      if (m) m.textContent = okText;
    }, function (e) {
      btn.disabled = false;
      msg.textContent = e.message;
    });
  }

  function apply(r) {
    state.live = true;
    merge(r.recent || []);
    if (r.checkin && !(r.recent || []).some(function (c) { return c.id === r.checkin.id; })) merge([r.checkin]);
    state.current = currentOf(state.list);
    renderNow();
    renderLog();
  }

  /* ── 출석부 ─────────────────────────────────── */
  function renderLog() {
    var box = $("checkin-days");
    if (!box) return;
    box.textContent = "";
    var list = state.list.slice().reverse();
    if (!list.length) { box.appendChild(node("p", { "class": "empty" }, "아직 출석 기록이 없어요. 공부를 시작할 때 한 마디로 출석 체크해 보세요.")); }
    var days = {};
    var order = [];
    list.forEach(function (c) {
      var d = String(c.start).slice(0, 10);
      if (!days[d]) { days[d] = []; order.push(d); }
      days[d].push(c);
    });
    var monthKey = todayKst().slice(0, 7);
    var monthDays = order.filter(function (d) { return d.slice(0, 7) === monthKey; }).length;
    var monthMs = 0;
    order.forEach(function (d) {
      var total = 0;
      days[d].forEach(function (c) { if (c.end) total += t(c.end) - t(c.start); });
      if (d.slice(0, 7) === monthKey) monthMs += total;
      var sec = node("section", { "class": "checkin-day" });
      var h = node("h3", null, dayLabel(d));
      if (total) h.appendChild(node("span", { "class": "checkin-total" }, "총 " + dur(total)));
      sec.appendChild(h);
      var ul = node("ul", { "class": "checkin-list" });
      days[d].forEach(function (c) {
        var li = node("li", { "class": c.end ? (c.auto ? "is-auto" : "") : "is-live" });
        li.appendChild(node("span", { "class": "checkin-time" }, hm(c.start) + "~" + (c.end ? hm(c.end) : hm(kst(limitOf(c))) + " 예정")));
        var main = node("span", { "class": "checkin-main" });
        main.appendChild(node("span", { "class": "kind-pill is-note" }, c.kind));
        main.appendChild(document.createTextNode(" " + c.text));
        if (c.auto) main.appendChild(node("span", { "class": "checkin-flag" }, "저절로 끝남"));
        if (c.past) main.appendChild(node("span", { "class": "checkin-flag is-past" }, "나중에 남김"));
        if (c.note) main.appendChild(node("span", { "class": "checkin-note" }, "→ " + c.note));
        li.appendChild(main);
        li.appendChild(node("span", { "class": "checkin-dur" }, c.end ? dur(t(c.end) - t(c.start)) : "진행 중"));
        var acts = node("span", { "class": "checkin-acts" });
        // 저절로 끝났거나 지나치게 길면(끝내기를 잊은 듯) 끝난 시간을 고칠 수 있어요
        var tooLong = c.end && t(c.end) - t(c.start) > 6 * 60 * MIN;
        if (tooLong && !c.auto) main.appendChild(node("span", { "class": "checkin-flag" }, "끝내기를 잊은 듯"));
        if (isOwner && (c.auto || tooLong)) acts.appendChild(editButton(c, li));
        if (isOwner) acts.appendChild(deleteButton(c));
        li.appendChild(acts);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
    var sum = $("checkin-summary");
    if (sum) sum.textContent = "이번 달 " + monthDays + "일 출석, 총 " + dur(monthMs) + ". 전체 " + order.length + "일 출석했어요.";
  }

  /** 끝난 시간 고치기: 그 줄 아래에 시각 칸이 열려요. */
  function editButton(c, li) {
    var b = node("button", { type: "button", "class": "link-btn" }, "끝난 시간 고치기");
    b.addEventListener("click", function () {
      var open = li.querySelector(".checkin-edit");
      if (open) { open.remove(); return; }
      var row = node("div", { "class": "checkin-edit now-fix-row" });
      var time = node("input", { type: "time", "class": "cell-input", value: hm(c.end), "aria-label": "끝난 시간" });
      var save = node("button", { type: "button", "class": "px-btn" }, "고치기");
      var msg = node("span", { "class": "mini-msg", role: "status" });
      row.appendChild(time); row.appendChild(save); row.appendChild(msg);
      li.appendChild(row);
      time.focus();
      save.addEventListener("click", function () {
        save.disabled = true;
        A.api("/api/checkins/edit", { method: "POST", body: { id: c.id, end: time.value } }).then(apply, function (e) { save.disabled = false; msg.textContent = e.message; });
      });
    });
    return b;
  }

  function deleteButton(c) {
    var b = node("button", { type: "button", "class": "link-btn checkin-del" }, "지우기");
    var armed = null;
    b.addEventListener("click", function () {
      if (!armed) { b.textContent = "한 번 더 누르면 지워져요"; armed = setTimeout(function () { armed = null; b.textContent = "지우기"; }, 4000); return; }
      clearTimeout(armed);
      b.disabled = true;
      A.api("/api/checkins?id=" + encodeURIComponent(c.id), { method: "DELETE" }).then(function (r) {
        state.list = state.list.filter(function (x) { return x.id !== c.id; });
        apply(r);
      }, function (e) { b.disabled = false; b.textContent = e.message; });
    });
    return b;
  }

  /* ── 시작 ───────────────────────────────────── */
  settle(state.list);
  state.current = currentOf(state.list);
  renderNow();
  renderLog();
  if (API) {
    fetch(API + "/api/status").then(function (r) { return r.ok ? r.json() : null; }).then(function (r) { if (r) apply(r); }, function () {});
  }
  if (A) A.onChange(function (u) { isOwner = !!(u && u.role === "owner"); renderForm(); renderLog(); });
})();
