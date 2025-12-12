# 📜 Kiyomi App Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.0 - 2025-12-12

### 🎉 Overview

Welcome to the first public release of **Kiyomi**!

Kiyomi is a flexible, all-in-one media application designed to empower you to discover, manage, and instantly stream video content.

This release includes core features for **media discovery**, **torrent management**, and **direct streaming while downloading**.

---

### ⭐ Core Features

#### 🔍 Discovery & Browsing

* **Seamless Search:** Find movies, TV shows, and actors instantly using a single search bar.
* **TMDB Integration:** Easily connect your TMDB account to access personal features like remote Watchlist, Favorites, and Ratings. You can also view your TMDB Profile account page.
* **Structured Details:** Dedicated screens for Movies, TV Shows, Seasons, Episodes, and People, providing comprehensive summaries and artwork.
* **Advanced Filters:** Use dedicated filters (by year, type, genre, etc.) to discover new content tailored to your preferences.

#### 📺 Playback & Local Files

* **Powerful Universal Media Player:** Enjoy smooth, high-quality playback with broad support for most video codecs. The built-in player (based on Media3 ExoPlayer) includes rich customization options, full support for multiple **subtitle tracks**, **audio tracks**, and flexible controls.
* **In-App File Browser:** Easily browse your local storage to manually locate and play video files, regardless of where they are stored on your device.
* **Continue Watching:** The app tracks your **playback data** and allows you to **resume** any media (local file or torrent stream) exactly where you left off.

#### 🧲 Direct Streaming & Torrents

* **Integrated Torrent Client:** Kiyomi manages all your torrent downloads internally.
    * View all torrents in one place, showing live progress, speeds, and status (Downloading, Seeding, Paused, etc.).
* **Instant Streaming (Stream-While-Downloading):** Start watching videos almost immediately! Kiyomi buffers the file while it downloads, allowing for instant playback and seeking ahead in the video.
* **Flexible File Selection:** After adding a torrent (via magnet or file), easily choose exactly which files to download (e.g., only one episode or just the main movie file).
* **Reliable Resumption:** The app remembers your exact download progress, even if the app or your phone is closed unexpectedly, ensuring you never lose your spot.

#### 🗃️ Custom Lists & Organization

* **Personalized Hub:** A central hub for all your curated lists.
* **Remote & Local Tracking:** Kiyomi supports tracking your media status in two ways:
    * **TMDB Features:** When logged in, you can directly use TMDB's official **Watchlist**, **Favorites**, and **Rating** features.
    * **Local Tracking (Offline):** For users without a TMDB account, the app provides built-in **local database features** for media status tracking (Liking, Pinning/Watchlist, Local Ratings) that work fully offline.
* **Custom Offline Collections:** Create, name, and manage your own private lists (e.g., "My Anime List," "Watch Later").
* **Easy Management:** Quickly add or remove any movie or show from your collections directly from the details screen.

#### 🧩 Extensions & Custom Providers

* **Extension Store:** Browse and install community-created extensions to add new content sources and specialized search engines to Kiyomi.
* **Smart Torrent Search:** When looking for a torrent for a specific episode or movie, the app provides smart categories (like Anime, TV, Movie) to the search providers, helping them find the best quality release faster.

#### ⚙️ Settings & Customization

* **Full Control:** Comprehensive settings allow you to customize Kiyomi's look, feel, and behavior.
* **Torrent Setup:** Easily choose your default download folder, and toggle advanced settings like **sequential downloading** or **extra trackers** for faster speeds.
* **Reset Options:** Ability to reset certain settings or configurations back to sensible defaults if something feels off.

---

### 🔔 App Updates

* Kiyomi can **automatically check for new versions** (about once every 24 hours).
* A **"New Version Available"** message appears on the About screen when an update is ready.
* The app can download and display a full, detailed **changelog** for new versions, which remains available offline once downloaded.

---

### 🛠 Reliability & Performance

* Torrent progress and settings are saved regularly to reduce the chance of losing progress if the app or device is closed unexpectedly.
* Torrents and file names are cleaned up to be more readable, so downloaded folders are easier to recognize.
* Designed to recover gracefully after restarts by restoring torrents from:
    * Fast-resume data (best).
    * Saved `.torrent` files.
    * Magnet links or infohashes as a last resort.

---

### 🔮 Planned / Upcoming (Ideas & Roadmap)

These are **not guaranteed**, but are actively being explored for future versions of Kiyomi:

#### 💾 Backups & Cloud Sync

* **Periodic local backup:**
    * Automatically create backup files that include:
        * App settings (preferences, UI configuration, torrent options).
        * Local database data (collections, torrent metadata, watch state).
    * Let users export/import these backup files manually if they switch devices.
* **Optional cloud backup (Google Drive or similar):**
    * Allow linking a Google account and syncing backup files to your personal drive.
    * Restore your Kiyomi setup on a new device with a single import.

#### 📝 External List Integration & Challenges

* **TMDB Custom List Integration:**
    * Explore the ability to **import** your TMDB custom lists and mirror them into Kiyomi collections.
* **Completion tracking:**
    * Show how much of a list you’ve actually watched (e.g., “7/25 movies completed”).
    * Visual progress bars or simple percentage indicators.
* **Friendly “challenges”:**
  * Optional mini-goals like:
    * “Finish 10 movies from this list this month.”
    * “Complete Season 1 of this show in a week.”
  * Progress indicators and simple stats—not hardcore gamification, just fun motivation.

#### 🌐 Non-Torrent Media Providers (Experimental Thoughts)

* **Idea only (not committed yet):**
    * Explore support for non-torrent provider types in the future, similar in spirit to apps like **Aniyomi / Mangayomi**:
        * Direct streaming sources.
        * Other content APIs.
    * If implemented, this would likely reuse the existing extension/provider system so everything stays modular.

#### 📺 TV / Casting & Big Screen

* **Cast to TV:**
    * Add support for casting video to compatible devices (e.g., Chromecast or cast-enabled TVs), so you can keep controlling playback from your phone.
* **TV-optimised experience:**
    * Explore Android TV / Google TV support or a TV UI mode:
        * Larger, remote-friendly layouts.
        * Simple navigation for couch usage.



#### 💻 Desktop / PC Companion (Longer-Term Idea)

* **Possible separate desktop app or companion:**
    * We are exploring the development of a simple application for laptops/PCs. This could potentially be built using a streamlined language like **Python** (for ease of development and maintenance) or **Kotlin Multiplatform** for cross-platform compatibility.
    * The primary goal would be to act as a **torrent powerhouse**, capable of:
        * Managing large-scale torrent downloads locally on your PC.
        * Sharing your media library with your Kiyomi mobile app.
        * Allowing your Kiyomi Android app to remotely control or stream files managed by the PC companion.
    * **Important Note:** This is a very early, long-term idea. If pursued, it will require significant time and resources, which may temporarily take development focus away from the main mobile application.