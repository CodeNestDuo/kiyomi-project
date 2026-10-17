// ==KiyomiExtension==
// @id           animetosho-js
// @name         Anime Tosho
// @version      2.4.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://animetosho.net/favicon.ico
// @site         https://animetosho.net
// @mirrors      https://feed.animetosho.net
// @package      animetosho.net
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Anime Tosho provider using strictly documented JSON API parameters.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://feed.animetosho.net"
];

/**
 * Resolves search terms from a query string or context object.
 */
function resolveSearchQuery(queryOrContext) {
    if (typeof queryOrContext !== "object" || queryOrContext === null) {
        return String(queryOrContext || "").trim();
    }
    if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
        return queryOrContext.query.trim();
    }
    const candidateTitles = Array.isArray(queryOrContext.titles) ? queryOrContext.titles : [];
    const primaryTitle = candidateTitles[0] || queryOrContext.title || "";
    if (queryOrContext.mediaType === "batch") {
        return primaryTitle.trim();
    }
    const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";
    return `${primaryTitle} ${ep}`.trim();
}

/**
 * Builds query parameters strictly using documented endpoints:
 * - Basic: q=...
 * - Advanced: qx=1&q=...
 * - AniDB Filter: qx=1&aids=... (plus optional q=...)
 */
function buildApiQuery(queryOrContext) {
    const params = [];
    let isAdvanced = false;

    let aid = null;
    let queryStr = "";

    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        aid = queryOrContext.anidbAid || queryOrContext.aid || queryOrContext.aids || null;
        queryStr = resolveSearchQuery(queryOrContext);
    } else {
        queryStr = String(queryOrContext || "").trim();
    }

    if (aid) {
        isAdvanced = true;
        // Supports single ID or comma-separated list
        params.push("aids=" + encodeURIComponent(Array.isArray(aid) ? aid.join(",") : aid));
    }

    if (queryStr) {
        params.push("q=" + encodeURIComponent(queryStr));
    }

    if (isAdvanced) {
        params.unshift("qx=1");
    }

    return params.join("&");
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const queryParams = buildApiQuery(queryOrContext);
    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let jsonResponse = null;

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = base + "/json?" + queryParams;

        try {
            const rawResponse = Kiyomi.httpGet(searchUrl, null);
            if (rawResponse && typeof rawResponse === "string" && rawResponse.trim().indexOf("[") === 0) {
                jsonResponse = JSON.parse(rawResponse);
                break;
            }
        } catch (e) {
            // Mirror failed or down, move to next
        }
    }

    if (!Array.isArray(jsonResponse)) {
        return [];
    }

    return jsonResponse.map(function(item) {
        let magnetUrl = item.magnet_uri || "";
        const hash = item.info_hash || null;

        if (!magnetUrl && hash && typeof Kiyomi.buildMagnetFromHash === "function") {
            magnetUrl = Kiyomi.buildMagnetFromHash(hash, item.title);
        }

        return {
            title: item.title || item.torrent_name || "",
            magnetUrl: magnetUrl,
            torrentDownloadUrl: item.torrent_url || null,
            hash: hash,
            size: item.total_size || 0,
            seeds: item.seeders || 0,
            peers: item.leechers || 0,
            infoUrl: item.link || null,
            publishDate: item.timestamp ? new Date(item.timestamp * 1000).toUTCString() : null
        };
    });
}