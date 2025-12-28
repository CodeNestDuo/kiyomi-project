// ==KiyomiExtension==
// @id             btdig-js
// @name           BTDigg
// @version        1.0.0
// @author         Kiyomi Project
// @lang           all
// @icon           https://www.btdig.com/favicon.ico
// @site           https://www.btdig.com
// @package        btdig.com
// @type           html-regex
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Scrapes search results directly from btdig.com with support for basic pagination.
// @primaryCategory general
// @extraCategories movie, tv
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "btdig-js",
    displayName: "BTDigg",
    siteUrl: "https://www.btdig.com",
    iconUrl: "https://www.btdig.com/favicon.ico",
    type: "HTML_REGEX",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// ===== Category handling for Kiyomi UI =====
//
// BTDigg doesn’t really expose category filters in the URL for our use-case,
// so we only support "All" in practice. This still gives the UI a dropdown.
const CATEGORY_MAP = {
    "All": ""
};

/**
 * Normalize category coming from Kiyomi.
 */
function resolveCategory(category) {
    if (Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category)) {
        return category;
    }

    const lc = String(category || "").trim().toLowerCase();
    if (lc === "all" || lc === "") return "All";

    // Anything unknown → default to All
    return "All";
}


// ===== Tuning knobs =====

const BTDIG_CONFIG = {
    /**
     * Maximum number of pages to crawl from BTDigg.
     * BTDigg shows ~10 results per page, so 3 pages ≈ 30 results.
     */
    MAX_PAGES: 3,

    /**
     * Hard cap on total results returned to Kiyomi.
     * If you want fewer, e.g. 20, just change this.
     */
    MAX_RESULTS: 60
};


// ===== URLs =====

const BASE_URL = "https://www.btdig.com";
const SEARCH_URL_TEMPLATE = BASE_URL + "/search?q={query}&order=0";
const SEARCH_PAGE_URL_TEMPLATE = BASE_URL + "/search?q={query}&p={page}&order=0";


// ---------- helpers ----------

/**
 * Helper to calculate total pages based on "results found" text.
 * @param {string} responseHtml
 * @returns {number} totalPages
 */
function calculateTotalPages(responseHtml) {
    const resultsMatch = responseHtml.match(/(\d+)\s+results\s+found/i);
    if (!resultsMatch) {
        Kiyomi.logDebug("BTDigg: 'results found' text not found, defaulting to 1 page.");
        return 1;
    }
    const totalResults = parseInt(resultsMatch[1], 10) || 0;
    const pages = Math.max(1, Math.ceil(totalResults / 10));
    Kiyomi.logDebug(
        "BTDigg: Found " + totalResults + " total results; estimated pages: " + pages
    );
    return pages;
}

/**
 * Parses a single page of HTML and returns an array of torrent objects.
 * @param {string} htmlContent
 * @param {string} engineUrl
 * @param {string} categoryDisplayName
 * @returns {Array<Object>}
 */
