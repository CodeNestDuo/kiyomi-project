// ==KiyomiExtension==
// @id             torrentdownload-js
// @name           TorrentDownload
// @version        1.0.0 // Kiyomi port of v1.1
// @author         LightDestory (ported for Kiyomi by Kiyomi Community)
// @lang           all
// @icon           https://www.torrentdownload.info/favicon.ico
// @site           https://www.torrentdownload.info
// @package        torrentdownload.info
// @type           html-regex
// @nsfw           false
// @secure         true
// @private        false
// @requiresKey    false
// @description    Scrapes search results from torrentdownload.info (limited pages).
// @primaryCategory general
// @extraCategories movie, tv
// ==/KiyomiExtension==


// ===== Runtime metadata =====
const EXTENSION_INFO = {
    id: "torrentdownload-js",
    displayName: "TorrentDownload",
    siteUrl: "https://www.torrentdownload.info",
    iconUrl: "https://www.torrentdownload.info/favicon.ico",
    type: "HTML_REGEX",
    isAdult: false,
    isSecure: true,
    cautionReason: "",
    isPrivate: false,
    isApiKeyRequired: false,
    version: "1.0.0"
};


// ===== Provider URLs =====
const TD_BASE = "https://www.torrentdownload.info";


// ===== Category handling =====
// Original plugin ignores categories; we still expose a simple map for UI.
const CATEGORY_MAP = {
    "All": "all"
};

function resolveCategory(_category) {
    // Endpoint doesn't support category filters; kept for parity/future use.
    return "all";
}


// ===== Tuning knobs =====
const TORRENTDOWNLOAD_CONFIG = {
    // Max pages to fetch (1-based index: page=1,2,...)
    MAX_PAGES: 3,

    // Hard cap on total results (safety net).
    MAX_RESULTS: 60
};


// ===== Helpers =====

/**
 * Minimal HTML entity decoder.
 */
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
        if (entity.charAt(0) === "#") {
            let code = 0;
            if (entity.charAt(1).toLowerCase() === "x") {
                code = parseInt(entity.slice(2), 16);
            } else {
                code = parseInt(entity.slice(1), 10);
            }
            if (!isNaN(code)) {
                return String.fromCharCode(code);
            }
        }
        return "&" + entity + ";";
    });
}

/**
 * Strip HTML tags from text.
 */
function stripTags(html) {
    if (!html) return "";
    return html.replace(/<[^>]+>/g, "");
}

/**
 * Convert size like "1.23 GB" to bytes using Kiyomi.humanSizeToBytes if available.
 */
function convertSizeToBytes(sizeHuman) {
    if (!sizeHuman) return 0;

    if (typeof Kiyomi === "object" && typeof Kiyomi.humanSizeToBytes === "function") {
        try {
            const res = Kiyomi.humanSizeToBytes(sizeHuman);
            if (typeof res === "string") {
                const v = parseInt(res, 10);
                if (!isNaN(v) && v >= 0) return v;
            }
        } catch (_e) {
            // fall through to 0
        }
    }

    return 0;
}

/**
 * Parse a single TorrentDownload HTML page into Kiyomi torrent objects.
 */
