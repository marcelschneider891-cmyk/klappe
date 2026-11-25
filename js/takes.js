// Takes: Dateinamen nach Casting-Vorgabe, Zuschneiden, Favorit, Vergleichen.
import { db, uid, ls } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, buzz, fmtDate } from './ui.js';
import { getProfile } from './profile.js';
import { pickMime } from './tape.js';

export const PATTERN_DEFAULT = '{Name}_{Rolle}_{Projekt}_Take{Nr}';
export const pattern = () => ls.get('take.pattern', PATTERN_DEFAULT);
const clean = s => String(s || '').normalize('NFC').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
  .replace(/\(.*?\)/g, '').replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '_');
const cap = s => String(s || '').toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());

export async function takeName(take, script) {
  const p = await getProfile();
  const map = { Name: p.name, Vorname: (p.name || '').split(' ')[0], Nachname: (p.name || '').split(' ').slice(-1)[0], Rolle: cap((script?.me || [])[0] || ''), Projekt: script?.title, Nr: take.n, Datum: (take.created || '').slice(0, 10) };
  let n = pattern().replace(/\{(\w+)\}/g, (m, k) => clean(map[k] ?? ''));
  n = n.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'SelfTape_Take' + take.n;
  return n + (take.type.includes('mp4') ? '.mp4' : '.webm');
}
export async function takeFile(take, script) {
  return new File([take.blob], await takeName(take, script), { type: take.type.split(';')[0] });
}
export async function downloadTake(take, script) {
  const f = await takeFile(take, script);
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url; a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Gespeichert als ' + f.name);
}
export async function shareTake(take, script) {
  const f = await takeFile(take, script);
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: f.name }); } catch {} }
  else downloadTake(take, script);
}

export async function toggleFav(take) { take.fav = !take.fav; await db.put('takes', take); buzz(); return take.fav; }

// ---------- Zuschneiden (wird in Echtzeit neu aufgenommen) ----------
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export function trimSheet(take, script, done) {
  const url = URL.createObjectURL(take.blob);
  openSheet('Zuschneiden', `
   <video id="trV" src="${url}" playsinline controls style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9"></video>
   <div class="field"><label for="trA">Anfang: <b id="trAV">0:00.0</b></label><input id="trA" type="range" min="0" max="1" step="0.1" value="0"></div>
   <div class="field"><label for="trB">Ende: <b id="trBV">–</b></label><input id="trB" type="range" min="0" max="1" step="0.1" value="1"></div>
   <div class="grid2"><button class="btn out" id="trPrev" type="button">${ICON.play} Vorschau</button><button class="btn fill" id="trGo" type="button">Zuschnitt speichern</button></div>
   <div class="progress" id="trProg" hidden><i></i></div>
   <p class="muted small" id="trInfo">Der Zuschnitt wird als neuer Take gespeichert, das Original bleibt. Speichern dauert so lange wie das Video.</p>`, body => {
    const v = $('#trV', body), a = $('#trA', body), b = $('#trB', body);
    let dur = take.dur || 0;
    const upd = () => {
      if (+a.value > +b.value - 0.5) a.value = Math.max(0, +b.value - 0.5);
      $('#trAV', body).textContent = fmt(+a.value); $('#trBV', body).textContent = fmt(+b.value);
    };
    const setDur = d => { if (!isFinite(d) || d <= 0) return; dur = d; a.max = b.max = d.toFixed(1); b.value = d.toFixed(1); upd(); };
    v.onloadedmetadata = () => {
      if (isFinite(v.duration)) setDur(v.duration);
      else { v.currentTime = 1e6; v.ontimeupdate = () => { v.ontimeupdate = null; setDur(v.duration || v.currentTime); v.currentTime = 0; }; } // WebM ohne Dauerangabe
    };
    if (dur) setDur(dur);
    a.oninput = () => { upd(); v.currentTime = +a.value; };
    b.oninput = () => { upd(); v.currentTime = +b.value; };
    $('#trPrev', body).onclick = () => {
      v.currentTime = +a.value; v.play();
      const stop = () => { if (v.currentTime >= +b.value) { v.pause(); v.removeEventListener('timeupdate', stop); } };
      v.addEventListener('timeupdate', stop);
    };
    $('#trGo', body).onclick = async () => {
      const btn = $('#trGo', body); btn.disabled = true; $('#trPrev', body).disabled = true;
      $('#trProg', body).hidden = false;
      try {
        const out = await rerecord(take.blob, +a.value, +b.value, p => { $('#trProg i', body).style.width = Math.round(p * 100) + '%'; });
        const all = (await db.all('takes')).filter(t => t.scriptId === take.scriptId);
        const nt = { ...take, id: uid(), n: Math.max(...all.map(t => t.n)) + 1, created: new Date().toISOString(), blob: out.blob, type: out.type, dur: Math.round(+b.value - +a.value), trimOf: take.n, fav: false };
        await db.put('takes', nt);
        buzz(12); closeSheet(); toast(`Gespeichert als Take ${nt.n}`); done?.(nt);
      } catch (e) { console.error(e); toast('Zuschneiden hat nicht geklappt.'); btn.disabled = false; $('#trPrev', body).disabled = false; }
    };
  }, { onClose: () => URL.revokeObjectURL(url) });
}

