// ==KiyomiExtension==
// @id           bitsearch-api-js
// @name         BitSearch.to (API, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://bitsearch.to/icons/favicon-bitsearch.ico
// @site         https://bitsearch.to
// @package      bitsearch.to
// @type         json-api
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  BitSearch.to JSON API integration for Kiyomi JS engine (supports optional API key).
// @primaryCategory general
// @extraCategories movie, tv, anime, xxx, games, music, software, ebook
// ==/KiyomiExtension==


// ===== metadata mirror (optional introspection) =====
const EXTENSION_INFO = {
    id: "bitsearch-api-js",
    displayName: "BitSearch.to (API)",
    siteUrl: "https://bitsearch.to",
    iconUrl: "https://bitsearch.to/icons/favicon-bitsearch.ico",
    type: "JSON_API",
    isAdult: true,         // has XXX category
    isSecure: true,
    cautionReason: "Search results are often unverified and may contain malicious or misleading torrents.",
    isPrivate: false,      // public API with free tier
    isApiKeyRequired: false, // key is optional (higher limits)
    version: "1.0.0"
};


// ===== API config =====
const BITSEARCH_API_BASE = "https://bitsearch.to/api/v1/search";

const BITSEARCH_API_CONFIG = {
    MAX_RESULTS: 60,           // hard cap we ask from API (<= 100)
    DEFAULT_SORT: "seeders",   // relevance, date, seeders, size, leechers
    DEFAULT_ORDER: "desc"      // asc | desc
};


// ===== Category handling =====
// We keep this normalized map so it can be mirrored in a future JSON config.
// ===== Category handling =====
// Restructured to use the user-facing label as the primary key.
const CATEGORY_MAP = {
    // Key (Label) -> { category, subCategory }
    "All":              { category: null, subCategory: null },

    "Other":            { category: 1,    subCategory: null },
    "Audio":            { category: 1,    subCategory: 1 },
    "Video":            { category: 1,    subCategory: 2 },
    "Image":            { category: 1,    subCategory: 3 },
    "Document":         { category: 1,    subCategory: 4 },
    "Program":          { category: 1,    subCategory: 5 },
    "Android (Apps)":   { category: 1,    subCategory: 6 },
    "Disk Image":       { category: 1,    subCategory: 7 },
    "Source Code":      { category: 1,    subCategory: 8 },
    "Database":         { category: 1,    subCategory: 9 },
    "Archive":          { category: 1,    subCategory: 11 },

    "Movies":           { category: 2,    subCategory: null },
    "Dub/Dual Movies":  { category: 2,    subCategory: 1 },

    "TV Shows":         { category: 3,    subCategory: null },

    "Anime (All)":      { category: 4,    subCategory: null },
    "Anime Dub":        { category: 4,    subCategory: 1 },
    "Anime Subbed":     { category: 4,    subCategory: 2 },
    "Anime Raw":        { category: 4,    subCategory: 3 },

    "Software (All)":   { category: 5,    subCategory: null },
    "Windows":          { category: 5,    subCategory: 1 },
    "Mac":              { category: 5,    subCategory: 2 },
    "Android (Soft)":   { category: 5,    subCategory: 3 },

    "Games (All)":      { category: 6,    subCategory: null },
    "PC Games":         { category: 6,    subCategory: 1 },
    "Mac Games":        { category: 6,    subCategory: 2 },
    "Linux Games":      { category: 6,    subCategory: 3 },
    "Android Games":    { category: 6,    subCategory: 4 },

    "Music (All)":      { category: 7,    subCategory: null },
    "MP3":              { category: 7,    subCategory: 1 },
    "Lossless":         { category: 7,    subCategory: 2 },
    "Albums":           { category: 7,    subCategory: 3 },
    "Music Video":      { category: 7,    subCategory: 4 },

    "AudioBooks":       { category: 8,    subCategory: null },

    "Ebooks/Courses":   { category: 9,    subCategory: null },

    "XXX (Adult)":      { category: 10,   subCategory: null }
};

/**
 * Normalize a category string (from Kiyomi) into a key we can look up.
 * Examples:
 *   "Movies"  => "movies"
 *   "pc games" => "pc-games"
 *   "Anime_Sub" => "anime-sub"
 */
