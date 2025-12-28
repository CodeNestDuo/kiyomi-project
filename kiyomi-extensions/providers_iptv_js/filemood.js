// ==KiyomiExtension==
// @id             filemood-js
// @name           FileMood
// @version        1.0.0
// @author         LightDestory (Original Python Author)
// @lang           all
// @icon           https://filemood.com/favicon.ico
// @site           https://filemood.com
// @package        filemood.com
// @type           html-regex
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Scrapes FileMood.com results using offset-based pagination.
// @primaryCategory general
// @extraCategories movie, tv
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "filemood-js",
    displayName: "FileMood",
    siteUrl: "https://filemood.com",
    iconUrl: "https://filemood.com/favicon.ico",
    type: "HTML_REGEX",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

const CATEGORY_MAP = {
    "All": ""
};

// ===== Tuning knobs =====
const FM_CONFIG = {
    MAX_REQUESTS: 5, // Limit requests for safety
    MAX_RESULTS: 50, // Limit total results returned
    RESULTS_PER_PAGE: 20 // Pagination offset step size
};

// ===== Provider URLs and Templates =====
const BASE_URL = "https://filemood.com/";
// URL format: https://filemood.com/result?q={query}+in%3Atitle&f={offset}
const SEARCH_URL_TEMPLATE = BASE_URL + "result?q={query}+in%3Atitle&f={offset}";

// ===== Magnet Construction (Trackers from original Python script) =====
const TRACKERS_QS = 
    "&tr=https%3A%2F%2Ftracker.bjut.jp%2Fannounce" +
    "&tr=https%3A%2F%2Fapi.ipv4online.uk%2Fannounce" +
    "&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce" +
    "&tr=udp%3A%2F%2Fopentrackr.org%3A1337%2Fannounce" +
    "&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3Dcbb9f62431802fc7372c0e323954f417" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D9b05ae8e24a8048518545dcbe53d4a49" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D39587f193c03d3877f1c79f18448e82e" +
    "&tr=http%3A%2F%2Fmycarpathians.net%2Fannounce%2F4c242dced71f9fcfc07ad884c30c0aa5" + // Simplified due to URL length
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3Db27e932a002eeb2ff9f8870fb632c914" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D64024a20513018fc579f82dac62d0d95" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D3fa2096a6ff57c995fa061270491cc3c" +
    "&tr=http%3A%2F%2Fwww.thetradersden.org%2Fforums%2Ftracker%2Fannounce.php%3Fpasskey%3D076a404e6fe8cd98236cb35518c247e0" +
    "&tr=http%3A%2F%2Fbt.zlofenix.org%3A81%2Fps2wluqkjplh0xdpt8cyfufsbu4jde82%2Fannounce" +
    "&tr=https%3A%2F%2Ftracker.linvk.com%2Fannounce" +
    "&tr=https%3A%2F%2Ftracker.wsaoa.eu.org%2Fannounce" +
    "&tr=http%3A%2F%2Funit193.net%3A6969%2Fannounce" +
    "&tr=http%3A%2F%2Ftracker.trainsim.ru%2Fannounce.php" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3Ddb2095becd888c069565f49d7a1c0594" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D3d0588a8c3b251e3be554d8c22e7606e" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3D698d51e4fb05a5f1ff7c9fe1d8dd5eb3" +
    "&tr=http%3A%2F%2Fgood73.net%2Fannounce.php%3Fpasskey%3Df9b19ea8afab63079761e964ad0f1df2" +
    "&tr=http%3A%2F%2Fwww.good73.net%2Fannounce.php%3Fpasskey%3D945e006a8a649fc10101e709633f4055";


// ---------- Helpers and Parsing ----------

/**
 * Parses the HTML content to extract torrents.
 *
 * @param {string} html Raw HTML content of a search page.
 * @returns {Array<Object>} List of mapped torrent results.
 */
