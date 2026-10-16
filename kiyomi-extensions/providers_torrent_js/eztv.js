// ==KiyomiExtension==
// @id           eztv-js
// @name         EZTV
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://eztvx.to/favicon.ico
// @site         https://eztvx.to
// @mirrors      https://eztvx.to,https://eztv.re,https://eztv.wf,https://eztv.tf
// @package      eztvx.to
// @type         json-api
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Specialized television tracker offering scene releases and season packs.
// @primaryCategory tv
// @extraCategories anime, general
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://eztvx.to",
    "https://eztv.re",
    "https://eztv.wf"
];

function cleanTitle(raw) {
    if (!raw) return "";
    return raw
        .replace(/\b(?:s\d{1,2}e\d{1,2}|s\d{1,2}|e\d{1,2}|\d{1,2}x\d{1,2}|season\s*\d{1,2}\s*episode\s*\d{1,2}|season\s*\d{1,2})\b/gi, "")
        .replace(/\b(1080p|720p|480p|2160p|4k|x264|x265|hevc|avc|bluray|webrip|web-dl|hdtv|dvdrip|proper|repack|remux)\b/gi, "")
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseSeasonEpisode(title) {
    const pattern = /\b(?:s(\d{1,2})e(\d{1,2})|s(\d{1,2})|e(\d{1,2})|(\d{1,2})x(\d{1,2})|season\s*(\d{1,2})\s*episode\s*(\d{1,2})|season\s*(\d{1,2}))\b/i;
    const m = pattern.exec(title);
    if (!m) return { season: null, episode: null };

    if (m[1] && m[2]) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    if (m[3]) return { season: parseInt(m[3], 10), episode: null };
    if (m[4]) return { season: null, episode: parseInt(m[4], 10) };
    if (m[5] && m[6]) return { season: parseInt(m[5], 10), episode: parseInt(m[6], 10) };
    if (m[7] && m[8]) return { season: parseInt(m[7], 10), episode: parseInt(m[8], 10) };
    if (m[9]) return { season: parseInt(m[9], 10), episode: null };

    return { season: null, episode: null };
}

function matchesSeasonEpisode(torrentTitle, targetSeason, targetEpisode) {
    if (targetSeason === null && targetEpisode === null) return true;

    const parsed = parseSeasonEpisode(torrentTitle);

    if (targetSeason !== null && targetEpisode === null) {
        return parsed.season === targetSeason;
    }
    if (targetEpisode !== null && targetSeason === null) {
        return parsed.episode === targetEpisode;
    }
    return parsed.season === targetSeason && parsed.episode === targetEpisode;
}

function resolveContext(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        const title = (queryOrContext.titles && queryOrContext.titles[0]) || queryOrContext.query || "";
        const season = queryOrContext.seasonNumber || 1;
        const episode = (queryOrContext.mediaType === "batch") ? null : (queryOrContext.episodeNumber || null);

        return {
            cleanSearchTerm: cleanTitle(title),
            season: season,
            episode: episode
        };
    }

    const rawStr = String(queryOrContext || "").trim();
    const parsed = parseSeasonEpisode(rawStr);
    return {
        cleanSearchTerm: cleanTitle(rawStr),
        season: parsed.season,
        episode: parsed.episode
    };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const ctx = resolveContext(queryOrContext);
    if (!ctx.cleanSearchTerm) return [];

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let responseJson = "";

    // Query EZTV API with clean title
    for (let i = 0; i < candidateBases.length; i++) {
        const base = candidateBases[i].replace(/\/+$/, "");
        const apiUrl = base + "/api/get-torrents?limit=100&page=1&keywords=" + encodeURIComponent(ctx.cleanSearchTerm);

        const response = Kiyomi.httpGet(apiUrl, null);
        if (response && response.indexOf('"torrents"') !== -1) {
            responseJson = response;
            break;
        }
    }

    if (!responseJson) return [];

    let parsedData;
    try {
        parsedData = JSON.parse(responseJson);
    } catch (e) {
        return [];
    }

    const torrents = Array.isArray(parsedData.torrents) ? parsedData.torrents : [];
    const searchTerms = ctx.cleanSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];

    for (let i = 0; i < torrents.length; i++) {
        const item = torrents[i];
        const title = item.title || item.filename || "";
        const titleLower = title.toLowerCase();

        // 1. Verify all search tokens are contained in the release title
        const matchesTerms = searchTerms.every(function(term) {
            return titleLower.indexOf(term) !== -1;
        });
        if (!matchesTerms) continue;

        // 2. Strict season and episode check (filters out wrong episode matches)
        if (!matchesSeasonEpisode(title, ctx.season, ctx.episode)) {
            continue;
        }

        const magnetUrl = item.magnet_url || "";
        const torrentUrl = item.torrent_url || "";
        if (!magnetUrl && !torrentUrl) continue;

        const hash = item.hash || null;
        const sizeBytes = parseInt(item.size_bytes || "0", 10) || 0;
        const seeds = parseInt(item.seeds || "0", 10) || 0;
        const peers = parseInt(item.peers || "0", 10) || 0;
        const infoUrl = item.episode_url || "";

        results.push({
            title: title,
            magnetUrl: magnetUrl,
            torrentDownloadUrl: torrentUrl,
            hash: hash,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: infoUrl,
            publishDate: item.date_released_unix ? String(item.date_released_unix) : ""
        });
    }

    return results;
}