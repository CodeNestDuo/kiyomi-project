// ==KiyomiExtension==
// @id           nyaa-js
// @name         Nyaa
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://nyaa.land/static/favicon.png
// @site         https://nyaa.si
// @mirrors      https://nyaa.si,https://nyaa.land,https://nyaa.net
// @package      nyaa.si
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Primary source for Eastern Asian media, often featuring raw or fan-subbed content.
// @primaryCategory anime
// @extraCategories asian_drama
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://nyaa.si",
    "https://nyaa.land",
    "https://nyaa.net"
];

const CATEGORY_MAP = {
    "All": "0_0",
    "Anime": "1_0",
    "Music": "3_0",
    "Software": "4_0",
    "Other": "6_0"
};

function extractTag(xml, tagName) {
    const m = xml.match(new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i"));
    return m ? m[1].trim() : "";
}

/**
 * Executes a search against Nyaa.
 * @param {string|Object} queryOrContext - string query or TorrentQueryContext
 * @param {string} category
 * @param {string} [customBaseUrl]
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    // 1. Resolve structured context vs raw string query
    let rawQuery = "";
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        const title = queryOrContext.query || queryOrContext.title || "";
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";
        rawQuery = `${title} ${ep}`.trim();
    } else {
        rawQuery = String(queryOrContext || "").trim();
    }

    const categoryId = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "0_0";
    const encodedQuery = encodeURIComponent(rawQuery);

    // 2. Select mirrors (custom base override takes priority)
    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";
    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = `${base}/?page=rss&c=${categoryId}&f=0&q=${encodedQuery}`;

        const response = Kiyomi.httpGet(searchUrl, null);
        if (response && response.indexOf("<item>") !== -1) {
            rssXml = response;
            break;
        }
    }

    if (!rssXml) return [];

    // 3. Parse <item> elements
    const itemsRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemsRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        const infoHash = extractTag(itemXml, "nyaa:infoHash");
        const sizeRaw = extractTag(itemXml, "nyaa:size");
        const seeds = parseInt(extractTag(itemXml, "nyaa:seeders"), 10) || 0;
        const peers = parseInt(extractTag(itemXml, "nyaa:leechers"), 10) || 0;
        const guid = extractTag(itemXml, "guid");
        const pubDate = extractTag(itemXml, "pubDate");

        if (!infoHash || !title) continue;

        const sizeBytesStr = typeof Kiyomi.humanSizeToBytes === "function"
            ? Kiyomi.humanSizeToBytes(sizeRaw)
            : "0";

        const magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : "";

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: Number(sizeBytesStr) || 0,
            seeds: seeds,
            peers: peers,
            infoUrl: guid,
            publishDate: pubDate
        });
    }

    return results;
}