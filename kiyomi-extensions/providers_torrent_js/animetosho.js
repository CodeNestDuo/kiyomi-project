// ==KiyomiExtension==
// @id           animetosho-js
// @name         Anime Tosho
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://animetosho.org/inc/favicon.ico
// @site         https://animetosho.org
// @mirrors      https://feed.animetosho.org,https://animetosho.org
// @package      animetosho.org
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Automated service mirroring major anime torrents; provides structured Torznab data.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://feed.animetosho.org"
];

function extractTag(itemXml, tagName) {
    const re = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

function extractEnclosureUrl(itemXml) {
    const m = itemXml.match(/<enclosure[^>]*\surl="([^"]+)"/i);
    return m ? m[1].trim() : "";
}

function extractTorznabAttr(itemXml, name) {
    const re = new RegExp('<torznab:attr[^>]*\\bname="' + name + '"[^>]*\\bvalue="([^"]*)"', "i");
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Builds the query URL parameters from a string or TorrentQueryContext.
 */
function buildApiQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        // High accuracy: Use AniDB Episode ID if context resolved it
        if (queryOrContext.anidbEid) {
            return "eid=" + encodeURIComponent(queryOrContext.anidbEid);
        }
        // AniDB Anime ID
        if (queryOrContext.anidbAid && queryOrContext.mediaType === "batch") {
            return "aid=" + encodeURIComponent(queryOrContext.anidbAid);
        }

        if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
            return "q=" + encodeURIComponent(queryOrContext.query.trim());
        }

        const title = (queryOrContext.titles && queryOrContext.titles[0]) || "";
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";
        const full = (queryOrContext.mediaType === "batch") ? title : (title + " " + ep).trim();

        return "q=" + encodeURIComponent(full);
    }

    return "q=" + encodeURIComponent(String(queryOrContext || "").trim());
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

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = base + "/api?" + queryParams;

        const response = Kiyomi.httpGet(searchUrl, null);
        if (response && response.indexOf("<item>") !== -1) {
            rssXml = response;
            break;
        }
    }

    if (!rssXml) return [];

    const itemsRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemsRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        if (!title) continue;

        const infoUrl = extractTag(itemXml, "guid");
        const torrentDownloadUrl = extractEnclosureUrl(itemXml);
        const magnetAttr = extractTorznabAttr(itemXml, "magneturl");
        const hash = extractTorznabAttr(itemXml, "infohash");

        const sizeStr = extractTorznabAttr(itemXml, "size");
        const seedsStr = extractTorznabAttr(itemXml, "seeders");
        const peersStr = extractTorznabAttr(itemXml, "leechers");
        const publishDate = extractTag(itemXml, "pubDate");

        const size = sizeStr ? (parseInt(sizeStr, 10) || 0) : 0;
        const seeds = seedsStr ? (parseInt(seedsStr, 10) || 0) : 0;
        const peers = peersStr ? (parseInt(peersStr, 10) || 0) : 0;

        let magnetUrl = magnetAttr || "";
        if (!magnetUrl && hash && typeof Kiyomi.buildMagnetFromHash === "function") {
            magnetUrl = Kiyomi.buildMagnetFromHash(hash, title);
        }

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentDownloadUrl,
            hash: hash || null,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: publishDate
        });
    }

    return results;
}