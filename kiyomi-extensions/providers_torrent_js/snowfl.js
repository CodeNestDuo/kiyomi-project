// ==KiyomiExtension==
// @id             snowfl-js
// @name           Snowfl
// @version        1.0.0
// @author         LightDestory (ported for Kiyomi by Kiyomi Community)
// @lang           all
// @icon           https://snowfl.com/favicon.ico
// @site           https://snowfl.com
// @package        snowfl.com
// @type           api-json
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Uses Snowfl JSON API search (token + random path) to fetch torrent results.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "snowfl-js",
    displayName: "Snowfl",
    siteUrl: "https://snowfl.com",
    iconUrl: "https://snowfl.com/favicon.ico",
    type: "API_JSON",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};


// ===== Provider URLs =====
const SNOWFL_BASE = "https://snowfl.com";


// ===== Category handling =====
//
// Original plugin had only:
//   supported_categories = {'all': '0'}
// No real filtering in the query. We keep a minimal map for the UI.
const CATEGORY_MAP = {
    "All": "0"
};

function resolveCategory(category) {
    if (Object.prototype.hasOwnProperty.call(CATEGORY_MAP, category)) {
        return category;
    }
    const lc = String(category || "").trim().toLowerCase();
    if (lc === "all" || lc === "" || lc === "0") return "All";
    return "All";
}


// ===== Tuning knobs =====

const SNOWFL_CONFIG = {
    /**
     * Maximum number of results we return to Kiyomi from the JSON array.
     */
    MAX_RESULTS: 60
};


// ===== Small helpers =====

/**
 * Minimal HTML entity decoder (in case Snowfl HTML-escapes names).
 */
