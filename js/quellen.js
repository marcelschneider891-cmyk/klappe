// Alle Quellen für Castings: was es dort gibt, was es kostet, ob das Radar sie liest.
import { esc, ICON, setTop, setFab, largeTitle, safeUrl } from './ui.js';

const costTag = k => {
  const t = String(k || '').toLowerCase();
  if (/^kostenlos/.test(t)) return `<span class="tag ok">${esc(k)}</span>`;
  if (/nur mit|nur für|bezahl|plus/.test(t)) return `<span class="tag" style="background:var(--warn-c);color:var(--warn)">${esc(k)}</span>`;
  return `<span class="tag">${esc(k)}</span>`;
};

export async function quellenView(view) {
  setTop({ title: 'Quellen', back: true, large: true });
  setFab(null);
  let data;
  try { data = await (await fetch('data/quellen.json')).json(); }
  catch { view.innerHTML = `${largeTitle('Quellen')}<div class="empty">Offline. Die Liste lädt, sobald du wieder Netz hast.</div>`; return; }
  const n = data.gruppen.reduce((s, g) => s + g.quellen.length, 0);
  view.innerHTML = `${largeTitle('Quellen', `${n} Stellen, an denen Castings ausgeschrieben werden`)}
   ${data.gruppen.map(g => `<div class="sec"><div class="sec-h"><h2>${esc(g.titel)}</h2></div><div class="list">${g.quellen.map(q => {
     const u = safeUrl(q.url);
     return `<${u ? 'a' : 'div'} class="li"${u ? ` href="${esc(u)}" target="_blank" rel="noopener"` : ''} style="align-items:flex-start">
      <span class="li-main"><b>${esc(q.name)}</b><small style="white-space:normal">${esc(q.was)}</small>
       <span class="row" style="gap:6px;margin-top:6px">${costTag(q.kosten)}<span class="tag">${esc(q.radar)}</span></span></span>${u ? ICON.ext : ''}</${u ? 'a' : 'div'}>`;
   }).join('')}</div></div>`).join('')}
   <p class="legal" style="margin-top:16px">${esc(data.hinweis)} Stand ${esc(data.stand)}.</p>`;
}
