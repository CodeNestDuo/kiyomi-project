// ==KiyomiExtension==
// @id           knaben-js
// @name         Knaben (API, JS)
// @version      1.0.0
// @author       Kiyomi Project
// @lang         all
// @icon         https://knaben.org/favicon.ico
// @site         https://knaben.org
// @package      knaben.org
// @type         json-api
// @nsfw         true
// @secure       true
// @private      true
// @requiresKey  true
// @description  Knaben JSON API integration for Kiyomi JS engine.
// ==/KiyomiExtension==


// ===== metadata mirror (optional introspection) =====
const EXTENSION_INFO = {
    id: "knaben-js",
    displayName: "Knaben (API)",
    siteUrl: "https://knaben.org",
    iconUrl: "https://knaben.org/favicon.ico",
    type: "JSON_API",
    isAdult: true,
    isSecure: true,
    cautionReason: "",
    isPrivate: true,
    isApiKeyRequired: true,
    version: "1.0.0"
};

// Mirrors your JSON categoryMap
const CATEGORY_MAP = {
    "All": "",
    "Music": "1000000",
    "Series": "2000000",
    "Movies": "3000000",
    "Apps": "4000000",
    "Porn": "5000000",
    "Anime": "6000000",
    "Games": "7000000",
    "Books": "9000000",
    "Other": "10000000"
};

// Same as searchUrlTemplate base
const API_ENDPOINT = "https://api.knaben.org/v1";


// ---------- helpers ----------

/**
 * Build the POST JSON payload (mirrors bodyConstructor in JSON config).
 */
function buildRequestPayload(query, category) {
    // Get the category ID string ("" for All)
    const catIdString = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    let categoriesArray = [];
    
    // If catIdString is NOT the "All" category (which is defined as ""), 
    // attempt to parse and include it.
    if (catIdString && String(catIdString).trim().length > 0) {
        const num = parseInt(catIdString, 10);
        if (!Number.isNaN(num)) {
            categoriesArray = [num];
        }
    }

    // If the array is empty (i.e., "All" was selected), we can safely omit the categories property.
    const payload = {
        query: query,
        size: 300,
        order_by: "seeders",
        order_direction: "desc",
        hide_unsafe: true,
        hide_xxx: false,
        // categories: categoriesArray // We will omit this property if empty
    };

    // Conditionally add the categories property only if it's not "All"
    if (categoriesArray.length > 0) {
        payload.categories = categoriesArray;
    }

    return payload;
}
/**
 * Simple ISO date → readable date.
 * (JSON config uses FORMAT_ISO_DATE post-processor)
 */
function formatIsoDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // YYYY-MM-DD
    return d.toISOString().slice(0, 10);
}

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
        providerId = EXTENSION_INFO.id; // "knaben-js"
    } else {
        providerId = "knaben-js";
    }

    if (typeof Kiyomi === "object" && typeof Kiyomi.getApiKey === "function") {
        return Kiyomi.getApiKey(providerId) || "";
    }

    return "";
}


// ---------- main entry for Kiyomi ----------

/**
 * Mirrors your JSON config:
 *  - HTTP_REQUEST (POST with JSON body and API key)
 *  - MAP_RESULTS_GENERIC on root.hits
 *  - postProcessor FORMAT_ISO_DATE -> publishDate
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>} – directly maps to TorrentDescription
 */
function search(query, category) {
    // 1) Build body
    const payload = buildRequestPayload(query, category);
    const bodyJson = JSON.stringify(payload);

    // 2) Resolve API key (from engine-injected globals / bridge)
    const apiKey = resolveApiKey();

    // 3) POST request via bridge
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpPostJson !== "function") {
        return [];
    }

    const rawJson = Kiyomi.httpPostJson(API_ENDPOINT, bodyJson, apiKey);

    if (!rawJson) return [];

    let root;
    try {
        root = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    const hits = Array.isArray(root.hits) ? root.hits : [];
    const results = [];

    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];

        const title = h.title || "";
        const magnetUrl = h.magnetUrl || "";
        const hash = h.hash || "";
        const infoUrl = h.details || "";

        // Core stats
        const size = typeof h.bytes === "number"
            ? h.bytes
            : parseInt(String(h.bytes || "0"), 10) || 0;

        const seeds = parseInt(String(h.seeders || "0"), 10) || 0;
        const peers = parseInt(String(h.peers || "0"), 10) || 0;

        const publishDateIso = h.date || "";
        const publishDate = formatIsoDate(publishDateIso);

        if (!title || (!magnetUrl && !hash)) {
            continue; // minimal sanity
        }

        results.push({
            title: title,
            magnetUrl: magnetUrl,  // already provided by API
            hash: hash,
            size: size,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: publishDate
        });
    }

    return results;
}

