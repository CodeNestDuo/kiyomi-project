// ==KiyomiExtension==
// @id           torrentdownload-js
// @name         TorrentDownload
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://torrentdownload.info/favicon.ico
// @site         https://torrentdownload.info
// @mirrors      https://torrentdownload.info
// @package      torrentdownload.info
// @type         html-scrape
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Indexes torrents across all categories directly via torrentdownload.info search.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://torrentdownload.info"
];

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

    const base = candidateBases[0];
    const searchUrl = `${base}/search?q=${encodeURIComponent(searchQuery)}`;

    const headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const html = Kiyomi.httpGet(searchUrl, headers);
    if (!html || html.indexOf("No Results Found") !== -1) {
        return [];
    }

    // Match rows within table.table2
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const results = [];
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const rowHtml = match[1];

        // Ensure row has link to details page
        const linkMatch = rowHtml.match(/<div[^>]+class=["'][^"']*tt-name[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;

        const detailsPath = linkMatch[1];
        const title = linkMatch[2].replace(/<.*?>/g, "").trim();
        if (!title) continue;

        // Path format on torrentdownload.info: /{hash_40_hex}/{slug}
        const hashMatch = detailsPath.match(/\/([A-Fa-f0-9]{40})/);
        if (!hashMatch) continue;

        const infoHash = hashMatch[1].toLowerCase();

        // Match table columns for metadata
        const cells = [];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let cMatch;
        while ((cMatch = cellRegex.exec(rowHtml)) !== null) {
            cells.push(cMatch[1].replace(/<.*?>/g, "").trim());
        }

        // Expected order: [Name/Cat, Date, Size, Seeds, Peers]
        const uploadDate = cells[1] || "";
        const sizeRaw = cells[2] || "";
        const seeds = parseInt((cells[3] || "0").replace(/[, ]/g, ""), 10) || 0;
        const peers = parseInt((cells[4] || "0").replace(/[, ]/g, ""), 10) || 0;

        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeRaw)) || 0)
            : 0;

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;

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