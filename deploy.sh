#!/usr/bin/env bash
set -e

HOST="${1:-qinghuaatbc@6759.ddns.net}"
PORT="${2:-2201}"
REMOTE_DIR="/home/qinghuaatbc/home_assistant"

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./deploy.sh [user@host] [ssh-port]"
  echo ""
  echo "Deploys Home Assistant to remote server via rsync + pm2."
  echo "Requires sshpass for password auth."
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh                          # default: qinghuaatbc@6759.ddns.net:2201"
  echo "  ./deploy.sh root@192.168.1.100 22    # custom host/port"
  exit 0
fi

echo "→ Building frontend..."
cd "$(dirname "$0")/frontend" && npm run build 2>&1 | tail -3

echo "→ Building backend..."
cd "$(dirname "$0")" && npm run build:backend 2>&1

echo "→ Syncing to $HOST (port $PORT)..."
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/src' \
  --exclude 'src' \
  --exclude '.env' \
  --exclude 'config/configuration.yaml' \
  -e "ssh -p $PORT -o StrictHostKeyChecking=accept-new" \
  "$(dirname "$0")/" "$HOST:$REMOTE_DIR/"

echo "→ Restarting service..."
ssh -p "$PORT" "$HOST" "pm2 restart home-assistant && sleep 3 && curl -s http://localhost:8123/api/health"

echo "✓ Deployed successfully"
echo "  https://6759.ddns.net:8123"
