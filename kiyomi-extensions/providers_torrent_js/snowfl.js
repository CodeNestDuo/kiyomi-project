// ==KiyomiExtension==
// @id           snowfl-js
// @name         Snowfl
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://snowfl.com/favicon.ico
// @site         https://snowfl.com
// @mirrors      https://snowfl.com
// @package      snowfl.com
// @type         json-api
// @nsfw         true
// @secure       true
// @private      false
// @requiresKey  false
// @description  General meta-search engine providing results from multiple sources; great for cross-checking niche Asian media titles.
// @primaryCategory general
// @extraCategories anime, movie, tv
// ==/KiyomiExtension==

const DEFAULT_BASE_URL = "https://snowfl.com";
const MAX_RESULTS = 50;

const AGE_UNIT_SECONDS = {
    "second": 1,
    "minute": 60,
    "hour": 3600,
    "day": 86400,
    "week": 604800,
    "month": 2592000,
    "year": 31536000
};

function ageToPubDate(age) {
    if (!age || typeof age !== "string") return "";
    const m = age.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/i);
    if (!m) return "";
    const quantity = parseInt(m[1], 10) || 0;
    const unitSecs = AGE_UNIT_SECONDS[m[2].toLowerCase()] || 86400;
    const pastMs = Date.now() - (quantity * unitSecs * 1000);
    return new Date(pastMs).toISOString();
}

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
        return entity;
    });
}

function randomSlug() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
            return queryOrContext.query.trim();
        }

        const title = (queryOrContext.titles && queryOrContext.titles[0]) || "";
        const season = queryOrContext.seasonNumber || 1;
        const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";

        let built = title;
        if (season > 1) {
            built += " S" + String(season).padStart(2, "0");
        }
        if (queryOrContext.mediaType !== "batch" && ep) {
            built += " " + ep;
        }

        return built.trim();
    }

    return String(queryOrContext || "").trim();
}

/**
 * Scrapes the dynamic token from the snowfl homepage JS file.
 */
function retrieveSnowflToken(baseUrl, headers) {
    const homeHtml = Kiyomi.httpGet(baseUrl + "/", headers);
    if (!homeHtml) return null;

    const jsMatch = homeHtml.match(/((?:b\.min\.js)[^"'\s]*)/i);
    if (!jsMatch || !jsMatch[1]) return null;

    const jsUrl = baseUrl + "/" + jsMatch[1].replace(/^\/+/, "");
    const scriptText = Kiyomi.httpGet(jsUrl, headers);
    if (!scriptText) return null;

    // Pattern used across versions of snowfl b.min.js
    const keyMatch = scriptText.match(/findNextItem.*?"(.*?)"/i) || scriptText.match(/"([a-zA-Z0-9]+)";\$\(\(function/i);
    return keyMatch ? keyMatch[1] : null;
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const searchQuery = resolveQuery(queryOrContext);
    if (!searchQuery || searchQuery.length < 2) return [];

    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_BASE_URL;

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept": "application/json, text/plain, */*"
    };

    const token = retrieveSnowflToken(base, headers);
    if (!token) {
        if (typeof Kiyomi.error === "function") {
            Kiyomi.error("Snowfl: Failed to retrieve dynamic authentication token.");
        }
        return [];
    }

    // Snowfl search query pattern with sorting by seeders
    const slug = randomSlug();
    const timestamp = Date.now();
    const searchUrl = base + "/" + token + "/" + encodeURIComponent(searchQuery) + "/" + slug + "/0/SEED/NONE/1?_=" + timestamp;

    const rawJson = Kiyomi.httpGet(searchUrl, headers);
    if (!rawJson) return [];

    let items;
    try {
        items = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    if (!Array.isArray(items) || items.length === 0) return [];

    const results = [];
    const cappedItems = items.slice(0, MAX_RESULTS);

    for (let i = 0; i < cappedItems.length; i++) {
        const item = cappedItems[i];
        if (!item || typeof item !== "object") continue;

        let name = decodeHtmlEntities(String(item.name || "").trim());
        const site = item.site ? String(item.site).trim() : "";
        if (!name) continue;

        if (site) {
            name = name + " [" + site + "]";
        }

        let magnetUrl = item.magnet || "";
        const itemUrl = item.url || "";

        // Resolve magnet link if missing on item
        if (!magnetUrl && itemUrl && site) {
            const resolveUrl = base + "/" + token + "/" + encodeURIComponent(site) + "/" + encodeURIComponent(itemUrl);
            const resolvedText = Kiyomi.httpGet(resolveUrl, headers);
            if (resolvedText) {
                try {
                    const resolvedJson = JSON.parse(resolvedText);
                    magnetUrl = resolvedJson.url || "";
                } catch (e) {
                    // Ignore resolution failures per item
                }
            }
        }

        let hash = null;
        if (magnetUrl) {
            const hashMatch = magnetUrl.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) hash = hashMatch[1];
        }

        if (!magnetUrl && !itemUrl) continue;

        const sizeStr = item.size || "0";
        const sizeBytes = (typeof Kiyomi.humanSizeToBytes === "function")
            ? (Number(Kiyomi.humanSizeToBytes(sizeStr)) || 0)
            : 0;

        const seeds = parseInt(item.seeder || item.seeds || "0", 10) || 0;
        const peers = parseInt(item.leecher || item.peers || "0", 10) || 0;
        const publishDate = ageToPubDate(item.age);

        results.push({
            title: name,
            magnetUrl: magnetUrl || undefined,
            torrentDownloadUrl: (!magnetUrl && itemUrl.endsWith(".torrent")) ? itemUrl : undefined,
            hash: hash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: itemUrl.startsWith("http") ? itemUrl : (base + "/" + itemUrl.replace(/^\/+/, "")),
            publishDate: publishDate
        });
    }

    return results;
}