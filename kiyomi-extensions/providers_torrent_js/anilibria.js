// ==KiyomiExtension==
// @id           anilibria-js
// @name         AniLibria
// @version      1.1.0
// @author       Kiyomi Community
// @lang         ru, en
// @icon         https://www.anilibria.top/favicon.ico
// @site         https://www.anilibria.top
// @mirrors      https://www.anilibria.top,https://anilibria.tv
// @package      anilibria.top
// @type         json-api
// @nsfw         false
// @secure       true
// @private      false
// @requiresKey  false
// @description  Official AniLibria v1 JSON API provider for high-speed Russian dubbed/subbed anime releases.
// @primaryCategory anime
// @extraCategories general
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://anilibria.top/api/v1";
const SITE_BASE = "https://www.anilibria.top";
const MAX_RELEASES = 10;

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
            built += " " + season;
        }
        if (queryOrContext.mediaType !== "batch" && ep) {
            built += " " + ep;
        }

        return built.trim();
    }

    return String(queryOrContext || "").trim();
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const searchQuery = resolveQuery(queryOrContext);
    if (!searchQuery) return [];

    const apiBase = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    const headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    // Step 1: Search releases
    const searchUrl = `${apiBase}/app/search/releases?query=${encodeURIComponent(searchQuery)}`;
    const searchResponse = Kiyomi.httpGet(searchUrl, headers);
    if (!searchResponse) return [];

    let releases;
    try {
        releases = JSON.parse(searchResponse);
    } catch (_) {
        return [];
    }

    if (!Array.isArray(releases) || releases.length === 0) {
        return [];
    }

    const targetReleases = releases.slice(0, MAX_RELEASES);
    const results = [];

    // Step 2: Fetch torrents for each matched release
    for (let i = 0; i < targetReleases.length; i++) {
        const rel = targetReleases[i];
        if (!rel || !rel.id) continue;

        const torrentsUrl = `${apiBase}/anime/torrents/release/${rel.id}`;
        const torrentsResponse = Kiyomi.httpGet(torrentsUrl, headers);
        if (!torrentsResponse) continue;

        let torrentList;
        try {
            torrentList = JSON.parse(torrentsResponse);
        } catch (_) {
            continue;
        }

        if (!Array.isArray(torrentList)) continue;

        const releaseObj = rel.release || rel;
        const names = releaseObj.names || releaseObj.name || {};
        const releaseTitle = names.english || names.main || names.ru || rel.label || "AniLibria Release";
        const alias = releaseObj.alias || "";
        const detailsUrl = alias ? `${SITE_BASE}/anime/releases/release/${encodeURIComponent(alias)}` : "";

        for (let j = 0; j < torrentList.length; j++) {
            const item = torrentList[j];
            if (!item) continue;

            const hash = (item.hash || "").trim().toLowerCase();
            if (!hash) continue;

            const label = (item.label || "").trim();
            const fullTitle = label ? `${releaseTitle} [${label}]` : releaseTitle;

            const magnetUrl = item.magnet || (
                typeof Kiyomi.buildMagnetFromHash === "function"
                    ? Kiyomi.buildMagnetFromHash(hash, fullTitle)
                    : `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(fullTitle)}`
            );

            const sizeBytes = typeof item.size === "number"
                ? item.size
                : (parseInt(String(item.size || "0"), 10) || 0);

            const seeds = parseInt(String(item.seeders || "0"), 10) || 0;
            const peers = parseInt(String(item.leechers || "0"), 10) || 0;
            const publishDate = item.created_at ? String(item.created_at) : "";

            results.push({
                title: fullTitle,
                magnetUrl: magnetUrl,
                hash: hash,
                size: sizeBytes,
                seeds: seeds,
                peers: peers,
                infoUrl: detailsUrl,
                publishDate: publishDate
            });
        }
    }

    return results;
}