function normalizeCategoryKey(rawCategory) {
    if (!rawCategory) return "all";
    let s = String(rawCategory).trim().toLowerCase();
    if (!s) return "all";

    // common aliases
    if (s === "all") return "all";

    // replace non-alnum with single dash: "PC Games" -> "pc-games"
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!s) return "all";

    return s;
}

/**
 * Resolve category string to a { category, subCategory, label } tuple.
 * If unknown, falls back to "all".
 */
function resolveCategory(rawCategory) {
    const key = normalizeCategoryKey(rawCategory);
    const cfg = CATEGORY_MAP[key];
    if (cfg) return cfg;
    return CATEGORY_MAP["all"];
}


// ---------- helpers ----------

/**
 * Simple ISO date → readable date (YYYY-MM-DD).
 */
function formatIsoDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
}

/**
 * Resolve API key from engine-injected globals / bridge.
 * Optional: if empty, the extension still works in 200-req/day free tier.
 */
function resolveApiKey() {
    // 1) Prefer engine-injected constant
    if (typeof KIYOMI_API_KEY === "string" && KIYOMI_API_KEY.length > 0) {
        return KIYOMI_API_KEY;
    }

    // 2) Fallback: use injected provider id or EXTENSION_INFO.id
    let providerId = "";
    if (typeof KIYOMI_PROVIDER_ID === "string" && KIYOMI_PROVIDER_ID.length > 0) {
        providerId = KIYOMI_PROVIDER_ID;
    } else if (EXTENSION_INFO && typeof EXTENSION_INFO.id === "string") {
        providerId = EXTENSION_INFO.id; // "bitsearch-api-js"
    } else {
        providerId = "bitsearch-api-js";
    }

    if (typeof Kiyomi === "object" && typeof Kiyomi.getApiKey === "function") {
        return Kiyomi.getApiKey(providerId) || "";
    }

    return "";
}

/**
 * Build search URL with query + category + sort options.
 */
function buildSearchUrl(query, catCfg) {
    const encodedQ = encodeURIComponent(query || "");
    const params = [];

    params.push("q=" + encodedQ);
    params.push("limit=" + String(BITSEARCH_API_CONFIG.MAX_RESULTS));
    params.push("sort=" + encodeURIComponent(BITSEARCH_API_CONFIG.DEFAULT_SORT));
    params.push("order=" + encodeURIComponent(BITSEARCH_API_CONFIG.DEFAULT_ORDER));

    if (catCfg && typeof catCfg.category === "number") {
        params.push("category=" + String(catCfg.category));
    }

    if (catCfg && typeof catCfg.subCategory === "number") {
        params.push("subCategory=" + String(catCfg.subCategory));
    }

    return BITSEARCH_API_BASE + "?" + params.join("&");
}

/**
 * Build a magnet URI from infohash, preferring Kiyomi.buildMagnetFromHash if available.
 */
function buildMagnetFromHash(infohash, title) {
    if (!infohash) return "";

    if (typeof Kiyomi === "object" && typeof Kiyomi.buildMagnetFromHash === "function") {
        try {
            const m = Kiyomi.buildMagnetFromHash(infohash, title || "");
            if (m && typeof m === "string") return m;
        } catch (_e) {
            // fall through
        }
    }

    const encodedTitle = title ? encodeURIComponent(title) : "";
    let magnet = "magnet:?xt=urn:btih:" + infohash;
    if (encodedTitle) {
        magnet += "&dn=" + encodedTitle;
    }
    return magnet;
}

/**
 * Map a single BitSearch API result item to Kiyomi's TorrentDescription-like object.
 */
