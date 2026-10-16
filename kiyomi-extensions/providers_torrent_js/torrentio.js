// ==KiyomiExtension==
// @id           torrentio-js
// @name         Torrentio
// @version      1.3.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://torrentio.strem.fun/favicon.ico
// @site         https://torrentio.strem.fun
// @mirrors      https://torrentio.strem.fun
// @package      torrentio.strem.fun
// @type         torrent-index
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Multi-indexer scraper for Anime, Movies, and TV Series via Stremio stream protocol.
// @primaryCategory anime
// @extraCategories movies, series
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://torrentio.strem.fun"
];

// Standard Kiyomi Category to Stremio Type Map
const CATEGORY_MAP = {
    "All": "anime",
    "Anime": "anime",
    "Movies": "movie",
    "Movie": "movie",
    "Series": "series",
    "TV": "series"
};

/**
 * Resolves the Stremio stream route using CATEGORY_MAP and TorrentQueryContext
 */
function resolveRoute(queryOrContext, category) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        // 1. Determine target stream type: category takes priority, fallback to mediaType
        let streamType = CATEGORY_MAP[category] || null;
        if (!streamType) {
            const mType = (queryOrContext.mediaType || "").toLowerCase();
            if (mType === "movie") streamType = "movie";
            else if (mType === "series" || mType === "tv") streamType = "series";
            else streamType = "anime";
        }

        const imdbId = queryOrContext.imdbId || (queryOrContext.query && queryOrContext.query.startsWith("tt") ? queryOrContext.query.trim() : null);
        const kitsuId = queryOrContext.kitsuId;
        const season = queryOrContext.seasonNumber || 1;
        const episode = queryOrContext.episodeNumber || 1;

        // 2. Direct string override in context.query (e.g. "kitsu:244:1" or "tt1375666")
        if (queryOrContext.query && typeof queryOrContext.query === "string") {
            const raw = queryOrContext.query.trim();
            if (raw.startsWith("kitsu:")) return `anime/${raw}`;
            if (raw.startsWith("tt")) {
                return (streamType === "movie" || !raw.includes(":")) ? `movie/${raw}` : `series/${raw}`;
            }
        }

        // 3. Resolve by mapped category
        switch (streamType) {
            case "movie":
                if (imdbId) return `movie/${imdbId}`;
                break;
            case "series":
                if (imdbId) return `series/${imdbId}:${season}:${episode}`;
                break;
            case "anime":
            default:
                if (kitsuId) return `anime/kitsu:${kitsuId}:${episode}`;
                // Fallback: If no Kitsu ID exists but IMDB ID is present
                if (imdbId) {
                    return queryOrContext.mediaType === "movie"
                        ? `movie/${imdbId}`
                        : `series/${imdbId}:${season}:${episode}`;
                }
                break;
        }
    } else if (typeof queryOrContext === "string") {
        const raw = queryOrContext.trim();
        if (raw.startsWith("kitsu:")) return `anime/${raw}`;
        if (raw.startsWith("tt")) {
            return raw.includes(":") ? `series/${raw}` : `movie/${raw}`;
        }
    }

    return null;
}

function parseSizeToBytes(raw) {
    if (!raw) return 0;
    const match = raw.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
        case "GB": return Math.round(value * 1024 * 1024 * 1024);
        case "MB": return Math.round(value * 1024 * 1024);
        case "KB": return Math.round(value * 1024);
        case "B": return Math.round(value);
        default: return 0;
    }
}

function buildMagnet(infoHash, name, sources) {
    let magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name || infoHash)}`;
    if (Array.isArray(sources)) {
        for (let i = 0; i < sources.length; i++) {
            const src = sources[i];
            if (src && src.startsWith("tracker:")) {
                const trackerUrl = src.substring("tracker:".length);
                magnet += `&tr=${encodeURIComponent(trackerUrl)}`;
            }
        }
    }
    return magnet;
}

/**
 * Searches Torrentio using mapped category routes.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const route = resolveRoute(queryOrContext, category);
    if (!route) {
        return [];
    }

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const base = candidateBases[0].replace(/\/+$/, "");
    const searchUrl = `${base}/stream/${route}.json`;

    const response = Kiyomi.httpGet(searchUrl, null);
    if (!response) return [];

    let payload;
    try {
        payload = JSON.parse(response);
    } catch (e) {
        return [];
    }

    const streams = payload.streams || [];
    const results = [];

    for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        const infoHash = stream.infoHash;
        if (!infoHash) continue;

        const rawTitle = stream.title || "";
        const lines = rawTitle.split("\n");

        const behaviorHints = stream.behaviorHints || {};
        const releaseName = lines[0]?.trim() || behaviorHints.filename || `Stream ${i + 1}`;

        let seeders = 0;
        let sizeBytes = 0;

        const seedMatch = rawTitle.match(/👤\s*(\d+)/);
        if (seedMatch) {
            seeders = parseInt(seedMatch[1], 10) || 0;
        }

        const sizeMatch = rawTitle.match(/💾\s*([\d.]+\s*[GMK]?B)/i);
        if (sizeMatch) {
            sizeBytes = parseSizeToBytes(sizeMatch[1]);
        }

        const magnet = buildMagnet(infoHash, releaseName, stream.sources);

        const qualityMatch = (stream.name || "").match(/\b(4k|2160p|1080p|720p|480p)\b/i);
        const qualityTag = qualityMatch ? `[${qualityMatch[1].toUpperCase()}] ` : "";

        results.push({
            title: `${qualityTag}${releaseName}`,
            magnetUrl: magnet,
            hash: infoHash,
            fileIndex: typeof stream.fileIdx === "number" ? stream.fileIdx : -1,
            size: sizeBytes,
            seeds: seeders,
            peers: 0,
            infoUrl: `${base}/stream/${route}.json`,
            publishDate: ""
        });
    }

    return results;
}