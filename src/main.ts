import './styles.css';
import { state, assetById, uid } from './state';
import { setLang, t, tf, SOURCES, LANGS, LANG_NAMES, type Lang } from './i18n';
import { icons, brandMark } from './ui/icons';
import { loadFiles, thumbnail } from './engine/media';
import { buildProject, relayout, appendAssets, buildCaptions, TEMPLATES } from './engine/autoedit';
import { ReelRenderer, SIZES, totalDuration } from './engine/render';
import { Player } from './engine/player';
import { recordCanvas, downloadBlob, extensionFor, pickMime } from './engine/export';
import { analyzeMedia, type MediaStats } from './analysis/frames';
import { scoreProject, type ScoreResult } from './analysis/score';
import { FONTS, TEXT_STYLES, ensureFontsLoaded } from './data/typography';
import { loadAudioFile, beatsInFragment, drawWaveform, analyzeFileAudio, type SourceAudio } from './engine/audio';
import { detectVoice, timeBlocksToSpeech, type VoiceMap } from './analysis/voice';
import { findHighlights, type Highlight } from './analysis/highlights';
import { randomSeed, seedCode } from './engine/rng';
import { transcribeFile, splitCues, isTranscriptionSupported, type Cue } from './analysis/transcribe';
import { fetchMediaFromUrl, LinkError, platformOf } from './engine/fetchMedia';
import { embedFor, type EmbedInfo } from './engine/embed';
import { captureTabAudio, isCaptureSupported, CaptureError, type Capture } from './engine/capture';
import {
  extractorUrl,
  setExtractorUrl,
  hasExtractor,
  checkExtractor,
  fetchLinkTranscript,
  fetchLinkAudio,
  ExtractorError,
} from './engine/extractor';
import { STYLE_PACKS, packById, autoDirect, formatReason, type Reason } from './engine/director';
import { buildEntertainProject, idleEnhance } from './engine/autoedit';
import { detectFocus } from './analysis/focus';
import type { Aspect, Effect, Enhance, Grade, MediaAsset, ReelMode, TemplateId, TextAnim, TextOverlay, Transition } from './types';

const PARENT_SITE = 'https://mai-softwares.com';
const REPO = 'https://github.com/MAI-Software/MAI-Reel';
const EFFECTS: Effect[] = [
  'none',
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'punch',
  'shake',
  'rotate',
  'blur-in',
  'drift',
];
const TRANSITIONS: Transition[] = ['cut', 'fade', 'zoom', 'slide', 'whip', 'flash', 'push-up', 'wipe'];
const ANIMS: TextAnim[] = ['fade', 'pop', 'slide-up', 'bounce', 'typewriter', 'karaoke', 'none'];
const GRADES: Grade[] = ['none', 'vivid', 'warm', 'cool', 'mono', 'film', 'vhs', 'dream', 'night'];
const LENGTH_PRESETS = [8, 12, 15, 20];
const MIN_DURATION = 8;
const POSITIONS: Array<{ id: string; y: number }> = [
  { id: 'top', y: 0.24 },
  { id: 'mid', y: 0.5 },
  { id: 'bottom', y: 0.74 },
];
/** The preview renders at a fraction of the export resolution so phones keep 30fps. */
const wideScreen = window.matchMedia('(min-width: 1024px)');
const previewScale = (): number => (wideScreen.matches ? 0.6 : 0.45);
const AUTO_ANALYZE_MS = 1400;
const AUTO_ANALYZE_MAX_CLIPS = 24;

const app = document.getElementById('app')!;

