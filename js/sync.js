// Abgleich Handy ↔ PC über ein privates GitHub-Repository des Nutzers.
// Aufbau im Repo: index.json (wer hat was wann geändert), rec/… (Einträge), blob/… (Videos, Fotos, Stimmen).
// Pro Abgleich genau ein Commit. Der neuere Stand eines Eintrags gewinnt.
import { db, ls, SYNC_STORES } from './db.js';
import { localSettings, merge, applySettings } from './settings.js';

const API = 'https://api.github.com';
export const syncCfg = () => Object.assign({ repo: '', token: '', takes: false }, ls.get('sync', null) || {});
export const setSyncCfg = v => ls.set('sync', { ...syncCfg(), ...v });
export const syncState = () => Object.assign({ last: 0, ok: null, msg: '' }, ls.get('sync.state', null) || {});
const setState = s => { ls.set('sync.state', { ...syncState(), ...s }); window.dispatchEvent(new Event('klappe-sync')); };

async function gh(path, opts = {}) {
  const { repo, token } = syncCfg();
  const r = await fetch(`${API}/repos/${repo}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (r.status === 401) throw new Error('Schlüssel ungültig oder abgelaufen.');
  if (r.status === 403) throw new Error('Schlüssel hat keine Schreibrechte auf das Repository.');
  return r;
}

const b64FromBlob = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(blob); });
const b64FromText = t => b64FromBlob(new Blob([t], { type: 'application/json' }));
function blobFromB64(b64, type) {
  const bin = atob(b64.replace(/\n/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
const textFromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), c => c.charCodeAt(0)));
function hash(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const safe = id => String(id).replace(/[^\w-]/g, '_').slice(0, 60) + '-' + hash(String(id));

// Repo prüfen (für die Einrichtung)
export async function testConnection() {
  const { repo, token } = syncCfg();
  if (!repo || !token) throw new Error('Repository und Schlüssel fehlen.');
  const r = await fetch(`${API}/repos/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (r.status === 404) throw new Error('Repository nicht gefunden. Hat der Schlüssel Zugriff darauf?');
  if (r.status === 401) throw new Error('Schlüssel ungültig.');
  const j = await r.json();
  if (!j.private) throw new Error('Das Repository ist öffentlich. Für deine Daten muss es privat sein.');
  if (j.permissions && !j.permissions.push) throw new Error('Der Schlüssel darf nicht schreiben. Rechte: Contents → Read and write.');
  return true;
}

let running = null;
export function syncNow(opts) {
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ quiet = false } = {}) {
  const cfg = syncCfg();
  if (!cfg.repo || !cfg.token) return { skipped: true };
  if (!navigator.onLine) return { skipped: true };
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await round(cfg);
      if (res !== 'retry') { setState({ last: Date.now(), ok: true, msg: res.msg }); return res; }
    }
    throw new Error('Das andere Gerät gleicht gerade auch ab. Gleich nochmal versuchen.');
  } catch (e) {
    setState({ last: Date.now(), ok: false, msg: e.message || String(e) });
    if (!quiet) throw e;
    return { error: e.message };
  }
}

