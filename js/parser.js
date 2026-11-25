// Liest Szenen (Sides) aus PDF oder Text und findet heraus, wer was sagt.
// Erkennt Drehbuch-Format (NAME eingerückt über dem Text) und Theater-Format (NAME: Text).

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let pdfjsP = null;
// PDF-Seiten als Bilder (für die Texterkennung bei Scans)
export async function pdfToCanvases(buf, scale = 2) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(c);
  }
  return out;
}
export function loadPdfJs() {
  if (pdfjsP) return pdfjsP;
  pdfjsP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsP = null; reject(new Error('offline')); };
    document.head.appendChild(s);
  });
  return pdfjsP;
}

// ---------- PDF -> Zeilen mit Position ----------
export async function pdfToLines(buf) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  let chars = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, w: it.width, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    const out = [];
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let t = '', end = null;
      for (const it of r.items) {
        if (end != null && it.x - end > 1.5 && !t.endsWith(' ') && !it.s.startsWith(' ')) t += ' ';
        t += it.s; end = it.x + it.w;
      }
      t = t.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      chars += t.length;
      out.push({ t, x: r.items[0].x, y: r.y, page: p, pw: vp.width });
    }
    // Leerzeilen erkennen: Abstand deutlich größer als normaler Zeilenabstand
    const diffs = [];
    for (let i = 1; i < out.length; i++) diffs.push(out[i - 1].y - out[i].y);
    const sorted = diffs.filter(d => d > 0).sort((a, b) => a - b);
    const lh = sorted.length ? sorted[Math.floor(sorted.length * 0.3)] : 12;
    out.forEach((l, i) => { l.gap = i === 0 ? true : (out[i - 1].y - l.y) > lh * 1.55; });
    pages.push(out);
  }
  if (chars < 30) { const e = new Error('scan'); e.code = 'scan'; throw e; }
  return stripHeaders(pages);
}

// Kopf-/Fußzeilen und Seitenzahlen entfernen
function stripHeaders(pages) {
  const key = t => t.replace(/\d+/g, '#').toLowerCase();
  const count = new Map();
  pages.forEach(pg => new Set(pg.map(l => key(l.t))).forEach(k => count.set(k, (count.get(k) || 0) + 1)));
  const n = pages.length;
  const lines = [];
  pages.forEach(pg => pg.forEach(l => {
    if (/^(seite\s*)?\d+\s*(\/|von)?\s*\d*\.?$/i.test(l.t)) return;
    if (n >= 3 && count.get(key(l.t)) >= Math.max(2, n * 0.5) && l.t.length < 70) return;
    lines.push(l);
  }));
  return lines;
}

// ---------- Text -> Zeilen ----------
export function textToLines(text) {
  const out = [];
  let gap = true;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) { gap = true; continue; }
    const ind = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    out.push({ t: raw.trim().replace(/\s+/g, ' '), x: ind > 0 ? ind * 6 : null, gap });
    gap = false;
  }
  return out;
}