const options = (values: string[], selected: string, labelKey: (v: string) => string) =>
  values
    .map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${t(labelKey(v))}</option>`)
    .join('');

const SECTIONS = ['transcribe', 'boost', 'build', 'multi'] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_ICON: Record<Section, string> = {
  transcribe: icons.captions,
  boost: icons.spark,
  build: icons.wand,
  multi: icons.layers,
};

function shell(): string {
  return `
  <header class="topbar" id="topbar">
    <a class="brand" href="${PARENT_SITE}" target="_blank" rel="noopener noreferrer" title="MAI Softwares">
      ${brandMark}<span class="brand__name">MAI<span>-Reel</span></span>
    </a>
    <span class="topbar__tag" data-i18n="app.tagline"></span>
    <span class="topbar__spacer"></span>
    <button class="chip chip--score" id="scoreChip" hidden>
      ${icons.target}<strong id="scoreChipVal">--</strong><small>/100</small>
    </button>
    <label class="chip chip--lang" for="lang">
      ${icons.globe}
      <span class="sr-only" data-i18n="lang.label"></span>
      <select id="lang">
        ${LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('')}
      </select>
    </label>
  </header>

  <nav class="sections" id="sections" role="tablist" aria-label="secciones">
    ${SECTIONS.map(
      (id) => `<button role="tab" data-section="${id}" aria-selected="${id === 'transcribe'}">
        ${SECTION_ICON[id]}
        <span>
          <strong data-i18n="section.${id}"></strong>
          <small data-i18n="section.${id}.sub"></small>
        </span>
      </button>`,
    ).join('')}
  </nav>

  <main class="layout">
    <section class="panel panel--media" aria-label="media" id="panel-media">
      <h2 class="panel__title" data-i18n="nav.media"></h2>
      <div class="dropzone" id="drop">
        <h3 data-i18n="drop.title"></h3>
        <p data-i18n="drop.hint"></p>
        <button class="btn btn--primary" id="pick">${icons.image}<span data-i18n="drop.button"></span></button>
        <input type="file" id="file" accept="image/*,video/*,audio/*" multiple hidden />
      </div>
      <div class="linkbox">
        <label for="linkUrl" data-i18n="link.label"></label>
        <div class="linkbox__row">
          <input type="url" id="linkUrl" inputmode="url" autocomplete="off" />
          <button class="btn btn--primary" id="linkLoad">${icons.download}<span data-i18n="link.load"></span></button>
        </div>
        <span class="empty-note" id="linkStatus" data-i18n="link.hint"></span>
      </div>
      <div class="progress" id="importProgress" hidden>
        <div class="progress__track"><span class="progress__bar" id="importBar"></span></div>
        <span class="progress__label" id="importLabel"></span>
      </div>
      <div class="strip" id="strip"></div>
      <div class="row row--between">
        <span class="empty-note" id="mediaCount"></span>
        <button class="btn btn--ghost btn--sm" id="clear">${icons.trash}<span data-i18n="media.clear"></span></button>
      </div>
    </section>

    <section class="panel panel--transcript" aria-label="transcript" id="panel-transcript">
      <h2 class="panel__title" data-i18n="section.transcribe"></h2>
      <div class="row">
        <select id="asrLang">
          <option value="auto" data-i18n="asr.auto"></option>
          ${LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('')}
        </select>
        <button class="btn btn--primary" id="transcribe">${icons.captions}<span data-i18n="asr.run"></span></button>
      </div>
      <div class="progress" id="asrProgress" hidden>
        <div class="progress__track"><span class="progress__bar" id="asrBar"></span></div>
        <span class="progress__label" id="asrLabel"></span>
      </div>
      <div class="trplayer" id="trPlayerBox" hidden>
        <div class="trplayer__media" id="trPlayerMedia"></div>
        <div class="trplayer__meta">
          <span id="trPlayerName"></span>
          <label class="toggle"><input type="checkbox" id="trFollow" checked /><span data-i18n="tr.follow"></span></label>
        </div>
        <div class="linkjob" id="linkJobBox" hidden>
          <button class="btn btn--primary" id="linkTranscribe">${icons.captions}<span data-i18n="ext.run"></span></button>
          <span class="empty-note" id="linkJobStatus"></span>
        </div>
        <div class="capture" id="captureBox" hidden>
          <p class="empty-note" data-i18n="cap.hint"></p>
          <div class="row">
            <button class="btn btn--accent" id="captureStart">${icons.captions}<span data-i18n="cap.start"></span></button>
            <button class="btn btn--primary" id="captureStop" hidden>${icons.close}<span data-i18n="cap.stop"></span></button>
          </div>
          <span class="empty-note" id="captureStatus"></span>
        </div>
      </div>
      <span class="empty-note" data-i18n="asr.hint"></span>
      <div id="transcript"></div>
      <div class="row" id="transcriptActions" hidden>
        <button class="btn btn--sm" id="copyText">${icons.captions}<span data-i18n="tr.copy"></span></button>
        <button class="btn btn--sm" id="downloadSrt">${icons.download}<span>.SRT</span></button>
        <button class="btn btn--sm" id="downloadTxt">${icons.download}<span>.TXT</span></button>
        <button class="btn btn--sm btn--primary" id="applyCues">${icons.spark}<span data-i18n="asr.apply"></span></button>
      </div>
      <details class="disclosure" id="serverGroup">
        <summary>${icons.sliders}<span data-i18n="ext.label"></span></summary>
        <div class="field">
          <span class="empty-note" data-i18n="ext.hint"></span>
          <div class="linkbox__row">
            <input type="url" id="extractorUrl" inputmode="url" autocomplete="off" placeholder="https://…" />
            <button class="btn" id="extractorSave">${icons.spark}<span data-i18n="ext.save"></span></button>
          </div>
          <span class="empty-note" id="extractorStatus"></span>
        </div>
      </details>

      <details class="disclosure" id="manualGroup">
        <summary>${icons.sliders}<span data-i18n="tr.manual"></span></summary>
        <div class="field">
          <textarea id="script" rows="3"></textarea>
          <span class="empty-note" data-i18n="script.hint"></span>
          <button class="btn btn--sm" id="captions">${icons.captions}<span data-i18n="script.generate"></span></button>
        </div>
      </details>
    </section>

    <section class="stage" id="stage">
      <div class="viewport" id="viewport">
        <div class="viewport__empty" id="viewportEmpty">
          <ol class="steps">
            <li data-i18n="onboard.1"></li>
            <li data-i18n="onboard.2"></li>
            <li data-i18n="onboard.3"></li>
          </ol>
        </div>
      </div>
      <div class="transport">
        <button class="btn btn--icon" id="play" aria-label="play">${icons.play}</button>
        <div class="scrubwrap">
          <input type="range" id="scrub" min="0" max="1" step="0.02" value="0" aria-label="timeline" />
          <div class="ticks" id="ticks" aria-hidden="true"></div>
        </div>
        <span class="time" id="time">0.0 / 0.0s</span>
      </div>
      <div class="row stage__actions">
        <button class="btn btn--accent" id="export">${icons.download}<span data-i18n="action.export"></span></button>
        <label class="toggle"><input type="checkbox" id="safe" /><span data-i18n="safe.label"></span></label>
      </div>
      <p class="empty-note" data-i18n="export.hint"></p>
    </section>

    <section class="panel panel--boost" aria-label="boost" id="panel-boost">
      <h2 class="panel__title" data-i18n="section.boost"></h2>
      <div class="entertain" id="entertainBox">
        <p class="empty-note" id="entertainInfo" data-i18n="entertain.hint"></p>
        <label class="block__range"><span data-i18n="entertain.intensity"></span> <output id="enIntensityVal">60%</output>
          <input type="range" id="enIntensity" min="10" max="100" step="5" value="60" />
        </label>
        <label class="block__range"><span data-i18n="entertain.drama"></span> <output id="enDramaVal">60%</output>
          <input type="range" id="enDrama" min="0" max="100" step="5" value="60" />
        </label>
        <label class="toggle"><input type="checkbox" id="enShake" checked /><span data-i18n="entertain.shake"></span></label>
        <label class="toggle"><input type="checkbox" id="enFace" checked /><span data-i18n="entertain.face"></span></label>
        <label class="toggle"><input type="checkbox" id="enProtect" checked /><span data-i18n="entertain.protect"></span></label>
        <button class="btn btn--sm" id="viralCaptions">${icons.captions}<span data-i18n="entertain.captions"></span></button>
      </div>
    </section>

    <section class="panel panel--multi" aria-label="multi" id="panel-multi">
      <h2 class="panel__title" data-i18n="section.multi"></h2>
      <div class="entertain" id="multiBox">
        <p class="empty-note" id="multiInfo" data-i18n="multi.hint"></p>
        <div class="chips" id="multiLen" role="group">
          ${[15, 30, 45, 60].map((n) => `<button type="button" data-mlen="${n}">${n}s</button>`).join('')}
        </div>
        <button class="btn btn--primary" id="findClips">${icons.spark}<span data-i18n="multi.find"></span></button>
        <div id="multiList"></div>
      </div>
    </section>

    <section class="panel panel--edit" aria-label="edit" id="panel-edit">
      <h2 class="panel__title" data-i18n="section.build"></h2>
      <div class="field">
        <button class="btn btn--primary" id="auto">${icons.spark}<span data-i18n="action.auto"></span></button>
        <div class="row">
          <button class="btn btn--sm" id="variant">${icons.wand}<span data-i18n="action.variant"></span></button>
          <span class="empty-note" id="seedLabel"></span>
        </div>
        <span class="empty-note" id="autoWhy" data-i18n="action.autoHint"></span>
      </div>

      <div class="field">
        <label data-i18n="quick.label"></label>
        <div class="chips chips--wrap" id="packs">
          ${STYLE_PACKS.map((p) => `<button type="button" data-pack="${p.id}" data-i18n="pack.${p.id}"></button>`).join('')}
        </div>
      </div>

      <details class="disclosure" id="settingsGroup">
        <summary>${icons.sliders}<span data-i18n="group.settings"></span></summary>
        <div class="field">
          <label for="template" data-i18n="template.label"></label>
          <select id="template">
            <option value="punch" data-i18n="template.punch"></option>
            <option value="flow" data-i18n="template.flow"></option>
            <option value="story" data-i18n="template.story"></option>
          </select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="aspect" data-i18n="aspect.label"></label>
            <select id="aspect">
              <option value="9:16">9:16 · Reels</option>
              <option value="4:5">4:5 · feed</option>
              <option value="1:1">1:1 · square</option>
            </select>
          </div>
          <div class="field">
            <label for="target"><span data-i18n="duration.label"></span> <output id="targetVal">12s</output></label>
            <input type="range" id="target" min="${MIN_DURATION}" max="60" step="1" value="12" />
            <div class="chips" id="lenChips" role="group">
              ${LENGTH_PRESETS.map((n) => `<button type="button" data-len="${n}">${n}s</button>`).join('')}
              <button type="button" data-len="manual" data-i18n="duration.manual"></button>
            </div>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="font" data-i18n="font.label"></label>
            <select id="font">${FONTS.map((f) => `<option value="${f.id}" style="font-family:${f.family}">${f.label}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="style" data-i18n="style.label"></label>
            <select id="style">${TEXT_STYLES.map((x) => `<option value="${x.id}">${x.label}</option>`).join('')}</select>
          </div>
        </div>
      </details>

      <details class="disclosure" id="textsGroup">
        <summary>${icons.captions}<span data-i18n="group.texts"></span></summary>
        <div class="grid-2">
          <div class="field">
            <label for="hook" data-i18n="hook.label"></label>
            <input type="text" id="hook" maxlength="80" />
          </div>
          <div class="field">
            <label for="cta" data-i18n="cta.label"></label>
            <input type="text" id="cta" maxlength="60" />
          </div>
        </div>
      </details>

      <details class="disclosure" id="audioGroup">
        <summary>${icons.music}<span data-i18n="group.audio"></span></summary>
        <div class="row">
          <button class="btn btn--sm" id="audioPick">${icons.music}<span data-i18n="audio.pick"></span></button>
          <button class="btn btn--sm btn--ghost" id="audioClear">${icons.close}<span data-i18n="audio.remove"></span></button>
        </div>
        <span class="empty-note" id="audioName" data-i18n="audio.none"></span>
        <input type="file" id="audioFile" accept="audio/*" hidden />
        <div class="audio" id="audioBox" hidden>
          <canvas class="wave" id="wave" aria-label="waveform"></canvas>
          <span class="empty-note" id="audioMeta"></span>
          <label class="block__range"><span data-i18n="audio.fragment"></span> <output id="audioInVal">0.0s</output>
            <input type="range" id="audioIn" min="0" max="10" step="0.1" value="0" />
          </label>
          <label class="toggle"><input type="checkbox" id="snapBeats" /><span data-i18n="audio.sync"></span></label>
          <button class="btn btn--sm" id="audioPreview">${icons.play}<span data-i18n="audio.preview"></span></button>
        </div>
      </details>

      <button class="btn btn--primary" id="rebuild">${icons.wand}<span data-i18n="action.rebuild"></span></button>
      <span class="empty-note" data-i18n="action.rebuildWarn"></span>
    </section>

    <section class="panel panel--blocks" aria-label="blocks" id="panel-blocks">
      <h2 class="panel__title" data-i18n="nav.blocks"></h2>
      <div id="blocks"></div>
    </section>

    <section class="panel panel--score" aria-label="score" id="panel-score">
      <h2 class="panel__title" data-i18n="score.title"></h2>
      <div id="scoreBody"></div>
      <button class="btn btn--primary" id="analyze">${icons.spark}<span data-i18n="action.analyze"></span></button>
      <a class="parent-link" href="${PARENT_SITE}" target="_blank" rel="noopener noreferrer">
        ${brandMark}<span><strong>MAI Softwares</strong><small data-i18n="footer.matriz"></small></span>${icons.external}
      </a>
      <div class="sources">
        <strong data-i18n="score.sources"></strong>
        ${SOURCES.map((x) => `<a href="${x.url}" target="_blank" rel="noopener noreferrer">${x.label}</a>`).join('')}
      </div>
    </section>
  </main>

  <footer class="footer">
    <a class="footer__parent" href="${PARENT_SITE}" target="_blank" rel="noopener noreferrer">
      ${brandMark}
      <span>
        <strong>MAI Softwares</strong>
        <small data-i18n="footer.matriz"></small>
      </span>
      ${icons.external}
    </a>
    <p class="footer__note" data-i18n="footer.privacy"></p>
    <nav class="footer__links">
      <a href="${PARENT_SITE}" target="_blank" rel="noopener noreferrer" data-i18n="footer.site"></a>
      <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
      <span data-i18n="footer.license"></span>
    </nav>
  </footer>`;
}

app.innerHTML = shell();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const viewport = $('viewport');
const viewportEmpty = $('viewportEmpty');
const strip = $('strip');
const blocksBox = $('blocks');
const ticks = $('ticks');
const scrub = $<HTMLInputElement>('scrub');
const timeLabel = $('time');
const playBtn = $('play');
const exportBtn = $<HTMLButtonElement>('export');
const analyzeBtn = $<HTMLButtonElement>('analyze');
const scoreBody = $('scoreBody');
const scoreChip = $<HTMLButtonElement>('scoreChip');
const hookInput = $<HTMLInputElement>('hook');
const ctaInput = $<HTMLInputElement>('cta');
const scriptInput = $<HTMLTextAreaElement>('script');
const templateSel = $<HTMLSelectElement>('template');
const aspectSel = $<HTMLSelectElement>('aspect');
const fontSel = $<HTMLSelectElement>('font');
const styleSel = $<HTMLSelectElement>('style');
const targetRange = $<HTMLInputElement>('target');
const importProgress = $('importProgress');
const importBar = $('importBar');
const importLabel = $('importLabel');
const audioBox = $('audioBox');
const wave = $<HTMLCanvasElement>('wave');
const audioInRange = $<HTMLInputElement>('audioIn');
const snapBeats = $<HTMLInputElement>('snapBeats');

const renderer = new ReelRenderer(state.project.aspect, previewScale());
viewport.appendChild(renderer.canvas);

const player = new Player(renderer, {
  getProject: () => state.project,
  resolve: assetById,
  getAudio: () => state.audio,
  onTime: (time) => {
    state.time = time;
    updateTransport();
  },
  safeZones: () => state.showSafeZones,
});

let score: ScoreResult | null = null;
let analyzing = false;
let scoreStale = true;
let exporting = false;
let analyzeTimer = 0;
let lastPlaying: boolean | null = null;
let lastStats: MediaStats | null = null;
let lastReasons: Reason[] = [];
let sourceAudio: SourceAudio | null = null;
let voice: VoiceMap | null = null;
let highlights: Highlight[] = [];
let multiLength = 30;
let focusPoint: { x: number; y: number } | null = null;
let cues: Cue[] = [];

/* ---------- i18n ---------- */

function applyI18n(): void {
  setLang(state.lang);
  document.title = `MAI-Reel — ${t('app.tagline')}`;
  for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    node.textContent = t(node.dataset.i18n!);
  }
  hookInput.placeholder = t('hook.placeholder');
  ctaInput.placeholder = t('cta.placeholder');
  scriptInput.placeholder = t('script.placeholder');
  // the score details and the director log are baked strings: rebuild them in the new language
  if (lastStats && score) score = scoreProject(state.project, lastStats);
  renderScore();
  renderStrip();
  renderBlocks();
  renderReasons();
  renderTranscript();
}

