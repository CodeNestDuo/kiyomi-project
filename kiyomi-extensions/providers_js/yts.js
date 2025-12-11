// ==KiyomiExtension==
// @id             yts-js
// @name           YTS
// @version        1.0.0
// @author         Lyra Aranha (ported for Kiyomi)
// @lang           all
// @icon           https://yts.lt/assets/images/website/favicon.ico
// @site           https://yts.lt
// @package        yts.mx
// @type           api-json
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Uses the YTS public JSON API to fetch movie torrents with support for quality/codec/rating/genre tags.
// @primaryCategory movie
// @extraCategories general
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "yts-js",
    displayName: "YTS",
    siteUrl: "https://yts.lt",
    iconUrl: "https://yts.lt/assets/images/website/favicon.ico",
    type: "API_JSON",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};


// ===== Provider URLs & config =====
const YTS_BASE = "https://yts.lt";
const YTS_API_BASE = YTS_BASE + "/api/v2/list_movies.json";

const YTS_CONFIG = {
    /**
     * Max pages we will fetch from YTS for one query.
     * (YTS default limit is usually 20 movies per page.)
     */
    MAX_PAGES: 3,

    /**
     * Hard cap on number of results returned to Kiyomi.
     */
    MAX_RESULTS: 80
};

// For Kiyomi UI
const CATEGORY_MAP = {
    "All": "all",
    "Movies": "movies"
};


// ===== helpers =====

/**
 * Generic query string builder.
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
 * Normalise user query: decode URI components, replace + with spaces.
 */
function normalizeUserQuery(rawQuery) {
    let q = String(rawQuery || "").trim();
    if (!q) return "";

    // Try decodeURIComponent in case something like "Inception%201080p"
    try {
        q = decodeURIComponent(q);
    } catch (_) {
        // ignore
    }

    // Convert '+' to spaces (qbittorrent style queries)
    q = q.replace(/\+/g, " ").trim();
    return q;
}

/**
 * Parse YTS-style tags from query:
 * - quality tagging: "1080p", "2160p", "3D" or "quality=1080p"
 * - codec tagging: "x264", "h264", "x265", "h265"
 * - rating tagging: "rating=7", "minimum_rating=7", "min_rating=7"
 * - genre tagging: "genre=action"
 *
 * Returns:
 *  {
 *     searchParams: { ...params for API... },
 *     searchCodec: "x264" | "x265" | null,
 *     searchResolution: "1080p" | "2160p" | "3D" | null
 *  }
 */
function parseYtsSearchQuery(rawQuery) {
    let q = normalizeUserQuery(rawQuery);
    const searchParams = {};
    let searchResolution = null;
    let searchCodec = null;

    if (!q) {
        return { searchParams: searchParams, searchCodec: null, searchResolution: null };
    }

    // Quality (e.g. "1080p", "quality=720p", "3D")
    const qualityRegex = /(?:quality=)?((?:2160|1440|1080|720|480|240)p|3D)/i;
    let m = qualityRegex.exec(q);
    if (m) {
        searchResolution = m[1];
        searchParams.quality = searchResolution;
        q = q.replace(qualityRegex, "").trim();
    }

    // Codec (e.g. x264, h264, x265, h265)
    const codecRegex = /\.?(?:x|h)(264|265)/i;
    m = codecRegex.exec(q);
    if (m) {
        searchCodec = "x" + m[1]; // "x264" or "x265"
        // Optional: append codec to quality (as in original plugin)
        if (searchParams.quality) {
            searchParams.quality += "." + searchCodec;
        }
        q = q.replace(codecRegex, "").trim();
    }

    // Rating (e.g. "rating=7", "min_rating=6", "minimum_rating=8")
    const ratingRegex = /(?:min(?:imum)?_)?rating=(\d)/i;
    m = ratingRegex.exec(q);
    if (m) {
        const minRating = m[1];
        searchParams.minimum_rating = String(minRating);
        q = q.replace(ratingRegex, "").trim();
    }

    // Genre (e.g. "genre=action")
    const genreRegex = /genre=([\w-]+)/i;
    m = genreRegex.exec(q);
    if (m) {
        const genre = m[1];
        searchParams.genre = String(genre);
        q = q.replace(genreRegex, "").trim();
    }

    // Prevent the user from smuggling page= into the query
    const pageRegex = /&page=\d+/gi;
    q = q.replace(pageRegex, "").trim();

    if (q) {
        searchParams.query_term = q;
    }

    return {
        searchParams: searchParams,
        searchCodec: searchCodec,
        searchResolution: searchResolution
    };
}

/**
 * Map a page of YTS movies to Kiyomi torrent objects.
 */
