/**
 * MyAnimeList tracker (KV-pinned PKCE, PLAIN + FULL LIST PAGINATION)
 * Kiyomi Tracking Provider Standard v1
 */
var id = "mal";

/** ===== CONFIG ===== */
var CONFIG = {
  clientId: "7d5a689cb882bc47b18205b8bfb1e7d0",
  clientSecret: "0d4530f4ff29e7ec792bd89a5edccf8deb31b70d185c9340a86dece4c10d630e",
  authBase: "https://myanimelist.net/v1/oauth2/authorize",
  tokenUrl: "https://myanimelist.net/v1/oauth2/token",
  apiBase: "https://api.myanimelist.net/v2",
  scopes: "write:users"
};

/** ---------- KV (namespaced) ---------- */
function _kvKey(k) { return id + ":" + k; }
function _kvGet(k) { return (Kiyomi && Kiyomi.kvGet) ? (Kiyomi.kvGet(_kvKey(k)) || "") : ""; }
function _kvSet(k, v) { if (Kiyomi && Kiyomi.kvSet) Kiyomi.kvSet(_kvKey(k), v || ""); }

/** ---------- Tokens ---------- */
function _access() { return _kvGet("access_token"); }
function _refresh() { return _kvGet("refresh_token"); }
function _setTokens(a, r) { _kvSet("access_token", a || ""); _kvSet("refresh_token", r || ""); }
function isAuthenticated() { var t = _access(); return !!t && t.length > 10; }

/** ---------- Helpers ---------- */
function _safeJsonParse(s) { try { return JSON.parse(s || ""); } catch (e) { return null; } }
function _ok(data, msg) { return { ok: true, message: msg || "", data: data }; }
function _fail(msg, data) { return { ok: false, message: msg || "Failed", data: data }; }
function _bearerHeaders() { return { "Authorization": "Bearer " + _access(), "Accept": "application/json" }; }