/* ---------- media ---------- */

function showImportProgress(done: number, total: number): void {
  if (done >= total) {
    importProgress.hidden = true;
    return;
  }
  importProgress.hidden = false;
  importBar.style.width = `${Math.round((done / total) * 100)}%`;
  importLabel.textContent = `${t('media.processing')} ${done}/${total}`;
}

async function addFiles(files: File[]): Promise<void> {
  if (!files.length) return;
  showImportProgress(0, files.length);
  let added: Awaited<ReturnType<typeof loadFiles>> = [];
  try {
    added = await loadFiles(files, (done) => showImportProgress(done, files.length));
  } finally {
    importProgress.hidden = true;
  }
  if (!added.length) return;

  const hadClips = state.project.clips.length > 0;
  capturedAudio = null;
  state.assets.push(...added);
  if (hadClips) {
    appendAssets(state.project, added);
    touch();
  } else {
    rebuild();
  }
  renderStrip();
  renderBlocks();
  renderTranscribePlayer();
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
        <button class="thumb__del" data-del="${a.id}" aria-label="${t('clip.delete')} ${a.name}">${icons.close}</button>
      </div>`,
    )
    .join('');
  $('mediaCount').textContent = `${state.assets.length} ${t('media.count')}`;
  viewportEmpty.hidden = state.assets.length > 0;
  updateBadges();
}

/* ---------- build ---------- */

function currentBeats(): number[] | undefined {
  if (!snapBeats.checked || !state.audio) return undefined;
  const beats = beatsInFragment(state.audio, Number(targetRange.value));
  return beats.length > 3 ? beats : undefined;
}

function rebuild(seed?: number): void {
  const aspect = aspectSel.value as Aspect;
  state.project = buildProject(state.assets, {
    seed: seed ?? randomSeed(),
    beats: currentBeats(),
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
  player.seek(0);
  touch();
  renderScore();
  renderBlocks();
  renderSeed();
}

function applyAspect(aspect: Aspect): void {
  renderer.resize(aspect);
  const [w, h] = SIZES[aspect];
  viewport.style.aspectRatio = `${w} / ${h}`;
}

/** Marks the score as outdated, refreshes the timeline UI and schedules a re-analysis. */
function touch(): void {
  relayout(state.project);
  scoreStale = true;
  player.seek(Math.min(state.time, totalDuration(state.project)));
  updateTransport();
  renderTicks();
  updateBadges();
  scheduleAnalyze();
}

function scheduleAnalyze(): void {
  clearTimeout(analyzeTimer);
  if (!state.assets.length || state.project.clips.length > AUTO_ANALYZE_MAX_CLIPS) return;
  analyzeTimer = window.setTimeout(() => {
    if (!player.playing && !exporting) void analyze();
  }, AUTO_ANALYZE_MS);
}

function renderTicks(): void {
  const dur = totalDuration(state.project);
  if (!dur) {
    ticks.innerHTML = '';
    return;
  }
  ticks.innerHTML = state.project.clips
    .slice(1)
    .map((c) => `<span style="left:${((c.start / dur) * 100).toFixed(2)}%"></span>`)
    .join('');
}

function updateBadges(): void {
  scoreChip.hidden = !score;
  if (score) {
    $('scoreChipVal').textContent = String(score.total);
    scoreChip.dataset.stale = String(scoreStale);
  }
}

let lastWaveTime = -1;

function renderAudio(): void {
  const track = state.audio;
  audioBox.hidden = !track;
  snapBeats.disabled = !track || track.beats.length < 4;
  if (!track) return;
  const len = Number(targetRange.value);
  audioInRange.max = Math.max(0, track.duration - len).toFixed(1);
  if (Number(audioInRange.value) > Number(audioInRange.max)) audioInRange.value = audioInRange.max;
  track.in = Number(audioInRange.value);
  $('audioInVal').textContent = `${track.in.toFixed(1)}s`;
  $('audioMeta').textContent = track.bpm
    ? `${track.name} · ${track.duration.toFixed(1)}s · ${track.bpm} BPM · ${track.beats.length} ${t('audio.beats')}`
    : `${track.name} · ${track.duration.toFixed(1)}s · ${t('audio.nobeats')}`;
  drawWaveform(wave, track, len, state.time);
  lastWaveTime = state.time;
}

function updateTransport(): void {
  const dur = totalDuration(state.project);
  scrub.max = String(Math.max(0.1, dur));
  scrub.value = String(state.time);
  scrub.style.setProperty('--played', `${dur ? (state.time / dur) * 100 : 0}%`);
  timeLabel.textContent = `${state.time.toFixed(1)} / ${dur.toFixed(1)}s`;
  // Only touch the icon when the state flips: rewriting it every frame detaches the node
  // under the pointer between pointerdown and pointerup, which swallows the click.
  if (lastPlaying !== player.playing) {
    lastPlaying = player.playing;
    playBtn.innerHTML = player.playing ? icons.pause : icons.play;
    playBtn.setAttribute('aria-label', player.playing ? t('action.pause') : t('action.play'));
  }
  exportBtn.disabled = !state.assets.length || exporting;
  analyzeBtn.disabled = !state.assets.length || analyzing;
  if (state.audio && Math.abs(state.time - lastWaveTime) > 0.08) {
    lastWaveTime = state.time;
    drawWaveform(wave, state.audio, Number(targetRange.value), state.time);
  }
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
  const active = state.time >= clip.start && state.time < clip.start + clip.duration;
  return `<article class="block ${active ? 'block--active' : ''}" data-clip="${clip.id}">
    <div class="block__head">
      <button class="block__seek" data-seek="${clip.start}" aria-label="${t('block.seek')}">
        <img class="block__thumb" data-id="${clip.assetId}" src="${asset?.thumb ?? ''}" alt="" />
        <span class="block__index">${index + 1}</span>
      </button>
      <span class="block__time">${clip.start.toFixed(1)}s</span>
      <span class="block__spacer"></span>
      <button class="btn btn--icon btn--ghost" data-move="up" aria-label="${t('clip.up')}" ${index === 0 ? 'disabled' : ''}>${icons.up}</button>
      <button class="btn btn--icon btn--ghost" data-move="down" aria-label="${t('clip.down')}" ${index === state.project.clips.length - 1 ? 'disabled' : ''}>${icons.down}</button>
      <button class="btn btn--icon btn--ghost btn--danger" data-remove aria-label="${t('clip.delete')}">${icons.trash}</button>
    </div>
    <div class="block__grid">
      <label>${t('clip.effect')}
        <select data-field="effect">${options(EFFECTS, clip.effect, (v) => `effect.${v}`)}</select>
      </label>
      <label>${t('clip.transition')}
        <select data-field="transition">${options(TRANSITIONS, clip.transition, (v) => `trans.${v}`)}</select>
      </label>
      <label>${t('clip.grade')}
        <select data-field="grade">${options(GRADES, clip.grade ?? 'none', (v) => `grade.${v}`)}</select>
      </label>
    </div>
    <button class="btn btn--sm btn--ghost" data-addtext="${clip.id}">${icons.captions}<span>${t('block.addText')}</span></button>
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
  const active = state.time >= o.start && state.time <= o.end;
  return `<article class="block ${active ? 'block--active' : ''}" data-text="${o.id}">
    <div class="block__head">
      <button class="block__tag block__tag--${o.role}" data-seek="${o.start}" aria-label="${t('block.seek')}">${t(`role.${o.role}`)}</button>
      <span class="block__time">${o.start.toFixed(1)}-${o.end.toFixed(1)}s</span>
      <span class="block__spacer"></span>
      <button class="btn btn--icon btn--ghost btn--danger" data-remove aria-label="${t('clip.delete')}">${icons.trash}</button>
    </div>
    <input type="text" data-field="text" value="${o.text.replace(/"/g, '&quot;')}" aria-label="${t('role.' + o.role)}" />
    <div class="block__grid">
      <label>${t('font.label')}
        <select data-field="fontId">${FONTS.map((f) => `<option value="${f.id}" ${f.id === o.fontId ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
      </label>
      <label>${t('style.label')}
        <select data-field="styleId">${TEXT_STYLES.map((s) => `<option value="${s.id}" ${s.id === o.styleId ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      </label>
      <label>${t('text.anim')}
        <select data-field="anim">${ANIMS.map((a) => `<option value="${a}" ${a === (o.anim ?? 'fade') ? 'selected' : ''}>${t(`anim.${a}`)}</option>`).join('')}</select>
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
    <h3 class="panel__title">${t('blocks.clips')} <em>${state.project.clips.length}</em></h3>
    <div class="blocks">${state.project.clips.map((_, i) => clipCard(i)).join('')}</div>
    <h3 class="panel__title" style="margin-top:16px">${t('blocks.texts')} <em>${state.project.texts.length}</em></h3>
    <div class="blocks">${state.project.texts.map(textCard).join('')}</div>
    <button class="btn" id="addText">${icons.plus}<span>${t('blocks.addText')}</span></button>`;
}

blocksBox.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('#addText')) {
    const dur = totalDuration(state.project);
    state.project.texts.push({
      id: uid('t'),
      text: t('blocks.newText'),
      start: Math.min(state.time, Math.max(0, dur - 1.5)),
      end: Math.min(dur, Math.max(1.5, state.time + 2.2)),
      role: 'caption',
      y: 0.74,
      size: 56,
      fontId: fontSel.value,
      styleId: styleSel.value,
      anim: 'pop',
    });
    touch();
    renderBlocks();
    return;
  }

  const addText = target.closest<HTMLElement>('[data-addtext]');
  if (addText) {
    const clip = state.project.clips.find((c) => c.id === addText.dataset.addtext);
    if (clip) {
      state.project.texts.push({
        id: uid('t'),
        text: t('blocks.newText'),
        start: clip.start + 0.05,
        end: clip.start + Math.max(0.8, clip.duration - 0.05),
        role: 'caption',
        y: 0.5,
        size: 60,
        fontId: fontSel.value,
        styleId: styleSel.value,
        anim: 'pop',
      });
      touch();
      renderBlocks();
      player.seek(clip.start);
    }
    return;
  }

  const seek = target.closest<HTMLElement>('[data-seek]');
  if (seek) {
    player.pause();
    player.seek(Number(seek.dataset.seek));
    updateTransport();
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
    if (field === 'grade') clip.grade = input.value as Grade;
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
    if (field === 'anim') o.anim = input.value as TextAnim;
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
    updateBadges();
    return;
  }
  const sourceLabel = (id: string) => SOURCES.find((s) => s.id === id);
  scoreBody.innerHTML = `
    <div class="score">
      ${gauge(score.total)}
      <div class="score__text">
        <h3>${t('score.title')}</h3>
        ${analyzing ? `<span class="pill pill--live">${t('score.updating')}</span>` : scoreStale ? `<span class="pill">${t('score.stale')}</span>` : ''}
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
  updateBadges();
}

async function analyze(): Promise<void> {
  if (!state.assets.length || analyzing) return;
  analyzing = true;
  updateTransport();
  renderScore();
  const wasPlaying = player.playing;
  player.pause();
  try {
    const media = await analyzeMedia(state.project, assetById);
    lastStats = media;
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
  exporting = true;
  exportBtn.disabled = true;
  exportBtn.dataset.progress = '0';
  const safeWas = state.showSafeZones;
  state.showSafeZones = false;
  clearTimeout(analyzeTimer);

  try {
    player.pause();
    player.seek(0);
    await ensureFontsLoaded();
    renderer.setScale(1);
    applyAspect(state.project.aspect);
    player.seek(0);

    const dur = totalDuration(state.project);
    const { blob, mime } = await recordCanvas({
      canvas: renderer.canvas,
      fps: state.project.fps,
      audio: state.audio?.el ?? null,
      run: () =>
        new Promise<void>((resolve) => {
          const iv = setInterval(() => {
            const pct = dur ? Math.min(100, Math.round((player.time / dur) * 100)) : 0;
            label.textContent = `${t('action.exporting')} ${pct}%`;
            exportBtn.style.setProperty('--progress', `${pct}%`);
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
    renderer.setScale(previewScale());
    applyAspect(state.project.aspect);
    state.showSafeZones = safeWas;
    label.textContent = prev;
    exportBtn.style.removeProperty('--progress');
    exporting = false;
    player.seek(0);
    updateTransport();
  }
}

/* ---------- tabs ---------- */

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
  renderTranscribePlayer();
});

$('clear').addEventListener('click', () => {
  for (const a of state.assets) URL.revokeObjectURL(a.url);
  state.assets = [];
  score = null;
  cues = [];
  capturedAudio = null;
  clearEmbed();
  rebuild();
  renderStrip();
  renderTranscript();
  renderTranscribePlayer();
});

playBtn.addEventListener('click', () => {
  if (player.playing) player.pause();
  else {
    trMedia?.pause();
    player.play();
  }
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
  markPreset();
  if (state.audio) renderAudio();
});
targetRange.addEventListener('change', () => rebuild());
templateSel.addEventListener('change', () => {
  targetRange.value = String(TEMPLATES[templateSel.value as TemplateId].target);
  $('targetVal').textContent = `${targetRange.value}s`;
  rebuild();
});

for (const input of [hookInput, ctaInput]) {
  input.addEventListener('change', () => {
    const role = input === hookInput ? 'hook' : 'cta';
    const existing = state.project.texts.find((x) => x.role === role);
    const value = input.value.trim();
    if (existing && value) existing.text = value;
    else if (existing) state.project.texts = state.project.texts.filter((x) => x !== existing);
    else if (value) rebuild();
    touch();
    renderBlocks();
  });
}

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

$('rebuild').addEventListener('click', () => rebuild());
analyzeBtn.addEventListener('click', () => void analyze());
exportBtn.addEventListener('click', () => void exportVideo());
scoreChip.addEventListener('click', () => {
  $('panel-score').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('audioPick').addEventListener('click', () => $<HTMLInputElement>('audioFile').click());
$<HTMLInputElement>('audioFile').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  $('audioName').textContent = `${t('media.processing')}…`;
  const track = await loadAudioFile(file);
  state.audio?.el.pause();
  state.audio = track;
  state.audioFile = file;
  $('audioName').textContent = file.name;
  ($('audioGroup') as HTMLDetailsElement).open = true;
  audioInRange.value = '0';
  renderAudio();
  if (track.bpm) toast(`${track.bpm} BPM · ${track.beats.length} ${t('audio.beats')}`);
});
$('audioClear').addEventListener('click', () => {
  state.audio?.el.pause();
  state.audio = null;
  state.audioFile = null;
  snapBeats.checked = false;
  $('audioName').textContent = t('audio.none');
  renderAudio();
});
audioInRange.addEventListener('input', () => {
  if (!state.audio) return;
  state.audio.in = Number(audioInRange.value);
  $('audioInVal').textContent = `${state.audio.in.toFixed(1)}s`;
  drawWaveform(wave, state.audio, Number(targetRange.value), state.time);
});
audioInRange.addEventListener('change', () => {
  player.seek(state.time);
  if (snapBeats.checked) rebuild();
});
snapBeats.addEventListener('change', () => {
  if (snapBeats.checked && !currentBeats()) {
    snapBeats.checked = false;
    toast(t('audio.nobeats'));
    return;
  }
  rebuild();
});
$('audioPreview').addEventListener('click', () => {
  player.seek(0);
  player.play();
  updateTransport();
});

$('lenChips').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-len]');
  if (!btn) return;
  if (btn.dataset.len === 'manual') {
    targetRange.focus();
    return;
  }
  targetRange.value = btn.dataset.len!;
  $('targetVal').textContent = `${targetRange.value}s`;
  markPreset();
  renderAudio();
  rebuild();
});

function markPreset(): void {
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>('[data-len]'))) {
    btn.setAttribute('aria-pressed', String(btn.dataset.len === targetRange.value));
  }
}

$<HTMLSelectElement>('lang').addEventListener('change', (e) => {
  state.lang = (e.target as HTMLSelectElement).value as Lang;
  applyI18n();
  if (state.audio) renderAudio();
});

/** Keeps the sticky stage docked right under the header, whatever height it currently has. */
function syncHeaderHeight(): void {
  const h = $('topbar').getBoundingClientRect().height;
  document.body.style.setProperty('--header-h', `${Math.round(h)}px`);
}
new ResizeObserver(syncHeaderHeight).observe($('topbar'));
function syncPreviewScale(): void {
  if (exporting || renderer.canvas.width === Math.round(SIZES[state.project.aspect][0] * previewScale())) return;
  renderer.setScale(previewScale());
  applyAspect(state.project.aspect);
  player.seek(state.time);
}
wideScreen.addEventListener('change', syncPreviewScale);
window.addEventListener('resize', () => {
  syncHeaderHeight();
  syncPreviewScale();
  if (state.audio) drawWaveform(wave, state.audio, Number(targetRange.value), state.time);
});
window.addEventListener('scroll', () => {
  document.body.dataset.scrolled = String(window.scrollY > 12);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (player.playing) player.pause();
    else player.play();
    updateTransport();
  }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    player.pause();
    player.seek(state.time + (e.code === 'ArrowRight' ? 0.2 : -0.2));
    updateTransport();
  }
});







/* ---------- extractor service: paste a link, get the transcript ---------- */

let pendingLink = '';

function refreshLinkJob(): void {
  const show = Boolean(pendingLink) && hasExtractor();
  $('linkJobBox').hidden = !show;
  // with a server the tab capture is only the fallback, so it steps aside
  $('captureBox').hidden = !pendingLink || show || !isCaptureSupported();
}

/** One button: subtitles from the platform when they exist, audio + Whisper when they do not. */
async function transcribeLink(): Promise<void> {
  if (!pendingLink) return;
  const button = $<HTMLButtonElement>('linkTranscribe');
  const status = $('linkJobStatus');
  button.disabled = true;
  status.textContent = t('ext.working');

  try {
    const result = await fetchLinkTranscript(pendingLink, $<HTMLSelectElement>('asrLang').value);
    cues = splitCues(result.cues);
    scriptInput.value = result.cues.map((c) => c.text).join(' ');
    renderTranscript();
    activeCue = -1;
    highlightCue();
    status.textContent = `${result.title ?? ''} · ${cues.length} ${t('asr.blocks')}`.trim();
    if (totalDuration(state.project) > 0.2) applyCues();
    return;
  } catch (err) {
    const reason = err instanceof ExtractorError ? err.reason : 'extractor';
    if (reason !== 'nocaptions') {
      status.textContent = t(`ext.error.${reason}`);
      button.disabled = false;
      return;
    }
    status.textContent = t('ext.noCaptions');
  }

  // no subtitles on the platform: pull the audio and run Whisper here
  try {
    status.textContent = t('ext.downloading');
    capturedAudio = await fetchLinkAudio(pendingLink);
    status.textContent = `${(capturedAudio.size / 1048576).toFixed(1)} MB · ${t('asr.running')}`;
    await runTranscription();
    status.textContent = '';
  } catch (err) {
    const reason = err instanceof ExtractorError ? err.reason : 'extractor';
    status.textContent = t(`ext.error.${reason}`);
  } finally {
    button.disabled = false;
  }
}

async function saveExtractor(): Promise<void> {
  const input = $<HTMLInputElement>('extractorUrl');
  const status = $('extractorStatus');
  status.textContent = t('ext.checking');
  const health = await checkExtractor(input.value);
  if (!health.ok) {
    status.textContent = t('ext.error.network');
    return;
  }
  setExtractorUrl(input.value);
  status.textContent = `${t('ext.ready')} · yt-dlp ${health.ytdlp ?? ''}`.trim();
  refreshLinkJob();
}

/* ---------- platform embeds and tab-audio capture ---------- */

let embed: EmbedInfo | null = null;
let capture: Capture | null = null;
let captureTimer = 0;

/** Mounts the official embed of a platform link so it can at least be watched here. */
function showEmbed(info: EmbedInfo, url: string): void {
  embed = info;
  trMedia?.pause();
  trMedia = null;
  const holder = $('trPlayerMedia');
  holder.innerHTML = `<iframe class="embed ${info.vertical ? 'embed--vertical' : ''}" src="${info.src}"
    title="${info.platform}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
    allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  $('trPlayerName').textContent = url;
  $('trPlayerBox').hidden = false;
  $('captureStatus').textContent = isCaptureSupported() ? '' : t('cap.unsupported');
  activeCue = -1;
}

function clearEmbed(): void {
  embed = null;
  pendingLink = '';
  $('captureBox').hidden = true;
  $('linkJobBox').hidden = true;
}

/** Records what this tab is playing and sends that audio to Whisper. */
async function startCapture(): Promise<void> {
  try {
    capture = await captureTabAudio();
  } catch (err) {
    const reason = err instanceof CaptureError ? err.reason : 'denied';
    $('captureStatus').textContent = t(`cap.error.${reason}`);
    return;
  }
  $('captureStart').hidden = true;
  $('captureStop').hidden = false;
  captureTimer = window.setInterval(() => {
    $('captureStatus').textContent = `${t('cap.recording')} ${capture ? capture.elapsed().toFixed(0) : 0}s`;
  }, 500);
  $('captureStatus').textContent = t('cap.recording');
}

async function stopCapture(): Promise<void> {
  if (!capture) return;
  clearInterval(captureTimer);
  const blob = await capture.stop();
  capture = null;
  $('captureStart').hidden = false;
  $('captureStop').hidden = true;

  if (blob.size < 2000) {
    $('captureStatus').textContent = t('cap.error.noaudio');
    return;
  }
  $('captureStatus').textContent = `${(blob.size / 1048576).toFixed(1)} MB · ${t('asr.running')}`;
  capturedAudio = new File([blob], 'captura.webm', { type: blob.type });
  await runTranscription();
  $('captureStatus').textContent = '';
}

/* ---------- transcribe player ---------- */

let trMedia: HTMLMediaElement | null = null;
let activeCue = -1;
let capturedAudio: File | null = null;

/** Source used by the transcribe section: the imported video, or the loaded audio track. */
function transcribeSource(): { url: string; name: string; kind: 'video' | 'audio' } | null {
  const video = state.assets.find((a) => a.kind === 'video');
  if (video) return { url: video.url, name: video.name, kind: 'video' };
  if (state.audio) return { url: state.audio.el.src, name: state.audio.name, kind: 'audio' };
  return null;
}

/**
 * Its own element, not the one the canvas renderer drives: here the media plays with sound and
 * native controls, and the reel preview keeps its muted copy for rendering.
 */
function renderTranscribePlayer(): void {
  const box = $('trPlayerBox');
  const holder = $('trPlayerMedia');
  const source = transcribeSource();
  if (source && embed) clearEmbed();
  if (!source && embed) return; // the embed owns the box until the user imports a file

  if (!source) {
    if (trMedia) {
      trMedia.pause();
      trMedia.remove();
      trMedia = null;
    }
    holder.innerHTML = '';
    box.hidden = true;
    return;
  }

  if (trMedia && trMedia.getAttribute('src') === source.url) {
    $('trPlayerName').textContent = source.name;
    box.hidden = false;
    return;
  }

  trMedia?.pause();
  holder.innerHTML = '';
  const el = document.createElement(source.kind === 'video' ? 'video' : 'audio');
  el.src = source.url;
  el.controls = true;
  el.preload = 'metadata';
  if (el instanceof HTMLVideoElement) el.playsInline = true;
  el.addEventListener('timeupdate', highlightCue);
  el.addEventListener('seeked', highlightCue);
  holder.appendChild(el);
  trMedia = el;
  $('trPlayerName').textContent = source.name;
  box.hidden = false;
}

/** Follows the playhead through the transcript, the way a karaoke line would. */
function highlightCue(): void {
  if (!trMedia || !cues.length) return;
  const time = trMedia.currentTime;
  const index = cues.findIndex((c) => time >= c.start && time < c.end);
  if (index === activeCue) return;
  activeCue = index;

  const items = Array.from(document.querySelectorAll<HTMLElement>('#transcript [data-cue]'));
  items.forEach((item, i) => item.classList.toggle('is-active', i === index));
  if (index >= 0 && $<HTMLInputElement>('trFollow').checked) {
    items[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------- transcript panel ---------- */

function stamp(seconds: number, srt = false): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (!srt) return h ? `${h}:${base}` : base;
  return `${String(h).padStart(2, '0')}:${base},${String(ms).padStart(3, '0')}`;
}

function renderTranscript(): void {
  const box = $('transcript');
  $('transcriptActions').hidden = cues.length === 0;
  if (!cues.length) {
    box.innerHTML = `<p class="empty-note">${t('tr.empty')}</p>`;
    return;
  }
  box.innerHTML = `<ol class="cues">${cues
    .map(
      (c, i) => `<li><button data-cue="${i}"><span class="cues__time">${stamp(c.start)}</span><span>${c.text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</span></button></li>`,
    )
    .join('')}</ol>`;
}

function toSrt(list: Cue[]): string {
  return list
    .map((c, i) => `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.text}\n`)
    .join('\n');
}

function downloadText(text: string, filename: string, type = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/* ---------- link import and transcription ---------- */

async function loadFromLink(): Promise<void> {
  const input = $<HTMLInputElement>('linkUrl');
  const status = $('linkStatus');
  const url = input.value.trim();
  if (!url) return;

  const info = embedFor(url);
  if (info) {
    pendingLink = url;
    showEmbed(info, url);
    refreshLinkJob();
    status.textContent = hasExtractor()
      ? tf('link.ready', { host: info.platform })
      : tf('link.embedded', { host: info.platform });
    return;
  }

  const platform = platformOf(url);
  if (platform) {
    status.textContent = tf('link.platform', { host: platform });
    return;
  }

  const btn = $<HTMLButtonElement>('linkLoad');
  btn.disabled = true;
  status.textContent = t('link.loading');
  try {
    const file = await fetchMediaFromUrl(url, (loaded, total) => {
      status.textContent = total
        ? `${t('link.loading')} ${Math.round((loaded / total) * 100)}%`
        : `${t('link.loading')} ${(loaded / 1048576).toFixed(1)} MB`;
    });
    if (file.type.startsWith('audio/')) {
      const track = await loadAudioFile(file);
      state.audio?.el.pause();
      state.audio = track;
      state.audioFile = file;
      ($('audioGroup') as HTMLDetailsElement).open = true;
      $('audioName').textContent = file.name;
      audioInRange.value = '0';
      renderAudio();
      renderTranscribePlayer();
    } else {
      await addFiles([file]);
    }
    status.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    input.value = '';
  } catch (err) {
    const reason = err instanceof LinkError ? err.reason : 'network';
    status.textContent = t(`link.error.${reason}`);
  } finally {
    btn.disabled = false;
  }
}

/** Runs Whisper on the imported video and turns the transcript into caption blocks. */
async function runTranscription(): Promise<void> {
  const source =
    capturedAudio ??
    state.assets.find((a) => a.kind === 'video' && a.file)?.file ??
    state.audioFile ??
    state.assets.find((a) => a.file)?.file;
  if (!source) {
    toast(t('asr.needMedia'));
    return;
  }
  if (!isTranscriptionSupported()) {
    toast(t('asr.unsupported'));
    return;
  }

  const btn = $<HTMLButtonElement>('transcribe');
  const bar = $('asrBar');
  const label = $('asrLabel');
  btn.disabled = true;
  $('asrProgress').hidden = false;
  label.textContent = t('asr.loading');
  player.pause();

  try {
    const found = await transcribeFile(source, {
      language: $<HTMLSelectElement>('asrLang').value,
      onProgress: (p) => {
        bar.style.width = `${Math.round(p.progress * 100)}%`;
        label.textContent = p.stage === 'download' ? `${t('asr.loading')} ${Math.round(p.progress * 100)}%` : t('asr.running');
      },
    });
    cues = splitCues(found);
    scriptInput.value = found.map((c) => c.text).join(' ');
    renderTranscript();
    activeCue = -1;
    highlightCue();
    label.textContent = `${cues.length} ${t('asr.blocks')}`;
    if (!cues.length) toast(t('asr.empty'));
    else if (totalDuration(state.project) > 0.2) applyCues();
  } catch (err) {
    label.textContent = t('asr.failed');
    toast(String(err instanceof Error ? err.message : err).slice(0, 120));
  } finally {
    btn.disabled = false;
  }
}

/** Writes the transcript onto the timeline with its real timings, trimmed to the current clip. */
function applyCues(): void {
  if (!cues.length) return;
  const duration = totalDuration(state.project);
  if (duration < 0.2) {
    // there is a transcript but no timeline to put it on yet
    toast(t('asr.needMedia'));
    return;
  }
  const offset = state.project.clips[0]?.srcIn ?? 0;
  state.project.texts = state.project.texts.filter((x) => x.role !== 'caption');

  let added = 0;
  for (const cue of cues) {
    const start = cue.start - offset;
    const end = cue.end - offset;
    if (end <= 0.05 || start >= duration) continue;
    state.project.texts.push({
      id: uid('t'),
      text: cue.text,
      start: Math.max(0, start),
      end: Math.min(duration, Math.max(start + 0.4, end)),
      role: 'caption',
      y: 0.74,
      size: 56,
      fontId: fontSel.value,
      styleId: styleSel.value,
      anim: 'pop',
    });
    added++;
  }
  touch();
  renderBlocks();
  toast(`${added} ${t('toast.captions')}`);
}

/* ---------- quick styles, auto director, entertainment mode ---------- */

function applyPack(id: string): void {
  const pack = packById(id);
  templateSel.value = pack.template;
  fontSel.value = pack.fontId;
  styleSel.value = pack.styleId;
  targetRange.value = String(Math.max(MIN_DURATION, Number(targetRange.value)));
  state.packId = id;
  rebuild();
  for (const clip of state.project.clips) clip.grade = pack.grade;
  for (const text of state.project.texts) text.anim = pack.anim;
  touch();
  renderBlocks();
  markPacks();
}

function renderSeed(): void {
  $('seedLabel').textContent = state.project.seed ? `#${seedCode(state.project.seed)}` : '';
}

function renderReasons(): void {
  $('autoWhy').textContent = lastReasons.length
    ? lastReasons.map(formatReason).join(' · ')
    : t('action.autoHint');
}

function markPacks(): void {
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>('[data-pack]'))) {
    btn.setAttribute('aria-pressed', String(btn.dataset.pack === state.packId));
  }
}

async function autoEdit(): Promise<void> {
  if (!state.assets.length || analyzing) return;
  analyzing = true;
  updateTransport();
  player.pause();
  try {
    const stats = await analyzeMedia(state.project, assetById);
    lastStats = stats;
    const assetRank = new Map<string, number>();
    for (const clip of state.project.clips) {
      const stat = stats.perClip.find((c) => c.clipId === clip.id);
      if (!stat) continue;
      const value = stat.stats.contrast * 0.6 + stat.stats.sharpness * 0.4;
      assetRank.set(clip.assetId, Math.max(assetRank.get(clip.assetId) ?? 0, value));
    }
    const result = autoDirect({
      assets: state.assets,
      stats,
      assetRank,
      bpm: state.audio?.bpm,
      beats: currentBeats(),
      hook: hookInput.value.trim() || undefined,
      cta: ctaInput.value.trim() || undefined,
      script: scriptInput.value.trim() || undefined,
      aspect: aspectSel.value as Aspect,
    });
    if (!result) return;
    state.project = result.project;
    state.packId = result.decision.pack.id;
    templateSel.value = result.decision.pack.template;
    fontSel.value = result.decision.pack.fontId;
    styleSel.value = result.decision.pack.styleId;
    targetRange.value = String(result.decision.target);
    $('targetVal').textContent = `${result.decision.target}s`;
    markPreset();
    markPacks();
    applyAspect(state.project.aspect);
    score = scoreProject(state.project, stats);
    scoreStale = false;
    lastReasons = result.reasons;
    renderReasons();
    player.seek(0);
    updateTransport();
    renderTicks();
    renderBlocks();
    renderScore();
    toast(`${t('auto.done')} ${result.score}/100`);
  } finally {
    analyzing = false;
    updateTransport();
  }
}

function enhanceFromUI(): void {
  const en = state.project.enhance;
  en.intensity = Number($<HTMLInputElement>('enIntensity').value) / 100;
  en.drama = Number($<HTMLInputElement>('enDrama').value) / 100;
  en.shake = $<HTMLInputElement>('enShake').checked;
  en.faceZoom = $<HTMLInputElement>('enFace').checked;
  en.protectCaptions = $<HTMLInputElement>('enProtect').checked;
  $('enIntensityVal').textContent = `${Math.round(en.intensity * 100)}%`;
  $('enDramaVal').textContent = `${Math.round(en.drama * 100)}%`;
  player.seek(state.time);
}

async function setMode(mode: ReelMode): Promise<void> {
  document.body.dataset.mode = mode;

  if (mode === 'build') {
    state.project.enhance = idleEnhance();
    rebuild();
    return;
  }

  const video = state.assets.find((a) => a.kind === 'video');
  if (!video) {
    toast(t('entertain.needVideo'));
    return;
  }

  await analyseSource(video, mode);
  if (mode === 'viral') applyViral(video, 0, video.srcDuration || sourceAudio?.duration || 15);
  else renderHighlights();
}

/** Sections are the top-level navigation: each one shows only the panels it needs. */
async function setSection(section: Section, remember = true): Promise<void> {
  document.body.dataset.section = section;
  for (const btn of Array.from(document.querySelectorAll<HTMLElement>('#sections [data-section]'))) {
    btn.setAttribute('aria-selected', String(btn.dataset.section === section));
  }
  if (remember) {
    localStorage.setItem('mai-reel-section', section);
    if (location.hash.slice(1) !== section) history.replaceState(null, '', `#${section}`);
  }
  syncPreviewScale();
  renderTranscribePlayer();
  if (section !== 'transcribe') trMedia?.pause();

  if (section === 'boost') await setMode('viral');
  else if (section === 'multi') await setMode('multi');
  else if (section === 'build') await setMode('build');
  // the transcribe section does not touch the project: it only needs the media and Whisper
}

/** Decodes the video's own audio once: beats, loudness, voice activity and framing. */
async function analyseSource(video: MediaAsset, mode: ReelMode): Promise<void> {
  const info = mode === 'multi' ? $('multiInfo') : $('entertainInfo');
  info.textContent = t('entertain.analyzing');
  player.pause();
  const [audio, focus] = await Promise.all([
    video.file ? analyzeFileAudio(video.file) : Promise.resolve(null),
    detectFocus(video),
  ]);
  sourceAudio = audio;
  voice = audio ? detectVoice(audio) : null;
  focusPoint = focus ? { x: focus.x, y: focus.y } : null;
  info.textContent = [
    audio?.bpm ? `${audio.bpm} BPM` : t('entertain.nobeat'),
    voice ? `${voice.speech.length} ${t('voice.segments')} · ${Math.round(voice.coverage * 100)}%` : t('voice.none'),
    focus ? t('entertain.face.found') : t('entertain.face.none'),
  ].join(' · ');
}

/** Enhance payload rebuilt from the analysis, shifted to the clip's own timeline. */
function enhanceFor(offset: number): Enhance {
  const shift = (list: number[]) => list.map((v) => v - offset).filter((v) => v >= -0.5);
  return {
    ...idleEnhance(),
    enabled: true,
    intensity: Number($<HTMLInputElement>('enIntensity').value) / 100,
    drama: Number($<HTMLInputElement>('enDrama').value) / 100,
    shake: $<HTMLInputElement>('enShake').checked,
    faceZoom: $<HTMLInputElement>('enFace').checked,
    protectCaptions: $<HTMLInputElement>('enProtect').checked,
    envelope: sourceAudio?.envelope ?? [],
    hz: sourceAudio?.hz ?? 20,
    beats: shift(sourceAudio?.beats ?? []),
    accents: shift(voice?.accents ?? []),
    speech: (voice?.speech ?? [])
      .map((seg) => ({ start: seg.start - offset, end: seg.end - offset }))
      .filter((seg) => seg.end > 0),
    focus: focusPoint,
  };
}

/** Single-shot project used by both viral and multi modes. */
function applyViral(video: MediaAsset, from: number, duration: number): void {
  state.project = buildEntertainProject(video, {
    aspect: aspectSel.value as Aspect,
    duration,
    srcIn: from,
    enhance: enhanceFor(from),
  });
  applyAspect(state.project.aspect);
  player.seek(0);
  touch();
  renderBlocks();
  renderSeed();
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function renderHighlights(): void {
  const list = $('multiList');
  if (!highlights.length) {
    list.innerHTML = `<p class="empty-note">${t('multi.empty')}</p>`;
    return;
  }
  list.innerHTML = highlights
    .map(
      (h, i) => `<button class="clipcard" data-clip-pick="${i}" aria-pressed="false">
        <strong>${h.score}</strong>
        <span>
          <b>${fmt(h.start)} → ${fmt(h.end)}</b>
          <small>${t('multi.speech')} ${Math.round(h.parts.speech * 100)}% · ${t('multi.energy')} ${Math.round(
            h.parts.energy * 100,
          )}%${h.parts.context ? ` · ${t('multi.context')} ${Math.round(h.parts.context * 100)}%` : ''}</small>
          ${h.text ? `<small class="clipcard__quote">“${h.text.slice(0, 90)}”</small>` : ''}
        </span>
      </button>`,
    )
    .join('');
}

async function findClips(): Promise<void> {
  const video = state.assets.find((a) => a.kind === 'video');
  if (!video) {
    toast(t('entertain.needVideo'));
    return;
  }
  if (!sourceAudio || !voice) await analyseSource(video, 'multi');
  if (!sourceAudio || !voice) {
    toast(t('voice.none'));
    return;
  }
  highlights = findHighlights(sourceAudio, voice, { duration: multiLength, count: 5, cues });
  renderHighlights();
  toast(`${highlights.length} ${t('multi.found')}`);
}

/** Times the pasted script to the speech that was actually detected. */
function viralCaptions(): void {
  const script = scriptInput.value.trim();
  if (!script) {
    toast(t('entertain.captionsHint'));
    return;
  }
  const blocks = script
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .reduce<string[]>((acc, word) => {
      const last = acc[acc.length - 1];
      if (last && `${last} ${word}`.length <= 34) acc[acc.length - 1] = `${last} ${word}`;
      else acc.push(word);
      return acc;
    }, []);

  const duration = totalDuration(state.project);
  const offset = state.project.clips[0]?.srcIn ?? 0;
  const spans = voice
    ? timeBlocksToSpeech(
        blocks,
        {
          ...voice,
          speech: voice.speech
            .map((seg) => ({ ...seg, start: seg.start - offset, end: seg.end - offset }))
            .filter((seg) => seg.end > 0 && seg.start < duration),
        },
        0,
        duration,
      )
    : blocks.map((_, i) => ({
        start: (duration * i) / blocks.length,
        end: (duration * (i + 1)) / blocks.length,
        energy: 0,
      }));

  state.project.texts = state.project.texts.filter((x) => x.role !== 'caption');
  blocks.forEach((text, i) => {
    const span = spans[i];
    if (!span) return;
    state.project.texts.push({
      id: uid('t'),
      text,
      start: Math.max(0, span.start),
      end: Math.min(duration, Math.max(span.start + 0.7, span.end)),
      role: 'caption',
      y: 0.74,
      size: 56,
      fontId: fontSel.value,
      styleId: styleSel.value,
      anim: 'pop',
    });
  });
  touch();
  renderBlocks();
  toast(`${blocks.length} ${t('toast.captions')}`);
}

$('packs').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pack]');
  if (btn) applyPack(btn.dataset.pack!);
});
$('auto').addEventListener('click', () => void autoEdit());
$('sections').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-section]');
  if (btn) void setSection(btn.dataset.section as Section);
});

