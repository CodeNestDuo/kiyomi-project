// ==KiyomiExtension==
// @id           tsukihime-js
// @name         TsukiHime
// @version      1.0.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://tsukihime.org/favicon.ico
// @site         https://tsukihime.org
// @mirrors      https://api.tsukihime.org
// @package      tsukihime.org
// @type         torrent-rss
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Modern anime indexer and release tracker using TsukiHime v1 REST API.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://api.tsukihime.org"
];

/**
 * Resolves standard title and episode numbers from context or raw string.
 */
function resolveSearchQuery(queryOrContext) {
    if (typeof queryOrContext !== "object" || queryOrContext === null) {
        return String(queryOrContext || "").trim();
    }
    if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
        return queryOrContext.query.trim();
    }
    const candidateTitles = Array.isArray(queryOrContext.titles) ? queryOrContext.titles : [];
    const primaryTitle = candidateTitles[0] || queryOrContext.title || "";
    if (queryOrContext.mediaType === "batch") {
        return primaryTitle.trim();
    }
    const ep = queryOrContext.episodeNumber ? String(queryOrContext.episodeNumber).padStart(2, "0") : "";
    return `${primaryTitle} ${ep}`.trim();
}

/**
 * Builds query parameters for TsukiHime v1 API.
 */
function buildApiQuery(queryOrContext) {
    const params = [];

    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        const aid = queryOrContext.anidbAid || queryOrContext.aid || null;
        const eid = queryOrContext.anidbEid || queryOrContext.eid || null;

        if (eid) {
            params.push("anidb_eid=" + encodeURIComponent(eid));
        } else if (aid) {
            params.push("anidb_aid=" + encodeURIComponent(aid));
        }

        const resolved = resolveSearchQuery(queryOrContext);
        if (resolved) {
            params.push("q=" + encodeURIComponent(resolved));
        }
    } else {
        const queryStr = String(queryOrContext || "").trim();
        if (queryStr) {
            params.push("q=" + encodeURIComponent(queryStr));
        }
    }

    params.push("limit=50");
    return params.join("&");
}

/**
 * Main search handler.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const queryParams = buildApiQuery(queryOrContext);
    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    let items = null;

    for (let i = 0; i < candidateBases.length; i++) {
        let base = candidateBases[i].replace(/\/+$/, "");
        
        // Ensure standard /v1 prefix is present
        if (base.indexOf("/v1") === -1) {
            base += "/v1";
        }

        // Try primary /releases endpoint, fallback to /releases/search
        const candidateEndpoints = [
            base + "/releases?" + queryParams,
            base + "/releases/search?" + queryParams
        ];

        for (let j = 0; j < candidateEndpoints.length; j++) {
            try {
                const raw = Kiyomi.httpGet(candidateEndpoints[j], null);
                if (raw && typeof raw === "string") {
                    const trimmed = raw.trim();
                    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
                        const parsed = JSON.parse(trimmed);
                        
                        // Handle either direct array response or paginated wrapper { items: [...] } / { data: [...] }
                        if (Array.isArray(parsed)) {
                            items = parsed;
                            break;
                        } else if (Array.isArray(parsed.items)) {
                            items = parsed.items;
                            break;
                        } else if (Array.isArray(parsed.data)) {
                            items = parsed.data;
                            break;
                        } else if (Array.isArray(parsed.releases)) {
                            items = parsed.releases;
                            break;
                        }
                    }
                }
            } catch (err) {
                // Try next endpoint or base mirror
            }
        }

        if (items) {
            break;
        }
    }

    if (!Array.isArray(items)) {
        return [];
    }

    return items.map(function(item) {
        let magnetUrl = item.magnet_uri || item.magnet || "";
        const hash = item.info_hash || item.hash || null;

        // Fallback magnet creation if hash is present without full URI
        if (!magnetUrl && hash && typeof Kiyomi.buildMagnetFromHash === "function") {
            magnetUrl = Kiyomi.buildMagnetFromHash(hash, item.title || item.name || "");
        }

        // Format timestamp/date
        let pubDate = null;
        if (item.timestamp) {
            pubDate = new Date(item.timestamp * 1000).toUTCString();
        } else if (item.created_at) {
            pubDate = new Date(item.created_at).toUTCString();
        }

        return {
            title: item.title || item.name || item.torrent_name || "",
            magnetUrl: magnetUrl,
            torrentDownloadUrl: item.torrent_url || item.download_url || null,
            hash: hash,
            size: item.total_size || item.size || 0,
            seeds: item.seeders !== undefined ? item.seeders : (item.seeds || 0),
            peers: item.leechers !== undefined ? item.leechers : (item.peers || 0),
            infoUrl: item.link || (item.id ? "https://tsukihime.org/release/" + item.id : null),
            publishDate: pubDate
        };
    });
}