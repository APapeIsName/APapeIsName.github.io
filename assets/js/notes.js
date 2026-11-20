/* 공부 노트 목록: ?series= 나 ?tag= 로 거르고, 프로젝트를 고르면 읽는 순서(오래된 글부터)로 보여줘요. */
(function () {
  "use strict";
  var list = document.getElementById("note-list");
  var params = new URLSearchParams(location.search);
  var series = params.get("series") || "";
  var tag = params.get("tag") || "";

  var chip = series ? document.querySelector('.chip[data-series="' + CSS.escape(series) + '"]') : null;
  document.querySelectorAll(".chip[data-series]").forEach(function (c) {
    c.setAttribute("aria-pressed", c.getAttribute("data-series") === (chip ? series : "") ? "true" : "false");
  });
  document.querySelectorAll(".tag-chip[data-tag]").forEach(function (c) {
    var on = c.getAttribute("data-tag") === tag;
    c.setAttribute("aria-pressed", on ? "true" : "false");
    // 같은 태그를 다시 누르면 거르기를 풀어요
    if (on) c.setAttribute("href", location.pathname + (series ? "?series=" + encodeURIComponent(series) : ""));
    else if (series) c.setAttribute("href", location.pathname + "?series=" + encodeURIComponent(series) + "&tag=" + encodeURIComponent(c.getAttribute("data-tag")));
  });

  if (chip) {
    document.getElementById("notes-title").textContent = chip.getAttribute("data-title");
    document.getElementById("notes-desc").textContent = chip.getAttribute("data-desc") || "프로젝트 글을 읽는 순서대로 모았어요.";
    var link = chip.getAttribute("data-link");
    if (link) {
      var box = document.getElementById("notes-link");
      var a = box.querySelector("a");
      a.href = link;
      a.textContent = "참고 자료 열기";
      box.hidden = false;
    }
    document.title = chip.getAttribute("data-title") + " | " + document.title.split(" | ").slice(-1)[0];
    var pbox = document.getElementById("notes-project");
    if (pbox) {
      var pa = pbox.querySelector("a");
      if (series === "cs") { pa.href = (window.COURSE && COURSE.config && COURSE.config.courseUrl) || "/course/"; pa.textContent = "과정 대시보드 보기"; }
      else pa.href = pbox.getAttribute("data-base") + "?id=" + encodeURIComponent(series);
      pbox.hidden = false;
    }
    var w = document.getElementById("notes-write");
    if (w) w.href += "?series=" + encodeURIComponent(series);
  }

  if (!list) return;
  var items = Array.prototype.slice.call(list.children);
  var shown = items.filter(function (li) {
    var ok = (!series || li.getAttribute("data-series") === series) &&
      (!tag || li.getAttribute("data-tags").indexOf("|" + tag + "|") !== -1);
    li.hidden = !ok;
    return ok;
  });
  if (series) {
    // 프로젝트는 1편부터 읽게 오래된 순으로
    shown.sort(function (a, b) { return a.getAttribute("data-date") < b.getAttribute("data-date") ? -1 : 1; });
    shown.forEach(function (li, i) {
      list.appendChild(li);
      li.querySelector("time").insertAdjacentHTML("afterbegin", '<span class="note-no">' + (i + 1) + "편</span>");
    });
  }
  document.getElementById("notes-empty").hidden = shown.length !== 0;
  var state = document.getElementById("filter-state");
  if (series || tag) {
    var parts = [];
    if (chip) parts.push(chip.getAttribute("data-title"));
    if (tag) parts.push("#" + tag);
    state.textContent = parts.join(", ") + " 글 " + shown.length + "편";
    state.hidden = false;
  }
})();
