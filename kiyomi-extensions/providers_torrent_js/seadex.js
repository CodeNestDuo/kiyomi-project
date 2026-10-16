// ==KiyomiExtension==
// @id           seadex-js
// @name         SeaDex
// @version      1.2.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://seadex.moe/favicon.ico
// @site         https://seadex.moe
// @mirrors      https://seadex.moe
// @package      seadex.moe
// @type         torrent-index
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Index for the best available anime releases curated by SeaDex.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_MIRRORS = [
    "https://seadex.moe"
];

function resolveSearchQuery(queryOrContext) {
    if (typeof queryOrContext !== "object" || queryOrContext === null) {
        return String(queryOrContext || "").trim();
    }
    if (queryOrContext.query && queryOrContext.query.trim().length > 0) {
        return queryOrContext.query.trim();
    }
    const candidateTitles = Array.isArray(queryOrContext.titles) ? queryOrContext.titles : [];
    const primaryTitle = candidateTitles[0] || queryOrContext.title || "";
    return primaryTitle.trim();
}

/**
 * Searches SeaDex database for curated releases.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const candidateBases = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? [customBaseUrl.trim().replace(/\/+$/, "")]
        : DEFAULT_MIRRORS;

    const base = candidateBases[0].replace(/\/+$/, "");

    let filterParam = "";
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.anilistId) {
            filterParam = `filter=(alID="${encodeURIComponent(queryOrContext.anilistId)}")`;
        } else if (queryOrContext.malId) {
            filterParam = `filter=(malID="${encodeURIComponent(queryOrContext.malId)}")`;
        } else {
            const title = resolveSearchQuery(queryOrContext);
            if (title) {
                filterParam = `filter=(title~"${encodeURIComponent(title)}")`;
            }
        }
    } else {
        const title = String(queryOrContext || "").trim();
        if (title) {
            filterParam = `filter=(title~"${encodeURIComponent(title)}")`;
        }
    }

    if (!filterParam) return [];

    const url = `${base}/api/collections/entries/records?page=1&perPage=50&${filterParam}&expand=trs`;
    const response = Kiyomi.httpGet(url, null);

    if (!response) return [];

    let data;
    try {
        data = JSON.parse(response);
    } catch (e) {
        return [];
    }

    const items = data.items || [];
    const results = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const expand = item.expand || {};
        const trsList = expand.trs || [];

        for (let j = 0; j < trsList.length; j++) {
            const tr = trsList[j];
            const rawFiles = tr.files || [];
            
            // Format title
            const releaseTitle = tr.releaseTitle || tr.name || item.title || "SeaDex Release";
            const infoHash = tr.infoHash || "";
            let magnet = tr.magnet || "";

            if (!magnet && infoHash && typeof Kiyomi.buildMagnetFromHash === "function") {
                magnet = Kiyomi.buildMagnetFromHash(infoHash, releaseTitle);
            }

            if (!magnet && !infoHash) continue;

            const isDualAudio = tr.dualAudio === true;
            const res = tr.resolution || "1080p";

            results.push({
                title: `[SeaDex] ${releaseTitle} (${res})${isDualAudio ? " [Dual-Audio]" : ""}`,
                magnetUrl: magnet,
                hash: infoHash || null,
                size: Number(tr.size || 0),
                seeds: Number(tr.seeders || 0),
                peers: Number(tr.leechers || 0),
                infoUrl: `${base}/?id=${encodeURIComponent(item.id || "")}`,
                publishDate: tr.created || item.created || ""
            });
        }
    }

    return results;
}