/* 리포트 인터뷰: 상담하듯 묻고 공감하는 AI와 이야기하고, 끝에 내가 한 말로 리포트 칸을 채워요.
   AI는 지식을 가르치지 않아요. 대화는 글쓰기 서버(/api/interview)를 거쳐 Claude와 나눠요.
   대화는 이 브라우저에 리포트별로 저장돼서, 화면을 닫았다 열어도 이어져요. */
(function () {
  "use strict";
  var A = window.BlogAuth;
  var W = window.ReportWriter;
  var box = document.getElementById("interview");
  if (!box || !A || !A.enabled || !W) { if (box) box.hidden = true; return; }

  function $(id) { return document.getElementById(id); }
  var toggle = $("iv-toggle"), body = $("iv-body"), log = $("iv-log"), text = $("iv-text");
  var send = $("iv-send"), fill = $("iv-fill"), reset = $("iv-reset"), msg = $("iv-msg");
  var turns = [];
  var busy = false;
  var fillArmed = null;

  function storeKey() { return "cs_interview:" + W.key(); }
  function load() { try { return JSON.parse(localStorage.getItem(storeKey()) || "[]") || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(storeKey(), JSON.stringify(turns)); } catch (e) {} }

  function bubble(t, extra) {
    var li = document.createElement("li");
    li.className = "iv-turn is-" + t.role + (extra ? " " + extra : "");
    var who = document.createElement("span");
    who.className = "iv-who";
    who.textContent = t.role === "user" ? "나" : "인터뷰어";
    var p = document.createElement("p");
    p.textContent = t.content;
    li.appendChild(who);
    li.appendChild(p);
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }
  function renderAll() {
    log.innerHTML = "";
    turns.forEach(function (t) { bubble(t); });
    fill.disabled = !turns.some(function (t) { return t.role === "user"; });
  }
  function setBusy(on, label) {
    busy = on;
    send.disabled = on;
    fill.disabled = on || !turns.some(function (t) { return t.role === "user"; });
    reset.disabled = on;
    msg.textContent = label || "";
  }

  function ask() {
    setBusy(true, "인터뷰어가 답을 쓰고 있어요.");
    var typing = bubble({ role: "assistant", content: "…" }, "is-typing");
    return A.api("/api/interview", { method: "POST", body: { mode: "chat", messages: turns, quest: W.quest() } }).then(function (r) {
      typing.remove();
      turns.push({ role: "assistant", content: r.reply });
      save();
      bubble(turns[turns.length - 1]);
      setBusy(false);
      text.focus();
    }, function (err) {
      typing.remove();
      setBusy(false, err.message);
    });
  }

  function open() {
    var showing = body.hidden;
    body.hidden = !showing;
    toggle.setAttribute("aria-expanded", String(showing));
    toggle.textContent = showing ? "인터뷰 접기" : (turns.length ? "인터뷰 이어 하기" : "인터뷰 시작");
    if (!showing) return;
    renderAll();
    if (!turns.length) ask(); else text.focus();
  }

  function submitAnswer() {
    var v = text.value.trim();
    if (!v || busy) return;
    turns.push({ role: "user", content: v });
    save();
    bubble(turns[turns.length - 1]);
    text.value = "";
    ask();
  }

  /** 대화를 세 칸으로 정리해요. 이미 쓴 칸은 지우지 않고 그 아래에 덧붙여요. */
  function fillFields() {
    if (busy) return;
    setBusy(true, "대화를 칸으로 정리하고 있어요.");
    A.api("/api/interview", { method: "POST", body: { mode: "draft", messages: turns, quest: W.quest() } }).then(function (r) {
      setBusy(false);
      var fields = r.fields || {};
      var keys = Object.keys(fields).filter(function (k) { return fields[k] && W.field(k); });
      if (!keys.length) { msg.textContent = "칸에 넣을 만한 이야기를 아직 찾지 못했어요. 조금 더 이야기해 주세요."; return; }
      var busyKeys = keys.filter(function (k) { return W.field(k).value.trim(); });
      if (busyKeys.length && !fillArmed) {
        fillArmed = fields;
        fill.textContent = "한 번 더 누르면 덧붙여요";
        fill.classList.add("is-armed");
        msg.textContent = busyKeys.map(function (k) { return "'" + W.title(k) + "'"; }).join(", ") + " 칸에 이미 쓴 글이 있어요. 지우지 않고 그 아래에 덧붙여요.";
        setTimeout(disarm, 6000);
        return;
      }
      put(fields, keys);
    }, function (err) { setBusy(false, err.message); });
  }
  function disarm() { fillArmed = null; fill.textContent = "칸에 정리해 넣기"; fill.classList.remove("is-armed"); }
  function put(fields, keys) {
    keys.forEach(function (k) {
      var el = W.field(k);
      var old = el.value.trim();
      el.value = old ? old + "\n\n" + fields[k] : fields[k];
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    disarm();
    msg.textContent = keys.map(function (k) { return "'" + W.title(k) + "'"; }).join(", ") + " 칸을 채웠어요. 아래에서 마음대로 고쳐도 돼요.";
    var first = W.field(keys[0]);
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  toggle.addEventListener("click", open);
  send.addEventListener("click", submitAnswer);
  text.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submitAnswer(); }
  });
  fill.addEventListener("click", function () {
    if (fillArmed) { var f = fillArmed; put(f, Object.keys(f).filter(function (k) { return f[k] && W.field(k); })); return; }
    fillFields();
  });
  var resetArmed = null;
  reset.addEventListener("click", function () {
    if (!resetArmed) {
      reset.textContent = "한 번 더 누르면 대화를 지워요";
      reset.classList.add("is-armed");
      resetArmed = setTimeout(function () { resetArmed = null; reset.textContent = "처음부터 다시"; reset.classList.remove("is-armed"); }, 4000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = null;
    reset.textContent = "처음부터 다시"; reset.classList.remove("is-armed");
    turns = [];
    save();
    renderAll();
    msg.textContent = "";
    ask();
  });

  turns = load();
  if (turns.length) toggle.textContent = "인터뷰 이어 하기";

  window.ReportInterview = {
    clear: function () { try { localStorage.removeItem(storeKey()); } catch (e) {} turns = []; renderAll(); }
  };
})();
