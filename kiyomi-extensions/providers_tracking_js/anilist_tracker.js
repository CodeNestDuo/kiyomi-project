/**
 * AniList tracker (Authorization Code flow) - Kiyomi Tracking Provider Standard v1
 *
 * Fixes webview blank screen by avoiding implicit token (#access_token).
 * Uses:
 *   - getAuthUrl -> /authorize?response_type=code
 *   - finalizeAuth -> exchanges code at /oauth/token
 *
 * Adds:
 *   - getListPage (paged)
 *   - getFullList (loops pages)
 */

var id = "anilist";

var CONFIG = {
  clientId: "35770",
  clientSecret: "jtZRpz5LW0Zvq1LyG0YmUYenGlvCjWLcCsF5Atxi",
  authBase: "https://anilist.co/api/v2/oauth/authorize",
  tokenUrl: "https://anilist.co/api/v2/oauth/token",
  apiBase: "https://graphql.anilist.co",
  scopes: "" // optional
};

/** ---------- KV (namespaced) ---------- */
function _kvKey(k) { return id + ":" + k; }
function _kvGet(k) { return (Kiyomi && Kiyomi.kvGet) ? (Kiyomi.kvGet(_kvKey(k)) || "") : ""; }
function _kvSet(k, v) { if (Kiyomi && Kiyomi.kvSet) Kiyomi.kvSet(_kvKey(k), v || ""); }

function _token() { return _kvGet("access_token"); }
function _setToken(t) { _kvSet("access_token", t || ""); }

function isAuthenticated() {
  var t = _token();
  return !!t && t.length > 10;
}

/** ---------- Helpers ---------- */
function _safeJsonParse(s) { try { return JSON.parse(s || ""); } catch (e) { return null; } }
function _ok(data, msg) { return { ok: true, message: msg || "", data: data }; }
function _fail(msg, data) { return { ok: false, message: msg || "Failed", data: data }; }

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

function _bearerHeaders() {
  return { "Authorization": "Bearer " + _token(), "Accept": "application/json", "Content-Type": "application/json" };
}

function _gql(query, variables) {
  var body = JSON.stringify({ query: query, variables: variables || {} });
  var headers = { "Accept": "application/json", "Content-Type": "application/json" };
  if (isAuthenticated()) headers["Authorization"] = "Bearer " + _token();
  var resp = Kiyomi.httpRequest("POST", CONFIG.apiBase, body, headers);
  return _safeJsonParse(resp);
}

/** ---------- Status mapping ---------- */
var _statusMapUiToAni = {
  "WATCHING": "CURRENT",
  "PLANNING": "PLANNING",
  "COMPLETED": "COMPLETED",
  "ON_HOLD": "PAUSED",
  "DROPPED": "DROPPED"
};
function _uiToAniStatus(s) {
  s = String(s || "").trim().toUpperCase();
  return _statusMapUiToAni[s] || null;
}
function _aniToUiStatus(s) {
  s = String(s || "").trim().toUpperCase();
  for (var k in _statusMapUiToAni) if (_statusMapUiToAni[k] === s) return k;
  return "WATCHING";
}

function _mapListEntry(e) {
  e = e || {};
  var m = e.media || {};
  var titleObj = m.title || {};
  var title = titleObj.english || titleObj.romaji || titleObj.native || "";
  var poster = (m.coverImage && m.coverImage.medium) ? m.coverImage.medium : "";
  return {
    id: m.id,
    title: title,
    status: _aniToUiStatus(e.status),
    progress: e.progress || 0,
    total: (m.episodes != null) ? m.episodes : null,
    poster: poster
  };
}