function mapYtsMoviesToResults(movies, searchCodec, searchResolution) {
    if (!movies || !movies.length) return [];

    const out = [];

    for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        if (!movie || !movie.torrents || !movie.torrents.length) continue;

        const movieTitleLong =
            (typeof movie.title_long === "string" && movie.title_long.length > 0)
                ? movie.title_long
                : (movie.title || "YTS Movie");

        const movieUrl =
            movie.url ||
            (YTS_BASE + "/movie/" + encodeURIComponent(movie.slug || movieTitleLong));

        for (let j = 0; j < movie.torrents.length; j++) {
            const torrent = movie.torrents[j];
            if (!torrent) continue;

            const tQuality = torrent.quality || "";
            const tCodec = torrent.video_codec || "";

            // Filter by codec if requested
            if (searchCodec && tCodec.toLowerCase() !== searchCodec.toLowerCase()) {
                continue;
            }

            // Filter by resolution if requested
            if (searchResolution && tQuality !== searchResolution) {
                continue;
            }

            const torrentUrl = torrent.url || "";
            const hash = torrent.hash || "";
            let magnetUrl;
            let torrentDownloadUrl;

            // Prefer generating magnet from hash (if bridge function exists)
            if (hash &&
                typeof Kiyomi === "object" &&
                typeof Kiyomi.buildMagnetFromHash === "function") {
                magnetUrl = Kiyomi.buildMagnetFromHash(hash, movieTitleLong);
                torrentDownloadUrl = torrentUrl || undefined;
            } else {
                if (torrentUrl.indexOf("magnet:?") === 0) {
                    magnetUrl = torrentUrl;
                } else {
                    torrentDownloadUrl = torrentUrl || undefined;
                }
            }

            const seeds = (typeof torrent.seeds === "number" && !isNaN(torrent.seeds))
                ? torrent.seeds
                : 0;
            const peers = (typeof torrent.peers === "number" && !isNaN(torrent.peers))
                ? torrent.peers
                : 0;
            const sizeBytes =
                (typeof torrent.size_bytes === "number" && !isNaN(torrent.size_bytes))
                    ? torrent.size_bytes
                    : 0;
            const publishEpoch =
                (typeof torrent.date_uploaded_unix === "number" && !isNaN(torrent.date_uploaded_unix))
                    ? torrent.date_uploaded_unix
                    : 0;

            const audioChannels =
                (typeof torrent.audio_channels === "string" && torrent.audio_channels.length > 0)
                    ? torrent.audio_channels
                    : "";
            const type = torrent.type || "";

            // Title: "<Title Long> [1080p] [x264] [WEB] [5.1] [YTS]"
            const parts = [movieTitleLong];
            if (tQuality) parts.push("[" + tQuality + "]");
            if (tCodec) parts.push("[" + tCodec + "]");
            if (type) parts.push("[" + type + "]");
            if (audioChannels) parts.push("[" + audioChannels + "]");
            parts.push("[YTS]");
            const title = parts.join(" ");

            out.push({
                title: title,
                magnetUrl: magnetUrl,
                torrentDownloadUrl: torrentDownloadUrl,
                size: sizeBytes,
                seeds: seeds,
                peers: peers,
                infoUrl: movieUrl,
                publishDate: publishEpoch > 0 ? String(publishEpoch) : "",
                category_name: "Movies",
                hash: hash || undefined,
                imdbId: movie.imdb_code || undefined,
                year: typeof movie.year === "number" ? movie.year : undefined,
                coverImageUrl:
                    movie.large_cover_image ||
                    movie.medium_cover_image ||
                    movie.small_cover_image ||
                    undefined,
                rating: typeof movie.rating === "number" ? movie.rating : undefined
            });
        }
    }

    Kiyomi.logDebug("YTS: Mapped " + out.length + " torrents from current movie page.");
    return out;
}


// ===== main entry =====

/**
 * Main entry point for Kiyomi.
 *
 * @param {string} query
 * @param {string} category  – "All" or "Movies" (currently not used by API)
 * @returns {Array<Object>}
 */
