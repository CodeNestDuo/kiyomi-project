// ==KiyomiExtension==
// @id           animetime-js
// @name         AnimeTime (RSS/XML)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://animetime.cc/favicon.ico
// @site         https://animetime.cc
// @package      animetime.cc
// @type         rss-xml
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  Scrapes AnimeTime RSS feed for torrents.
// @primaryCategory anime
// @extraCategories tv
// ==/KiyomiExtension==


// ===== Runtime metadata (optional, but useful) =====
const EXTENSION_INFO = {
    id: "animetime-js",
    displayName: "AnimeTime",
    siteUrl: "https://animetime.cc",
    iconUrl: "https://animetime.cc/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Available categories for the UI
const CATEGORY_MAP = {
    "All": "", // Empty category means no filter parameter
    "Anime": "anime",
    "Literature": "literature"
};

// Available tags (used to construct the URL)
const TAG_MAP = {
    // Keys match UI display, Values match URL parameter
    "None": "",
    "Music Video": "music_video",
    "English": "english",
    "Non-English": "non_english",
    "Nyaa SFF Uploader": "nyaa_uploader_sff"
};


// RSS search endpoint template. Category and Tag are optional.
const SEARCH_URL_TEMPLATE =
    "https://animetime.cc/rss/search?category={category}&tag={tag}&sort=date_desc&query={query}";


// ---------- helpers ----------

/**
 * Helper: extract text content between <tag>...</tag> inside a snippet of XML.
 * Handles namespaces like <at:size_bytes>.
 */
function extractTag(xml, tagName) {
    // Escaping special characters for the regex
    const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match <optional:tagname>content</optional:tagname>
    // (?:[a-z]+:)? allows for an optional namespace (e.g., 'at:')
    const re = new RegExp("<(a?:)?" + escapedTagName + ">([\\s\\S]*?)</\\1?" + escapedTagName + ">", "i");
    const m = xml.match(re);
    return m ? m[2].trim() : "";
}

/**
 * Helper: extract an attribute value from a standard RSS enclosure tag.
 * Note: Not strictly needed here as the <link> tag already contains the magnet URL.
 */
function extractEnclosureAttr(xml, attrName) {
    const re = new RegExp('<enclosure[^>]*' + attrName + '="([^"]+)"[^>]*>', "i");
    const m = xml.match(re);
    return m ? m[1].trim() : "";
}


// ---------- main entry for Kiyomi ----------

/**
 * Main entry point for Kiyomi.
 *  * Note: Since the Kiyomi search UI usually only passes one category argument,
 * we'll map the primary category (e.g., "Anime") to the URL's category field 
 * and ignore the tags for this simple implementation.
 *
 * @param {string} query
 * @param {string} category  – "All", "Anime", "Literature"
 * @returns {Array<Object>}
 */
function search(query, category) {
    const catParam = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    // NOTE: Tags are not supported in the standard Kiyomi category argument.
    // If we wanted tag support, we'd need a multi-selection UI feature or a different endpoint.
    // For now, we set tag to empty/None.
    const tagParam = "";

    // 1. Build RSS URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(catParam))
        .replace("{tag}", encodeURIComponent(tagParam)); // Tag is empty

    Kiyomi.logDebug("AnimeTime: Requesting URL: " + url.replace(/apikey=([^&]*)/, 'apikey=***'));

    // 2. Fetch RSS XML via Kotlin bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const rssXml = Kiyomi.httpGet(url,null);

    // 3. Parse <item> blocks under <channel>
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;
    let resultCount = 0;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // Core RSS fields
        const title = extractTag(itemXml, "title");
        const magnetUrl = extractTag(itemXml, "link"); // Magnet is in the <link> tag
        const pubDate = extractTag(itemXml, "pubDate");

        // Custom <at:> fields
        const sizeBytesStr = extractTag(itemXml, "at:size_bytes");
        const categoryName = extractTag(itemXml, "category");

        // The feed does not contain seeds/peers, so they will be 0.
        const seeds = 0;
        const peers = 0;

        if (!title || !magnetUrl || !magnetUrl.startsWith("magnet:")) {
            Kiyomi.logDebug("AnimeTime: Skipping item: Missing title or magnet link.");
            continue;
        }

        // Convert size string (which should be an integer string) to a number (long)
        const size = parseInt(sizeBytesStr, 10) || 0;

        resultCount++;
        Kiyomi.logDebug("AnimeTime: Mapped result " + resultCount + ": " + title);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            // hash is not explicitly needed if magnet is present
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: "", // No detail page provided in this feed structure
            publishDate: pubDate,
            category_name: categoryName // Keep for context
        });
    }

    Kiyomi.logDebug("AnimeTime: Finished scraping. Found " + results.length + " results.");

    return results;
}
