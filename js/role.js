// Rollenarbeit: Fragen zur Figur, Notizen, Markierungen im Text (*Betonung*, " / " Pause).
import { db } from './db.js';
import { $, $$, esc, ICON, setTop, setFab, toast, buzz } from './ui.js';

export const QUESTIONS = [
  { k: 'wer', q: 'Wer bin ich?', h: 'Alter, Beruf, Herkunft, wie lebe ich, was mache ich den ganzen Tag?' },
  { k: 'will', q: 'Was will ich in dieser Szene?', h: 'Ein klares Ziel, das du vom anderen bekommen willst. Als Verb: überzeugen, loswerden, trösten …' },
  { k: 'hindernis', q: 'Was steht mir im Weg?', h: 'Der andere, ich selbst, die Situation, die Zeit?' },
  { k: 'vorher', q: 'Was ist direkt vorher passiert?', h: 'Woher komme ich gerade, in welcher Stimmung betrete ich die Szene?' },
  { k: 'beziehung', q: 'Wie stehe ich zu den anderen?', h: 'Was verbindet uns, was trennt uns, was denke ich über sie?' },
  { k: 'geheimnis', q: 'Was verberge ich?', h: 'Was sage ich nicht, obwohl ich es denke?' },
  { k: 'einsatz', q: 'Was steht auf dem Spiel?', h: 'Was passiert, wenn ich nicht bekomme, was ich will?' },
  { k: 'koerper', q: 'Körper und Stimme', h: 'Haltung, Tempo, Atmung, Blick. Wie anders als ich selbst?' }
];

// Text mit Markierungen anzeigen: *Wort* = betont, " / " = Pause
export function fmtLine(t) {
  return esc(t).replace(/\*([^*]+)\*/g, '<b class="em">$1</b>').replace(/\s\/\s/g, ' <span class="pz">/</span> ');
}
export const plain = t => t.replace(/\*([^*]+)\*/g, '$1').replace(/\s\/\s/g, ' ');
export const roleProgress = s => QUESTIONS.filter(q => (s.rolle?.[q.k] || '').trim()).length;

export async function roleView(view, id, { go }) {
  const s = await db.get('scripts', id);
  if (!s) return go('skripte', true);
  s.rolle = s.rolle || {};
  const who = (s.me || [])[0] || 'deine Rolle';
  setTop({ title: 'Rollenarbeit', back: true, actions: `<button class="btn text" id="rSave" type="button">Speichern</button>` });
  setFab(null);
  view.innerHTML = `
   <div class="stack" style="gap:18px;padding-top:8px">
    <p class="muted">Deine Gedanken zu <b style="color:var(--on)">${esc(who)}</b> in „${esc(s.title)}“. Alles wird automatisch gespeichert.</p>
    ${QUESTIONS.map(q => `<div class="field"><label for="q-${q.k}" style="color:var(--on);font-size:.95rem">${esc(q.q)}</label><span class="muted small">${esc(q.h)}</span><textarea class="inp" id="q-${q.k}" data-k="${q.k}" style="min-height:90px">${esc(s.rolle[q.k] || '')}</textarea></div>`).join('')}
    <div class="field"><label for="q-notiz" style="color:var(--on);font-size:.95rem">Freie Notizen</label><textarea class="inp" id="q-notiz" data-k="notiz" style="min-height:120px">${esc(s.rolle.notiz || '')}</textarea></div>
    <div class="card pad stack" style="gap:6px">
     <b>Markierungen im Text</b>
     <p class="muted small">Im Skript eine Zeile antippen und im Text markieren: <b>*Wort*</b> wird betont angezeigt, <b>Leerzeichen / Leerzeichen</b> ist eine Pause. Die Stimme liest die Zeichen nicht mit. Dazu kannst du pro Zeile eine eigene Notiz schreiben, z. B. „leise, Blick weg“.</p>
    </div>
   </div>`;
  let t = null;
  const save = async (msg) => {
    $$('[data-k]', view).forEach(el => { s.rolle[el.dataset.k] = el.value; });
    await db.put('scripts', s);
    if (msg) { buzz(); toast('Gespeichert'); }
  };
  view.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => save(false), 900); });
  $('#rSave').onclick = async () => { await save(true); go('skript-' + id, true); };
  return () => { clearTimeout(t); save(false); };
}
