// Kleiner IndexedDB-Speicher. Alles bleibt auf dem Handy.
const NAME = 'klappe';
const VERSION = 2;
const STORES = ['scripts', 'auditions', 'takes', 'kv', 'audio'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : r);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: store => tx(store, 'readonly', s => s.getAll()),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
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
