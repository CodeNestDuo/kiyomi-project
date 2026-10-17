/**
 * Kitsu tracker (PASSWORD GRANT + REFRESH + FULL LIST PAGINATION)
 * Kiyomi Tracking Provider Standard v1
 */
var id = "kitsu";

/** ===== CONFIG ===== */
var CONFIG = {
  get clientId() {
    return (typeof Kiyomi !== 'undefined' && Kiyomi.getSecret) 
      ? Kiyomi.getSecret("kitsu", "clientId") 
      : "dd031b32d2f56c990b1425efe6c42ad847e7fe3ab46bf1299f05ecd856bdb7dd";
  },
  get clientSecret() {
    return (typeof Kiyomi !== 'undefined' && Kiyomi.getSecret) 
      ? Kiyomi.getSecret("kitsu", "clientSecret") 
      : "54d7307928f63414defd96399fc31ba847961ceaecef3a5fd93144e960c0e151";
  },
  tokenUrl: "https://kitsu.io/api/oauth/token",
  apiBase: "https://kitsu.io/api/edge"
};
/** ---------- KV Storage Helpers ---------- */
function _kvKey(k) { return id + ":" + k; }
function _kvGet(k) { return (Kiyomi && Kiyomi.kvGet) ? (Kiyomi.kvGet(_kvKey(k)) || "") : ""; }
function _kvSet(k, v) { if (Kiyomi && Kiyomi.kvSet) Kiyomi.kvSet(_kvKey(k), v || ""); }

/** ---------- Auth Tokens ---------- */
function _access() { return _kvGet("access_token"); }
function _refresh() { return _kvGet("refresh_token"); }
function _setTokens(a, r) { _kvSet("access_token", a || ""); _kvSet("refresh_token", r || ""); }
function isAuthenticated() { var t = _access(); return !!t && t.length > 10; }

/** ---------- Standard Helpers ---------- */
function _safeJsonParse(s) { try { return JSON.parse(s || ""); } catch (e) { return null; } }
function _ok(data, msg) { return { ok: true, message: msg || "", data: data }; }
function _fail(msg, data) { return { ok: false, message: msg || "Failed", data: data }; }

function _bearerHeaders(extra) {
  var h = {
    "Authorization": "Bearer " + _access(),
    "Accept": "application/vnd.api+json"
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

function _qs(obj) {
  var parts = [];
  for (var k in obj) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === "") continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])));
  }
  return parts.join("&");
}

/** ---------- Status Mapping ---------- */
var _statusMapUiToKitsu = {
  "WATCHING": "current",
  "PLANNING": "planned",
  "COMPLETED": "completed",
  "ON_HOLD": "on_hold",
  "DROPPED": "dropped"
};

function _uiToKitsuStatus(s) {
  s = String(s || "").trim().toUpperCase();
  return _statusMapUiToKitsu[s] || "current";
}

function _kitsuToUiStatus(k) {
  k = String(k || "").trim().toLowerCase();
  for (var ui in _statusMapUiToKitsu) {
    if (_statusMapUiToKitsu[ui] === k) return ui;
  }
  return "WATCHING";
}

