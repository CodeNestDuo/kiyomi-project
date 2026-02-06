// ==KiyomiExtension==
// @id            hotstar-mirror-js
// @name          HotStar
// @version       1.6.0
// @author        Kiyomi Project
// @lang          hi
// @package       com.horis.cncverse
// @type          streaming
// @description   HotStar Mirror provider with replicated Recursive POST Bypass.
// ==/KiyomiExtension==

const EXTENSION_INFO = {
    id: "hotstar-mirror-js",
    displayName: "HotStar",
    siteUrl: "https://net20.cc",
    type: "STREAMING",
    version: "1.6.0"
};

const BASE_URL = "https://net20.cc";
const STREAM_URL = "https://net51.cc";
const IMAGE_CDN = "https://imgcdn.kim";

const DEFAULT_HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.7258.158 Safari/537.36 /OS.Gatu v3.0"
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

function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

// -------------------- Core Logic --------------------

function search(query, page) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    
    // Prime the session on page 1
    if (page === 1) {
        runBypass();
    }

    const url = `${BASE_URL}/mobile/hs/search.php?s=${encodeURIComponent(query)}&t=${getUnixTime()}`;
    const headers = { 
        ...DEFAULT_HEADERS, 
        "Referer": `${BASE_URL}/tv/home`,
        "Cookie": "ott=hs; hd=on" // Set to hs for HotStar mode
    };

    try {
        const res = Kiyomi.httpGet(url, JSON.stringify(headers));
        const data = JSON.parse(res);
        return (data.searchResult || []).map(it => ({
            title: it.t || "Unknown",
            url: JSON.stringify({ id: it.id, title: it.t }),
            poster: `${IMAGE_CDN}/hs/v/166/${it.id}.jpg`,
            type: "movie"
        }));
    } catch (e) {
        throw e;
    }
}

function details(urlJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const parsed = JSON.parse(urlJson);
    const id = parsed.id;
    
    runBypass();

    const url = `${BASE_URL}/mobile/hs/post.php?id=${id}&t=${getUnixTime()}`;
    const headers = { 
        ...DEFAULT_HEADERS, 
        "Referer": `${BASE_URL}/tv/home`, 
        "Cookie": "ott=hs; hd=on" 
    };

    const res = Kiyomi.httpGet(url, JSON.stringify(headers));
    const data = JSON.parse(res);

    return {
        title: data.title || parsed.title || "Unknown",
        url: urlJson,
        poster: `${IMAGE_CDN}/hs/v/166/${id}.jpg`,
        description: (data.desc || "").trim(),
        genres: (data.genre || "").split(",").map(g => g.trim()).filter(g => g),
        status: data.year || "",
        type: (data.episodes && data.episodes[0] !== null) ? "tv" : "movie"
    };
}

function episodes(urlJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const id = JSON.parse(urlJson).id;
    const url = `${BASE_URL}/mobile/hs/post.php?id=${id}&t=${getUnixTime()}`;
    
    const res = Kiyomi.httpGet(url, JSON.stringify({ 
        ...DEFAULT_HEADERS, 
        "Cookie": "ott=hs; hd=on" 
    }));
    
    const data = JSON.parse(res);
    let epList = [];

    if (!data.episodes || data.episodes[0] === null) {
        epList.push({ name: data.title, url: urlJson, number: 1 });
    } else {
        data.episodes.filter(e => e).forEach(ep => {
            epList.push({
                name: ep.t,
                url: JSON.stringify({ title: data.title, id: ep.id }),
                number: parseInt(ep.ep.replace(/\D/g, "")) || 0,
                season: parseInt(ep.s.replace(/\D/g, "")) || 0,
                poster: `${IMAGE_CDN}/hsepimg/${ep.id}.jpg`,
                runTime: parseInt((ep.time || "").replace(/\D/g, "")) || 0
            });
        });
    }
    return epList;
}

function streams(loadDataJson) {
    Kiyomi.setActiveProvider(EXTENSION_INFO.id);
    const loadData = JSON.parse(loadDataJson);
    const url = `${BASE_URL}/mobile/hs/playlist.php?id=${loadData.id}&t=${encodeURIComponent(loadData.title)}&tm=${getUnixTime()}`;
    
    try {
        const res = Kiyomi.httpGet(url, JSON.stringify({ 
            ...DEFAULT_HEADERS, 
            "Cookie": "ott=hs; hd=on" 
        }));
        
        const playlist = JSON.parse(res);
        const results = [];

        playlist.forEach(item => {
            if (item.sources) {
                item.sources.forEach(source => {
                    results.push({
                        url: `${STREAM_URL}/${source.file}`,
                        quality: source.label || "HD",
                        headers: { 
                            "Referer": `${STREAM_URL}/home`,
                            "Cookie": "hd=on; ott=hs"
                        }
                    });
                });
            }
        });
        return results;
    } catch (e) { return []; }
}