// ==KiyomiExtension==
// @id            kawaiifu-js
// @name          Kawaiifu
// @version       1.7
// @author        Kiyomi Project
// @lang          en
// @site          https://kawaiifu.com
// @package       kawaiifu.com
// @type          streaming
// @nsfw          false
// ==/KiyomiExtension==

const BASE_URL = "https://kawaiifu.com";

function httpGet(url) {
    return Kiyomi.httpGet(url, JSON.stringify({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }));
}

function search(query, page) {
    let url;
    const p = (page && page > 1) ? `page/${page}` : "";
    if (query) {
        url = `${BASE_URL}/search-movie/${p}${p ? "/" : ""}?keyword=${encodeURIComponent(query)}&cat-get=`;
    } else {
        url = `${BASE_URL}/category/tv-series/${p}`;
    }

    const html = httpGet(url);
    const selector = query ? "div.today-update > div.item" : "ul.list-film li";
    const elements = JSON.parse(Kiyomi.select(html, selector) || "[]");

    return elements.map(elHtml => {
        const aHtml = query 
            ? Kiyomi.selectFirstElement(elHtml, "div.info a:not([style])")
            : Kiyomi.selectFirstElement(elHtml, "a.mv-namevn");
            
        const imgHtml = Kiyomi.selectFirstElement(elHtml, "img");

        if (!aHtml || aHtml === "") return null;

        return {
            title: Kiyomi.selectText(aHtml, "a"),
            url: Kiyomi.attr(aHtml, "href"),
            poster: (imgHtml && imgHtml !== "") ? Kiyomi.attr(imgHtml, "src") : "",
            type: "anime"
        };
    }).filter(x => x !== null);
}

function details(url) {
    const html = httpGet(url);
    const imgElement = Kiyomi.selectFirstElement(html, "div.thumb img") || Kiyomi.selectFirstElement(html, ".thumb img");
    
    let posterUrl = "";
    if (imgElement && imgElement !== "") {
        posterUrl = Kiyomi.attr(imgElement, "src");
    }

    return {
        title: Kiyomi.selectText(html, "div.desc-top h2") || "Unknown",
        url: url,
        poster: posterUrl,
        description: Kiyomi.selectText(html, "div.sub-desc > h5:contains(Summary) ~ p").trim(),
        genres: JSON.parse(Kiyomi.xpath(html, '//div[contains(@class,"desc-top")]//tr[td[contains(text(),"Genres")]]//td//a/text()') || "[]"),
        status: Kiyomi.selectText(html, "div.desc-top table tr:nth-child(2) td:nth-child(2)")
    };
}

/**
 * FIXED: Episode List Logic
 * Appends -episode directly to the .html link
 */
/**
 * Episode List Logic - FIXED for domdom.stream redirects
 */
function episodes(url) {
    const epPageUrl = url + "-episode";
    Kiyomi.logDebug("Fetching episodes from: " + epPageUrl);
    
    const playHtml = httpGet(epPageUrl);
    
    // Attempt to select using the standard Kawaiifu selector
    let serverBlocksJson = Kiyomi.select(playHtml, "div#server_ep > div.list-server");
    
    // REDIRECT FIX: If the domain redirected to domdom.stream, the ID might be slightly different
    // We try a more generic selector that works on both structures.
    if (!serverBlocksJson || serverBlocksJson === "[]") {
        Kiyomi.logDebug("Kawaiifu selector failed, trying generic server selector...");
        serverBlocksJson = Kiyomi.select(playHtml, ".list-server"); 
    }

    if (!serverBlocksJson || serverBlocksJson === "[]") {
        Kiyomi.logError("Failed to find servers at " + epPageUrl + ". HTML body length: " + playHtml.length);
        return [];
    }

    const episodeMap = {};
    const serverBlocks = JSON.parse(serverBlocksJson);
    
    serverBlocks.forEach(serverHtml => {
        const serverName = Kiyomi.selectText(serverHtml, "h4") || Kiyomi.selectText(serverHtml, ".server-name");
        const epLinks = JSON.parse(Kiyomi.select(serverHtml, "ul.list-ep > li a") || "[]");
        
        epLinks.forEach(aHtml => {
            const epName = Kiyomi.selectText(aHtml, "a");
            const epUrl = Kiyomi.attr(aHtml, "href");

            if (!episodeMap[epName] && epName && epUrl) {
                episodeMap[epName] = {
                    name: epName,
                    number: parseFloat(epName.replace(/[^\d.]/g, "")) || 0,
                    url: [] 
                };
            }
            if (episodeMap[epName]) {
                episodeMap[epName].url.push({ name: serverName, url: epUrl });
            }
        });
    });

    return Object.values(episodeMap)
        .sort((a, b) => a.number - b.number)
        .map(ep => ({
            name: ep.name,
            number: ep.number,
            url: JSON.stringify(ep.url) 
        }));
}

function streams(epUrlJson) {
    const servers = JSON.parse(epUrlJson || "[]");
    const results = [];

    servers.forEach(server => {
        try {
            const html = httpGet(server.url);
            const sourceHtml = Kiyomi.selectFirstElement(html, "div#video_box video source");
            
            if (sourceHtml && sourceHtml !== "") {
                const rawQuality = Kiyomi.attr(sourceHtml, "data-quality") || "720";
                // Only add the parenthesis if server.name is actually present
                const serverLabel = server.name ? ` (${server.name})` : "";
                
                results.push({
                    url: Kiyomi.attr(sourceHtml, "src"),
                    quality: `${rawQuality}p${serverLabel}`,
                    headers: { "Referer": BASE_URL }
                });
            }
        } catch (e) {
            Kiyomi.logError(`Kawaiifu stream extraction failed: ${e.message}`);
        }
    });

    return results;
}