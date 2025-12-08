// ==KiyomiExtension==
// @id           torrentscsv-js
// @name         TorrentsCSV (API, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://torrents-csv.com/favicon.ico
// @site         https://torrents-csv.com
// @package      torrents-csv.com
// @type         json-api
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  TorrentsCSV JSON API integration for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== optional metadata for introspection =====
const EXTENSION_INFO = {
    id: "torrentscsv-js",
    displayName: "TorrentsCSV",
    siteUrl: "https://torrents-csv.com",
    iconUrl: "https://torrents-csv.com/favicon.ico",
    type: "JSON_API",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Mirrors your JSON categoryMap (currently only All)
const CATEGORY_MAP = {
    "All": ""
};

// Same as searchUrlTemplate in your JSON config
const SEARCH_URL_TEMPLATE =
    "https://torrents-csv.com/service/search?q={query}";


// ---------- helpers ----------

/**
 * Convert Unix epoch seconds (string/number) → ISO date string,
 * similar to your EPOCH_TO_DATE_STRING helper.
 */
function epochToDateString(epochStr) {
    const sec = parseInt(epochStr, 10);
    if (!sec || sec <= 0) return "";
    const d = new Date(sec * 1000);
    return d.toISOString();
}


/**
 * Main entry for Kiyomi JS engine.
 * Mirrors:
 *  - HTTP_REQUEST → Kiyomi.httpGet(url,headers)
 *  - MAP_RESULTS_GENERIC on root "torrents" array
 *  - postProcessors: BUILD_MAGNET_FROM_HASH, EPOCH_TO_DATE_STRING
 *
 * @param {string} query
 * @param {string} category  – currently only "All" is meaningful
 * @returns {Array<Object>}  – maps directly to TorrentDescription
 */
function search(query, category) {
    // We keep CATEGORY_MAP for consistency / future expansion,
    // but TorrentsCSV does not really use category in the URL.
    const _catValue = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    // 1) Build URL (no category placeholder in template)
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query));

    // 2) HTTP request through Kotlin bridge
    const jsonText = Kiyomi.httpGet(url,null);

    let root;
    try {
        root = JSON.parse(jsonText);
    } catch (e) {
        // If API ever returns non-JSON, fail gracefully
        return [];
    }

    const torrents = (root && Array.isArray(root.torrents))
        ? root.torrents
        : [];

    const results = [];

    for (const t of torrents) {
        if (!t || typeof t !== "object") continue;

        const title = t.name || "";
        const hash = t.infohash || "";

        if (!title || !hash) continue; // must have these

        const sizeRaw = t.size_bytes ?? "0";
        const seedsRaw = t.seeders ?? "0";
        const peersRaw = t.leechers ?? "0";
        const created = t.created_unix ?? "0";

        // --- post-processor equivalents ---

        // BUILD_MAGNET_FROM_HASH
        const magnetUrl = Kiyomi.buildMagnetFromHash(hash, title);

        // size_bytes is already raw bytes → just parse
        const size = parseInt(sizeRaw, 10) || 0;
        const seeds = parseInt(seedsRaw, 10) || 0;
        const peers = parseInt(peersRaw, 10) || 0;

        // EPOCH_TO_DATE_STRING
        const publishDate = epochToDateString(created);

        // finalMapping → directly to TorrentDescription fields
        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            publishDate: publishDate
            // API doesn't provide a dedicated infoUrl / torrentDownloadUrl
        });
    }

    return results;
}