async function round(cfg) {
  // 1. Aktuellen Stand holen
  let head = null, tree = {}, index = { v: 1, items: {} };
  const ref = await gh('/git/ref/heads/main');
  if (ref.ok) {
    head = (await ref.json()).object.sha;
    const commit = await (await gh(`/git/commits/${head}`)).json();
    const t = await (await gh(`/git/trees/${commit.tree.sha}?recursive=1`)).json();
    for (const n of t.tree || []) if (n.type === 'blob') tree[n.path] = n.sha;
    if (tree['index.json']) index = JSON.parse(textFromB64((await (await gh(`/git/blobs/${tree['index.json']}`)).json()).content));
  } else if (ref.status !== 404 && ref.status !== 409) throw new Error('GitHub antwortet nicht (' + ref.status + ').');

  // 2. Lokalen Stand sammeln
  const stores = SYNC_STORES.filter(s => s !== 'takes' || cfg.takes);
  const local = {};
  for (const s of stores) for (const r of await db.all(s)) if (db.syncs(s, r.id)) local[`${s}/${r.id}`] = { s, r };
  const tombs = {};
  for (const t of await db.all('tomb')) tombs[t.id] = t;

  const uploads = []; // {path, b64}
  let up = 0, down = 0, gone = 0;

  // Einstellungen (ElevenLabs-Schlüssel, Stimmen, Proben …) pro Einstellung zusammenführen statt überschreiben
  const SK = 'kv/settings';
  let remoteSet = null;
  if (index.items[SK]?.p && tree[index.items[SK].p]) {
    try { remoteSet = JSON.parse(textFromB64((await (await gh(`/git/blobs/${tree[index.items[SK].p]}`)).json()).content)).v || null; } catch { remoteSet = null; }
  }
  const merged = merge(localSettings(), remoteSet || {});
  applySettings(merged);
  const norm = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k].raw, o[k].t]));
  if (Object.keys(merged).length && norm(merged) !== norm(remoteSet)) {
    const rp = 'rec/kv/settings.json';
    uploads.push({ path: rp, b64: await b64FromText(JSON.stringify({ id: 'settings', v: merged })) });
    index.items[SK] = { u: Date.now(), p: rp };
    up++;
  }
  if (remoteSet && norm(merged) !== norm(localSettings())) down++;
  const keys = new Set([...Object.keys(local), ...Object.keys(index.items), ...Object.keys(tombs)]);
  for (const key of keys) {
    const store = key.split('/')[0];
    if (!stores.includes(store) || key === SK) continue;
    const L = local[key], R = index.items[key], T = tombs[key];
    const lu = L ? (L.r._u || 1) : 0, ru = R ? R.u : 0, tu = T ? T._u : 0;
    if (L && lu > ru && lu > tu) {
      if (store === 'takes' && L.r.blob?.size > 90e6) continue; // GitHub nimmt höchstens 100 MB pro Datei
      // Hochladen
      const blobs = [];
      const strip = (v, path) => {
        if (v instanceof Blob) { const p = `blob/${store}/${safe(L.r.id)}/${blobs.length}`; blobs.push({ p, v }); return { __blob: p, type: v.type }; }
        if (Array.isArray(v)) return v.map((x, i) => strip(x, path + i));
        if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = strip(v[k], path + k); return o; }
        return v;
      };
      const rec = strip(L.r, '');
      for (const b of blobs) uploads.push({ path: b.p, b64: await b64FromBlob(b.v) });
      const rp = `rec/${store}/${safe(L.r.id)}.json`;
      uploads.push({ path: rp, b64: await b64FromText(JSON.stringify(rec)) });
      index.items[key] = { u: lu, p: rp };
      up++;
    } else if (T && tu > ru && tu >= lu) {
      if (R && !R.d) { index.items[key] = { u: tu, d: true }; up++; }
    } else if (R && ru > Math.max(lu, tu)) {
      // Herunterladen oder löschen
      if (R.d) { if (L) { await db.delRaw(store, L.r.id); gone++; } continue; }
      const sha = tree[R.p];
      if (!sha) continue;
      const rec = JSON.parse(textFromB64((await (await gh(`/git/blobs/${sha}`)).json()).content));
      const fill = async v => {
        if (v && typeof v === 'object' && v.__blob) { const bs = tree[v.__blob]; return bs ? blobFromB64((await (await gh(`/git/blobs/${bs}`)).json()).content, v.type) : null; }
        if (Array.isArray(v)) return Promise.all(v.map(fill));
        if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = await fill(v[k]); return o; }
        return v;
      };
      const full = await fill(rec);
      full._u = ru;
      await db.putRaw(store, full);
      if (T) await db.delRaw('tomb', key);
      down++;
    }
  }

  // 3. Eigene Änderungen in einem Commit hochladen
  if (up) {
    const shas = [];
    for (const u of uploads) {
      const r = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: u.b64, encoding: 'base64' }) });
      if (!r.ok) throw new Error('Hochladen fehlgeschlagen (' + r.status + ').');
      shas.push({ path: u.path, mode: '100644', type: 'blob', sha: (await r.json()).sha });
    }
    const ib = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64FromText(JSON.stringify(index)), encoding: 'base64' }) });
    shas.push({ path: 'index.json', mode: '100644', type: 'blob', sha: (await ib.json()).sha });
    let baseTree = null;
    if (head) baseTree = (await (await gh(`/git/commits/${head}`)).json()).tree.sha;
    const nt = await (await gh('/git/trees', { method: 'POST', body: JSON.stringify(baseTree ? { base_tree: baseTree, tree: shas } : { tree: shas }) })).json();
    const device = /Android|iPhone/i.test(navigator.userAgent) ? 'Handy' : 'PC';
    const nc = await (await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Abgleich vom ${device}: ${up} Änderungen`, tree: nt.sha, parents: head ? [head] : [] }) })).json();
    const upd = head
      ? await gh('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: nc.sha, force: false }) })
      : await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/main', sha: nc.sha }) });
    if (upd.status === 422 || upd.status === 409) return 'retry';
    if (!upd.ok) throw new Error('Speichern bei GitHub fehlgeschlagen (' + upd.status + ').');
  }
  // Erledigte Löschvermerke aufräumen
  for (const [k, t] of Object.entries(tombs)) if (index.items[k]?.d || !index.items[k]) { if (Date.now() - t._u > 30 * 86400e3) await db.delRaw('tomb', k); }
  if (down || gone) window.dispatchEvent(new Event('klappe-synced'));
  const parts = [up && `${up} hochgeladen`, down && `${down} geholt`, gone && `${gone} gelöscht`].filter(Boolean);
  return { up, down, gone, msg: parts.length ? parts.join(', ') : 'Alles aktuell' };
}

// Automatisch abgleichen: beim Start, beim Zurückkehren in die App und kurz nach Änderungen
let timer = null;
export function autoSync() {
  const run = () => { if (syncCfg().token) syncNow({ quiet: true }); };
  window.addEventListener('klappe-changed', () => { clearTimeout(timer); timer = setTimeout(run, 8000); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); else if (timer) { clearTimeout(timer); run(); } });
  window.addEventListener('online', run);
  setTimeout(run, 2500);
}
