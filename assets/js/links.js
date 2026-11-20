/* 링크 모음: 공부하며 본 사이트를 CS 과정이나 프로젝트별로 모아 둬요.
   data-links="all"   링크 모음 페이지 (프로젝트별로 묶어서)
   data-links="<id>"  그 프로젝트의 링크만 (cs는 CS 과정)
   누구나 볼 수 있고, 블로그 주인은 넣고, 고치고, 지울 수 있어요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var A = window.BlogAuth;
  var cfg = C.config || {};
  var links = (C.links || []).slice();
  var series = (C.series || []).slice();
  var owner = false;
  var editing = null;
  var LAG = "블로그에는 1~2분 뒤에 반영돼요.";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
  function groups() {
    var g = [{ id: "cs", title: cfg.courseTitle || "CS 과정", url: cfg.courseUrl }];
    series.forEach(function (s) { g.push({ id: s.id, title: s.title, url: (cfg.projectUrl || "/project/") + "?id=" + encodeURIComponent(s.id) }); });
    return g;
  }
  function projectOptions(selected) {
    var html = '<option value="">기타 (프로젝트 없음)</option>';
    groups().forEach(function (g) {
      html += '<option value="' + esc(g.id) + '"' + (g.id === selected ? " selected" : "") + ">" + esc(g.title) + "</option>";
    });
    return html;
  }

  function itemHtml(l) {
    if (owner && editing === l.id) return '<li class="link-item is-editing">' + formHtml(l, null) + "</li>";
    return '<li class="link-item"><div class="link-main"><a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.title) + "</a>" +
      '<span class="link-host">' + esc(host(l.url)) + "</span></div>" +
      (l.note ? '<p class="link-note">' + esc(l.note) + "</p>" : "") +
      (owner ? '<p class="link-tools"><button type="button" class="link-tool" data-link-edit="' + esc(l.id) + '">고치기</button>' +
        '<button type="button" class="link-tool" data-link-del="' + esc(l.id) + '">지우기</button></p>' : "") +
      "</li>";
  }

  /** l이 있으면 고치기, 없으면 새로 넣기. fixedProject가 있으면 프로젝트 고르는 칸을 숨겨요. */
  function formHtml(l, fixedProject) {
    var isNew = !l;
    l = l || {};
    var proj = isNew ? (fixedProject || "") : (l.project || "");
    return '<form class="link-form' + (isNew ? " is-new" : "") + '" data-link-form="' + esc(l.id || "") + '" novalidate>' +
      '<div class="link-form-grid">' +
      '<label class="lf-url">주소 <input class="cell-input" name="url" type="url" required maxlength="500" placeholder="https://" value="' + esc(l.url) + '"></label>' +
      '<label class="lf-title">제목 (비우면 주소로) <input class="cell-input" name="title" maxlength="100" value="' + esc(l.title) + '"></label>' +
      '<label class="lf-note">메모 (선택) <input class="cell-input" name="note" maxlength="300" placeholder="왜 남겨 두는지, 언제 볼지" value="' + esc(l.note) + '"></label>' +
      (fixedProject && isNew ? '<input type="hidden" name="project" value="' + esc(fixedProject) + '">'
        : '<label class="lf-project">어디에 둘까요 <select class="cell-input" name="project">' + projectOptions(proj) + "</select></label>") +
      "</div>" +
      '<p class="link-form-actions"><button type="submit" class="px-btn is-primary">' + (isNew ? "링크 넣기" : "저장") + "</button>" +
      (isNew ? "" : '<button type="button" class="px-btn is-ghost" data-link-cancel>그만두기</button>') +
      '<span class="mini-msg" role="status"></span></p></form>';
  }

  function listHtml(items) {
    return items.length ? '<ul class="link-list">' + items.map(itemHtml).join("") + "</ul>" : "";
  }

  function render(el) {
    var scope = el.getAttribute("data-links");
    var h = [];
    if (owner) {
      h.push('<details class="link-add"' + (links.length ? "" : " open") + "><summary>링크 넣기</summary>" + formHtml(null, scope === "all" ? null : scope) + "</details>");
    }
    if (scope === "all") {
      var known = {};
      groups().forEach(function (g) {
        known[g.id] = true;
        var items = links.filter(function (l) { return l.project === g.id; });
        if (!items.length) return;
        h.push('<section class="link-group"><h3><a href="' + esc(g.url) + '">' + esc(g.title) + "</a> <span>" + items.length + "개</span></h3>" + listHtml(items) + "</section>");
      });
      var rest = links.filter(function (l) { return !l.project || !known[l.project]; });
      if (rest.length) h.push('<section class="link-group"><h3>기타 <span>' + rest.length + "개</span></h3>" + listHtml(rest) + "</section>");
      if (!links.length) h.push('<p class="empty">아직 모은 링크가 없어요.</p>');
    } else {
      var mine = links.filter(function (l) { return l.project === scope; });
      h.push(listHtml(mine) || '<p class="empty">아직 모은 링크가 없어요.' + (owner ? " 위의 링크 넣기에서 공부하며 본 사이트를 남겨 보세요." : "") + "</p>");
    }
    el.innerHTML = h.join("");
  }

  function renderAll() { document.querySelectorAll("[data-links]").forEach(render); }

  function formMsg(form, t) { var m = form.querySelector(".mini-msg"); if (m) m.textContent = t; }

  document.addEventListener("submit", function (e) {
    var form = e.target.closest && e.target.closest("[data-link-form]");
    if (!form || !A) return;
    e.preventDefault();
    var v = function (n) { var x = form.elements.namedItem(n); return x ? x.value.trim() : ""; };
    var url = v("url");
    if (!url) { formMsg(form, "링크 주소를 넣어 주세요."); form.elements.namedItem("url").focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    var id = form.getAttribute("data-link-form");
    var body = { url: url, title: v("title"), note: v("note"), project: v("project") };
    if (id) body.id = id;
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    formMsg(form, "저장하고 있어요.");
    A.api("/api/links", { method: "POST", body: body }).then(function (r) {
      links = r.all || links;
      editing = null;
      renderAll();
      var box = document.querySelector("[data-links-msg]");
      if (box) box.textContent = "'" + r.link.title + "' 링크를 " + (id ? "고쳤어요. " : "넣었어요. ") + LAG;
    }, function (err) { btn.disabled = false; formMsg(form, err.message); });
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    var ed = t.closest("[data-link-edit]");
    if (ed) { editing = ed.getAttribute("data-link-edit"); renderAll(); return; }
    if (t.closest("[data-link-cancel]")) { editing = null; renderAll(); return; }
    var del = t.closest("[data-link-del]");
    if (del && A) {
      if (!del.classList.contains("is-armed")) {
        del.classList.add("is-armed");
        del.textContent = "한 번 더 누르면 지워요";
        setTimeout(function () { if (del.isConnected) { del.classList.remove("is-armed"); del.textContent = "지우기"; } }, 4000);
        return;
      }
      del.disabled = true;
      A.api("/api/links?id=" + encodeURIComponent(del.getAttribute("data-link-del")), { method: "DELETE" }).then(function (r) {
        links = r.all || links;
        renderAll();
        var box = document.querySelector("[data-links-msg]");
        if (box) box.textContent = "링크를 지웠어요. " + LAG;
      }, function (err) { del.disabled = false; del.textContent = err.message; });
    }
  });

  window.LinkBox = { mount: render, renderAll: renderAll };
  renderAll();

  if (A && A.enabled) {
    var fetched = false;
    A.onChange(function (u) {
      owner = !!(u && u.role === "owner");
      renderAll();
      if (owner && !fetched) {
        fetched = true;
        A.api("/api/taxonomy").then(function (t) {
          if (t.links) links = t.links;
          if (t.series) series = t.series;
          renderAll();
        }, function () {});
      }
    });
  }
})();
