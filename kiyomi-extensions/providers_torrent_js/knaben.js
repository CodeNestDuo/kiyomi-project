// ==KiyomiExtension==
// @id           knaben-js
// @name         Knaben
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://knaben.org/favicon.ico
// @site         https://knaben.org
// @mirrors      https://api.knaben.org
// @package      knaben.org
// @type         json-api
// @nsfw         true
// @secure       true
// @private      true
// @requiresKey  true
// @description  Modern, fast search API that offers structured results.
// @primaryCategory anime
// @extraCategories general, movie, tv, xxx
// ==/KiyomiExtension==

const DEFAULT_API_ENDPOINT = "https://api.knaben.org/v1";

const CATEGORY_MAP = {
    "All": "",
    "Music": "1000000",
    "Series": "2000000",
    "Movies": "3000000",
    "Apps": "4000000",
    "Porn": "5000000",
    "Anime": "6000000",
    "Games": "7000000",
    "Books": "9000000",
    "Other": "10000000"
};

function formatIsoDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
}

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
            return queryOrContext.query.trim();
        }

        const title = (queryOrContext.titles && queryOrContext.titles[0]) || "";
        const season = queryOrContext.seasonNumber || 1;
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";

        let built = title;
        if (season > 1) {
            built += " S" + String(season).padStart(2, "0");
        }
        if (queryOrContext.mediaType !== "batch" && ep) {
            built += " " + ep;
        }

        return built.trim();
    }

    return String(queryOrContext || "").trim();
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpPost !== "function") {
        return [];
    }

    const searchQuery = resolveQuery(queryOrContext);
    const catIdString = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "";

    const payload = {
        query: searchQuery,
        size: 100,
        order_by: "seeders",
        order_direction: "desc",
        hide_unsafe: true,
        hide_xxx: false
    };

    if (catIdString && catIdString.length > 0) {
        const catNum = parseInt(catIdString, 10);
        if (!Number.isNaN(catNum)) {
            payload.categories = [catNum];
        }
    }

    const endpoint = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_ENDPOINT;

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    if (typeof KIYOMI_API_KEY === "string" && KIYOMI_API_KEY.length > 0) {
        headers["X-Api-Key"] = KIYOMI_API_KEY;
        headers["Authorization"] = "Bearer " + KIYOMI_API_KEY;
    }

    const rawJson = Kiyomi.httpPost(endpoint, JSON.stringify(payload), headers);
    if (!rawJson) return [];

    let root;
    try {
        root = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    const hits = Array.isArray(root.hits) ? root.hits : [];
    const results = [];

    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];

        const title = h.title || "";
        const hash = h.hash || "";
        const infoUrl = h.details || "";

        if (!title) continue;

        let magnetUrl = h.magnetUrl || "";
        if (!magnetUrl && hash && typeof Kiyomi.buildMagnetFromHash === "function") {
            magnetUrl = Kiyomi.buildMagnetFromHash(hash, title);
        }
        if (!magnetUrl && !hash) continue;

        const size = (typeof h.bytes === "number")
            ? h.bytes
            : (parseInt(String(h.bytes || "0"), 10) || 0);

        const seeds = parseInt(String(h.seeders || "0"), 10) || 0;
        const peers = parseInt(String(h.peers || "0"), 10) || 0;
        const publishDate = formatIsoDate(h.date || "");

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash || null,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: publishDate
        });
    }

    return results;
}