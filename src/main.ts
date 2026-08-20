import './styles.css';
import { state, assetById } from './state';
import { setLang, t, SOURCES } from './i18n';
import { icons, brandMark } from './ui/icons';
import { loadFiles, thumbnail } from './engine/media';
import { buildProject, relayout, TEMPLATES } from './engine/autoedit';
import { ReelRenderer, SIZES, totalDuration } from './engine/render';
import { Player } from './engine/player';
import { recordCanvas, downloadBlob, extensionFor, pickMime } from './engine/export';
import { analyzeMedia } from './analysis/frames';
import { scoreProject, type ScoreResult } from './analysis/score';
import type { Aspect, TemplateId } from './types';

const app = document.getElementById('app')!;

function shell(): string {
  return `
  <header class="topbar">
    <div class="brand">${brandMark}<span class="brand__name">MAI<span>-Reel</span></span></div>
    <span class="topbar__tag" data-i18n="app.tagline"></span>
    <span class="topbar__spacer"></span>
    <button class="btn btn--ghost" id="lang" aria-label="Language"><span data-i18n="lang.switch"></span></button>
  </header>

  <main class="layout">
    <section class="panel panel--media" aria-label="media">
      <div class="dropzone" id="drop">
        <h2 data-i18n="drop.title"></h2>
        <p data-i18n="drop.hint"></p>
        <button class="btn btn--primary" id="pick">${icons.image}<span data-i18n="drop.button"></span></button>
        <input type="file" id="file" accept="image/*,video/*" multiple hidden />
      </div>
      <div class="strip" id="strip"></div>
      <div class="row">
        <span class="empty-note" id="mediaCount"></span>
        <button class="btn btn--ghost" id="clear">${icons.trash}<span data-i18n="media.clear"></span></button>
      </div>
    </section>

    <section class="stage">
      <div class="viewport" id="viewport">
        <div class="viewport__empty" id="viewportEmpty" data-i18n="empty.preview"></div>
      </div>
      <div class="transport">
        <button class="btn btn--icon" id="play" aria-label="play">${icons.play}</button>
        <input type="range" id="scrub" min="0" max="1" step="0.02" value="0" aria-label="timeline" />
        <span class="time" id="time">0.0 / 0.0s</span>
      </div>
      <div class="row" style="max-width:min(360px,78vw);width:100%">
        <button class="btn btn--accent" id="export">${icons.download}<span data-i18n="action.export"></span></button>
        <label class="toggle"><input type="checkbox" id="safe" /><span data-i18n="safe.label"></span></label>
      </div>
      <p class="empty-note" data-i18n="export.hint"></p>
    </section>

    <section class="panel panel--edit" aria-label="edit">
      <h2 class="panel__title" data-i18n="nav.edit"></h2>
      <div class="field">
        <label for="template" data-i18n="template.label"></label>
        <select id="template">
          <option value="punch" data-i18n="template.punch"></option>
          <option value="flow" data-i18n="template.flow"></option>
          <option value="story" data-i18n="template.story"></option>
        </select>
      </div>
      <div class="field">
        <label for="aspect" data-i18n="aspect.label"></label>
        <select id="aspect">
          <option value="9:16">9:16 — Reels / Shorts / TikTok</option>
          <option value="4:5">4:5 — feed</option>
          <option value="1:1">1:1 — square</option>
        </select>
      </div>
      <div class="field">
        <label for="target"><span data-i18n="duration.label"></span> <span id="targetVal">12s</span></label>
        <input type="range" id="target" min="5" max="45" step="1" value="12" />
      </div>
      <div class="field">
        <label for="hook" data-i18n="hook.label"></label>
        <input type="text" id="hook" maxlength="80" />
      </div>
      <div class="field">
        <label for="cta" data-i18n="cta.label"></label>
        <input type="text" id="cta" maxlength="60" />
      </div>
      <div class="field">
        <label data-i18n="audio.label"></label>
        <div class="row">
          <button class="btn" id="audioPick">${icons.music}<span data-i18n="audio.pick"></span></button>
          <button class="btn btn--ghost" id="audioClear">${icons.close}<span data-i18n="audio.remove"></span></button>
        </div>
        <span class="empty-note" id="audioName" data-i18n="audio.none"></span>
        <input type="file" id="audioFile" accept="audio/*" hidden />
      </div>
      <button class="btn btn--primary" id="rebuild">${icons.wand}<span data-i18n="action.rebuild"></span></button>
    </section>

    <section class="panel panel--score" aria-label="score">
      <h2 class="panel__title" data-i18n="score.title"></h2>
      <div id="scoreBody"></div>
      <button class="btn btn--primary" id="analyze">${icons.spark}<span data-i18n="action.analyze"></span></button>
      <div class="sources">
        <strong data-i18n="score.sources"></strong>
        ${SOURCES.map((s) => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}</a>`).join('')}
      </div>
      <p class="empty-note" data-i18n="footer.privacy"></p>
    </section>
  </main>

  <nav class="tabbar" role="tablist">
    <button role="tab" data-goto="media" aria-selected="true">${icons.image}<span data-i18n="nav.media"></span></button>
    <button role="tab" data-goto="edit" aria-selected="false">${icons.sliders}<span data-i18n="nav.edit"></span></button>
    <button role="tab" data-goto="score" aria-selected="false">${icons.target}<span data-i18n="nav.score"></span></button>
  </nav>`;
}

app.innerHTML = shell();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const viewport = $('viewport');
const viewportEmpty = $('viewportEmpty');
const strip = $('strip');
const scrub = $<HTMLInputElement>('scrub');
const timeLabel = $('time');
const playBtn = $('play');
const exportBtn = $<HTMLButtonElement>('export');
const analyzeBtn = $<HTMLButtonElement>('analyze');
const scoreBody = $('scoreBody');
const hookInput = $<HTMLInputElement>('hook');
const ctaInput = $<HTMLInputElement>('cta');
const templateSel = $<HTMLSelectElement>('template');
const aspectSel = $<HTMLSelectElement>('aspect');
const targetRange = $<HTMLInputElement>('target');

const renderer = new ReelRenderer(state.project.aspect);
viewport.appendChild(renderer.canvas);

const player = new Player(renderer, {
  getProject: () => state.project,
  resolve: assetById,
  getAudio: () => state.audio?.el ?? null,
  onTime: (time) => {
    state.time = time;
    updateTransport();
  },
  safeZones: () => state.showSafeZones,
});

let score: ScoreResult | null = null;
let analyzing = false;
let scoreStale = true;

/* ---------- i18n ---------- */

function applyI18n(): void {
  setLang(state.lang);
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    node.textContent = t(node.dataset.i18n!);
  }
  hookInput.placeholder = t('hook.placeholder');
  ctaInput.placeholder = t('cta.placeholder');
  renderScore();
  renderStrip();
}

/* ---------- media ---------- */

async function addFiles(files: File[]): Promise<void> {
  const added = await loadFiles(files);
  if (!added.length) return;
  state.assets.push(...added);
  rebuild();
  renderStrip();
  for (const a of added) {
    const src = await thumbnail(a);
    const img = strip.querySelector<HTMLImageElement>(`img[data-id="${a.id}"]`);
    if (img) img.src = src;
  }
}

function renderStrip(): void {
  strip.innerHTML = state.assets
    .map(
      (a) => `<div class="thumb">
        <img data-id="${a.id}" alt="${a.name}" />
        <span class="thumb__badge">${a.kind === 'video' ? `${a.srcDuration.toFixed(1)}s` : 'IMG'}</span>
        <button class="thumb__del" data-del="${a.id}" aria-label="remove">${icons.close}</button>
      </div>`,
    )
    .join('');
  $('mediaCount').textContent = `${state.assets.length} ${t('media.count')}`;
  viewportEmpty.style.display = state.assets.length ? 'none' : 'grid';
}

/* ---------- build / playback ---------- */

function rebuild(): void {
  const aspect = aspectSel.value as Aspect;
  state.project = buildProject(state.assets, {
    template: templateSel.value as TemplateId,
    aspect,
    hook: hookInput.value.trim() || undefined,
    cta: ctaInput.value.trim() || undefined,
    target: Number(targetRange.value),
  });
  relayout(state.project);
  renderer.resize(aspect);
  const [w, h] = SIZES[aspect];
  viewport.style.aspectRatio = `${w} / ${h}`;
  scoreStale = true;
  player.seek(0);
  updateTransport();
  renderScore();
}

function updateTransport(): void {
  const dur = totalDuration(state.project);
  scrub.max = String(Math.max(0.1, dur));
  scrub.value = String(state.time);
  timeLabel.textContent = `${state.time.toFixed(1)} / ${dur.toFixed(1)}s`;
  playBtn.innerHTML = player.playing ? icons.pause : icons.play;
  playBtn.setAttribute('aria-label', player.playing ? t('action.pause') : t('action.play'));
  exportBtn.disabled = !state.assets.length;
  analyzeBtn.disabled = !state.assets.length || analyzing;
}

/* ---------- score ---------- */

function gauge(value: number): string {
  const r = 46;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return `<svg class="gauge" viewBox="0 0 110 110" role="img" aria-label="${value}/100">
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="#201a32" stroke-width="10" />
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 55 55)" />
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563eb" /><stop offset="100%" stop-color="#ec4899" />
    </linearGradient></defs>
    <text class="gauge__value" x="55" y="54" text-anchor="middle" dominant-baseline="middle">${value}</text>
    <text class="gauge__unit" x="55" y="72" text-anchor="middle">/ 100</text>
  </svg>`;
}

function renderScore(): void {
  if (!score) {
    scoreBody.innerHTML = `<p class="empty-note">${t('score.empty')}</p>`;
    return;
  }
  const sourceLabel = (id: string) => SOURCES.find((s) => s.id === id);
  scoreBody.innerHTML = `
    <div class="score">
      ${gauge(score.total)}
      <div class="score__text">
        <h3>${t('score.title')}${scoreStale ? ' *' : ''}</h3>
        <p>${t('score.sub')}</p>
      </div>
    </div>
    <h3 class="panel__title" style="margin-top:16px">${t('score.factors')}</h3>
    <ul class="factors">
      ${score.factors
        .map(
          (f) => `<li>
            <div class="factor__head"><span>${t(`factor.${f.id}`)}</span>
              <span class="factor__val">${f.score.toFixed(1)} / ${f.max}</span></div>
            <div class="bar"><span style="width:${Math.round((f.score / f.max) * 100)}%"></span></div>
            <div class="factor__detail">${f.detail.map((d) => `<span>${d}</span>`).join('')}</div>
          </li>`,
        )
        .join('')}
    </ul>
    ${
      score.tips.length
        ? `<h3 class="panel__title" style="margin-top:16px">${t('score.tips')}</h3>
    <ul class="tips">
      ${score.tips
        .slice(0, 6)
        .map(
          (tip) => `<li class="tip ${tip.lost >= 4 ? 'tip--critical' : ''}">
            <div class="tip__body">
              <span>${t(tip.id)}</span>
              <span class="tip__meta">
                <span>-${tip.lost.toFixed(1)} pts</span>
                ${tip.sources
                  .map((s) => sourceLabel(s))
                  .filter(Boolean)
                  .map((s) => `<a href="${s!.url}" target="_blank" rel="noopener noreferrer">${s!.label}</a>`)
                  .join('')}
              </span>
            </div>
          </li>`,
        )
        .join('')}
    </ul>`
        : ''
    }`;
}

async function analyze(): Promise<void> {
  if (!state.assets.length || analyzing) return;
  analyzing = true;
  updateTransport();
  const wasPlaying = player.playing;
  player.pause();
  try {
    const media = await analyzeMedia(state.project, assetById);
    score = scoreProject(state.project, media);
    scoreStale = false;
  } finally {
    analyzing = false;
    player.seek(state.time);
    if (wasPlaying) player.play();
    updateTransport();
    renderScore();
  }
}

/* ---------- export ---------- */

function toast(msg: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function exportVideo(): Promise<void> {
  if (!state.assets.length) return;
  if (!pickMime()) {
    toast(t('export.unsupported'));
    return;
  }
  const label = exportBtn.querySelector('span')!;
  const prev = label.textContent;
  exportBtn.disabled = true;
  label.textContent = t('action.exporting');
  const safeWas = state.showSafeZones;
  state.showSafeZones = false;

  try {
    player.pause();
    player.seek(0);
    await document.fonts.ready;
    const { blob, mime } = await recordCanvas({
      canvas: renderer.canvas,
      fps: state.project.fps,
      audio: state.audio?.el ?? null,
      run: () =>
        new Promise<void>((resolve) => {
          const done = () => {
            if (!player.playing) {
              clearInterval(iv);
              resolve();
            }
          };
          const iv = setInterval(done, 120);
          player.play();
        }),
    });
    downloadBlob(blob, `mai-reel-${Date.now()}.${extensionFor(mime)}`);
    toast(t('export.done'));
  } catch (err) {
    toast(String(err instanceof Error ? err.message : err));
  } finally {
    state.showSafeZones = safeWas;
    label.textContent = prev;
    exportBtn.disabled = false;
    player.seek(0);
  }
}

/* ---------- events ---------- */

$('pick').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  void addFiles(Array.from(input.files ?? []));
  input.value = '';
});

const drop = $('drop');
for (const evt of ['dragenter', 'dragover']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.dataset.over = 'true';
  });
}
for (const evt of ['dragleave', 'drop']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.dataset.over = 'false';
  });
}
drop.addEventListener('drop', (e) => {
  const dt = (e as DragEvent).dataTransfer;
  if (dt?.files.length) void addFiles(Array.from(dt.files));
});

strip.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
  if (!btn) return;
  const id = btn.dataset.del!;
  const asset = assetById(id);
  if (asset) URL.revokeObjectURL(asset.url);
  state.assets = state.assets.filter((a) => a.id !== id);
  rebuild();
  renderStrip();
});

$('clear').addEventListener('click', () => {
  for (const a of state.assets) URL.revokeObjectURL(a.url);
  state.assets = [];
  score = null;
  rebuild();
  renderStrip();
});

playBtn.addEventListener('click', () => {
  if (player.playing) player.pause();
  else player.play();
  updateTransport();
});

scrub.addEventListener('input', () => {
  player.pause();
  player.seek(Number(scrub.value));
  updateTransport();
});

$('safe').addEventListener('change', (e) => {
  state.showSafeZones = (e.target as HTMLInputElement).checked;
  player.seek(state.time);
});

for (const id of ['template', 'aspect', 'target', 'hook', 'cta']) {
  $(id).addEventListener('change', () => {
    if (id === 'target') $('targetVal').textContent = `${targetRange.value}s`;
    rebuild();
  });
}
targetRange.addEventListener('input', () => {
  $('targetVal').textContent = `${targetRange.value}s`;
});
templateSel.addEventListener('change', () => {
  targetRange.value = String(TEMPLATES[templateSel.value as TemplateId].target);
  $('targetVal').textContent = `${targetRange.value}s`;
  rebuild();
});

$('rebuild').addEventListener('click', () => {
  rebuild();
  void analyze();
});
analyzeBtn.addEventListener('click', () => void analyze());
exportBtn.addEventListener('click', () => void exportVideo());

$('audioPick').addEventListener('click', () => $<HTMLInputElement>('audioFile').click());
$<HTMLInputElement>('audioFile').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const el = new Audio(URL.createObjectURL(file));
  el.preload = 'auto';
  state.audio = { el, name: file.name };
  $('audioName').textContent = file.name;
});
$('audioClear').addEventListener('click', () => {
  state.audio?.el.pause();
  state.audio = null;
  $('audioName').textContent = t('audio.none');
});

$('lang').addEventListener('click', () => {
  state.lang = state.lang === 'es' ? 'en' : 'es';
  applyI18n();
});

document.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.body.dataset.tab = btn.dataset.goto!;
    document.querySelectorAll('[data-goto]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  });
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    player.playing ? player.pause() : player.play();
    updateTransport();
  }
});

/* ---------- boot ---------- */

document.body.dataset.tab = 'media';
applyI18n();
rebuild();
renderStrip();
updateTransport();
