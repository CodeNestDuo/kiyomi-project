// ==KiyomiExtension==
// @id           seadex-js
// @name         SeaDex
// @version      1.3.0
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

const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.coppersurfer.tk:6969/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "http://nyaa.tracker.wf:7777/announce"
];

function totalSize(files) {
    if (!Array.isArray(files)) return 0;
    let s = 0;
    for (let i = 0; i < files.length; i++) {
        const len = Number(files[i] && files[i].length);
        if (Number.isFinite(len)) s += len;
    }
    return s;
}

function firstFilename(files) {
    if (!Array.isArray(files) || !files.length) return "";
    const f = files.find(x => x && x.name);
    return f ? f.name : "";
}

function cleanReleaseTitle(filename) {
    if (!filename) return "";
    return filename
        .replace(/\s*-?\s*S\d{1,2}E\d{1,3}(?:v\d)?\b/gi, "")
        .replace(/\s+-\s+\d{1,4}(?:v\d)?\b/g, "")
        .replace(/\.(mkv|mp4|avi|m2ts|webm)$/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

function isBatchRelease(files) {
    if (!Array.isArray(files)) return false;
    const videoFiles = files.filter(f => f && f.name && /\.(mkv|mp4|avi|m2ts|webm)$/i.test(f.name));
    if (videoFiles.length > 1) return true;
    return totalSize(files) > 10 * 1024 * 1024 * 1024; // >10GB
}

function buildMagnet(hash, name) {
    const trackerParams = TRACKERS.map(t => "tr=" + encodeURIComponent(t)).join("&");
    const dn = name ? "&dn=" + encodeURIComponent(name) : "";
    return `magnet:?xt=urn:btih:${String(hash).toLowerCase()}${dn}&${trackerParams}`;
}

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
    const seenHashes = {};

    for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        const expand = entry.expand || {};
        const trsList = expand.trs || [];

        for (let j = 0; j < trsList.length; j++) {
            const tr = trsList[j];
            if (!tr) continue;

            const hash = String(tr.infoHash || "").toLowerCase();
            if (!hash || seenHashes[hash]) continue;
            seenHashes[hash] = true;

            const files = tr.files || [];
            const cleanName = cleanReleaseTitle(firstFilename(files));
            const group = tr.releaseGroup ? `[${tr.releaseGroup}]` : "";
            const baseTitle = cleanName || tr.releaseTitle || entry.title || "Release";

            // Build enriched tags so AnimeParser and RelevanceEngine extract them directly
            const isBest = tr.isBest ? "[Best Release]" : "";
            const isBatch = isBatchRelease(files) ? "[Batch]" : "";
            const dualAudio = tr.dualAudio ? "[Dual Audio]" : "";
            const resolution = tr.resolution ? `[${tr.resolution}]` : "";

            const displayTitle = [group, baseTitle, resolution, isBest, dualAudio, isBatch]
                .filter(Boolean)
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();

            const magnet = tr.magnet || buildMagnet(hash, cleanName || displayTitle);
            const calculatedSize = totalSize(files) || Number(tr.size || 0);

            results.push({
                title: displayTitle,
                magnetUrl: magnet,
                hash: hash,
                size: calculatedSize,
                seeds: Number(tr.seeders || 0),
                peers: Number(tr.leechers || 0),
                infoUrl: `${base}/?id=${encodeURIComponent(entry.id || "")}`,
                publishDate: tr.created || entry.created || ""
            });
        }
    }

    return results;
}