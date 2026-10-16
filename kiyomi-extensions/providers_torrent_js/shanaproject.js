// ==KiyomiExtension==
// @id           shanaproject-js
// @name         Shana Project
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://www.shanaproject.com/favicon.ico
// @site         https://www.shanaproject.com
// @mirrors      https://www.shanaproject.com
// @package      shanaproject.com
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Automated anime torrent aggregator indexing trusted sub groups with clear episode metadata.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_BASE_URL = "https://www.shanaproject.com";

function extractTag(xml, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp("<(?:" + escaped + ")>([\\s\\S]*?)</(?:" + escaped + ")>", "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
            return queryOrContext.query.trim();
        }

        const title = (queryOrContext.titles && queryOrContext.titles[0]) || "";
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";

        if (queryOrContext.mediaType === "batch") {
            return title.trim();
        }

        return `${title} ${ep}`.trim();
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

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_BASE_URL;

    // Shana Project search feed endpoint
    const searchUrl = `${base}/feeds/search/?title=${encodeURIComponent(searchQuery)}`;

    const headers = {
        "Accept": "application/rss+xml, application/xml, text/xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const rssXml = Kiyomi.httpGet(searchUrl, headers);
    if (!rssXml || rssXml.indexOf("<item") === -1) {
        return [];
    }

    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[0];

        const title = extractTag(itemXml, "title");
        const link = extractTag(itemXml, "link");
        const pubDate = extractTag(itemXml, "pubDate");

        const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"/i);
        const enclosureUrl = enclosureMatch ? enclosureMatch[1] : "";

        let magnetUrl = "";
        let infoHash = null;

        if (enclosureUrl.startsWith("magnet:")) {
            magnetUrl = enclosureUrl;
        } else if (link.startsWith("magnet:")) {
            magnetUrl = link;
        }

        if (magnetUrl) {
            const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) infoHash = hashMatch[1];
        }

        if (!title) continue;

        results.push({
            title: title,
            magnetUrl: magnetUrl || undefined,
            torrentDownloadUrl: (!magnetUrl && enclosureUrl) ? enclosureUrl : undefined,
            hash: infoHash,
            size: 0,
            seeds: 0,
            peers: 0,
            infoUrl: link.startsWith("http") ? link : (base + "/"),
            publishDate: pubDate
        });
    }

    return results;
}