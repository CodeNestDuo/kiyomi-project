// ==KiyomiExtension==
// @id           filemood-js
// @name         FileMood
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://filemood.com/favicon.ico
// @site         https://filemood.com
// @mirrors      https://filemood.com
// @package      filemood.com
// @type         html-scrape
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  Scrapes FileMood torrent search engine with offset-based pagination and status metrics.
// @primaryCategory general
// @extraCategories movie, tv
// ==/KiyomiExtension==

const DEFAULT_BASE_URL = "https://filemood.com";
const MAX_REQUESTS = 2;
const MAX_RESULTS = 40;
const RESULTS_PER_PAGE = 20;

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

function parseTableRows(html, baseUrl) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const results = [];
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const row = match[1];

        // Match Title and Details URL (td.dn-title & link)
        const nameMatch = row.match(/href=["'](\/download\/([a-f0-9]{40})[^"']*)["'][^>]*title=["']([^"']+)["']/i)
            || row.match(/href=["'](\/download\/([a-f0-9]{40})[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);

        if (!nameMatch) continue;

        const path = nameMatch[1];
        const infoHash = nameMatch[2].toLowerCase();
        const title = (nameMatch[3] || "").replace(/<.*?>/g, "").trim();

        if (!title || !infoHash) continue;

        // Extract Seeds/Peers (td.dn-status -> e.g. "12/4")
        const statsMatch = row.match(/([0-9,]+)\s*\/\s*([0-9,]+)/);
        const seeds = statsMatch ? (parseInt(statsMatch[1].replace(/,/g, ""), 10) || 0) : 0;
        const peers = statsMatch ? (parseInt(statsMatch[2].replace(/,/g, ""), 10) || 0) : 0;

        // Extract Size (e.g. "1.45 GB")
        const sizeMatch = row.match(/([0-9.,]+\s*(?:TB|GB|MB|KB))/i);
        const sizeRaw = sizeMatch ? sizeMatch[1].trim() : "";
        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeRaw)) || 0)
            : 0;

        const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : ("magnet:?xt=urn:btih:" + infoHash + "&dn=" + encodeURIComponent(title));

        const infoUrl = path.startsWith("http") ? path : (baseUrl.replace(/\/+$/, "") + path);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: ""
        });
    }

    return results;
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

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    const allItems = [];
    let page = 0;

    while (page < MAX_REQUESTS && allItems.length < MAX_RESULTS) {
        const offset = page * RESULTS_PER_PAGE;
        const url = base + "/result?q=" + encodeURIComponent(searchQuery).replace(/%20/g, "+") + "+in%3Atitle&f=" + offset;

        const html = Kiyomi.httpGet(url, headers);
        if (!html) break;

        const pageItems = parseTableRows(html, base);
        if (pageItems.length === 0) break;

        for (let i = 0; i < pageItems.length; i++) {
            if (allItems.length >= MAX_RESULTS) break;
            allItems.push(pageItems[i]);
        }

        page++;
    }

    return allItems;
}