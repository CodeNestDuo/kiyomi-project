// ==KiyomiExtension==
// @id             cloudtorrents-js
// @name           CloudTorrents
// @version        1.0.0 
// @author         Matthew Turland (ported for Kiyomi by Kiyomi Community)
// @lang           all
// @icon           https://cloudtorrents.com/favicon.ico
// @site           https://cloudtorrents.com
// @package        cloudtorrents.com
// @type           api-json
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Uses the CloudTorrents JSON API to fetch torrent results with simple pagination.
// @primaryCategory general
// @extraCategories movie, tv, anime
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "cloudtorrents-js",
    displayName: "CloudTorrents",
    siteUrl: "https://cloudtorrents.com",
    iconUrl: "https://cloudtorrents.com/favicon.ico",
    type: "API_JSON",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// ===== Category handling map for UI =====
const CATEGORY_MAP = {
    // Key: UI Label, Value: API Code resolved by resolveCategoryCode()
    "All": null,
    "Anime": "1",
    "Software": "2",
    "Books": "3",
    "Games": "4",
    "Movies": "5",
    "Music": "6",
    "TV Shows": "8"
    // Note: The values here are arbitrary string indicators for the UI.
    // The actual mapping logic is done in resolveCategoryCode(category).
};

// ===== Provider URLs =====
const CLOUDTORRENTS_BASE = "https://cloudtorrents.com";
const CLOUDTORRENTS_API_BASE = "https://api.cloudtorrents.com";

// ===== Tuning knobs (easy to tweak later) =====
const CT_CONFIG = {
    /**
     * Maximum number of results returned to Kiyomi.
     * Example: 20 → at most 20 items.
     */
    MAX_RESULTS: 50,

    /**
     * Maximum number of HTTP requests (pages) we make to the API.
     * Example: 2 → at most 2 calls to /search (2 * limit results max).
     */
    MAX_REQUESTS: 2,

    /**
     * The `limit` parameter we send to CloudTorrents API per request.
     * We control this – it is NOT the site's internal page size.
     */
    API_LIMIT: 50
};


// ===== Category handling =====

/**
 * Map Kiyomi-ish categories to CloudTorrents torrent_type codes.
 */
function resolveCategoryCode(category) {
    if (!category) return null;
    const normalized = String(category).trim().toLowerCase();

    switch (normalized) {
        case "anime":
            return "1";
        case "software":
        case "apps":
            return "2";
        case "books":
        case "ebook":
        case "ebooks":
            return "3";
        case "games":
            return "4";
        case "movies":
        case "movie":
        case "film":
            return "5";
        case "music":
            return "6";
        case "tv":
        case "tvshows":
        case "tv-shows":
        case "series":
            return "8";
        case "all":
        default:
            return null; // no category filter
    }
}


// ===== Small helpers =====

/**
 * Simple querystring builder (no browser APIs needed).
 */
function buildQueryString(params) {
    const parts = [];
    for (const key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        const value = params[key];
        if (value === undefined || value === null || value === "") continue;
        parts.push(
            encodeURIComponent(key) + "=" + encodeURIComponent(String(value))
        );
    }
    return parts.join("&");
}

/**
 * Parse a single CloudTorrents JSON page into Kiyomi torrent objects.
 * @param {object} decoded Parsed JSON from the API.
 */
function parseCloudTorrentsPage(decoded) {
    if (!decoded || !decoded.results || !Array.isArray(decoded.results)) {
        Kiyomi.logDebug("CloudTorrents: 'results' array missing or invalid.");
        return [];
    }

    const out = [];
    for (let i = 0; i < decoded.results.length; i++) {
        const result = decoded.results[i] || {};
        const torrent = result.torrent || {};
        const meta = torrent.torrentMetadata || torrent; // <-- NEW: look inside torrentMetadata first

        // Name + magnet (now taken from torrentMetadata)
        const name = (meta.name || torrent.name || "").trim();
        const magnet =
            meta.torrentMagnet ||
            meta.magnet ||
            torrent.torrentMagnet ||
            torrent.magnet ||
            "";

        if (!name || !magnet) {
            Kiyomi.logDebug(
                "CloudTorrents: Skipping result without name or magnet (index " +
                i +
                ")."
            );
            continue;
        }

        // torrent type and category
        const torrentType =
            meta.torrentType || torrent.torrentType || {};
        const typeName = (torrentType.name || "").toLowerCase();
        const resultId = result.id != null ? String(result.id) : "";

        let descLink = CLOUDTORRENTS_BASE;
        if (typeName && resultId) {
            // e.g. https://cloudtorrents.com/movie/12345
            descLink = CLOUDTORRENTS_BASE + "/" + typeName + "/" + resultId;
        }

        // uploadedAt is ISO like "2023-08-12T04:08:21.668702+02:00"
        let publishEpoch = 0;
        if (torrent.uploadedAt) {
            const ms = Date.parse(torrent.uploadedAt);
            if (!isNaN(ms)) {
                publishEpoch = Math.floor(ms / 1000);
            }
        }

        // size, seeds, leechers, hash
        const sizeBytes =
            typeof meta.size === "number" && !isNaN(meta.size)
                ? meta.size
                : typeof torrent.size === "number" && !isNaN(torrent.size)
                    ? torrent.size
                    : 0;

        const seeds =
            typeof torrent.seeders === "number" && !isNaN(torrent.seeders)
                ? torrent.seeders
                : 0;

        const leechers =
            typeof torrent.leechers === "number" && !isNaN(torrent.leechers)
                ? torrent.leechers
                : 0;

        const hash =
            meta.torrentHash ||
            meta.hash ||
            torrent.hash ||
            undefined;

        const categoryName =
            typeof torrentType.displayName === "string" &&
                torrentType.displayName.length > 0
                ? torrentType.displayName
                : typeof torrentType.name === "string" &&
                    torrentType.name.length > 0
                    ? torrentType.name
                    : "All";

        // posterUrl exists at result level for some movie entries
        const coverImageUrl =
            typeof result.posterUrl === "string" &&
                result.posterUrl.length > 0
                ? result.posterUrl
                : undefined;

        out.push({
            title: name,
            magnetUrl: magnet,
            size: sizeBytes,
            seeds: seeds,
            peers: leechers,
            infoUrl: descLink,
            publishDate: publishEpoch > 0 ? String(publishEpoch) : "",
            category_name: categoryName,
            hash: hash,
            coverImageUrl: coverImageUrl
        });
    }

    Kiyomi.logDebug(
        "CloudTorrents: Parsed " + out.length + " items from current page."
    );
    return out;
}


