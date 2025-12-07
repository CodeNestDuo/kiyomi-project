{
  "id": "sukebei_nyaa",
  "displayName": "Sukebei Nyaa (Adult)",
  "siteUrl": "https://sukebei.nyaa.si",
  "iconUrl": "https://sukebei.nyaa.si/static/favicon.png",
  "type": "RSS_XML",
  "isAdult": true,
  "isSecure": true,
  "cautionReason": "",
  "isPrivate": false,
  "isApiKeyRequired": false,
  "version": 1.0,

  "categoryMap": {
    "All": "0_0",
    "Anime": "1_1",
    "Doujinshi": "1_2",
    "Games": "1_3",
    "Manga": "1_4",
    "Pictures": "1_5",
    "Photobooks": "2_1",
    "Videos": "2_2",
    "Real Life": "2_0",
    "Other Art": "1_0"
  },

  "searchUrlTemplate": "https://sukebei.nyaa.si/?page=rss&c={category}&f=0&q={query}",

  "searchSteps": [
    {
      "stepType": "HTTP_REQUEST",
      "method": "GET",
      "urlKey": "searchUrlTemplate"
    },
    {
      "stepType": "MAP_RESULTS_GENERIC",
      "rootSelector": "channel > item",
      "isRootArray": false,

      "fields": {
        // Core RSS Fields
        "title": { "accessor": "title::text", "accessorType": "XML_TAG" },
        "infoUrl": { "accessor": "guid::text", "accessorType": "XML_TAG" },
        
        // FIX 1: Map the enclosure URL to torrentDownloadUrl
        "torrentDownloadUrl": { 
          "accessor": "enclosure::attr(url)", 
          "accessorType": "XML_TAG" 
        },
        
        // FIX 2: Hash is extracted from the nyaa:infoHash tag
        "hash": { 
          "accessor": "nyaa\\:infoHash::text", 
          "accessorType": "XML_TAG" 
        },
        
        // --- Core Statistics (nyaa: tags) ---
        "size_raw": { 
          "accessor": "nyaa\\:size::text", 
          "accessorType": "XML_TAG", 
          "conversionType": "HUMAN_SIZE_TO_BYTES" 
        },
        "seeds": { 
          "accessor": "nyaa\\:seeders::text", 
          "accessorType": "XML_TAG", 
          "conversionType": "INT" 
        },
        "peers": { 
          "accessor": "nyaa\\:leechers::text", 
          "accessorType": "XML_TAG", 
          "conversionType": "INT" 
        },
        
        // Date field
        "publishDate": { "accessor": "pubDate::text", "accessorType": "XML_TAG", "conversionType": "DATE_STRING" }
      },

      "postProcessors": [
        // CRITICAL FIX: Re-enable post-processor to construct the magnet link 
        {
          "processorType": "FUNCTION_CALL",
          "functionName": "BUILD_MAGNET_FROM_HASH",
          "sourceKey": "hash", // Use the extracted hash
          "targetKey": "magnetUrl", // Populate the magnet URL field
          "extraSourceKey": "title"
        },
        {
          "processorType": "FUNCTION_CALL",
          "functionName": "HUMAN_SIZE_TO_BYTES",
          "sourceKey": "size_raw",
          "targetKey": "size"
        }
      ],

      "finalMapping": {
        "title": "{title}",
        "magnetUrl": "{magnetUrl}", // Mapped by Post-Processor
        "hash": "{hash}",
        "size": "{size}",
        "seeds": "{seeds}",
        "peers": "{peers}",
        "infoUrl": "{infoUrl}",
        "publishDate": "{publishDate}",
        "torrentDownloadUrl": "{torrentDownloadUrl}" // Mapped directly from enclosure
      }
    }
  ]
}
