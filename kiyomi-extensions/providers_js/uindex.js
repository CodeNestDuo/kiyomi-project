// ==KiyomiExtension==
// @id           uindex-js
// @name         UIndex (HTML, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://uindex.org/favicon.ico
// @site         https://uindex.org
// @package      uindex.org
// @type         html-scrape
// @nsfw         false
// @secure       false
// @private      false
// @requiresKey  false
// @description  UIndex HTML search integration for Kiyomi JS engine.
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
    version: "1.0.0"
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
 * Mirrors your JSON config:
 *  - HTTP_REQUEST  → Kiyomi.httpGet(url)
 *  - MAP_RESULTS_GENERIC on `table.maintable > tbody > tr`
 *  - postProcessors: CONSTRUCT_URL + HUMAN_SIZE_TO_BYTES
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>} – directly maps to TorrentDescription
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    // 1) Build URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(catId));

    // 2) Fetch HTML
    const html = Kiyomi.httpGet(url);
    if (!html) return [];

    const results = [];

    // 3) Iterate all <tr> rows in the main table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowHtml = rowMatch[1];

        // Skip header rows (no <td>)
        if (!/<td/i.test(rowHtml)) continue;

        // Grab all <td> cells
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const tds = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
            tds.push(tdMatch[1]);
        }
        if (tds.length < 5) continue;

        const tdCategory = tds[0]; // category col
        const tdMain     = tds[1]; // title, magnet, date
        const tdSize     = tds[2]; // size
        const tdSeeds    = tds[3]; // seeds
        const tdPeers    = tds[4]; // peers

        // --- magnet & title & detailsPath from tdMain ---
        let magnetUrl = "";
        let title = "";
        let detailsPath = "";

        // 1) any magnet href
        const magnetMatch = tdMain.match(/href="(magnet:[^"]+)"/i);
        if (magnetMatch) {
            magnetUrl = magnetMatch[1];
        }

        // 2) second <a>, non-magnet → details + title
        const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let aMatch;
        while ((aMatch = anchorRegex.exec(tdMain)) !== null) {
            const href = aMatch[1];
            const text = aMatch[2].trim();
            if (href.startsWith("magnet:")) {
                if (!magnetUrl) magnetUrl = href;
            } else if (!detailsPath && text) {
                detailsPath = href;
                title = text;
            }
        }

        if (!magnetUrl || !title) {
            // must have at least these
            continue;
        }

        // 3) publishDate from <div> inside tdMain (e.g. "4 days ago")
        let publishDate = "";
        const dateMatch = tdMain.match(/<div[^>]*>([^<]+)<\/div>/i);
        if (dateMatch) {
            publishDate = dateMatch[1].trim();
        }

        // 4) size_raw (e.g. "1.2 GB") from tdSize
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
            // no hash here; magnet already present
            size: sizeBytes,        // HUMAN_SIZE_TO_BYTES result
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: publishDate,
            category_name: categoryName
        });
    }

    return results;
}

