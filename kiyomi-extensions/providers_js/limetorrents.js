// ==KiyomiExtension==
// @id           limetorrents-js
// @name         LimeTorrents (RSS, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://www.limetorrents.lol/favicon.ico
// @site         https://www.limetorrents.lol
// @package      limetorrents.lol
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  LimeTorrents search via RSS using the Kiyomi JS engine.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==


// ===== Extension Metadata (runtime object, optional but handy) =====
const EXTENSION_INFO = {
    id: "limetorrents-js",
    displayName: "LimeTorrents (RSS, JS)",
    siteUrl: "https://www.limetorrents.lol",
    iconUrl: "https://www.limetorrents.lol/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: false,
    cautionReason: "Unverified public indexer. Contains potentially harmful/mislabelled torrents.",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// Maps your internal Category enum to LimeTorrents' category strings
const CATEGORY_MAP = {
    "All": "all",
    "Anime": "Anime",
    "Movies": "Movies",
    "Music": "Music",
    "TV shows": "TV shows",
    "Applications": "Applications",
    "Games": "Games",
    "Other": "Other"
};

// Same as JSON searchUrlTemplate
const SEARCH_URL_TEMPLATE =
    "https://www.limetorrents.lol/searchrss/{query}/{category}/";


/**
 * Executes a search against LimeTorrents RSS.
 * @param {string} query
 * @param {string} category  – one of CATEGORY_MAP keys
 * @returns {Array<Object>}  – list of torrent description objects
 */
function search(query, category) {
    const categoryPath = CATEGORY_MAP[category] || CATEGORY_MAP["All"];

    // 1. Build search URL
    let searchUrl = SEARCH_URL_TEMPLATE
        .replace("{query}", encodeURIComponent(query))
        .replace("{category}", encodeURIComponent(categoryPath));

    // 2. Fetch RSS XML
    const rssXml = Kiyomi.httpGet(searchUrl,null);

    // 3. Parse <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const results = [];
    let match;

    while ((match = itemRegex.exec(rssXml)) !== null) {
        const itemXml = match[1];

        // --- Helpers ---
        const extractTag = (xml, tagName) => {
            const tagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
            const tagMatch = xml.match(tagRegex);
            return tagMatch ? tagMatch[1].trim() : "";
        };

        const extractAttrFromTag = (xml, tagName, attrName) => {
            const attrRegex = new RegExp(
                `<${tagName}[^>]*\\s${attrName}="([^"]+)"[^>]*>`,
                "i"
            );
            const attrMatch = xml.match(attrRegex);
            return attrMatch ? attrMatch[1] : "";
        };

        // --- Raw fields from RSS ---
        const title = extractTag(itemXml, "title");
        const infoUrl = extractTag(itemXml, "link");
        const publishDate = extractTag(itemXml, "pubDate");
        const sizeText = extractTag(itemXml, "size"); // raw bytes string
        const description = extractTag(itemXml, "description");
        const enclosureUrl = extractAttrFromTag(itemXml, "enclosure", "url");

        // Size is already raw bytes -> parse directly
        const size = parseInt(sizeText, 10) || 0;

        // Extract infoHash from enclosure URL (torrent/40HEX.torrent)
        let infoHash = "";
        if (enclosureUrl) {
            const hashMatch = enclosureUrl.match(/torrent\/([A-Fa-f0-9]{40})\.torrent/);
            if (hashMatch) {
                infoHash = hashMatch[1];
            }
        }

        if (!infoHash) {
            // Must have hash to build a magnet
            continue;
        }

        // Seeds and peers from description
        let seeds = 0;
        let peers = 0;

        if (description) {
            const seedsMatch = description.match(/Seeds:\s*(\d+)/i);
            if (seedsMatch) {
                seeds = parseInt(seedsMatch[1], 10) || 0;
            }

            const peersMatch = description.match(/Leechers\s*(\d+)/i);
            if (peersMatch) {
                peers = parseInt(peersMatch[1], 10) || 0;
            }
        }

        // Magnet from hash + title
        const magnetUrl = Kiyomi.buildMagnetFromHash(infoHash, title);

        // Final object mapped to TorrentDescription fields
        results.push({
            title: title,
            magnetUrl: magnetUrl,
            hash: infoHash,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            torrentDownloadUrl: enclosureUrl,
            publishDate: publishDate
        });
    }

    return results;
}

