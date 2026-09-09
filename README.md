# MAI-Reel

Editor web de reels rápido y automático, optimizado para móvil y escritorio. Importas fotos o vídeos, la app monta el reel vertical (cortes, zooms, transiciones y textos), le da un **índice de viralidad de 1 a 100** con el desglose de cómo lo ha calculado, y te dice qué cambiar.

Todo el procesamiento ocurre en el navegador: ningún archivo se sube a ningún servidor.

## Menú y herramientas

La app abre en un **menú** con las cuatro herramientas. Al elegir una se entra en su pantalla, que monta solo sus paneles, y desde la barra superior se vuelve al menú. Nada más entrar hay un botón **Probar con un ejemplo** que genera material en el propio navegador y monta un reel completo, sin subir nada.

| Sección | Para qué | Qué ve el usuario |
|---|---|---|
| **Transcribir** | "He visto un reel y quiero su texto" | Importar o pegar enlace + botón Transcribir. El vídeo o audio se **reproduce ahí mismo** con controles nativos, y la transcripción va resaltando la frase que suena; al pulsar una línea salta a ese momento. Se copia, se baja en `.SRT` o `.TXT`, o se aplica como subtítulos. |
| **Viralizar** | Un vídeo ya montado (CapCut y similares) | Intensidad, zoom dramático con la voz, tambaleo, protección de subtítulos incrustados. No añade textos ni cortes. |
| **Crear** | Fotos y clips sueltos | El editor completo: montaje automático, estilos rápidos, ritmo, tipografía, audio y score. Cada versión sale distinta. |
| **Recortes** | Vídeo largo (podcast, directo, YouTube) | Duración del recorte y buscador de los mejores momentos, puntuados por voz, energía, dinámica y contexto del texto. |

La sección se guarda y va en el hash (`#transcribe`, `#boost`, `#build`, `#multi`), así que se puede enlazar directamente.

## Preparar antes de montar

En **Crear** el material y su preparación son el mismo panel: importas todos los clips que quieras (varios a la vez, arrastrando o desde el selector) y cada uno aparece como una tarjeta con su miniatura, sus controles de **entrada y salida**, flechas para ordenarlo y una ✕ para dejarlo fuera. La miniatura se vuelve a sacar en el punto de entrada que elijas.

Cada tarjeta trae la **tira de fotogramas** del vídeo con dos tiradores para recortarlo mirando el material (o con las flechas del teclado), un ▶ para verlo suelto antes de montar nada, un asa para arrastrarla y cambiarla de orden, y el botón de superponer. La duración objetivo del reel está justo encima de los botones de montar.

Después hay dos caminos:

- **Hacer magia** — olvida todo lo anterior (vuelve a incluir todo y quita los recortes) y deja que el montador decida duración, cortes, efectos, color y textos.
- **Montar con mis recortes** — respeta lo que hayas decidido: un clip recortado a mano entra como un solo plano con ese trozo exacto, uno intacto se sigue troceando por voz, y lo que hayas quitado no aparece.

## Cómo corta

Un vídeo importado no es un plano continuo: se mide su propia voz y se parte en varios planos.

- Las frases se pegan hasta formar un plano; **toda pausa de más de 0,42 s es un corte**, así que el silencio no llega al montaje.
- Los planos se puntúan por energía y acentos, se queda con los mejores y los deja en el orden en que se dijeron.
- Cuando el reel sale de un solo vídeo, **abre por su mejor momento**, no por el principio.
- Sin voz utilizable, los planos se reparten por el vídeo y se prefieren los tramos con más energía.

Medido sobre un clip de 16 s que habla 2,6 s de cada 4: 4 planos en `srcIn` 0,33 / 4,38 / 8,38 / 12,38 y 12,9 s de contenido.

## Distribución

En pantalla ancha la herramienta son dos columnas: a la izquierda lo que le das (material y preparación) y sus ajustes, a la derecha lo que sale (previsualización fija, línea de tiempo, mezcla y nota). Al seleccionar un plano en la línea de tiempo se abre debajo su **inspector** con efecto, transición, color, duración y recorte de ese plano; no hay una lista con todos los planos porque la línea de tiempo ya los enseña.

## Encuadre y capas

La previsualización es una superficie de trabajo:

