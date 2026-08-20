import './styles.css';
import { state, assetById, uid } from './state';
import { setLang, t, SOURCES } from './i18n';
import { icons, brandMark } from './ui/icons';
import { loadFiles, thumbnail } from './engine/media';
import { buildProject, relayout, appendAssets, buildCaptions, TEMPLATES } from './engine/autoedit';
import { ReelRenderer, SIZES, totalDuration } from './engine/render';
import { Player } from './engine/player';
import { recordCanvas, downloadBlob, extensionFor, pickMime } from './engine/export';
import { analyzeMedia } from './analysis/frames';
import { scoreProject, type ScoreResult } from './analysis/score';
import { FONTS, TEXT_STYLES, ensureFontsLoaded } from './data/typography';
import type { Aspect, Effect, TemplateId, TextOverlay, Transition } from './types';

const EFFECTS: Effect[] = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
const TRANSITIONS: Transition[] = ['cut', 'fade', 'zoom', 'slide'];
const POSITIONS: Array<{ id: string; y: number }> = [
  { id: 'top', y: 0.24 },
  { id: 'mid', y: 0.5 },
  { id: 'bottom', y: 0.74 },
];

const app = document.getElementById('app')!;

const options = (values: string[], selected: string, labelKey: (v: string) => string) =>
  values
    .map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${t(labelKey(v))}</option>`)
    .join('');

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
      <div class="row stage__actions">
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
        <label for="font" data-i18n="font.label"></label>
        <select id="font">${FONTS.map((f) => `<option value="${f.id}" style="font-family:${f.family}">${f.label}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="style" data-i18n="style.label"></label>
        <select id="style">${TEXT_STYLES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
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
        <label for="script" data-i18n="script.label"></label>
        <textarea id="script" rows="4"></textarea>
        <span class="empty-note" data-i18n="script.hint"></span>
        <button class="btn" id="captions">${icons.captions}<span data-i18n="script.generate"></span></button>
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
      <span class="empty-note" data-i18n="action.rebuildWarn"></span>
    </section>

    <section class="panel panel--blocks" aria-label="blocks">
      <h2 class="panel__title" data-i18n="nav.blocks"></h2>
      <div id="blocks"></div>
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
    <button role="tab" data-goto="blocks" aria-selected="false">${icons.layers}<span data-i18n="nav.blocks"></span></button>
    <button role="tab" data-goto="score" aria-selected="false">${icons.target}<span data-i18n="nav.score"></span></button>
  </nav>`;
}

app.innerHTML = shell();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const viewport = $('viewport');
const viewportEmpty = $('viewportEmpty');
const strip = $('strip');
const blocksBox = $('blocks');
const scrub = $<HTMLInputElement>('scrub');
const timeLabel = $('time');
const playBtn = $('play');
const exportBtn = $<HTMLButtonElement>('export');
const analyzeBtn = $<HTMLButtonElement>('analyze');
const scoreBody = $('scoreBody');
const hookInput = $<HTMLInputElement>('hook');
const ctaInput = $<HTMLInputElement>('cta');
const scriptInput = $<HTMLTextAreaElement>('script');
const templateSel = $<HTMLSelectElement>('template');
const aspectSel = $<HTMLSelectElement>('aspect');
const fontSel = $<HTMLSelectElement>('font');
const styleSel = $<HTMLSelectElement>('style');
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
  scriptInput.placeholder = t('script.placeholder');
  renderScore();
  renderStrip();
  renderBlocks();
}

/* ---------- media ---------- */

async function addFiles(files: File[]): Promise<void> {
  const added = await loadFiles(files);
  if (!added.length) return;
  const hadClips = state.project.clips.length > 0;
  state.assets.push(...added);
  if (hadClips) {
    appendAssets(state.project, added);
    scoreStale = true;
    player.seek(state.time);
    updateTransport();
  } else {
    rebuild();
  }
  renderStrip();
  renderBlocks();
  for (const a of added) {
    a.thumb = await thumbnail(a);
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(`img[data-id="${a.id}"]`))) {
      img.src = a.thumb;
    }
  }
}

function renderStrip(): void {
  strip.innerHTML = state.assets
    .map(
      (a) => `<div class="thumb">
        <img data-id="${a.id}" src="${a.thumb ?? ''}" alt="${a.name}" />
        <span class="thumb__badge">${a.kind === 'video' ? `${a.srcDuration.toFixed(1)}s` : 'IMG'}</span>
        <button class="thumb__del" data-del="${a.id}" aria-label="${t('clip.delete')}">${icons.close}</button>
      </div>`,
    )
    .join('');
  $('mediaCount').textContent = `${state.assets.length} ${t('media.count')}`;
  viewportEmpty.style.display = state.assets.length ? 'none' : 'grid';
}

/* ---------- build ---------- */

function rebuild(): void {
  const aspect = aspectSel.value as Aspect;
  state.project = buildProject(state.assets, {
    template: templateSel.value as TemplateId,
    aspect,
    hook: hookInput.value.trim() || undefined,
    cta: ctaInput.value.trim() || undefined,
    script: scriptInput.value.trim() || undefined,
    target: Number(targetRange.value),
    fontId: fontSel.value,
    styleId: styleSel.value,
  });
  relayout(state.project);
  applyAspect(aspect);
  scoreStale = true;
  player.seek(0);
  updateTransport();
  renderScore();
  renderBlocks();
}

function applyAspect(aspect: Aspect): void {
  renderer.resize(aspect);
  const [w, h] = SIZES[aspect];
  viewport.style.aspectRatio = `${w} / ${h}`;
}

function touch(): void {
  relayout(state.project);
  scoreStale = true;
  player.seek(Math.min(state.time, totalDuration(state.project)));
  updateTransport();
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

/* ---------- blocks ---------- */

function posOf(y: number): string {
  return POSITIONS.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best), POSITIONS[0]!).id;
}

function clipCard(index: number): string {
  const clip = state.project.clips[index]!;
  const asset = assetById(clip.assetId);
  const isVideo = asset?.kind === 'video';
  const maxIn = isVideo ? Math.max(0, (asset?.srcDuration ?? 0) - clip.duration) : 0;
  return `<article class="block" data-clip="${clip.id}">
    <div class="block__head">
      <img class="block__thumb" data-id="${clip.assetId}" src="${asset?.thumb ?? ''}" alt="" />
      <span class="block__index">${index + 1}</span>
      <span class="block__time">${clip.start.toFixed(1)}s</span>
      <span class="block__spacer"></span>
      <button class="btn btn--icon btn--ghost" data-move="up" aria-label="${t('clip.up')}" ${index === 0 ? 'disabled' : ''}>${icons.up}</button>
      <button class="btn btn--icon btn--ghost" data-move="down" aria-label="${t('clip.down')}" ${index === state.project.clips.length - 1 ? 'disabled' : ''}>${icons.down}</button>
      <button class="btn btn--icon btn--ghost" data-remove aria-label="${t('clip.delete')}">${icons.trash}</button>
    </div>
    <div class="block__grid">
      <label>${t('clip.effect')}
        <select data-field="effect">${options(EFFECTS, clip.effect, (v) => `effect.${v}`)}</select>
      </label>
      <label>${t('clip.transition')}
        <select data-field="transition">${options(TRANSITIONS, clip.transition, (v) => `trans.${v}`)}</select>
      </label>
    </div>
    <label class="block__range">${t('clip.duration')} <output>${clip.duration.toFixed(1)}s</output>
      <input type="range" data-field="duration" min="0.4" max="${isVideo ? Math.max(2, asset?.srcDuration ?? 8).toFixed(1) : 8}" step="0.1" value="${clip.duration}" />
    </label>
    ${
      isVideo && maxIn > 0.1
        ? `<label class="block__range">${t('clip.trim')} <output>${clip.srcIn.toFixed(1)}s</output>
      <input type="range" data-field="srcIn" min="0" max="${maxIn.toFixed(1)}" step="0.1" value="${clip.srcIn}" />
    </label>`
        : ''
    }
  </article>`;
}

function textCard(o: TextOverlay): string {
  const dur = totalDuration(state.project);
  return `<article class="block" data-text="${o.id}">
    <div class="block__head">
      <span class="block__tag block__tag--${o.role}">${t(`role.${o.role}`)}</span>
      <span class="block__time">${o.start.toFixed(1)}-${o.end.toFixed(1)}s</span>
      <span class="block__spacer"></span>
      <button class="btn btn--icon btn--ghost" data-remove aria-label="${t('clip.delete')}">${icons.trash}</button>
    </div>
    <input type="text" data-field="text" value="${o.text.replace(/"/g, '&quot;')}" aria-label="${t('role.' + o.role)}" />
    <div class="block__grid">
      <label>${t('font.label')}
        <select data-field="fontId">${FONTS.map((f) => `<option value="${f.id}" ${f.id === o.fontId ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
      </label>
      <label>${t('style.label')}
        <select data-field="styleId">${TEXT_STYLES.map((s) => `<option value="${s.id}" ${s.id === o.styleId ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      </label>
      <label>${t('text.pos')}
        <select data-field="pos">${POSITIONS.map((p) => `<option value="${p.id}" ${p.id === posOf(o.y) ? 'selected' : ''}>${t(`pos.${p.id}`)}</option>`).join('')}</select>
      </label>
      <label>${t('text.size')}
        <input type="number" data-field="size" min="28" max="140" step="2" value="${Math.round(o.size)}" />
      </label>
      <label>${t('text.start')}
        <input type="number" data-field="start" min="0" max="${dur.toFixed(1)}" step="0.1" value="${o.start.toFixed(1)}" />
      </label>
      <label>${t('text.end')}
        <input type="number" data-field="end" min="0" max="${dur.toFixed(1)}" step="0.1" value="${o.end.toFixed(1)}" />
      </label>
    </div>
  </article>`;
}

function renderBlocks(): void {
  if (!state.project.clips.length) {
    blocksBox.innerHTML = `<p class="empty-note">${t('blocks.empty')}</p>`;
    return;
  }
  blocksBox.innerHTML = `
    <h3 class="panel__title">${t('blocks.clips')}</h3>
    <div class="blocks">${state.project.clips.map((_, i) => clipCard(i)).join('')}</div>
    <h3 class="panel__title" style="margin-top:16px">${t('blocks.texts')}</h3>
    <div class="blocks">${state.project.texts.map(textCard).join('')}</div>
    <button class="btn" id="addText">${icons.plus}<span>${t('blocks.addText')}</span></button>`;
}

blocksBox.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('#addText')) {
    const dur = totalDuration(state.project);
    state.project.texts.push({
      id: uid('t'),
      text: 'Texto',
      start: Math.min(state.time, Math.max(0, dur - 1.5)),
      end: Math.min(dur, Math.max(1.5, state.time + 2.2)),
      role: 'caption',
      y: 0.74,
      size: 56,
      fontId: fontSel.value,
      styleId: styleSel.value,
    });
    touch();
    renderBlocks();
    return;
  }
  const card = target.closest<HTMLElement>('[data-clip],[data-text]');
  if (!card) return;

  if (target.closest('[data-remove]')) {
    if (card.dataset.clip) state.project.clips = state.project.clips.filter((c) => c.id !== card.dataset.clip);
    else state.project.texts = state.project.texts.filter((x) => x.id !== card.dataset.text);
    touch();
    renderBlocks();
    return;
  }
  const move = target.closest<HTMLElement>('[data-move]');
  if (move && card.dataset.clip) {
    const i = state.project.clips.findIndex((c) => c.id === card.dataset.clip);
    const j = move.dataset.move === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= state.project.clips.length) return;
    const clips = state.project.clips;
    [clips[i], clips[j]] = [clips[j]!, clips[i]!];
    touch();
    renderBlocks();
  }
});

blocksBox.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement | HTMLSelectElement;
  const field = input.dataset.field;
  const card = input.closest<HTMLElement>('[data-clip],[data-text]');
  if (!field || !card) return;

  if (card.dataset.clip) {
    const clip = state.project.clips.find((c) => c.id === card.dataset.clip);
    if (!clip) return;
    if (field === 'effect') clip.effect = input.value as Effect;
    if (field === 'transition') clip.transition = input.value as Transition;
    if (field === 'duration') clip.duration = Number(input.value);
    if (field === 'srcIn') clip.srcIn = Number(input.value);
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = `${Number(input.value).toFixed(1)}s`;
  } else {
    const o = state.project.texts.find((x) => x.id === card.dataset.text);
    if (!o) return;
    if (field === 'text') o.text = input.value;
    if (field === 'fontId') o.fontId = input.value;
    if (field === 'styleId') o.styleId = input.value;
    if (field === 'size') o.size = Number(input.value);
    if (field === 'start') o.start = Number(input.value);
    if (field === 'end') o.end = Math.max(Number(input.value), o.start + 0.3);
    if (field === 'pos') o.y = POSITIONS.find((p) => p.id === input.value)?.y ?? o.y;
  }
  touch();
});

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
    await ensureFontsLoaded();
    const { blob, mime } = await recordCanvas({
      canvas: renderer.canvas,
      fps: state.project.fps,
      audio: state.audio?.el ?? null,
      run: () =>
        new Promise<void>((resolve) => {
          const iv = setInterval(() => {
            if (!player.playing) {
              clearInterval(iv);
              resolve();
            }
          }, 120);
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
  state.project.clips = state.project.clips.filter((c) => c.assetId !== id);
  touch();
  renderStrip();
  renderBlocks();
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

aspectSel.addEventListener('change', () => {
  state.project.aspect = aspectSel.value as Aspect;
  applyAspect(state.project.aspect);
  touch();
});

for (const sel of [fontSel, styleSel]) {
  sel.addEventListener('change', () => {
    state.project.fontId = fontSel.value;
    state.project.styleId = styleSel.value;
    for (const o of state.project.texts) {
      o.fontId = fontSel.value;
      o.styleId = styleSel.value;
    }
    touch();
    renderBlocks();
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

$('captions').addEventListener('click', () => {
  const script = scriptInput.value.trim();
  if (!script || !state.project.clips.length) return;
  state.project.texts = state.project.texts.filter((x) => x.role !== 'caption');
  const dur = totalDuration(state.project);
  const from = state.project.texts.find((x) => x.role === 'hook')?.end ?? 0;
  const to = Math.max(from + 1, dur - (state.project.texts.some((x) => x.role === 'cta') ? 2.4 : 0));
  const captions = buildCaptions(script, from, to, fontSel.value, styleSel.value);
  state.project.texts.push(...captions);
  touch();
  renderBlocks();
  toast(`${captions.length} ${t('toast.captions')}`);
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
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (player.playing) player.pause();
    else player.play();
    updateTransport();
  }
});

/* ---------- boot ---------- */

document.body.dataset.tab = 'media';
fontSel.value = state.project.fontId;
styleSel.value = state.project.styleId;
applyI18n();
rebuild();
renderStrip();
updateTransport();
void ensureFontsLoaded().then(() => player.seek(state.time));
