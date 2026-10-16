// ==KiyomiExtension==
// @id           tokyotosho-js
// @name         TokyoTosho
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://www.tokyotosho.info/favicon.ico
// @site         https://www.tokyotosho.info
// @mirrors      https://www.tokyotosho.info
// @package      tokyotosho.info
// @type         torrent-rss
// @nsfw         true
// @private      false
// @requiresKey  false
// @description  General Eastern media index, including Anime, Manga, and non-video media.
// @primaryCategory anime
// @extraCategories manga, drama, hentai
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://www.tokyotosho.info"
];

const CATEGORY_MAP = {
    "All": "0",
    "Anime": "1",
    "Non-English": "10",
    "Manga": "3",
    "Drama": "8",
    "Music": "2",
    "Music Video": "9",
    "Raws": "7",
    "Hentai": "4",
    "Hentai (Anime)": "12",
    "Hentai (Manga)": "13",
    "Hentai (Games)": "14",
    "Batch": "11",
    "JAV": "15",
    "Other": "5"
};

function extractTag(xml, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = xml.match(new RegExp("<(?:" + escaped + ")>([\\s\\S]*?)</(?:" + escaped + ")>", "i"));
    return m ? m[1].trim() : "";
}

function extractAnchorUrl(cdata, textMatch) {
    const m = cdata.match(new RegExp('<a[^>]+href="([^"]+)"[^>]*>' + textMatch + '<\\/a>', "i"));
    return m ? m[1].trim() : null;
}

function extractCdataValue(cdata, key) {
    const m = cdata.match(new RegExp(key + ":\\s*([^<]+)<br\\s*\\/?>", "i"));
    return m ? m[1].trim() : null;
}

/**
 * Resolves optimal search parameters from string query or TorrentQueryContext.
 */
function resolveQueryAndCategory(queryOrContext, defaultCategory) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        let cat = defaultCategory;
        if (queryOrContext.mediaType === "batch") {
            cat = "Batch";
        }

        // If queryContext has a manual/edited query, use it
        if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
            return { query: queryOrContext.query.trim(), category: cat };
        }

        // Auto-compose from titles + season + episode
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

        return { query: built.trim(), category: cat };
    }

    return { query: String(queryOrContext || "").trim(), category: defaultCategory };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const resolved = resolveQueryAndCategory(queryOrContext, category || "Anime");
    const catId = CATEGORY_MAP[resolved.category] || CATEGORY_MAP["Anime"] || "0";

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        let searchUrl = base + "/rss.php?";
        if (catId !== "0") {
            searchUrl += "filter=" + encodeURIComponent(catId) + "&";
        }
        searchUrl += "terms=" + encodeURIComponent(resolved.query) + "&reversepolarity=1";

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
        const pubDate = extractTag(itemXml, "pubDate");

        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i);
        const cdata = descMatch ? descMatch[1].trim() : "";
        if (!cdata) continue;

        const magnetMatch = cdata.match(/href="(magnet:[^"]+)"/i);
        const magnetUrl = magnetMatch ? magnetMatch[1] : "";
        if (!title || !magnetUrl) continue;

        const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1] : null;

        const sizeRaw = extractCdataValue(cdata, "Size");
        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? Number(Kiyomi.humanSizeToBytes(sizeRaw || "")) || 0
            : 0;

        const infoUrl = extractAnchorUrl(cdata, "Tokyo Tosho");

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: 0,
            peers: 0,
            infoUrl: infoUrl,
            publishDate: pubDate
        });
    }

    return results;
}