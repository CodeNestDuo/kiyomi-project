// ==KiyomiExtension==
// @id           subsplease-js
// @name         SubsPlease
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://subsplease.org/favicon.ico
// @site         https://subsplease.org
// @mirrors      https://subsplease.org
// @package      subsplease.org
// @type         json-api
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Direct source for fast, high-quality weekly anime simulcasts in 1080p, 720p, and SD.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://subsplease.org";

function cleanTitle(raw) {
    if (!raw) return "";
    return raw
        .replace(/\b(?:s\d{1,2}e\d{1,2}|s\d{1,2}|e\d{1,2}|\d{1,2}x\d{1,2}|season\s*\d{1,2}\s*episode\s*\d{1,2}|season\s*\d{1,2})\b/gi, "")
        .replace(/\b(1080p|720p|480p|2160p|4k|x264|x265|hevc|avc|bluray|webrip|web-dl|hdtv|dvdrip)\b/gi, "")
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function resolveContext(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        const title = (queryOrContext.titles && queryOrContext.titles[0]) || queryOrContext.query || "";
        const ep = (queryOrContext.mediaType === "batch") ? null : (queryOrContext.episodeNumber || null);
        const res = queryOrContext.resolution ? String(queryOrContext.resolution).replace(/p$/i, "") : "1080";

        return {
            title: cleanTitle(title),
            episode: ep,
            resolution: res
        };
    }

    const raw = String(queryOrContext || "").trim();
    return {
        title: cleanTitle(raw),
        episode: null,
        resolution: "1080"
    };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const ctx = resolveContext(queryOrContext);
    if (!ctx.title) return [];

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const url = base + "/api/?f=search&tz=UTC&s=" + encodeURIComponent(ctx.title);

    const headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const rawJson = Kiyomi.httpGet(url, headers);
    if (!rawJson) return [];

    let data;
    try {
        data = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    if (!data || typeof data !== "object") return [];

    const results = [];
    const keys = Object.keys(data);

    for (let i = 0; i < keys.length; i++) {
        const item = data[keys[i]];
        if (!item || typeof item !== "object") continue;

        const epStr = String(item.episode || "").trim();
        const epNum = parseInt(epStr, 10);

        // If searching a specific episode, filter out mismatched episode numbers
        if (ctx.episode !== null && !isNaN(epNum) && epNum !== ctx.episode) {
            continue;
        }

        const showTitle = item.show || ctx.title;
        const downloads = Array.isArray(item.downloads) ? item.downloads : [];

        for (let d = 0; d < downloads.length; d++) {
            const dl = downloads[d];
            if (!dl || !dl.magnet) continue;

            const resStr = dl.res || "1080";
            const fullTitle = "[SubsPlease] " + showTitle + " - " + epStr + " (" + resStr + "p)";

            const hashMatch = dl.magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
            const infoHash = hashMatch ? hashMatch[1] : null;

            results.push({
                title: fullTitle,
                magnetUrl: dl.magnet,
                hash: infoHash,
                size: 0,
                seeds: 0,
                peers: 0,
                infoUrl: base + "/shows/" + (item.page || ""),
                publishDate: item.release_date || ""
            });
        }
    }

    return results;
}