function _parseQueryLike(objOrString) {
  if (!objOrString) return {};
  if (typeof objOrString === "object") return objOrString;
  var s = String(objOrString);
  if (s[0] === "?") s = s.slice(1);
  var out = {};
  s.split("&").forEach(function (pair) {
    if (!pair) return;
    var i = pair.indexOf("=");
    var k = i >= 0 ? pair.slice(0, i) : pair;
    var v = i >= 0 ? pair.slice(i + 1) : "";
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return out;
}

/** ---------- Status mapping ---------- */
var _statusMapUiToMal = {
  "WATCHING": "watching",
  "PLANNING": "plan_to_watch",
  "COMPLETED": "completed",
  "ON_HOLD": "on_hold",
  "DROPPED": "dropped"
};
function _uiToMalStatus(s) {
  s = String(s || "").trim().toUpperCase();
  return _statusMapUiToMal[s] || "";
}
function _malToUiStatus(mal) {
  mal = String(mal || "").trim().toLowerCase();
  for (var k in _statusMapUiToMal) {
    if (_statusMapUiToMal[k] === mal) return k;
  }
  return "WATCHING";
}

/** ---------- OAuth / run() ---------- */
function run(action, payload) {
  action = String(action || "").trim();
  payload = payload || {};

  if (action === "getCapabilities") {
    return _ok({
      id: id,
      name: "MyAnimeList",
      description: "Organize your anime and manga list, and participate in the world's largest community.",
      icon: "hhttps://kiyomi-project.pages.dev/icons/myanimelist_logo.png", 
      login: {
        flows: ["webview"],
        pkce: true,
        needs: ["codeChallenge", "codeVerifier", "state", "codeChallengeMethod"],
        notes: "MAL PKCE uses plain (challenge == verifier). Provider pins verifier/state to KV."
      },
      features: ["getProfile", "getListPage","getFullList", "updateAnime", "markWatched", "deleteAnime", "logout"]
    });
  }

  if (action === "isAuthenticated") return _ok(isAuthenticated());

  if (action === "getAuthUrl") {
    var redirectUri = (payload.redirectUri || "").trim();
    var codeChallenge = (payload.codeChallenge || "").trim();
    var codeVerifier = (payload.codeVerifier || payload.code_verifier || "").trim();
    var state = (payload.state || "").trim();

    if (!CONFIG.clientId) return _fail("CONFIG.clientId missing");
    if (!redirectUri) return _fail("Missing redirectUri");
    if (!codeChallenge) return _fail("Missing codeChallenge");
    if (!codeVerifier) return _fail("Missing codeVerifier");
    if (!state) return _fail("Missing state");

    // MAL: plain PKCE only
    var method = "plain";

    // PIN for finalizeAuth
    _kvSet("pkce_state", state);
    _kvSet("pkce_verifier", codeVerifier);
    _kvSet("redirect_uri", redirectUri);

    var url =
      CONFIG.authBase +
      "?response_type=code" +
      "&client_id=" + encodeURIComponent(CONFIG.clientId) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&code_challenge=" + encodeURIComponent(codeChallenge) +
      "&code_challenge_method=" + encodeURIComponent(method) +
      "&state=" + encodeURIComponent(state);

    if ((CONFIG.scopes || "").trim()) url += "&scope=" + encodeURIComponent(CONFIG.scopes.trim());
    return _ok({ url: url });
  }

  if (action === "finalizeAuth") {
    var queryObj = _parseQueryLike(payload.query);
    var code = queryObj.code || "";
    if (!code) return _fail("No code in callback query", { query: queryObj });

    var gotState = (queryObj.state || "").trim();
    var expectedState = (_kvGet("pkce_state") || "").trim();
    if (expectedState && gotState && expectedState !== gotState) {
      return _fail("State mismatch", { expected: expectedState, got: gotState });
    }

    var redirectUri = (payload.redirectUri || _kvGet("redirect_uri") || "").trim();
    var verifier = (_kvGet("pkce_verifier") || "").trim();
    if (!CONFIG.clientId) return _fail("CONFIG.clientId missing");
    if (!redirectUri) return _fail("Missing redirectUri");
    if (!verifier) return _fail("Missing codeVerifier (pinned verifier missing)");

    var form = {
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret || "",
      grant_type: "authorization_code",
      code: code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    };

    var resp = Kiyomi.httpPostForm(CONFIG.tokenUrl, form, { "Accept": "application/json" });
    var j = _safeJsonParse(resp);
    if (!j || !j.access_token) {
      return _fail("Token exchange failed", { raw: resp, parsed: j });
    }

    _setTokens(j.access_token, j.refresh_token || "");

    // clear pins
    _kvSet("pkce_state", "");
    _kvSet("pkce_verifier", "");
    _kvSet("redirect_uri", "");

    return _ok({ authenticated: true }, "MAL connected");
  }

  if (action === "getProfile") {
    if (!isAuthenticated()) return _fail("Not authenticated");
    var url = CONFIG.apiBase + "/users/@me?fields=anime_statistics,picture";
    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j || !j.name) return _fail("Profile fetch failed", { raw: resp, parsed: j });
    return _ok({ username: j.name, avatar: j.picture || "", stats: j.anime_statistics || {} });
  }


  if (action === "getListPage") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    var limit = payload.limit != null ? parseInt(payload.limit, 10) : 100;
    if (!limit || limit < 1) limit = 100;

    var offset = payload.offset != null ? parseInt(payload.offset, 10) : 0;
    if (offset < 0) offset = 0;

    var malStatus = payload.status ? _uiToMalStatus(payload.status) : "";
    var fields = "list_status,num_episodes,main_picture,mean,alternative_titles";

    var url =
      CONFIG.apiBase +
      "/users/@me/animelist?limit=" + encodeURIComponent(String(limit)) +
      "&offset=" + encodeURIComponent(String(offset)) +
      "&fields=" + encodeURIComponent(fields);

    if (malStatus) url += "&status=" + encodeURIComponent(malStatus);

    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j || !j.data) {
      return _fail("List page fetch failed", { raw: resp, parsed: j, url: url });
    }

    var items = [];
    for (var i = 0; i < j.data.length; i++) {
      var item = j.data[i] || {};
      var node = item.node || {};
      var ls = item.list_status || {};

      items.push({
        id: node.id,
        title: node.title || "",
        status: _malToUiStatus(ls.status),
        progress: ls.num_episodes_watched != null ? ls.num_episodes_watched : 0,
        total: node.num_episodes != null ? node.num_episodes : 0,
        poster: (node.main_picture && node.main_picture.medium) ? node.main_picture.medium : "",
        score: ls.score != null ? ls.score : 0,
        mean: node.mean != null ? node.mean : null
      });
    }

    var hasNext = false;
    if (j.paging && j.paging.next) hasNext = true;

    return _ok({
      items: items,
      offset: offset,
      limit: limit,
      nextOffset: offset + items.length,
      hasNext: hasNext
    });
  }


  /**
   * ✅ getFullList with pagination
   * payload:
   *  - status: "WATCHING"/"PLANNING"/"COMPLETED"/"ON_HOLD"/"DROPPED" (optional)
   *  - limit: number per page (optional, default 100)
   *  - maxPages: safety cap (optional, default 30)
   */
  if (action === "getFullList") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    var limit = payload.limit != null ? parseInt(payload.limit, 10) : 100;
    if (!limit || limit < 1) limit = 100;

    var maxPages = payload.maxPages != null ? parseInt(payload.maxPages, 10) : 30;
    if (!maxPages || maxPages < 1) maxPages = 30;

    var malStatus = payload.status ? _uiToMalStatus(payload.status) : "";
    var fields = "list_status,num_episodes,main_picture,mean,alternative_titles";

    var base =
      CONFIG.apiBase +
      "/users/@me/animelist?limit=" + encodeURIComponent(String(limit)) +
      "&fields=" + encodeURIComponent(fields);

    if (malStatus) base += "&status=" + encodeURIComponent(malStatus);

    var items = [];
    var nextUrl = base;
    var pageNo = 0;

    while (nextUrl && pageNo < maxPages) {
      pageNo++;

      var resp = Kiyomi.httpGet(nextUrl, _bearerHeaders());
      var j = _safeJsonParse(resp);
      if (!j || !j.data) {
        return _fail("List fetch failed", { raw: resp, parsed: j, page: pageNo, next: nextUrl });
      }

      for (var i = 0; i < j.data.length; i++) {
        var item = j.data[i] || {};
        var node = item.node || {};
        var ls = item.list_status || {};

        items.push({
          id: node.id,
          title: node.title || "",
          status: _malToUiStatus(ls.status),
          progress: ls.num_episodes_watched != null ? ls.num_episodes_watched : 0,
          total: node.num_episodes != null ? node.num_episodes : 0,
          poster: (node.main_picture && node.main_picture.medium) ? node.main_picture.medium : "",
          score: ls.score != null ? ls.score : 0,
          mean: node.mean != null ? node.mean : null
        });
      }

      nextUrl = (j.paging && j.paging.next) ? String(j.paging.next) : "";
    }

    return _ok(items);
  }

  if (action === "logout") {
    _setTokens("", "");
    return _ok(true, "Logged out");
  }

  return _fail("Unknown run action: " + action);
}

