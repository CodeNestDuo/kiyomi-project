// ==KiyomiExtension==
// @id           acgrip-js
// @name         ACG.RIP (Chinese Anime RSS, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://acg.rip/favicon.ico
// @site         https://acg.rip
// @package      acg.rip
// @type         rss-xml
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  ACG.RIP RSS integration for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== metadata mirror (optional introspection) =====
const EXTENSION_INFO = {
    id: "acgrip-js",
    displayName: "ACG.RIP (Chinese Anime RSS)",
    siteUrl: "https://acg.rip",
    iconUrl: "https://acg.rip/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Same as JSON categoryMap
const CATEGORY_MAP = {
    "All": "",                 // → https://acg.rip/.xml?term=
    "Animation": "1",
    "Japanese drama": "2",
    "Variety Show": "3",
    "Music": "4",
    "Collection": "5",
    "other": "9"
};

// Same as JSON searchUrlTemplate
const SEARCH_URL_TEMPLATE = "https://acg.rip/{category}.xml?term={query}";


// ---------- helpers ----------

function extractTag(itemXml, tagName) {
    const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

function extractEnclosureUrl(itemXml) {
    const re = /<enclosure[^>]*\surl="([^"]+)"/i;
    const m = itemXml.match(re);
    return m ? m[1].trim() : "";
}

/**
 * From a .torrent URL, try to extract a 40-hex infohash and build a magnet.
 * Falls back to null if nothing found.
 */
function buildMagnetFromTorrentUrl(torrentUrl, title) {
    if (!torrentUrl) return null;
    const m = /([A-Fa-f0-9]{40})\.torrent/.exec(torrentUrl);
    if (!m) return null;
    const hash = m[1];
    try {
        return Kiyomi.buildMagnetFromHash(hash, title || "");
    } catch (e) {
        return null;
    }
}


// ---------- main entry for Kiyomi ----------

/**
 * Mirrors the JSON config:
 *  - HTTP_REQUEST to https://acg.rip/{category}.xml?term={query}
 *  - MAP_RESULTS_GENERIC on <item>
 *  - Post-processor BUILD_MAGNET_FROM_URL → JS version using torrent URL
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>}
 */
function search(query, category) {
    const catId = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    // Build URL
    let url = SEARCH_URL_TEMPLATE
        .replace("{category}", catId)
        .replace("{query}", encodeURIComponent(query || ""));

    const rssXml = Kiyomi.httpGet(url,null);
    if (!rssXml) return [];

    const itemsRegex = /<item>([\s\S]*?)<\/item>/gi;
    const results = [];
    let match;

    while ((match = itemsRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        const title = extractTag(itemXml, "title");
        if (!title) continue;

        const infoUrl = extractTag(itemXml, "guid");
        const torrentDownloadUrl = extractEnclosureUrl(itemXml);

        // JS equivalent of BUILD_MAGNET_FROM_URL
        let magnetUrl = buildMagnetFromTorrentUrl(torrentDownloadUrl, title);
        if (!magnetUrl) {
            // fallback – some clients can handle direct .torrent URL
            magnetUrl = torrentDownloadUrl || "";
        }

        results.push({
            title: title,
            torrentDownloadUrl: torrentDownloadUrl,
            magnetUrl: magnetUrl,
            infoUrl: infoUrl
        });
    }

    return results;
}