/** ---------- run(action,payload) ---------- */
function run(action, payload) {
  action = String(action || "").trim();
  payload = payload || {};

  if (action === "getCapabilities") {
    return _ok({
      id: id,
      name: "Anilist",
      description: "AniList is a community-driven anime and manga database and tracking site known for its modern interface and flexible customization options, including different rating scales. ",
      icon: "hhttps://kiyomi-project.pages.dev/icons/anilist_logo.svg", 
      login: {
        flows: ["webview", "browser_loopback"],
        needs: ["state"], // engine supplies state; you already do this in Python
        notes: "Uses Authorization Code flow (no implicit token). Engine provides redirectUri + state."
      },
      features: ["getProfile", "getListPage", "getFullList", "updateAnime", "markWatched", "deleteAnime", "logout"]
    });
  }

  if (action === "isAuthenticated") return _ok(isAuthenticated());

  if (action === "getAuthUrl") {
    var redirectUri = String(payload.redirectUri || "").trim();
    var state = String(payload.state || "").trim();

    if (!CONFIG.clientId) return _fail("CONFIG.clientId missing");
    if (!CONFIG.clientSecret) return _fail("CONFIG.clientSecret missing");
    if (!redirectUri) return _fail("Missing redirectUri");
    if (!state) return _fail("Missing state");

    // Pin state+redirect for finalizeAuth validation
    _kvSet("oauth_state", state);
    _kvSet("redirect_uri", redirectUri);

    var url =
      CONFIG.authBase +
      "?client_id=" + encodeURIComponent(CONFIG.clientId) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&response_type=code" +
      "&state=" + encodeURIComponent(state);

    if ((CONFIG.scopes || "").trim()) url += "&scope=" + encodeURIComponent(CONFIG.scopes.trim());
    return _ok({ url: url });
  }

  if (action === "finalizeAuth") {
    var queryObj = _parseQueryLike(payload.query);
    var code = String(queryObj.code || "").trim();
    var gotState = String(queryObj.state || "").trim();

    if (!code) return _fail("No code in callback query", { query: queryObj });

    var expectedState = String(_kvGet("oauth_state") || "").trim();
    if (expectedState && gotState && expectedState !== gotState) {
      return _fail("State mismatch", { expected: expectedState, got: gotState });
    }

    var redirectUri = String(payload.redirectUri || _kvGet("redirect_uri") || "").trim();
    if (!redirectUri) return _fail("Missing redirectUri");

    var body = JSON.stringify({
      grant_type: "authorization_code",
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      redirect_uri: redirectUri,
      code: code
    });

    var resp = Kiyomi.httpRequest("POST", CONFIG.tokenUrl, body, {
      "Accept": "application/json",
      "Content-Type": "application/json"
    });

    var j = _safeJsonParse(resp);
    if (!j || !j.access_token) {
      return _fail("Token exchange failed", { raw: resp, parsed: j });
    }

    _setToken(j.access_token);

    // clear pins
    _kvSet("oauth_state", "");
    _kvSet("redirect_uri", "");

    return _ok({ authenticated: true }, "AniList connected");
  }

  if (action === "getProfile") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    var q2 = "query { Viewer { name avatar { medium } statistics { anime { count episodesWatched } } } }";
    var j2 = _gql(q2, {});
    if (!j2 || !j2.data || !j2.data.Viewer) return _fail("Profile fetch failed", j2);

    var v = j2.data.Viewer;
    return _ok({
      username: v.name,
      avatar: v.avatar ? v.avatar.medium : "",
      stats: (v.statistics && v.statistics.anime) ? v.statistics.anime : {}
    });
  }

  if (action === "getListPage") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    var page = payload.page != null ? parseInt(payload.page, 10) : 1;
    if (!page || page < 1) page = 1;

    var perPage = payload.perPage != null ? parseInt(payload.perPage, 10) : 25;
    if (!perPage || perPage < 1) perPage = 25;
    if (perPage > 50) perPage = 50;

    var target = payload.status ? _uiToAniStatus(payload.status) : null;

    var q =
      "query($page:Int,$perPage:Int,$status:MediaListStatus){ " +
      "  Page(page:$page, perPage:$perPage){ " +
      "    pageInfo{ currentPage hasNextPage lastPage perPage total } " +
      "    mediaList(status:$status, type:ANIME){ progress status media{ id title{ english romaji native } episodes coverImage{ medium } } } " +
      "  } " +
      "}";

    var j = _gql(q, { page: page, perPage: perPage, status: target });
    if (!j || j.errors || !j.data || !j.data.Page) return _fail("List page fetch failed", j);

    var p = j.data.Page;
    var info = p.pageInfo || {};
    var list = p.mediaList || [];
    var items = list.map(_mapListEntry);

    return _ok({
      items: items,
      page: info.currentPage || page,
      perPage: info.perPage || perPage,
      hasNext: !!info.hasNextPage,
      nextPage: info.hasNextPage ? (page + 1) : null,
      total: info.total != null ? info.total : null,
      lastPage: info.lastPage != null ? info.lastPage : null
    });
  }

  if (action === "getFullList") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    var perPage2 = payload.perPage != null ? parseInt(payload.perPage, 10) : 50;
    if (!perPage2 || perPage2 < 1) perPage2 = 50;
    if (perPage2 > 50) perPage2 = 50;

    var maxPages = payload.maxPages != null ? parseInt(payload.maxPages, 10) : 30;
    if (!maxPages || maxPages < 1) maxPages = 30;

    var all = [];
    var pageNo = 1;

    while (pageNo <= maxPages) {
      var r = run("getListPage", { status: payload.status, page: pageNo, perPage: perPage2 });
      if (!r || !r.ok || !r.data) return _fail("List fetch failed", { page: pageNo, result: r });

      var batch = r.data.items || [];
      for (var i = 0; i < batch.length; i++) all.push(batch[i]);

      if (!r.data.hasNext) break;
      pageNo++;
    }

    return _ok(all);
  }

  if (action === "logout") {
    _setToken("");
    return _ok(true, "Logged out");
  }

  return _fail("Unknown run action: " + action);
}