- **Arrastra** sobre ella para mover el plano dentro del encuadre y usa la **rueda o dos dedos** para el zoom. El inspector del plano trae el mismo zoom en número y un botón para centrarlo de nuevo.
- **Superponer**: cualquier clip importado puede ir encima del reel desde su tarjeta. Aparece como recuadro con esquinas redondeadas, se arrastra y se redimensiona igual, y va **sin sonido** para no pelearse con la mezcla. Su inspector controla tamaño, momento de entrada y duración.
- El gesto actúa sobre la capa que hay debajo del dedo: si tocas una superposición, mueves esa; si no, el plano.

## Resolución

`1080` (recomendada), `720` o `540`, en Ritmo y formato. Es la altura real del archivo exportado: a 540 el mismo reel sale en 540×960 y tarda menos en codificarse.

## Línea de tiempo

Debajo de la previsualización está el montaje entero: un bloque por plano, ancho proporcional a su duración, con su miniatura, su número, su duración y el punto del vídeo original del que sale.

- **Recortar**: arrastra el borde izquierdo (mueve la entrada dentro del vídeo y mantiene la salida) o el derecho (alarga o acorta, nunca más allá del final del material).
- **Reordenar**: arrastra el plano entero; en móvil, con las flechas del panel Bloques.
- **Situarse**: toca un plano para saltar a él, o arrastra sobre la pista para desplazarte.
- Mínimo 0,4 s por plano. Todo cambio pasa por deshacer/rehacer y se guarda con la sesión.

## Sonido

Debajo de la línea de tiempo hay una barra de mezcla siempre visible: **Añadir música** (con su nombre, su ✕ y su volumen) y **Sonido del vídeo** (botón de silencio y volumen). Los dos niveles se guardan y sobreviven a un montaje nuevo.

- El **audio del vídeo se oye y se exporta** (antes solo salía la música).
- La música **baja al 25 % bajo los planos hablados**, en la previsualización y en el archivo final.
- Todo pasa por un único grafo de Web Audio, así que lo que se escucha es lo que se exporta.

## Variación

El montaje ya no es determinista. Cada generación usa una semilla: efectos, transiciones, duraciones de plano y look salen de un sorteo acotado por las mediciones, y la semilla se muestra (`#A3F2K`) para poder distinguir versiones. `Otra versión` tira una semilla nueva; el director automático prueba además dos packs de estilo al azar cada vez.

## Vista

Pestañas (una sección a la vez, sin scroll de página) o **Todo en una pantalla** desde el botón de la cabecera: los cuatro paneles apilados con la previsualización fija arriba. La elección se guarda.

## Qué hace

- **Importación**: imágenes (JPG/PNG/WebP) y vídeo (MP4/MOV/WebM) por selector o arrastrando.
- **Banco de efectos**: 32 movimientos de cámara paramétricos — zooms (lento, punch in/out, por pasos, con rebote, espera y golpe, vértigo), paneos y travellings (4 direcciones, derivas diagonales, dolly, ascenso, caída, órbita, vaivén), rotación e inclinación, cámara en mano, vibración, impacto con decaimiento, y trabajo de foco (enfoque, desenfoque final, cambio de foco). Cada uno es una definición declarativa (rampas de zoom/paneo/rotación/desenfoque, curva de easing, espera, oscilación), no una rama de código.
- **21 transiciones**: corte, fundido, fundido a negro y a blanco, flash, destello cálido, deslizar en dos direcciones, empuje arriba/abajo, latigazo con desenfoque de movimiento, zoom de entrada y de salida, círculo, dos persianas, fundido desenfocado, giro, glitch con desgarro RGB y pixelado.
- **22 filtros de color**: vívido, contraste alto, cálido, hora dorada, atardecer, frío, teal & orange, noche, cyber, cine, blanqueado, desvaído, pastel, ensueño, VHS, blanco y negro, plata, noir, verde digital, luz alta y luz baja — con viñeta y barras cinematográficas donde corresponde.
- **Montaje automático que entiende el material**: analiza cada recurso por separado (luz, contraste, nitidez, color, densidad de bordes, temperatura, orientación, presencia y posición del sujeto, si ya lleva texto incrustado, y movimiento en vídeo) y de ahí sale la elección. Un plano con sujeto pide acercamiento; uno recargado, menos energía; uno apaisado, paneo lateral; uno con texto, solo movimientos que no lo recorten; uno oscuro no recibe desenfoques. La elección final es una tirada ponderada entre los candidatos que encajan, con reglas de no repetir efecto en tres planos ni panear dos veces hacia el mismo lado.
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

## Transcripción (voz → subtítulos)

Botón **Transcribir** dentro de “Guion y subtítulos”. Corre **Whisper base** con transformers.js **en tu propio dispositivo**: el audio no sale del navegador.

