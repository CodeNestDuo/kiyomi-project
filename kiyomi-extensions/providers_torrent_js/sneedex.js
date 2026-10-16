// ==KiyomiExtension==
// @id           sneedex-js
// @name         Sneedex
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://sneedex.moe/favicon.ico
// @site         https://sneedex.moe
// @mirrors      https://sneedex.moe
// @package      sneedex.moe
// @type         json-api
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Community-maintained index of curated best anime releases, encodes, and dual-audio tracks.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://sneedex.moe/api";

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.anilistId) {
            return { anilistId: queryOrContext.anilistId, query: "" };
        }
        const title = (queryOrContext.titles && queryOrContext.titles[0]) || queryOrContext.query || "";
        return { anilistId: null, query: title.trim() };
    }
    return { anilistId: null, query: String(queryOrContext || "").trim() };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const resolved = resolveQuery(queryOrContext);
    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    let searchUrl = "";
    if (resolved.anilistId) {
        searchUrl = `${base}/public/shows?alID=${encodeURIComponent(resolved.anilistId)}`;
    } else if (resolved.query) {
        searchUrl = `${base}/public/shows?search=${encodeURIComponent(resolved.query)}`;
    } else {
        return [];
    }

    const headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const rawJson = Kiyomi.httpGet(searchUrl, headers);
    if (!rawJson) return [];

    let shows;
    try {
        shows = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    if (!Array.isArray(shows) || shows.length === 0) return [];

    const results = [];

    for (let i = 0; i < shows.length; i++) {
        const show = shows[i];
        if (!show) continue;

        const showTitle = show.title || "";
        const bestRelease = show.best || show.alt || "";
        const link = show.link || "";

        if (!bestRelease && !link) continue;

        let infoHash = null;
        let magnetUrl = "";

        if (link.startsWith("magnet:")) {
            magnetUrl = link;
            const hashMatch = link.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) infoHash = hashMatch[1];
        } else if (/^[A-Fa-f0-9]{40}$/.test(link)) {
            infoHash = link;
            magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
                ? Kiyomi.buildMagnetFromHash(link, showTitle)
                : `magnet:?xt=urn:btih:${link}&dn=${encodeURIComponent(showTitle)}`;
        }

        const displayTitle = `[Sneedex] ${showTitle} (${bestRelease || "Best"})`;

        results.push({
            title: displayTitle,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: 0,
            seeds: 1,
            peers: 0,
            infoUrl: `https://sneedex.moe/anime/${show.id || ""}`,
            publishDate: ""
        });
    }

    return results;
}