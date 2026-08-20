# MAI-Reel

Editor web de reels rápido y automático, optimizado para móvil y escritorio. Importas fotos o vídeos, la app monta el reel vertical (cortes, zooms, transiciones y textos), le da un **índice de viralidad de 1 a 100** con el desglose de cómo lo ha calculado, y te dice qué cambiar.

Todo el procesamiento ocurre en el navegador: ningún archivo se sube a ningún servidor.

## Qué hace

- **Importación**: imágenes (JPG/PNG/WebP) y vídeo (MP4/MOV/WebM) por selector o arrastrando.
- **Montaje automático**: tres plantillas de ritmo — `Punch` (cortes rápidos), `Flow` (medio), `Story` (narrativo). Reparte duraciones, alterna efectos Ken Burns (zoom in/out, paneos) y transiciones (corte, fundido, zoom, slide). Con pocas fotos, `Punch` recicla el material para mantener la cadencia; `Flow` y `Story` alargan cada plano.
- **Textos**: gancho inicial y llamada a la acción final, con contorno legible y respeto de las zonas seguras del formato.
- **Formatos**: 9:16 (1080×1920), 4:5 y 1:1.
- **Audio**: pista propia opcional (se mezcla en la exportación).
- **Exportación**: grabación del canvas en tiempo real (`MediaRecorder`), MP4 si el navegador lo soporta, si no WebM.
- **Bilingüe** ES / EN.

## Cómo se calcula el índice de viralidad

No es una predicción mágica ni un modelo entrenado: es una **rúbrica transparente y auditable**. La app mide propiedades reales del reel (muestrea fotogramas a 96×96 y analiza la estructura de la línea de tiempo) y reparte 100 puntos entre siete factores. Cada factor muestra en pantalla la medición que lo justifica.

| Factor | Peso | Qué mide |
|---|---|---|
| Gancho (0-3 s) | 20 | Texto-gancho presente y breve, duración del primer plano, contraste y detalle del primer fotograma |
| Duración | 15 | Óptimo entre 7 y 21 s; penaliza por debajo de 3 s y por encima de 60 s |
| Ritmo y cortes | 15 | Duración media de plano (óptimo 0,8-2,6 s) y movimiento medio entre fotogramas |
| Formato vertical | 10 | 9:16 puntúa completo; penaliza textos fuera de la zona segura |
| Texto en pantalla | 15 | Número de textos, tamaño mínimo legible, tiempo en pantalla y cobertura sobre la duración total |
| Calidad de imagen | 15 | Luminancia media, contraste (desviación típica), nitidez (energía de gradiente) y colorido (Hasler-Süsstrunk) |
| Cierre y bucle | 10 | Diferencia entre primer y último fotograma (bucle limpio) y presencia de CTA |

Cada punto perdido genera un consejo concreto, ordenado por puntos perdidos y enlazado a la documentación oficial de las plataformas:

- [Instagram Creators (Meta)](https://creators.instagram.com/)
- [Meta Business Help Center](https://www.facebook.com/business/help)
- [TikTok Creative Center](https://ads.tiktok.com/business/creativecenter/)
- [YouTube Help](https://support.google.com/youtube)
- [W3C WCAG 2.1 — Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

## Stack

Vite + TypeScript, sin framework ni dependencias en runtime. Canvas 2D para el render, `MediaRecorder` para exportar, Web Audio para mezclar audio.

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # typecheck + build en dist/
npm run preview
```

## Despliegue (Cloudflare Pages)

Conectar el repositorio y usar:

- Build command: `npm run build`
- Output directory: `dist`

## Limitaciones actuales

- La exportación graba en tiempo real: un reel de 15 s tarda 15 s en generarse.
- Un vídeo importado se usa como un único plano continuo (sin cortes internos automáticos).
- El análisis de imagen no detecta caras ni objetos; mide luz, contraste, nitidez, color y movimiento.

## Licencia

MIT — MAI Softwares.