async function rerecord(blob, start, end, onProgress) {
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';
  document.body.appendChild(v);
  const src = URL.createObjectURL(blob);
  v.src = src;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video')); });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaElementSource(v).connect(dest); // Ton nur in die Aufnahme, nicht auf den Lautsprecher
  v.currentTime = start;
  await new Promise(r => { v.onseeked = r; });
  const vs = (v.captureStream || v.mozCaptureStream).call(v);
  const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const type = await pickMime();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
  const parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  await ctx.resume();
  rec.start(500);
  await v.play();
  await new Promise(r => {
    const iv = setInterval(() => { onProgress(Math.min(1, (v.currentTime - start) / (end - start))); if (v.currentTime >= end || v.ended) { clearInterval(iv); r(); } }, 40);
  });
  v.pause(); rec.stop(); await stopped;
  ctx.close(); v.remove(); URL.revokeObjectURL(src);
  return { blob: new Blob(parts, { type: rec.mimeType || type || 'video/webm' }), type: rec.mimeType || type || 'video/webm' };
}

// ---------- Vergleichen ----------
export function compareSheet(takes, script) {
  if (takes.length < 2) { toast('Dafür brauchst du mindestens zwei Takes.'); return; }
  let a = takes[0], b = takes[1];
  const urls = new Map(takes.map(t => [t.id, URL.createObjectURL(t.blob)]));
  const opt = sel => takes.map(t => `<option value="${esc(t.id)}"${t.id === sel.id ? ' selected' : ''}>Take ${t.n}${t.fav ? ' ★' : ''} · ${t.dur} s</option>`).join('');
  openSheet('Takes vergleichen', `
   <div class="stack" style="gap:8px"><select class="inp" id="cA">${opt(a)}</select><video id="vA" playsinline style="width:100%;border-radius:10px;background:#000;aspect-ratio:16/9"></video></div>
   <div class="stack" style="gap:8px"><select class="inp" id="cB">${opt(b)}</select><video id="vB" playsinline style="width:100%;border-radius:10px;background:#000;aspect-ratio:16/9"></video></div>
   <div class="grid2"><button class="btn out" id="cPlayA" type="button">${ICON.play} Oben</button><button class="btn out" id="cPlayB" type="button">${ICON.play} Unten</button></div>
   <div class="grid2"><button class="btn tonal" id="cFavA" type="button">${ICON.star} Oben ist besser</button><button class="btn tonal" id="cFavB" type="button">${ICON.star} Unten ist besser</button></div>`, body => {
    const vA = $('#vA', body), vB = $('#vB', body);
    const set = () => { vA.src = urls.get(a.id); vB.src = urls.get(b.id); };
    set();
    $('#cA', body).onchange = e => { a = takes.find(t => t.id === e.target.value); set(); };
    $('#cB', body).onchange = e => { b = takes.find(t => t.id === e.target.value); set(); };
    $('#cPlayA', body).onclick = () => { vB.pause(); vA.currentTime = 0; vA.play(); };
    $('#cPlayB', body).onclick = () => { vA.pause(); vB.currentTime = 0; vB.play(); };
    const fav = async t => { for (const x of takes) if (x.fav && x.id !== t.id) { x.fav = false; await db.put('takes', x); } t.fav = true; await db.put('takes', t); buzz(12); toast(`Take ${t.n} ist dein Favorit`); };
    $('#cFavA', body).onclick = () => fav(a);
    $('#cFavB', body).onclick = () => fav(b);
  }, { onClose: () => urls.forEach(u => URL.revokeObjectURL(u)) });
}
