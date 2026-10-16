// ==KiyomiExtension==
// @id           bitsearch-js
// @name         BitSearch
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://bitsearch.to/icons/favicon-bitsearch.ico
// @site         https://bitsearch.to
// @mirrors      https://bitsearch.to
// @package      bitsearch.to
// @type         json-api
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Fast DHT crawler indexing torrents across all categories via public JSON API.
// @primaryCategory general
// @extraCategories movie, tv, anime, xxx, games, music, software, ebook
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://bitsearch.to/api/v1/search";

const CATEGORY_MAP = {
    "All": { category: null, subCategory: null },
    "Other": { category: 1, subCategory: null },
    "Audio": { category: 1, subCategory: 1 },
    "Video": { category: 1, subCategory: 2 },
    "Movies": { category: 2, subCategory: null },
    "TV Shows": { category: 3, subCategory: null },
    "Series": { category: 3, subCategory: null },
    "Anime": { category: 4, subCategory: null },
    "Anime Dub": { category: 4, subCategory: 1 },
    "Anime Subbed": { category: 4, subCategory: 2 },
    "Anime Raw": { category: 4, subCategory: 3 },
    "Software": { category: 5, subCategory: null },
    "Games": { category: 6, subCategory: null },
    "Music": { category: 7, subCategory: null },
    "Ebooks": { category: 9, subCategory: null },
    "XXX": { category: 10, subCategory: null }
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
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const searchQuery = resolveQuery(queryOrContext);
    if (!searchQuery) return [];

    let catCfg = CATEGORY_MAP[category] || CATEGORY_MAP["All"];
    if (typeof queryOrContext === "object" && queryOrContext !== null && !catCfg.category) {
        if (queryOrContext.mediaType === "movie") catCfg = CATEGORY_MAP["Movies"];
        else catCfg = CATEGORY_MAP["Anime"];
    }

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const params = [
        "q=" + encodeURIComponent(searchQuery),
        "limit=60",
        "sort=seeders",
        "order=desc"
    ];

    if (catCfg.category !== null) {
        params.push("category=" + catCfg.category);
    }
    if (catCfg.subCategory !== null) {
        params.push("subCategory=" + catCfg.subCategory);
    }

    const url = base + "?" + params.join("&");

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "application/json"
    };

    if (typeof KIYOMI_API_KEY === "string" && KIYOMI_API_KEY.length > 0) {
        headers["x-api-key"] = KIYOMI_API_KEY;
    }

    const jsonText = Kiyomi.httpGet(url, headers);
    if (!jsonText) return [];

    let root;
    try {
        root = JSON.parse(jsonText);
    } catch (e) {
        return [];
    }

    const items = (root && Array.isArray(root.results)) ? root.results : [];
    const results = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") continue;

        const title = (item.title || "").trim();
        const hash = (item.infohash || "").trim().toLowerCase();

        if (!title || !hash || hash === "0000000000000000000000000000000000000000") continue;

        const size = typeof item.size === "number" ? item.size : (parseInt(String(item.size || "0"), 10) || 0);
        const seeds = parseInt(String(item.seeders || "0"), 10) || 0;
        const peers = parseInt(String(item.leechers || "0"), 10) || 0;
        const publishDate = formatIsoDate(item.createdAt || "");

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(hash, title)
            : ("magnet:?xt=urn:btih:" + hash + "&dn=" + encodeURIComponent(title));

        const infoUrl = item.id ? ("https://bitsearch.to/torrent/" + encodeURIComponent(item.id)) : "";

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            publishDate: publishDate,
            infoUrl: infoUrl
        });
    }

    return results;
}