function decodeHtmlEntities(text) {
    if (!text) return "";
    return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, function (_m, entity) {
        switch (entity) {
            case "amp": return "&";
            case "lt": return "<";
            case "gt": return ">";
            case "quot": return '"';
            case "apos": return "'";
        }
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
 * Extract infoHash from a magnet URI (if present).
 */
function extractInfoHashFromMagnet(magnet) {
    if (!magnet || typeof magnet !== "string") return undefined;
    const m = magnet.match(/btih:([^&]+)/i);
    if (!m) return undefined;
    return m[1];
}

/**
 * Generate an 8-char random string [a-z0-9].
 */
function randomSlug() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}


// ===== Token retrieval =====

/**
 * Retrieve dynamic token used by Snowfl search URL.
 * This mirrors the Python plugin logic:
 *  1. GET /index.html
 *  2. Extract "b.min.js?<something>"
 *  3. GET that JS and extract the token via regex.
 */
function retrieveSnowflToken(headersString) {
    const indexUrl = SNOWFL_BASE + "/index.html";
    let indexHtml;
    try {
        Kiyomi.logDebug("Snowfl: Fetching index HTML: " + indexUrl);
        indexHtml = Kiyomi.httpGet(indexUrl, headersString);
    } catch (e) {
        Kiyomi.logError(
            "Snowfl: Failed to fetch index.html – " +
            (e && e.message ? e.message : String(e))
        );
        return null;
    }

    if (!indexHtml) {
        Kiyomi.logError("Snowfl: index.html is empty.");
        return null;
    }

    // Matches: "(b.min.js?<stuff>)"
    const jsMatch = indexHtml.match(/"(b\.min\.js\?[^"]+)"/i);
    if (!jsMatch || !jsMatch[1]) {
        Kiyomi.logError("Snowfl: Failed to locate b.min.js reference in index.html.");
        return null;
    }

    const jsPath = jsMatch[1];
    const jsUrl = SNOWFL_BASE + "/" + jsPath.replace(/^\/+/, "");

    let scriptText;
    try {
        Kiyomi.logDebug("Snowfl: Fetching script: " + jsUrl);
        scriptText = Kiyomi.httpGet(jsUrl, headersString);
    } catch (e) {
        Kiyomi.logError(
            "Snowfl: Failed to fetch script " +
            jsUrl +
            " – " +
            (e && e.message ? e.message : String(e))
        );
        return null;
    }

    if (!scriptText) {
        Kiyomi.logError("Snowfl: Script content is empty.");
        return null;
    }

    // Python regex:
    // r'"([a-zA-Z0-9]+)";\$\(\(function\(\){var e,t,n,r,o,a,i='
    const tokenMatch = scriptText.match(
        /"([a-zA-Z0-9]+)";\$\(\(function\(\){var e,t,n,r,o,a,i=/i
    );
    if (!tokenMatch || !tokenMatch[1]) {
        Kiyomi.logError("Snowfl: Failed to extract token from script.");
        return null;
    }

    const token = tokenMatch[1];
    Kiyomi.logDebug("Snowfl: Retrieved token: " + token);
    return token;
}

/**
 * Build Snowfl JSON search URL from token + query.
 * Mirrors Python generateQuery:
 *   '{0}/{1}/{2}/{3}/0/SEED/NONE/1?_={4}'
 */
function buildSnowflSearchUrl(token, encodedQuery) {
    const slug = randomSlug();
    const timestamp = Date.now(); // ms since epoch
    // Python uses self.url which had trailing "/", we use SNOWFL_BASE without trailing
    const url =
        SNOWFL_BASE +
        "/" +
        token +
        "/" +
        encodedQuery +
        "/" +
        slug +
        "/0/SEED/NONE/1?_=" +
        String(timestamp);

    return url;
}


// ===== JSON parsing =====

/**
 * Parse Snowfl JSON array into Kiyomi torrent objects.
 * Each `torrent` object is expected to have at least:
 *  - name
 *  - size
 *  - seeder
 *  - leecher
 *  - url
 *  - (optional) magnet
 */
function parseSnowflResults(jsonText) {
    if (!jsonText) {
        Kiyomi.logDebug("Snowfl: Empty JSON text.");
        return [];
    }

    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        Kiyomi.logError(
            "Snowfl: Failed to parse JSON – " +
            (e && e.message ? e.message : String(e))
        );
        return [];
    }

    if (!Array.isArray(data)) {
        Kiyomi.logError("Snowfl: Expected JSON array but got something else.");
        return [];
    }

    const out = [];
    for (let i = 0; i < data.length; i++) {
        const torrent = data[i] || {};
        let name = torrent.name || "";
        let size = torrent.size || "";
        let seeds = torrent.seeder || 0;
        let leechers = torrent.leecher || 0;
        const pageUrlRaw = torrent.url || "";

        name = decodeHtmlEntities(String(name).trim());
        size = String(size).trim();
        seeds = typeof seeds === "number" && !isNaN(seeds) ? seeds : 0;
        leechers =
            typeof leechers === "number" && !isNaN(leechers) ? leechers : 0;

        if (!name || !pageUrlRaw) {
            Kiyomi.logDebug(
                "Snowfl: Skipping item at index " +
                i +
                " due to missing name or url."
            );
            continue;
        }

        const hasMagnet = typeof torrent.magnet === "string" && torrent.magnet;
        const magnet = hasMagnet ? torrent.magnet : null;

        let infoUrl;
        if (pageUrlRaw.startsWith("http")) {
            infoUrl = pageUrlRaw;
        } else {
            infoUrl = SNOWFL_BASE + pageUrlRaw;
        }

        let magnetUrl = null;
        let torrentDownloadUrl = null;

        if (magnet && magnet.indexOf("magnet:?") === 0) {
            magnetUrl = magnet;
        } else {
            // Fallback: treat pageUrl as direct torrent download if it looks like one,
            // else just keep it as infoUrl.
            if (pageUrlRaw.endsWith(".torrent")) {
                torrentDownloadUrl = infoUrl;
            }
        }

        const hash = magnetUrl ? extractInfoHashFromMagnet(magnetUrl) : undefined;

        out.push({
            title: name,
            magnetUrl: magnetUrl || undefined,
            torrentDownloadUrl: torrentDownloadUrl || undefined,
            size: size,          // human-readable or numeric string; can convert on Kotlin side if desired
            seeds: seeds,
            peers: leechers,
            infoUrl: infoUrl,
            publishDate: "",     // Snowfl JSON doesn’t provide explicit date in original plugin
            category_name: "All",
            hash: hash
        });
    }

    Kiyomi.logDebug("Snowfl: Parsed " + out.length + " items from JSON response.");
    return out;
}


// ===== Main entrypoint =====

/**
 * Main entry for Kiyomi.
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>}
 */
function search(query, category) {
    const displayCategory = resolveCategory(category);

    Kiyomi.logDebug(
        "Snowfl: Starting search. Query='" +
        query +
        "', category='" +
        displayCategory +
        "'"
    );

    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        Kiyomi.logDebug("Snowfl: Blank query, returning empty result.");
        return [];
    }

    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        Kiyomi.logError("Snowfl: Kiyomi.httpGet is not available.");
        return [];
    }

    // Headers – let OkHttp handle Accept-Encoding.
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    // 1. Get token
    const token = retrieveSnowflToken(headersString);
    if (!token) {
        Kiyomi.logError("Snowfl: Cannot proceed without token.");
        return [];
    }

    // 2. Build query URL
    const encodedQuery = encodeURIComponent(trimmedQuery);
    const searchUrl = buildSnowflSearchUrl(token, encodedQuery);

    Kiyomi.logDebug("Snowfl: Search URL: " + searchUrl);

    // 3. Fetch JSON
    let jsonText;
    try {
        jsonText = Kiyomi.httpGet(searchUrl, headersString);
    } catch (e) {
        Kiyomi.logError(
            "Snowfl: HTTP error for URL " +
            searchUrl +
            " – " +
            (e && e.message ? e.message : String(e))
        );
        return [];
    }

    // 4. Parse JSON
    let items = parseSnowflResults(jsonText);

    // 5. Hard cap on results
    if (items.length > SNOWFL_CONFIG.MAX_RESULTS) {
        items = items.slice(0, SNOWFL_CONFIG.MAX_RESULTS);
    }

    Kiyomi.logDebug(
        "Snowfl: Finished search. Total results returned: " + items.length
    );

    return items;
}
