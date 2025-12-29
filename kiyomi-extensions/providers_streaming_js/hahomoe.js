// ==KiyomiExtension==
// @id            hahomoe-js
// @name          Haho.moe
// @version       1.0
// @author        Kiyomi Project
// @lang          en
// @icon          https://haho.moe/favicon.ico
// @site          https://haho.moe
// @package       haho.moe
// @type          streaming
// @nsfw          true
// @secure        true
// @private       false
// @requiresKey   false
// @description   Streaming provider for Haho.moe with cookie-based thumb view support.
// ==/KiyomiExtension==

/**
 * ===== Runtime Metadata =====
 */
const EXTENSION_INFO = {
    id: "hahomoe-js",
    displayName: "Haho.moe",
    siteUrl: "https://haho.moe",
    iconUrl: "https://haho.moe/favicon.ico",
    type: "STREAMING",
    isAdult: true,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0"
};

const BASE_URL = "https://haho.moe";

/**
 * Note: Kiyomi.setActiveProvider is handled by the Kotlin Engine 
 * based on the Extension ID. Manual calls are removed here to 
 * prevent session/cookie bucket mismatches in VOD search.
 */

// ---------- Helpers ----------

function httpGet(url, headersObj) {
    const headers = headersObj || {};
    // Ensure loop-view is always thumb for consistent scraping
    headers["Cookie"] = (headers["Cookie"] ? headers["Cookie"] + "; " : "") + "loop-view=thumb";
    return Kiyomi.httpGet(url, JSON.stringify(headers));
}

// -------------------- Core Logic --------------------

/**
 * Search for Anime
 */
function search(query, page) {
    const p = page || 1;
    let url = (query && query.trim().length > 0)
        ? `${BASE_URL}/anime?page=${p}&s=vdy-d&q=${encodeURIComponent(query.trim())}`
        : `${BASE_URL}/anime?s=vdy-d&page=${p}`;

    const html = httpGet(url);

    const elements = JSON.parse(Kiyomi.select(html, "ul.anime-loop.loop > li > a"));

    return elements.map(el => {
        const href = Kiyomi.attr(el, "href");
        const title = Kiyomi.selectText(el, "div.label > span, div span.thumb-title");

        const imgTag = Kiyomi.selectFirstElement(el, "img");
        const thumb = imgTag ? Kiyomi.attr(imgTag, "src") : "";

        return {
            title: title,
            url: href.startsWith("http") ? href + "?s=srt-d" : BASE_URL + href + "?s=srt-d",
            poster: thumb,
            type: "anime"
        };
    });
}

/**
 * Fetch Anime Details
 */
function details(url) {
    const html = httpGet(url);
    let genres = [];
    try {
        genres = JSON.parse(Kiyomi.xpath(html, '//li[contains(@class,"genre")]//span[contains(@class,"value")]/text() | //div[contains(@class,"genre-tree")]//ul/li/a/text()'));
    } catch(e) {}

    const imgTag = Kiyomi.selectFirstElement(html, "img.cover-image.img-thumbnail");
    return {
        title: Kiyomi.selectText(html, "li.breadcrumb-item.active") || "Anime",
        url: url,
        poster: imgTag ? Kiyomi.attr(imgTag, "src") : "",
        description: Kiyomi.selectText(html, "div.card-body"),
        genres: genres,
        status: Kiyomi.selectText(html, "li.status span.value") || "Unknown"
    };
}

/**
 * Fetch Episode List (Handles up to 5 pages)
 */
function episodes(url) {
    let allEpisodes = [];
    let currentUrl = url;
    let pageCount = 0;

    while (currentUrl && pageCount < 5) { 
        const html = httpGet(currentUrl);
        const elements = JSON.parse(Kiyomi.select(html, "ul.episode-loop > li > a"));

        const pageEpisodes = elements.map(el => {
            const epText = Kiyomi.selectText(el, "div.episode-number, div.episode-slug") || "Episode";
            const titlePart = Kiyomi.selectText(el, "div.episode-label, div.episode-title");

            return {
                name: (titlePart && titlePart.toLowerCase() !== "no title") ? `${epText}: ${titlePart}` : epText,
                url: Kiyomi.attr(el, "href"),
                number: parseFloat(epText.replace(/[^\d.]/g, "")) || 0
            };
        });

        allEpisodes = allEpisodes.concat(pageEpisodes);

        const nextAnchor = Kiyomi.selectFirstElement(html, "ul.pagination li.page-item a[rel=next]");
        currentUrl = nextAnchor ? Kiyomi.attr(nextAnchor, "href") : null;
        if (currentUrl && !currentUrl.startsWith("http")) currentUrl = BASE_URL + currentUrl;
        pageCount++;
    }
    return allEpisodes.sort((a, b) => a.number - b.number);
}

/**
 * Extract Stream Links
 */
function streams(url) {
    const fullUrl = url.startsWith("http") ? url : BASE_URL + url;
    const html = httpGet(fullUrl);

    const iframeTag = Kiyomi.selectFirstElement(html, "iframe");
    const iframeUrl = iframeTag ? Kiyomi.attr(iframeTag, "src") : null;
    if (!iframeUrl) return [];

    const iframeHtml = httpGet(iframeUrl, { "Referer": fullUrl });
    const sources = JSON.parse(Kiyomi.select(iframeHtml, "source"));

    return sources.map(el => ({
        url: Kiyomi.attr(el, "src"),
        quality: Kiyomi.attr(el, "title") || "Unknown",
        headers: { "Referer": iframeUrl }
    }));
}