// ==KiyomiExtension==
// @id           animetime-js
// @name         AnimeTime
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://animetime.cc/build/assets/logo-256-Bb6iPaHP.webp
// @site         https://animetime.cc
// @mirrors      https://animetime.cc
// @package      animetime.cc
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  RSS feed focusing on dual-audio, multi-subbed anime releases.
// @primaryCategory anime
// @extraCategories tv
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://animetime.cc"
];

const CATEGORY_MAP = {
    "All": "",
    "Anime": "anime",
    "Literature": "literature"
};

function extractTag(xml, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp("<(?:[a-z0-9_-]+:)?" + escaped + ">([\\s\\S]*?)</(?:[a-z0-9_-]+:)?" + escaped + ">", "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
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

    const catParam = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "";
    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const url = base + "/rss/search?category=" + encodeURIComponent(catParam)
            + "&tag=&sort=date_desc&query=" + encodeURIComponent(searchQuery);

        const response = Kiyomi.httpGet(url, null);
        if (response && response.indexOf("<item>") !== -1) {
            rssXml = response;
            break;
        }
    }

    if (!rssXml) return [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        const magnetUrl = extractTag(itemXml, "link");
        const pubDate = extractTag(itemXml, "pubDate");
        const sizeBytesStr = extractTag(itemXml, "size_bytes");

        if (!title || !magnetUrl || !magnetUrl.startsWith("magnet:")) {
            continue;
        }

        const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1] : null;
        const size = parseInt(sizeBytesStr, 10) || 0;

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: size,
            seeds: 0,
            peers: 0,
            infoUrl: "",
            publishDate: pubDate
        });
    }

    return results;
}