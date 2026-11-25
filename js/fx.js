// Optik: Start-Animation, Wischgesten, Bilder für leere Seiten.
import { buzz } from './ui.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Klappe schlägt zu, einmal pro App-Start
export function splash() {
  try { if (sessionStorage.getItem('klappe.splash') || calm()) return; sessionStorage.setItem('klappe.splash', '1'); } catch { return; }
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<svg viewBox="0 0 120 100" aria-hidden="true">
    <g class="arm"><path d="M14 30 L106 22 L106 38 L14 46 Z" fill="#0F1113" stroke="#D4B072" stroke-width="3"/>
     <path d="M30 29 L40 44 M52 27 L62 42 M74 25 L84 40 M96 23 L104 36" stroke="#D4B072" stroke-width="8"/></g>
    <rect x="14" y="48" width="92" height="44" rx="4" fill="none" stroke="#D4B072" stroke-width="3"/>
    <path d="M26 64h64M26 78h36" stroke="#ECE8E1" stroke-width="3" stroke-linecap="round"/></svg>`;
  document.body.appendChild(el);
  setTimeout(() => buzz(10), 380);
  setTimeout(() => el.classList.add('out'), 800);
  setTimeout(() => el.remove(), 1150);
}

// Wischen in Listen: nach rechts / links ziehen löst eine Aktion aus
export function swipeList(box, { right, left }) {
  if (!box) return;
  let row = null, x0 = 0, y0 = 0, dx = 0, active = false;
  box.addEventListener('pointerdown', e => {
    row = e.target.closest('.li[data-id]');
    if (!row || e.pointerType === 'mouse' && e.button !== 0) { row = null; return; }
    x0 = e.clientX; y0 = e.clientY; dx = 0; active = false;
  });
  box.addEventListener('pointermove', e => {
    if (!row) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!active) {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) { active = true; row.setPointerCapture?.(e.pointerId); row.classList.add('swiping'); }
      else if (Math.abs(my) > 12) { row = null; return; }
      else return;
    }
    dx = Math.max(-140, Math.min(140, mx));
    row.style.transform = `translateX(${dx}px)`;
    row.dataset.dir = dx > 0 ? 'r' : 'l';
    row.classList.toggle('armed', Math.abs(dx) > 90);
  });
  const end = () => {
    if (!row) return;
    const r = row, d = dx, was = active;
    row = null;
    r.style.transition = 'transform .2s';
    r.style.transform = '';
    setTimeout(() => { r.style.transition = ''; r.classList.remove('swiping', 'armed'); delete r.dataset.dir; }, 220);
    if (!was) return;
    r.dataset.swiped = '1';
    setTimeout(() => delete r.dataset.swiped, 300);
    if (Math.abs(d) > 90) { buzz(12); (d > 0 ? right : left)?.(r.dataset.id); }
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}

// Kleine Strichzeichnungen für leere Seiten
const ILLU = {
  script: `<rect x="34" y="14" width="52" height="68" rx="4"/><path d="M44 30h32M52 40h24M52 46h18" /><path d="M52 58h24" class="hl"/><path d="M52 64h16"/><rect x="24" y="22" width="52" height="68" rx="4" class="back"/>`,
  castings: `<rect x="22" y="24" width="76" height="62" rx="6"/><path d="M22 40h76M42 16v14M78 16v14"/><path d="M58 52l4 8 9 1-6.5 6 1.6 9-8.1-4.3-8.1 4.3 1.6-9-6.5-6 9-1z" class="hl"/>`,
  radar: `<circle cx="60" cy="52" r="34"/><circle cx="60" cy="52" r="20"/><circle cx="60" cy="52" r="6" class="hl"/><path d="M60 52L86 30" class="hl"/><circle cx="80" cy="64" r="3"/><circle cx="42" cy="38" r="3"/>`,
  search: `<circle cx="54" cy="48" r="22"/><path d="M70 64l18 18" class="hl"/><path d="M44 48h20"/>`
};
export function illu(name) {
  return `<svg class="illu" viewBox="0 0 120 100" aria-hidden="true">${ILLU[name] || ILLU.search}</svg>`;
}