function findTorrents(html) {
    const torrents = [];
    
    // 1. Find all <table>...</table> blocks
    // Python slice [7:] is used because the first 7 table blocks are junk headers.
    const tablesRegex = /<table>([\s\S]*?)<\/table>/gi;
    const allTables = html.match(tablesRegex) || [];
    
    // Slice: Skip the first 7 tables (indices 0 to 6)
    const resultTables = allTables.slice(7);

    for (let j = 0; j < resultTables.length; j++) {
        const table = resultTables[j];

        // 2. Extract Data from the Table Block (<tr> is implicitly within the <table>)
        // Groups: 1: RELATIVE_PATH+HASH+junk, 2: HASH, 3: TITLE, 4: SEEDS, 5: LEECH, 6: SIZE_STRING
        const dataRegex = 
            // Link/Hash/Title: href="PATH (Group 1 with hash Group 2)" title="TITLE (Group 3)"
            /href=\"(.+?([a-f0-9]{40}).+?)\" title=\"(.+?)\"[\s\S]+?b>([0-9,]+)\/([0-9,]+)[\s\S]+?([0-9\.\,]+\s?(TB|GB|MB|KB))/i;
            
        const match = table.match(dataRegex);

        if (match) {
            
            const urlPathWithHash = match[1]; // e.g., /download/hash_here/file-name.torrent
            const infoHash = match[2]; 
            const nameRaw = match[3];
            const seedsRaw = match[4];
            const leechRaw = match[5];
            const sizeString = match[6];
            
            // Clean up values
            const nameDotted = nameRaw.replace(/ /g, "."); // Python logic replaces spaces with dots
            const seeds = parseInt(seedsRaw.replace(/,/g, ""), 10) || 0;
            const leech = parseInt(leechRaw.replace(/,/g, ""), 10) || 0;
            const sizeClean = sizeString.replace(/,/g, "").trim(); 
            
            // Construct Magnet URL
            const magnetUrl = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(nameDotted)}${TRACKERS_QS}`;

            // Generic URL is BASE_URL (without trailing slash) + urlPathWithHash
            const descLink = BASE_URL.substring(0, BASE_URL.length - 1) + urlPathWithHash;
            
            // Convert human size to bytes
            const sizeBytes = Kiyomi.humanSizeToBytes(sizeClean);

            torrents.push({
                title: nameRaw, // Use original name for display, not the dotted version
                magnetUrl: magnetUrl,
                size: sizeBytes,
                seeds: seeds,
                peers: leech,
                infoUrl: descLink,
                publishDate: "", // Not extractable from this view
                category_name: "All",
                hash: infoHash
            });
        }
    }

    return torrents;
}

// ---------- Main Entrypoint ----------

/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category – Ignored.
 * @returns {Array<Object>}
 */
function search(query, category) {
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) return [];

    // The search URL replaces spaces with '+' and sets the query filter:
    const urlQuery = encodeURIComponent(trimmedQuery).replace(/%20/g, '+');
    const allItems = [];
    let currentPage = 0; // Page starts at 0, offset = page * 20
    let requestCount = 0;

    // IMPORTANT: Use JSON.stringify for headers object compatibility with native bridge
    const headersObject = {
        'User-Agent': 'Mozilla/5.0 (compatible; Kiyomi/1.1; +https://kiyomi.app)',
        'Accept-Encoding': 'gzip, deflate, br, zstd', 
    };
    const headersString = JSON.stringify(headersObject);

    while (
        requestCount < FM_CONFIG.MAX_REQUESTS &&
        allItems.length < FM_CONFIG.MAX_RESULTS
    ) {
        const offset = currentPage * FM_CONFIG.RESULTS_PER_PAGE;
        
        const url = SEARCH_URL_TEMPLATE
            .replace("{query}", urlQuery)
            .replace("{offset}", offset);
        
        Kiyomi.logDebug("FileMood: Requesting offset " + offset);

        let html = Kiyomi.httpGet(url, headersString);

        if (!html) {
            Kiyomi.logDebug("FileMood: Failed to fetch page at offset " + offset + ". Stopping pagination.");
            break;
        }

        // Python used re.sub(r'\s+', ' ', html).strip() to normalize HTML
        html = html.replace(/\s+/g, ' ').trim();
        
        const pageItems = findTorrents(html);
        
        // Python's stop condition: if parser.noTorrents (i.e., pageItems.length == 0)
        if (pageItems.length === 0) {
            Kiyomi.logDebug("FileMood: Offset " + offset + " returned 0 results. Stopping pagination.");
            break;
        }
        
        // Add results, enforcing MAX_RESULTS cap
        for (let i = 0; i < pageItems.length; i++) {
            if (allItems.length >= FM_CONFIG.MAX_RESULTS) {
                break;
            }
            allItems.push(pageItems[i]);
        }

        requestCount += 1;
        currentPage += 1;
    }
    
    Kiyomi.logDebug("FileMood: Finished scraping. Total results returned: " + allItems.length);

    return allItems;
}