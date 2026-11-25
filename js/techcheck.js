// Technik-Check fürs Self-Tape: Licht, Ton und Bildausschnitt live prüfen.
import { esc } from './ui.js';

export function makeChecker(video, panel) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  const face = 'FaceDetector' in window ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;
  let rmsPeak = 0, talkPeak = 0, clip = 0, faceState = face ? { k: 'wait', l: 'Gesicht wird gesucht' } : null, busy = false;

  // Ton: wird aus der Pausen-Erkennung gefüttert
  const onLevel = (v, rms, talking) => {
    rmsPeak = Math.max(rmsPeak * 0.97, rms);
    if (talking) talkPeak = Math.max(talkPeak * 0.995, rms);
    if (rms > 0.45) clip = 8;
  };

  function light() {
    if (!video.videoWidth) return null;
    g.drawImage(video, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data;
    let all = 0, mid = 0, edge = 0, nm = 0, ne = 0;
    for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4, l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      all += l;
      if (x > 20 && x < 44 && y > 6 && y < 30) { mid += l; nm++; } else { edge += l; ne++; }
    }
    const avg = all / (64 * 36), m = mid / nm, e = edge / ne;
    if (avg < 55) return { k: 'bad', l: 'Zu dunkel' };
    if (avg > 205) return { k: 'bad', l: 'Zu hell' };
    if (e - m > 45) return { k: 'warn', l: 'Gegenlicht' };
    if (avg < 80) return { k: 'warn', l: 'Etwas dunkel' };
    return { k: 'ok', l: 'Licht gut' };
  }

  function sound() {
    if (clip > 0) { clip--; return { k: 'bad', l: 'Ton übersteuert' }; }
    if (talkPeak === 0 && rmsPeak < 0.01) return { k: 'wait', l: 'Sag mal etwas' };
    if (talkPeak > 0 && talkPeak < 0.02) return { k: 'warn', l: 'Ton zu leise' };
    return { k: 'ok', l: 'Ton gut' };
  }

  async function frame() {
    if (!face || busy || !video.videoWidth) return;
    busy = true;
    try {
      const f = (await face.detect(video))[0];
      if (!f) faceState = { k: 'warn', l: 'Kein Gesicht im Bild' };
      else {
        const b = f.boundingBox, W = video.videoWidth, H = video.videoHeight;
        const cx = (b.x + b.width / 2) / W, cy = (b.y + b.height / 2) / H, h = b.height / H;
        if (h < 0.14) faceState = { k: 'warn', l: 'Etwas näher ran' };
        else if (h > 0.5) faceState = { k: 'warn', l: 'Etwas weiter weg' };
        else if (cx < 0.33 || cx > 0.67) faceState = { k: 'warn', l: 'Mehr in die Mitte' };
        else if (cy > 0.55) faceState = { k: 'warn', l: 'Kamera tiefer oder Kopf höher' };
        else faceState = { k: 'ok', l: 'Bildausschnitt gut' };
      }
    } catch { faceState = null; }
    busy = false;
  }

  const chip = s => s ? `<span class="tc tc-${s.k}">${esc(s.l)}</span>` : '';
  let n = 0;
  const iv = setInterval(() => {
    if (panel.hidden) return;
    if (n++ % 2 === 0) frame();
    panel.innerHTML = chip(light()) + chip(sound()) + chip(faceState);
  }, 600);

  return { onLevel, stop: () => clearInterval(iv), hasFace: !!face };
}
