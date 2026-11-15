/* GitHub 로그인. 누구나 로그인할 수 있지만, 글쓰기 메뉴는 블로그 주인에게만 보여요.
   실제 권한 검사는 서버(worker/)가 해요. 여기서는 화면만 바꿔요. */
(function () {
  "use strict";

  var C = window.COURSE || {};
  var cfg = C.config || {};
  var API = String(cfg.apiBase || "").replace(/\/+$/, "");
  var KEY = "cs_session";

  function readToken() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function saveToken(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // 로그인하고 돌아오면 주소 끝에 #token=... 이 붙어 있어요. 저장하고 바로 지워요.
  (function takeTokenFromHash() {
    var m = /(?:^#|&)token=([A-Za-z0-9_\-.]+)/.exec(location.hash || "");
    if (!m) return;
    saveToken(m[1]);
    history.replaceState(null, "", location.pathname + location.search);
  })();

  function decode(token) {
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var json = decodeURIComponent(atob(part).split("").map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(""));
      var s = JSON.parse(json);
      if (!s.exp || s.exp * 1000 < Date.now()) return null;
      return s;
    } catch (e) { return null; }
  }

  var listeners = [];
  var state = { ready: false, user: null };
  var token = readToken();
  var guess = token ? decode(token) : null;
  if (token && !guess) { clearToken(); token = ""; }

  function loginUrl(returnTo) {
    var ret = returnTo || (location.pathname + location.search);
    return API + "/auth/login?return=" + encodeURIComponent(ret);
  }

  function logout() {
    clearToken();
    token = "";
    set(null);
  }

  /** 서버에 요청할 때 로그인 토큰을 붙여요. 실패하면 서버가 보낸 한국어 메시지로 에러를 던져요. */
  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok) return data;
        if (res.status === 401) logout();
        var err = new Error(data.error || "서버가 응답하지 않아요 (" + res.status + ").");
        err.status = res.status;
        throw err;
      });
    }, function () {
      var err = new Error("글쓰기 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
      err.status = 0;
      throw err;
    });
  }

  /* ── 머리말 메뉴 ─────────────────────────────── */
  var slot = document.getElementById("auth-slot");

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  function render() {
    var u = state.user;
    document.querySelectorAll(".owner-only").forEach(function (n) { n.hidden = !(u && u.role === "owner"); });
    if (!slot) return;
    slot.textContent = "";
    if (!API) { slot.hidden = true; return; }
    slot.hidden = false;
    if (!u) {
      slot.appendChild(el("a", { "class": "auth-login", href: loginUrl() }, "로그인"));
      return;
    }
    if (u.role === "owner") {
      var w = el("a", { "class": "auth-write", href: cfg.writeUrl || "/write/" }, "글쓰기");
      if (document.body.classList.contains("page-write")) w.setAttribute("aria-current", "page");
      slot.appendChild(w);
    }
    var who = el("span", { "class": "auth-who", title: u.role === "owner" ? "블로그 주인" : "구경 온 손님" });
    if (u.avatar) {
      var img = el("img", { src: u.avatar + (u.avatar.indexOf("?") === -1 ? "?" : "&") + "s=48", alt: "", width: "22", height: "22" });
      who.appendChild(img);
    }
    who.appendChild(el("span", { "class": "auth-name" }, u.login));
    slot.appendChild(who);
    var out = el("button", { type: "button", "class": "auth-logout" }, "로그아웃");
    out.addEventListener("click", logout);
    slot.appendChild(out);
  }

  function set(user) {
    state.user = user;
    state.ready = true;
    render();
    listeners.slice().forEach(function (fn) { fn(user); });
  }

  // 토큰 속 정보로 먼저 그리고, 서버에 한 번 더 확인해요.
  if (guess) { state.user = { id: guess.sub, login: guess.login, avatar: guess.avatar, role: guess.role }; }
  render();
  if (API && token) {
    api("/api/me").then(set, function (e) {
      // 서버에 닿지 못했을 때는 토큰 정보를 그대로 믿고 화면만 그려요. 권한은 어차피 서버가 다시 확인해요.
      set(e.status === 0 ? state.user : null);
    });
  } else {
    set(null);
  }

  window.BlogAuth = {
    enabled: !!API,
    api: api,
    loginUrl: loginUrl,
    logout: logout,
    /** 로그인 확인이 끝나면(이미 끝났으면 바로) fn(user)을 불러요. 로그인 상태가 바뀔 때마다 다시 불러요. */
    onChange: function (fn) { listeners.push(fn); if (state.ready) fn(state.user); },
    user: function () { return state.user; }
  };
})();
