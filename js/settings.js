// Einstellungen zwischen Handy und PC abgleichen (z. B. ElevenLabs-Schlüssel, Standard-Stimme).
// Jede Einstellung hat ihren eigenen Zeitstempel, beim Abgleich gewinnt pro Einstellung die neuere.
import { db } from './db.js';

export const LS_SYNC = ['eleven.key', 'voice.defaults', 'rehearse.opts', 'take.pattern', 'warmup.speak', 'warmup.voice', 'radar.saved', 'radar.hidden'];
const P = 'klappe.';
const stamps = () => { try { return JSON.parse(localStorage.getItem(P + 'settings.t') || '{}'); } catch { return {}; } };
const setStamps = s => { try { localStorage.setItem(P + 'settings.t', JSON.stringify(s)); } catch {} };
const noKey = () => localStorage.getItem(P + 'sync.noKey') === 'true';
const keys = () => LS_SYNC.filter(k => !(k === 'eleven.key' && noKey()));

// Aktueller Stand dieses Geräts: { key: { raw, t } }
export function localSettings() {
  const s = stamps(), out = {};
  for (const k of keys()) {
    const raw = localStorage.getItem(P + k);
    if (raw == null && !s[k]) continue;
    out[k] = { raw, t: s[k] || 1 }; // ältere Werte ohne Zeitstempel gelten als sehr alt
  }
  return out;
}

// Zwei Stände zusammenführen, pro Einstellung gewinnt der neuere
export function merge(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) if (!out[k] || (v.t || 0) > (out[k].t || 0)) out[k] = v;
  return out;
}

// Zusammengeführten Stand auf diesem Gerät übernehmen (ohne neuen Abgleich auszulösen)
export function applySettings(m) {
  const s = stamps();
  for (const [k, v] of Object.entries(m || {})) {
    if (!LS_SYNC.includes(k) || (k === 'eleven.key' && noKey())) continue;
    if ((v.t || 0) <= (s[k] || 0) && localStorage.getItem(P + k) != null) continue;
    try { v.raw == null ? localStorage.removeItem(P + k) : localStorage.setItem(P + k, v.raw); } catch {}
    s[k] = v.t;
  }
  setStamps(s);
}

// Eine Einstellung wurde hier geändert: Zeitstempel setzen und Datensatz für den Abgleich schreiben
let timer = null;
window.addEventListener('klappe-ls', e => {
  const k = e.detail;
  if (!LS_SYNC.includes(k)) return;
  const s = stamps(); s[k] = Date.now(); setStamps(s);
  clearTimeout(timer);
  timer = setTimeout(() => db.put('kv', { id: 'settings', v: localSettings() }).then(() => window.dispatchEvent(new Event('klappe-changed'))).catch(() => {}), 1500);
});
