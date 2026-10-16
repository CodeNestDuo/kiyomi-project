// ==KiyomiExtension==
// @id           limetorrents-js
// @name         LimeTorrents
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://www.limetorrents.lol/favicon.ico
// @site         https://www.limetorrents.lol
// @mirrors      https://www.limetorrents.lol,https://limetorrents.co,https://limetorrents.info
// @package      limetorrents.lol
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  LimeTorrents search via RSS using the Kiyomi JS engine.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://www.limetorrents.lol",
    "https://limetorrents.co"
];

const CATEGORY_MAP = {
    "All": "all",
    "Anime": "anime",
    "Movies": "movies",
    "Music": "music",
    "TV shows": "tv",
    "Applications": "applications",
    "Games": "games",
    "Other": "other"
};

function extractTag(xml, tagName) {
    const m = xml.match(new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i"));
    return m ? m[1].trim() : "";
}

function extractAttr(xml, tagName, attrName) {
    const m = xml.match(new RegExp("<" + tagName + "[^>]*\\s" + attrName + "=\"([^\"]+)\"[^>]*>", "i"));
    return m ? m[1] : "";
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

    let categoryParam = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "all";
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.mediaType === "movie") categoryParam = "movies";
    }

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = base + "/searchrss/" + encodeURIComponent(searchQuery) + "/" + encodeURIComponent(categoryParam) + "/";

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
        const infoUrl = extractTag(itemXml, "link");
        const publishDate = extractTag(itemXml, "pubDate");
        const sizeText = extractTag(itemXml, "size");
        const description = extractTag(itemXml, "description");
        const enclosureUrl = extractAttr(itemXml, "enclosure", "url");

        if (!title) continue;

        // Extract 40-hex hash from enclosure URL or fallback
        let infoHash = null;
        if (enclosureUrl) {
            const hashMatch = enclosureUrl.match(/([A-Fa-f0-9]{40})/i);
            if (hashMatch) {
                infoHash = hashMatch[1];
            }
        }

        if (!infoHash) continue;

        const size = parseInt(sizeText, 10) || 0;

        let seeds = 0;
        let peers = 0;
        if (description) {
            const seedsMatch = description.match(/Seeds:\s*(\d+)/i);
            if (seedsMatch) seeds = parseInt(seedsMatch[1], 10) || 0;

            const peersMatch = description.match(/Leechers:\s*(\d+)/i);
            if (peersMatch) peers = parseInt(peersMatch[1], 10) || 0;
        }

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : ("magnet:?xt=urn:btih:" + infoHash + "&dn=" + encodeURIComponent(title));

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            torrentDownloadUrl: enclosureUrl || "",
            publishDate: publishDate
        });
    }

    return results;
}