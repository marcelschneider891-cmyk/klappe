// Durchklick-Tutorial: beim ersten Start und jederzeit über Einstellungen oder „Was ist neu“.
import { ls } from './db.js';
import { esc, ICON, buzz } from './ui.js';

const SLIDES = [
  { i: ICON.film, t: 'Willkommen bei Klappe', d: 'Deine App zum Texte lernen, Proben, Self-Tapes drehen und Castings finden. In einer Minute zeig ich dir das Wichtigste.' },
  { i: ICON.upload, t: 'Skript laden', d: 'Unter „Skripte“ lädst du das PDF mit deinen Sides. Am Handy geht das direkt aus Gmail über „Teilen“, am PC ziehst du die Datei ins Fenster. Danach wählst du deine Rolle.' },
  { i: ICON.play, t: 'Proben mit Partner', d: 'Die App liest die anderen Rollen vor und wartet auf dich. Hängst du, sag „Line!“. Mit dem Auge blendest du deinen Text Schritt für Schritt aus, bis er sitzt.' },
  { i: ICON.rec, t: 'Self-Tape drehen', d: 'Auf „Aufnehmen“ tippen, Handy quer halten, der Partner liest aus dem Off. Licht, Ton und Bildausschnitt werden live geprüft. Danach kannst du zuschneiden und teilen.' },
  { i: ICON.voice, t: 'Deine Partnerstimme', d: 'Handy-Stimme, ElevenLabs, ein Freund liest ein oder ganz ohne Stimme. Im fertigen Video kann der Partner hörbar, leise oder stumm sein.' },
  { i: ICON.cal, t: 'Castings im Griff', d: 'Im Tagebuch trägst du jedes Vorsprechen ein, mit Kalender und Gagen. Wisch nach rechts, um den Stand zu ändern. Am Jahresende gibt es deinen Rückblick.' },
  { i: ICON.search, t: 'Das Casting-Radar', d: 'Zweimal täglich sucht Klappe passende Castings und schickt dir eine Nachricht. Bei jedem Treffer siehst du, ob die Bewerbung kostenlos ist, und bekommst einen fertigen Bewerbungstext.' },
  { i: ICON.user, t: 'Profil und Abgleich', d: 'Oben rechts auf „Heute“ geht es zu deinem Profil. Unter Einstellungen verbindest du Handy und PC, dann ist überall alles gleich. Mach ab und zu eine Sicherung.' },
  { i: ICON.star, t: 'Los geht’s', d: 'Tipp: Starte mit dem Warm-up oder der Demo-Szene „Nachtschicht“. Neue Funktionen findest du immer unter „Was ist neu“.' }
];

export const tutorialDone = () => !!ls.get('tutorial.done', false);

export function openTutorial() {
  if (document.querySelector('.tut')) return;
  let i = 0;
  const el = document.createElement('div');
  el.className = 'tut';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Einführung');
  const draw = () => {
    const s = SLIDES[i], last = i === SLIDES.length - 1;
    el.innerHTML = `
     <button class="tut-skip" type="button">${last ? '' : 'Überspringen'}</button>
     <div class="tut-card" key="${i}">
      <div class="tut-ic">${s.i}</div>
      <h2>${esc(s.t)}</h2>
      <p>${esc(s.d)}</p>
     </div>
     <div class="tut-dots">${SLIDES.map((_, j) => `<i${j === i ? ' class="on"' : ''}></i>`).join('')}</div>
     <div class="tut-nav">
      <button class="btn out" type="button" data-a="back"${i === 0 ? ' style="visibility:hidden"' : ''}>Zurück</button>
      <button class="btn fill" type="button" data-a="next">${last ? 'Loslegen' : 'Weiter'}</button>
     </div>`;
  };
  const close = () => { ls.set('tutorial.done', true); document.removeEventListener('keydown', keys); el.classList.add('out'); setTimeout(() => { el.remove(); window.dispatchEvent(new Event('klappe-tutorial-done')); }, 220); };
  const go = d => { const n = i + d; if (n >= SLIDES.length) return close(); if (n < 0) return; i = n; buzz(6); draw(); };
  const keys = e => { if (e.key === 'ArrowRight' || e.key === 'Enter') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'next') go(1); else if (a === 'back') go(-1);
    else if (e.target.closest('.tut-skip')) close();
  });
  // Wischen am Handy
  let x0 = null;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; });
  el.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', keys);
  draw();
  document.body.appendChild(el);
}
