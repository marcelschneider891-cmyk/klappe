// Tägliches Warm-up: Atmung, Stimme, Artikulation, Fokus. Mit Timer und Ansage.
import { $, esc, ICON, setTop, setFab, toast, buzz } from './ui.js';
import { tts } from './speech.js';
import { ls } from './db.js';

export const STEPS = [
  { t: 'Ankommen und atmen', s: 45, d: 'Füße hüftbreit, Knie locker, Schultern fallen lassen. Vier Sekunden durch die Nase einatmen, sechs Sekunden auf „sss“ ausatmen.' },
  { t: 'Zwerchfell wecken', s: 30, d: 'Kurze, kräftige Stöße auf „f – f – f“, dann auf „sch – sch – sch“. Der Bauch federt mit, die Schultern bleiben ruhig.' },
  { t: 'Lippenflattern', s: 30, d: 'Lippen locker flattern lassen, „brrr“ wie ein Pferd. Dabei mit der Tonhöhe hoch und wieder runter gleiten.' },
  { t: 'Kiefer und Gesicht', s: 30, d: 'Kiefer locker hängen lassen und sanft hin und her bewegen. Dann das Gesicht ganz groß machen und ganz klein. Einmal herzhaft gähnen.' },
  { t: 'Summen', s: 40, d: 'Mit geschlossenen Lippen auf „mmm“ summen, bis die Lippen kribbeln. Dann den Mund öffnen: „mmm – aaah“. Der Ton bleibt vorne.' },
  { t: 'Zunge', s: 30, d: 'Die Zunge kreist hinter den Lippen, fünfmal links herum, fünfmal rechts herum. Dann „la – le – li – lo – lu“, schnell und locker.' },
  { t: 'Artikulation', s: 60, d: 'Erst langsam und überdeutlich, dann schneller, aber sauber: „Fischers Fritz fischt frische Fische, frische Fische fischt Fischers Fritz.“ – „Blaukraut bleibt Blaukraut und Brautkleid bleibt Brautkleid.“ – „Zwischen zwei Zwetschgenzweigen sitzen zwei zwitschernde Schwalben.“' },
  { t: 'Stimme in den Raum', s: 40, d: 'Zähl von eins bis zehn. Schick die Zahlen an einen Punkt drei Meter vor dir, dann an die Wand gegenüber. Lauter werden, ohne zu pressen.' },
  { t: 'Fokus', s: 30, d: 'Augen zu, drei tiefe Atemzüge. Denk an deine nächste Szene: Was will deine Figur, und von wem?' }
];
export const totalMin = () => Math.round(STEPS.reduce((a, s) => a + s.s, 0) / 60);

function beep() {
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g).connect(ac.destination); o.start(); setTimeout(() => { o.stop(); ac.close(); }, 160); } catch {}
}

export async function warmupView(view, { go }) {
  setTop({ title: 'Warm-up', back: true });
  setFab(null);
  let i = 0, left = STEPS[0].s, running = false, iv = null, speak = ls.get('warmup.speak', true);
  view.innerHTML = `
   <div class="stack" style="gap:20px;padding-top:12px;text-align:center;align-items:center">
    <span class="muted small" id="wStep"></span>
    <h2 id="wT" style="margin:0;font:600 1.6rem/1.2 var(--f)"></h2>
    <div class="ring wring" id="wRing"><span id="wSec" class="num"></span></div>
    <p id="wD" style="max-width:460px;font-size:1.05rem;line-height:1.55"></p>
    <div class="row" style="justify-content:center">
     <button class="rc" id="wPrev" type="button" aria-label="Zurück">${ICON.prev}</button>
     <button class="rc play" id="wPlay" type="button" aria-label="Start">${ICON.play}</button>
     <button class="rc" id="wNext" type="button" aria-label="Weiter">${ICON.next}</button>
    </div>
    <div class="set card" style="width:100%;max-width:460px;text-align:left"><div class="li-main"><b>Übungen ansagen</b><small>Die Stimme liest jede Übung vor</small></div><label class="switch"><input type="checkbox" id="wSpeak"${speak ? ' checked' : ''} aria-label="Übungen ansagen"><i></i></label></div>
    <p class="legal">Insgesamt etwa ${totalMin()} Minuten. Leertaste startet und pausiert, Pfeile springen.</p>
   </div>`;
  const draw = () => {
    const s = STEPS[i];
    $('#wStep', view).textContent = `Übung ${i + 1} von ${STEPS.length}`;
    $('#wT', view).textContent = s.t;
    $('#wD', view).textContent = s.d;
    $('#wSec', view).textContent = left;
    $('#wRing', view).style.setProperty('--p', Math.round((1 - left / s.s) * 100));
    $('#wPlay', view).innerHTML = running ? ICON.pause : ICON.play;
  };
  const announce = () => { if (speak && running) tts.speak(`${STEPS[i].t}. ${STEPS[i].d}`, { rate: 1 }); };
  const goStep = n => {
    if (n >= STEPS.length) { stop(); toast('Warm-up geschafft. Du bist bereit!'); buzz(20); i = 0; left = STEPS[0].s; draw(); return; }
    i = Math.max(0, n); left = STEPS[i].s; beep(); buzz(10); draw(); announce();
  };
  const tick = () => { left--; if (left <= 0) goStep(i + 1); else draw(); };
  const start = () => { running = true; clearInterval(iv); iv = setInterval(tick, 1000); try { navigator.wakeLock?.request('screen').then(w => (view._wake = w)); } catch {} draw(); announce(); };
  const stop = () => { running = false; clearInterval(iv); tts.cancel(); try { view._wake?.release(); } catch {} draw(); };
  $('#wPlay', view).onclick = () => running ? stop() : start();
  $('#wNext', view).onclick = () => goStep(i + 1);
  $('#wPrev', view).onclick = () => goStep(i - 1);
  $('#wSpeak', view).onchange = e => { speak = e.target.checked; ls.set('warmup.speak', speak); if (!speak) tts.cancel(); };
  const keys = e => {
    if (/input|textarea|select/i.test(e.target.tagName) || !$('#sheet').hidden) return;
    if (e.key === ' ') { e.preventDefault(); $('#wPlay', view).click(); }
    else if (e.key === 'ArrowRight') goStep(i + 1); else if (e.key === 'ArrowLeft') goStep(i - 1);
  };
  document.addEventListener('keydown', keys);
  draw();
  return () => { stop(); document.removeEventListener('keydown', keys); };
}