function mapBitsearchItemToTorrent(item, catCfg) {
    if (!item) return null;

    const title = item.title || "";
    const infohash = item.infohash || "";
    const size = typeof item.size === "number"
        ? item.size
        : parseInt(String(item.size || "0"), 10) || 0;
    const seeds = parseInt(String(item.seeders || "0"), 10) || 0;
    const peers = parseInt(String(item.leechers || "0"), 10) || 0;
    const categoryName = item.category || (catCfg ? catCfg.label : "All");
    const publishDate = formatIsoDate(item.createdAt || "");

    if (!title || !infohash) {
        return null;
    }

    const magnetUrl = buildMagnetFromHash(infohash, title);

    // BitSearch API docs show a /api/v1/torrent/:id endpoint; we *guess* site UI detail page as /torrent/:id.
    // If that changes, infoUrl will just be a best-effort placeholder.
    let infoUrl = "";
    if (item.id) {
        infoUrl = "https://bitsearch.to/torrent/" + String(item.id);
    }

    return {
        title: title,
        magnetUrl: magnetUrl,
        hash: infohash,
        size: size,
        seeds: seeds,
        peers: peers,
        infoUrl: infoUrl,
        publishDate: publishDate,
        category_name: categoryName,
        verified: !!item.verified
    };
}


// ---------- main entry for Kiyomi ----------

/**
 * Main entry (mirrors JSON config style):
 *
 * - Performs HTTP GET to /api/v1/search with optional x-api-key header
 * - Maps `results[]` to TorrentDescription objects
 *
 * @param {string} query
 * @param {string} category  // e.g. "all", "movies", "anime", "xxx", "pc-games"
 * @returns {Array<Object>}
 */
function search(query, category) {
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        if (typeof Kiyomi === "object" && typeof Kiyomi.logDebug === "function") {
            Kiyomi.logDebug("BitSearch API: Blank query, returning empty result.");
        }
        return [];
    }

    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        if (typeof Kiyomi === "object" && typeof Kiyomi.logError === "function") {
            Kiyomi.logError("BitSearch API: Kiyomi.httpGet is not available.");
        }
        return [];
    }

    const catCfg = resolveCategory(category);
    const url = buildSearchUrl(trimmedQuery, catCfg);
    const apiKey = resolveApiKey();

    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5"
    };

    if (apiKey) {
        headersObject["x-api-key"] = apiKey;
    }

    const headersJson = JSON.stringify(headersObject);

    if (typeof Kiyomi.logDebug === "function") {
        Kiyomi.logDebug(
            "BitSearch API: GET " +
            url +
            (apiKey ? " (with x-api-key)" : " (no API key)")
        );
    }

    let rawJson;
    try {
        rawJson = Kiyomi.httpGet(url, headersJson);
    } catch (e) {
        if (typeof Kiyomi.logError === "function") {
            Kiyomi.logError(
                "BitSearch API: HTTP error – " +
                (e && e.message ? e.message : String(e))
            );
        }
        return [];
    }

    if (!rawJson) {
        if (typeof Kiyomi.logDebug === "function") {
            Kiyomi.logDebug("BitSearch API: Empty response body.");
        }
        return [];
    }

    let root;
    try {
        root = JSON.parse(rawJson);
    } catch (e) {
        if (typeof Kiyomi.logError === "function") {
            Kiyomi.logError(
                "BitSearch API: Failed to parse JSON – " +
                (e && e.message ? e.message : String(e))
            );
        }
        return [];
    }

    if (!root || root.success === false) {
        // Treat missing/false `success` as soft failure.
        if (typeof Kiyomi.logDebug === "function") {
            Kiyomi.logDebug("BitSearch API: success flag false or missing.");
        }
        // Still try to read results if present, but keep an eye on it.
    }

    const apiResults = Array.isArray(root.results) ? root.results : [];
    const mapped = [];

    for (let i = 0; i < apiResults.length; i++) {
        const t = mapBitsearchItemToTorrent(apiResults[i], catCfg);
        if (t) {
            mapped.push(t);
        }
    }

    // Sort by seeds desc for nicer UX (even though we already requested sort=seeders&order=desc)
    mapped.sort(function (a, b) {
        const sa = typeof a.seeds === "number" ? a.seeds : 0;
        const sb = typeof b.seeds === "number" ? b.seeds : 0;
        return sb - sa;
    });

    if (typeof Kiyomi.logDebug === "function") {
        Kiyomi.logDebug(
            "BitSearch API: Finished search. Query='" +
            trimmedQuery +
            "', category='" +
            (category || "all") +
            "'. Results=" +
            mapped.length
        );
    }

    return mapped;
}
