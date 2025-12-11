// ==KiyomiExtension==
// @id             mikanproject-js
// @name           MikanProject
// @version        1.0.0
// @author         Cycloctane (ported for Kiyomi by Kiyomi Community)
// @lang           all
// @icon           https://mikanime.tv/favicon.ico
// @site           https://mikanime.tv
// @package        mikanime.tv
// @type           rss-xml
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Uses MikanProject RSS search to fetch anime torrents.
// @primaryCategory anime
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "mikanproject-js",
    displayName: "MikanProject",
    siteUrl: "https://mikanime.tv",
    iconUrl: "https://mikanime.tv/favicon.ico",
    type: "RSS_XML",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};

// ===== Provider URLs =====
const MIKAN_BASE = "https://mikanime.tv";
const MIKAN_RSS_SEARCH = MIKAN_BASE + "/RSS/Search";

// ===== Categories for Kiyomi UI =====
//
// Original Python plugin had:
//   supported_categories = {'all': '', 'anime': ''}
// and never sent category in the URL, so the backend doesn't filter.
// Here we still expose categories so your UI can show a filter.
const CATEGORY_MAP = {
    "All":  "",      // no filter
    "Anime": "anime" // purely semantic / for labeling; not used in request
};

// ===== Category handling =====
function resolveCategory(category) {
    // Normalize to our two supported labels: "All" or "Anime"
    if (Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category)) {
        return category; // already "All" or "Anime"
    }

    const lc = String(category || "").trim().toLowerCase();
    if (lc === "anime") return "Anime";

    return "All";
}


// ===== Small helpers =====

/**
 * Build query string from a plain object.
 */
function buildQueryString(params) {
    const parts = [];
    for (const key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
        const value = params[key];
        if (value === undefined || value === null || value === "") continue;
        parts.push(
            encodeURIComponent(key) + "=" + encodeURIComponent(String(value))
        );
    }
    return parts.join("&");
}

/**
 * Minimal HTML entity decoder for titles/links from RSS.
 */
function decodeHtmlEntities(text) {
    if (!text) return "";
    return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, function (_m, entity) {
        switch (entity) {
            case "amp":
                return "&";
            case "lt":
                return "<";
            case "gt":
                return ">";
            case "quot":
                return '"';
            case "apos":
                return "'";
        }
        // numeric variants: &#123; or &#x7B;
        if (entity.charAt(0) === "#") {
            let code = 0;
            if (entity.charAt(1).toLowerCase() === "x") {
                code = parseInt(entity.slice(2), 16);
            } else {
                code = parseInt(entity.slice(1), 10);
            }
            if (!isNaN(code)) {
                return String.fromCharCode(code);
            }
        }
        return "&" + entity + ";";
    });
}

/**
 * Parse Mikan RSS XML into Kiyomi torrent objects.
 * We only need: <title>, <link>, <enclosure url="" length="">, <pubDate>.
 *
 * @param {string} rssText
 * @param {string} categoryDisplayName  "All" or "Anime" (for category_name)
 */
function parseMikanRss(rssText, categoryDisplayName) {
    if (!rssText) {
        Kiyomi.logDebug("Mikan: Empty RSS text.");
        return [];
    }

    const items = [];
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    let match;
    let index = 0;

    while ((match = itemRegex.exec(rssText)) !== null) {
        const block = match[0];

        // title
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
        const rawTitle = titleMatch ? titleMatch[1].trim() : "";
        const title = decodeHtmlEntities(rawTitle);

        // description link
        const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
        const rawDescLink = linkMatch ? linkMatch[1].trim() : "";
        const descLink = decodeHtmlEntities(rawDescLink);

        // enclosure
        const enclosureMatch = block.match(
            /<enclosure[^>]*url="([^"]+)"[^>]*length="([^"]+)"[^>]*\/?>/i
        );
        let torrentUrl = "";
        let sizeBytes = 0;
        if (enclosureMatch) {
            torrentUrl = enclosureMatch[1];
            const lengthStr = enclosureMatch[2];
            const parsedSize = parseInt(lengthStr, 10);
            if (!isNaN(parsedSize) && parsedSize >= 0) {
                sizeBytes = parsedSize;
            }
        } else {
            // fallback: if no enclosure, try to use <link> as torrent URL
            torrentUrl = descLink;
        }

        if (!title || !torrentUrl) {
            Kiyomi.logDebug(
                "Mikan: Skipping item at index " +
                index +
                " due to missing title or torrent URL."
            );
            index++;
            continue;
        }

        // pubDate (optional)
        let publishEpoch = 0;
        const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        if (pubDateMatch) {
            const pubRaw = pubDateMatch[1].trim();
            const ms = Date.parse(pubRaw);
            if (!isNaN(ms)) {
                publishEpoch = Math.floor(ms / 1000);
            }
        }

        // Determine magnet vs direct .torrent
        let magnetUrl = undefined;
        let torrentDownloadUrl = undefined;
        if (torrentUrl.indexOf("magnet:?") === 0) {
            magnetUrl = torrentUrl;
        } else {
            torrentDownloadUrl = torrentUrl;
        }

        items.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentDownloadUrl,
            size: sizeBytes,
            seeds: 0, // unknown in RSS, original plugin used -1
            peers: 0, // unknown in RSS
            infoUrl: descLink || MIKAN_BASE,
            publishDate: publishEpoch > 0 ? String(publishEpoch) : "",
            category_name: categoryDisplayName || "Anime"
            // hash, coverImageUrl left undefined (not provided by RSS)
        });

        index++;
    }

    Kiyomi.logDebug(
        "Mikan: Parsed " + items.length + " items from RSS response."
    );
    return items;
}


// ===== Main entrypoint =====

/**
 * Main entry for Kiyomi.
 *
 * @param {string} query
 * @param {string} category  // "All" or "Anime" from UI
 * @returns {Array<Object>}
 */
function search(query, category) {
    Kiyomi.logDebug(
        "Mikan: Starting search. Query='" +
        query +
        "', category='" +
        category +
        "'"
    );

    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        Kiyomi.logDebug("Mikan: Blank query, returning empty result.");
        return [];
    }

    // Determine which category label the user picked ("All" / "Anime")
    const categoryDisplayName = resolveCategory(category);
    Kiyomi.logDebug("Mikan: Resolved category = " + categoryDisplayName);

    // Build URL: https://mikanime.tv/RSS/Search?searchstr=<query>
    // (Mikan does NOT support category in query, so we ignore it for the request)
    const params = { searchstr: trimmedQuery };
    const qs = buildQueryString(params);
    const url = MIKAN_RSS_SEARCH + "?" + qs;

    // Do NOT set Accept-Encoding; OkHttp handles gzip.
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept:
            "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    let rssText;
    try {
        Kiyomi.logDebug("Mikan: Requesting RSS URL: " + url);
        rssText = Kiyomi.httpGet(url, headersString);
    } catch (e) {
        Kiyomi.logError(
            "Mikan: HTTP error for URL " +
            url +
            " – " +
            (e && e.message ? e.message : String(e))
        );
        return [];
    }

    let items;
    try {
        items = parseMikanRss(rssText, categoryDisplayName);
    } catch (e) {
        // This is the JS equivalent of __print_message("error: ...")
        Kiyomi.logError(
            "Mikan: Parse error – " +
            (e && e.message ? e.message : String(e))
        );
        return [];
    }

    // No sorting here – RSS usually returns most recent first.
    Kiyomi.logDebug(
        "Mikan: Finished search. Total results returned: " + items.length
    );
    return items;
}
