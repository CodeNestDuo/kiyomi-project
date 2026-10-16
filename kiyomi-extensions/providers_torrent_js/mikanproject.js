// ==KiyomiExtension==
// @id           mikanproject-js
// @name         Mikan Project
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://mikanani.me/favicon.ico
// @site         https://mikanani.me
// @mirrors      https://mikanani.me,https://mikanime.tv
// @package      mikanani.me
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Dedicated indexer for Japanese animation, known for fast release indexing.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://mikanani.me",
    "https://mikanime.tv"
];

function decodeHtmlEntities(text) {
    if (!text) return "";
    return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, function (_m, entity) {
        switch (entity) {
            case "amp": return "&";
            case "lt": return "<";
            case "gt": return ">";
            case "quot": return '"';
            case "apos": return "'";
        }
        if (entity.charAt(0) === "#") {
            const code = entity.charAt(1).toLowerCase() === "x"
                ? parseInt(entity.slice(2), 16)
                : parseInt(entity.slice(1), 10);
            if (!isNaN(code)) return String.fromCharCode(code);
        }
        return "&" + entity + ";";
    });
}

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        // Prioritize native/CJK title for MikanProject if present, otherwise primary title/query
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

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const headers = {
        "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.5"
    };

    let rssText = "";
    let activeBase = candidateBases[0];

    for (let i = 0; i < candidateBases.length; i++) {
        activeBase = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = activeBase + "/RSS/Search?searchstr=" + encodeURIComponent(searchQuery);

        const response = Kiyomi.httpGet(searchUrl, headers);
        if (response && response.indexOf("<item") !== -1) {
            rssText = response;
            break;
        }
    }

    if (!rssText) return [];

    const items = [];
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(rssText)) !== null) {
        const block = match[0];

        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        const title = decodeHtmlEntities(titleMatch ? titleMatch[1].trim() : "");

        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
        const descLink = decodeHtmlEntities(linkMatch ? linkMatch[1].trim() : "");

        const enclosureMatch = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*length="([^"]+)"[^>]*\/?>/i);
        let torrentUrl = "";
        let sizeBytes = 0;

        if (enclosureMatch) {
            torrentUrl = enclosureMatch[1];
            sizeBytes = parseInt(enclosureMatch[2], 10) || 0;
        } else {
            torrentUrl = descLink;
        }

        if (!title || !torrentUrl) continue;

        let publishDate = "";
        const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        if (pubDateMatch) {
            publishDate = pubDateMatch[1].trim();
        }

        let magnetUrl = "";
        let torrentDownloadUrl = "";
        let infoHash = null;

        if (torrentUrl.indexOf("magnet:?") === 0) {
            magnetUrl = torrentUrl;
            const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) infoHash = hashMatch[1];
        } else {
            torrentDownloadUrl = torrentUrl.startsWith("http") ? torrentUrl : (activeBase + "/" + torrentUrl.replace(/^\/+/, ""));
        }

        items.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentDownloadUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: 0,
            peers: 0,
            infoUrl: descLink || activeBase,
            publishDate: publishDate
        });
    }

    return items;
}