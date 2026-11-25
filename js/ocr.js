// Texterkennung für gescannte Sides und Fotos von Skriptseiten (läuft auf dem Handy).
const TJS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tP = null;
function loadTesseract() {
  if (tP) return tP;
  tP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TJS;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { tP = null; reject(new Error('offline')); };
    document.head.appendChild(s);
  });
  return tP;
}

async function toCanvas(img) {
  if (img instanceof HTMLCanvasElement) return img;
  const bmp = await createImageBitmap(img);
  const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

// Liefert Zeilen im gleichen Format wie pdfToLines (x auf Seitenbreite 612 umgerechnet)
export async function ocrToLines(images, onProgress) {
  const T = await loadTesseract();
  let page = 0;
  const worker = await T.createWorker('deu', 1, {
    logger: m => { if (m.status === 'recognizing text') onProgress?.((page + m.progress) / images.length, 'Lese Seite ' + (page + 1) + ' von ' + images.length); else if (/load|init/i.test(m.status)) onProgress?.(0, 'Texterkennung wird geladen …'); }
  });
  const lines = [];
  try {
    for (; page < images.length; page++) {
      const c = await toCanvas(images[page]);
      const { data } = await worker.recognize(c);
      const k = 612 / c.width;
      const rows = (data.lines || []).map(l => ({ t: l.text.replace(/\s+/g, ' ').trim(), x: l.bbox.x0 * k, y0: l.bbox.y0, y1: l.bbox.y1, page: page + 1, pw: 612, conf: l.confidence }))
        .filter(l => l.t && l.conf > 35 && /[\p{L}]/u.test(l.t));
      rows.sort((a, b) => a.y0 - b.y0);
      const hs = rows.map(r => r.y1 - r.y0).sort((a, b) => a - b);
      const h = hs.length ? hs[Math.floor(hs.length / 2)] : 20;
      rows.forEach((r, i) => { r.gap = i === 0 || (r.y0 - rows[i - 1].y1) > h * 0.8; });
      lines.push(...rows.map(({ t, x, page, pw, gap }) => ({ t, x, page, pw, gap })));
    }
  } finally { await worker.terminate(); }
  return lines;
}
