/* 시리즈와 태그를 따로 만들고, 고치고, 지우는 화면이에요. 블로그 주인만 쓸 수 있어요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var A = window.BlogAuth;
  var notes = C.notes || [];
  var data = { series: (C.series || []).slice(), tags: (C.tags || []).slice() };
  function $(id) { return document.getElementById(id); }
  function node(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function gate(text, actions) {
    $("write-gate-text").textContent = text;
    var box = $("write-gate-actions"); box.textContent = "";
    (actions || []).forEach(function (a) { box.appendChild(a); });
    $("write-gate").hidden = false;
  }
  function seriesCount(id) { return notes.filter(function (n) { return n.series === id; }).length; }
  function tagCount(name) { return notes.filter(function (n) { return (n.tags || []).indexOf(name) !== -1; }).length; }

  /** 두 번 눌러야 지워지는 버튼 */
  function deleteButton(label, warn, run) {
    var b = node("button", { type: "button", "class": "px-btn is-ghost" }, label);
    var armed = null;
    b.addEventListener("click", function () {
      if (!armed) {
        b.textContent = warn;
        b.classList.add("is-armed");
        armed = setTimeout(function () { armed = null; b.textContent = label; b.classList.remove("is-armed"); }, 4000);
        return;
      }
      clearTimeout(armed); armed = null;
      b.disabled = true;
      run(b);
    });
    return b;
  }

  function field(label, name, value, attrs) {
    var l = node("label", null, label + " ");
    var i = node("input", Object.assign({ type: "text", name: name, "class": "cell-input" }, attrs || {}));
    i.value = value || "";
    l.appendChild(i);
    return l;
  }

  function renderSeries() {
    var ul = $("m-series");
    ul.textContent = "";
    if (!data.series.length) ul.appendChild(node("li", { "class": "empty" }, "아직 시리즈가 없어요."));
    data.series.forEach(function (s) {
      var li = node("li", { "class": "manage-item" });
      var head = node("div", { "class": "manage-head" });
      head.appendChild(node("span", { "class": "series-name" }, s.title));
      head.appendChild(node("span", { "class": "manage-sub" }, s.id + ", 글 " + seriesCount(s.id) + "편"));
      li.appendChild(head);
      if (s.description) li.appendChild(node("p", { "class": "manage-desc" }, s.description));
      var form = node("form", { "class": "mini-grid manage-edit", hidden: "" });
      form.appendChild(field("이름", "title", s.title, { maxlength: "80" }));
      form.appendChild(field("참고 링크", "link", s.link, { type: "url", maxlength: "300", placeholder: "https://" }));
      var d = field("설명", "description", s.description, { maxlength: "300" }); d.className = "mini-wide"; form.appendChild(d);
      var acts = node("p", { "class": "mini-actions mini-wide" });
      acts.appendChild(node("button", { type: "submit", "class": "px-btn is-primary" }, "저장"));
      var msg = node("span", { "class": "mini-msg", role: "status" });
      acts.appendChild(msg);
      form.appendChild(acts);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        msg.textContent = "저장하고 있어요.";
        A.api("/api/series", { method: "POST", body: { id: s.id, title: form.elements.namedItem("title").value.trim(), description: form.elements.namedItem("description").value.trim(), link: form.elements.namedItem("link").value.trim() } })
          .then(function (r) { data.series = r.all; renderSeries(); }, function (err) { msg.textContent = err.message; });
      });
      var row = node("p", { "class": "manage-actions" });
      var edit = node("button", { type: "button", "class": "px-btn is-ghost" }, "고치기");
      edit.addEventListener("click", function () { form.hidden = !form.hidden; edit.textContent = form.hidden ? "고치기" : "접기"; if (!form.hidden) form.elements.namedItem("title").focus(); });
      row.appendChild(edit);
      var n = seriesCount(s.id);
      row.appendChild(deleteButton("지우기", n ? "글 " + n + "편은 시리즈 없이 남아요. 한 번 더 누르면 지워져요" : "한 번 더 누르면 지워져요", function (b) {
        A.api("/api/series?id=" + encodeURIComponent(s.id), { method: "DELETE" }).then(function (r) { data.series = r.all; renderSeries(); }, function (err) { b.disabled = false; msg.textContent = err.message; form.hidden = false; });
      }));
      li.appendChild(row);
      li.appendChild(form);
      ul.appendChild(li);
    });
  }

  function renderTags() {
    var ul = $("m-tags");
    ul.textContent = "";
    if (!data.tags.length) ul.appendChild(node("li", { "class": "empty" }, "아직 태그가 없어요."));
    data.tags.forEach(function (t) {
      var li = node("li", { "class": "manage-item is-tag" });
      var head = node("div", { "class": "manage-head" });
      head.appendChild(node("span", { "class": "tag-chip is-static" }, "#" + t.name));
      head.appendChild(node("span", { "class": "manage-sub" }, "글 " + tagCount(t.name) + "편"));
      li.appendChild(head);
      var form = node("form", { "class": "manage-inline" });
      var input = node("input", { type: "text", name: "description", "class": "cell-input", maxlength: "200", placeholder: "설명 (선택)", "aria-label": t.name + " 태그 설명" });
      input.value = t.description || "";
      form.appendChild(input);
      form.appendChild(node("button", { type: "submit", "class": "px-btn is-ghost" }, "설명 저장"));
      var msg = node("span", { "class": "mini-msg", role: "status" });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        msg.textContent = "저장하고 있어요.";
        A.api("/api/tags", { method: "POST", body: { name: t.name, description: input.value.trim() } })
          .then(function (r) { data.tags = r.all; renderTags(); }, function (err) { msg.textContent = err.message; });
      });
      var n = tagCount(t.name);
      form.appendChild(deleteButton("지우기", n ? "글 " + n + "편의 태그는 그대로 남아요. 한 번 더 누르면 목록에서 지워져요" : "한 번 더 누르면 지워져요", function (b) {
        A.api("/api/tags?name=" + encodeURIComponent(t.name), { method: "DELETE" }).then(function (r) { data.tags = r.all; renderTags(); }, function (err) { b.disabled = false; msg.textContent = err.message; });
      }));
      form.appendChild(msg);
      li.appendChild(form);
      ul.appendChild(li);
    });
  }

  function wireCreate() {
    var sf = $("m-series-form");
    sf.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = sf.querySelector(".mini-msg");
      var title = sf.elements.namedItem("title").value.trim(), id = sf.elements.namedItem("id").value.trim().toLowerCase();
      if (!title) { msg.textContent = "시리즈 이름을 입력해 주세요."; sf.elements.namedItem("title").focus(); return; }
      if (id && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) { msg.textContent = "주소 이름은 영어 소문자, 숫자, -만 쓸 수 있어요."; sf.elements.namedItem("id").focus(); return; }
      msg.textContent = "만들고 있어요.";
      A.api("/api/series", { method: "POST", body: { create: true, title: title, id: id, description: sf.elements.namedItem("description").value.trim(), link: sf.elements.namedItem("link").value.trim() } })
        .then(function (r) { data.series = r.all; renderSeries(); sf.reset(); msg.textContent = "'" + r.series.title + "' 시리즈를 만들었어요."; }, function (err) { msg.textContent = err.message; });
    });
    var tf = $("m-tag-form");
    tf.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = tf.querySelector(".mini-msg");
      var name = tf.elements.namedItem("name").value.trim().replace(/^#+/, "");
      if (!name) { msg.textContent = "태그 이름을 입력해 주세요."; tf.elements.namedItem("name").focus(); return; }
      msg.textContent = "만들고 있어요.";
      A.api("/api/tags", { method: "POST", body: { create: true, name: name, description: tf.elements.namedItem("description").value.trim() } })
        .then(function (r) { data.tags = r.all; renderTags(); tf.reset(); msg.textContent = "#" + r.tag.name + " 태그를 만들었어요."; }, function (err) { msg.textContent = err.message; });
    });
  }

  var opened = false;
  function open() {
    if (opened) return;
    opened = true;
    gate("최신 목록을 불러오고 있어요.");
    A.api("/api/taxonomy").then(function (t) {
      data.series = t.series || [];
      data.tags = t.tags || [];
    }, function () {}).then(function () {
      $("write-gate").hidden = true;
      $("manage").hidden = false;
      renderSeries();
      renderTags();
      wireCreate();
    });
  }

  if (!A || !A.enabled) { gate("글쓰기 서버가 아직 연결되지 않았어요."); return; }
  A.onChange(function (user) {
    if (user && user.role === "owner") { open(); return; }
    if (opened) return;
    if (!user) gate("관리하려면 먼저 GitHub으로 로그인해 주세요.", [node("a", { href: A.loginUrl(), "class": "px-btn" }, "GitHub으로 로그인")]);
    else gate("시리즈와 태그는 블로그 주인만 관리할 수 있어요.");
  });
})();
