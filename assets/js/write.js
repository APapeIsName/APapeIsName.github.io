/* 블로그 안에서 리포트를 쓰고 제출하는 화면이에요.
   제출하면 글쓰기 서버(worker/)가 _posts에 파일을 만들고, GitHub Pages가 1~2분 뒤 블로그에 올려요. */
(function () {
  "use strict";

  var C = window.COURSE || {};
  var cfg = C.config || {};
  var A = window.BlogAuth;
  var computed = C.computed || { quests: [], currentWeek: 1, overdue: [], weekLabel: function () { return ""; } };
  // 리포트 칸은 _data/report_template.yml에서 만들어져요. 화면에 그려진 칸을 그대로 읽어요.
  var SECTIONS = Array.prototype.map.call(document.querySelectorAll("textarea[data-section]"), function (t) {
    return { key: t.getAttribute("data-section"), title: t.getAttribute("data-title"), placeholder: t.getAttribute("data-placeholder") || "", required: t.hasAttribute("data-required"), el: t };
  });
  var FIELDS = SECTIONS.map(function (x) { return x.key; });
  var overrides = ((C.reportTemplate || {}).quest_placeholders) || {};
  var POLL_MS = 8000, POLL_MAX = 40;

  function $(id) { return document.getElementById(id); }
  var gate = $("write-gate"), gateText = $("write-gate-text"), gateActions = $("write-gate-actions");
  var form = $("write-form");
  var f = {
    kind: $("w-kind"), title: $("w-title"), quest: $("w-quest"), date: $("w-date"), hours: $("w-hours"),
    complete: $("w-complete"), recalled: $("w-recalled")
  };
  FIELDS.forEach(function (k) { f[k] = $("w-" + k); });

  var params = new URLSearchParams(location.search);
  var mode = { path: params.get("path") || "", sha: "", url: "" };
  var busy = false, opened = false;

  /* ── 작은 도구들 ─────────────────────────────── */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function clock(t) { var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function node(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function link(href, text, cls) { return node("a", { href: href, "class": cls || "px-btn" }, text); }
  function button(text, onClick, cls) {
    var b = node("button", { type: "button", "class": cls || "px-btn" }, text);
    b.addEventListener("click", onClick);
    return b;
  }
  function fill(box, items) { box.textContent = ""; items.forEach(function (n) { if (n) box.appendChild(n); }); }

  function showGate(text, actions) {
    gateText.textContent = text;
    fill(gateActions, actions || []);
    gate.hidden = false;
  }

  var dialog = $("w-dialog"), dialogText = $("w-dialog-text"), dialogActions = $("w-dialog-actions");
  function say(text, actions, tone) {
    dialogText.textContent = text;
    fill(dialogActions, actions || []);
    dialog.hidden = false;
    dialog.classList.toggle("is-error", tone === "error");
    dialog.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function hush() { dialog.hidden = true; }

  /* ── 과제 고르기 ─────────────────────────────── */
  var seasonsById = {};
  (C.seasons || []).forEach(function (s) { seasonsById[s.id] = s; });
  var questsById = {};
  computed.quests.forEach(function (q) { questsById[q.id] = q; });

  function optionFor(q) {
    var label = "[" + String(q.season).split(" ")[0] + "] " + q.quest;
    if (q.done) label += " (완료)";
    else if (!q.optional) label += " (" + computed.weekLabel(q) + ")";
    return node("option", { value: q.id }, label);
  }

  function buildQuestOptions() {
    var sel = f.quest;
    sel.textContent = "";
    sel.appendChild(node("option", { value: "" }, "과제를 고르세요"));
    var started = computed.currentWeek >= 1;
    var w = Math.max(1, computed.currentWeek);
    var used = {};
    function group(label, list) {
      if (!list.length) return;
      var g = node("optgroup", { label: label });
      list.forEach(function (q) { used[q.id] = true; g.appendChild(optionFor(q)); });
      sel.appendChild(g);
    }
    var late = computed.overdue.slice();
    var now = computed.quests.filter(function (q) { return !q.optional && q.weekStart <= w && q.weekEnd >= w && late.indexOf(q) === -1; });
    group("밀린 과제", late);
    group((started ? "이번 주" : "개강 첫 주") + " (" + w + "주차)", now);
    (C.seasons || []).forEach(function (s) {
      group(s.code + " " + s.title, computed.quests.filter(function (q) { return q.season === s.id && !used[q.id]; }));
    });
  }

  function defaultQuest() {
    var want = params.get("quest");
    if (want && questsById[want]) return want;
    var w = Math.max(1, computed.currentWeek);
    var pick = computed.overdue[0] ||
      computed.quests.filter(function (q) { return !q.optional && !q.done && q.weekStart <= w && q.weekEnd >= w; })[0] ||
      computed.quests.filter(function (q) { return !q.optional && !q.done; })[0];
    return pick ? pick.id : "";
  }

  function ensureQuestOption(id) {
    if (!id || questsById[id]) return;
    // 계획서에서 빠진 과제로 쓴 리포트도 고칠 수 있게 남겨 둬요.
    f.quest.appendChild(node("option", { value: id }, id + " (계획서에 없는 과제)"));
  }

  function syncQuestInfo() {
    var q = questsById[f.quest.value];
    var s = q ? seasonsById[q.season] : null;
    $("w-subject").textContent = s ? s.code + " " + s.title : "과제를 고르면 채워져요";
    $("w-recall").textContent = q && q.recall ? q.recall : "";
    $("w-recall-row").hidden = !(q && q.recall);
    f.hours.placeholder = q && q.hours ? "예상 " + q.hours : "";
    var badge = $("w-badge");
    badge.setAttribute("data-badge", s ? s.code : "S0");
    if (C.drawBadges) C.drawBadges();
    // 칸마다 과제에 맞는 안내 문구를 넣어요: 과제별 문구 → 양식 문구(인출 방법, 자료로 채움)
    var raw = (C.quests || []).filter(function (x) { return x.id === f.quest.value; })[0] || {};
    var own = overrides[f.quest.value] || {};
    SECTIONS.forEach(function (x) {
      var text = own[x.key] || x.placeholder;
      text = text.replace(/\{recall\}/g, raw.recall || "계획서의 인출 방법").replace(/\{resource\}/g, raw.resource || "자료");
      x.el.placeholder = text;
    });
    syncMissing();
  }

  /** 비었거나 옛 안내 문구((괄호)로 감싼 글)만 있으면 빈 칸으로 쳐요. */
  function filled(text) {
    var v = String(text || "").trim();
    return !!v && !(v.charAt(0) === "(" && v.charAt(v.length - 1) === ")");
  }
  function missingSections() { return SECTIONS.filter(function (x) { return x.required && !filled(x.el.value); }); }
  function syncMissing() {
    var miss = missingSections();
    var box = $("w-missing");
    SECTIONS.forEach(function (x) { x.el.closest("section").classList.toggle("is-missing", x.required && !filled(x.el.value)); });
    if (f.complete.checked && miss.length) {
      box.textContent = "과제 클리어로 인정받으려면 " + miss.map(function (x) { return x.title; }).join(", ") + " 칸을 채워야 해요.";
      box.hidden = false;
    } else if (f.recalled.checked && f.recall_note && !filled(f.recall_note.value)) {
      box.textContent = "인출 OK를 찍으려면 백지 인출 결과 칸을 채워야 해요.";
      box.hidden = false;
    } else box.hidden = true;
  }

  /* ── 입력값 읽고 쓰기 ────────────────────────── */
  function collect() {
    var data = {
      title: f.title.value.trim(),
      date: f.date.value,
      quest: f.quest.value,
      kind: f.kind.value,
      complete: f.complete.checked,
      recalled: f.recalled.checked
    };
    var h = f.hours.value.trim();
    if (h !== "") data.hours = Number(h);
    FIELDS.forEach(function (k) { data[k] = f[k].value; });
    return data;
  }

  function apply(data) {
    data = data || {};
    if (data.quest) ensureQuestOption(data.quest);
    f.title.value = data.title || "";
    f.date.value = data.date || todayStr();
    f.quest.value = data.quest || "";
    f.kind.value = data.kind || "과제 리포트";
    f.hours.value = data.hours != null && data.hours !== "" ? data.hours : "";
    f.complete.checked = !!data.complete;
    f.recalled.checked = !!data.recalled;
    FIELDS.forEach(function (k) { f[k].value = data[k] || ""; });
    syncQuestInfo();
    form.querySelectorAll("textarea").forEach(grow);
  }

  function grow(t) {
    t.style.height = "auto";
    t.style.height = t.scrollHeight + 4 + "px";
  }

  /* ── 임시 저장 ───────────────────────────────── */
  function draftKey() { return "cs_draft:" + (mode.path || "new"); }
  function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { return null; } }
  function dropDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
  var saveTimer = null, dirty = false;
  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 600);
  }
  function saveDraft() {
    if (!dirty) return;
    var at = Date.now();
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ at: at, data: collect() }));
      $("w-saved").textContent = "이 브라우저에 임시 저장했어요 (" + clock(at) + ")";
    } catch (e) {
      $("w-saved").textContent = "임시 저장을 못 했어요. 브라우저 저장 공간을 확인해 주세요.";
    }
    dirty = false;
  }

  function notice(text, actionLabel, onAction) {
    var box = $("w-notice");
    $("w-notice-text").textContent = text;
    var btn = $("w-notice-action");
    btn.textContent = actionLabel || "";
    btn.hidden = !actionLabel;
    btn.onclick = function () { box.hidden = true; if (onAction) onAction(); };
    box.hidden = false;
  }

  /* ── 미리보기 ────────────────────────────────── */
  var previewing = false;
  function md(text) {
    if (!window.marked || !window.DOMPurify) return "";
    return window.DOMPurify.sanitize(window.marked.parse(text, { gfm: true, breaks: false }));
  }
  function setPreview(on) {
    previewing = on;
    var btn = $("w-preview-toggle");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "다시 쓰기" : "미리보기";
    form.classList.toggle("is-preview", on);
    form.querySelectorAll(".preview").forEach(function (box) {
      var src = $(box.getAttribute("data-for"));
      if (on) {
        if (src.id === "w-title") box.textContent = src.value.trim() || "(제목 없음)";
        else box.innerHTML = md(src.value);
        var empty = src.id !== "w-title" && !src.value.trim();
        box.closest("section") && box.closest("section").classList.toggle("is-empty", empty);
      }
      box.hidden = !on;
      src.hidden = on;
    });
    if (!on) form.querySelectorAll("section.is-empty").forEach(function (s) { s.classList.remove("is-empty"); });
  }

  /* ── 서버와 주고받기 ─────────────────────────── */
  function lock(on) {
    busy = on;
    ["w-submit", "w-delete", "w-preview-toggle"].forEach(function (id) { $(id).disabled = on; });
  }

  function check(data) {
    if (!data.quest) { f.quest.focus(); return "어떤 과제의 리포트인지 골라 주세요."; }
    if (!data.title) { if (previewing) setPreview(false); f.title.focus(); return "제목을 입력해 주세요."; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { f.date.focus(); return "제출일을 골라 주세요."; }
    if (data.hours != null && (isNaN(data.hours) || data.hours < 0 || data.hours > 200)) { f.hours.focus(); return "쓴 시간은 0에서 200 사이 숫자로 적어 주세요."; }
    var miss = missingSections();
    if (data.complete && miss.length) {
      if (previewing) setPreview(false);
      miss[0].el.focus();
      return "과제 클리어를 찍으려면 " + miss.map(function (x) { return x.title; }).join(", ") + " 칸을 채워 주세요. 아직 덜 했다면 도장을 빼고 제출하면 '진행 중' 리포트로 올라가요.";
    }
    if (data.recalled && f.recall_note && !filled(f.recall_note.value)) {
      if (previewing) setPreview(false);
      f.recall_note.focus();
      return "인출 OK를 찍으려면 백지 인출 결과 칸을 채워 주세요.";
    }
    return "";
  }

  function failed(e) {
    lock(false);
    if (e.status === 401) return; // 로그인 만료는 onChange에서 안내해요
    say(e.message || "제출하지 못했어요.", [button("닫기", hush, "px-btn is-ghost")], "error");
  }

  function setEditMode(path, url) {
    mode.path = path;
    mode.url = url || mode.url;
    history.replaceState(null, "", location.pathname + "?path=" + encodeURIComponent(path));
    $("w-submit").textContent = "고친 내용 저장";
    $("w-delete").hidden = false;
    document.title = "리포트 고치기 | " + document.title.split(" | ").slice(-1)[0];
  }

  function refreshSha() {
    return A.api("/api/posts/item?path=" + encodeURIComponent(mode.path)).then(function (r) { mode.sha = r.sha; mode.url = r.url; });
  }

  function submit(ev) {
    if (ev) ev.preventDefault();
    if (busy) return;
    saveDraft();
    var data = collect();
    var problem = check(data);
    if (problem) { say(problem, [button("닫기", hush, "px-btn is-ghost")], "error"); return; }
    lock(true);
    if (mode.path) {
      say("고친 내용을 저장하고 있어요.");
      data.sha = mode.sha;
      A.api("/api/posts/item?path=" + encodeURIComponent(mode.path), { method: "PUT", body: data })
        .then(function (r) {
          dropDraft();
          mode.url = r.url;
          return refreshSha().catch(function () {}).then(function () {
            lock(false);
            $("w-saved").textContent = "저장했어요 (" + clock(Date.now()) + ")";
            say("저장했어요. 블로그에는 1~2분 뒤에 반영돼요.", [link(r.url, "리포트 보기"), button("계속 고치기", hush, "px-btn is-ghost")]);
          });
        }, failed);
      return;
    }
    say("리포트를 제출하고 있어요.");
    A.api("/api/posts", { method: "POST", body: data }).then(function (r) {
      dropDraft();
      setEditMode(r.path, r.url);
      refreshSha().catch(function () {});
      lock(false);
      $("w-saved").textContent = "제출했어요 (" + clock(Date.now()) + ")";
      waitForPublish(r);
    }, failed);
  }

  function waitForPublish(r) {
    var tries = 0, dots = 0;
    var started = Date.now();
    function tick() {
      tries++;
      A.api("/api/posts/status?path=" + encodeURIComponent(r.path)).then(function (s) {
        if (s.state === "published") {
          say("블로그에 올라갔어요! 오늘도 한 칸 전진했어요.", [link(s.url, "리포트 보기"), link(cfg.writeUrl || "/write/", "새 리포트 쓰기", "px-btn is-ghost")]);
          return;
        }
        next();
      }, next);
    }
    function next() {
      if (tries >= POLL_MAX) {
        say("제출은 됐는데 블로그에 아직 안 보여요. GitHub Pages가 늦을 때가 있으니 몇 분 뒤에 열어 보세요.", [link(r.url, "리포트 주소 열기"), button("닫기", hush, "px-btn is-ghost")]);
        return;
      }
      dots = (dots + 1) % 4;
      var sec = Math.round((Date.now() - started) / 1000);
      say("제출했어요! 블로그에 올리는 중이에요" + ".".repeat(dots + 1) + " (" + sec + "초, 보통 1~2분 걸려요)");
      setTimeout(tick, POLL_MS);
    }
    say("제출했어요! 블로그에 올리는 중이에요. 보통 1~2분 걸려요.");
    setTimeout(tick, POLL_MS);
  }

  var armed = null;
  function remove() {
    if (busy || !mode.path) return;
    var btn = $("w-delete");
    if (!armed) {
      btn.textContent = "한 번 더 누르면 지워져요";
      btn.classList.add("is-armed");
      armed = setTimeout(function () { armed = null; btn.textContent = "리포트 지우기"; btn.classList.remove("is-armed"); }, 4000);
      return;
    }
    clearTimeout(armed); armed = null;
    btn.classList.remove("is-armed");
    btn.textContent = "리포트 지우기";
    lock(true);
    say("리포트를 지우고 있어요.");
    A.api("/api/posts/item?path=" + encodeURIComponent(mode.path) + "&sha=" + encodeURIComponent(mode.sha), { method: "DELETE" })
      .then(function () {
        dropDraft();
        form.querySelectorAll("input, select, textarea, .write-bar button").forEach(function (n) { n.disabled = true; });
        busy = true;
        say("지웠어요. 블로그에서는 1~2분 뒤에 사라져요.", [link(cfg.writeUrl || "/write/", "새 리포트 쓰기"), link(cfg.reportsUrl || "/reports/", "리포트 목록", "px-btn is-ghost")]);
      }, failed);
  }

  /* ── 화면 열기 ───────────────────────────────── */
  function wire() {
    form.addEventListener("submit", submit);
    form.addEventListener("input", function (e) {
      if (e.target.tagName === "TEXTAREA") grow(e.target);
      if (dialog.classList.contains("is-error") && !busy) hush();
      syncMissing();
      scheduleSave();
    });
    form.addEventListener("change", function (e) {
      if (e.target === f.quest) syncQuestInfo();
      syncMissing();
      scheduleSave();
    });
    f.title.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    form.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(e);
    });
    $("w-preview-toggle").addEventListener("click", function () { setPreview(!previewing); });
    $("w-delete").addEventListener("click", remove);
    window.addEventListener("pagehide", saveDraft);
  }

  function restoreDraftOr(fallback) {
    var d = readDraft();
    if (d && d.data) {
      apply(d.data);
      notice("이 브라우저에 임시 저장한 글을 불러왔어요 (" + clock(d.at) + ").", mode.path ? "서버에 있는 내용으로 되돌리기" : "비우고 새로 쓰기", function () {
        dropDraft();
        fallback();
        $("w-saved").textContent = "";
      });
    } else {
      fallback();
    }
  }

  function open() {
    if (opened) return;
    opened = true;
    buildQuestOptions();
    wire();
    if (!mode.path) {
      gate.hidden = true;
      form.hidden = false;
      restoreDraftOr(function () { apply({ quest: defaultQuest(), date: todayStr() }); });
      f.title.focus();
      return;
    }
    showGate("리포트를 불러오고 있어요.");
    A.api("/api/posts/item?path=" + encodeURIComponent(mode.path)).then(function (r) {
      mode.sha = r.sha;
      setEditMode(r.path, r.url);
      gate.hidden = true;
      form.hidden = false;
      restoreDraftOr(function () { apply(r.fields); });
    }, function (e) {
      showGate(e.message || "리포트를 불러오지 못했어요.", [link(cfg.writeUrl || "/write/", "새 리포트 쓰기")]);
    });
  }

  if (!A || !A.enabled) {
    showGate("글쓰기 서버가 아직 연결되지 않았어요. _config.yml의 api_base에 Worker 주소를 넣으면 여기서 바로 쓸 수 있어요.");
    return;
  }

  A.onChange(function (user) {
    if (user && user.role === "owner") {
      if (opened) hush();
      open();
      return;
    }
    if (opened) {
      // 쓰는 도중 로그인이 끝났어요. 글은 임시 저장돼 있어요.
      saveDraft();
      lock(false);
      say("로그인이 끝났어요. 다시 로그인하면 쓰던 글은 그대로 남아 있어요.", [link(A.loginUrl(), "다시 로그인")], "error");
      return;
    }
    if (!user) showGate("리포트를 쓰려면 먼저 GitHub으로 로그인해 주세요.", [link(A.loginUrl(), "GitHub으로 로그인")]);
    else showGate(user.login + "님, 반가워요! 리포트는 블로그 주인만 쓸 수 있어요. 대신 계획서와 리포트는 마음껏 구경하세요.", [link((cfg.syllabusUrl || "/syllabus/"), "계획서 보기")]);
  });
})();
