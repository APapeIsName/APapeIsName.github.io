/* 사진 넣기: 리포트와 공부 노트 칸에 사진(손으로 그린 노트, 화면 캡처)을 넣어요.
   칸에 끌어다 놓거나, 복사한 그림을 붙여 넣거나, '사진 넣기' 버튼으로 골라요.
   올리기 전에 브라우저에서 크기를 줄이고(가로 최대 1600픽셀, WebP), 글쓰기 서버가 저장소 assets/uploads/ 에 올려요.
   쓰던 자리에 마크다운 ![이름](주소)가 들어가요. 블로그에는 다시 만들어진 뒤(1~2분) 보여요. */
(function () {
  "use strict";
  var A = window.BlogAuth;
  var MAX_W = 1600, MAX_BYTES = 5 * 1024 * 1024, QUALITY = 0.86;
  var targets = Array.prototype.slice.call(document.querySelectorAll("textarea[data-images]"));
  if (!targets.length || !A) return;

  function blobToBase64(blob) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).replace(/^data:[^,]*,/, "")); };
      r.onerror = function () { fail(new Error("사진을 읽지 못했어요.")); };
      r.readAsDataURL(blob);
    });
  }
  function loadImage(file) {
    return new Promise(function (ok, fail) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error("사진으로 읽을 수 없는 파일이에요.")); };
      img.src = url;
    });
  }
  /** 가로 1600픽셀까지 줄이고 WebP로. GIF는 움직임이 사라지지 않게 그대로 보내요. */
  function shrink(file) {
    if (file.type === "image/gif") return Promise.resolve(file);
    return loadImage(file).then(function (o) {
      var w = o.img.naturalWidth, h = o.img.naturalHeight;
      var scale = Math.min(1, MAX_W / w);
      var c = document.createElement("canvas");
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      var ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(o.img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(o.url);
      // 손그림처럼 선이 많은 그림은 PNG가, 사진은 WebP가 작아요. 둘 다 만들어 작은 쪽을 써요.
      function enc(type, q) { return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, type, q); }); }
      return Promise.all([enc("image/webp", QUALITY), enc("image/png")]).then(function (bs) {
        var pick = bs.filter(function (b) { return b && /^image\/(webp|png)$/.test(b.type); });
        if (scale === 1) pick.push(file); // 줄일 필요가 없으면 원본도 후보
        return pick.sort(function (a, b) { return a.size - b.size; })[0] || file;
      });
    });
  }

  function insertAt(t, text) {
    var s = t.selectionStart, e = t.selectionEnd, v = t.value;
    var before = v.slice(0, s), after = v.slice(e);
    var pre = before && !/\n$/.test(before) ? "\n" : "";
    var post = after && !/^\n/.test(after) ? "\n" : "";
    t.value = before + pre + text + post + after;
    var at = (before + pre + text).length;
    t.setSelectionRange(at, at);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function replaceText(t, from, to) {
    var i = t.value.indexOf(from);
    if (i < 0) { insertAt(t, to); return; }
    t.value = t.value.slice(0, i) + to + t.value.slice(i + from.length);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function altOf(name) {
    return String(name || "사진").replace(/\.[a-z0-9]+$/i, "").replace(/[\[\]\n]/g, " ").trim().slice(0, 60) || "사진";
  }

  // 방금 올린 사진은 블로그가 다시 만들어지기 전이라 주소로는 아직 안 보여요.
  // 미리 보기에서는 이 브라우저에 있는 사진으로 바꿔 보여 줘요.
  var local = {};
  function swapLocal(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".preview img"), function (img) {
      var u = img.getAttribute("src");
      if (local[u] && img.src !== local[u]) img.src = local[u];
    });
  }
  new MutationObserver(function () { swapLocal(document); }).observe(document.body, { childList: true, subtree: true });

  var seq = 0;
  function upload(t, file, ui) {
    if (!/^image\//.test(file.type)) { ui.msg.textContent = "사진 파일만 넣을 수 있어요."; return; }
    var alt = altOf(file.name === "image.png" ? "캡처" : file.name);
    var mark = "![올리는 중 " + (++seq) + ": " + alt + "]()";
    insertAt(t, mark);
    ui.msg.textContent = "사진을 줄이고 올리는 중이에요.";
    shrink(file).then(function (blob) {
      if (blob.size > MAX_BYTES) throw new Error("사진이 너무 커요. 5MB까지 올릴 수 있어요.");
      return blobToBase64(blob).then(function (data) {
        return A.api("/api/uploads", { method: "POST", body: { name: alt, data: data } }).then(function (r) {
          replaceText(t, mark, "![" + alt + "](" + r.url + ")");
          local[r.url] = addThumb(ui, blob, alt);
          ui.msg.textContent = "사진을 넣었어요 (" + Math.max(1, Math.round(blob.size / 1024)) + "KB). 블로그에는 글이 올라간 뒤 1~2분이면 보여요.";
        });
      });
    }).catch(function (e) {
      replaceText(t, mark, "");
      ui.msg.textContent = e.message || "사진을 올리지 못했어요.";
    });
  }
  function addThumb(ui, blob, alt) {
    var img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    img.alt = alt;
    img.title = alt;
    ui.thumbs.appendChild(img);
    ui.thumbs.hidden = false;
    return img.src;
  }

  targets.forEach(function (t) {
    var bar = document.createElement("div");
    bar.className = "img-bar";
    var input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true; input.hidden = true;
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "px-btn is-ghost img-btn";
    btn.textContent = "사진 넣기";
    btn.setAttribute("aria-label", (t.getAttribute("data-title") || "이 칸") + "에 사진 넣기");
    var msg = document.createElement("span");
    msg.className = "mini-msg"; msg.setAttribute("role", "status");
    msg.textContent = "끌어다 놓거나 붙여 넣어도 돼요.";
    var thumbs = document.createElement("div");
    thumbs.className = "img-thumbs"; thumbs.hidden = true;
    bar.appendChild(btn); bar.appendChild(input); bar.appendChild(msg);
    t.insertAdjacentElement("afterend", bar);
    bar.insertAdjacentElement("afterend", thumbs);
    var ui = { msg: msg, thumbs: thumbs };

    btn.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      Array.prototype.forEach.call(input.files, function (f) { upload(t, f, ui); });
      input.value = "";
    });
    t.addEventListener("paste", function (e) {
      var files = Array.prototype.filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      e.preventDefault();
      files.forEach(function (f) { upload(t, f, ui); });
    });
    t.addEventListener("dragover", function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); t.classList.add("is-drop"); }
    });
    t.addEventListener("dragleave", function () { t.classList.remove("is-drop"); });
    t.addEventListener("drop", function (e) {
      t.classList.remove("is-drop");
      var files = Array.prototype.filter.call((e.dataTransfer && e.dataTransfer.files) || [], function (f) { return /^image\//.test(f.type); });
      if (!files.length) return;
      e.preventDefault();
      t.focus();
      files.forEach(function (f) { upload(t, f, ui); });
    });
  });
})();
