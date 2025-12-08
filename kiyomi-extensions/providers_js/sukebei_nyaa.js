// ==KiyomiExtension==
// @id           sukebei_nyaa-js
// @name         Sukebei Nyaa (Adult, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://sukebei.nyaa.si/static/favicon.png
// @site         https://sukebei.nyaa.si
// @package      sukebei.nyaa.si
// @type         rss-xml
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Sukebei Nyaa adult indexer via Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== Runtime metadata (optional, for future use) =====
const EXTENSION_INFO = {
    id: "sukebei_nyaa-js",
    displayName: "Sukebei Nyaa (Adult, JS)",
    siteUrl: "https://sukebei.nyaa.si",
    iconUrl: "https://sukebei.nyaa.si/static/favicon.png",
    type: "RSS_XML",
    isAdult: true,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Same as your JSON categoryMap
const CATEGORY_MAP = {
    "All": "0_0",
    "Anime": "1_1",
    "Doujinshi": "1_2",
    "Games": "1_3",
    "Manga": "1_4",
    "Pictures": "1_5",
    "Photobooks": "2_1",
    "Videos": "2_2",
    "Real Life": "2_0",
    "Other Art": "1_0"
};

// Same as searchUrlTemplate in JSON
const SEARCH_URL_TEMPLATE =
    "https://sukebei.nyaa.si/?page=rss&c={category}&f=0&q={query}";


// ---------- Helpers ----------

/**
 * Extracts text inside <tagName>...</tagName> from a snippet of XML.
 */
function extractTag(xml, tagName) {
    const pattern = "<" + tagName + ">([\\s\\S]*?)</" + tagName + ">";
    const re = new RegExp(pattern, "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Main entry for Kiyomi.
 * Mirrors your JSON:
 *   - HTTP_REQUEST → Kiyomi.httpGet(URL)
 *   - MAP_RESULTS_GENERIC over channel > item
 *   - postProcessors: BUILD_MAGNET_FROM_HASH + HUMAN_SIZE_TO_BYTES
 *
 * @param {string} query
 * @param {string} category  – "All", "Anime", "Doujinshi", ...
 * @returns {Array<Object>}  – Mapped to TorrentDescription
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    // 1. Build search URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{category}", encodeURIComponent(catId))
        .replace("{query}", encodeURIComponent(query || ""));

    // 2. Fetch RSS XML via Kotlin bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const rssXml = Kiyomi.httpGet(url);
    if (!rssXml) return [];

    // 3. Parse <item> inside <channel>
    // IMPORTANT: single backslashes in regex literal
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // Core RSS fields
        const title = extractTag(itemXml, "title");
        const infoUrl = extractTag(itemXml, "guid");
        const pubDate = extractTag(itemXml, "pubDate");

        if (!title) continue;

        // enclosure url → torrentDownloadUrl
        const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
        const torrentDownloadUrl = enclosureMatch ? enclosureMatch[1] : "";

        // nyaa: tags – we just use the raw tag names in the regex helper
        const infoHash = extractTag(itemXml, "nyaa:infoHash");
        const sizeHuman = extractTag(itemXml, "nyaa:size");
        const seedsStr = extractTag(itemXml, "nyaa:seeders");
        const peersStr = extractTag(itemXml, "nyaa:leechers");

        if (!infoHash) continue; // hash is required to build magnet

        // --- Post-processors equivalent ---

        // HUMAN_SIZE_TO_BYTES
        const sizeBytesStr = typeof Kiyomi.humanSizeToBytes === "function"
            ? Kiyomi.humanSizeToBytes(sizeHuman)
            : null;
        const sizeBytes = sizeBytesStr ? Number(sizeBytesStr) : 0;

        // BUILD_MAGNET_FROM_HASH
        const magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
            ? Kiyomi.buildMagnetFromHash(infoHash, title)
            : "";

        const seeds = parseInt(seedsStr, 10) || 0;
        const peers = parseInt(peersStr, 10) || 0;

        // Final mapping → TorrentDescription-compatible object
        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate,
            torrentDownloadUrl: torrentDownloadUrl
        });
    }

    return results;
}

