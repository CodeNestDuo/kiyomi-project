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
    const catId = CATEGORY_MAP[category] ?? CATEGORY_MAP["All"];

    let categoriesArray = [];
    if (catId && String(catId).trim().length > 0) {
        const num = parseInt(catId, 10);
        if (!Number.isNaN(num)) {
            categoriesArray = [num];
        }
    }

    return {
        query: query,
        size: 300,                 // defaultValue: "300"
        order_by: "seeders",       // "seeders"
        order_direction: "desc",   // "desc"
        hide_unsafe: true,         // "true"
        hide_xxx: false,           // "false"
        categories: categoriesArray
    };
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

    // 2) Resolve API key (must be implemented on Kotlin side)
    //    Kiyomi.getApiKey("knaben") should behave similar to your ExtensionManager.getApiKey(config.id)
    const apiKey = (typeof Kiyomi.getApiKey === "function")
        ? (Kiyomi.getApiKey("knaben") || "")
        : "";

    // 3) POST request via bridge
    //    You will implement Kiyomi.httpPostJson(url, body, apiKey?) in Kotlin.
    //    For example: it can automatically attach the API key as header (e.g. X-Api-Key / Authorization).
    const rawJson = (typeof Kiyomi.httpPostJson === "function")
        ? Kiyomi.httpPostJson(API_ENDPOINT, bodyJson, apiKey)
        : "";

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

