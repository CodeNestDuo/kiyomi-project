// ==KiyomiExtension==
// @id           anirena-js
// @name         Anirena
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://www.anirena.com/favicon.ico
// @site         https://www.anirena.com
// @mirrors      https://www.anirena.com
// @package      anirena.com
// @type         torrent-rss
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  Provides simple RSS search results primarily for anime content.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://www.anirena.com"
];

function extractTag(xml, tagName) {
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp("<(?:[a-z0-9_-]+:)?" + escaped + ">([\\s\\S]*?)</(?:[a-z0-9_-]+:)?" + escaped + ">", "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

function extractFromDescription(description, pattern) {
    const m = description.match(pattern);
    return m ? m[1].trim() : "0";
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

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let rssXml = "";

    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const url = base + "/rss.php?s=" + encodeURIComponent(searchQuery);

        const response = Kiyomi.httpGet(url, null);
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
        // Anirena stores the magnet link in <comments>
        const magnetUrl = extractTag(itemXml, "comments");
        const pubDate = extractTag(itemXml, "pubDate");
        const description = extractTag(itemXml, "description");

        if (!title || !magnetUrl || !magnetUrl.startsWith("magnet:")) {
            continue;
        }

        const seedsStr = extractFromDescription(description, /(\d+)\s+seeder\(s\)/i);
        const seeds = parseInt(seedsStr, 10) || 0;

        const peersStr = extractFromDescription(description, /(\d+)\s+leecher\(s\)/i);
        const peers = parseInt(peersStr, 10) || 0;

        const sizeRaw = extractFromDescription(description, /,\s*(\d+\.?\d*\s*[KMGT]B)/i);
        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeRaw)) || 0)
            : 0;

        const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1] : null;

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate
        });
    }

    return results;
}