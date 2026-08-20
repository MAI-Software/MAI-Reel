const svg = (paths: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

export const icons = {
  play: svg('<path d="M6 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'),
  pause: svg('<rect x="6.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>'),
  download: svg('<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>'),
  wand: svg('<path d="m14 6 4 4L7 21H3v-4z"/><path d="m17 3 1.2 2.3L21 6.5l-2.4 1.2L17 10l-1.2-2.3L13.5 6.5l2.3-1.2z"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2-2 5 5"/>'),
  sliders: svg('<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h8"/><path d="M16 18h4"/><circle cx="14" cy="18" r="2"/>'),
  target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  spark: svg('<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="m18 6-2.5 2.5"/><path d="M8.5 15.5 6 18"/>'),
};

export const brandMark = `<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#151b31"/><rect x="9" y="6" width="14" height="20" rx="3" fill="none" stroke="#ec4899" stroke-width="2.5"/><path d="M14 13.5v5l4.5-2.5z" fill="#2563eb"/></svg>`;