// ---------- Erkennung ----------
const EXT = /\s*\((?:V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|OFF|ON|CONT['’]?D|CONT\.?|FORTS\.?|FORTSETZUNG|WEITER|TEL\.?|TELEFON|AUS DEM OFF|OFF-STIMME|STIMME|\d+)\)\s*/gi;
const CONT = /CONT|FORTS|WEITER/i;
const HEADING = /^(\d+[A-Z]?\.?\s+)?(INT\.?\s?\/\s?EXT|I\s?\/\s?E|INT|EXT|INNEN|AUSSEN|AUßEN|Int|Ext|Innen|Aussen|Außen|I|A)\.?(\s|\/|$|[-–])/;
const TRANSITION = /^(SCHNITT|CUT\b|FADE|ABBLENDE|AUFBLENDE|ÜBERBLEND|SMASH|DISSOLVE|ENDE\b|THE END|FORTSETZUNG|CONTINUED|\(MORE\)|\(MEHR\)|\(WEITER\)|SZENE\s*\d|SCENE\s*\d)/i;

function cueName(t) {
  let s = t.replace(EXT, ' ').replace(/\s*\^\s*$/, '').replace(/:\s*$/, '').trim();
  if (s.length < 2 || s.length > 30) return null;
  if (!/^[A-ZÄÖÜ0-9][A-ZÄÖÜß0-9 .'’\-#&]*$/.test(s)) return null;
  if (!/[A-ZÄÖÜ]{2}/.test(s)) return null;
  if (s.split(' ').length > 4) return null;
  if (HEADING.test(s) || TRANSITION.test(s)) return null;
  return s;
}

const COLON = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9.'’\- ]{0,26}?)\s*(\([^)]{0,60}\))?\s*:\s*(.*)$/;
function colonLine(t) {
  const m = t.match(COLON);
  if (!m) return null;
  const name = m[1].trim();
  if (name.split(' ').length > 3) return null;
  if (HEADING.test(name) || TRANSITION.test(name)) return null;
  if (/^(Ort|Zeit|Szene|Bild|Akt|Notiz|Hinweis|Anmerkung|Regie|Personen|Datum|Titel|Rolle|Projekt|Casting|Abgabe)$/i.test(name)) return null;
  return { name, paren: m[2] || '', text: m[3] };
}

function modeOf(nums) {
  const c = new Map();
  for (const n of nums) { const k = Math.round(n / 4) * 4; c.set(k, (c.get(k) || 0) + 1); }
  let best = null, bc = 0;
  for (const [k, v] of c) if (v > bc) { best = k; bc = v; }
  return best;
}

export function parseLines(lines, title = 'Szene') {
  const blocks = [];
  const nonEmpty = lines.length;
  const colonHits = lines.filter(l => colonLine(l.t)).length;
  const useColon = colonHits >= 3 && colonHits >= nonEmpty * 0.25;

  const pushAct = (t, gap) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'act' && !gap && !HEADING.test(t) && !HEADING.test(last.text)) last.text += ' ' + t;
    else blocks.push({ type: 'act', text: t });
  };

  if (useColon) {
    // Aus einem PDF umgebrochene Zeilen gehören zum Satz davor; eingefügter Text ohne Doppelpunkt ist Regie
    const fromPdf = lines.some(l => l.pw);
    let cur = null;
    for (const l of lines) {
      const c = colonLine(l.t);
      if (c) {
        cur = { type: 'line', who: c.name.toUpperCase(), text: (c.paren ? c.paren + ' ' : '') + c.text };
        blocks.push(cur);
      } else if (cur && fromPdf && !l.gap && !HEADING.test(l.t) && !/^\(.*\)$/.test(l.t)) {
        cur.text = join(cur.text, l.t);
      } else { cur = null; pushAct(l.t, l.gap); }
    }
  } else {
    const hasX = lines.some(l => l.x != null);
    const longX = lines.filter(l => l.x != null && l.t.length > 35).map(l => l.x);
    const actionX = hasX ? (longX.length ? modeOf(longX) : Math.min(...lines.filter(l => l.x != null).map(l => l.x))) : 0;
    let cur = null, inParen = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], next = lines[i + 1];
      let name = cueName(l.t);
      // Gemischte Schreibweise (z. B. "Lena") nur, wenn deutlich eingerückt und kurz
      if (!name && hasX && l.x != null && l.pw && l.x > actionX + l.pw * 0.18 && l.t.length <= 24 && /^[A-ZÄÖÜ][\wÄÖÜäöüß.'’\- ]+$/.test(l.t) && !/[.!?,]$/.test(l.t)) name = l.t.replace(EXT, '').trim();
      if (name && hasX && l.x != null && longX.length && l.x <= actionX + 10) name = null; // Großbuchstaben am linken Rand = Regieanweisung
      if (name && next && !cueName(next.t) && !HEADING.test(next.t)) {
        const key = name.toUpperCase();
        const prev = blocks[blocks.length - 1];
        if (CONT.test(l.t) && prev && prev.type === 'line' && prev.who === key) { cur = prev; }
        else { cur = { type: 'line', who: key, text: '' }; blocks.push(cur); }
        inParen = false;
        continue;
      }
      if (cur) {
        const atMargin = hasX && l.x != null && longX.length && l.x <= actionX + 8;
        const ended = (l.gap && cur.text && !inParen) || (atMargin && cur.text) || HEADING.test(l.t) || TRANSITION.test(l.t);
        if (!ended) {
          if (/^\((MORE|MEHR|WEITER)\)$/i.test(l.t)) continue;
          cur.text = join(cur.text, l.t);
          if (l.t.includes('(') && !l.t.includes(')')) inParen = true;
          if (l.t.includes(')')) inParen = false;
          continue;
        }
        cur = null;
      }
      if (/^\((MORE|MEHR|WEITER)\)$/i.test(l.t)) continue;
      pushAct(l.t, l.gap);
    }
  }

  // Leere Sprechblöcke entfernen, Texte säubern
  const clean = blocks.filter(b => b.text && b.text.trim()).map((b, i) => ({ ...b, id: 'b' + i, text: b.text.trim() }));
  const counts = {};
  clean.forEach(b => { if (b.type === 'line') counts[b.who] = (counts[b.who] || 0) + 1; });
  const characters = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return { title, blocks: clean, characters, counts };
}

function join(a, b) {
  if (!a) return b;
  if (/[A-Za-zäöüß]-$/.test(a) && /^[a-zäöüß]/.test(b)) return a.slice(0, -1) + b;
  return a + ' ' + b;
}

// Text zum Vorlesen: Regieanweisungen in Klammern weglassen
export function speakable(t) {
  return t.replace(/\*([^*]+)\*/g, '$1').replace(/\s\/\s/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Wörter für Abgleich mit Spracherkennung
export function words(t) {
  return speakable(t).toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
}
