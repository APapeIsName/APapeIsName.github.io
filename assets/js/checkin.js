/* 출석 체크: 홈의 '지금' 카드와 출석부 화면.
   보는 건 누구나(글쓰기 서버의 /api/status), 출석 체크와 상황 종료는 블로그 주인만 해요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var cfg = C.config || {};
  var A = window.BlogAuth;
  var API = String(cfg.apiBase || "").replace(/\/+$/, "");
  var KINDS = ["공부", "작업", "독서", "회고", "기타"];
  var state = { list: (C.checkins || []).slice(), current: null, live: false };
  var isOwner = false;

  function $(id) { return document.getElementById(id); }
  function node(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function t(iso) { return new Date(iso).getTime(); }
  function hm(iso) { return String(iso).slice(11, 16); }
  function dur(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return m + "분";
    return Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "");
  }
  function dayLabel(d) {
    var dt = new Date(d + "T00:00:00+09:00");
    return (dt.getMonth() + 1) + "월 " + dt.getDate() + "일 (" + "일월화수목금토".charAt(dt.getDay()) + ")";
  }
  function currentOf(list) { var l = list[list.length - 1]; return l && !l.end ? l : null; }

  /** 서버에서 받은 최근 기록을 빌드된 전체 기록과 합쳐요 (id 기준, 서버 것이 최신) */
  function merge(recent) {
    var byId = {};
    state.list.forEach(function (c) { byId[c.id] = c; });
    recent.forEach(function (c) { byId[c.id] = c; });
    state.list = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
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
      var meta = node("p", { "class": "now-meta" });
      body.appendChild(meta);
      var tick = function () { meta.textContent = hm(cur.start) + "부터, " + dur(Date.now() - t(cur.start)) + "째"; };
      tick();
      timer = setInterval(tick, 30000);
    } else {
      body.appendChild(node("p", { "class": "now-line is-idle" }, "지금은 출석 중이 아니에요."));
      var done = state.list.filter(function (c) { return c.end; });
      var last = done[done.length - 1];
      var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      var todayN = state.list.filter(function (c) { return String(c.start).slice(0, 10) === today; }).length;
      if (last) {
        var msg = "마지막 출석: " + dayLabel(last.start.slice(0, 10)) + " " + hm(last.start) + "~" + hm(last.end) + " (" + dur(t(last.end) - t(last.start)) + "), " + last.text;
        if (last.note) msg += ' → "' + last.note + '"';
        body.appendChild(node("p", { "class": "now-meta" }, msg));
      }
      body.appendChild(node("p", { "class": "now-meta" }, todayN ? "오늘 " + todayN + "번 출석했어요." : "오늘은 아직 출석 전이에요."));
    }
    renderForm();
  }

  function renderForm() {
    var form = $("now-form");
    if (!form) return;
    form.textContent = "";
    form.hidden = !isOwner;
    if (!isOwner) return;
    var msg = node("span", { "class": "mini-msg", role: "status" });
    if (state.current) {
      var note = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "마무리 한 마디 (선택). 예: 3장 끝!", "aria-label": "마무리 한 마디" });
      var end = node("button", { type: "submit", "class": "px-btn is-primary" }, "상황 종료");
      form.appendChild(note); form.appendChild(end); form.appendChild(msg);
      form.onsubmit = function (e) {
        e.preventDefault();
        send("/api/checkins/end", { note: note.value.trim() }, end, msg, "상황 종료했어요. 수고했어요!");
      };
    } else {
      var kind = node("select", { "class": "cell-input now-kind", "aria-label": "무엇을 하나요" });
      KINDS.forEach(function (k) { kind.appendChild(node("option", { value: k }, k)); });
      var text = node("input", { type: "text", "class": "cell-input now-input", maxlength: "140", placeholder: "지금 무엇을 하나요? 예: OS 3장 읽는 중", "aria-label": "한 마디", required: "" });
      var go = node("button", { type: "submit", "class": "px-btn is-primary" }, "출석 체크");
      form.appendChild(kind); form.appendChild(text); form.appendChild(go); form.appendChild(msg);
      form.onsubmit = function (e) {
        e.preventDefault();
        if (!text.value.trim()) { msg.textContent = "한 마디를 적어 주세요."; text.focus(); return; }
        send("/api/checkins", { kind: kind.value, text: text.value.trim() }, go, msg, "출석했어요!");
      };
    }
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
    state.current = r.current || null;
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
    var monthKey = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
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
        var li = node("li", { "class": c.end ? "" : "is-live" });
        li.appendChild(node("span", { "class": "checkin-time" }, hm(c.start) + "~" + (c.end ? hm(c.end) : "진행 중")));
        var main = node("span", { "class": "checkin-main" });
        main.appendChild(node("span", { "class": "kind-pill is-note" }, c.kind));
        main.appendChild(document.createTextNode(" " + c.text));
        if (c.note) main.appendChild(node("span", { "class": "checkin-note" }, "→ " + c.note));
        li.appendChild(main);
        li.appendChild(node("span", { "class": "checkin-dur" }, c.end ? dur(t(c.end) - t(c.start)) : ""));
        if (isOwner) li.appendChild(deleteButton(c));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
    var sum = $("checkin-summary");
    if (sum) sum.textContent = "이번 달 " + monthDays + "일 출석, 총 " + dur(monthMs) + ". 전체 " + order.length + "일 출석했어요.";
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
  state.current = currentOf(state.list);
  renderNow();
  renderLog();
  if (API) {
    fetch(API + "/api/status").then(function (r) { return r.ok ? r.json() : null; }).then(function (r) { if (r) apply(r); }, function () {});
  }
  if (A) A.onChange(function (u) { isOwner = !!(u && u.role === "owner"); renderForm(); renderLog(); });
})();