$('transcript').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cue]');
  const cue = cues[Number(btn?.dataset.cue)];
  if (!cue) return;

  if (trMedia) {
    trMedia.currentTime = cue.start;
    void trMedia.play().catch(() => undefined);
  }
  if (totalDuration(state.project) > 0.2) {
    const offset = state.project.clips[0]?.srcIn ?? 0;
    player.pause();
    player.seek(Math.max(0, cue.start - offset));
    updateTransport();
  }
  highlightCue();
});

$('copyText').addEventListener('click', () => {
  void navigator.clipboard
    .writeText(cues.map((c) => c.text).join(' '))
    .then(() => toast(t('tr.copied')))
    .catch(() => toast(t('tr.copyFailed')));
});
$('downloadSrt').addEventListener('click', () => downloadText(toSrt(cues), 'mai-reel.srt', 'application/x-subrip'));
$('downloadTxt').addEventListener('click', () => downloadText(cues.map((c) => c.text).join(' '), 'mai-reel.txt'));
for (const id of ['enIntensity', 'enDrama', 'enShake', 'enFace', 'enProtect']) {
  $(id).addEventListener('input', enhanceFromUI);
}

$('variant').addEventListener('click', () => {
  rebuild();
  void analyze();
  toast(`#${seedCode(state.project.seed)}`);
});
$('viralCaptions').addEventListener('click', viralCaptions);
$('linkTranscribe').addEventListener('click', () => void transcribeLink());
$('extractorSave').addEventListener('click', () => void saveExtractor());
$('captureStart').addEventListener('click', () => void startCapture());
$('captureStop').addEventListener('click', () => void stopCapture());
$('linkLoad').addEventListener('click', () => void loadFromLink());
$<HTMLInputElement>('linkUrl').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') void loadFromLink();
});
$('transcribe').addEventListener('click', () => void runTranscription());
$('applyCues').addEventListener('click', applyCues);
$('findClips').addEventListener('click', () => void findClips());
$('multiLen').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mlen]');
  if (!btn) return;
  multiLength = Number(btn.dataset.mlen);
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-mlen]'))) {
    b.setAttribute('aria-pressed', String(b === btn));
  }
});
$('multiList').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-clip-pick]');
  if (!btn) return;
  const h = highlights[Number(btn.dataset.clipPick)];
  const video = state.assets.find((a) => a.kind === 'video');
  if (!h || !video) return;
  applyViral(video, h.start, h.end - h.start);
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('[data-clip-pick]'))) {
    b.setAttribute('aria-pressed', String(b === btn));
  }
  toast(`${fmt(h.start)} → ${fmt(h.end)} · ${h.score}/100`);
});

