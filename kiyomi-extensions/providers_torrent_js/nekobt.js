// ==KiyomiExtension==
// @id           nekobt-js
// @name         NekoBT
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://nekobt.to/cdn/pfp/null/64
// @site         https://nekobt.to
// @package      nekobt.to
// @type         torznab-rss
// @nsfw         false
// @private      true
// @requiresKey  true
// @description  Specialized private anime indexer providing high-quality torrents via a Torznab API.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_BASE_URL = "https://nekobt.to";

const CATEGORY_MAP = {
    "All": "0",
    "Anime": "5070"
};

function extractTag(xml, tagName) {
    const re = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

function extractTorznabAttr(xml, attrName) {
    const re = new RegExp('<torznab:attr[^>]*name="' + attrName + '"[^>]*value="([^"]+)"[^>]*>', "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Resolves the query from a string or TorrentQueryContext.
 */
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

    const apiKey = (typeof KIYOMI_API_KEY === "string") ? KIYOMI_API_KEY : "";
    if (!apiKey) {
        if (typeof Kiyomi.error === "function") {
            Kiyomi.error("NekoBT API key missing. Configure it in Extension settings.");
        }
        return [];
    }

    const searchQuery = resolveQuery(queryOrContext);
    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["Anime"] || "0";

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_BASE_URL;

    const url = base + "/api/torznab/api?t=search"
        + "&q=" + encodeURIComponent(searchQuery)
        + "&cat=" + encodeURIComponent(catId)
        + "&apikey=" + encodeURIComponent(apiKey);

    const rssXml = Kiyomi.httpGet(url, null);
    if (!rssXml) return [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        const infoUrl = extractTag(itemXml, "comments") || extractTag(itemXml, "guid");
        const pubDate = extractTag(itemXml, "pubDate");

        const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
        const torrentDownloadUrl = enclosureMatch ? enclosureMatch[1] : "";

        const hash = extractTorznabAttr(itemXml, "infohash");
        const magnetAttr = extractTorznabAttr(itemXml, "magneturl");
        const sizeStr = extractTorznabAttr(itemXml, "size");
        const seedsStr = extractTorznabAttr(itemXml, "seeders");
        const peersStr = extractTorznabAttr(itemXml, "peers") || extractTorznabAttr(itemXml, "leechers");

        if (!title || (!hash && !magnetAttr)) continue;

        const size = parseInt(sizeStr, 10) || 0;
        const seeds = parseInt(seedsStr, 10) || 0;
        const peers = parseInt(peersStr, 10) || 0;

        const magnetUrl = (magnetAttr && magnetAttr.length > 0)
            ? magnetAttr
            : ((hash && typeof Kiyomi.buildMagnetFromHash === "function")
                ? Kiyomi.buildMagnetFromHash(hash, title)
                : "");

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash || null,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate,
            torrentDownloadUrl: torrentDownloadUrl
        });
    }

    return results;
}