/** ---------- API Actions (run) ---------- */
function run(action, payload) {
  action = String(action || "").trim();
  payload = payload || {};

  if (action === "getCapabilities") {
    return _ok({
      id: id,
      name: "Kitsu",
      description: "Track anime & manga with Kitsu (kitsu.io).",
      icon: "https://kitsu.io/favicon.ico",
      login: { flows: ["credentials"], needs: ["username", "password"] },
      features: ["login", "getProfile", "getListPage", "getFullList", "getMediaInfo", "searchMedia", "updateMedia", "deleteMedia", "logout"]
    });
  }

  if (action === "isAuthenticated") return _ok(isAuthenticated());

  if (action === "login") {
    var form = {
      grant_type: "password",
      username: String(payload.username || "").trim(),
      password: String(payload.password || ""),
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret
    };
    var resp = Kiyomi.httpPostForm(CONFIG.tokenUrl, form, { "Accept": "application/json" });
    var j = _safeJsonParse(resp);
    if (!j || !j.access_token) return _fail("Login failed", j);
    _setTokens(j.access_token, j.refresh_token || "");
    return _ok({ authenticated: true });
  }

  if (action === "getProfile") {
    if (!isAuthenticated()) return _fail("Not authenticated");
    var url = CONFIG.apiBase + "/users?filter[self]=true";
    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j || !j.data || !j.data.length) return _fail("Profile fetch failed");
    var u = j.data[0];
    _kvSet("user_id", String(u.id));
    return _ok({
      username: u.attributes.name,
      avatar: u.attributes.avatar ? u.attributes.avatar.medium : "",
      userId: u.id
    });
  }

  if (action === "searchMedia") {
    var query = (payload.query || "").trim();
    if (!query) return _ok([]);
    var url = CONFIG.apiBase + "/anime?" + _qs({ "filter[text]": query, "page[limit]": 20 });
    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j || !j.data) return _fail("Search failed");

    return _ok(j.data.map(function(item) {
      var a = item.attributes;
      return {
        id: item.id,
        title: a.canonicalTitle,
        poster: a.posterImage ? a.posterImage.medium : null,
        status: "NOT TRACKED",
        episodes: a.episodeCount
      };
    }));
  }

  if (action === "getMediaInfo") {
    var animeId = payload.kitsuAnimeId || payload.id;
    if (!animeId) return _fail("Missing kitsuAnimeId");
    
    var url = CONFIG.apiBase + "/anime/" + String(animeId);
    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    if (!j || !j.data) return _fail("Media info fetch failed");
    
    var a = j.data.attributes;
    var userId = _kvGet("user_id");
    var entryId = null;
    var userStatus = "NOT TRACKED";
    var userProgress = 0;
    var userScore = 0;

    if (userId) {
        var entryUrl = CONFIG.apiBase + "/library-entries?" + _qs({ "filter[userId]": userId, "filter[animeId]": animeId });
        var entryResp = _safeJsonParse(Kiyomi.httpGet(entryUrl, _bearerHeaders()));
        if (entryResp && entryResp.data && entryResp.data.length) {
            var ent = entryResp.data[0];
            entryId = ent.id;
            userStatus = _kitsuToUiStatus(ent.attributes.status);
            userProgress = ent.attributes.progress || 0;
            userScore = ent.attributes.ratingTwenty ? (ent.attributes.ratingTwenty / 2) : 0;
        }
    }

    return _ok({
      id: j.data.id,
      kitsuLibraryEntryId: entryId,
      title: a.canonicalTitle,
      banner: a.coverImage ? (a.coverImage.large || a.coverImage.original) : null,
      poster: a.posterImage ? (a.posterImage.large || a.posterImage.medium) : null,
      description: a.synopsis,
      meanScore: a.averageRating ? (parseFloat(a.averageRating) / 10.0) : null,
      status: userStatus,
      progress: userProgress,
      score: userScore,
      format: a.subtype ? a.subtype.toUpperCase() : "TV",
      episodes: a.episodeCount
    });
  }

 if (action === "getListPage") {
    if (!isAuthenticated()) return _fail("Not authenticated");
    var userId = _kvGet("user_id");
    
    var params = {
      "filter[userId]": userId,
      "filter[kind]": "anime",
      "include": "anime",
      "page[limit]": payload.limit || 50,
      "page[offset]": payload.offset || 0
    };

    // ✅ MINOR FIX: Ensure status is mapped to kitsu's lowercase enums
    if (payload.status && String(payload.status).toUpperCase() !== "ALL") {
      var kitsuStatus = _uiToKitsuStatus(payload.status);
      if (kitsuStatus) params["filter[status]"] = kitsuStatus;
    }
    
    var url = CONFIG.apiBase + "/library-entries?" + _qs(params);
    var resp = Kiyomi.httpGet(url, _bearerHeaders());
    var j = _safeJsonParse(resp);
    
    if (!j || !j.data) return _fail("List page fetch failed");

    var animeMap = {};
    if (j.included) {
      j.included.forEach(function(inc) { 
        if (inc.type === "anime") animeMap[String(inc.id)] = inc; 
      });
    }

    var items = j.data.map(function(le) {
      var animeRel = (le.relationships && le.relationships.anime && le.relationships.anime.data) 
                     ? le.relationships.anime.data : null;
      var animeId = animeRel ? String(animeRel.id) : "";
      var a = animeMap[animeId] ? animeMap[animeId].attributes : {};

      return {
        id: animeId,
        kitsuLibraryEntryId: le.id,
        title: a.canonicalTitle || "Unknown",
        status: _kitsuToUiStatus(le.attributes.status),
        progress: le.attributes.progress || 0,
        total: a.episodeCount || 0,
        poster: a.posterImage ? a.posterImage.medium : "",
        score: le.attributes.ratingTwenty ? (le.attributes.ratingTwenty / 2) : 0
      };
    });

    return _ok({ 
      items: items, 
      hasNext: !!(j.links && j.links.next), 
      nextOffset: (parseInt(payload.offset) || 0) + items.length 
    });
  }

  if (action === "getFullList") {
    if (!isAuthenticated()) return _fail("Not authenticated");
    var items = [];
    var offset = 0;
    var hasNext = true;
    while(hasNext) {
        var res = run("getListPage", { status: payload.status, offset: offset, limit: 50 });
        if(!res.ok) break;
        items = items.concat(res.data.items);
        hasNext = res.data.hasNext;
        offset = res.data.nextOffset;
        if (items.length > 500) break; // Safety cap
    }
    return _ok(items);
  }

  if (action === "logout") { _setTokens("", ""); _kvSet("user_id", ""); return _ok(true); }
  return _fail("Unknown run action: " + action);
}

