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
    //"Anime": "5070",
    //"Movies": "2000"
};

// Torznab search endpoint template
const SEARCH_URL_TEMPLATE =
    "https://nekobt.to/api/torznab/api?t=search&q={query}&cat={category}&apikey={API_KEY}";


// ---------- helpers ----------

/**
 * Resolve the API key using engine-injected globals and/or the Kiyomi bridge.
 * Prefers KIYOMI_API_KEY injected by KiyomiJsExtensionEngine.
 */
function resolveApiKey() {
    // 1) Prefer engine-injected constant
    if (typeof KIYOMI_API_KEY === "string" && KIYOMI_API_KEY.length > 0) {
        return KIYOMI_API_KEY;
    }

    // 2) Fallback: use injected provider id (or EXTENSION_INFO / hardcoded default)
    let providerId = "";
    if (typeof KIYOMI_PROVIDER_ID === "string" && KIYOMI_PROVIDER_ID.length > 0) {
        providerId = KIYOMI_PROVIDER_ID;
    } else if (EXTENSION_INFO && typeof EXTENSION_INFO.id === "string") {
        providerId = EXTENSION_INFO.id; // "nekobt-js"
    } else {
        providerId = "nekobt-js";
    }

    if (typeof Kiyomi === "object" && typeof Kiyomi.getApiKey === "function") {
        return Kiyomi.getApiKey(providerId) || "";
    }

    return "";
}

/**
 * Helper: extract text between <tag>...</tag> inside a snippet of XML.
 */
function extractTag(xml, tagName) {
    // NOTE: single backslashes here; this builds a *string* for RegExp
    const re = new RegExp("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">", "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Helper: extract a named torznab:attr value
 *   <torznab:attr name="size" value="123456" />
 */
function extractTorznabAttr(xml, attrName) {
    const re = new RegExp(
        '<torznab:attr[^>]*name="' + attrName + '"[^>]*value="([^"]+)"[^>]*>',
        "i"
    );
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}


// ---------- main entry for Kiyomi ----------

/**
 * Main entry point for Kiyomi:
 *   - Called by KiyomiJsExtensionEngine as search(query, category)
 *   - Returns an array of objects that map directly to TorrentDescription.
 *
 * @param {string} query
 * @param {string} category  – "All", "Anime", "Series", "Movies"
 * @returns {Array<Object>}
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new Error(
            "NekoBT API key is empty. Configure it in Kiyomi (Extensions → API key) for provider 'nekobt-js'."
        );
    }

    // 1. Build Torznab URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(catId))
        .replace("{API_KEY}", encodeURIComponent(apiKey));

    // 2. Fetch RSS XML via Kotlin bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const rssXml = Kiyomi.httpGet(url);

    // 3. Parse <item> blocks under <channel>
    // IMPORTANT: regex literal here uses *single* backslashes
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // Core RSS fields
        const title = extractTag(itemXml, "title");
        const infoUrl = extractTag(itemXml, "comments");
        const pubDate = extractTag(itemXml, "pubDate");

        const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*>/i);
        const torrentDownloadUrl = enclosureMatch ? enclosureMatch[1] : "";

        // Torznab attributes
        const hash = extractTorznabAttr(itemXml, "infohash");
        const magnetAttr = extractTorznabAttr(itemXml, "magneturl");
        const sizeStr = extractTorznabAttr(itemXml, "size");
        const seedsStr = extractTorznabAttr(itemXml, "seeders");
        const peersStr = extractTorznabAttr(itemXml, "peers");

        if (!title) continue;
        if (!hash && !magnetAttr) continue; // must have at least one identifier

        const size = parseInt(sizeStr, 10) || 0;
        const seeds = parseInt(seedsStr, 10) || 0;
        const peers = parseInt(peersStr, 10) || 0;

        // Prefer the Torznab magneturl; if missing, fall back to building from hash
        const magnetUrl =
            magnetAttr && magnetAttr.length > 0
                ? magnetAttr
                : (hash && typeof Kiyomi.buildMagnetFromHash === "function"
                    ? Kiyomi.buildMagnetFromHash(hash, title)
                    : "");

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

