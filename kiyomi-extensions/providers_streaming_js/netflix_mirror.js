// ==KiyomiExtension==
// @id            netflix-mirror-js
// @name          Netflix Mirror
// @version       1.7.0
// @author        Kiyomi Project
// @lang          hi
// @package       com.horis.cncverse
// @type          streaming
// @description   Netflix Mirror with corrected net51 home page logic and specific CDNs.
// ==/KiyomiExtension==

const EXTENSION_INFO = {
    id: "netflix-mirror-js",
    displayName: "Netflix Mirror",
    siteUrl: "https://net20.cc",
    type: "STREAMING",
    version: "1.7.0"
};

const BASE_URL = "https://net20.cc";
const ALT_URL = "https://net51.cc"; // Used for Home and Details on Netflix Mirror
const IMAGE_CDN = "https://img.nfmirrorcdn.top"; // Netflix-specific CDN

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.158 Safari/537.36 /OS.Gatu v3.0",
    "X-Requested-With": "XMLHttpRequest"
};

// --- Constants ---
const BYPASS_KEY = "last_bypass_time"; // Key for persistent storage
const BYPASS_EXPIRY = 1000 * 60 * 60 * 12; // 12 hours

/**
 * PERSISTENT BYPASS:
 * Uses Kiyomi bridge to save the timestamp to the device.
 */
function runBypass() {
    // 1. Get the last successful bypass time from device storage
    // Bridge returns a string, so we parse it to a number
    const savedTime = parseInt(Kiyomi.getSetting(BYPASS_KEY, "0"));
    const currentTime = Date.now();
    
    // 2. Check if the session is still valid (less than 12h old)
    if (currentTime - savedTime < BYPASS_EXPIRY && savedTime !== 0) {
        Kiyomi.logDebug("[Mirror] Device storage says session is still valid. Skipping.");
        return true;
    }

    Kiyomi.logDebug("[Mirror] Session expired on device. Running fresh bypass...");
    let verifyCheck = "";
    let attempts = 0;
    
    try {
        while (!verifyCheck.includes('"r":"n"') && attempts < 15) {
            attempts++;
            verifyCheck = Kiyomi.httpPostForm(
                `${BASE_URL}/tv/p.php`, 
                JSON.stringify({}), 
                JSON.stringify(DEFAULT_HEADERS)
            );
        }
        
        if (verifyCheck.includes('"r":"n"')) {
            // 3. SUCCESS: Save the current time to device storage for next time
            Kiyomi.setSetting(BYPASS_KEY, currentTime.toString());
            Kiyomi.logDebug("[Mirror] Bypass Successful. Timestamp saved to bridge.");
            return true;
        }
    } catch (e) {
        Kiyomi.logError(`[Mirror] Bypass failed: ${e.message}`);
    }
    return false;
}
function getUnixTime() { return Math.floor(Date.now() / 1000); }

// -------------------- Core Logic --------------------

function getMainPage() {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    runBypass();

    // Netflix Mirror uses net51 for home
    const url = `${ALT_URL}/mobile/home?app=1`;
    const headers = { ...DEFAULT_HEADERS, "Cookie": "ott=nf; hd=on", "Referer": ALT_URL };
    const html = Kiyomi.httpGet(url, JSON.stringify(headers));
    
    const containers = JSON.parse(Kiyomi.select(html, ".tray-container, #top10"));
    return containers.map(container => {
        const sectionName = Kiyomi.selectText(container, "h2, span");
        const items = JSON.parse(Kiyomi.select(container, "article, .top10-post")).map(item => {
            const id = Kiyomi.attr(item, "data-post") || 
                       Kiyomi.regexFirst(Kiyomi.attr(Kiyomi.selectFirstElement(item, "img"), "src"), "/([^/]+)\\.jpg", 1);
            return {
                title: Kiyomi.attr(Kiyomi.selectFirstElement(item, "img"), "alt"),
                url: JSON.stringify({ id: id }),
                poster: `${IMAGE_CDN}/poster/v/${id}.jpg`,
                type: "movie"
            };
        });
        return { title: sectionName, items: items };
    });
}

function search(query, page) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    if (page === 1) runBypass();

    // Search uses net20 (BASE_URL)
    const url = `${BASE_URL}/search.php?s=${encodeURIComponent(query)}&t=${getUnixTime()}`;
    const headers = { ...DEFAULT_HEADERS, "Cookie": "ott=nf; hd=on", "Referer": `${BASE_URL}/tv/home` };
    
    const res = Kiyomi.httpGet(url, JSON.stringify(headers));
    const data = JSON.parse(res);

    return (data.searchResult || []).map(it => ({
        title: it.t,
        url: JSON.stringify({ id: it.id }),
        poster: `${IMAGE_CDN}/poster/v/${it.id}.jpg`,
        type: "movie"
    }));
}

function details(urlJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const id = JSON.parse(urlJson).id;
    
    // Netflix Mirror details are on net51
    const url = `${ALT_URL}/post.php?id=${id}&t=${getUnixTime()}`;
    const headers = { ...DEFAULT_HEADERS, "Cookie": "ott=nf; hd=on", "Referer": ALT_URL };
    
    const res = Kiyomi.httpGet(url, JSON.stringify(headers));
    const data = JSON.parse(res);

    return {
        title: data.title,
        url: urlJson,
        poster: `${IMAGE_CDN}/poster/v/${id}.jpg`,
        description: data.desc,
        genres: (data.genre || "").split(",").map(g => g.trim()),
        type: (data.episodes && data.episodes[0] !== null) ? "tv" : "movie"
    };
}

function episodes(urlJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const id = JSON.parse(urlJson).id;
    const url = `${ALT_URL}/post.php?id=${id}&t=${getUnixTime()}`;
    const res = Kiyomi.httpGet(url, JSON.stringify({ ...DEFAULT_HEADERS, "Cookie": "ott=nf; hd=on" }));
    const data = JSON.parse(res);
    
    if (!data.episodes || data.episodes[0] === null) {
        return [{ name: data.title, url: urlJson, number: 1 }];
    }

    return data.episodes.filter(e => e).map(ep => ({
        name: ep.t,
        url: JSON.stringify({ title: data.title, id: ep.id }),
        number: parseInt(ep.ep.replace(/\D/g, "")) || 0,
        season: parseInt(ep.s.replace(/\D/g, "")) || 0,
        poster: `${IMAGE_CDN}/epimg/150/${ep.id}.jpg`
    }));
}

function streams(loadDataJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const loadData = JSON.parse(loadDataJson);
    
    // Playlist on Netflix Mirror is on net51/tv/
    const url = `${ALT_URL}/tv/playlist.php?id=${loadData.id}&t=${encodeURIComponent(loadData.title)}&tm=${getUnixTime()}`;
    const res = Kiyomi.httpGet(url, JSON.stringify({ ...DEFAULT_HEADERS, "Cookie": "ott=nf; hd=on" }));
    
    const playlist = JSON.parse(res);
    const results = [];

    playlist.forEach(item => {
        if (item.sources) {
            item.sources.forEach(source => {
                results.push({
                    url: `${ALT_URL}${source.file.replace("/tv/", "/")}`,
                    quality: source.label || "HD",
                    headers: { "Referer": `${ALT_URL}/`, "Cookie": "hd=on; ott=nf" }
                });
            });
        }
    });
    return results;
}