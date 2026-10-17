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

/** ===== CONFIG ===== */
var CONFIG = {
  get clientId() {
    return (typeof Kiyomi !== 'undefined' && Kiyomi.getSecret) 
      ? Kiyomi.getSecret("anilist", "clientId") 
      : "35770";
  },
  get clientSecret() {
    return (typeof Kiyomi !== 'undefined' && Kiyomi.getSecret) 
      ? Kiyomi.getSecret("anilist", "clientSecret") 
      : "jtZRpz5LW0Zvq1LyG0YmUYenGlvCjWLcCsF5Atxi";
  },
  authBase: "https://anilist.co/api/v2/oauth/authorize",
  tokenUrl: "https://anilist.co/api/v2/oauth/token",
  apiBase: "https://graphql.anilist.co",
  scopes: ""
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
    poster: poster,
    score: e.score || 0,
    isFavorite: !!m.isFavourite
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
      icon: "https://kiyomi-project.pages.dev/icons/anilist_logo.svg",
      login: {
        flows: ["webview", "browser_loopback"],
        needs: ["state"], // engine supplies state; you already do this in Python
        notes: "Uses Authorization Code flow (no implicit token). Engine provides redirectUri + state."
      },
      features: ["getProfile", "getListPage", "getFullList", "getMediaInfo", "updateMedia", "markWatched", "deleteMedia", "toggleFavorite", "changeScore", "getReviewUrl", "logout"],
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

    var q2 = "query { Viewer { id name avatar { medium } statistics { anime { count episodesWatched } } } }";
    var j2 = _gql(q2, {});
    if (!j2 || !j2.data || !j2.data.Viewer) return _fail("Profile fetch failed", j2);

    var v = j2.data.Viewer;
    _kvSet("user_id", v.id); // Ensure ID is pinned to KV

    return _ok({
      username: v.name,
      avatar: v.avatar ? v.avatar.medium : "",
      stats: (v.statistics && v.statistics.anime) ? v.statistics.anime : {}
    });
  }

  if (action === "searchMedia") {
    var query = (payload.query || "").trim();
    if (!query) return _ok([]);

    var q = 
      "query($search:String){ " +
      "  Page(page:1, perPage:20){ " +
      "    media(search:$search, type:ANIME){ " +
      "      id title{ english romaji native } episodes status format description " +
      "      meanScore coverImage{ large } bannerImage " +
      "    } " +
      "  } " +
      "}";

    var j = _gql(q, { search: query });
    if (!j || !j.data || !j.data.Page) return _fail("Search failed", j);

    var items = j.data.Page.media.map(function(m) {
      return {
        id: m.id,
        title: m.title.english || m.title.romaji || m.title.native,
        banner: m.bannerImage,
        poster: m.coverImage.large,
        description: m.description,
        meanScore: m.meanScore ? m.meanScore / 10 : null,
        status: m.status,
        format: m.format,
        episodes: m.episodes
      };
    });
    return _ok(items);
  }

  if (action === "getMediaInfo") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    var q =
      "query($id:Int){ " +
      "  Media(id:$id, type:ANIME){ " +
      "    id title{ english romaji native } episodes status format description " +
      "    meanScore isFavourite coverImage{ extraLarge } bannerImage " +
      "    nextAiringEpisode{ episode airingAt } " +
      "  } " +
      "}";

    var j = _gql(q, { id: parseInt(mediaId, 10) });
    if (!j || j.errors || !j.data || !j.data.Media) return _fail("Media fetch failed", j);

    var m = j.data.Media;
    return _ok({
      id: m.id,
      title: m.title.english || m.title.romaji || m.title.native,
      banner: m.bannerImage,
      poster: m.coverImage.extraLarge,
      description: m.description,
      meanScore: m.meanScore ? m.meanScore / 10 : null, // Normalize 85 -> 8.5
      status: m.status,
      format: m.format,
      episodes: m.episodes,
      isFavorite: !!m.isFavourite,
      nextEpisode: m.nextAiringEpisode ? {
        number: m.nextAiringEpisode.episode,
        airingAt: m.nextAiringEpisode.airingAt
      } : null
    });
  }

  if (action === "getListPage") {
    if (!isAuthenticated()) return _fail("Not authenticated");

    // 1. Get the cached User ID from KV (set during login/profile fetch)
    var userId = _kvGet("user_id");

    // 2. Fallback: If not in KV, fetch it via Viewer query first
    if (!userId) {
      var v = _gql("query { Viewer { id } }", {});
      if (v && v.data && v.data.Viewer) {
        userId = v.data.Viewer.id;
        _kvSet("user_id", userId); // Cache it for next time
      } else {
        return _fail("Could not determine User ID for list fetch", v);
      }
    }

    var page = payload.page != null ? parseInt(payload.page, 10) : 1;
    var perPage = payload.perPage != null ? parseInt(payload.perPage, 10) : 25;
    var target = payload.status ? _uiToAniStatus(payload.status) : null;

    var q =
      "query($page:Int, $perPage:Int, $userId:Int, $status:MediaListStatus){ " +
      "  Page(page:$page, perPage:$perPage){ " +
      "    pageInfo{ currentPage hasNextPage total } " +
      "    mediaList(userId:$userId, status:$status, type:ANIME){ " +
      "      progress status score(format:POINT_10_DECIMAL) " +
      "      media{ " +
      "        id isFavourite title{ english romaji native } " +
      "        episodes coverImage{ medium } " +
      "      } " +
      "    } " +
      "  } " +
      "}";

    var j = _gql(q, { page: page, perPage: perPage, userId: parseInt(userId), status: target });

    if (!j || j.errors || !j.data || !j.data.Page) return _fail("List fetch failed", j);

    var list = j.data.Page.mediaList || [];
    return _ok({
      items: list.map(_mapListEntry),
      page: j.data.Page.pageInfo.currentPage,
      hasNext: !!j.data.Page.pageInfo.hasNextPage,
      total: j.data.Page.pageInfo.total
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

  if (action === "getReviewUrl") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    // Direct link to the 'Edit' tab on the media page
    var url = "https://anilist.co/review/editor/" + mediaId;
    return _ok({ url: url });
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

  // --- 1 & 2) Unified Media Update (Status, Progress, Score) ---
  if (action === "updateMedia" || action === "changeScore") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    // We define all possible variables. AniList handles nulls gracefully.
    // Note: forcing POINT_10_DECIMAL in the return to match our Common Schema.
    var q =
      "mutation($mediaId:Int, $progress:Int, $status:MediaListStatus, $score:Float){ " +
      "  SaveMediaListEntry(mediaId:$mediaId, progress:$progress, status:$status, score:$score){ " +
      "    id progress status score(format: POINT_10_DECIMAL) " + 
      "  } " +
      "}";

    var vars = {
      mediaId: parseInt(mediaId, 10),
      progress: payload.progress !== undefined ? parseInt(payload.progress, 10) : (payload.episode !== undefined ? parseInt(payload.episode, 10) : null),
      status: payload.status ? (_uiToAniStatus(payload.status) || payload.status) : null,
      score: payload.score !== undefined ? parseFloat(payload.score) : null
    };

    var j = _gql(q, vars);
    if (!j || j.errors) return _fail("AniList update failed", j);
    
    // Normalize return for the Python local_sync
    var res = j.data.SaveMediaListEntry;
    return _ok({
      id: res.id,
      progress: res.progress,
      status: _aniToUiStatus(res.status),
      score: res.score
    });
  }

  // --- 3) Favorite Toggle ---
  if (action === "toggleFavorite") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    var q = "mutation($id:Int){ ToggleFavourite(animeId:$id){ anime { nodes { id isFavourite } } } }";

    var j = _gql(q, { id: parseInt(mediaId, 10) });
    if (!j || j.errors || !j.data) return _fail("Toggle favorite failed", j);
    
    // Check if the ID is now in the favourite nodes list
    var nodes = (j.data.ToggleFavourite.anime && j.data.ToggleFavourite.anime.nodes) ? j.data.ToggleFavourite.anime.nodes : [];
    var isFav = nodes.some(function(n) { return n.id === parseInt(mediaId, 10); });
    
    return _ok({ isFavorite: isFav });
  }

  // --- 4) Delete Media ---
  if (action === "deleteMedia") {
    var mediaId = payload.anilistMediaId || payload.id;
    if (!mediaId) return _fail("Missing anilistMediaId");

    // We first need the internal List Entry ID to delete
    var qFind = "query($mediaId:Int){ MediaList(mediaId:$mediaId, isViewer:true){ id } }";
    var found = _gql(qFind, { mediaId: parseInt(mediaId, 10) });
    
    if (!found || !found.data || !found.data.MediaList) {
      return _fail("Item not found in your list");
    }

    var entryId = found.data.MediaList.id;
    var qDel = "mutation($id:Int){ DeleteMediaListEntry(id:$id){ deleted } }";
    var jDel = _gql(qDel, { id: parseInt(entryId, 10) });
    
    if (!jDel || jDel.errors) return _fail("Delete failed", jDel);
    return _ok(true, "Deleted from AniList");
  }

  // --- 5) Mark Watched Wrapper ---
  if (action === "markWatched") {
    return track("updateMedia", {
      id: payload.anilistMediaId || payload.id,
      progress: payload.progress || payload.episode,
      status: "WATCHING"
    });
  }

  return _fail("Unsupported track action: " + action);
}

globalThis.id = id;
globalThis.run = run;
globalThis.track = track;
globalThis.isAuthenticated = isAuthenticated;
