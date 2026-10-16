// ==KiyomiExtension==
// @id           cloudtorrents-js
// @name         CloudTorrents
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://cloudtorrents.com/assets/apple-touch-icon.png
// @site         https://cloudtorrents.com
// @mirrors      https://api.cloudtorrents.com
// @package      cloudtorrents.com
// @type         json-api
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Modern API-based indexer; useful for locating structured results when main Anime trackers fail.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://api.cloudtorrents.com";
const CLOUDTORRENTS_SITE = "https://cloudtorrents.com";
const MAX_RESULTS = 50;
const MAX_REQUESTS = 2;
const API_LIMIT = 50;

function resolveCategoryCode(category) {
    if (!category) return null;
    const normalized = String(category).trim().toLowerCase();

    switch (normalized) {
        case "anime": return "1";
        case "software":
        case "apps": return "2";
        case "books":
        case "ebook":
        case "ebooks": return "3";
        case "games": return "4";
        case "movies":
        case "movie":
        case "film": return "5";
        case "music": return "6";
        case "tv":
        case "tvshows":
        case "tv-shows":
        case "series": return "8";
        default: return null;
    }
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

function buildQueryString(params) {
    const parts = [];
    for (const key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        const value = params[key];
        if (value === undefined || value === null || value === "") continue;
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
    }
    return parts.join("&");
}

function parsePage(decoded) {
    if (!decoded || !decoded.results || !Array.isArray(decoded.results)) {
        return [];
    }

    const out = [];
    for (let i = 0; i < decoded.results.length; i++) {
        const result = decoded.results[i] || {};
        const torrent = result.torrent || {};
        const meta = torrent.torrentMetadata || torrent;

        const name = (meta.name || torrent.name || "").trim();
        const magnet = meta.torrentMagnet || meta.magnet || torrent.torrentMagnet || torrent.magnet || "";

        if (!name || !magnet) continue;

        const torrentType = meta.torrentType || torrent.torrentType || {};
        const typeName = (torrentType.name || "").toLowerCase();
        const resultId = result.id != null ? String(result.id) : "";

        let descLink = CLOUDTORRENTS_SITE;
        if (typeName && resultId) {
            descLink = `${CLOUDTORRENTS_SITE}/${typeName}/${resultId}`;
        }

        let publishEpoch = "";
        if (torrent.uploadedAt) {
            const ms = Date.parse(torrent.uploadedAt);
            if (!isNaN(ms)) {
                publishEpoch = new Date(ms).toISOString();
            }
        }

        const sizeBytes = (typeof meta.size === "number" && !isNaN(meta.size))
            ? meta.size
            : ((typeof torrent.size === "number" && !isNaN(torrent.size)) ? torrent.size : 0);

        const seeds = (typeof torrent.seeders === "number" && !isNaN(torrent.seeders)) ? torrent.seeders : 0;
        const leechers = (typeof torrent.leechers === "number" && !isNaN(torrent.leechers)) ? torrent.leechers : 0;
        const hash = meta.torrentHash || meta.hash || torrent.hash || null;

        out.push({
            title: name,
            magnetUrl: magnet,
            hash: hash,
            size: sizeBytes,
            seeds: seeds,
            peers: leechers,
            infoUrl: descLink,
            publishDate: publishEpoch
        });
    }

    return out;
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

    let typeCode = resolveCategoryCode(category);
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.mediaType === "movie") {
            typeCode = "5";
        } else if (!typeCode) {
            typeCode = "1"; // Default to Anime
        }
    }

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "application/json"
    };

    let offset = 0;
    const allItems = [];
    let requestCount = 0;

    while (requestCount < MAX_REQUESTS && allItems.length < MAX_RESULTS) {
        const queryParams = {
            offset: offset,
            limit: API_LIMIT,
            query: searchQuery
        };
        if (typeCode) {
            queryParams["torrent_type"] = typeCode;
        }

        const url = `${base}/search/?${buildQueryString(queryParams)}`;
        const rawJson = Kiyomi.httpGet(url, headers);
        if (!rawJson) break;

        let decoded;
        try {
            decoded = JSON.parse(rawJson);
        } catch (e) {
            break;
        }

        const pageItems = parsePage(decoded);
        for (let i = 0; i < pageItems.length; i++) {
            if (allItems.length >= MAX_RESULTS) break;
            allItems.push(pageItems[i]);
        }

        if (pageItems.length < API_LIMIT || !decoded.next) {
            break;
        }

        requestCount += 1;
        offset += API_LIMIT;
    }

    allItems.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

    return allItems.slice(0, MAX_RESULTS);
}