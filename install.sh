#!/bin/bash
# Kiyomi Project Professional Linux Installer (RC.2)

# Pointing to your NEW Cloudflare domain
DOWNLOAD_URL="https://kiyomi-project.pages.dev/download"
INSTALL_DIR="$HOME/Applications"
DESKTOP_DIR="$HOME/.local/share/applications"

echo "🌸 Starting the Kiyomi Project Installation..."

# 1. Create directory
mkdir -p "$INSTALL_DIR"

# 2. Download the AppImage via Cloudflare
echo "📥 Downloading latest release (v1.0.0-rc.2)..."
curl -L -o "$INSTALL_DIR/Kiyomi.AppImage" "$DOWNLOAD_URL"
chmod +x "$INSTALL_DIR/Kiyomi.AppImage"

# 3. Extract Icon
echo "🖼️  Setting up application icon..."
cd "$INSTALL_DIR"
./Kiyomi.AppImage --appimage-extract icon.png > /dev/null 2>&1
mv squashfs-root/icon.png ./kiyomi-icon.png
rm -rf squashfs-root

# 4. Create Desktop Entry
echo "📝 Registering with system menu..."
cat <<EOF > "$DESKTOP_DIR/kiyomi.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=Kiyomi
GenericName=Media Streamer
Comment=High-performance torrent streaming and media management
Exec=$INSTALL_DIR/Kiyomi.AppImage
Icon=$INSTALL_DIR/kiyomi-icon.png
Terminal=false
Categories=Video;AudioVideo;Player;
Keywords=Torrent;Stream;Anime;P2P;MPV;
StartupWMClass=kiyomi_flet
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null

echo "---"
echo "✅ Installation Complete!"
echo "🚀 You can now find 'Kiyomi' in your application menu."
