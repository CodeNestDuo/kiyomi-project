// ==KiyomiExtension==
// @id           acgrip-js
// @name         ACG.RIP
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://acg.rip/favicon.ico
// @site         https://acg.rip
// @mirrors      https://acg.rip
// @package      acg.rip
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Indexes Chinese and broader Asian media collections.
// @primaryCategory anime
// @extraCategories general
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://acg.rip"
];

const CATEGORY_MAP = {
    "All": "",
    "Animation": "1",
    "Japanese drama": "2",
    "Variety Show": "3",
    "Music": "4",
    "Collection": "5",
    "other": "9"
};

function extractTag(itemXml, tagName) {
    const re = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

function extractEnclosure(itemXml) {
    const m = itemXml.match(/<enclosure[^>]*\surl="([^"]+)"(?:\s+length="([^"]+)")?/i);
    if (!m) return { url: "", size: 0 };
    return {
        url: m[1] || "",
        size: parseInt(m[2] || "0", 10) || 0
    };
}

function buildMagnetFromTorrentUrl(torrentUrl, title) {
    if (!torrentUrl) return null;
    const m = /([A-Fa-f0-9]{40})\.torrent/i.exec(torrentUrl);
    if (!m) return null;
    const hash = m[1];
    if (typeof Kiyomi.buildMagnetFromHash === "function") {
        return Kiyomi.buildMagnetFromHash(hash, title || "");
    }
    return "magnet:?xt=urn:btih:" + hash + (title ? "&dn=" + encodeURIComponent(title) : "");
}

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        // Prioritize Chinese/Native title if present in titles array, fallback to default query
        const titles = queryOrContext.titles || [];
        const preferredTitle = titles[1] || titles[0] || queryOrContext.query || "";
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";

        if (queryOrContext.mediaType === "batch") {
            return preferredTitle.trim();
        }

        return (preferredTitle + " " + ep).trim();
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

    let catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];
    if (typeof queryOrContext === "object" && queryOrContext !== null && queryOrContext.mediaType === "batch") {
        catId = "5"; // ACG.RIP Collection category
    }

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const categoryPath = catId ? ("/" + catId + ".xml") : "/.xml";
        const url = base + categoryPath + "?term=" + encodeURIComponent(searchQuery);

        const response = Kiyomi.httpGet(url, null);
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
        const pubDate = extractTag(itemXml, "pubDate");
        const enclosure = extractEnclosure(itemXml);

        const magnetUrl = buildMagnetFromTorrentUrl(enclosure.url, title) || enclosure.url;

        let hash = null;
        const hashMatch = /([A-Fa-f0-9]{40})/i.exec(enclosure.url) || /xt=urn:btih:([a-zA-Z0-9]+)/i.exec(magnetUrl);
        if (hashMatch) {
            hash = hashMatch[1];
        }

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: enclosure.url,
            hash: hash,
            size: enclosure.size,
            seeds: 0,
            peers: 0,
            infoUrl: infoUrl,
            publishDate: pubDate
        });
    }

    return results;
}