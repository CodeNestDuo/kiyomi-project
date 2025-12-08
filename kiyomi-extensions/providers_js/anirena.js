// ==KiyomiExtension==
// @id           anirena-js
// @name         Anirena (Simple RSS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://www.anirena.com/favicon.ico
// @site         https://www.anirena.com
// @package      anirena.com
// @type         rss-xml
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  Simple search RSS scraping for Anirena.
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "anirena-js",
    displayName: "Anirena",
    siteUrl: "https://www.anirena.com",
    iconUrl: "https://www.anirena.com/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Only includes "All" since category filtering is not supported by the endpoint.
// The value is ignored, but the key is needed for the UI.
const CATEGORY_MAP = {
    "All": ""
};

// Search endpoint template: query is appended directly to 's='.
const SEARCH_URL_TEMPLATE =
    "https://www.anirena.com/rss.php?s={query}";


// ---------- helpers ----------

/**
 * Helper: extract text content between <tag>...</tag> inside a snippet of XML.
 * Handles potential namespaces like <td:tag>.
 */
function extractTag(xml, tagName) {
    // Escaping special characters for the regex
    const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match <optional:tagname>content</optional:tagname>
    // Allows for optional namespaces (like <td:tag>)
    const re = new RegExp("<(td?:)?(?:" + escapedTagName + ")>([\\s\\S]*?)</\\1?" + escapedTagName + ">", "i");
    const m = xml.match(re);
    return m ? m[2].trim() : "";
}

/**
 * Helper: Extracts numeric data (seeds, leechers, size) from the description string.
 * This is specific to Anirena's <description> tag structure.
 */
function extractFromDescription(description, pattern) {
    const m = description.match(pattern);
    return m ? m[1].trim() : "0";
}


// ---------- main entry for Kiyomi ----------

/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category  – Ignored for filtering, but needed for the function signature.
 * @returns {Array<Object>}
 */
function search(query, category) {
    // The category value is ignored as per instructions, only the query is used.
    const searchParam = encodeURIComponent(query);

    // 1. Build RSS URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{query}", searchParam);

    Kiyomi.logDebug("Anirena: Requesting URL: " + url);

    // 2. Fetch RSS XML via Kotlin bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        Kiyomi.logDebug("Anirena: Kiyomi bridge functions are missing.");
        return [];
    }

    const rssXml = Kiyomi.httpGet(url);
    if (!rssXml) {
        Kiyomi.logDebug("Anirena: HTTP fetch failed or returned empty content.");
        return [];
    }

    // 3. Parse <item> blocks under <channel>
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;
    let resultCount = 0;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // Core RSS fields
        const title = extractTag(itemXml, "title");
        const infoUrl = extractTag(itemXml, "link"); // Link is the details URL
        // Magnet URL is unusually found in the <comments> tag
        const magnetUrl = extractTag(itemXml, "comments");
        const pubDate = extractTag(itemXml, "pubDate");
        const description = extractTag(itemXml, "description");


        // --- Data Extraction from <description> ---
        // Example: 21 seeder(s), 1 leecher(s), 223 downloads, 423.23 MB - Series: ...

        // 1. Seeds
        const seedsStr = extractFromDescription(description, /(\d+)\s+seeder\(s\)/i);
        const seeds = parseInt(seedsStr, 10) || 0;

        // 2. Peers/Leechers
        const peersStr = extractFromDescription(description, /(\d+)\s+leecher\(s\)/i);
        const peers = parseInt(peersStr, 10) || 0;

        // 3. Size (e.g., 423.23 MB)
        const sizeRaw = extractFromDescription(description, /,\s*(\d+\.?\d*\s*[KMGT]B)/i);

        // --- Validation and Final Mapping ---

        if (!title || !magnetUrl || !magnetUrl.startsWith("magnet:")) {
            // Kiyomi.logDebug("Anirena: Skipping item: Missing title or magnet link.");
            continue;
        }

        // Convert human readable size to bytes using the Kotlin bridge
        const sizeBytes = Kiyomi.humanSizeToBytes(sizeRaw);
        resultCount++;
        Kiyomi.logDebug("Anirena: Mapped result " + resultCount + ": " + title);

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            // Assuming the title contains the hash for buildMagnetFromHash, 
            // but since we have the full magnet URL, we don't need the hash field.
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: pubDate,
            category_name: extractTag(itemXml, "category") // Preserve original category name from feed
        });
    }

    Kiyomi.logDebug("Anirena: Finished scraping. Found " + results.length + " results.");

    return results;
}