- La biblioteca se carga desde CDN y el modelo (~85 MB) se descarga la primera vez y queda en caché del navegador. Sin pulsar Transcribir no se descarga nada: el bundle de la app sigue en 144 KB.
- Usa WebGPU si el dispositivo lo tiene, y WASM si no.
- Selector de idioma (detectar automáticamente, o forzar ES/EN/FR/DE/IT).
- El resultado llega con marcas de tiempo reales; se parte en bloques de ~34 caracteres y se coloca sobre la línea de tiempo. Los marcadores tipo `[BLANK_AUDIO]` o `[MUSIC]` se descartan.
- El texto queda editable en el cuadro del guion: corriges y pulsas “Aplicar subtítulos”.
- En modo **Multi**, la transcripción alimenta el ranking: además de voz, energía y dinámica, puntúa densidad de palabras, preguntas, cifras y palabras-gancho en los cinco idiomas.

Medido con un clip de 11 s: detección de 4 frases y transcripción correcta en 4 bloques (`0.0-3.6s`, `3.6-7.2s`, `7.2-10.1s`, `10.1-11.0s`).

## Cargar un vídeo desde un enlace

Caja **“Pegar enlace de un vídeo”** en el panel de Material. Acepta enlaces **directos** a un archivo (`.mp4`, `.mov`, `.webm`, `.mp3`, `.wav`…) servidos con CORS abierto; muestra el progreso de descarga y, si el enlace es audio, lo carga como pista musical y como fuente de transcripción.

### Enlaces de YouTube, Instagram, TikTok, Vimeo, Twitch y Facebook

Se **incrustan y se reproducen dentro de la app** con el reproductor oficial de cada plataforma (Shorts, Reels y TikToks salen en vertical).

Para **transcribirlos hay dos caminos**:

**1. Con el servidor de extracción (recomendado, es lo que hace la competencia).** Pegas el enlace y pulsas *Transcribir este enlace*: el servidor trae los subtítulos que la propia plataforma ya tiene —instantáneo y con los tiempos exactos— y si el vídeo no los tiene, descarga su audio y Whisper lo transcribe en tu navegador. El servidor está en [`server/`](server/): son ~250 líneas de Python sobre `yt-dlp`, se despliega en Fly.io o cualquier Docker, y se configura una vez en *Transcribir → Servidor de extracción*.

Probado end-to-end: enlace de YouTube → **75 bloques con marcas de tiempo y el título del vídeo**, en el idioma seleccionado.

**2. Sin servidor: captura del audio de la pestaña.** Un botón. Eliges "Esta pestaña" y marcas "Compartir audio", y la app hace el resto: pone el vídeo desde el principio (controla el reproductor de YouTube por `postMessage`), muestra el progreso `0:12 / 3:34` y **para y transcribe sola cuando el vídeo termina**. Va en tiempo real, así que un reel de 30 s tarda 30 s. Solo en Chrome/Edge de escritorio; en Firefox, Safari y móvil no existe la API.

### ¿Y sin nada de esto? ¿No vale un Worker de Cloudflare?

Comprobado, no por suposición:

| Vía | Resultado |
|---|---|
| Navegador → página de YouTube | ❌ CORS: no se puede leer el HTML, así que no hay lista de subtítulos |
| Navegador → `api/timedtext` | ⚠️ 200 y **CORS permitido**, pero cuerpo **vacío** |
| Servidor (fetch simple) → `api/timedtext` | ⚠️ mismo vacío, con y sin cookies de consentimiento |
| Servidor → InnerTube (WEB/ANDROID/IOS/TVHTML5/MWEB) | ❌ `UNPLAYABLE` o 400 |
| `yt-dlp` | ✅ subtítulos reales |

El bloqueo no es de IP: es un token de sesión, y da igual desde dónde se pida. **Cloudflare Workers y Pages Functions no sirven** para esto porque ejecutan JS/WASM en un aislado V8 —`yt-dlp` es Python con extensiones C y sockets reales—, y un `fetch` desde el Worker se topa con el mismo cuerpo vacío. Lo que sí vale de Cloudflare son los **Containers**, que ejecutan imágenes Docker arbitrarias y podrían correr el `Dockerfile` de [`server/`](server/), pero requieren el plan **Workers Paid**.

