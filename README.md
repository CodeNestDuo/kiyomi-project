# 🌸 Kiyomi Project

A Flet-based desktop client for the Kiyomi torrent streaming project.

### 🌟 Key Features

* **Discovery:** Browse Movies and TV shows via TMDB.
* **Rich Metadata:** View details, cast, trailers, seasons, and episodes.
* **Provider System:** Search torrents using modular provider scripts.
* **YouTube Integration:** Download videos and music using `yt-dlp`.
* **Native Engine:** Stream high-quality content directly using an integrated torrent engine.

### 🐧 Installation & Setup

1. **One-Line Installer:**
```bash
curl -sL https://kiyomi-project.pages.dev/install.sh | bash

```


2. **API Configuration:**
To fetch metadata, you must provide your own TMDB API key. Create a `.env` file in your home configuration directory:
* **Path:** `~/.kiyomi/.env`
* **Content:**
```text
TMDB_API_KEY=your_api_key_here

```




> **Note:** The app will look for this file on startup to authenticate with TMDB services.