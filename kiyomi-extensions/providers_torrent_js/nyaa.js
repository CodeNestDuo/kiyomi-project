// ==KiyomiExtension==
// @id           nyaa-js
// @name         Nyaa (RSS Feed, JS)
// @version      1.1.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://nyaa.si/static/favicon.png
// @site         https://nyaa.si
// @mirrors      https://nyaa.si,https://nyaa.land,https://nyaa.net
// @package      nyaa.si
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Nyaa torrent search via RSS using the Kiyomi JS engine with configurable mirrors.
// @primaryCategory anime
// @extraCategories asian_drama
// ==/KiyomiExtension==

// ===== Extension Metadata (Readable from App side via QuickJS or JSON eval) =====
const EXTENSION_INFO = {
    id: "nyaa-js",
    displayName: "Nyaa (RSS Feed, JS)",
    siteUrl: "https://nyaa.si",
    // App UI can read this list to render a mirror selector setting
    fallbackUrls: [
        "https://nyaa.si",
        "https://nyaa.land",
        "https://nyaa.net"
    ],
    iconUrl: "https://nyaa.si/static/favicon.png",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.1.0"
};

// Maps internal Category enum to Nyaa's category IDs
const CATEGORY_MAP = {
    "All": "0_0",
    "Anime": "1_0",
    "Music": "3_0",
    "Software": "4_0",
    "Other": "6_0"
};

/**
 * Helper to extract XML tag contents.
 */
function extractTag(xml, tagName) {
    const pattern = "<" + tagName + ">([\\s\\S]*?)</" + tagName + ">";
    const tagRegex = new RegExp(pattern, "i");
    const m = xml.match(tagRegex);
    return m ? m[1].trim() : "";
}

/**
 * Executes a search against Nyaa.
 * 
 * @param {string} query
 * @param {string} category          – one of CATEGORY_MAP keys
 * @param {string} [customBaseUrl]    – optional URL selected by user in App settings
 * @returns {Array<Object>}           – list of torrent description objects
 */
function search(query, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const categoryId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];
    const encodedQuery = encodeURIComponent(query || "");

    // If user chose a specific mirror in app settings, prioritize it
    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : EXTENSION_INFO.fallbackUrls;

    let rssXml = "";

    // Try candidate mirror(s) until valid XML is returned
    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const searchUrl = base + "/?page=rss&c=" + categoryId + "&f=0&q=" + encodedQuery;

        const response = Kiyomi.httpGet(searchUrl, null);
        if (response && response.indexOf("<item>") !== -1) {
            rssXml = response;
            break;
        }
    }

    if (!rssXml) return [];

    // XML parsing for <item> blocks
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

        if (!rawFields.infoHash || !rawFields.title) continue;

        const sizeBytesStr = typeof Kiyomi.humanSizeToBytes === "function"
            ? Kiyomi.humanSizeToBytes(rawFields.size_raw)
            : null;

        const sizeBytes = sizeBytesStr ? Number(sizeBytesStr) : 0;

        const magnetUrl = typeof Kiyomi.buildMagnetFromHash === "function"
            ? Kiyomi.buildMagnetFromHash(rawFields.infoHash, rawFields.title)
            : "";

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