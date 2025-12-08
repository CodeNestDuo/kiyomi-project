// ==KiyomiExtension==
// @id           uindex-js
// @name         UIndex (HTML, JS)
// @version      1.0.2 
// @author       Kiyomi Project
// @lang         all
// @icon         https://uindex.org/favicon.ico
// @site         https://uindex.org
// @package      uindex.org
// @type         html-scrape
// @nsfw         false
// @secure       false
// @private      false
// @requiresKey  false
// @description  UIndex HTML search integration for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== optional metadata for introspection =====
const EXTENSION_INFO = {
    id: "uindex-js",
    displayName: "UIndex",
    siteUrl: "https://uindex.org",
    iconUrl: "https://uindex.org/favicon.ico",
    type: "HTML_SCRAPE",
    isAdult: false,
    isSecure: false,
    cautionReason: "Search results are often unverified and may contain malicious files.",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.2"
};

// Mirrors your JSON categoryMap
const CATEGORY_MAP = {
    "All": "0",
    "Anime": "7",
    "Apps": "5",
    "Games": "3",
    "Movies": "1",
    "Music": "4",
    "Porn": "6",
    "Series": "2",
    "Other": "8"
};

// Same as searchUrlTemplate in JSON
const SEARCH_URL_TEMPLATE =
    "https://uindex.org/search.php?search={query}&c={category}";


// ---------- small helpers ----------

function stripTags(html) {
    return html.replace(/<[^>]*>/g, "").trim();
}

function parseIntSafe(text) {
    if (!text) return 0;
    const cleaned = String(text).replace(/[^0-9]/g, "");
    const v = parseInt(cleaned, 10);
    return Number.isNaN(v) ? 0 : v;
}

function makeAbsoluteUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/")) return EXTENSION_INFO.siteUrl + path;
    return EXTENSION_INFO.siteUrl + "/" + path;
}


// ---------- main entry for Kiyomi ----------

/**
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>} – directly maps to TorrentDescription
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    Kiyomi.logDebug("UIndex: Starting search for query '" + query + "' (Category ID: " + catId + ")");

    // 1) Build URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(catId));

    // 2) Fetch HTML
    const html = Kiyomi.httpGet(url);
    if (!html) {
        Kiyomi.logDebug("UIndex: HTTP fetch failed or returned empty content.");
        return [];
    }

    Kiyomi.logDebug("UIndex: Fetched HTML content length: " + html.length);

    const results = [];

    // FIX STEP 1: Extract content between <tbody> tags
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch || tbodyMatch.length < 2) {
        Kiyomi.logDebug("UIndex: Could not find <tbody> block. Likely no results found or structure changed.");
        return [];
    }
    const tbodyHtml = tbodyMatch[1];


    // FIX STEP 2: Iterate all <tr> rows ONLY in the tbodyHtml
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let rowCount = 0;

    // Execute regex on the clean tbody content
    while ((rowMatch = rowRegex.exec(tbodyHtml)) !== null) {
        const rowHtml = rowMatch[1];
        rowCount++;

        // Grab all <td> cells
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const tds = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
            tds.push(tdMatch[1]);
        }

        if (tds.length < 5) {
            Kiyomi.logDebug("UIndex: Skipping row " + rowCount + ": Found only " + tds.length + " cells.");
            continue;
        }

        const tdCategory = tds[0];
        const tdMain = tds[1];
        const tdSize = tds[2];
        const tdSeeds = tds[3];
        const tdPeers = tds[4];

        // --- magnet & title & detailsPath from tdMain ---
        let magnetUrl = "";
        let title = "";
        let detailsPath = "";

        // Collect all anchors in tdMain
        const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const anchors = [];
        let aMatch;
        while ((aMatch = anchorRegex.exec(tdMain)) !== null) {
            anchors.push({
                href: aMatch[1].trim(),
                content: aMatch[2].trim()
            });
        }

        // FIX: Explicitly check the expected anchors (Index 0 = Magnet, Index 1 = Title/Details)
        if (anchors.length >= 2) {
            // Anchor 0 is the Magnet link
            if (anchors[0].href.startsWith("magnet:")) {
                magnetUrl = anchors[0].href;
            }

            // Anchor 1 is the Details link
            detailsPath = anchors[1].href;
            // The title text is the content of the second anchor
            title = stripTags(anchors[1].content);
        }

        if (!magnetUrl || !title) {
            Kiyomi.logDebug("UIndex: Skipping row " + rowCount + " (Anchor Count: " + anchors.length + ", Magnet Found: " + !!magnetUrl + ", Title Found: " + !!title + ")");
            continue;
        }

        Kiyomi.logDebug("UIndex: Mapped result: " + title);

        // 3) publishDate from <div> inside tdMain (e.g. "8.2 months ago")
        let publishDate = "";
        const dateMatch = tdMain.match(/<div[^>]*>([\s\S]*?)<\/div>/i);
        if (dateMatch) {
            publishDate = dateMatch[1].trim();
        }

        // 4) size_raw (e.g. "2.40 GB") from tdSize
        const sizeRaw = stripTags(tdSize);

        // HUMAN_SIZE_TO_BYTES via Kotlin bridge
        const sizeBytes = Kiyomi.humanSizeToBytes(sizeRaw);

        // 5) seeds / peers
        const seedsText = stripTags(tdSeeds);
        const peersText = stripTags(tdPeers);
        const seeds = parseIntSafe(seedsText);
        const peers = parseIntSafe(peersText);

        // 6) infoUrl (CONSTRUCT_URL equivalent)
        const infoUrl = makeAbsoluteUrl(detailsPath);

        // 7) category_name (not used in final mapping, but we can grab it)
        const categoryName = stripTags(tdCategory);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: publishDate,
            category_name: categoryName // Include for debugging/future use
        });
    }

    Kiyomi.logDebug("UIndex: Finished scraping. Found " + results.length + " results.");

    return results;
}
