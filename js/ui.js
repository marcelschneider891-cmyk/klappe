// UI-Helfer: App-Leiste, FAB, Sheets, Snackbar, Icons
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(u) { return /^https:\/\//i.test(u || '') ? u : null; }
export const buzz = (ms = 8) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(ms); } catch {} };

let tt = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('act');
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), 2800);
}

export function undoToast(msg, onUndo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span><button type="button">Rückgängig</button>`;
  t.classList.add('on', 'act');
  const b = t.querySelector('button');
  b.onclick = () => { clearTimeout(tt); t.classList.remove('on', 'act'); onUndo(); };
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on', 'act'), 5000);
}

let sheetClose = null;
export function openSheet(title, html, onMount, { onClose } = {}) {
  const s = $('#sheet');
  if (!s.hidden && sheetClose) { const f = sheetClose; sheetClose = null; f(); }
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  s.hidden = false;
  document.body.style.overflow = 'hidden';
  sheetClose = onClose || null;
  onMount?.($('#sheetBody'));
}
export function closeSheet() {
  if ($('#sheet').hidden) return;
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
}
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

export function ask(title, text, okLabel = 'Löschen') {
  return new Promise(resolve => {
    let done = false;
    openSheet(title, `<p class="muted">${esc(text)}</p><div class="grid2"><button class="btn out" data-a="0" type="button">Abbrechen</button><button class="btn red" data-a="1" type="button">${esc(okLabel)}</button></div>`, body => {
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        done = true;
        closeSheet();
        resolve(b.dataset.a === '1');
      });
    }, { onClose: () => { if (!done) resolve(false); } });
  });
}

const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const monthName = m => MON[m];
export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: opts.long ? 'long' : 'short', year: opts.year ? 'numeric' : undefined });
}
export const today = () => new Date().toISOString().slice(0, 10);
export function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
export function relDays(iso) {
  const d = daysUntil(iso);
  if (d == null) return '';
  return d < 0 ? 'abgelaufen' : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`;
}

// ---------- App-Leiste ----------
let hasLarge = false;
export function setTop({ title = '', back = false, actions = '', large = false } = {}) {
  $('#topTitle').textContent = title;
  $('#back').hidden = !back;
  $('#topAct').innerHTML = actions;
  hasLarge = large;
  $('#appbar').classList.toggle('has-large', large);
  onScroll();
}
function onScroll() {
  const y = window.scrollY;
  const bar = $('#appbar');
  bar.classList.toggle('lifted', y > 4);
  bar.classList.toggle('show-title', !hasLarge || y > 44);
}
window.addEventListener('scroll', onScroll, { passive: true });
export const largeTitle = (t, sub = '') => `<header class="large"><h1>${esc(t)}</h1>${sub ? `<p>${sub}</p>` : ''}</header>`;

export function setFab(cfg) {
  const f = $('#fab');
  if (!cfg) { f.hidden = true; f.onclick = null; return; }
  f.innerHTML = `${cfg.icon || ICON.plus}<span>${esc(cfg.label)}</span>`;
  f.hidden = false;
  f.onclick = () => { buzz(); cfg.onClick(); };
}

export const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7.5 5h3v14h-3zM13.5 5h3v14h-3z" fill="currentColor" stroke="none"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6v12M18 6l-8 6 8 6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M18 6v12M6 6l8 6-8 6z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 01-4 4H4"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tune: '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>',
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/></svg>',
  flip: '<svg viewBox="0 0 24 24"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  euro: '<svg viewBox="0 0 24 24"><path d="M17 6a7 7 0 100 12M4 10h9M4 14h9"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  starOn: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  voice: '<svg viewBox="0 0 24 24"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/></svg>',
  head: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};