/** ---------- Tracking Mutations (track) ---------- */
function track(action, payload) {
  if (!isAuthenticated()) return _fail("Not authenticated");

  var animeId = payload.kitsuAnimeId || payload.id;
  var libraryEntryId = payload.kitsuLibraryEntryId || "";

  function _ensureEntryId(targetId) {
    if (libraryEntryId) return libraryEntryId;
    var userId = _kvGet("user_id");
    var url = CONFIG.apiBase + "/library-entries?" + _qs({ "filter[userId]": userId, "filter[animeId]": targetId });
    var j = _safeJsonParse(Kiyomi.httpGet(url, _bearerHeaders()));
    if (j && j.data && j.data.length) return j.data[0].id;
    
    var body = {
      data: {
        type: "libraryEntries",
        attributes: { status: "planned", progress: 0 },
        relationships: {
          user: { data: { type: "users", id: userId } },
          anime: { data: { type: "anime", id: targetId } }
        }
      }
    };
    var res = Kiyomi.httpRequest("POST", CONFIG.apiBase + "/library-entries", JSON.stringify(body), _bearerHeaders({"Content-Type": "application/vnd.api+json"}));
    var parsed = _safeJsonParse(res);
    return (parsed && parsed.data) ? parsed.data.id : null;
  }

  if (!libraryEntryId) libraryEntryId = _ensureEntryId(animeId);
  if (!libraryEntryId) return _fail("Could not resolve Kitsu Library Entry ID");

  var entryUrl = CONFIG.apiBase + "/library-entries/" + libraryEntryId;

  if (action === "updateMedia" || action === "changeScore" || action === "markWatched") {
    var attrs = {};
    if (payload.status) attrs.status = _uiToKitsuStatus(payload.status);
    if (payload.progress !== undefined) attrs.progress = parseInt(payload.progress, 10);
    if (payload.score !== undefined) attrs.ratingTwenty = Math.round(payload.score * 2);

    var body = { data: { type: "libraryEntries", id: libraryEntryId, attributes: attrs } };
    var resp = Kiyomi.httpRequest("PATCH", entryUrl, JSON.stringify(body), _bearerHeaders({ "Content-Type": "application/vnd.api+json" }));
    var j = _safeJsonParse(resp);
    if (!j || j.errors) return _fail("Kitsu Update Failed", j);
    return _ok(j.data);
  }

  if (action === "deleteMedia") {
    Kiyomi.httpRequest("DELETE", entryUrl, null, _bearerHeaders());
    return _ok(true, "Deleted from Kitsu");
  }

  return _fail("Unsupported track action");
}

globalThis.id = id;
globalThis.run = run;
globalThis.track = track;
globalThis.isAuthenticated = isAuthenticated;