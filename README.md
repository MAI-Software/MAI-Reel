# MAI-Reel

Editor web de reels rápido y automático, optimizado para móvil y escritorio. Importas fotos o vídeos, la app monta el reel vertical (cortes, zooms, transiciones y textos), le da un **índice de viralidad de 1 a 100** con el desglose de cómo lo ha calculado, y te dice qué cambiar.

Todo el procesamiento ocurre en el navegador: ningún archivo se sube a ningún servidor.

## Tres modos

| Modo | Para qué | Qué hace |
|---|---|---|
| **Viralizar** | Un vídeo ya montado (CapCut y similares) | Decodifica su audio, detecta voz, golpes y sujeto, y añade movimiento de cámara, tambaleo al ritmo y **zoom dramático sobre la voz**. Los subtítulos que pegues se colocan sobre las frases habladas, no sobre los silencios. Nunca tapa lo que ya trae el vídeo. |
| **Construcción** | Fotos y clips sueltos | El editor completo: plantillas, efectos, transiciones, colores, textos y score. **Cada versión sale distinta** — botón `Otra versión`. |
| **Multi** | Un vídeo largo (podcast, directo, YouTube) | Analiza toda la pista, puntúa ventanas de 15/30/45/60 s por densidad de voz, energía y contraste dinámico, ajusta los cortes a los silencios y propone los mejores momentos para recortar. |

## Variación

El montaje ya no es determinista. Cada generación usa una semilla: efectos, transiciones, duraciones de plano y look salen de un sorteo acotado por las mediciones, y la semilla se muestra (`#A3F2K`) para poder distinguir versiones. `Otra versión` tira una semilla nueva; el director automático prueba además dos packs de estilo al azar cada vez.

## Vista

Pestañas (una sección a la vez, sin scroll de página) o **Todo en una pantalla** desde el botón de la cabecera: los cuatro paneles apilados con la previsualización fija arriba. La elección se guarda.

## Qué hace

- **Importación**: imágenes (JPG/PNG/WebP) y vídeo (MP4/MOV/WebM) por selector o arrastrando.
- **Montaje automático (director)**: mide el material (luz, contraste, nitidez, color, movimiento) y la música (BPM y golpes), decide plantilla, duración, color y tipografía, genera tres versiones distintas, las puntúa con la misma rúbrica pública y se queda con la mejor. Explica en pantalla por qué eligió cada cosa.
- **Estilos rápidos**: 12 packs de un toque (Viral, Vlog, Cine, Retro VHS, Neón, Ensueño, Deporte, Lujo, Documental, Karaoke, Fresco, Titular) que fijan ritmo, color, fuente, estilo de texto y animación a la vez.
- **Color por plano**: 9 looks (vívido, cálido, frío, blanco y negro, cine, VHS, ensueño, noche) con viñeta automática en los cinematográficos.
- **Texto por escena**: cada plano tiene su botón para añadir un texto que dura exactamente ese plano.
- **Modo entretenimiento**: para vídeos que ya vienen montados de CapCut con sus subtítulos incrustados. No añade textos ni cortes: decodifica el audio del propio vídeo, detecta golpes y volumen, localiza al sujeto por tono de piel y aplica un movimiento de cámara sutil —tambaleo al ritmo, micro-zoom en los golpes, acercamiento hacia la cara— con tope de zoom y desplazamiento limitados para que los subtítulos incrustados nunca salgan del encuadre.
- **Montaje automático**: tres plantillas de ritmo — `Punch` (cortes rápidos), `Flow` (medio), `Story` (narrativo). Reparte duraciones, alterna efectos Ken Burns (zoom in/out, paneos) y transiciones (corte, fundido, zoom, slide). Con pocas fotos, `Punch` recicla el material para mantener la cadencia; `Flow` y `Story` alargan cada plano.
- **Textos**: gancho inicial y llamada a la acción final, con contorno legible y respeto de las zonas seguras del formato.
- **Subtítulos automáticos**: pegas el guion y se reparte en bloques cronometrados (~34 caracteres) repartidos por la duración del reel, entre el gancho y el CTA.
- **Tipografías**: Anton, Bebas Neue, Montserrat, Poppins, Archivo Black y Atkinson Hyperlegible, con corrección óptica de tamaño por familia.
- **Estilos de texto**: 16 presets (Outline, Box, Pop, Neon, Bar, Clean, Shadow, Sticker, Mint, Cyber, Alert, Gold, Ghost, Ocean, Contrast, Lemon) con relleno, contorno, fondo, glow, sombra dura, mayúsculas y tracking.
- **Edición por bloques**: cada plano se retoca por separado (efecto, transición de entrada, duración, punto de inicio del vídeo, reordenar, eliminar) y cada texto también (contenido, fuente, estilo, posición, tamaño, entrada y salida).
- **Material acumulable**: puedes añadir más fotos o vídeos en cualquier momento y se anexan al final sin perder las ediciones manuales. `Regenerar montaje` sí rehace todo desde cero.
- **Formatos**: 9:16 (1080×1920), 4:5 y 1:1.
- **Audio con sincronía**: importas una pista, la app la decodifica, dibuja la onda, detecta BPM y rejilla de golpes (flujo de energía + histograma de intervalos), y eliges el fragmento exacto con un deslizador. Con `Ajustar los cortes a la música` cada corte cae sobre un golpe.
- **Duración**: mínimo 8 s, atajos de 8/12/15/20 s y control manual hasta 60 s. La duración del reel es también la longitud del fragmento de audio.
- **Efectos de plano**: zoom in/out, paneos en las cuatro direcciones, punch (golpe de zoom en el corte), vibración, giro suave, desenfoque de entrada y deriva diagonal.
- **Transiciones**: corte, fundido, zoom, deslizar, latigazo con desenfoque de movimiento, flash, empuje vertical y barrido circular.
- **Animación de textos**: fundido, pop, subida, rebote, máquina de escribir y karaoke (las palabras ya dichas se colorean).
- **Exportación**: grabación del canvas en tiempo real (`MediaRecorder`), MP4 si el navegador lo soporta, si no WebM.
- **Cinco idiomas** — español, inglés, francés, alemán e italiano — con selector desplegable en la cabecera. Se traduce toda la interfaz, incluidos los consejos del score, las mediciones del desglose y el registro de decisiones del director automático. La primera visita usa el idioma del navegador y la elección queda guardada.

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

