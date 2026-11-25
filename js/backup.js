// Sicherung: alles aus der App in eine Datei (für Google Drive) und wieder zurück.
// Format: "KLAPPE-BACKUP-1\n" + Länge der Beschreibung + "\n" + JSON + Dateien (Videos, Fotos, Stimmen) hintereinander.
import { db, ls } from './db.js';

const MAGIC = 'KLAPPE-BACKUP-1\n';
const STORES = ['scripts', 'auditions', 'kv', 'audio', 'takes'];
const SKIP_LS = ['klappe.eleven.key']; // API-Schlüssel nie in die Sicherung

export async function lastBackup() { return ls.get('backup.last', 0); }
export async function hasData() {
  const [s, a] = await Promise.all([db.all('scripts'), db.all('auditions')]);
  return s.length + a.length > 0;
}

// Blobs in Objekten durch Verweise ersetzen
function strip(v, blobs) {
  if (v instanceof Blob) { blobs.push(v); return { __blob: blobs.length - 1, type: v.type }; }
  if (Array.isArray(v)) return v.map(x => strip(x, blobs));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = strip(v[k], blobs); return o; }
  return v;
}
function restore(v, get) {
  if (v && typeof v === 'object' && '__blob' in v) return get(v.__blob, v.type);
  if (Array.isArray(v)) return v.map(x => restore(x, get));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = restore(v[k], get); return o; }
  return v;
}

export async function makeBackup({ withTakes = true } = {}) {
  const blobs = [];
  const data = {};
  for (const s of STORES) {
    if (s === 'takes' && !withTakes) continue;
    data[s] = strip(await db.all(s), blobs);
  }
  const local = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('klappe.') && !SKIP_LS.includes(k)) local[k] = localStorage.getItem(k);
  }
  const sizes = blobs.map(b => b.size);
  const head = JSON.stringify({ created: new Date().toISOString(), app: 'Klappe', data, local, sizes });
  const headBytes = new TextEncoder().encode(head);
  const file = new Blob([MAGIC, String(headBytes.length) + '\n', headBytes, ...blobs], { type: 'application/octet-stream' });
  const d = new Date().toISOString().slice(0, 10);
  return new File([file], `Klappe-Sicherung-${d}.klappe`, { type: 'application/octet-stream' });
}

export async function readBackup(file) {
  const first = await file.slice(0, 64).text();
  if (!first.startsWith(MAGIC)) throw new Error('Das ist keine Klappe-Sicherung.');
  const nl = first.indexOf('\n', MAGIC.length);
  const len = +first.slice(MAGIC.length, nl);
  const start = new TextEncoder().encode(first.slice(0, nl + 1)).length;
  const head = JSON.parse(await file.slice(start, start + len).text());
  let off = start + len;
  const offsets = head.sizes.map(s => { const o = off; off += s; return o; });
  const get = (i, type) => file.slice(offsets[i], offsets[i] + head.sizes[i], type);
  return { head, data: restore(head.data, get) };
}

export function summary(data) {
  const n = k => (data[k] || []).length;
  return { scripts: n('scripts'), auditions: n('auditions'), takes: n('takes'), audio: n('audio') };
}

export async function applyBackup({ head, data }) {
  for (const s of STORES) for (const rec of data[s] || []) {
    // Blob vollständig in den Speicher holen, bevor die Datei wieder freigegeben wird
    const r = await materialize(rec);
    await db.put(s, r);
  }
  for (const [k, v] of Object.entries(head.local || {})) { try { localStorage.setItem(k, v); } catch {} }
}
async function materialize(v) {
  if (v instanceof Blob) return new Blob([await v.arrayBuffer()], { type: v.type });
  if (Array.isArray(v)) return Promise.all(v.map(materialize));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = await materialize(v[k]); return o; }
  return v;
}

export async function saveBackup(file, how) {
  if (how === 'share' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); ls.set('backup.last', Date.now()); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  ls.set('backup.last', Date.now());
  return 'downloaded';
}
