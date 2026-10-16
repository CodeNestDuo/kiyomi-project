// ==KiyomiExtension==
// @id           torrentscsv-js
// @name         TorrentsCSV
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://torrents-csv.com/favicon.ico
// @site         https://torrents-csv.com
// @mirrors      https://torrents-csv.com
// @package      torrents-csv.com
// @type         json-api
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  TorrentsCSV JSON API integration for Kiyomi JS engine.
// @primaryCategory general
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://torrents-csv.com";

function epochToDateString(epochStr) {
    const sec = parseInt(epochStr, 10);
    if (!sec || sec <= 0) return "";
    const d = new Date(sec * 1000);
    return d.toISOString();
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

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const url = base + "/service/search?q=" + encodeURIComponent(searchQuery);

    const headers = {
        "Accept": "application/json"
    };

    const jsonText = Kiyomi.httpGet(url, headers);
    if (!jsonText) return [];

    let root;
    try {
        root = JSON.parse(jsonText);
    } catch (e) {
        return [];
    }

    const torrents = (root && Array.isArray(root.torrents)) ? root.torrents : [];
    const results = [];

    for (let i = 0; i < torrents.length; i++) {
        const t = torrents[i];
        if (!t || typeof t !== "object") continue;

        const title = (t.name || "").trim();
        const hash = (t.infohash || "").trim().toLowerCase();

        if (!title || !hash || hash === "0000000000000000000000000000000000000000") continue;

        const size = parseInt(t.size_bytes || "0", 10) || 0;
        const seeds = parseInt(t.seeders || "0", 10) || 0;
        const peers = parseInt(t.leechers || "0", 10) || 0;
        const publishDate = epochToDateString(t.created_unix || "0");

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(hash, title)
            : ("magnet:?xt=urn:btih:" + hash + "&dn=" + encodeURIComponent(title));

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            publishDate: publishDate,
            infoUrl: ""
        });
    }

    return results;
}