## Interfaz

- **Sin scroll de página**: la app ocupa exactamente el alto de la ventana (`100dvh`). Cabecera, columnas, pie y barra de pestañas son bandas fijas; solo hacen scroll las listas que lo necesitan (edición, bloques, score), cada una dentro de su panel.
- **Header** con marca, chip de score en vivo (toca para saltar al desglose) y cambio de idioma.
- **Preview siempre visible**: en escritorio ocupa la columna central completa; en móvil queda fijo arriba y se reduce automáticamente al entrar en Edición o Bloques para dejar sitio a los controles.
- **Barra de tiempo con marcas** de cada corte, atajos de teclado (espacio = play/pausa, flechas = ±0,2 s) y salto directo desde cada bloque.
- **Score automático**: se recalcula solo 1,4 s después de cada edición; el chip avisa cuando está pendiente.
- **Divulgación progresiva**: guion/subtítulos y audio viven en grupos plegables, así los controles esenciales caben sin desplazarse.
- **Estados**: onboarding de 3 pasos en el visor vacío, barra de progreso al importar, porcentaje real durante la exportación y avisos en `aria-live`.
- **Navegación**: pestañas en móvil con contadores, flechas del teclado y `#hash` en la URL para compartir sección; tres columnas en escritorio.
- **Rendimiento**: la previsualización se renderiza al 45-60 % de la resolución final y sube a 1080×1920 solo al exportar.
- Objetivos táctiles ≥44 px, foco visible, `prefers-reduced-motion` respetado y contraste verificado en oscuro.

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
- La detección de ritmo funciona con música de pulso marcado; con audio hablado o ambiental puede no encontrar rejilla.
- El análisis de imagen no detecta caras ni objetos; mide luz, contraste, nitidez, color y movimiento.

## Créditos

Hecho por [MAI Softwares](https://mai-softwares.com) — la web matriz enlazada desde el pie de la app.

## Licencia

MIT — MAI Softwares. Software y web gratuitos, sin cuenta, sin límites de uso y sin subida de archivos.