function parseTorrentDownloadPage(html, engineUrl) {
    if (!html) {
        Kiyomi.logDebug("TorrentDownload: Empty HTML.");
        return [];
    }

    // Normalize whitespace similar to Python `re.sub(r'\s+', ' ', ...)`.
    const normalizedHtml = html.replace(/\s+/g, " ");

    // Find each <tr> row that looks like a torrent row.
    const rowRegex = /<tr><td.+?tt-name.+?<\/tr>/gi;
    const rows = normalizedHtml.match(rowRegex) || [];

    const results = [];
    let pageResSize = 0;

    for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];

        // Same structure as original Python regex:
        // href="/(path)">name</a> ... tdnormal">size ... tdseed">seeds ... tdleech">leech
        const m = tr.match(
            /href="\/(.+?)">(.+?)<\/a>.+?tdnormal">([\d,\.]+ (?:TB|GB|MB|KB)).+?tdseed">([\d,]+).+?tdleech">([\d,]+)/i
        );
        if (!m) {
            continue;
        }

        const path = m[1];               // relative path (used for hash + desc link)
        const nameHtml = m[2];           // may contain <span class="na">
        const sizeHumanRaw = m[3];       // "1,234.56 GB"
        const seedsStr = m[4];           // "123"
        const leechStr = m[5];           // "45"

        const hash = path.split("/")[0]; // first segment -> infohash

        let nameClean = nameHtml
            .replace('<span class="na">', "")
            .replace("</span>", "");
        nameClean = stripTags(nameClean);
        nameClean = decodeHtmlEntities(nameClean).trim();

        if (!hash || !nameClean) {
            Kiyomi.logDebug(
                "TorrentDownload: Skipping row " +
                i +
                " due to missing hash or name."
            );
            continue;
        }

        const sizeHuman = sizeHumanRaw.replace(/,/g, "");
        const sizeBytes = convertSizeToBytes(sizeHuman);

        const seeds = parseInt(seedsStr.replace(/,/g, ""), 10) || 0;
        const peers = parseInt(leechStr.replace(/,/g, ""), 10) || 0;

        // Magnet template from the original plugin; we add dn=<name>.
        const encodedName = encodeURIComponent(nameClean);
        const magnetUrl =
            "magnet:?xt=urn:btih:" +
            hash +
            "&dn=" +
            encodedName +
            "&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce" +
            "&tr=http%3A%2F%2Ftracker.ipv6tracker.ru%3A80%2Fannounce" +
            "&tr=udp%3A%2F%2Fretracker.hotplug.ru%3A2710%2Fannounce" +
            "&tr=https%3A%2F%2Ftracker.fastdownload.xyz%3A443%2Fannounce" +
            "&tr=https%3A%2F%2Fopentracker.xyz%3A443%2Fannounce" +
            "&tr=http%3A%2F%2Fopen.trackerlist.xyz%3A80%2Fannounce" +
            "&tr=udp%3A%2F%2Ftracker.birkenwald.de%3A6969%2Fannounce" +
            "&tr=https%3A%2F%2Ft.quic.ws%3A443%2Fannounce" +
            "&tr=https%3A%2F%2Ftracker.parrotsec.org%3A443%2Fannounce" +
            "&tr=udp%3A%2F%2Ftracker.supertracker.net%3A1337%2Fannounce" +
            "&tr=http%3A%2F%2Fgwp2-v19.rinet.ru%3A80%2Fannounce" +
            "&tr=udp%3A%2F%2Fbigfoot1942.sektori.org%3A6969%2Fannounce" +
            "&tr=udp%3A%2F%2Fcarapax.net%3A6969%2Fannounce" +
            "&tr=udp%3A%2F%2Fretracker.akado-ural.ru%3A80%2Fannounce" +
            "&tr=udp%3A%2F%2Fretracker.maxnet.ua%3A80%2Fannounce" +
            "&tr=udp%3A%2F%2Fbt.dy20188.com%3A80%2Fannounce" +
            "&tr=http%3A%2F%2F0d.kebhana.mx%3A443%2Fannounce" +
            "&tr=http%3A%2F%2Ftracker.files.fm%3A6969%2Fannounce" +
            "&tr=http%3A%2F%2Fretracker.joxnet.ru%3A80%2Fannounce" +
            "&tr=http%3A%2F%2Ftracker.moxing.party%3A6969%2Fannounce";

        const descLink = engineUrl + "/" + path.replace(/^\/+/, "");

        results.push({
            title: nameClean,
            magnetUrl: magnetUrl,
            size: sizeBytes,
            seeds: seeds,
            peers: peers,
            infoUrl: descLink,
            publishDate: "",       // not provided by this HTML
            category_name: "All"   // site is general; no explicit category on row
        });

        pageResSize++;
    }

    Kiyomi.logDebug(
        "TorrentDownload: Parsed " +
        results.length +
        " items from page; raw rows=" +
        rows.length
    );

    return results;
}


// ===== Main entrypoint =====

/**
 * Main entry for Kiyomi.
 *
 * @param {string} query
 * @param {string} category
 * @returns {Array<Object>}
 */
function search(query, category) {
    Kiyomi.logDebug(
        "TorrentDownload: Starting search. Query='" +
        query +
        "', category='" +
        category +
        "'"
    );

    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) {
        Kiyomi.logDebug("TorrentDownload: Blank query, returning empty result.");
        return [];
    }

    if (typeof Kiyomi !== "object" || typeof Kiyomi.httpGet !== "function") {
        Kiyomi.logError("TorrentDownload: Kiyomi.httpGet is not available.");
        return [];
    }

    resolveCategory(category); // currently ignored, but kept for parity

    // Similar to original: `what = what.replace("%20", "+")`
    const searchParam = encodeURIComponent(trimmedQuery).replace(/%20/g, "+");

    // OkHttp handles compression; do not set Accept-Encoding.
    const headersObject = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 16; Kiyomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        DNT: "1"
    };
    const headersString = JSON.stringify(headersObject);

    const allItems = [];

    for (let page = 1; page <= TORRENTDOWNLOAD_CONFIG.MAX_PAGES; page++) {
        if (allItems.length >= TORRENTDOWNLOAD_CONFIG.MAX_RESULTS) {
            break;
        }

        const url =
            TD_BASE + "/search?q=" + searchParam + "&p=" + String(page);

        Kiyomi.logDebug(
            "TorrentDownload: Fetching page " +
            page +
            " URL: " +
            url
        );

        let html;
        try {
            html = Kiyomi.httpGet(url, headersString);
        } catch (e) {
            Kiyomi.logError(
                "TorrentDownload: HTTP error for URL " +
                url +
                " – " +
                (e && e.message ? e.message : String(e))
            );
            break;
        }

        if (!html) {
            Kiyomi.logDebug(
                "TorrentDownload: Empty HTML on page " + page + ", stopping."
            );
            break;
        }

        const pageItems = parseTorrentDownloadPage(html, TD_BASE);
        if (!pageItems.length) {
            // Matches original behavior: stop when a page has 0 results.
            Kiyomi.logDebug(
                "TorrentDownload: No items on page " + page + ", stopping."
            );
            break;
        }

        for (let i = 0; i < pageItems.length; i++) {
            if (allItems.length >= TORRENTDOWNLOAD_CONFIG.MAX_RESULTS) {
                break;
            }
            allItems.push(pageItems[i]);
        }
    }

    // Sort by seeds descending for nicer UX
    allItems.sort(function (a, b) {
        const sa = typeof a.seeds === "number" ? a.seeds : 0;
        const sb = typeof b.seeds === "number" ? b.seeds : 0;
        return sb - sa;
    });

    Kiyomi.logDebug(
        "TorrentDownload: Finished search. Total results returned: " +
        allItems.length
    );

    return allItems;
}