/** ---------- track(action,payload) ---------- */
function track(action, payload) {
  action = String(action || "").trim();
  payload = payload || {};
  if (!isAuthenticated()) return _fail("Not authenticated");

  if (action === "updateAnime") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    var q =
      "mutation($mediaId:Int,$progress:Int,$status:MediaListStatus){ " +
      "  SaveMediaListEntry(mediaId:$mediaId, progress:$progress, status:$status){ id progress status } " +
      "}";

    var st = payload.status ? (_uiToAniStatus(payload.status) || String(payload.status).toUpperCase()) : "CURRENT";

    var vars = {
      mediaId: parseInt(mediaId, 10),
      progress: (payload.episode != null) ? parseInt(payload.episode, 10) : null,
      status: st
    };

    var j = _gql(q, vars);
    if (!j || j.errors) return _fail("AniList update failed", j);
    return _ok(j.data.SaveMediaListEntry);
  }

    if (action === "deleteAnime") {
    var entryId = payload.entryId;
    var mediaId2 = payload.anilistMediaId || payload.id;

    if (!entryId && !mediaId2) return _fail("Missing entryId or anilistMediaId");

    if (!entryId && mediaId2) {
      var qFind = "query($mediaId:Int){ MediaList(mediaId:$mediaId, type:ANIME){ id } }";
      var found = _gql(qFind, { mediaId: parseInt(mediaId2, 10) });
      if (!found || found.errors || !found.data || !found.data.MediaList) {
        return _fail("Could not find list entry", found);
      }
      entryId = found.data.MediaList.id;
    }

    var qDel = "mutation($id:Int){ DeleteMediaListEntry(id:$id){ deleted } }";
    var jDel = _gql(qDel, { id: parseInt(entryId, 10) });
    if (!jDel || jDel.errors) return _fail("Delete failed", jDel);
    return _ok(jDel.data.DeleteMediaListEntry, "Deleted from AniList");
  }

  if (action === "markWatched") {
    return track("updateAnime", {
      anilistMediaId: payload.anilistMediaId || payload.id,
      episode: payload.episode,
      status: "WATCHING"
    });
  }

  return _fail("Unsupported track action: " + action);
}

globalThis.id = id;
globalThis.run = run;
globalThis.track = track;
globalThis.isAuthenticated = isAuthenticated;
