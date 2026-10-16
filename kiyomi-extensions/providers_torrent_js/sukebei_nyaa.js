// ==KiyomiExtension==
// @id           sukebei_nyaa-js
// @name         Sukebei Nyaa
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://sukebei.nyaa.si/static/favicon.png
// @site         https://sukebei.nyaa.si
// @mirrors      https://sukebei.nyaa.si,https://sukebei.nyaa.net
// @package      sukebei.nyaa.si
// @type         torrent-rss
// @nsfw         true
// @private      false
// @requiresKey  false
// @description  Adults-only sister site of Nyaa, focused on 18+ Japanese/Asian media.
// @primaryCategory hentai
// @extraCategories anime, movie, tv, xxx
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://sukebei.nyaa.si",
    "https://sukebei.nyaa.net"
];

const CATEGORY_MAP = {
    "All": "0_0",
    "Anime": "1_1",
    "Doujinshi": "1_2",
    "Games": "1_3",
    "Manga": "1_4",
    "Pictures": "1_5",
    "Photobooks": "2_1",
    "Videos": "2_2",
    "Real Life": "2_0",
    "Other Art": "1_0"
};

function extractTag(xml, tagName) {
    const m = xml.match(new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i"));
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

    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "0_0";

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = `${base}/?page=rss&c=${encodeURIComponent(catId)}&f=0&q=${encodeURIComponent(searchQuery)}`;

        const response = Kiyomi.httpGet(searchUrl, null);
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
        const infoUrl = extractTag(itemXml, "guid");
        const pubDate = extractTag(itemXml, "pubDate");

        if (!title) continue;

        const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
        const torrentDownloadUrl = enclosureMatch ? enclosureMatch[1] : "";

        const infoHash = extractTag(itemXml, "nyaa:infoHash");
        const sizeHuman = extractTag(itemXml, "nyaa:size");
        const seedsStr = extractTag(itemXml, "nyaa:seeders");
        const peersStr = extractTag(itemXml, "nyaa:leechers");

        if (!infoHash) continue;

        const sizeBytesStr = typeof Kiyomi.humanSizeToBytes === "function"
            ? Kiyomi.humanSizeToBytes(sizeHuman)
            : null;
        const sizeBytes = sizeBytesStr ? (Number(sizeBytesStr) || 0) : 0;

        const magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;

        const seeds = parseInt(seedsStr, 10) || 0;
        const peers = parseInt(peersStr, 10) || 0;

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate,
            torrentDownloadUrl: torrentDownloadUrl
        });
    }

    return results;
}