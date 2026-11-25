// Monologe fürs Vorsprechen: gemeinfreie Klassiker, mit einem Tipp zum Lernen übernehmen.
import { db, uid } from './db.js';
import { $, esc, ICON, setTop, setFab, largeTitle, openSheet, closeSheet, toast, buzz } from './ui.js';

let cache = null;
const cap = s => String(s).toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());
async function load() {
  if (cache) return cache;
  const r = await fetch('data/monologe.json');
  cache = (await r.json()).monologe || [];
  return cache;
}

export async function monologeView(view, { go }) {
  setTop({ title: 'Monologe', back: true, large: true });
  setFab(null);
  let list = [];
  try { list = await load(); } catch { view.innerHTML = `${largeTitle('Monologe')}<div class="empty">Offline. Die Monologe laden, sobald du wieder Netz hast.</div>`; return; }
  const have = new Set((await db.all('scripts')).map(s => s.monolog).filter(Boolean));
  view.innerHTML = `${largeTitle('Monologe', 'Klassiker fürs Vorsprechen, frei nutzbar')}
   <div class="list">${list.map(m => `<button class="li" type="button" data-m="${esc(m.id)}"><span class="tile">${ICON.doc}</span>
     <span class="li-main"><b>${esc(cap(m.figur))} · ${esc(m.stueck)}</b><small>${esc(m.autor)} · ca. ${String(m.minuten).replace('.', ',')} Min. · ${esc(m.art)}</small></span>
     ${have.has(m.id) ? '<span class="tag ok">Geladen</span>' : ICON.chev}</button>`).join('')}</div>
   <p class="legal" style="margin-top:16px">Texte gemeinfrei von Wikisource, in der Schreibweise der Originalausgabe. Für ein Vorsprechen kürzen viele Schauspieler auf 2 Minuten.</p>`;
  view.querySelector('.list').onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const m = list.find(x => x.id === b.dataset.m);
    openSheet(cap(m.figur), `
     <p class="muted">${esc(m.autor)}, „${esc(m.stueck)}“, ${esc(m.szene)}</p>
     <dl class="dl"><dt>Spielalter</dt><dd>${esc(m.alter)}</dd><dt>Länge</dt><dd>${m.woerter} Wörter, ca. ${String(m.minuten).replace('.', ',')} Min.</dd><dt>Ton</dt><dd>${esc(m.art)}</dd></dl>
     ${m.hinweis ? `<p class="muted small">${esc(m.hinweis)}</p>` : ''}
     <div class="script" style="max-height:38vh;overflow:auto;white-space:pre-line">${esc(m.text)}</div>
     <button class="btn fill wide" id="mTake" type="button">${have.has(m.id) ? 'Nochmal als neue Szene laden' : 'Zum Lernen übernehmen'}</button>
     <a class="btn text" href="${esc(m.quelle)}" target="_blank" rel="noopener">Quelle ansehen ${ICON.ext}</a>`, body => {
      $('#mTake', body).onclick = async () => {
        const blocks = m.text.split(/\n\s*\n/).map((t, i) => ({ id: 'b' + i, type: /^\(.*\)$/.test(t.trim()) ? 'act' : 'line', who: m.figur, text: t.replace(/\n/g, ' / ').trim() }));
        const s = { id: uid(), title: `${cap(m.figur)} – ${m.stueck}`, created: new Date().toISOString(), blocks, characters: [m.figur], me: [m.figur], src: 'monolog', monolog: m.id, voice: null };
        await db.put('scripts', s);
        buzz(12); closeSheet(); toast('Geladen. Viel Spaß beim Lernen!');
        go('skript-' + s.id);
      };
    });
  };
}