function parsePage(htmlContent, engineUrl, categoryDisplayName) {
    Kiyomi.logDebug("BTDigg: Starting HTML parsing for one page.");

    // Match each result block with class="one_result"
    const itemRegex =
        /<div[^>]*class=["']one_result["'][^>]*>[\s\S]*?(?=<div[^>]*class=["']one_result["']|<\/body>|$)/gi;

    const results = [];
    let match;
    let itemsFound = 0;

    while ((match = itemRegex.exec(htmlContent)) !== null) {
        itemsFound++;
        const blockContent = match[0];

        const magnetMatch = blockContent.match(
            /<a[^>]+href="(magnet:\?xt=urn:btih:[^"]+)"/i
        );

        const nameMatch = blockContent.match(
            /<div[^>]*class=["']torrent_name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
        );

        const sizeMatch = blockContent.match(
            /<span[^>]*class=["']torrent_size["'][^>]*>([\s\S]*?)<\/span>/i
        );

        const descLinkMatch = blockContent.match(
            /<div[^>]*class=["']torrent_name["'][^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/i
        );

        if (magnetMatch && nameMatch && sizeMatch && descLinkMatch) {
            const nameRaw = nameMatch[1] || "";
            const name = nameRaw.replace(/<.*?>/g, "").trim();

            const sizeRaw = sizeMatch[1] || "";
            const size = sizeRaw.replace(/&nbsp;/g, " ").trim();

            const infoPath = descLinkMatch[1] || "";
            const infoUrl = infoPath.startsWith("http")
                ? infoPath
                : engineUrl + infoPath;

            Kiyomi.logDebug(
                "BTDigg: Item " +
                    itemsFound +
                    " parsed. Title: " +
                    (name.length > 40 ? name.substring(0, 40) + "..." : name) +
                    ", Size: " +
                    size
            );

            results.push({
                title: name,
                magnetUrl: magnetMatch[1],
                size: size, // human-readable; can be converted via humanSizeToBytes on Kotlin side
                seeds: 0,
                peers: 0,
                infoUrl: infoUrl,
                publishDate: "",
                category_name: categoryDisplayName || "All"
            });
        } else {
            Kiyomi.logDebug(
                "BTDigg: Item " +
                    itemsFound +
                    " skipped (missing fields). " +
                    "Magnet=" +
                    !!magnetMatch +
                    ", Name=" +
                    !!nameMatch +
                    ", Size=" +
                    !!sizeMatch +
                    ", InfoLink=" +
                    !!descLinkMatch
            );
        }
    }

    Kiyomi.logDebug(
        "BTDigg: Finished parsing page. " +
            "Valid results=" +
            results.length +
            ", raw blocks=" +
            itemsFound
    );
    return results;
}


/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category – only "All" is effectively supported.
 * @returns {Array<Object>}
 */
function search(query, category) {
    const categoryDisplayName = resolveCategory(category);

    Kiyomi.logDebug(
        "BTDigg: Starting search. Query='" +
            query +
            "', category='" +
            categoryDisplayName +
            "'"
    );

    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        Kiyomi.logDebug("BTDigg: Blank query, returning empty result.");
        return [];
    }

    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        Kiyomi.logError("BTDigg: Kiyomi.httpGet is not available.");
        return [];
    }

    const searchParam = encodeURIComponent(trimmedQuery).replace(/%20/g, "+");
    const results = [];

    // Headers – DO NOT override Accept-Encoding, OkHttp will handle gzip.
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    // 1. Fetch first page
    let url = SEARCH_URL_TEMPLATE.replace("{query}", searchParam);
    let firstPageHtml;
    try {
        Kiyomi.logDebug("BTDigg: Fetching first page: " + url);
        firstPageHtml = Kiyomi.httpGet(url, headersString);
    } catch (e) {
        Kiyomi.logError(
            "BTDigg: HTTP error on first page: " +
                (e && e.message ? e.message : String(e))
        );
        return [];
    }

    if (!firstPageHtml) {
        Kiyomi.logDebug(
            "BTDigg: HTTP fetch failed or returned empty content for first page."
        );
        return [];
    }

    // 2. Calculate total pages from the first page HTML
    const totalPages = calculateTotalPages(firstPageHtml);
    const maxPages = Math.min(totalPages, BTDIG_CONFIG.MAX_PAGES);
    Kiyomi.logDebug(
        "BTDigg: Total pages according to site: " +
            totalPages +
            ", capped by config to: " +
            maxPages
    );

    // 3. Parse first page
    results.push(...parsePage(firstPageHtml, BASE_URL, categoryDisplayName));

    // 4. Fetch & parse remaining pages (if any)
    for (let pageIndex = 1; pageIndex < maxPages; pageIndex++) {
        // BTDigg's ?p= argument appears to be zero-based; pageIndex=1 => 2nd page
        Kiyomi.logDebug(
            "BTDigg: Fetching page " + (pageIndex + 1) + " of " + totalPages
        );

        url = SEARCH_PAGE_URL_TEMPLATE
            .replace("{query}", searchParam)
            .replace("{page}", pageIndex);

        let pageHtml;
        try {
            pageHtml = Kiyomi.httpGet(url, headersString);
        } catch (e) {
            Kiyomi.logError(
                "BTDigg: HTTP error on page " +
                    (pageIndex + 1) +
                    ": " +
                    (e && e.message ? e.message : String(e))
            );
            break;
        }

        if (!pageHtml) {
            Kiyomi.logDebug(
                "BTDigg: Empty/failed response for page " + (pageIndex + 1)
            );
            break;
        }

        results.push(
            ...parsePage(pageHtml, BASE_URL, categoryDisplayName)
        );

        // Optional early stop if we've hit our max results
        if (results.length >= BTDIG_CONFIG.MAX_RESULTS) {
            Kiyomi.logDebug(
                "BTDigg: Reached MAX_RESULTS (" +
                    BTDIG_CONFIG.MAX_RESULTS +
                    "), stopping pagination."
            );
            break;
        }
    }

    // 5. Hard cap on total results
    let finalResults = results;
    if (results.length > BTDIG_CONFIG.MAX_RESULTS) {
        finalResults = results.slice(0, BTDIG_CONFIG.MAX_RESULTS);
    }

    Kiyomi.logDebug(
        "BTDigg: Finished scraping. Total results returned: " +
            finalResults.length
    );

    return finalResults;
}
