// ==KiyomiExtension==
// @id            animegg-js
// @name          AnimeGG
// @version       1.0
// @author        Kiyomi Project
// @lang          en
// @icon          https://www.animegg.org/images/favicon.png
// @site          https://www.animegg.org
// @package       animegg.org
// @type          streaming
// @nsfw          false
// @secure        true
// @private       false
// @requiresKey   false
// @description   Streaming provider for AnimeGG using Jsoup and Regex extraction.
// ==/KiyomiExtension==

/**
 * ===== Runtime Metadata =====
 */
const EXTENSION_INFO = {
    id: "animegg-js",
    displayName: "AnimeGG",
    siteUrl: "https://www.animegg.org",
    iconUrl: "https://www.animegg.org/images/favicon.png",
    type: "STREAMING",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0"
};

const BASE_URL = "https://www.animegg.org";

/**
 * Note: Kiyomi.setActiveProvider is handled by the Kotlin Engine 
 * automatically using the database ID. Do not manually override here.
 */

// ---------- Helpers ----------

function httpGet(url, headersObj) {
    const headers = headersObj || {};
    return Kiyomi.httpGet(url, JSON.stringify(headers));
}

/**
 * Safely fixes the quasi-JSON object found in script tags to valid JSON
 */
function fixJson(str) {
    return str.replace(/(\w+):/g, '"$1":')
        .replace(/:\s?([^{\[}\]":\s,]+)/g, ': "$1"')
        .replace(/: "http/g, ': "http');
}

// -------------------- Core Logic --------------------

/**
 * Search for Anime
 * @param {string} query 
 * @param {number} page 
 */
function search(query, page) {
    const p = page || 1;
    let url = (query && query.trim().length > 0)
        ? `${BASE_URL}/search/?q=${encodeURIComponent(query.trim())}`
        : `${BASE_URL}/popular-series?sortBy=hits&sortDirection=DESC&ongoing&limit=50&start=0`;

    const html = httpGet(url);
    const selector = query ? ".mse" : ".fea";
    const elements = JSON.parse(Kiyomi.select(html, selector));

    return elements.map(el => {
        const title = query ? Kiyomi.selectText(el, ".first h2") : Kiyomi.selectText(el, ".rightpop a");
        const href = query ? Kiyomi.attr(el, "href") : Kiyomi.attr(Kiyomi.selectFirstElement(el, ".rightpop a"), "href");
        const thumb = Kiyomi.attr(Kiyomi.selectFirstElement(el, "img"), "src");

        return {
            title: title.trim(),
            url: Kiyomi.resolveUrl(BASE_URL, href),
            poster: Kiyomi.resolveUrl(BASE_URL, thumb),
            type: "anime"
        };
    });
}

/**
 * Fetch Anime details and Genres
 * @param {string} url 
 */
function details(url) {
    const html = httpGet(url);

    let genres = [];
    try {
        genres = JSON.parse(Kiyomi.xpath(html, '//div[contains(@class,"tagscat")]/a/text()'));
    } catch (e) { }

    return {
        title: Kiyomi.selectText(html, ".media-body h1") || "Anime",
        url: url,
        poster: Kiyomi.resolveUrl(BASE_URL, Kiyomi.attr(Kiyomi.selectFirstElement(html, ".media .media-object"), "src")),
        description: Kiyomi.selectText(html, ".ptext"),
        genres: genres,
        status: Kiyomi.selectText(html, ".infoami span:contains(Status)")
            .replace("Status:", "")
            .trim() || "Unknown"
    };
}

/**
 * Fetch list of episodes
 * @param {string} url 
 */
function episodes(url) {
    const html = httpGet(url);
    const elements = JSON.parse(Kiyomi.select(html, ".newmanga li div"));

    return elements.map((el, idx) => {
        const title = Kiyomi.selectText(el, ".anititle");
        const href = Kiyomi.attr(Kiyomi.selectFirstElement(el, ".anm_det_pop"), "href");
        const epSlug = Kiyomi.selectText(el, ".anm_det_pop strong");
        const epNum = parseFloat(Kiyomi.regexFirst(epSlug, "(\\d+\\.?\\d*)", 1)) || (idx + 1);

        return {
            name: title.includes(epNum.toString()) ? title : `Episode ${epNum} - ${title}`,
            url: Kiyomi.resolveUrl(BASE_URL, href),
            number: epNum
        };
    }).sort((a, b) => a.number - b.number);
}

/**
 * Extract stream links from iframes
 * @param {string} url 
 */
function streams(url) {
    const html = httpGet(url);
    const iframes = JSON.parse(Kiyomi.select(html, "iframe"));
    const results = [];

    for (let i = 0; i < iframes.length; i++) {
        const iframeSnippet = iframes[i];
        let iframeUrl = Kiyomi.attr(iframeSnippet, "src");
        if (!iframeUrl) continue;

        iframeUrl = Kiyomi.resolveUrl(BASE_URL, iframeUrl);

        try {
            const playerHtml = httpGet(iframeUrl, { "Referer": url });
            const scriptData = Kiyomi.regexFirst(playerHtml, "var videoSources = ([^;]+)", 1);

            if (scriptData) {
                const hostMatch = iframeUrl.match(/^https?:\/\/[^\/]+/);
                const host = hostMatch ? hostMatch[0] : "";

                const fixedJson = fixJson(scriptData);
                const sources = JSON.parse(fixedJson);

                sources.forEach(source => {
                    results.push({
                        url: host + source.file,
                        quality: `AnimeGG: ${source.label}`,
                        headers: { "Referer": host }
                    });
                });
            }
        } catch (e) {
            Kiyomi.logError("Stream failed for: " + iframeUrl);
        }
    }

    return results;
}