// ==KiyomiExtension==
// @id           tokyotosho-js
// @name         TokyoTosho (RSS/XML)
// @version      1.0.1 // Updated version for change
// @author       Kiyomi Project
// @lang         all
// @icon         https://www.tokyotosho.info/favicon.ico
// @site         https://www.tokyotosho.info
// @package      tokyotosho.info
// @type         rss-xml
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  Scrapes TokyoTosho RSS feed for torrents.
// ==/KiyomiExtension==


// ===== Runtime metadata (optional, but useful) =====
const EXTENSION_INFO = {
    id: "tokyotosho-js",
    displayName: "TokyoTosho",
    siteUrl: "https://www.tokyotosho.info",
    iconUrl: "https://www.tokyotosho.info/favicon.ico",
    type: "RSS_XML",
    isAdult: true,
    isSecure: true,
    cautionReason: "Contains Hentai/JAV content.",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.1"
};

// Category mapping based on user-provided values
const CATEGORY_MAP = {
    "All": "0", // Filter ID 0 means no category filter applied
    "Anime": "1",
    "Non-English": "10",
    "Manga": "3",
    "Drama": "8",
    "Music": "2",
    "Music Video": "9",
    "Raws": "7",
    "Hentai": "4",
    "Hentai (Anime)": "12",
    "Hentai (Manga)": "13",
    "Hentai (Games)": "14",
    "Batch": "11",
    "JAV": "15",
    "Other": "5"
};

// Base URL without the filter parameter
const BASE_SEARCH_URL = "https://www.tokyotosho.info/rss.php?";


// ---------- helpers (functions remain the same) ----------

/**
 * Helper: extract text content between <tag>...</tag> inside a snippet of XML.
 */
function extractTag(xml, tagName) {
    // Escaping special characters for the regex
    const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Match <tag>content</tag>
    const re = new RegExp("<(?:" + escapedTagName + ")>([\\s\\S]*?)</(?:" + escapedTagName + ")>", "i");
    const m  = xml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * Helper: Extracts an attribute (like href) from an anchor tag within CDATA.
 */
function extractAnchorUrl(cdata, textMatch) {
    // Look for <a href="URL">TEXT_MATCH</a>
    const re = new RegExp('<a[^>]+href="([^"]+)"[^>]*>' + textMatch + '<\\/a>', "i");
    const m = cdata.match(re);
    return m ? m[1].trim() : null;
}

/**
 * Helper: Extracts a specific value (like size) from the CDATA body.
 */
function extractCdataValue(cdata, key) {
    // Look for Key: Value<br />
    const re = new RegExp(key + ":\\s*([^<]+)<br\\s*\\/?>", "i");
    const m = cdata.match(re);
    return m ? m[1].trim() : null;
}


// ---------- main entry for Kiyomi ----------

/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category  – The user-selected category key (e.g., "Anime").
 * @returns {Array<Object>}
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    Kiyomi.logDebug("TokyoTosho: Starting search for query '" + query + "' (Category: " + category + ")");

    // 1. Build RSS URL dynamically
    let url = BASE_SEARCH_URL;
    
    // Only include the filter parameter if a specific category is selected (not "All")
    if (catId !== CATEGORY_MAP["All"]) {
        url += "filter=" + encodeURIComponent(catId) + "&";
    }

    url += "terms=" + encodeURIComponent(query);
    url += "&reversepolarity=1"; // Add constant parameters

    Kiyomi.logDebug("TokyoTosho: Requesting URL: " + url);

    // 2. Fetch RSS XML via Kotlin bridge
    const rssXml = Kiyomi.httpGet(url);
    if (!rssXml) {
        Kiyomi.logDebug("TokyoTosho: HTTP fetch failed or returned empty content.");
        return [];
    }

    // 3. Parse <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results   = [];
    let match;
    let resultCount = 0;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // --- Core RSS fields ---
        const title       = extractTag(itemXml, "title");
        const pubDate     = extractTag(itemXml, "pubDate");
        const categoryName = extractTag(itemXml, "category");
        
        // Extract CDATA content from <description>
        const descriptionMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i);
        const cdataContent = descriptionMatch ? descriptionMatch[1].trim() : null;
        
        if (!cdataContent) {
            Kiyomi.logDebug("TokyoTosho: Skipping item: No CDATA description found.");
            continue;
        }

        // --- Data Extraction from CDATA ---
        
        // 1. URLs
        // We look for the text of the link to find the URL
        const torrentDownloadUrl = extractAnchorUrl(cdataContent, "Torrent Link");
        const magnetMatch = cdataContent.match(/href="(magnet:[^"]+)"/i);
        const magnetUrl = magnetMatch ? magnetMatch[1] : null;
        const infoUrl = extractAnchorUrl(cdataContent, "Tokyo Tosho");
        
        // 2. Size (Human readable string, e.g., "373.73MB")
        const sizeRaw = extractCdataValue(cdataContent, "Size");
        
        // --- Validation and Conversion ---

        if (!title || !magnetUrl) {
            Kiyomi.logDebug("TokyoTosho: Skipping item: Missing title or magnet link.");
            continue;
        }
        
        // Convert human readable size to bytes using the Kotlin bridge
        const sizeBytes = Kiyomi.humanSizeToBytes(sizeRaw || "");
        
        resultCount++;
        Kiyomi.logDebug("TokyoTosho: Mapped result " + resultCount + ": " + title);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentDownloadUrl, // 💡 Required
            infoUrl: infoUrl,                      // 💡 Required
            size: sizeBytes,
            // Seeds and Peers are not available in this feed
            seeds: 0,
            peers: 0,
            publishDate: pubDate,
            category_name: categoryName
        });
    }
    
    Kiyomi.logDebug("TokyoTosho: Finished scraping. Found " + results.length + " results.");

    return results;
}
