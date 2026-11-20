/* 프로젝트 목록(/projects/)과 프로젝트 화면(/project/?id=)이에요.
   프로젝트는 시리즈와 같아요: 노트의 series 값이 프로젝트 id면 그 프로젝트의 글이에요.
   누구나 볼 수 있고, 블로그 주인은 할 일 체크, 가치관과 목표 고치기, 메인 바꾸기를 여기서 해요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var A = window.BlogAuth;
  var cfg = C.config || {};
  var data = { series: (C.series || []).slice(), main: C.mainProject || "cs" };
  var LAG = "블로그 목록과 홈에는 1~2분 뒤에 반영돼요.";
  var STATUS = ["진행 중", "잠시 쉼", "끝남"];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function statusClass(s) { return s === "잠시 쉼" ? "pause" : s === "끝남" ? "done" : "go"; }
  function md(d) { var p = String(d || "").split("-"); return p.length === 3 ? (+p[1]) + "월 " + (+p[2]) + "일" : ""; }
  function isOwner(u) { return !!(u && u.role === "owner"); }

  /* ── 메인으로 정하기 (목록과 프로젝트 화면 둘 다) ───────────── */
  function syncMainButtons() {
    document.querySelectorAll("[data-make-main]").forEach(function (b) {
      b.hidden = b.getAttribute("data-make-main") === data.main;
    });
    document.querySelectorAll(".project-card[data-project]").forEach(function (card) {
      card.classList.toggle("is-main", card.getAttribute("data-project") === data.main);
    });
  }
  function makeMain(id, msgEl, done) {
    if (msgEl) msgEl.textContent = "메인 프로젝트를 바꾸고 있어요.";
    return A.api("/api/main", { method: "POST", body: { id: id } }).then(function (r) {
      data.main = r.main;
      syncMainButtons();
      if (msgEl) msgEl.textContent = "메인 프로젝트를 바꿨어요. " + LAG + " GitHub 프로필 진도 카드도 함께 바뀌어요.";
      if (done) done();
    }, function (err) { if (msgEl) msgEl.textContent = err.message; });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-make-main]");
    if (!b || !A) return;
    b.disabled = true;
    makeMain(b.getAttribute("data-make-main"), $("main-msg") || $("pv-msg"), render).then(function () { b.disabled = false; });
  });
  syncMainButtons();

  /* ── 프로젝트 화면 ─────────────────────────────── */
  var view = $("project-view");
  var id = new URLSearchParams(location.search).get("id") || "";
  var owner = false;
  var editing = false;
  var saving = Promise.resolve();
  var pending = 0;

  function project() {
    for (var i = 0; i < data.series.length; i++) if (data.series[i].id === id) return data.series[i];
    return null;
  }
  function notesOf(pid) {
    return (C.notes || []).filter(function (n) { return n.series === pid; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function render() {
    if (!view) return;
    var p = project();
    if (!p) {
      view.innerHTML = '<header class="page-head"><h1>프로젝트를 찾지 못했어요</h1>' +
        "<p>주소가 바뀌었거나 지워진 프로젝트일 수 있어요. 방금 만든 프로젝트라면 1~2분 뒤에 다시 열어 보세요.</p>" +
        '<p><a class="px-btn" href="' + esc(cfg.projectsUrl) + '">프로젝트 목록으로</a></p></header>';
      return;
    }
    document.title = p.title + " | " + document.title.split(" | ").slice(-1)[0];
    var status = p.status || "진행 중";
    var todos = p.todos || [];
    var done = todos.filter(function (t) { return t.done; }).length;
    var pct = todos.length ? Math.round(done / todos.length * 100) : 0;
    var notes = notesOf(p.id);
    var isMain = data.main === p.id;
    var h = [];

    h.push('<header class="page-head project-head">');
    h.push('<p class="project-crumb"><a href="' + esc(cfg.projectsUrl) + '">프로젝트</a></p>');
    h.push("<h1>" + esc(p.title) + (isMain ? ' <span class="main-badge">메인</span>' : "") + "</h1>");
    if (p.description) h.push("<p>" + esc(p.description) + "</p>");
    h.push('<p class="project-head-meta"><span class="status-pill is-' + statusClass(status) + '">' + esc(status) + "</span>");
    h.push("<span>노트 " + notes.length + "편</span>");
    if (p.link) h.push('<a href="' + esc(p.link) + '" rel="noopener">참고 자료 열기</a>');
    h.push("</p>");
    if (owner) {
      h.push('<p class="project-tools">');
      h.push('<button type="button" class="px-btn" id="pv-edit">' + (editing ? "고치기 닫기" : "고치기") + "</button>");
      if (!isMain) h.push('<button type="button" class="px-btn is-ghost" data-make-main="' + esc(p.id) + '">메인으로 정하기</button>');
      h.push('<a class="px-btn is-ghost" href="' + esc(cfg.noteWriteUrl) + "?series=" + encodeURIComponent(p.id) + '">이 프로젝트에 노트 쓰기</a>');
      h.push('<button type="button" class="px-btn is-ghost pv-delete" id="pv-delete">프로젝트 지우기</button>');
      h.push("</p>");
    }
    h.push('<p class="mini-msg" id="pv-msg" role="status"></p>');
    h.push("</header>");

    if (owner && editing) {
      h.push('<form class="window project-edit" id="pv-form" novalidate><h2>프로젝트 고치기</h2><div class="mini-grid">');
      h.push('<label>이름 <input class="cell-input" name="title" maxlength="80" required value="' + esc(p.title) + '"></label>');
      h.push('<label>상태 <select class="cell-input" name="status">' + STATUS.map(function (s) {
        return '<option' + (s === status ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select></label>");
      h.push('<label class="mini-wide">설명 <input class="cell-input" name="description" maxlength="300" value="' + esc(p.description) + '"></label>');
      h.push('<label class="mini-wide">참고 링크 <input class="cell-input" type="url" name="link" maxlength="300" placeholder="https://" value="' + esc(p.link) + '"></label>');
      h.push('<label class="mini-wide">목표 <input class="cell-input" name="goal" maxlength="300" placeholder="예: 3월까지 1부를 끝내고 내 말로 설명할 수 있게" value="' + esc(p.goal) + '"></label>');
      h.push('<label class="mini-wide">가치관 (한 줄에 하나, 10줄까지)<textarea class="cell-input" name="values" rows="4" placeholder="예: 빨리보다 끝까지">' + esc((p.values || []).join("\n")) + "</textarea></label>");
      h.push('<p class="mini-actions mini-wide"><button type="submit" class="px-btn is-primary">저장</button><span class="mini-msg" role="status"></span></p>');
      h.push("</div></form>");
    }

    h.push('<div class="project-layout">');
    // 가치관과 목표
    h.push('<section class="window project-values" aria-labelledby="pv-values"><h2 id="pv-values">가치관과 목표</h2>');
    if (p.goal) h.push('<p class="project-goal is-big"><span class="project-goal-label">목표</span> ' + esc(p.goal) + "</p>");
    if ((p.values || []).length) {
      h.push('<ul class="value-list">' + p.values.map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") + "</ul>");
    }
    if (!p.goal && !(p.values || []).length) {
      h.push('<p class="empty">아직 적지 않았어요.' + (owner ? " 위의 고치기에서 이 프로젝트를 어떤 마음으로 할지 적어 보세요." : "") + "</p>");
    }
    h.push("</section>");

    // 할 일과 진행률
    h.push('<section class="window project-todos" aria-labelledby="pv-todos"><h2 id="pv-todos">할 일과 진행률</h2>');
    h.push('<div class="bar-row"><span class="bar-label">진행</span><span class="bar bar-hp"><span style="width:' + pct + '%"></span></span><span class="bar-num">' + pct + "% (" + done + "/" + todos.length + ")</span></div>");
    if (todos.length) {
      h.push('<ul class="todo-list">');
      todos.forEach(function (t, i) {
        h.push('<li class="' + (t.done ? "is-done" : "") + '"><label><input type="checkbox" data-todo="' + i + '"' + (t.done ? " checked" : "") + (owner ? "" : " disabled") + "><span>" + esc(t.text) + "</span></label>");
        if (owner) h.push('<button type="button" class="todo-del" data-todo-del="' + i + '" aria-label="' + esc(t.text) + ' 지우기">지우기</button>');
        h.push("</li>");
      });
      h.push("</ul>");
    } else {
      h.push('<p class="empty">아직 할 일이 없어요.</p>');
    }
    if (owner) {
      h.push('<form class="todo-add" id="pv-todo-form"><input class="cell-input" id="pv-todo-text" maxlength="200" placeholder="할 일을 적고 Enter" aria-label="새 할 일"><button type="submit" class="px-btn">더하기</button></form>');
    }
    h.push("</section>");

    // 글 모음
    h.push('<section class="window project-notes" aria-labelledby="pv-notes"><h2 id="pv-notes">글 모음</h2>');
    if (notes.length) {
      h.push('<ol class="note-list">');
      notes.forEach(function (n, i) {
        h.push('<li><time datetime="' + esc(n.date) + '"><span class="note-no">' + (i + 1) + "편</span>" + esc(md(n.date)) + '</time><div><a href="' + esc(n.url) + '">' + esc(n.title) + "</a>" +
          (n.summary ? '<span class="feed-summary">' + esc(n.summary) + "</span>" : "") + "</div></li>");
      });
      h.push("</ol>");
    } else {
      h.push('<p class="empty">아직 이 프로젝트의 글이 없어요.' + (owner ? ' <a href="' + esc(cfg.noteWriteUrl) + "?series=" + encodeURIComponent(p.id) + '">첫 노트 쓰기</a>' : "") + "</p>");
    }
    h.push("</section>");

    // 링크 모음 (links.js가 채워요)
    h.push('<section class="window project-links" aria-labelledby="pv-links"><h2 id="pv-links">링크 모음</h2><p class="mini-msg" data-links-msg role="status"></p><div data-links="' + esc(p.id) + '"></div></section>');
    h.push("</div>");

    view.innerHTML = h.join("");
    if (window.LinkBox) view.querySelectorAll("[data-links]").forEach(window.LinkBox.mount);
    wire();
  }

  function msg(text) { var m = $("pv-msg"); if (m) m.textContent = text; }

  /** 저장은 한 번에 하나씩 차례로 보내요. 저장소 파일 하나를 고치는 거라 동시에 보내면 부딪혀요. */
  function save(patch, okText) {
    var body = Object.assign({ id: id }, patch);
    pending++;
    saving = saving.then(function () {
      msg("저장하고 있어요.");
      return A.api("/api/series", { method: "POST", body: body }).then(function (r) {
        pending--;
        // 뒤에 저장할 게 더 남았으면 화면의 내용이 더 새것이라 그대로 둬요.
        if (!pending && r.all) data.series = r.all;
        msg(okText + " " + LAG);
        return true;
      }, function (err) {
        pending--;
        msg(err.message + " 최신 내용을 다시 불러올게요.");
        return (pending ? Promise.resolve() : refresh()).then(function () { return false; });
      });
    });
    return saving;
  }

  function wire() {
    if (!owner) return;
    var del = $("pv-delete");
    if (del) {
      var armed = null;
      del.addEventListener("click", function () {
        var p = project();
        var n = notesOf(p.id).length;
        if (!armed) {
          // 실수로 지우지 않게 한 번 더 눌러야 지워져요.
          del.textContent = (n ? "글 " + n + "편은 프로젝트 없이 남아요. " : "") + "한 번 더 누르면 지워져요";
          del.classList.add("is-armed");
          armed = setTimeout(function () { armed = null; del.textContent = "프로젝트 지우기"; del.classList.remove("is-armed"); }, 4000);
          return;
        }
        clearTimeout(armed); armed = null;
        del.disabled = true;
        msg("지우고 있어요.");
        saving = saving.then(function () {
          return A.api("/api/series?id=" + encodeURIComponent(p.id), { method: "DELETE" }).then(function (r) {
            if (r.main) data.main = r.main;
            view.innerHTML = '<header class="page-head"><h1>\'' + esc(p.title) + '\' 프로젝트를 지웠어요</h1>' +
              "<p>" + (n ? "이 프로젝트에 쓴 노트 " + n + "편은 프로젝트 없는 노트로 남아요. " : "") + LAG + "</p>" +
              '<p><a class="px-btn" href="' + esc(cfg.projectsUrl) + '">프로젝트 목록으로</a></p></header>';
          }, function (err) {
            del.disabled = false;
            del.textContent = "프로젝트 지우기";
            del.classList.remove("is-armed");
            msg(err.message);
          });
        });
      });
    }
    var edit = $("pv-edit");
    if (edit) edit.addEventListener("click", function () { editing = !editing; render(); if (editing) $("pv-form").elements.namedItem("title").focus(); });
    var form = $("pv-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = function (n) { return form.elements.namedItem(n).value.trim(); };
      var fm = form.querySelector(".mini-msg");
      if (!f("title")) { fm.textContent = "이름을 입력해 주세요."; return; }
      var link = f("link");
      if (link && !/^https?:\/\//.test(link)) { fm.textContent = "링크는 http:// 나 https:// 로 시작해야 해요."; return; }
      var values = form.elements.namedItem("values").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      if (values.length > 10) { fm.textContent = "가치관은 10줄까지 적을 수 있어요."; return; }
      fm.textContent = "저장하고 있어요.";
      save({ title: f("title"), status: f("status"), description: f("description"), link: link, goal: f("goal"), values: values }, "저장했어요.").then(function (ok) {
        if (ok) { editing = false; render(); msg("저장했어요. " + LAG); }
      });
    });

    view.querySelectorAll("[data-todo]").forEach(function (box) {
      box.addEventListener("change", function () {
        var p = project();
        var todos = (p.todos || []).map(function (t) { return { text: t.text, done: !!t.done }; });
        var i = +box.getAttribute("data-todo");
        todos[i].done = box.checked;
        p.todos = todos; // 화면은 바로 바꾸고, 저장은 뒤에서 해요
        render();
        save({ todos: todos }, box.checked ? "'" + todos[i].text + "' 했어요." : "'" + todos[i].text + "' 체크를 풀었어요.");
      });
    });
    view.querySelectorAll("[data-todo-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = project();
        var i = +b.getAttribute("data-todo-del");
        var gone = p.todos[i];
        var todos = p.todos.filter(function (_, j) { return j !== i; });
        p.todos = todos;
        render();
        save({ todos: todos }, "'" + gone.text + "'을(를) 지웠어요.");
      });
    });
    var add = $("pv-todo-form");
    if (add) add.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("pv-todo-text");
      var text = input.value.replace(/\s+/g, " ").trim();
      if (!text) { input.focus(); return; }
      var p = project();
      var todos = (p.todos || []).concat([{ text: text }]);
      if (todos.length > 60) { msg("할 일은 60개까지 둘 수 있어요."); return; }
      p.todos = todos;
      render();
      $("pv-todo-text").focus();
      save({ todos: todos }, "'" + text + "'을(를) 더했어요.");
    });
  }

  function refresh() {
    return A.api("/api/taxonomy").then(function (t) {
      data.series = t.series || data.series;
      if (t.main) data.main = t.main;
      render();
      syncMainButtons();
    }, function () {});
  }

  if (view) {
    if (id === "cs") { location.replace(cfg.courseUrl); return; }
    render();
  }
  if (A && A.enabled) {
    var fetched = false;
    A.onChange(function (u) {
      owner = isOwner(u);
      if (view) render();
      // 주인에게는 블로그가 다시 만들어지기를 기다리지 않고 저장소의 최신 내용을 보여줘요.
      if (owner && !fetched) { fetched = true; refresh(); }
    });
  }
})();
