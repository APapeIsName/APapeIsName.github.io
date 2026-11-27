/* 스킬 트리: 과제(quests.csv)와 히든 던전(dungeons.csv)을 선행 관계(requires)로 이어 그려요.
   시즌이 열, 과제가 칸이에요. 누르면 뿌리(이걸 이루는 지식)와 가지(이걸로 자라는 것)가 켜져요. */
(function () {
  "use strict";
  var C = window.COURSE || {};
  var K = C.computed;
  var canvas = document.getElementById("tree-canvas");
  var detail = document.getElementById("tree-detail");
  if (!canvas || !K) return;

  var COLW = 196, NODEW = 168, NODEH = 38, ROWH = 48, HEAD = 44, PAD = 14, LANEH = 30;
  var FIELDS = [["서버", "server"], ["프론트", "front"], ["AI", "ai"]];
  var SVGNS = "http://www.w3.org/2000/svg";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function code(n) { return n.hidden ? "히든" : String(n.season).split(" ")[0]; }

  /* ── 노드 모으기 ── */
  var seasons = C.seasons || [];
  var colOf = {};
  seasons.forEach(function (s, i) { colOf[s.id] = i; });
  var nodes = K.quests.concat(K.dungeons || []);
  var byId = K.nodeById || {};
  var kids = {};
  nodes.forEach(function (n) {
    n.requires.forEach(function (r) { (kids[r] = kids[r] || []).push(n.id); });
  });
  function isBoss(n) { return n.type === "보스" || n.type === "히든 보스"; }
  // 줄기: 보스끼리 이어진 선, 그리고 보스가 직접 가져다 쓰는 부품
  var TRUNK_PARTS = {};
  K.quests.forEach(function (q) {
    if (q.type !== "보스") return;
    q.requires.forEach(function (r) { var s = byId[r]; if (s && s.type === "보스") TRUNK_PARTS[r + ">" + q.id] = true; });
  });
  K.quests.forEach(function (q) {
    q.requires.forEach(function (r) {
      var s = byId[r];
      if (!s || s.hidden) return;
      var cross = String(s.season) !== String(q.season);
      if (cross && (s.type === "보스" || q.type === "보스") && (s.type === "보스" || /해싱|힙/.test(s.quest))) TRUNK_PARTS[r + ">" + q.id] = true;
    });
  });
  var trunkNodes = {};
  Object.keys(TRUNK_PARTS).forEach(function (k) { var p = k.split(">"); trunkNodes[p[0]] = trunkNodes[p[1]] = true; });

  /* ── 자리 잡기 ── */
  var pos = {};
  var maxRows = 0;
  seasons.forEach(function (s, i) {
    var list = K.quests.filter(function (q) { return q.season === s.id; });
    // 메인 흐름 먼저, 사이드는 아래로
    var main = list.filter(function (q) { return q.type !== "사이드"; });
    var side = list.filter(function (q) { return q.type === "사이드"; });
    main.concat(side).forEach(function (q, r) {
      pos[q.id] = { x: PAD + i * COLW, y: HEAD + r * ROWH + (q.type === "사이드" ? 14 : 0), col: i };
      maxRows = Math.max(maxRows, r + 1 + (side.length ? 0.3 : 0));
    });
  });
  // 두 시즌 넘게 건너뛰는 선은 과제 칸을 가로지르지 않게 맨 아래 통로로 돌려요.
  var longCount = 0;
  K.quests.forEach(function (q) {
    q.requires.forEach(function (r) { var a = pos[r], b = pos[q.id]; if (a && b && b.col - a.col > 1) longCount++; });
  });
  var chanTop = HEAD + Math.ceil(maxRows) * ROWH + 4;
  var bandTop = chanTop + longCount * 4 + 30;
  var y0 = bandTop + 34;
  var laneTops = {};
  FIELDS.forEach(function (f) {
    var stack = {};
    var list = (K.dungeons || []).filter(function (d) { return d.field === f[0]; });
    laneTops[f[0]] = y0;
    var deepest = 0;
    list.forEach(function (d) {
      // 여는 조건 가운데 가장 늦은 시즌 열에 놓아요. 히든 보스는 맨 오른쪽 끝.
      var col = 0;
      d.requires.forEach(function (r) { var p = pos[r]; if (p) col = Math.max(col, p.col); });
      if (d.type === "히든 보스") col = seasons.length - 1;
      var k = stack[col] = (stack[col] || 0) + 1;
      pos[d.id] = { x: PAD + col * COLW, y: y0 + LANEH + (k - 1) * ROWH, col: col };
      deepest = Math.max(deepest, k);
    });
    y0 += LANEH + deepest * ROWH + 18;
  });
  var W = PAD * 2 + seasons.length * COLW - (COLW - NODEW);
  var H = y0 + 10;

  /* ── 그리기 ── */
  canvas.textContent = "";
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  var svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", W); svg.setAttribute("height", H);
  svg.setAttribute("class", "tree-edges");
  svg.setAttribute("aria-hidden", "true");
  canvas.appendChild(svg);

  seasons.forEach(function (s, i) {
    var h = document.createElement("div");
    h.className = "tree-col-head";
    h.style.left = PAD + i * COLW + "px";
    h.style.width = NODEW + "px";
    h.innerHTML = "<b>" + esc(s.code) + "</b> " + esc(s.title);
    canvas.appendChild(h);
  });
  var band = document.createElement("div");
  band.className = "tree-band";
  band.style.top = bandTop + "px";
  band.innerHTML = "<b>히든 던전</b> 분야마다 CS 과제를 깨면 하나씩 열려요";
  canvas.appendChild(band);
  FIELDS.forEach(function (f) {
    var l = document.createElement("div");
    l.className = "tree-lane field-" + f[1];
    l.style.top = laneTops[f[0]] + "px";
    l.textContent = f[0];
    canvas.appendChild(l);
  });

  var edgeEls = [], longIdx = 0, hidIdx = 0;
  function edge(from, to) {
    var a = pos[from], b = pos[to];
    if (!a || !b) return;
    var d;
    var tn = byId[to];
    if (tn.hidden && byId[from].hidden) {
      // 던전끼리(던전 → 히든 보스): 줄 사이 틈으로
      var gy = b.y - 6 - (hidIdx++ % 3) * 3;
      d = "M" + (a.x + NODEW / 2) + " " + a.y + " V" + gy + " H" + (b.x + NODEW / 2) + " V" + b.y;
    } else if (tn.hidden) {
      // 과제 오른쪽 틈으로 내려가, 던전 바로 위 틈에서 옆으로 가요
      var off = (hidIdx++ % 5) * 3;
      var gx = a.x + NODEW + 5 + off, gy2 = b.y - 5 - (off % 9);
      d = "M" + (a.x + NODEW) + " " + (a.y + NODEH / 2) + " H" + gx + " V" + gy2 + " H" + (b.x + NODEW / 2 + off - 6) + " V" + b.y;
    } else if (a.col === b.col) {
      if (b.y - a.y <= ROWH + 14 && byId[to].type !== "사이드") d = "M" + (a.x + 18) + " " + (a.y + NODEH) + " V" + b.y;
      else d = "M" + a.x + " " + (a.y + NODEH / 2) + " H" + (a.x - 7) + " V" + (b.y + NODEH / 2) + " H" + b.x;
    } else if (b.col - a.col === 1) {
      var mx = b.x - 8 - (edgeEls.length % 4) * 4;
      d = "M" + (a.x + NODEW) + " " + (a.y + NODEH / 2) + " H" + mx + " V" + (b.y + NODEH / 2) + " H" + b.x;
    } else {
      var i = longIdx++;
      var g1 = a.x + NODEW + 4 + (i % 5) * 4, g2 = b.x - 6 - (i % 5) * 4, cy = chanTop + i * 4;
      d = "M" + (a.x + NODEW) + " " + (a.y + NODEH / 2) + " H" + g1 + " V" + cy + " H" + g2 + " V" + (b.y + NODEH / 2) + " H" + b.x;
    }
    var p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d);
    var cls = "e";
    if (TRUNK_PARTS[from + ">" + to]) cls += " e-trunk";
    if (tn.hidden) cls += " e-hidden";
    else if (a.col !== b.col) cls += " e-cross";
    if (byId[from] && byId[from].done) cls += " e-met";
    p.setAttribute("class", cls);
    p._from = from; p._to = to;
    svg.appendChild(p);
    edgeEls.push(p);
  }
  nodes.forEach(function (n) { n.requires.forEach(function (r) { edge(r, n.id); }); });
  // 줄기는 맨 위에 그려요
  edgeEls.filter(function (p) { return /e-trunk/.test(p.getAttribute("class")); }).forEach(function (p) { svg.appendChild(p); });

  var nextId = (K.quests.filter(function (q) { return !q.optional && !q.done; })[0] || {}).id;
  var btns = {};
  nodes.forEach(function (n) {
    var p = pos[n.id];
    if (!p) return;
    var b = document.createElement("button");
    b.type = "button";
    var masked = n.hidden && !n.open;
    var cls = ["tnode"];
    cls.push(n.done ? "is-done" : n.open ? "is-open" : "is-locked");
    if (isBoss(n)) cls.push("is-boss");
    if (n.type === "사이드") cls.push("is-side");
    if (n.type === "복습") cls.push("is-review");
    if (n.hidden) cls.push("is-hidden", "field-" + (n.field === "서버" ? "server" : n.field === "프론트" ? "front" : "ai"));
    if (trunkNodes[n.id]) cls.push("is-trunk");
    if (n.id === nextId) cls.push("is-next");
    b.className = cls.join(" ");
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.setAttribute("data-id", n.id);
    var label = masked ? (n.type === "히든 보스" ? "??? 히든 보스" : "???") : n.quest;
    b.innerHTML = '<span class="tnode-text">' + esc(label) + "</span>";
    b.setAttribute("aria-label", (masked ? n.field + " 히든 던전, 잠김" : code(n) + " " + n.type + ", " + n.quest) + (n.done ? ", 끝냄" : ""));
    b.addEventListener("click", function () { select(n.id, true); });
    canvas.appendChild(b);
    btns[n.id] = b;
  });

  /* ── 고르기: 뿌리와 가지 ── */
  // 복습(돌아보기, 회고)은 시즌을 순서대로 잇는 다리일 뿐이라, 뿌리와 가지를 따라갈 때는 건너지 않아요.
  // 건너면 모든 과제가 모든 과제의 뿌리가 돼 버려요.
  function walk(id, map, acc) {
    (map(id) || []).forEach(function (x) {
      if (acc[x] || !byId[x] || byId[x].type === "복습") return;
      acc[x] = true; walk(x, map, acc);
    });
    return acc;
  }
  var current = null;
  function select(id, push) {
    current = id;
    var anc = id ? walk(id, function (x) { return byId[x] ? byId[x].requires : []; }, {}) : {};
    var desc = id ? walk(id, function (x) { return kids[x]; }, {}) : {};
    canvas.classList.toggle("has-sel", !!id);
    var roomed = {};
    if (id && byId[id] && !byId[id].hidden) {
      (K.dungeons || []).forEach(function (d) { d.rooms.forEach(function (r) { if (r.src === id) roomed[d.id] = true; }); });
    }
    Object.keys(btns).forEach(function (k) {
      var b = btns[k];
      b.classList.toggle("is-sel", k === id);
      b.classList.toggle("is-anc", !!anc[k]);
      b.classList.toggle("is-desc", !!desc[k]);
      // 바로 앞, 바로 다음은 진하게. 더 먼 뿌리와 가지는 옅게.
      b.classList.toggle("is-near", !!id && (byId[id].requires.indexOf(k) >= 0 || (kids[id] || []).indexOf(k) >= 0));
      // 이 과제의 엮을 거리가 방으로 들어 있는 던전도 같이 켜요
      b.classList.toggle("is-roomed", !!id && !!roomed[k]);
      b.setAttribute("aria-pressed", k === id ? "true" : "false");
    });
    edgeEls.forEach(function (p) {
      var up = (anc[p._from] || p._from === id) && (anc[p._to] || p._to === id) && anc[p._from];
      var down = (desc[p._to]) && (desc[p._from] || p._from === id);
      p.classList.toggle("e-anc", !!up);
      p.classList.toggle("e-desc", !!down);
      p.classList.toggle("e-near", p._to === id || p._from === id);
    });
    renderDetail(id, anc, desc);
    if (push && history.replaceState) history.replaceState(null, "", id ? "#" + id : location.pathname);
  }

  function link(id) {
    var n = byId[id];
    if (!n) return esc(id);
    var masked = n.hidden && !n.open;
    var name = masked ? "??? (" + n.field + " 히든)" : (n.hidden ? n.field + " " : code(n) + " ") + n.quest;
    return '<button type="button" class="tlink' + (n.done ? " is-done" : "") + '" data-go="' + esc(id) + '">' + esc(name) + "</button>";
  }
  function count(o) { return Object.keys(o).length; }

  function renderDetail(id, anc, desc) {
    if (!id || !byId[id]) {
      detail.innerHTML = '<p class="tree-detail-empty">과제를 하나 눌러 보세요. 무엇에서 왔고 무엇으로 자라는지 여기에 보여요.</p>';
      return;
    }
    var n = byId[id];
    var masked = n.hidden && !n.open;
    var h = [];
    var state = n.done ? "끝냄" : n.open ? "열림" : "잠김";
    if (masked) {
      h.push("<h2>??? " + esc(n.field) + " " + (n.type === "히든 보스" ? "히든 보스" : "히든 던전") + "</h2>");
      h.push('<p class="tree-detail-meta">잠김. 열리려면: ' + (C.hiddenHint ? C.hiddenHint(n) : "") + "</p>");
    } else {
      h.push("<h2>" + esc(n.quest) + "</h2>");
      h.push('<p class="tree-detail-meta">' + esc(n.hidden ? n.field + " " + n.type : n.season + ", " + n.type) + ", 약 " + n.hours + "시간, " + state + "</p>");
      if (n.practice) h.push('<p class="tree-detail-practice"><b>실습 거리</b> ' + esc(n.practice) + "</p>");
    }
    var direct = masked ? n.requires.filter(function (r) { return !(byId[r] && byId[r].hidden); }) : n.requires;
    h.push('<div class="tree-detail-cols"><div><h3>이걸 이루는 지식 <span>바로 앞 ' + direct.length + "개, 뿌리까지 " + count(anc) + "개</span></h3>");
    h.push(direct.length ? '<ul class="tlinks">' + direct.map(function (r) { return "<li>" + link(r) + "</li>"; }).join("") + "</ul>" : '<p class="tree-detail-empty">뿌리예요. 여기서 시작해요.</p>');
    h.push("</div>");
    if (!masked) {
      var next = kids[id] || [];
      h.push("<div><h3>이걸로 자라는 것 <span>바로 다음 " + next.length + "개, 가지 끝까지 " + count(desc) + "개</span></h3>");
      h.push(next.length ? '<ul class="tlinks">' + next.map(function (r) { return "<li>" + link(r) + "</li>"; }).join("") + "</ul>" : '<p class="tree-detail-empty">가지 끝이에요.</p>');
      h.push("</div>");
    }
    h.push("</div>");
    // 과제의 엮을 거리: 칩 하나가 어느 히든 던전의 방 하나예요
    if (!n.hidden && n.branches && C.branchesHtml) {
      h.push("<h3>엮을 거리 <span>칩마다 그 주제가 방으로 들어 있는 히든 던전이에요</span></h3>" + C.branchesHtml(n.branches, n.id));
    }
    if (!masked && n.rooms && n.rooms.length) {
      h.push('<h3>방 ' + n.rooms.length + "개</h3><ul class=\"tree-rooms\">" + n.rooms.map(function (r) {
        return "<li>" + esc(r.topic) + " " + link(r.src) + "</li>";
      }).join("") + "</ul>");
    }
    if (n.open && !n.done && C.config && C.config.writeUrl) {
      h.push('<p><a href="' + esc(C.config.writeUrl) + "?quest=" + esc(id) + '">이 과제로 리포트 쓰기</a></p>');
    }
    detail.innerHTML = h.join("");
    if (C.linkBranches) C.linkBranches(detail);
  }
  detail.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go]");
    if (!t) return;
    var id = t.getAttribute("data-go");
    select(id, true);
    var b = btns[id];
    if (b) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  });

  /* ── 보기 전환 ── */
  document.querySelectorAll("[data-tree-toggle]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var on = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      canvas.classList.toggle("only-" + chip.getAttribute("data-tree-toggle"), on);
    });
  });
  var clear = document.querySelector("[data-tree-clear]");
  if (clear) clear.addEventListener("click", function () { select(null, true); });

  var start = decodeURIComponent((location.hash || "").slice(1));
  if (start && byId[start]) {
    select(start, false);
    setTimeout(function () { if (btns[start]) btns[start].scrollIntoView({ block: "center", inline: "center" }); }, 0);
  } else if (nextId && btns[nextId]) {
    renderDetail(null);
  }
})();
