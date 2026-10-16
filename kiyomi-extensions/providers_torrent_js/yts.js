// ==KiyomiExtension==
// @id           yts-js
// @name         YTS
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://yts.mx/assets/images/website/favicon.ico
// @site         https://yts.mx
// @mirrors      https://yts.mx,https://yts.lt,https://yts.bz,https://movies-api.accel.li/api/v2
// @package      yts.mx
// @type         json-api
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  YTS public JSON API indexer for high-quality movie releases with 720p/1080p/4K tagging.
// @primaryCategory movie
// @extraCategories general
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://yts.mx",
    "https://yts.lt",
    "https://yts.bz"
];

function resolveQueryAndQuality(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        let title = (queryOrContext.titles && queryOrContext.titles[0]) || queryOrContext.query || "";
        title = title
            .replace(/\b(?:s\d{1,2}e\d{1,2}|s\d{1,2}|e\d{1,2}|\d{1,2}x\d{1,2})\b/gi, "")
            .replace(/\b(1080p|720p|480p|2160p|4k|x264|x265|hevc|bluray)\b/gi, "")
            .replace(/[._-]+/g, " ")
            .trim();

        let quality = "";
        if (queryOrContext.resolution) {
            const rawRes = String(queryOrContext.resolution).toLowerCase().replace(/p$/, "");
            if (rawRes === "1080" || rawRes === "720" || rawRes === "2160") {
                quality = rawRes + "p";
            }
        }

        return { query: title, quality: quality };
    }

    return { query: String(queryOrContext || "").trim(), quality: "" };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const resolved = resolveQueryAndQuality(queryOrContext);
    if (!resolved.query) return [];

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    let responseJson = "";

    for (let i = 0; i < candidateBases.length; i++) {
        let base = candidateBases[i].replace(/\/+$/, "");
        let apiUrl = base.endsWith("/api/v2")
            ? `${base}/list_movies.json?query_term=${encodeURIComponent(resolved.query)}&limit=50`
            : `${base}/api/v2/list_movies.json?query_term=${encodeURIComponent(resolved.query)}&limit=50`;

        if (resolved.quality) {
            apiUrl += `&quality=${encodeURIComponent(resolved.quality)}`;
        }

        const res = Kiyomi.httpGet(apiUrl, headers);
        if (res && res.indexOf('"movies"') !== -1) {
            responseJson = res;
            break;
        }
    }

    if (!responseJson) return [];

    let root;
    try {
        root = JSON.parse(responseJson);
    } catch (e) {
        return [];
    }

    const data = (root && root.data) || {};
    const movies = Array.isArray(data.movies) ? data.movies : [];
    const results = [];

    for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        if (!movie || !Array.isArray(movie.torrents)) continue;

        const movieTitle = movie.title_long || movie.title || "Unknown Movie";
        const detailsUrl = movie.url || "";
        const coverImg = movie.large_cover_image || movie.medium_cover_image || "";
        const imdbCode = movie.imdb_code || null;

        for (let j = 0; j < movie.torrents.length; j++) {
            const t = movie.torrents[j];
            if (!t) continue;

            const hash = (t.hash || "").trim().toLowerCase();
            if (!hash) continue;

            const quality = t.quality || "";
            const type = t.type || "";
            const codec = t.video_codec || "";

            const parts = [movieTitle];
            if (quality) parts.push(`[${quality}]`);
            if (type) parts.push(`[${type}]`);
            if (codec) parts.push(`[${codec}]`);
            parts.push("[YTS]");
            const formattedTitle = parts.join(" ");

            const magnetUrl = (typeof Kiyomi.buildMagnetFromHash === "function")
                ? Kiyomi.buildMagnetFromHash(hash, formattedTitle)
                : `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(formattedTitle)}`;

            const sizeBytes = parseInt(t.size_bytes || "0", 10) || 0;
            const seeds = parseInt(t.seeds || "0", 10) || 0;
            const peers = parseInt(t.peers || "0", 10) || 0;
            const publishDate = t.date_uploaded_unix ? String(t.date_uploaded_unix) : "";

            results.push({
                title: formattedTitle,
                magnetUrl: magnetUrl,
                torrentDownloadUrl: t.url || "",
                hash: hash,
                size: sizeBytes,
                seeds: seeds,
                peers: peers,
                infoUrl: detailsUrl,
                publishDate: publishDate,
                coverImageUrl: coverImg,
                imdbId: imdbCode
            });
        }
    }

    return results;
}