function search(query, category) {
    Kiyomi.logDebug(
        "YTS: Starting search. Query='" +
            query +
            "', category='" +
            category +
            "'"
    );

    const trimmed = String(query || "").trim();
    if (!trimmed) {
        Kiyomi.logDebug("YTS: Blank query, returning empty result.");
        return [];
    }

    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    // Resolve category for UI (YTS only does movies; category is informational here)
    const _catKey = CATEGORY_MAP[category] || CATEGORY_MAP["All"];
    Kiyomi.logDebug("YTS: Resolved category key: " + _catKey);

    // Parse tags from query
    const parsed = parseYtsSearchQuery(trimmed);
    const searchParams = parsed.searchParams || {};
    const searchCodec = parsed.searchCodec;
    const searchResolution = parsed.searchResolution;

    // Headers (do NOT set Accept-Encoding, OkHttp handles gzip)
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    const results = [];

    // ---- First page ----
    const firstParams = {};
    for (const k in searchParams) {
        if (Object.prototype.hasOwnProperty.call(searchParams, k)) {
            firstParams[k] = searchParams[k];
        }
    }
    firstParams.page = 1;

    const firstUrl = YTS_API_BASE + "?" + buildQueryString(firstParams);
    Kiyomi.logDebug("YTS: Requesting first page URL: " + firstUrl);

    let firstJson;
    try {
        firstJson = Kiyomi.httpGet(firstUrl, headersString);
    } catch (e) {
        Kiyomi.logError(
            "YTS: HTTP error for URL " +
                firstUrl +
                " – " +
                (e && e.message ? e.message : String(e))
        );
        return [];
    }

    if (!firstJson) {
        Kiyomi.logDebug("YTS: Empty response from API for first page.");
        return [];
    }

    let decoded;
    try {
        decoded = JSON.parse(firstJson);
    } catch (e) {
        Kiyomi.logError(
            "YTS: Failed to parse JSON for first page – " +
                (e && e.message ? e.message : String(e))
        );
        return [];
    }

    if (!decoded || decoded.status !== "ok") {
        Kiyomi.logError(
            "YTS: API returned non-ok status: " +
                (decoded && decoded.status ? decoded.status : "unknown")
        );
        return [];
    }

    const data = decoded.data || {};
    const movies = data.movies || [];

    if (!movies.length) {
        Kiyomi.logDebug("YTS: No movies in first page data.");
        return [];
    }

    // Map first page
    results.push.apply(
        results,
        mapYtsMoviesToResults(movies, searchCodec, searchResolution)
    );
    if (results.length >= YTS_CONFIG.MAX_RESULTS) {
        Kiyomi.logDebug(
            "YTS: Reached MAX_RESULTS on first page (" +
                results.length +
                ")."
        );
        return results.slice(0, YTS_CONFIG.MAX_RESULTS);
    }

    const totalMovies =
        typeof data.movie_count === "number" && !isNaN(data.movie_count)
            ? data.movie_count
            : 0;
    const perPage =
        typeof data.limit === "number" && data.limit > 0
            ? data.limit
            : movies.length;

    let totalPages = 1;
    if (perPage > 0 && totalMovies > 0) {
        totalPages = Math.ceil(totalMovies / perPage);
    }

    const maxPages = Math.min(totalPages, YTS_CONFIG.MAX_PAGES);
    Kiyomi.logDebug(
        "YTS: API reports movie_count=" +
            totalMovies +
            ", limit=" +
            perPage +
            ", totalPages=" +
            totalPages +
            ", clamped to maxPages=" +
            maxPages
    );

    // ---- Remaining pages ----
    for (let page = 2; page <= maxPages; page++) {
        if (results.length >= YTS_CONFIG.MAX_RESULTS) break;

        const pageParams = {};
        for (const k in searchParams) {
            if (Object.prototype.hasOwnProperty.call(searchParams, k)) {
                pageParams[k] = searchParams[k];
            }
        }
        pageParams.page = page;

        const pageUrl = YTS_API_BASE + "?" + buildQueryString(pageParams);
        Kiyomi.logDebug("YTS: Requesting page " + page + " URL: " + pageUrl);

        let pageJson;
        try {
            pageJson = Kiyomi.httpGet(pageUrl, headersString);
        } catch (e) {
            Kiyomi.logError(
                "YTS: HTTP error for URL " +
                    pageUrl +
                    " – " +
                    (e && e.message ? e.message : String(e))
            );
            break;
        }

        if (!pageJson) {
            Kiyomi.logDebug(
                "YTS: Empty response for page " + page + ", stopping pagination."
            );
            break;
        }

        let pageDecoded;
        try {
            pageDecoded = JSON.parse(pageJson);
        } catch (e) {
            Kiyomi.logError(
                "YTS: Failed to parse JSON for page " +
                    page +
                    " – " +
                    (e && e.message ? e.message : String(e))
            );
            break;
        }

        if (!pageDecoded || pageDecoded.status !== "ok") {
            Kiyomi.logError(
                "YTS: Non-ok status on page " +
                    page +
                    ": " +
                    (pageDecoded && pageDecoded.status
                        ? pageDecoded.status
                        : "unknown")
            );
            break;
        }

        const pageData = pageDecoded.data || {};
        const pageMovies = pageData.movies || [];
        if (!pageMovies.length) {
            Kiyomi.logDebug(
                "YTS: No movies on page " + page + ", stopping pagination."
            );
            break;
        }

        const pageItems = mapYtsMoviesToResults(
            pageMovies,
            searchCodec,
            searchResolution
        );

        for (let i = 0; i < pageItems.length; i++) {
            if (results.length >= YTS_CONFIG.MAX_RESULTS) break;
            results.push(pageItems[i]);
        }
    }

    // Sort by seeds desc (optional, but nice)
    results.sort(function (a, b) {
        const sa = typeof a.seeds === "number" ? a.seeds : 0;
        const sb = typeof b.seeds === "number" ? b.seeds : 0;
        return sb - sa;
    });

    const finalResults =
        results.length > YTS_CONFIG.MAX_RESULTS
            ? results.slice(0, YTS_CONFIG.MAX_RESULTS)
            : results;

    Kiyomi.logDebug(
        "YTS: Finished search. Total results returned: " + finalResults.length
    );
    return finalResults;
}
