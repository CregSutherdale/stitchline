// Hand-authored SVG icons (stroke style, currentColor).
const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  undo: S('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  reset: S('<path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.6 2.7L3 8"/><path d="M3 3v5h5"/>'),
  hint: S('<path d="M8 3h8l-1 10a3 3 0 01-6 0z"/><path d="M9.5 7.5h5M9.2 10.5h5.6"/><path d="M12 16v5"/>'),
  help: S('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .8c0 1.8-2.5 2.2-2.5 4"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>'),
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>'),
  infinity: S('<path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 7.5-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-7.5-7-11-7z"/>'),
  chest: S('<path d="M3.5 10h17v9.5a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z"/><path d="M3.5 10V8a5 5 0 015-5h7a5 5 0 015 5v2"/><path d="M10 10v3.5h4V10"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>',
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  thimble: S('<path d="M7 20h10l-1.2-11a3.8 3.8 0 00-7.6 0z"/><path d="M6.5 20h11"/><path d="M9.5 11h.01M12 11h.01M14.5 11h.01M9 14h.01M11.5 14h.01M14 14h.01M15.5 17h.01M8.5 17h.01M12 17h.01"/>'),
  spool: S('<path d="M6 4h12M6 20h12"/><path d="M8 4v16M16 4v16"/><path d="M8 8l8 2M8 12l8 2M8 16l8 2"/>'),
};
