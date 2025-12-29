// ==KiyomiExtension==
// @id            dramafull-js
// @name          DramaFull
// @version       1.0
// @author        Kiyomi Project
// @lang          en
// @icon          https://dramafull.cc/favicon.ico
// @site          https://dramafull.cc
// @package       dramafull.cc
// @type          streaming
// @nsfw          false
// @secure        true
// @private       false
// @requiresKey   false
// @description   Streaming provider for Asian Dramas and Movies using DramaFull API.
// ==/KiyomiExtension==

/**
 * ===== Runtime Metadata =====
 */
const EXTENSION_INFO = {
    id: "dramafull-js",
    displayName: "DramaFull",
    siteUrl: "https://dramafull.cc",
    iconUrl: "https://dramafull.cc/favicon.ico",
    type: "STREAMING",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0"
};

const BASE_URL = "https://dramafull.cc";

/**
 * Note: Kiyomi.setActiveProvider is handled by the Kotlin Engine 
 * based on the Extension ID. Manual calls inside the script are removed 
 * to prevent cookie bucket mismatches.
 */

// ---------- Helpers ----------

function httpGet(url, headersObj) {
    const headers = headersObj || {};
    return Kiyomi.httpGet(url, JSON.stringify(headers));
}

function httpPost(url, payload) {
    return Kiyomi.httpPostJson(url, JSON.stringify(payload), null);
}

// -------------------- Core Logic --------------------

/**
 * Search for Dramas or Movies
 */
function search(query, page) {
    const p = page || 1;
    let results = [];

    if (query && query.trim().length > 0) {
        // Live search API
        const response = JSON.parse(httpGet(`${BASE_URL}/api/live-search/${encodeURIComponent(query.trim())}`));
        results = response.data || [];
    } else {
        // Homepage / Filter API (Default to Recently Added)
        const payload = {
            "page": p,
            "type": "-1",
            "country": -1,
            "sort": 1,
            "adult": true,
            "adultOnly": false,
            "ignoreWatched": false,
            "genres": [],
            "keyword": ""
        };
        const response = JSON.parse(httpPost(`${BASE_URL}/api/filter`, payload));
        results = response.data || [];
    }

    return results.map(item => ({
        title: item.name,
        url: `${BASE_URL}/film/${item.slug}`,
        poster: item.image.startsWith("http") ? item.image : BASE_URL + item.image,
        type: "asian-drama"
    }));
}

/**
 * Fetch Drama Details
 */
function details(url) {
    const html = httpGet(url);

    const genres = [];
    const genreElements = JSON.parse(Kiyomi.select(html, "div.genre-list a"));
    genreElements.forEach(el => {
        const text = Kiyomi.selectText(el, "a");
        if (text) genres.push(text);
    });

    return {
        title: Kiyomi.selectText(html, "div.right-info h1") || "Drama",
        url: url,
        poster: Kiyomi.attr(Kiyomi.selectFirstElement(html, "meta[property='og:image']"), "content"),
        description: Kiyomi.selectText(html, "div.right-info p.summary-content"),
        genres: genres,
        status: "Unknown"
    };
}

/**
 * Fetch Episode List
 */
function episodes(url) {
    const html = httpGet(url);
    const episodeElements = JSON.parse(Kiyomi.select(html, "div.episode-item a"));

    if (episodeElements.length === 0) {
        // Movie handling: look for the play button/last episode link
        const movieHref = Kiyomi.attr(Kiyomi.selectFirstElement(html, "div.last-episode a"), "href");
        if (movieHref) {
            return [{ name: "Movie", url: Kiyomi.resolveUrl(BASE_URL, movieHref), number: 1 }];
        }
        return [];
    }

    return episodeElements.map(el => {
        const fullText = Kiyomi.selectText(el, "a"); // e.g. "1 (Sub)"
        const epNumStr = fullText.split("(")[0].trim();
        const href = Kiyomi.attr(el, "href");

        return {
            name: "Episode " + epNumStr,
            url: Kiyomi.resolveUrl(BASE_URL, href),
            number: parseFloat(epNumStr) || 1
        };
    });
}

/**
 * Extract Stream Links and Subtitles
 */
function streams(episodeUrl) {
    const results = [];
    const html = httpGet(episodeUrl);

    // 1. Find the signedUrl in HTML or Script tags
    let signedUrl = Kiyomi.regexFirst(html, 'signedUrl\\s*[:=]\\s*["\']([^"\']+)["\']', 1);

    if (!signedUrl) {
        const scripts = JSON.parse(Kiyomi.select(html, "script"));
        for (let i = 0; i < scripts.length; i++) {
            const content = scripts[i];
            const match = content.match(/signedUrl\s*[:=]\s*["']([^"']+)["']/);
            if (match) {
                signedUrl = match[1];
                break;
            }
        }
    }

    if (!signedUrl) {
        Kiyomi.logError("DramaFull: signedUrl not found");
        return [];
    }

    try {
        const cleanSignedUrl = signedUrl.replace(/\\/g, "");
        const videoDataText = httpGet(cleanSignedUrl, {
            "Referer": episodeUrl,
            "Accept": "application/json"
        });

        const videoData = JSON.parse(videoDataText);
        const videoSource = videoData.video_source;

        if (!videoSource) return [];

        Object.keys(videoSource).forEach(q => {
            const streamUrl = videoSource[q];
            if (!streamUrl) return;

            const subs = [];
            if (videoData.sub && videoData.sub[q]) {
                videoData.sub[q].forEach(path => {
                    subs.push({ url: BASE_URL + path, lang: "English" });
                });
            }

            results.push({
                url: streamUrl,
                quality: q.includes("p") ? q : q + "p",
                subtitles: subs,
                headers: { "Referer": BASE_URL + "/", "Origin": BASE_URL }
            });
        });

    } catch (e) {
        Kiyomi.logError("DramaFull Stream Logic Error: " + e.message);
    }

    return results.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));
}