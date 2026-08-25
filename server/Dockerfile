FROM python:3.12-slim

# ffmpeg lets yt-dlp merge and convert audio; curl_cffi gives it browser impersonation,
# which is what gets past TikTok and Instagram blocking datacenter IPs.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "yt-dlp[default,curl-cffi]"

WORKDIR /app
COPY app.py .

ENV PORT=8787 ALLOW_ORIGIN=* MAX_DURATION=3600 RATE_PER_MIN=20
EXPOSE 8787
CMD ["python", "app.py"]
