#!/bin/bash
# ==============================================================================
# KidStream - Mac Mini Setup & Auto-Start Script
# ==============================================================================

echo "===================================================="
echo "🎈 Setting up KidStream on macOS"
echo "===================================================="

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "👉 Please install Node.js:"
    echo "   Option A: If Homebrew is installed, run: brew install node"
    echo "   Option B: Download the macOS pkg from: https://nodejs.org/"
    echo "   Option C (Old Mac OS): Install NVM: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Found Node.js: $NODE_VERSION"

# Ensure we are in the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Ensure videos folder exists
mkdir -p videos

echo ""
echo "===================================================="
echo "🚀 Choose how you want to run KidStream:"
echo "1) Run in foreground now (test mode)"
echo "2) Install as background service (auto-starts on Mac boot)"
echo "3) Uninstall background service"
echo "===================================================="
read -p "Enter choice [1-3]: " choice

PLIST_PATH="$HOME/Library/LaunchAgents/com.kidstream.server.plist"
NODE_PATH=$(which node)

case $choice in
    1)
        echo "Starting KidStream server..."
        node server.js
        ;;
    2)
        echo "Creating macOS launchd service at: $PLIST_PATH"
        mkdir -p "$HOME/Library/LaunchAgents"

        cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kidstream.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$DIR/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DIR/kidstream.log</string>
    <key>StandardErrorPath</key>
    <string>$DIR/kidstream-error.log</string>
</dict>
</plist>
EOF

        # Unload if already loaded, then load
        launchctl unload "$PLIST_PATH" 2>/dev/null
        launchctl load "$PLIST_PATH"

        echo "✅ KidStream service installed and started!"
        echo "   - It will automatically launch whenever this Mac turns on."
        echo "   - View logs at: $DIR/kidstream.log"
        echo "   - Open in browser: http://localhost:3000"
        ;;
    3)
        if [ -f "$PLIST_PATH" ]; then
            launchctl unload "$PLIST_PATH" 2>/dev/null
            rm "$PLIST_PATH"
            echo "✅ KidStream service uninstalled."
        else
            echo "Service was not installed."
        fi
        ;;
    *)
        echo "Invalid choice. Exiting."
        ;;
esac