// ===== Main entrypoint =====

/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>}
 */
function search(query, category) {
    Kiyomi.logDebug(
        "CloudTorrents: Starting search. Query='" +
        query +
        "', category='" +
        category +
        "'"
    );

    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        Kiyomi.logDebug("CloudTorrents: Blank query, returning empty result.");
        return [];
    }

    const typeCode = resolveCategoryCode(category);

    // IMPORTANT: Do NOT set Accept-Encoding; OkHttp will handle gzip.
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    const limit = CT_CONFIG.API_LIMIT;
    let offset = 0;

    const allItems = [];
    let requestCount = 0;

    while (
        requestCount < CT_CONFIG.MAX_REQUESTS &&
        allItems.length < CT_CONFIG.MAX_RESULTS
    ) {
        const queryParams = {
            offset: offset,
            limit: limit,
            query: trimmedQuery
        };
        if (typeCode) {
            queryParams["torrent_type"] = typeCode;
        }

        const qs = buildQueryString(queryParams);
        const url = CLOUDTORRENTS_API_BASE + "/search/?" + qs;

        Kiyomi.logDebug(
            "CloudTorrents: Requesting page " +
            (requestCount + 1) +
            " (offset=" +
            offset +
            ", limit=" +
            limit +
            ")"
        );

        let rawJson;
        try {
            rawJson = Kiyomi.httpGet(url, headersString);
        } catch (e) {
            Kiyomi.logError(
                "CloudTorrents: HTTP error for URL " +
                url +
                " – " +
                (e && e.message ? e.message : String(e))
            );
            break;
        }

        if (!rawJson) {
            Kiyomi.logDebug(
                "CloudTorrents: Empty response JSON, stopping pagination."
            );
            break;
        }

        let decoded;
        try {
            decoded = JSON.parse(rawJson);
        } catch (e) {
            Kiyomi.logError(
                "CloudTorrents: Failed to parse JSON: " +
                (e && e.message ? e.message : String(e))
            );
            break;
        }

        const pageItems = parseCloudTorrentsPage(decoded);
        for (let i = 0; i < pageItems.length; i++) {
            if (allItems.length >= CT_CONFIG.MAX_RESULTS) {
                break;
            }
            allItems.push(pageItems[i]);
        }

        // if fewer items than we requested, probably no more pages
        if (pageItems.length < limit) {
            Kiyomi.logDebug(
                "CloudTorrents: Received " +
                pageItems.length +
                " < limit (" +
                limit +
                "), assuming final page."
            );
            break;
        }

        // also honour decoded.next
        if (!decoded.next) {
            Kiyomi.logDebug(
                "CloudTorrents: 'next' is null/absent – final page reported by API."
            );
            break;
        }

        requestCount += 1;
        offset += limit;
    }

    // Sort by seeds descending like the original Python plugin
    allItems.sort(function (a, b) {
        const sa = typeof a.seeds === "number" ? a.seeds : 0;
        const sb = typeof b.seeds === "number" ? b.seeds : 0;
        return sb - sa;
    });

    // Hard cap to MAX_RESULTS
    const finalItems =
        allItems.length > CT_CONFIG.MAX_RESULTS
            ? allItems.slice(0, CT_CONFIG.MAX_RESULTS)
            : allItems;

    Kiyomi.logDebug(
        "CloudTorrents: Finished scraping. Total results returned: " +
        finalItems.length
    );

    return finalItems;
}
