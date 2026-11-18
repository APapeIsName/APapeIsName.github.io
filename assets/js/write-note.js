/* 공부 노트 쓰기. 프로젝트는 여기서 바로 만들 수 있고, 새 태그는 발행할 때 목록에 더해져요. */
(function () {
  "use strict";

  var C = window.COURSE || {};
  var cfg = C.config || {};
  var A = window.BlogAuth;
  var POLL_MS = 8000, POLL_MAX = 40, MAX_TAGS = 10;

  function $(id) { return document.getElementById(id); }
  var gate = $("write-gate"), form = $("note-form");
  var f = { series: $("n-series"), title: $("n-title"), summary: $("n-summary"), date: $("n-date"), hours: $("n-hours"), body: $("n-body") };
  var params = new URLSearchParams(location.search);
  var mode = { path: params.get("path") || "", sha: "", url: "" };
  var busy = false, opened = false;
  var seriesList = (C.series || []).slice();
  var knownTags = (C.tags || []).map(function (t) { return t.name; });
  var tags = [];

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
  function button(text, onClick, cls) { var b = node("button", { type: "button", "class": cls || "px-btn" }, text); b.addEventListener("click", onClick); return b; }
  function fill(box, items) { box.textContent = ""; items.forEach(function (n) { if (n) box.appendChild(n); }); }
  function grow(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 4 + "px"; }

  function showGate(text, actions) { $("write-gate-text").textContent = text; fill($("write-gate-actions"), actions || []); gate.hidden = false; }
  var dialog = $("n-dialog");
  function say(text, actions, tone) {
    $("n-dialog-text").textContent = text;
    fill($("n-dialog-actions"), actions || []);
    dialog.hidden = false;
    dialog.classList.toggle("is-error", tone === "error");
    dialog.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function hush() { dialog.hidden = true; }

  /* ── 프로젝트 ─────────────────────────────────── */
  var NEW = "__new__";
  function buildSeriesOptions(selected) {
    var sel = f.series;
    sel.textContent = "";
    sel.appendChild(node("option", { value: "" }, "프로젝트 없음"));
    seriesList.forEach(function (s) { sel.appendChild(node("option", { value: s.id }, s.title)); });
    if (selected && !seriesList.some(function (s) { return s.id === selected; })) {
      sel.appendChild(node("option", { value: selected }, selected + " (목록에 없는 프로젝트)"));
    }
    sel.appendChild(node("option", { value: NEW }, "+ 새 프로젝트 만들기"));
    sel.value = selected || "";
    sel.setAttribute("data-last", sel.value);
  }

  function openNewSeries() {
    $("n-series-new").hidden = false;
    $("ns-msg").textContent = "";
    $("ns-title").focus();
  }
  function closeNewSeries(keep) {
    $("n-series-new").hidden = true;
    ["ns-title", "ns-id", "ns-desc"].forEach(function (id) { $(id).value = ""; });
    if (!keep) f.series.value = f.series.getAttribute("data-last") || "";
  }
  function createSeries() {
    var title = $("ns-title").value.trim();
    var id = $("ns-id").value.trim().toLowerCase();
    if (!title) { $("ns-msg").textContent = "프로젝트 이름을 입력해 주세요."; $("ns-title").focus(); return; }
    if (id && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) { $("ns-msg").textContent = "주소 이름은 영어 소문자, 숫자, -만 쓸 수 있어요."; $("ns-id").focus(); return; }
    var btn = $("ns-create");
    btn.disabled = true;
    $("ns-msg").textContent = "만들고 있어요.";
    A.api("/api/series", { method: "POST", body: { create: true, title: title, id: id, description: $("ns-desc").value.trim() } }).then(function (r) {
      btn.disabled = false;
      seriesList = r.all || seriesList.concat([r.series]);
      buildSeriesOptions(r.series.id);
      closeNewSeries(true);
      scheduleSave();
      notice("'" + r.series.title + "' 프로젝트를 만들었어요. 블로그 목록에는 1~2분 뒤에 보여요.");
    }, function (e) {
      btn.disabled = false;
      $("ns-msg").textContent = e.message;
    });
  }

  /* ── 태그 ───────────────────────────────────── */
  function isKnown(t) { var l = t.toLowerCase(); return knownTags.some(function (k) { return k.toLowerCase() === l; }); }
  function canonical(t) { var l = t.toLowerCase(); return knownTags.filter(function (k) { return k.toLowerCase() === l; })[0] || t; }
  function renderTags() {
    var box = $("n-tags");
    box.textContent = "";
    tags.forEach(function (t, i) {
      var chip = node("span", { "class": "tag-edit" + (isKnown(t) ? "" : " is-new") });
      chip.appendChild(node("span", null, "#" + t));
      if (!isKnown(t)) chip.appendChild(node("span", { "class": "tag-new-mark" }, "새 태그"));
      var x = node("button", { type: "button", "class": "tag-remove", "aria-label": t + " 태그 빼기" }, "×");
      x.addEventListener("click", function () { tags.splice(i, 1); renderTags(); scheduleSave(); $("n-tag-text").focus(); });
      chip.appendChild(x);
      box.appendChild(chip);
    });
    var dl = $("n-tag-list");
    dl.textContent = "";
    knownTags.filter(function (k) { return tags.indexOf(k) === -1; }).forEach(function (k) { dl.appendChild(node("option", { value: k })); });
    $("n-tag-text").disabled = tags.length >= MAX_TAGS;
    $("n-tag-text").placeholder = tags.length >= MAX_TAGS ? "태그는 10개까지예요" : "태그 입력 후 Enter";
  }
  function addTag(raw) {
    var t = String(raw || "").replace(/^#+/, "").replace(/\s+/g, " ").trim();
    var help = $("n-tag-help");
    help.classList.remove("is-error");
    if (!t) return;
    if (/[,#|"<>]/.test(t)) { help.textContent = "태그에는 쉼표, #, |, 따옴표, <, >를 쓸 수 없어요."; help.classList.add("is-error"); return; }
    if (t.length > 30) { help.textContent = "태그는 30자까지예요."; help.classList.add("is-error"); return; }
    t = canonical(t);
    if (tags.some(function (x) { return x.toLowerCase() === t.toLowerCase(); })) return;
    if (tags.length >= MAX_TAGS) return;
    tags.push(t);
    help.textContent = "목록에 없는 태그는 발행할 때 새로 만들어져요. 10개까지 달 수 있어요.";
    renderTags();
    scheduleSave();
  }
  function wireTags() {
    var input = $("n-tag-text");
    input.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중에는 기다려요
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input.value); input.value = ""; }
      else if (e.key === "Backspace" && !input.value && tags.length) { tags.pop(); renderTags(); scheduleSave(); }
    });
    input.addEventListener("change", function () {
      // 자동완성 목록에서 고르면 바로 달아요
      if (isKnown(input.value.trim())) { addTag(input.value); input.value = ""; }
    });
    input.addEventListener("blur", function () { if (input.value.trim()) { addTag(input.value); input.value = ""; } });
    $("n-tag-box").addEventListener("click", function (e) { if (e.target === this || e.target.id === "n-tags") input.focus(); });
  }

  /* ── 입력값 ─────────────────────────────────── */
  function collect() {
    var v = f.series.value === NEW ? (f.series.getAttribute("data-last") || "") : f.series.value;
    var data = { title: f.title.value.trim(), summary: f.summary.value.trim(), date: f.date.value, series: v, tags: tags.slice(), body: f.body.value };
    var h = f.hours.value.trim();
    if (h !== "") data.hours = Number(h);
    return data;
  }
  function apply(d) {
    d = d || {};
    buildSeriesOptions(d.series || "");
    f.title.value = d.title || "";
    f.summary.value = d.summary || "";
    f.date.value = d.date || todayStr();
    f.hours.value = d.hours != null && d.hours !== "" ? d.hours : "";
    f.body.value = d.body || "";
    tags = (d.tags || []).slice(0, MAX_TAGS);
    renderTags();
    form.querySelectorAll("textarea").forEach(grow);
  }

  /* ── 임시 저장 ───────────────────────────────── */
  function draftKey() { return "cs_note_draft:" + (mode.path || "new"); }
  function readDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { return null; } }
  function dropDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }
  var saveTimer = null, dirty = false;
  function scheduleSave() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 600); }
  function saveDraft() {
    if (!dirty || !opened) return;
    var at = Date.now();
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ at: at, data: collect() }));
      $("n-saved").textContent = "이 브라우저에 임시 저장했어요 (" + clock(at) + ")";
    } catch (e) { $("n-saved").textContent = "임시 저장을 못 했어요. 브라우저 저장 공간을 확인해 주세요."; }
    dirty = false;
  }
  function notice(text, actionLabel, onAction) {
    $("n-notice-text").textContent = text;
    var btn = $("n-notice-action");
    btn.textContent = actionLabel || "";
    btn.hidden = !actionLabel;
    btn.onclick = function () { $("n-notice").hidden = true; if (onAction) onAction(); };
    $("n-notice").hidden = false;
  }

  /* ── 미리보기 ────────────────────────────────── */
  var previewing = false;
  function md(text) { return window.marked && window.DOMPurify ? window.DOMPurify.sanitize(window.marked.parse(text, { gfm: true })) : ""; }
  function setPreview(on) {
    previewing = on;
    var btn = $("n-preview-toggle");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "다시 쓰기" : "미리보기";
    form.classList.toggle("is-preview", on);
    form.querySelectorAll(".preview").forEach(function (box) {
      var src = $(box.getAttribute("data-for"));
      if (on) {
        if (src === f.title) box.textContent = src.value.trim() || "(제목 없음)";
        else box.innerHTML = md(src.value) || '<p class="empty">본문이 비어 있어요.</p>';
      }
      box.hidden = !on;
      src.hidden = on;
    });
  }

  /* ── 서버 ───────────────────────────────────── */
  function lock(on) { busy = on; ["n-submit", "n-delete", "n-preview-toggle"].forEach(function (id) { $(id).disabled = on; }); }
  function check(d) {
    if (!d.title) { if (previewing) setPreview(false); f.title.focus(); return "제목을 입력해 주세요."; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { f.date.focus(); return "날짜를 골라 주세요."; }
    if (d.hours != null && (isNaN(d.hours) || d.hours < 0 || d.hours > 200)) { f.hours.focus(); return "공부한 시간은 0에서 200 사이 숫자로 적어 주세요."; }
    return "";
  }
  function failed(e) {
    lock(false);
    if (e.status === 401) return;
    say(e.message || "발행하지 못했어요.", [button("닫기", hush, "px-btn is-ghost")], "error");
  }
  function learnTags(list) {
    list.forEach(function (t) { if (!isKnown(t)) knownTags.push(t); });
    renderTags();
  }
  function setEditMode(path, url) {
    mode.path = path;
    mode.url = url || mode.url;
    history.replaceState(null, "", location.pathname + "?path=" + encodeURIComponent(path));
    $("n-submit").textContent = "고친 내용 저장";
    $("n-delete").hidden = false;
    document.title = "노트 고치기 | " + document.title.split(" | ").slice(-1)[0];
  }
  function refreshSha() {
    return A.api("/api/notes/item?path=" + encodeURIComponent(mode.path)).then(function (r) { mode.sha = r.sha; mode.url = r.url; });
  }

  function submit(ev) {
    if (ev) ev.preventDefault();
    if (busy) return;
    var pending = $("n-tag-text").value.trim();
    if (pending) { addTag(pending); $("n-tag-text").value = ""; }
    saveDraft();
    var d = collect();
    var problem = check(d);
    if (problem) { say(problem, [button("닫기", hush, "px-btn is-ghost")], "error"); return; }
    lock(true);
    if (mode.path) {
      say("고친 내용을 저장하고 있어요.");
      d.sha = mode.sha;
      A.api("/api/notes/item?path=" + encodeURIComponent(mode.path), { method: "PUT", body: d }).then(function (r) {
        dropDraft();
        learnTags(d.tags);
        mode.url = r.url;
        return refreshSha().catch(function () {}).then(function () {
          lock(false);
          $("n-saved").textContent = "저장했어요 (" + clock(Date.now()) + ")";
          say("저장했어요. 블로그에는 1~2분 뒤에 반영돼요.", [link(r.url, "노트 보기"), button("계속 고치기", hush, "px-btn is-ghost")]);
        });
      }, failed);
      return;
    }
    say("노트를 발행하고 있어요.");
    A.api("/api/notes", { method: "POST", body: d }).then(function (r) {
      dropDraft();
      learnTags(d.tags);
      setEditMode(r.path, r.url);
      refreshSha().catch(function () {});
      lock(false);
      $("n-saved").textContent = "발행했어요 (" + clock(Date.now()) + ")";
      waitForPublish(r);
    }, failed);
  }

  function waitForPublish(r) {
    var tries = 0, dots = 0, started = Date.now();
    function tick() {
      tries++;
      A.api("/api/posts/status?path=" + encodeURIComponent(r.path)).then(function (s) {
        if (s.state === "published") {
          say("블로그에 올라갔어요! 오늘 배운 게 하나 쌓였어요.", [link(s.url, "노트 보기"), link(cfg.noteWriteUrl || "/write/note/", "새 노트 쓰기", "px-btn is-ghost")]);
          return;
        }
        next();
      }, next);
    }
    function next() {
      if (tries >= POLL_MAX) {
        say("발행은 됐는데 블로그에 아직 안 보여요. GitHub Pages가 늦을 때가 있으니 몇 분 뒤에 열어 보세요.", [link(r.url, "노트 주소 열기"), button("닫기", hush, "px-btn is-ghost")]);
        return;
      }
      dots = (dots + 1) % 4;
      say("발행했어요! 블로그에 올리는 중이에요" + ".".repeat(dots + 1) + " (" + Math.round((Date.now() - started) / 1000) + "초, 보통 1~2분 걸려요)");
      setTimeout(tick, POLL_MS);
    }
    say("발행했어요! 블로그에 올리는 중이에요. 보통 1~2분 걸려요.");
    setTimeout(tick, POLL_MS);
  }

  var armed = null;
  function remove() {
    if (busy || !mode.path) return;
    var btn = $("n-delete");
    if (!armed) {
      btn.textContent = "한 번 더 누르면 지워져요";
      btn.classList.add("is-armed");
      armed = setTimeout(function () { armed = null; btn.textContent = "노트 지우기"; btn.classList.remove("is-armed"); }, 4000);
      return;
    }
    clearTimeout(armed); armed = null;
    btn.classList.remove("is-armed");
    btn.textContent = "노트 지우기";
    lock(true);
    say("노트를 지우고 있어요.");
    A.api("/api/notes/item?path=" + encodeURIComponent(mode.path) + "&sha=" + encodeURIComponent(mode.sha), { method: "DELETE" }).then(function () {
      dropDraft();
      form.querySelectorAll("input, select, textarea, button").forEach(function (n) { n.disabled = true; });
      busy = true;
      say("지웠어요. 블로그에서는 1~2분 뒤에 사라져요.", [link(cfg.noteWriteUrl || "/write/note/", "새 노트 쓰기"), link(cfg.notesUrl || "/notes/", "공부 노트 목록", "px-btn is-ghost")]);
    }, failed);
  }

  /* ── 화면 열기 ───────────────────────────────── */
  function wire() {
    form.addEventListener("submit", submit);
    form.addEventListener("input", function (e) {
      if (e.target.tagName === "TEXTAREA") grow(e.target);
      if (e.target.closest("#n-series-new") || e.target.id === "n-tag-text") return;
      if (dialog.classList.contains("is-error") && !busy) hush();
      scheduleSave();
    });
    f.series.addEventListener("change", function () {
      if (f.series.value === NEW) { openNewSeries(); return; }
      f.series.setAttribute("data-last", f.series.value);
      closeNewSeries(true);
      scheduleSave();
    });
    $("ns-create").addEventListener("click", createSeries);
    $("ns-cancel").addEventListener("click", function () { closeNewSeries(false); });
    $("n-series-new").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); createSeries(); }
      if (e.key === "Escape") closeNewSeries(false);
    });
    f.title.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    form.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(e); });
    $("n-preview-toggle").addEventListener("click", function () { setPreview(!previewing); });
    $("n-delete").addEventListener("click", remove);
    window.addEventListener("pagehide", saveDraft);
    wireTags();
  }

  function restoreDraftOr(fallback) {
    var d = readDraft();
    if (d && d.data) {
      apply(d.data);
      notice("이 브라우저에 임시 저장한 글을 불러왔어요 (" + clock(d.at) + ").", mode.path ? "서버에 있는 내용으로 되돌리기" : "비우고 새로 쓰기", function () {
        dropDraft(); fallback(); $("n-saved").textContent = "";
      });
    } else fallback();
  }

  function refreshTaxonomy() {
    // 블로그 빌드 전에 만든 프로젝트와 태그도 보이게, 서버에서 최신 목록을 받아 와요.
    return A.api("/api/taxonomy").then(function (t) {
      var cur = f.series.value === NEW ? f.series.getAttribute("data-last") : f.series.value;
      seriesList = t.series || seriesList;
      (t.tags || []).forEach(function (x) { if (!isKnown(x.name)) knownTags.push(x.name); });
      buildSeriesOptions(cur);
      renderTags();
    }, function () {});
  }

  function open() {
    if (opened) return;
    opened = true;
    wire();
    if (!mode.path) {
      gate.hidden = true;
      form.hidden = false;
      restoreDraftOr(function () { apply({ series: params.get("series") || "", date: todayStr() }); });
      refreshTaxonomy();
      f.title.focus();
      return;
    }
    showGate("노트를 불러오고 있어요.");
    A.api("/api/notes/item?path=" + encodeURIComponent(mode.path)).then(function (r) {
      mode.sha = r.sha;
      setEditMode(r.path, r.url);
      gate.hidden = true;
      form.hidden = false;
      restoreDraftOr(function () { apply(r.fields); });
      refreshTaxonomy();
    }, function (e) {
      showGate(e.message || "노트를 불러오지 못했어요.", [link(cfg.noteWriteUrl || "/write/note/", "새 노트 쓰기")]);
    });
  }

  if (!A || !A.enabled) {
    showGate("글쓰기 서버가 아직 연결되지 않았어요. _config.yml의 api_base에 Worker 주소를 넣으면 여기서 바로 쓸 수 있어요.");
    return;
  }
  A.onChange(function (user) {
    if (user && user.role === "owner") { if (opened) hush(); open(); return; }
    if (opened) {
      saveDraft();
      lock(false);
      say("로그인이 끝났어요. 다시 로그인하면 쓰던 글은 그대로 남아 있어요.", [link(A.loginUrl(), "다시 로그인")], "error");
      return;
    }
    if (!user) showGate("글을 쓰려면 먼저 GitHub으로 로그인해 주세요.", [link(A.loginUrl(), "GitHub으로 로그인")]);
    else showGate(user.login + "님, 반가워요! 글은 블로그 주인만 쓸 수 있어요. 대신 공부 노트는 마음껏 구경하세요.", [link(cfg.notesUrl || "/notes/", "공부 노트 보기")]);
  });
})();
