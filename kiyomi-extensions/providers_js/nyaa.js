// ==KiyomiExtension==
// @id           nyaa-js
// @name         Nyaa (RSS Feed, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://nyaa.land/static/favicon.png
// @site         https://nyaa.land
// @package      nyaa.land
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Nyaa torrent search via RSS using the Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== Extension Metadata (runtime object, optional but handy) =====
const EXTENSION_INFO = {
    id: "nyaa-js",
    displayName: "Nyaa (RSS Feed, JS)",
    siteUrl: "https://nyaa.land",
    iconUrl: "https://nyaa.land/static/favicon.png",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Maps your internal Category enum to Nyaa's category IDs
const CATEGORY_MAP = {
    "All": "0_0",
    "Anime": "1_0",
    "Music": "3_0",
    "Software": "4_0",
    "Other": "6_0"
};

// Full URL template (same idea as JSON)
const SEARCH_URL_TEMPLATE = "https://nyaa.land/?page=rss&c={category}&f=0&q={query}";


/**
 * Helper to extract tags (supports nyaa:xyz too).
 */
function extractTag(xml, tagName) {
    // build the pattern as a string, so we only have to escape backslashes once
    const pattern = "<" + tagName + ">([\\s\\S]*?)</" + tagName + ">";
    const tagRegex = new RegExp(pattern, "i");
    const m = xml.match(tagRegex);
    return m ? m[1].trim() : "";
}

/**
 * Executes a search against Nyaa.land using the Kiyomi Kotlin bridge for HTTP requests.
 * @param {string} query
 * @param {string} category  – one of CATEGORY_MAP keys
 * @returns {Array<Object>}  – list of torrent description objects
 */
function search(query, category) {
    const categoryId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    // 1. Construct URL
    let searchUrl = SEARCH_URL_TEMPLATE
        .replace("{category}", categoryId)
        .replace("{query}", encodeURIComponent(query || "")); // URL-encode query

    // 2. HTTP request via bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const rssXml = Kiyomi.httpGet(searchUrl,null);
    if (!rssXml) return [];

    // 3. Simple XML parsing for <item> blocks
    // IMPORTANT: single backslashes in regex literal
    const itemsRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemsRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const rawFields = {
            title: extractTag(itemXml, "title"),
            infoHash: extractTag(itemXml, "nyaa:infoHash"),
            size_raw: extractTag(itemXml, "nyaa:size"),
            seeds: parseInt(extractTag(itemXml, "nyaa:seeders"), 10) || 0,
            peers: parseInt(extractTag(itemXml, "nyaa:leechers"), 10) || 0,
            infoUrl: extractTag(itemXml, "guid"),
            publishDate: extractTag(itemXml, "pubDate")
        };

        if (!rawFields.infoHash) continue; // require hash
        if (!rawFields.title) continue;

        // Post-processing via Kotlin bridge
        const sizeBytesStr = typeof Kiyomi.humanSizeToBytes === "function"
            ? Kiyomi.humanSizeToBytes(rawFields.size_raw)
            : null;

        const sizeBytes = sizeBytesStr ? Number(sizeBytesStr) : 0;

        const magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
            ? Kiyomi.buildMagnetFromHash(rawFields.infoHash, rawFields.title)
            : "";

        // Final mapping
        results.push({
            title: rawFields.title,
            magnetUrl: magnetUrl,
            hash: rawFields.infoHash,
            size: sizeBytes,
            seeds: rawFields.seeds,
            peers: rawFields.peers,
            infoUrl: rawFields.infoUrl,
            publishDate: rawFields.publishDate
        });
    }

    return results;
}

