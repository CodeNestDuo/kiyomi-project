// ==KiyomiExtension==
// @id           seadex-js
// @name         SeaDex
// @version      1.1.0
// @author       Kiyomi Community
// @lang         all
// @icon         https://releases.moe/favicon.ico
// @site         https://releases.moe
// @mirrors      https://releases.moe
// @package      releases.moe
// @type         json-api
// @nsfw         false
// @private      false
// @requiresKey  false
// @description  Curated index of the best available anime releases, encodes, and dual-audio batches.
// @primaryCategory anime
// ==/KiyomiExtension==

const DEFAULT_API_BASE = "https://releases.moe/api/collections/entries/records";

function resolveQuery(queryOrContext) {
    if (typeof queryOrContext === "object" && queryOrContext !== null) {
        if (queryOrContext.anilistId) {
            return { alId: queryOrContext.anilistId, text: "" };
        }
        const title = (queryOrContext.titles && queryOrContext.titles[0]) || queryOrContext.query || "";
        return { alId: null, text: title.trim() };
    }
    return { alId: null, text: String(queryOrContext || "").trim() };
}

/**
 * Main search entry point.
 */
function search(queryOrContext, category, customBaseUrl) {
    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        return [];
    }

    const target = resolveQuery(queryOrContext);
    const base = (customBaseUrl && customBaseUrl.trim().length > 0)
        ? customBaseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_API_BASE;

    let filterParam = "";
    if (target.alId) {
        filterParam = '(alID="' + target.alId + '")';
    } else if (target.text) {
        filterParam = '(title~"' + target.text.replace(/"/g, '\\"') + '")';
    } else {
        return [];
    }

    const url = base + "?page=1&perPage=50&filter=" + encodeURIComponent(filterParam) + "&expand=trs";

    const headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
    };

    const rawJson = Kiyomi.httpGet(url, headers);
    if (!rawJson) return [];

    let root;
    try {
        root = JSON.parse(rawJson);
    } catch (e) {
        return [];
    }

    const items = (root && Array.isArray(root.items)) ? root.items : [];
    const results = [];

    for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        if (!entry) continue;

        const mainTitle = entry.title || "";
        const trsList = (entry.expand && Array.isArray(entry.expand.trs)) ? entry.expand.trs : [];

        for (let j = 0; j < trsList.length; j++) {
            const tr = trsList[j];
            if (!tr) continue;

            const releaseGroup = tr.releaseGroup || "Best";
            const dualAudioStr = tr.isDualAudio ? "[Dual-Audio] " : "";
            const trackerStr = tr.tracker ? "[" + tr.tracker + "] " : "";
            const displayTitle = trackerStr + dualAudioStr + mainTitle + " (" + releaseGroup + ")";

            const infoHash = (tr.infoHash || "").trim().toLowerCase();
            const rawMagnet = tr.magnet || "";

            let magnetUrl = "";
            if (rawMagnet && rawMagnet.startsWith("magnet:")) {
                magnetUrl = rawMagnet;
            } else if (infoHash && typeof Kiyomi.buildMagnetFromHash === "function") {
                magnetUrl = Kiyomi.buildMagnetFromHash(infoHash, displayTitle);
            } else if (infoHash) {
                magnetUrl = "magnet:?xt=urn:btih:" + infoHash + "&dn=" + encodeURIComponent(displayTitle);
            }

            if (!magnetUrl && !infoHash) continue;

            const filesList = Array.isArray(tr.files) ? tr.files : [];
            let totalBytes = 0;
            for (let f = 0; f < filesList.length; f++) {
                totalBytes += (filesList[f].length || 0);
            }

            results.push({
                title: displayTitle,
                magnetUrl: magnetUrl,
                hash: infoHash || null,
                size: totalBytes,
                seeds: 1, // SeaDex prioritizes active curated releases
                peers: 0,
                infoUrl: "https://releases.moe/entry/" + entry.id,
                publishDate: entry.created || ""
            });
        }
    }

    return results;
}