// ==KiyomiExtension==
// @id           thepiratebay-js
// @name         The Pirate Bay (API, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://torrindex.net/images/tpb.jpg
// @site         https://thepiratebay.org
// @package      thepiratebay.org
// @type         json-api
// @nsfw         true
// @secure       false
// @private      false
// @requiresKey  false
// @description  The Pirate Bay via apibay.org JSON API, for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== Runtime metadata (optional, for introspection) =====
const EXTENSION_INFO = {
    id: "thepiratebay-js",
    displayName: "The Pirate Bay (API, JS)",
    siteUrl: "https://thepiratebay.org",
    iconUrl: "https://torrindex.net/images/tpb.jpg",
    type: "JSON_API",
    isAdult: true,
    isSecure: false,
    cautionReason: "Search results are often unverified and may contain malicious files.",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Mirrors your JSON categoryMap
const CATEGORY_MAP = {
    "All": "0",
    "Movies": "200",
    "Series": "200",   // mapped same as Movies per your JSON
    "Music": "101",
    "Porn": "500",
    "Apps": "300",
    "Books": "601",
    "Games": "400",
    "Other": "600"
};

// Same as searchUrlTemplate in JSON config
const SEARCH_URL_TEMPLATE =
    "https://apibay.org/q.php?q={query}&cat={category}";


// -------- Helpers --------

/**
 * Convert Unix epoch seconds (string/number) → ISO date string.
 * Mirrors EPOCH_TO_DATE_STRING in spirit.
 */
function epochToDateString(epochStr) {
    const sec = parseInt(epochStr, 10);
    if (!sec || sec <= 0) return "";
    const d = new Date(sec * 1000);
    // ISO is fine for TorrentDescription.publishDate
    return d.toISOString();
}

/**
 * Main entry for Kiyomi JS engine.
 * Mirrors your JSON steps:
 *   - HTTP_REQUEST  → Kiyomi.httpGet(url)
 *   - MAP_RESULTS_GENERIC on root JSON array
 *   - postProcessors: BUILD_MAGNET_FROM_HASH, EPOCH_TO_DATE_STRING, RAW_BYTES_TO_LONG
 *
 * @param {string} query
 * @param {string} category  – keys from CATEGORY_MAP ("Movies", "Music", etc.)
 * @returns {Array<Object>}  – each object maps directly into TorrentDescription
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    // 1. Build API URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{category}", encodeURIComponent(catId))
        .replace("{query}", encodeURIComponent(query));

    // 2. Fetch JSON via Kotlin bridge
    const jsonText = Kiyomi.httpGet(url);

    let items;
    try {
        items = JSON.parse(jsonText);
    } catch (e) {
        // apibay can sometimes return plain text on weird errors
        return [];
    }

    if (!Array.isArray(items)) {
        // apibay sometimes returns an error object or message; ignore
        return [];
    }

    const results = [];

    for (const it of items) {
        // apibay "no results" case sometimes uses name = "No results returned"
        if (!it || typeof it !== "object") continue;

        const title = it.name || "";
        const hash = it.info_hash || "";
        const imdbId = it.imdb || "";

        const idRaw = it.id || "";
        const sizeRawBytes = it.size || "0";
        const seedsStr = it.seeders || "0";
        const peersStr = it.leechers || "0";
        const addedEpoch = it.added || "0";

        if (!title || !hash) {
            continue; // must have at least title + hash
        }

        // --- Post-processors equivalent ---

        // 1) BUILD_MAGNET_FROM_HASH
        const magnetUrl = Kiyomi.buildMagnetFromHash(hash, title);

        // 2) RAW_BYTES_TO_LONG  → we just parse the numeric string here
        const size = parseInt(sizeRawBytes, 10) || 0;

        // 3) EPOCH_TO_DATE_STRING
        const publishDate = epochToDateString(addedEpoch);

        const seeds = parseInt(seedsStr, 10) || 0;
        const peers = parseInt(peersStr, 10) || 0;

        const infoUrl = idRaw
            ? ("https://thepiratebay.org/description.php?id=" + encodeURIComponent(idRaw))
            : "";

        // Final mapping → mirrors finalMapping in JSON config
        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            publishDate: publishDate,
            imdbId: imdbId,
            infoUrl: infoUrl
            // torrentDownloadUrl not provided by apibay; magnet is primary path
        });
    }

    return results;
}

