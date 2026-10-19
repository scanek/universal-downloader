FROM python:3.12-slim-bookworm

# Установка ffmpeg, curl, ca-certificates, gosu
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    unzip \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Установка Deno для дешифровки сигнатур YouTube в yt-dlp
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /usr/local/bin \
    && rm /tmp/deno.zip \
    && chmod +x /usr/local/bin/deno

WORKDIR /app

# Установка Python-зависимостей
COPY requirements.txt .
# Ставим зависимости (в headless режиме pystray не используется)
RUN pip install --no-cache-dir -U pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# Создание директорий для данных и права на чтение/исполнение
RUN mkdir -p /downloads /config /app/bin && \
    ln -sf /usr/bin/ffmpeg /app/bin/ffmpeg && \
    ln -sf /usr/bin/ffprobe /app/bin/ffprobe && \
    sed -i 's/\r$//' /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh && \
    chmod -R a+rX /app

ENV DOCKER=1 \
    HOST=0.0.0.0 \
    PORT=8765 \
    DOWNLOAD_DIR=/downloads \
    CONFIG_DIR=/config \
    PYTHONUNBUFFERED=1 \
    PUID=1000 \
    PGID=100

EXPOSE 8765

VOLUME ["/downloads", "/config"]

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "app.py"]
