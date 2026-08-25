# MAI-Reel · servidor de extracción

Convierte un enlace de YouTube, TikTok, Instagram, Vimeo, Twitch, X o Facebook en
subtítulos o en un archivo de audio. Es la pieza que los navegadores no pueden hacer:
esas plataformas sirven el vídeo desde dominios sin CORS y detrás de tokens que cambian
cada semana. Aquí `yt-dlp` se encarga de eso, igual que en las webs de transcripción.

## Qué expone

| Ruta | Devuelve |
|---|---|
| `GET /health` | `{"ok":true,"ytdlp":"…"}` |
| `GET /transcript?url=…&lang=es` | `{"source":"captions","title":…,"lang":…,"cues":[{start,end,text}]}` o `404 {"error":"nocaptions"}` |
| `GET /audio?url=…` | el audio del vídeo, para transcribirlo con Whisper en el navegador |

Límites por variables de entorno: `MAX_DURATION` (3600 s), `RATE_PER_MIN` (20 peticiones
por IP y minuto), `ALLOW_ORIGIN` (pon el dominio de tu web en producción) y `PORT`.
Solo acepta enlaces de las plataformas de la lista blanca.

## Probarlo en local

```bash
pip install "yt-dlp[default,curl-cffi]"
python app.py
```

Queda en `http://localhost:8787`. En la web, sección **Transcribir → Servidor de
extracción**, pega esa dirección y pulsa Guardar.

## Desplegarlo

**Fly.io** (se apaga solo cuando no se usa, así que sale gratis o casi):

```bash
fly launch --no-deploy --copy-config --name mai-reel-extractor
fly deploy
```

**Docker en cualquier VPS:**

```bash
docker build -t mai-reel-extractor .
docker run -d -p 8787:8787 -e ALLOW_ORIGIN=https://mai-reel.pages.dev mai-reel-extractor
```

Render, Railway o Koyeb también valen: apuntan al `Dockerfile` y exponen el puerto 8787.

## Mantenimiento

`yt-dlp` se actualiza a menudo porque las plataformas cambian sus defensas. Reconstruye la
imagen de vez en cuando (`docker build --no-cache`) o añade `pip install -U yt-dlp` al
arranque si prefieres que se actualice solo.

## Aviso

Descargar contenido de estas plataformas puede ir contra sus términos de uso. Este
servicio es para material propio o con permiso; la responsabilidad de su uso es de quien
lo despliega.
