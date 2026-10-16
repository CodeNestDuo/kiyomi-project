// ==KiyomiExtension==
// @id           uindex-js
// @name         UIndex
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://uindex.org/favicon.ico
// @site         https://uindex.org
// @mirrors      https://uindex.org
// @package      uindex.org
// @type         html-scrape
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Indexes torrents with magnet URLs across Anime, Movies, TV, and Games.
// @primaryCategory general
// @extraCategories anime, movie, tv, games
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://uindex.org"
];

const CATEGORY_MAP = {
    "All": "0",
    "Movies": "1",
    "Series": "2",
    "TV": "2",
    "Games": "3",
    "Music": "4",
    "Apps": "5",
    "Porn": "6",
    "XXX": "6",
    "Anime": "7",
    "Other": "8"
};

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

    let catId = CATEGORY_MAP[category] || "0";
    if (typeof queryOrContext === "object" && queryOrContext !== null && catId === "0") {
        if (queryOrContext.mediaType === "movie") catId = "1";
        else catId = "7"; // default to Anime category for context queries
    }

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const base = candidateBases[0];
    const searchUrl = `${base}/search.php?search=${encodeURIComponent(searchQuery)}&c=${catId}`;

    const headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const html = Kiyomi.httpGet(searchUrl, headers);
    if (!html || html.indexOf("sr-torrent-link") === -1) {
        return [];
    }

    // Match each table row inside the results table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const results = [];
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const rowHtml = match[1];

        // 1. Magnet link (a.sr-magnet)
        const magnetMatch = rowHtml.match(/<a[^>]+class=["'][^"']*sr-magnet[^"']*["'][^>]+href=["'](magnet:\?[^"']+)["']/i)
            || rowHtml.match(/href=["'](magnet:\?[^"']+)["']/i);
        if (!magnetMatch) continue;
        const magnetUrl = magnetMatch[1];

        // 2. Title & details URL (a.sr-torrent-link)
        const nameMatch = rowHtml.match(/<a[^>]+class=["'][^"']*sr-torrent-link[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!nameMatch) continue;

        const detailsPath = nameMatch[1];
        const title = nameMatch[2].replace(/<.*?>/g, "").trim();
        if (!title) continue;

        // 3. Size (td.sr-col-size)
        const sizeMatch = rowHtml.match(/<td[^>]+class=["'][^"']*sr-col-size[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
        const sizeRaw = sizeMatch ? sizeMatch[1].replace(/<.*?>/g, "").trim() : "";
        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeRaw)) || 0)
            : 0;

        // 4. Seeds (span.sr-seed)
        const seedsMatch = rowHtml.match(/<span[^>]+class=["'][^"']*sr-seed[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        const seeds = seedsMatch ? (parseInt(seedsMatch[1].replace(/[, ]/g, ""), 10) || 0) : 0;

        // 5. Peers (span.sr-leech)
        const peersMatch = rowHtml.match(/<span[^>]+class=["'][^"']*sr-leech[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        const peers = peersMatch ? (parseInt(peersMatch[1].replace(/[, ]/g, ""), 10) || 0) : 0;

        // 6. Upload date
        const dateMatch = rowHtml.match(/<td[^>]+class=["'][^"']*sr-col-uploaded[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
        const uploadDate = dateMatch ? dateMatch[1].replace(/<.*?>/g, "").trim() : "";

        const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1] : null;

        const infoUrl = detailsPath.startsWith("http")
            ? detailsPath
            : (base + "/" + detailsPath.replace(/^\/+/, ""));

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: uploadDate
        });
    }

    return results;
}