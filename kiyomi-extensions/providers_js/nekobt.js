// ==KiyomiExtension==
// @id           nekobt-js
// @name         NekoBT (Torznab Anime, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://nekobt.to/cdn/pfp/null/64
// @site         https://nekobt.to
// @package      nekobt.to
// @type         torznab-rss
// @nsfw         false
// @secure       true
// @private      true
// @requiresKey  true
// @description  NekoBT Torznab indexer via Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== Runtime metadata (optional, but useful) =====
const EXTENSION_INFO = {
    id: "nekobt-js",
    displayName: "NekoBT (Torznab Anime, JS)",
    siteUrl: "https://nekobt.to",
    iconUrl: "https://nekobt.to/cdn/pfp/null/64",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: true,
    isApiKeyRequired: true,
    version: "1.0.0"
};

// Torznab category map (same as JSON)
const CATEGORY_MAP = {
    "All": "0",
    "Anime": "5070",
    "Series": "5000",
    "Movies": "2000"
};

// Torznab search endpoint template
const SEARCH_URL_TEMPLATE =
    "https://nekobt.to/api/torznab/api?t=search&q={query}&cat={category}&apikey={API_KEY}";

// IMPORTANT:
// For now we assume Kiyomi will provide the API key somehow.
// Easiest future option:
//
//   const API_KEY = Kiyomi.getApiKey("nekobt") || "";
//
// For now we keep a placeholder:
const API_KEY = ""; // TODO: inject via bridge or edit manually.


/**
 * Helper: extract text between <tag>...</tag> inside a snippet of XML.
 */
function extractTag(xml, tagName) {
    const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const m  = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Helper: extract a named torznab:attr value
 *   <torznab:attr name="size" value="123456" />
 */
function extractTorznabAttr(xml, attrName) {
    const re = new RegExp(
        `<torznab:attr[^>]*name="${attrName}"[^>]*value="([^"]+)"[^>]*>`,
        "i"
    );
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Main entry point for Kiyomi:
 *   - Called by QuickJsExtensionEngine as search(query, category)
 *   - Returns an array of objects that map directly to TorrentDescription.
 *
 * @param {string} query
 * @param {string} category  – "All", "Anime", "Series", "Movies"
 * @returns {Array<Object>}
 */
function search(query, category) {
    const catId   = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    if (!API_KEY) {
        // In practice you’ll wire this via Kiyomi bridge, but this protects from silent failures.
        throw new Error("NekoBT API_KEY is empty. Configure it in the JS extension or via Kiyomi bridge.");
    }

    // 1. Build Torznab URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(catId))
        .replace("{API_KEY}", encodeURIComponent(API_KEY));

    // 2. Fetch RSS XML via Kotlin bridge
    const rssXml = Kiyomi.httpGet(url);

    // 3. Parse <item> blocks under <channel>
    const itemRegex = /<item>([\\s\\S]*?)<\\/item>/g;
    const results   = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // Core RSS fields
        const title       = extractTag(itemXml, "title");
        const infoUrl     = extractTag(itemXml, "comments");
        const pubDate     = extractTag(itemXml, "pubDate");
        const enclosureRe = /<enclosure[^>]*url="([^"]+)"[^>]*>/i;
        const enclosureM  = itemXml.match(enclosureRe);
        const torrentDownloadUrl = enclosureM ? enclosureM[1] : "";

        // Torznab attributes
        const hash       = extractTorznabAttr(itemXml, "infohash");
        const magnetAttr = extractTorznabAttr(itemXml, "magneturl");
        const sizeStr    = extractTorznabAttr(itemXml, "size");
        const seedsStr   = extractTorznabAttr(itemXml, "seeders");
        const peersStr   = extractTorznabAttr(itemXml, "peers");

        if (!title) continue;
        if (!hash && !magnetAttr) continue; // must have at least one identifier

        const size  = parseInt(sizeStr, 10)   || 0;
        const seeds = parseInt(seedsStr, 10)  || 0;
        const peers = parseInt(peersStr, 10)  || 0;

        // Prefer the Torznab magneturl; if missing, you *could* fallback to
        // Kiyomi.buildMagnetFromHash(hash, title).
        const magnetUrl =
            magnetAttr && magnetAttr.length > 0
                ? magnetAttr
                : (hash ? Kiyomi.buildMagnetFromHash(hash, title) : "");

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate,
            torrentDownloadUrl: torrentDownloadUrl
        });
    }

    return results;
}

