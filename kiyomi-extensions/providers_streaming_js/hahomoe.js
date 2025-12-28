/**
 * Kiyomi Streaming JS Provider: Haho.moe
 */

const BASE_URL = "https://haho.moe";
const PROVIDER_ID = "hahomoe";

Kiyomi.setActiveProvider(PROVIDER_ID);

function httpGet(url, headersObj) {
    const headers = headersObj || {};
    headers["Cookie"] = (headers["Cookie"] ? headers["Cookie"] + "; " : "") + "loop-view=thumb";
    return Kiyomi.httpGet(url, JSON.stringify(headers));
}

function search(query, page) {
    const p = page || 1;
    let url = (query && query.trim().length > 0)
        ? `${BASE_URL}/anime?page=${p}&s=vdy-d&q=${encodeURIComponent(query.trim())}`
        : `${BASE_URL}/anime?s=vdy-d&page=${p}`;

    const html = httpGet(url);

    // Kiyomi.select returns a JSON string array of HTML elements
    const elements = JSON.parse(Kiyomi.select(html, "ul.anime-loop.loop > li > a"));

    return elements.map(el => {
        const href = Kiyomi.attr(el, "href");
        const title = Kiyomi.selectText(el, "div.label > span, div span.thumb-title");

        // Find the image within the current element snippet
        const imgTag = Kiyomi.selectFirstElement(el, "img");
        const thumb = imgTag ? Kiyomi.attr(imgTag, "src") : "";

        return {
            title: title,
            url: href.startsWith("http") ? href + "?s=srt-d" : BASE_URL + href + "?s=srt-d",
            poster: thumb,
            type: "anime"
        };
    });
}

function details(url) {
    const html = httpGet(url);
    let genres = [];
    try {
        genres = JSON.parse(Kiyomi.xpath(html, '//li[contains(@class,"genre")]//span[contains(@class,"value")]/text() | //div[contains(@class,"genre-tree")]//ul/li/a/text()'));
    } catch(e) {}

    const imgTag = Kiyomi.selectFirstElement(html, "img.cover-image.img-thumbnail");
    return {
        title: Kiyomi.selectText(html, "li.breadcrumb-item.active") || "Anime",
        url: url,
        poster: imgTag ? Kiyomi.attr(imgTag, "src") : "",
        description: Kiyomi.selectText(html, "div.card-body"),
        genres: genres,
        status: Kiyomi.selectText(html, "li.status span.value") || "Unknown"
    };
}

function episodes(url) {
    let allEpisodes = [];
    let currentUrl = url;
    let pageCount = 0;

    while (currentUrl && pageCount < 5) { // Limit pages for performance
        const html = httpGet(currentUrl);
        const elements = JSON.parse(Kiyomi.select(html, "ul.episode-loop > li > a"));

        const pageEpisodes = elements.map(el => {
            const epText = Kiyomi.selectText(el, "div.episode-number, div.episode-slug") || "Episode";
            const titlePart = Kiyomi.selectText(el, "div.episode-label, div.episode-title");

            return {
                name: (titlePart && titlePart.toLowerCase() !== "no title") ? `${epText}: ${titlePart}` : epText,
                url: Kiyomi.attr(el, "href"),
                number: parseFloat(epText.replace(/[^\d.]/g, "")) || 0
            };
        });

        allEpisodes = allEpisodes.concat(pageEpisodes);

        const nextAnchor = Kiyomi.selectFirstElement(html, "ul.pagination li.page-item a[rel=next]");
        currentUrl = nextAnchor ? Kiyomi.attr(nextAnchor, "href") : null;
        if (currentUrl && !currentUrl.startsWith("http")) currentUrl = BASE_URL + currentUrl;
        pageCount++;
    }
    return allEpisodes.sort((a, b) => a.number - b.number);
}

function streams(url) {
    const fullUrl = url.startsWith("http") ? url : BASE_URL + url;
    const html = httpGet(fullUrl);

    const iframeTag = Kiyomi.selectFirstElement(html, "iframe");
    const iframeUrl = iframeTag ? Kiyomi.attr(iframeTag, "src") : null;
    if (!iframeUrl) return [];

    const iframeHtml = httpGet(iframeUrl, { "Referer": fullUrl });
    const sources = JSON.parse(Kiyomi.select(iframeHtml, "source"));

    return sources.map(el => ({
        url: Kiyomi.attr(el, "src"),
        quality: Kiyomi.attr(el, "title") || "Unknown",
        headers: { "Referer": iframeUrl }
    }));
}