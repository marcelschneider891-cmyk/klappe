// Kleiner IndexedDB-Speicher. Alles bleibt auf dem Handy.
// Wichtig: Datenbanken werden ohne feste Versionsnummer geöffnet. So muss keine Version
// auf die andere warten, falls Klappe noch in einem anderen Tab offen ist.
const DBS = {
  klappe: ['scripts', 'auditions', 'takes', 'kv'],
  'klappe-audio': ['audio'],
  'klappe-plus': ['gagen'],        // neue Bereiche in eigener Datenbank, damit nie ein Umbau nötig ist
  'klappe-sync': ['tomb']          // gelöschte Einträge, damit der Abgleich sie auf dem anderen Gerät auch löscht
};
// Diese Bereiche werden zwischen Handy und PC abgeglichen
export const SYNC_STORES = ['scripts', 'auditions', 'gagen', 'kv', 'audio', 'takes'];
const KV_SYNC = ['profile', 'profilePhoto'];
const changed = () => window.dispatchEvent(new Event('klappe-changed'));
const dbOf = store => Object.keys(DBS).find(n => DBS[n].includes(store));
const cache = {};

function blocked() {
  window.__klappeErr = 'Klappe ist noch in einem anderen Tab oder Fenster offen. Schließ die anderen Klappe-Tabs und öffne die App neu.';
  window.dispatchEvent(new Event('klappe-blocked'));
}
function watch(d) {
  // Will eine neuere App-Version die Datenbank umbauen: freigeben und neu laden
  d.onversionchange = () => { d.close(); delete cache[d.name]; location.reload(); };
  return d;
}

function openDb(name) {
  if (cache[name]) return cache[name];
  const stores = DBS[name];
  const p = new Promise((resolve, reject) => {
    const create = d => { for (const s of stores) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); };
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => create(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = blocked;
    req.onsuccess = () => {
      const d = req.result;
      if (stores.every(s => d.objectStoreNames.contains(s))) return resolve(watch(d));
      // Speicherbereich fehlt: einmalig nachrüsten
      const v = d.version + 1;
      d.close();
      const up = indexedDB.open(name, v);
      up.onupgradeneeded = () => create(up.result);
      up.onerror = () => reject(up.error);
      up.onblocked = blocked;
      up.onsuccess = () => resolve(watch(up.result));
    };
  });
  cache[name] = p;
  p.catch(() => { delete cache[name]; });
  return p;
}

function tx(store, mode, fn) {
  return openDb(dbOf(store)).then(d => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : r);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const syncs = (store, id) => SYNC_STORES.includes(store) && (store !== 'kv' || KV_SYNC.includes(id));
export const db = {
  all: store => tx(store, 'readonly', s => s.getAll()),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  // Jede Änderung bekommt einen Zeitstempel; der neuere Stand gewinnt beim Abgleich
  async put(store, obj) {
    if (syncs(store, obj.id)) obj._u = Date.now();
    const r = await tx(store, 'readwrite', s => s.put(obj));
    if (syncs(store, obj.id)) changed();
    return r;
  },
  async del(store, id) {
    const r = await tx(store, 'readwrite', s => s.delete(id));
    if (syncs(store, id)) { await tx('tomb', 'readwrite', s => s.put({ id: store + '/' + id, store, rid: id, _u: Date.now() })); changed(); }
    return r;
  },
  // Für den Abgleich: ohne neuen Zeitstempel und ohne Löschvermerk
  putRaw: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  delRaw: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  syncs,
  async kv(key, val) {
    if (val === undefined) { const r = await this.get('kv', key); return r ? r.v : undefined; }
    return this.put('kv', { id: key, v: val });
  }
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Einfache Merker im localStorage (gesehene Castings usw.)
export const ls = {
  get(k, d) { try { const v = localStorage.getItem('klappe.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('klappe.' + k, JSON.stringify(v)); } catch {} }
};