/** ---------- track() ---------- */
function track(action, payload) {
  action = String(action || "").trim();
  payload = payload || {};
  if (!isAuthenticated()) return _fail("Not authenticated");

  if (action === "updateAnime") {
    var animeId = payload.malAnimeId || payload.id;
    if (!animeId) return _fail("Missing malAnimeId");

    var form = {};
    if (payload.episode != null) form.num_watched_episodes = String(payload.episode);
    if (payload.status) {
      // allow UI enum or raw MAL string
      var ms = _uiToMalStatus(payload.status) || String(payload.status).toLowerCase();
      form.status = ms;
    }
    if (payload.score != null) form.score = String(payload.score);

    var url = CONFIG.apiBase + "/anime/" + String(animeId) + "/my_list_status";
    var resp = Kiyomi.httpPostForm(url, form, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j) return _fail("Update failed", { raw: resp, parsed: j });
    return _ok(j);
  }

  if (action === "deleteAnime") {
    var animeId2 = payload.malAnimeId || payload.id;
    if (!animeId2) return _fail("Missing malAnimeId");
    var url2 = CONFIG.apiBase + "/anime/" + String(animeId2) + "/my_list_status";
    var resp2 = Kiyomi.httpRequest("DELETE", url2, null, _bearerHeaders());
    // MAL returns 204 often -> bridge may return "" : treat as success
    return _ok(true, "Deleted from MAL", { raw: resp2 });
  }

  if (action === "markWatched") {
    return track("updateAnime", {
      malAnimeId: payload.malAnimeId || payload.id,
      episode: payload.episode,
      status: "WATCHING"
    });
  }

  return _fail("Unsupported track action: " + action);
}

/** ---- exports ---- */
globalThis.id = id;
globalThis.run = run;
globalThis.track = track;
globalThis.isAuthenticated = isAuthenticated;
