#!/usr/bin/env bash
# Dựng môi trường dev trên một máy mới. Chạy lại nhiều lần được (idempotent).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> pnpm install"
pnpm install

# Secret local sinh mới trên mỗi máy, KHÔNG chuyển tay giữa các máy.
# Hệ quả duy nhất: session bot của máy cũ không dùng lại được ở máy mới — nhập lại key là xong.
if [ ! -f backend/.dev.vars ]; then
  echo "==> sinh backend/.dev.vars"
  gen() { node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'; }
  cat > backend/.dev.vars <<EOF
SESSION_SECRET="$(gen)"
BOT_SECRET="$(gen)"
ADMIN_PASSWORD="dev-admin"
ADMIN_AUTH_MODE="password"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
EOF
  echo "    BOT_SECRET local:"
  grep BOT_SECRET backend/.dev.vars
else
  echo "==> backend/.dev.vars đã có, giữ nguyên"
fi

# Migration không theo git ở lần khởi tạo đầu — sinh từ schema.ts.
if [ -z "$(ls -A backend/drizzle/*.sql 2>/dev/null)" ]; then
  echo "==> sinh migration đầu tiên"
  pnpm --filter backend exec drizzle-kit generate --name init
fi

echo "==> dựng D1 local"
pnpm --filter backend exec wrangler d1 migrations apply web-assistant-db --local

echo
echo "Xong. 'pnpm dev' để chạy (worker + SPA cùng ở :8787)."