/* ---------- boot ---------- */

const hashed = location.hash.slice(1) as Section;
const savedSection = localStorage.getItem('mai-reel-section') as Section | null;
const firstSection: Section = SECTIONS.includes(hashed)
  ? hashed
  : savedSection && SECTIONS.includes(savedSection)
    ? savedSection
    : 'transcribe';

document.body.dataset.mode = 'build';
$<HTMLSelectElement>('lang').value = state.lang;
$<HTMLSelectElement>('asrLang').value = state.lang;
for (const id of ['settingsGroup', 'textsGroup']) {
  ($(id) as HTMLDetailsElement).open = wideScreen.matches;
}
fontSel.value = state.project.fontId;
styleSel.value = state.project.styleId;
applyI18n();
syncHeaderHeight();
markPreset();
markPacks();
renderAudio();
rebuild();
renderStrip();
renderTranscript();
renderTranscribePlayer();
$<HTMLInputElement>('extractorUrl').value = extractorUrl();
if (hasExtractor()) $('extractorStatus').textContent = t('ext.ready');
updateTransport();
void setSection(firstSection, false);
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1) as Section;
  if (SECTIONS.includes(next) && next !== document.body.dataset.section) void setSection(next, false);
});
void ensureFontsLoaded().then(() => player.seek(state.time));

// installable app: the service worker only runs from a built deploy, never from `vite dev`
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
