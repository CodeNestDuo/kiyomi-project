// ==KiyomiExtension==
// @id            animepahe-js
// @name          AnimePahe
// @version       1.1
// @author        Kiyomi Project
// @lang          en
// @icon          https://animepahe.si/favicon.ico
// @site          https://animepahe.si
// @package       animepahe.si
// @type          streaming
// @nsfw          false
// @secure        true
// @private       false
// @requiresKey   false
// @description   Stable production provider for AnimePahe with deobfuscator for Kwik streams.
// ==/KiyomiExtension==

/**
 * ===== Runtime Metadata =====
 */
const EXTENSION_INFO = {
    id: "animepahe-js",
    displayName: "AnimePahe",
    siteUrl: "https://animepahe.si",
    iconUrl: "https://animepahe.si/favicon.ico",
    type: "STREAMING",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.1"
};

const BASE_URL = "https://animepahe.si";

/**
 * Note: Kiyomi.setActiveProvider(PROVIDER_ID) is removed.
 * The Kotlin Engine sets the active provider scope automatically 
 * based on the installed extension's ID.
 */

// ---------- Helpers ----------

function httpGet(url, headersObj) {
    const headersJson = headersObj ? JSON.stringify(headersObj) : null;
    return Kiyomi.httpGet(url, headersJson);
}

function regexAll(input, pattern, group) {
    try {
        return JSON.parse(Kiyomi.regexAll(input, pattern, group));
    } catch (e) {
        return [];
    }
}

function getSession(title, animeId) {
    const searchRes = JSON.parse(httpGet(`${BASE_URL}/api?m=search&q=${encodeURIComponent(title)}`));
    const match = (searchRes.data || []).find(x => String(x.id) === String(animeId));
    return match ? match.session : "";
}

// -------------------- Core Logic --------------------

/**
 * Search for Anime
 */
function search(query, page) {
    const p = page || 1;
    const url = query
        ? `${BASE_URL}/api?m=search&l=8&q=${encodeURIComponent(query)}`
        : `${BASE_URL}/api?m=airing&page=${p}`;

    const json = JSON.parse(httpGet(url, { "Referer": BASE_URL + "/" }));

    return (json.data || []).map(item => ({
        title: item.title || item.anime_title,
        url: `${BASE_URL}/anime/?anime_id=${item.id}&name=${encodeURIComponent(item.title || item.anime_title)}`,
        poster: item.poster || item.snapshot,
        type: "anime"
    }));
}

/**
 * Fetch Anime Details
 */
function details(url) {
    const id = Kiyomi.regexFirst(url, "anime_id=([^&]+)", 1);
    const name = Kiyomi.regexFirst(url, "name=([^&]+)", 1);
    const session = getSession(decodeURIComponent(name), id);
    const html = httpGet(`${BASE_URL}/anime/${session}?anime_id=${id}`, { "Referer": BASE_URL });

    return {
        title: Kiyomi.selectText(html, "div.title-wrapper > h1 > span") || "Anime",
        url: url,
        poster: Kiyomi.regexFirst(html, 'div\\.anime-poster a\\s*href="([^"]+)"', 1),
        description: Kiyomi.selectText(html, "div.anime-summary").trim(),
        genres: JSON.parse(Kiyomi.xpath(html, '//*[contains(@class,"anime-genre")]/ul/li/text()')),
        status: (Kiyomi.regexFirst(html, 'Status:\\s*([^<]+)', 1) || "").trim()
    };
}

/**
 * Fetch Episode List with Pagination
 */
function episodes(url) {
    const id = Kiyomi.regexFirst(url, "anime_id=([^&]+)", 1);
    const name = Kiyomi.regexFirst(url, "name=([^&]+)", 1);
    const session = getSession(decodeURIComponent(name), id);

    let allEpisodes = [];
    let currentPage = 1;
    let lastPage = 1;

    do {
        const apiUrl = `${BASE_URL}/api?m=release&id=${session}&sort=episode_asc&page=${currentPage}`;
        const response = JSON.parse(httpGet(apiUrl));

        if (!response || !response.data) break;

        const pageItems = response.data.map(item => ({
            name: `Episode ${item.episode}`,
            url: `/play/${session}/${item.session}`,
            number: parseFloat(item.episode),
            thumbnail: item.snapshot
        }));

        allEpisodes = allEpisodes.concat(pageItems);
        currentPage++;
        lastPage = response.last_page || 1;

        if (currentPage > 100) break;

    } while (currentPage <= lastPage);

    return allEpisodes.sort((a, b) => a.number - b.number);
}

/**
 * Extract Stream Links and Deobfuscate Kwik
 */
function streams(url) {
    const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
    const headers = {
        "Referer": BASE_URL + "/",
        // Consistent User-Agent is vital for ddos-guard bypass
        "User-Agent": "Mozilla/5.0 (Linux; Android 16) sdk_gphone64_x86_64 Build/BE2A.250530.026.D1 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
    };

    const html = httpGet(fullUrl, headers);
    const kwikLinks = regexAll(html, 'data-src="([^"]+)"', 1);
    const resolutions = regexAll(html, '<button[^>]*class="dropdown-item"[^>]*>([^<]+)</button>', 1);

    const results = [];
    for (let i = 0; i < kwikLinks.length; i++) {
        const link = kwikLinks[i];
        if (!link.includes("kwik.cx")) continue;

        try {
            const kwikHtml = httpGet(link, { "Referer": BASE_URL });

            const unpacked = Kiyomi.unpackJs(kwikHtml);
            const deobfuscated = Kiyomi.deobfuscateJsPassword(unpacked);
            const searchPool = unpacked + " " + deobfuscated;

            const videoUrl = Kiyomi.regexFirst(searchPool, "['\"](https?://[^'\"\\s]+?\\.m3u8[^'\"\\s]*?)['\"]", 1);

            if (videoUrl) {
                const cleanUrl = videoUrl.replace(/\\/g, "");
                results.push({
                    url: cleanUrl,
                    quality: resolutions[i] || "Unknown",
                    headers: { "Referer": "https://kwik.cx" }
                });
            } else {
                Kiyomi.logError("Extraction failed for: " + link);
            }
        } catch (e) {
            Kiyomi.logError("Logic error in streams: " + e.message);
        }
    }

    return results.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
}