/**
 * Generates the static landing pages, robots.txt and sitemap.xml into dist/ after the Vite
 * build. The app itself is a single page behind a hash router, which search engines cannot
 * split into topics, so each tool gets a real URL with its own title, copy and links.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SITE = 'https://mai-reel.pages.dev';
const PARENT = 'https://mai-softwares.com';

const TOOLS = [
  {
    section: 'transcribe',
    es: {
      slug: 'transcribir',
      title: 'Transcribir un vídeo a texto gratis, sin subir nada',
      description:
        'Saca el texto de cualquier vídeo o audio en tu propio navegador: subtítulos con tiempos reales, .SRT y .TXT. Sin cuenta, sin marca de agua y sin enviar el archivo a ningún servidor.',
      h1: 'Transcribe un vídeo a texto en tu navegador',
      lead:
        'Arrastra un vídeo o un audio y MAI-Reel escribe lo que se dice, con la marca de tiempo de cada bloque. El modelo de voz se descarga una vez y trabaja dentro de tu dispositivo: el archivo nunca sale de él.',
      bullets: [
        'Subtítulos con tiempos reales, palabra por palabra cuando el audio lo permite.',
        'Descarga en .SRT para YouTube, TikTok o Premiere, o en .TXT para leerlo.',
        'Español, inglés, francés, alemán, italiano y detección automática.',
      ],
      steps: ['Importa el vídeo o pega un enlace.', 'Pulsa Transcribir y espera al modelo.', 'Copia el texto o descarga el .SRT.'],
    },
    en: {
      slug: 'transcribe',
      title: 'Transcribe a video to text for free, without uploading it',
      description:
        'Get the text out of any video or audio inside your own browser: captions with real timings, .SRT and .TXT. No account, no watermark, and the file never leaves your device.',
      h1: 'Transcribe a video to text in your browser',
      lead:
        'Drop a video or an audio file and MAI-Reel writes down what is said, with a timestamp on every block. The speech model downloads once and runs on your device: the file is never uploaded.',
      bullets: [
        'Captions with real timings, word by word when the audio allows it.',
        'Download .SRT for YouTube, TikTok or Premiere, or .TXT to read it.',
        'Spanish, English, French, German, Italian and automatic detection.',
      ],
      steps: ['Import the video or paste a link.', 'Press Transcribe and wait for the model.', 'Copy the text or download the .SRT.'],
    },
  },
  {
    section: 'build',
    es: {
      slug: 'crear-reel',
      title: 'Crear un reel automático desde tus fotos y vídeos',
      description:
        'Monta un reel vertical en segundos: el editor corta al ritmo, elige efectos y color según tu material, pone subtítulos y te da una nota de viralidad con motivos.',
      h1: 'Crea un reel automático con tus fotos y vídeos',
      lead:
        'Importa lo que tengas y el montador decide duración, cortes, efectos y color midiendo tu propio material. Un vídeo largo se parte en varios planos y las pausas se van solas.',
      bullets: [
        'Corta al ritmo de la música o sobre la voz, sin dejar silencios muertos.',
        'Efectos, transiciones y color elegidos según lo que hay en cada plano.',
        'Nota de viralidad 1-100 con el desglose de los siete factores medidos.',
      ],
      steps: ['Importa fotos o vídeos.', 'Pulsa Montaje automático.', 'Ajusta lo que quieras y exporta.'],
    },
    en: {
      slug: 'create-reel',
      title: 'Create an automatic reel from your photos and videos',
      description:
        'Build a vertical reel in seconds: the editor cuts to the beat, picks effects and colour from your own footage, adds captions and scores the result out of 100.',
      h1: 'Create an automatic reel from your photos and videos',
      lead:
        'Import what you have and the editor decides length, cuts, effects and colour by measuring your footage. A long video is split into several shots and the pauses are dropped.',
      bullets: [
        'Cuts on the beat of the music, or on the voice, with no dead air left in.',
        'Effects, transitions and colour chosen from what is in each shot.',
        'A 1-100 score with the breakdown of the seven measured factors.',
      ],
      steps: ['Import photos or videos.', 'Press Automatic edit.', 'Tweak anything and export.'],
    },
  },
  {
    section: 'boost',
    es: {
      slug: 'mejorar-video',
      title: 'Mejorar un vídeo ya editado con movimiento de cámara',
      description:
        'Modo entretenimiento: añade temblor de cámara al ritmo, zooms sobre la voz y micromovimientos a un vídeo que ya tiene sus subtítulos, sin taparlos ni deformar caras.',
      h1: 'Dale movimiento a un vídeo que ya está montado',
      lead:
        'Pensado para lo que sale de CapCut: el vídeo se queda como está y encima se añade una cámara que responde a su propio audio. Los subtítulos incrustados y las caras se respetan.',
      bullets: [
        'Temblor y empujes al ritmo de la música y de los acentos de la voz.',
        'Zoom dramático sobre quien habla, con topes para no cortar la cara.',
        'Protección de subtítulos: la cámara nunca se los come.',
      ],
      steps: ['Importa el vídeo montado.', 'Elige la intensidad.', 'Exporta el resultado.'],
    },
    en: {
      slug: 'boost-video',
      title: 'Boost a finished video with camera movement',
      description:
        'Entertainment mode: adds camera shake on the beat, push-ins on the voice and micro moves to a video that already has its captions, without covering them or warping faces.',
      h1: 'Add movement to a video that is already edited',
      lead:
        'Made for what comes out of CapCut: the video stays as it is and a camera that reacts to its own audio is added on top. Burned-in captions and faces are respected.',
      bullets: [
        'Shake and push-ins on the beat and on the accents of the voice.',
        'A dramatic zoom on whoever is speaking, capped so the face stays in frame.',
        'Caption protection: the camera never eats them.',
      ],
      steps: ['Import the finished video.', 'Pick the intensity.', 'Export the result.'],
    },
  },
  {
    section: 'multi',
    es: {
      slug: 'cortar-video-largo',
      title: 'Sacar los mejores momentos de un vídeo largo',
      description:
        'Sube un directo, un podcast o una charla y MAI-Reel propone los fragmentos más clipables, ordenados por una puntuación que puedes auditar.',
      h1: 'Saca clips de un vídeo largo',
      lead:
        'El buscador mide densidad de habla, energía, cambios de intensidad y golpes de voz, y ajusta el principio y el final a los silencios para que ningún corte parta una palabra.',
      bullets: [
        'Varios candidatos ordenados por puntuación, con lo que se dice en cada uno.',
        'Los bordes se pegan al silencio más cercano, no al segundo redondo.',
        'Con transcripción, el texto pesa un tercio de la decisión.',
      ],
      steps: ['Importa el vídeo largo.', 'Elige la duración del clip.', 'Revisa los momentos y exporta.'],
    },
    en: {
      slug: 'clip-long-video',
      title: 'Pull the best moments out of a long video',
      description:
        'Drop a stream, a podcast or a talk and MAI-Reel proposes the most clippable moments, ranked by a score you can audit.',
      h1: 'Pull clips out of a long video',
      lead:
        'The finder measures speech density, loudness, changes in intensity and vocal accents, then snaps the in and out points to nearby silences so a cut never splits a word.',
      bullets: [
        'Several candidates ranked by score, each showing what is said inside it.',
        'Edges snap to the closest silence rather than to a round second.',
        'With a transcript, the words carry a third of the decision.',
      ],
      steps: ['Import the long video.', 'Choose the clip length.', 'Review the moments and export.'],
    },
  },
];

const HOME = {
  es: { slug: '', title: 'MAI-Reel — Editor de reels automático y transcripción gratis' },
  en: { slug: 'en', title: 'MAI-Reel — Free automatic reel editor and transcription' },
};

const UI = {
  es: {
    open: 'Abrir la herramienta',
    how: 'Cómo funciona',
    free: 'Gratis, sin cuenta y sin marca de agua. Todo el procesamiento ocurre en tu navegador: ningún archivo se sube a ningún servidor.',
    other: 'Otras herramientas',
    back: 'Inicio',
    parent: 'Un software de MAI Softwares',
  },
  en: {
    open: 'Open the tool',
    how: 'How it works',
    free: 'Free, no account, no watermark. Everything runs in your browser: no file is uploaded to any server.',
    other: 'Other tools',
    back: 'Home',
    parent: 'Software by MAI Softwares',
  },
};

const css = `
:root{color-scheme:dark;--bg:#0f172a;--surface:#151b31;--fg:#fff;--dim:#b8c0d9;--faint:#8b93ad;--primary:#ec4899;--border:rgba(255,255,255,.08)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 'Atkinson Hyperlegible',system-ui,-apple-system,'Segoe UI',sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:32px 20px 56px}
header{display:flex;align-items:center;gap:10px;margin-bottom:36px}
header strong{font-size:18px}
header span{color:var(--primary)}
h1{font-size:clamp(26px,5vw,38px);line-height:1.15;margin:0 0 14px}
p.lead{color:var(--dim);font-size:17px;margin:0 0 24px}
ul{padding-left:20px;margin:0 0 26px}
li{margin-bottom:8px;color:var(--dim)}
h2{font-size:20px;margin:34px 0 12px}
ol{padding-left:20px;color:var(--dim)}
a.cta{display:inline-block;margin:26px 0 8px;padding:14px 22px;border-radius:12px;background:var(--primary);color:#fff;font-weight:700;text-decoration:none}
a.cta:hover{background:#db2777}
.note{color:var(--faint);font-size:14px}
nav.other{margin-top:40px;padding-top:20px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:10px}
nav.other a{color:var(--dim);text-decoration:none;border:1px solid var(--border);border-radius:10px;padding:8px 12px;background:var(--surface)}
nav.other a:hover{border-color:var(--primary);color:#fff}
footer{margin-top:36px;color:var(--faint);font-size:13px}
footer a{color:var(--dim)}
`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page({ lang, slug, title, description, h1, lead, bullets, steps, section, alternates }) {
  const url = `${SITE}/${slug ? `${slug}/` : ''}`;
  const ui = UI[lang];
  const others = TOOLS.filter((t) => t[lang].slug !== slug).map(
    (t) => `<a href="/${t[lang].slug}/">${esc(t[lang].h1.split(':')[0])}</a>`,
  );
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MAI-Reel',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url,
    description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@type': 'Organization', name: 'MAI Softwares', url: PARENT },
  };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
${alternates.map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${a.url}" />`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${SITE}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="MAI-Reel" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}/icons/icon-512.png" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${SITE}/icons/icon-512.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta name="theme-color" content="#0F172A" />
<style>${css}</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<div class="wrap">
  <header><strong>MAI<span>-Reel</span></strong></header>
  <h1>${esc(h1)}</h1>
  <p class="lead">${esc(lead)}</p>
  <ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <a class="cta" href="/#${section}">${ui.open}</a>
  <p class="note">${ui.free}</p>
  <h2>${ui.how}</h2>
  <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
  <nav class="other"><a href="/">${ui.back}</a>${others.join('')}</nav>
  <footer><a href="${PARENT}" rel="noopener">${ui.parent}</a></footer>
</div>
</body>
</html>
`;
}

const urls = [`${SITE}/`];

for (const tool of TOOLS) {
  for (const lang of ['es', 'en']) {
    const copy = tool[lang];
    const alternates = ['es', 'en'].map((l) => ({ lang: l, url: `${SITE}/${tool[l].slug}/` }));
    const dir = join(dist, copy.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'index.html'),
      page({ lang, ...copy, section: tool.section, alternates }),
      'utf8',
    );
    urls.push(`${SITE}/${copy.slug}/`);
  }
}

await writeFile(
  join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
  'utf8',
);

const today = new Date().toISOString().slice(0, 10);
await writeFile(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
  'utf8',
);

console.log(`landing pages: ${urls.length - 1}, sitemap + robots written`);
void HOME;
