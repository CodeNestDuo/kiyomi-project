// ==KiyomiExtension==
// @id           bangumimoe-js
// @name         Bangumi.moe
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://bangumi.moe/favicon.ico
// @site         https://bangumi.moe
// @mirrors      https://bangumi.moe
// @package      bangumi.moe
// @type         json-api
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Open Asian and Chinese anime fansub aggregation platform with high-speed indexing.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://bangumi.moe/api";
const SITE_BASE = "https://bangumi.moe";

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        // Prioritize CJK / Native title if provided in titles array
        const titles = queryOrContext.titles || [];
        const preferred = titles[1] || titles[0] || queryOrContext.query || "";
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";

        if (queryOrContext.mediaType === "batch") {
            return preferred.trim();
        }
        return (preferred + " " + ep).trim();
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
    if (!searchQuery) return [];

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const endpoint = base + "/torrent/search";

    const payload = {
        query: searchQuery,
        p: 1
    };

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const rawJson = Kiyomi.httpPost(endpoint, JSON.stringify(payload), headers);
    if (!rawJson) return [];

    let root;
    try {
        root = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    const torrents = (root && Array.isArray(root.torrents)) ? root.torrents : [];
    const results = [];

    for (let i = 0; i < torrents.length; i++) {
        const t = torrents[i];
        if (!t || typeof t !== "object") continue;

        const title = (t.title || "").trim();
        const hash = (t.infoHash || "").trim().toLowerCase();
        if (!title || !hash) continue;

        const size = parseInt(t.size || "0", 10) || 0;
        const publishDate = t.publish_time ? new Date(t.publish_time).toISOString() : "";
        const infoUrl = SITE_BASE + "/torrent/" + (t._id || "");

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(hash, title)
            : ("magnet:?xt=urn:btih:" + hash + "&dn=" + encodeURIComponent(title));

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: 0,
            peers: 0,
            infoUrl: infoUrl,
            publishDate: publishDate
        });
    }

    return results;
}