// ==KiyomiExtension==
// @id           thepiratebay-js
// @name         The Pirate Bay
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://torrindex.net/images/tpb.jpg
// @site         https://thepiratebay.org
// @mirrors      https://apibay.org
// @package      thepiratebay.org
// @type         json-api
// @nsfw         true
// @secure       false
// @private      false
// @requiresKey  false
// @description  The Pirate Bay via apibay.org JSON API, for Kiyomi JS engine.
// @primaryCategory general
// @extraCategories anime, movie, tv, xxx, hentai
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://apibay.org";

const CATEGORY_MAP = {
    "All": "0",
    "Anime": "0",
    "Movies": "200",
    "Series": "200",
    "Music": "101",
    "Porn": "500",
    "Apps": "300",
    "Books": "601",
    "Games": "400",
    "Other": "600"
};

const DEFAULT_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://public.popcorn-tracker.org:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://open.demonii.com:1337/announce"
];

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
 * Builds standard magnet link with tracker parameters.
 */
function buildFullMagnet(infoHash, name) {
    let magnet = "magnet:?xt=urn:btih:" + encodeURIComponent(infoHash);
    if (name) {
        magnet += "&dn=" + encodeURIComponent(name);
    }
    for (let i = 0; i < DEFAULT_TRACKERS.length; i++) {
        magnet += "&tr=" + encodeURIComponent(DEFAULT_TRACKERS[i]);
    }
    return magnet;
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

    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    let url = base + "/q.php?q=" + encodeURIComponent(searchQuery);
    if (catId !== "0") {
        url += "&cat=" + encodeURIComponent(catId);
    }

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "application/json"
    };

    const jsonText = Kiyomi.httpGet(url, headers);
    if (!jsonText) return [];

    let items;
    try {
        items = JSON.parse(jsonText);
    } catch (e) {
        return [];
    }

    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const results = [];

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || typeof it !== "object") continue;

        const hash = (it.info_hash || "").trim().toLowerCase();

        // Drop sentinel responses returned by apibay on missing hits
        if (!hash || hash === "0000000000000000000000000000000000000000") continue;

        const title = (it.name || "").trim();
        if (!title || title.toLowerCase() === "no results returned") continue;

        const size = parseInt(it.size || "0", 10) || 0;
        const seeds = parseInt(it.seeders || "0", 10) || 0;
        const peers = parseInt(it.leechers || "0", 10) || 0;
        const publishDate = epochToDateString(it.added || "0");

        const idRaw = it.id || "";
        const infoUrl = idRaw ? ("https://thepiratebay.org/description.php?id=" + encodeURIComponent(idRaw)) : "";

        // Build magnet link with trackers attached
        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(hash, title)
            : buildFullMagnet(hash, title);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            publishDate: publishDate,
            imdbId: it.imdb || null,
            infoUrl: infoUrl
        });
    }

    return results;
}