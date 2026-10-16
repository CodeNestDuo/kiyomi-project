// ==KiyomiExtension==
// @id           yameii-js
// @name         Yameii (Dubs)
// @version      1.1.0
// @author       Kiyomi Community
// @lang         en
// @icon         https://nyaa.land/static/favicon.png
// @site         https://nyaa.si
// @mirrors      https://nyaa.si,https://nyaa.land,https://nyaa.net
// @package      nyaa.si
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  English dub uploads from Yameii on nyaa.si. Single-uploader source, highly consistent quality.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://nyaa.si",
    "https://nyaa.land",
    "https://nyaa.net"
];

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

    // Filter to user Yameii specifically with category Anime (1_0)
    const rawSearch = 'u:Yameii ' + searchQuery;
    const encodedQuery = encodeURIComponent(rawSearch);

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = `${base}/?page=rss&u=Yameii&c=1_2&f=0&q=${encodedQuery}`;

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
            : `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;

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