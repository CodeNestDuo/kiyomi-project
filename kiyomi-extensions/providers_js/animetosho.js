// ==KiyomiExtension==
// @id           animetosho-js
// @name         Anime Tosho (Torznab, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://animetosho.org/inc/favicon.ico
// @site         https://animetosho.org
// @package      animetosho.org
// @type         rss-xml
// @nsfw         false
// @secure       true
// @private      true
// @requiresKey  true
// @description  Anime Tosho Torznab-style RSS integration for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== metadata mirror (optional introspection) =====
const EXTENSION_INFO = {
    id: "animetosho-js",
    displayName: "Anime Tosho (Torznab)",
    siteUrl: "https://animetosho.org",
    iconUrl: "https://animetosho.org/inc/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: true,
    isApiKeyRequired: true,
    version: "1.0.0"
};

// Same as JSON categoryMap
const CATEGORY_MAP = {
    "All": ""
};

// Same as JSON searchUrlTemplate
const SEARCH_URL_TEMPLATE = "https://feed.animetosho.org/api?q={query}";


// ---------- helpers ----------

/**
 * Extracts simple <tag>value</tag> from an item XML chunk.
 */
function extractTag(itemXml, tagName) {
    const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Extracts the 'url' attribute from <enclosure ... url="...">
 */
function extractEnclosureUrl(itemXml) {
    const re = /<enclosure[^>]*\surl="([^"]+)"/i;
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Extracts Torznab-style attributes:
 *   <torznab:attr name="infohash" value="ABC..." />
 */
function extractTorznabAttr(itemXml, name) {
    const re = new RegExp(
        `<torznab:attr[^>]*\\bname="${name}"[^>]*\\bvalue="([^"]*)"`,
        "i"
    );
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Extracts Newznab-style attributes:
 *   <newznab:attr name="coverurl" value="..." />
 */
function extractNewznabAttr(itemXml, name) {
    const re = new RegExp(
        `<newznab:attr[^>]*\\bname="${name}"[^>]*\\bvalue="([^"]*)"`,
        "i"
    );
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}


// ---------- main entry for Kiyomi ----------

/**
 * Mirrors the JSON config:
 *  - HTTP_REQUEST (GET feed.animetosho.org/api?q=...)
 *  - MAP_RESULTS_GENERIC on <item> blocks
 *  - Direct mapping of torznab/newznab attributes
 *
 * @param {string} query
 * @param {string} category  // currently unused, but kept for API symmetry
 * @returns {Array<Object>}  // maps 1:1 to TorrentDescription fields
 */
function search(query, category) {
    // 1) Build URL (category is unused, but we keep the signature consistent)
    let searchUrl = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query || ""));

    // 2) Fetch RSS via bridge
    const rssXml = Kiyomi.httpGet(searchUrl);
    if (!rssXml) return [];

    // 3) Iterate over <item>...</item>
    const itemsRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemsRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        if (!title) continue;

        const infoUrl = extractTag(itemXml, "guid");
        const torrentDownloadUrl = extractEnclosureUrl(itemXml);

        const magnetUrl = extractTorznabAttr(itemXml, "magneturl");
        const hash = extractTorznabAttr(itemXml, "infohash");

        const bannerImageUrl = extractTorznabAttr(itemXml, "bannerurl");
        const coverImageUrl = extractNewznabAttr(itemXml, "coverurl");

        const sizeStr = extractTorznabAttr(itemXml, "size");       // already bytes
        const seedsStr = extractTorznabAttr(itemXml, "seeders");
        const peersStr = extractTorznabAttr(itemXml, "leechers");
        const publishDate = extractTag(itemXml, "pubDate");        // RFC822 string

        const imdbId = extractTorznabAttr(itemXml, "imdb");
        const tvdbIdStr = extractTorznabAttr(itemXml, "tvdbid");
        const seasonStr = extractNewznabAttr(itemXml, "season");
        const yearStr = extractNewznabAttr(itemXml, "year");

        const size = sizeStr ? (parseInt(sizeStr, 10) || 0) : 0;
        const seeds = seedsStr ? (parseInt(seedsStr, 10) || 0) : 0;
        const peers = peersStr ? (parseInt(peersStr, 10) || 0) : 0;
        const tvdbId = tvdbIdStr ? (parseInt(tvdbIdStr, 10) || 0) : 0;
        const season = seasonStr ? (parseInt(seasonStr, 10) || 0) : 0;
        const year = yearStr ? (parseInt(yearStr, 10) || 0) : 0;

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentDownloadUrl,
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            coverImageUrl: coverImageUrl,
            bannerImageUrl: bannerImageUrl,
            imdbId: imdbId || null,
            tvdbId: tvdbId,
            season: season,
            year: year,
            publishDate: publishDate
        });
    }

    return results;
}

