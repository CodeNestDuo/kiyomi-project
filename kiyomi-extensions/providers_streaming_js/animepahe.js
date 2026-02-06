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
    const mainHtml = Kiyomi.httpGet(fullUrl, null);
    
    const buttons = JSON.parse(Kiyomi.select(mainHtml, "#resolutionMenu > button") || "[]");
    const results = [];

    buttons.forEach((btnHtml) => {
        const quality = Kiyomi.selectText(btnHtml, "button");
        const kwikUrl = Kiyomi.attr(btnHtml, "data-src"); 

        if (!kwikUrl) return;

        try {
            const kwikHtml = Kiyomi.httpGet(kwikUrl, JSON.stringify({ "Referer": "https://animepahe.si/" }));

            // 1. Unpack the script using the bridge
            const decrypted = Kiyomi.unpackJs(kwikHtml);

            // 2. BROAD URL REGEX (This ignores variable names like 'source' or 'q')
            // It looks for any string starting with http and ending with .m3u8 or .mp4
            const linkMatch = decrypted.match(/['"](https?:\/\/[^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i);

            if (linkMatch) {
                let streamUrl = linkMatch[1].replace(/\\/g, ""); // Remove backslashes
                
                Kiyomi.logDebug(`[Success] Found link for ${quality}: ${streamUrl}`);
                
                results.push({
                    url: streamUrl,
                    quality: quality + (streamUrl.includes(".m3u8") ? " (m3u8)" : ""),
                    headers: { 
                        "Referer": "https://kwik.cx/",
                        "User-Agent": "Mozilla/5.0 (Linux; Android 16)" 
                    }
                });
            } else {
                // 3. FALLBACK: Check for the POST form (Legacy Kwik)
                const postMatch = decrypted.match(/action=['"]([^'"]+)['"]/i);
                const tokenMatch = decrypted.match(/value=['"]([a-zA-Z0-9]{40,})['"]/i)
                                || decrypted.match(/_token['"]?\s*[:=]\s*['"]([^'"]+)["']/i);

                if (postMatch && tokenMatch) {
                    const mp4Url = Kiyomi.httpPostForm(postMatch[1], JSON.stringify({"_token": tokenMatch[1]}), JSON.stringify({"Referer": kwikUrl}));
                    if (mp4Url && mp4Url.includes(".mp4")) {
                        results.push({
                            url: mp4Url,
                            quality: quality,
                            headers: { "Referer": "https://kwik.cx/", "User-Agent": "Mozilla/5.0" }
                        });
                    }
                }
            }
        } catch (e) {
            Kiyomi.logError("Kwik fail: " + e.message);
        }
    });

    // CRITICAL: Filter empty results to stop the Android 'Invalid resource ID' crash
    const finalResults = results.filter(r => r.url && r.url.length > 10);
    
    Kiyomi.logDebug(`[Final] Returning ${finalResults.length} links to UI.`);
    return finalResults.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
}