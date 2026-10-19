#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-100}

# Создаем группу, если не существует
if ! getent group "$PGID" >/dev/null 2>&1; then
    groupadd -g "$PGID" appgroup
fi
GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)

# Создаем пользователя, если не существует
if ! id -u "$PUID" >/dev/null 2>&1; then
    useradd -u "$PUID" -g "$GROUP_NAME" -d /app -s /bin/sh appuser
fi
USER_NAME=$(id -un "$PUID" 2>/dev/null || echo "appuser")

mkdir -p /downloads /config /app/bin
[ ! -e /app/bin/ffmpeg ] && [ -x /usr/bin/ffmpeg ] && ln -sf /usr/bin/ffmpeg /app/bin/ffmpeg || true
[ ! -e /app/bin/ffprobe ] && [ -x /usr/bin/ffprobe ] && ln -sf /usr/bin/ffprobe /app/bin/ffprobe || true
chown -R "$PUID:$PGID" /app /config /downloads 2>/dev/null || true

# Запуск приложения от имени пользователя с нужными PUID:PGID
exec gosu "$PUID:$PGID" "$@"
