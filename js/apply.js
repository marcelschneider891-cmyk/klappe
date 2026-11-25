// Bewerbungs-Helfer: fertiger Text für eine Ausschreibung, aus Profil und Casting.
import { $, $$, esc, ICON, openSheet, toast, safeUrl, buzz } from './ui.js';
import { getProfile } from './profile.js';

function shortExp(t, max = 200) {
  if (!t) return '';
  const s = t.replace(/\b(Kino|Serie|Serien|Film|Filme|Kurzfilm|TV|Fernsehen|Theater|Werbung):\s*/g, '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s.replace(/\.$/, '');
  const cut = s.slice(0, max);
  return (cut.slice(0, cut.lastIndexOf('.') > 60 ? cut.lastIndexOf('.') : cut.lastIndexOf(',')) || cut).replace(/[.,]$/, '');
}
function hook(p, c) {
  const role = `${c.rolle || ''} ${c.rollenprofil || ''} ${c.titel || ''}`.toLowerCase();
  const skills = (p.skills || []).join(' ').toLowerCase();
  if (/soldat|polizist|polizei|bundeswehr|army|militär|wache/.test(role) && /bundeswehr|militär/.test(skills)) return 'Durch meine Grundausbildung bei der Bundeswehr kenne ich Haltung, Abläufe und Sprache aus erster Hand.';
  const hit = (p.skills || []).find(s => s.length > 2 && role.includes(s.toLowerCase().split(' ')[0]));
  if (hit) return `Für die Rolle bringe ich ${hit} mit.`;
  if (/theater|bühne/.test(role + ' ' + (c.art || '').toLowerCase())) return 'Auf der Bühne zu stehen und mit einem Ensemble zu arbeiten, reizt mich sehr.';
  return '';
}

export function letter(p, c, { du = false, long = false } = {}) {
  const rolle = c.rolle ? `„${c.rolle}“` : 'die ausgeschriebene Rolle';
  const projekt = c.projekt || c.titel || 'Ihr Projekt';
  const links = Object.entries(p.links || {}).filter(([, u]) => safeUrl(u)).map(([k, u]) => `${{ imdb: 'IMDb', stagepool: 'Stagepool', castforward: 'Castforward', filmmakers: 'Filmmakers', website: 'Website', instagram: 'Instagram', tiktok: 'TikTok' }[k] || k}: ${u}`);
  const facts = [p.spielalterVon && `Spielalter ${p.spielalterVon}–${p.spielalterBis}`, p.groesse && `${p.groesse} cm`, p.wohnort && `wohnhaft in ${p.wohnort}`].filter(Boolean).join(', ');
  const exp = shortExp(p.erfahrung, long ? 320 : 170);
  const tape = /tape|e-casting|video/i.test(c.bewerbung || '') || /tape/i.test(c.ort || '');
  const h = hook(p, c);
  const L = [];
  L.push(`Betreff: Bewerbung ${c.rolle ? 'als ' + c.rolle : ''} – ${projekt}`.replace(/\s+–/, ' –'));
  L.push('');
  L.push(du ? 'Hallo,' : 'Sehr geehrte Damen und Herren,');
  L.push('');
  L.push(du ? `ich habe eure Ausschreibung für ${rolle} in „${projekt}“ gesehen und bewerbe mich gern.` : `mit großem Interesse habe ich Ihre Ausschreibung für ${rolle} in „${projekt}“ gelesen und bewerbe mich hiermit.`);
  L.push('');
  L.push(`Ich bin ${p.beruf || 'Schauspieler'}${facts ? ` (${facts})` : ''}.${exp ? ` Gedreht habe ich unter anderem: ${exp}.` : ''}${h ? ' ' + h : ''}`);
  if (long && p.sprachen?.length) L.push(`Sprachen: ${[...p.sprachen, ...(p.dialekte || [])].join(', ')}.${p.fuehrerschein ? ` Führerschein ${p.fuehrerschein}.` : ''}`);
  if (tape) { L.push(''); L.push(du ? 'Ein Self-Tape schicke ich euch gern kurzfristig.' : 'Ein Self-Tape sende ich Ihnen gern kurzfristig zu.'); }
  if (p.verfuegbarAb && new Date(p.verfuegbarAb) > new Date()) { L.push(du ? `Verfügbar bin ich ab ${new Date(p.verfuegbarAb).toLocaleDateString('de-DE')}.` : `Ab dem ${new Date(p.verfuegbarAb).toLocaleDateString('de-DE')} bin ich verfügbar.`); }
  if (links.length) { L.push(''); L.push(du ? 'Fotos und mehr von mir:' : 'Fotos und weitere Informationen:'); links.forEach(l => L.push(l)); }
  L.push('');
  L.push(du ? 'Ich freu mich, von euch zu hören!' : 'Ich freue mich auf Ihre Rückmeldung.');
  L.push('');
  L.push(du ? 'Viele Grüße' : 'Mit freundlichen Grüßen');
  L.push(p.name || '');
  if (p.email) L.push(p.email);
  if (p.agentur) L.push('Agentur: ' + p.agentur);
  return L.join('\n');
}

export async function applySheet(c) {
  const p = await getProfile();
  let du = false, long = false, own = !!c.anschreiben;
  const text = () => own && c.anschreiben ? c.anschreiben.trim() + (p.email && !c.anschreiben.includes(p.email) ? '\n' + p.email : '') : letter(p, c, { du, long });
  openSheet('Bewerbung', `
   ${c.anschreiben ? `<div class="seg" id="apSrc"><button type="button" data-k="own" class="on">Vom Radar geschrieben</button><button type="button" data-k="tpl">Vorlage</button></div>` : ''}
   <div class="grid2" id="apOpts"${own ? ' hidden' : ''}>
    <div class="seg" id="apDu"><button type="button" data-k="sie" class="on">Sie</button><button type="button" data-k="du">Du</button></div>
    <div class="seg" id="apLen"><button type="button" data-k="kurz" class="on">Kurz</button><button type="button" data-k="lang">Länger</button></div>
   </div>
   <textarea class="inp" id="apText" style="min-height:300px;font-size:.92rem"></textarea>
   ${!p.email ? '<p class="muted small">Tipp: Trag im Profil deine E-Mail ein, dann steht sie automatisch unter dem Text.</p>' : ''}
   ${c.bewerbung ? `<p class="muted small">So bewirbst du dich: ${esc(c.bewerbung)}</p>` : ''}
   <div class="grid2"><button class="btn out" id="apCopy" type="button">Kopieren</button><button class="btn fill" id="apShare" type="button">${ICON.share} Senden</button></div>
   ${safeUrl(c.url) ? `<a class="btn text" href="${esc(c.url)}" target="_blank" rel="noopener">Zur Ausschreibung ${ICON.ext}</a>` : ''}`, body => {
    const ta = $('#apText', body);
    const fill = () => { ta.value = text(); };
    fill();
    const seg = (id, fn) => { const el = $('#' + id, body); if (!el) return; el.onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; $$('button', el).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.k); fill(); }; };
    seg('apSrc', k => { own = k === 'own'; $('#apOpts', body).hidden = own; });
    seg('apDu', k => { du = k === 'du'; });
    seg('apLen', k => { long = k === 'lang'; });
    $('#apCopy', body).onclick = async () => {
      try { await navigator.clipboard.writeText(ta.value); toast('Kopiert'); buzz(); }
      catch { ta.select(); document.execCommand?.('copy'); toast('Kopiert'); }
    };
    $('#apShare', body).onclick = async () => {
      const t = ta.value;
      const subj = (t.match(/^Betreff: (.*)$/m) || [])[1] || 'Bewerbung';
      const bodyText = t.replace(/^Betreff: .*\n\n?/, '');
      if (navigator.share) { try { await navigator.share({ title: subj, text: bodyText }); } catch {} }
      else { try { await navigator.clipboard.writeText(t); toast('Kopiert'); } catch {} }
    };
  });
}