Por qué hace falta un servidor para la vía 1: el navegador no puede descargar el archivo (esos dominios no dan CORS) y el reproductor va en un iframe de otro origen, así que tampoco se puede leer su audio. Lo comprobé también contra los endpoints públicos: la lista de subtítulos de YouTube se obtiene, pero el endpoint que devuelve el texto responde vacío sin un token de sesión; TikTok bloquea por IP y la página de Instagram ya no trae la URL del vídeo. `yt-dlp` es lo que resuelve todo eso, y por eso el servicio lo usa.

## PWA e app Android (APK)

La app es una **PWA instalable**: `manifest.webmanifest`, service worker con caché del shell y de los assets versionados, iconos 192/512 + maskable y metas de iOS. Se instala desde el navegador ("Añadir a pantalla de inicio") y arranca en modo standalone sin barra de navegador.

**APK sin Android SDK (la vía de las otras webs):** una vez desplegada en Cloudflare Pages, se genera el APK/AAB desde la propia PWA con [PWABuilder](https://www.pwabuilder.com) o `bubblewrap` (TWA). Pasos:

1. Desplegar (build `npm run build`, output `dist`).
2. Meter la URL en PWABuilder → *Package for stores* → Android.
3. Descargar el paquete y subir `assetlinks.json` a `/.well-known/assetlinks.json` del sitio para que el TWA arranque sin barra de navegador.

Con la app instalada como TWA, la transcripción funciona igual: usa el motor del sistema, baja el modelo la primera vez y lo cachea.

**Alternativa con Capacitor** (solo si hace falta código nativo): ya está configurado (`capacitor.config.ts`, id `com.maisoftwares.maireel`).

```bash
npm run android:add     # crea android/ (una vez)
npm run android:apk     # build web + sync + gradlew assembleDebug
```

Esta vía sí necesita JDK 17 y el Android SDK con `ANDROID_HOME`.

## Stack

Vite + TypeScript, sin framework. La única dependencia de runtime es `mp4-muxer` (~11 KB gzip, en su propio chunk y solo al exportar). Canvas 2D para el render, WebCodecs para exportar con `MediaRecorder` de respaldo, y Web Audio para toda la mezcla.

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

## Exportación

Con WebCodecs (Chrome, Edge y derivados) el reel se codifica **fuera de tiempo real** y se empaqueta en **MP4** (H.264 + AAC): no se pierden fotogramas y no hay que esperar la duración del vídeo. La banda sonora se mezcla aparte con `OfflineAudioContext`, con fundidos en los cortes y el mismo ducking de la previsualización. El multiplexor se descarga solo al exportar.

Medido: un reel de 12 s salido de un vídeo hablado se exporta en 8,7 s a 1080×1920, con audio estéreo a 48 kHz.

Sin WebCodecs se usa la vía anterior (`MediaRecorder` en tiempo real, MP4 o WebM según el navegador).

En móvil, además de la descarga aparece **Compartir**, que entrega el archivo a la hoja de compartir del sistema.

## Sesión, deshacer y plataformas

- El material y el montaje se guardan en **IndexedDB**: al recargar sigue todo ahí. Sigue sin salir nada del dispositivo.
- **Deshacer / rehacer** con los botones de la barra o con `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Plataforma** (genérica, TikTok, Reels, Shorts): cada una tapa una parte distinta del encuadre, así que cambia la zona segura, la posición del texto y el factor de formato del score.

## SEO

`npm run build` genera además ocho páginas estáticas (cuatro herramientas × ES/EN) con su propio título, texto, `canonical`, par `hreflang` y JSON-LD, más `robots.txt` y `sitemap.xml`. La app en sí sigue siendo una sola página.

## Pruebas

```bash
npm test          # vitest sobre las funciones puras (segmentación, subtítulos)
```

GitHub Actions ejecuta las pruebas y el build en cada push.

## Limitaciones actuales

- La detección de ritmo funciona con música de pulso marcado; con audio hablado o ambiental puede no encontrar rejilla.
- El análisis de imagen no detecta caras: el sujeto se localiza por tono de piel y por densidad de bordes, y con eso se reencuadra el recorte vertical.
- Los tiempos por palabra dependen de que Whisper los alinee; si no puede, los subtítulos siguen siendo por bloque.
- Sin WebCodecs la exportación vuelve a ser en tiempo real, y si la pestaña pasa a segundo plano el navegador la congela.

## Créditos

Hecho por [MAI Softwares](https://mai-softwares.com) — la web matriz enlazada desde el pie de la app.

## Licencia

MIT — MAI Softwares. Software y web gratuitos, sin cuenta, sin límites de uso y sin subida de archivos.
