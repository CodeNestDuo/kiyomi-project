// ==KiyomiExtension==
// @id           btdig-js
// @name         BTDigg
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://www.btdig.com/favicon.ico
// @site         https://www.btdig.com
// @mirrors      https://www.btdig.com
// @package      btdig.com
// @type         html-scrape
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Global search engine utilizing the DHT network; excellent for locating older, large, or rare Asian media archives.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://www.btdig.com"
];

const CONFIG = {
    MAX_PAGES: 2,
    MAX_RESULTS: 40
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

function parsePageHtml(htmlContent, engineUrl) {
    const itemRegex = /<div[^>]*class=["']one_result["'][^>]*>[\s\S]*?(?=<div[^>]*class=["']one_result["']|<\/body>|$)/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(htmlContent)) !== null) {
        const block = match[0];

        const magnetMatch = block.match(/<a[^>]+href="(magnet:\?xt=urn:btih:[^"]+)"/i);
        const nameMatch = block.match(/<div[^>]*class=["']torrent_name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const sizeMatch = block.match(/<span[^>]*class=["']torrent_size["'][^>]*>([\s\S]*?)<\/span>/i);
        const descLinkMatch = block.match(/<div[^>]*class=["']torrent_name["'][^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i);

        if (!magnetMatch || !nameMatch) continue;

        const magnetUrl = magnetMatch[1];
        const title = (nameMatch[1] || "").replace(/<.*?>/g, "").trim();
        const sizeRaw = (sizeMatch ? sizeMatch[1] : "").replace(/&nbsp;/g, " ").trim();
        const infoPath = descLinkMatch ? descLinkMatch[1] : "";

        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeRaw)) || 0)
            : 0;

        const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1] : null;

        const infoUrl = infoPath.startsWith("http")
            ? infoPath
            : (infoPath ? (engineUrl + infoPath) : "");

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: 0,
            peers: 0,
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

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const base = candidateBases[0];
    const searchParam = encodeURIComponent(searchQuery).replace(/%20/g, "+");

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    const results = [];

    for (let page = 0; page < CONFIG.MAX_PAGES; page++) {
        const url = (page === 0)
            ? (base + "/search?q=" + searchParam + "&order=0")
            : (base + "/search?q=" + searchParam + "&p=" + page + "&order=0");

        const html = Kiyomi.httpGet(url, headers);
        if (!html || html.indexOf("one_result") === -1) {
            break;
        }

        const pageItems = parsePageHtml(html, base);
        for (let i = 0; i < pageItems.length; i++) {
            results.push(pageItems[i]);
            if (results.length >= CONFIG.MAX_RESULTS) break;
        }

        if (results.length >= CONFIG.MAX_RESULTS || pageItems.length < 10) {
            break;
        }
    }

    return results;
}