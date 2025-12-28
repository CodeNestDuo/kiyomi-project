/**
 * Kiyomi Streaming JS Provider: AllAnime
 */

const BASE_URL = "https://allmanga.to";
const API_URL = "https://api.allanime.day";
const PROVIDER_ID = "allanime";

Kiyomi.setActiveProvider(PROVIDER_ID);

function httpPost(payload) {
    const headers = {
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL,
        "Accept": "*/*"
    };
    return Kiyomi.httpPostJson(`${API_URL}/api`, JSON.stringify(payload), JSON.stringify(headers));
}

// -------------------- Core Logic --------------------

function search(query, page) {
    const p = page || 1;
    const graphqlQuery = `query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
            edges {
                _id
                name
                englishName
                thumbnail
                slugTime
            }
        }
    }`;

    const variables = {
        search: {
            allowAdult: true,
            allowUnknown: true,
            query: query || ""
        },
        limit: 26,
        page: p,
        translationType: "sub",
        countryOrigin: "ALL"
    };

    const response = JSON.parse(httpPost({ query: graphqlQuery, variables: variables }));
    if (!response.data || !response.data.shows) return [];

    return (response.data.shows.edges || []).map(ani => ({
        title: ani.englishName || ani.name,
        url: `${ani._id}<&sep>${ani.slugTime || ""}<&sep>${ani.name}`,
        poster: ani.thumbnail,
        type: "anime"
    }));
}

// ADD THIS FUNCTION - It was missing/undefined in your logs
function details(url) {
    const id = url.split("<&sep>")[0];
    const graphqlQuery = `query ($_id: String!) {
        show(_id: $_id) {
            name
            englishName
            nativeName
            description
            thumbnail
            genres
            status
            type
            score
        }
    }`;

    const response = JSON.parse(httpPost({ query: graphqlQuery, variables: { _id: id } }));
    const show = response.data.show;

    return {
        title: show.englishName || show.name,
        url: url,
        poster: show.thumbnail,
        description: (show.description || "").replace(/<br>/g, "\n"),
        genres: show.genres || [],
        status: show.status || "Unknown"
    };
}

function episodes(url) {
    const id = url.split("<&sep>")[0];
    const graphqlQuery = `query ($_id: String!) {
        show(_id: $_id) {
            _id
            availableEpisodesDetail
        }
    }`;

    const response = JSON.parse(httpPost({ query: graphqlQuery, variables: { _id: id } }));
    // We default to 'sub' as per preferences
    const subList = response.data.show.availableEpisodesDetail.sub || [];

    return subList.map(ep => ({
        name: `Episode ${ep}`,
        // Pack the data needed for stream extraction into a JSON string
        url: JSON.stringify({
            showId: id,
            translationType: "sub",
            episodeString: ep
        }),
        number: parseFloat(ep)
    })).sort((a, b) => a.number - b.number);
}

function streams(episodeDataJson) {
    const epData = JSON.parse(episodeDataJson);
    const graphqlQuery = `query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
        episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
            sourceUrls
        }
    }`;

    const response = JSON.parse(httpPost({ query: graphqlQuery, variables: epData }));
    const sourceUrls = response.data.episode.sourceUrls;
    const results = [];

    // Resolve dynamic CDN endpoint
    const versionRes = JSON.parse(Kiyomi.httpGet(`${BASE_URL}/getVersion`, null));
    const endPoint = versionRes.episodeIframeHead;

    for (const source of sourceUrls) {
        const decryptedUrl = decryptSource(source.sourceUrl);

        if (decryptedUrl.startsWith("/apivtwo/")) {
            const fullApiUrl = endPoint + decryptedUrl.replace("/clock?", "/clock.json?");
            try {
                const linkJson = JSON.parse(Kiyomi.httpGet(fullApiUrl, null));
                for (const link of linkJson.links) {
                    if (link.hls) {
                        const masterPlaylist = Kiyomi.httpGet(link.link, null);
                        const variants = JSON.parse(Kiyomi.parseHlsMasterVariants(masterPlaylist, link.link));
                        variants.forEach(v => {
                            results.push({
                                url: v.url,
                                quality: `${v.quality} (${source.sourceName})`,
                                headers: { "Referer": endPoint, "Origin": BASE_URL }
                            });
                        });
                    } else if (link.mp4) {
                        results.push({
                            url: link.link,
                            quality: `MP4: ${link.resolutionStr} (${source.sourceName})`,
                            headers: { "Referer": endPoint, "Origin": BASE_URL }
                        });
                    }
                }
            } catch (e) {
                Kiyomi.logError("Stream extraction failed: " + e.message);
            }
        }
    }
    return results;
}

function decryptSource(hash) {
    if (!hash || !hash.startsWith("-")) return hash;
    const hex = hash.substring(hash.lastIndexOf("-") + 1);
    let decrypted = "";
    for (let i = 0; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substr(i, 2), 16);
        decrypted += String.fromCharCode(charCode ^ 56);
    }
    return decrypted;
}