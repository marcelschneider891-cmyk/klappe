// Showreel-Baukasten: Takes auswählen, Titelkarte davor, alles zu einem Video zusammenfügen.
import { db, uid } from './db.js';
import { $, $$, esc, ICON, setTop, setFab, largeTitle, openSheet, closeSheet, toast, buzz, fmtDate } from './ui.js';
import { getProfile } from './profile.js';
import { pickMime, reviewTake } from './tape.js';
import { downloadTake, shareTake } from './takes.js';

const W = 1920, H = 1080;
const REEL = { title: 'Showreel', me: [] };

export async function showreelView(view, { go }) {
  setTop({ title: 'Showreel', back: true, large: true });
  const all = await db.all('takes');
  const reels = all.filter(t => t.scriptId === '__reel').sort((a, b) => b.created.localeCompare(a.created));
  const takes = all.filter(t => t.scriptId !== '__reel');
  const scripts = Object.fromEntries((await db.all('scripts')).map(s => [s.id, s]));
  setFab(takes.length ? { label: 'Neues Showreel', icon: ICON.film, onClick: () => builder(takes, scripts, go) } : null);
  const urls = [];
  view.innerHTML = `${largeTitle('Showreel', 'Deine besten Takes in einem Video')}
   ${reels.length ? `<div class="list">${reels.map(r => `<button class="li" type="button" data-r="${esc(r.id)}"><span class="tile">${ICON.film}</span><span class="li-main"><b>${esc(r.name || 'Showreel ' + r.n)}</b><small>${r.dur} s · ${esc(fmtDate(r.created))}</small></span>${ICON.chev}</button>`).join('')}</div>`
     : `<div class="empty"><b>Noch kein Showreel</b>${takes.length ? 'Tipp auf „Neues Showreel“, wähl deine besten Takes und Klappe setzt sie mit einer Titelkarte zusammen.' : 'Nimm zuerst ein paar Self-Tapes auf. Markier die besten als Favorit, dann baust du hier daraus dein Showreel.'}</div>`}
   <p class="legal" style="margin-top:16px">Tipp: Kürz die Takes vorher mit „Zuschneiden“ auf die stärksten Momente. Ein gutes Showreel dauert 1 bis 2 Minuten.</p>`;
  view.querySelector('.list')?.addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = reels.find(x => x.id === b.dataset.r);
    openSheet(r.name || 'Showreel', `<div class="list">
      <button class="li" data-a="play" type="button"><span class="tile">${ICON.play}</span><span class="li-main"><b>Ansehen</b></span></button>
      <button class="li" data-a="share" type="button"><span class="tile">${ICON.share}</span><span class="li-main"><b>Teilen</b><small>An Agentur, Casting-Büro, Website</small></span></button>
      <button class="li" data-a="dl" type="button"><span class="tile">${ICON.dl}</span><span class="li-main"><b>Speichern</b></span></button>
      <button class="li" data-a="del" type="button"><span class="tile" style="color:var(--bad)">${ICON.trash}</span><span class="li-main"><b>Löschen</b></span></button></div>`, body => {
      body.onclick = async ev => {
        const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
        const sc = { title: r.name || 'Showreel', me: [] };
        if (a === 'play') reviewTake(r, sc); else if (a === 'share') shareTake(r, sc); else if (a === 'dl') downloadTake(r, sc);
        else { await db.del('takes', r.id); closeSheet(); go('showreel', true); }
      };
    });
  });
  return () => urls.forEach(u => URL.revokeObjectURL(u));
}

async function builder(takes, scripts, go) {
  const p = await getProfile();
  takes.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.created.localeCompare(a.created));
  const picked = [];
  openSheet('Neues Showreel', `
   <span class="flabel">Takes auswählen (Reihenfolge = Reihenfolge im Video)</span>
   <div class="list" id="rbList">${takes.map(t => `<button class="li" type="button" data-t="${esc(t.id)}"><span class="tile" data-no></span><span class="li-main"><b>${esc(scripts[t.scriptId]?.title || 'Take')} · Take ${t.n}${t.fav ? ' ★' : ''}</b><small>${t.dur} s · ${esc(fmtDate(t.created))}</small></span></button>`).join('')}</div>
   <div class="field"><label for="rbName">Titelkarte: Name</label><input class="inp" id="rbName" value="${esc(p.name)}"></div>
   <div class="field"><label for="rbSub">Zweite Zeile</label><input class="inp" id="rbSub" value="${esc([p.beruf, p.spielalterVon && `Spielalter ${p.spielalterVon}–${p.spielalterBis}`, p.groesse && p.groesse + ' cm'].filter(Boolean).join(' · '))}"></div>
   <div class="field"><label for="rbContact">Kontakt am Ende (optional)</label><input class="inp" id="rbContact" value="${esc(p.email || p.agentur || p.links?.website || '')}"></div>
   <p class="muted small" id="rbInfo">Wähl mindestens einen Take.</p>
   <div class="progress" id="rbProg" hidden><i></i></div>
   <button class="btn fill wide" id="rbGo" type="button" disabled>Showreel erstellen</button>`, body => {
    const info = () => {
      const sec = picked.reduce((s, t) => s + (t.dur || 0), 0) + 3 + ($('#rbContact', body).value.trim() ? 3 : 0);
      $('#rbInfo', body).textContent = picked.length ? `${picked.length} Takes, etwa ${sec} Sekunden. Das Erstellen dauert genauso lang, lass den Bildschirm dabei an.` : 'Wähl mindestens einen Take.';
      $('#rbGo', body).disabled = !picked.length;
      $$('#rbList [data-t]', body).forEach(el => { const i = picked.findIndex(t => t.id === el.dataset.t); const tile = $('[data-no]', el); tile.textContent = i >= 0 ? i + 1 : ''; tile.className = 'tile' + (i >= 0 ? ' t-halten' : ''); });
    };
    $('#rbList', body).onclick = e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const i = picked.findIndex(t => t.id === b.dataset.t);
      if (i >= 0) picked.splice(i, 1); else picked.push(takes.find(t => t.id === b.dataset.t));
      info();
    };
    $('#rbContact', body).oninput = info;
    $('#rbGo', body).onclick = async () => {
      const btn = $('#rbGo', body); btn.disabled = true; $('#rbProg', body).hidden = false;
      let wake = null; try { wake = await navigator.wakeLock?.request('screen'); } catch {}
      try {
        const out = await render(picked, { name: $('#rbName', body).value.trim(), sub: $('#rbSub', body).value.trim(), contact: $('#rbContact', body).value.trim() },
          (pr, msg) => { $('#rbProg i', body).style.width = Math.round(pr * 100) + '%'; if (msg) $('#rbInfo', body).textContent = msg; });
        const n = (await db.all('takes')).filter(t => t.scriptId === '__reel').length + 1;
        await db.put('takes', { id: uid(), scriptId: '__reel', n, name: 'Showreel ' + n, created: new Date().toISOString(), type: out.type, dur: out.dur, blob: out.blob });
        buzz(20); closeSheet(); toast('Showreel fertig'); go('showreel', true);
      } catch (e) { console.error(e); toast('Das Showreel konnte nicht erstellt werden.'); btn.disabled = false; }
      try { wake?.release(); } catch {}
    };
  });
}

function card(g, { name, sub, contact }, end) {
  g.fillStyle = '#0F1113'; g.fillRect(0, 0, W, H);
  const grd = g.createRadialGradient(W / 2, 0, 20, W / 2, 0, W * 0.7);
  grd.addColorStop(0, 'rgba(212,176,114,.25)'); grd.addColorStop(1, 'rgba(212,176,114,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.fillStyle = '#ECE8E1'; g.font = '700 108px Archivo, sans-serif'; g.fillText(name || '', W / 2, H / 2 - (end ? 45 : 0));
  g.fillStyle = '#D4B072'; g.font = '500 48px Archivo, sans-serif'; g.fillText(end ? contact : sub || '', W / 2, H / 2 + (end ? 60 : 90));
}

async function render(clips, txt, onProgress) {
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const dest = ac.createMediaStreamDestination();
  await ac.resume();
  const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const type = await pickMime();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 } : undefined);
  const parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  const total = clips.reduce((s, t) => s + (t.dur || 0), 0) + 3 + (txt.contact ? 3 : 0);
  let elapsed = 0;
  const hold = (ms, draw) => new Promise(r => { const t0 = performance.now(); const iv = setInterval(() => { const k = (performance.now() - t0) / ms; draw(Math.min(1, k)); onProgress((elapsed + Math.min(ms, performance.now() - t0) / 1000) / total); if (k >= 1) { clearInterval(iv); elapsed += ms / 1000; r(); } }, 33); });

  rec.start(1000);
  // Titelkarte mit Ein- und Ausblenden
  await hold(3000, k => { card(g, txt); g.fillStyle = `rgba(0,0,0,${k < 0.2 ? 1 - k / 0.2 : k > 0.85 ? (k - 0.85) / 0.15 : 0})`; g.fillRect(0, 0, W, H); });
  for (let i = 0; i < clips.length; i++) {
    onProgress(elapsed / total, `Take ${i + 1} von ${clips.length} wird eingefügt …`);
    const v = document.createElement('video');
    v.playsInline = true; v.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px;opacity:0';
    document.body.appendChild(v);
    const url = URL.createObjectURL(clips[i].blob);
    v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video')); });
    const src = ac.createMediaElementSource(v);
    const gain = ac.createGain(); gain.gain.value = 0;
    src.connect(gain).connect(dest);
    await v.play();
    gain.gain.setTargetAtTime(1, ac.currentTime, 0.08);
    const t0 = performance.now();
    await new Promise(res => {
      const iv = setInterval(() => {
        const vw = v.videoWidth || W, vh = v.videoHeight || H, s = Math.min(W / vw, H / vh);
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
        const t = v.currentTime, d = isFinite(v.duration) ? v.duration : clips[i].dur || 9999;
        const fade = t < 0.3 ? 1 - t / 0.3 : d - t < 0.3 ? 1 - (d - t) / 0.3 : 0;
        if (fade > 0) { g.fillStyle = `rgba(0,0,0,${fade})`; g.fillRect(0, 0, W, H); }
        onProgress((elapsed + (performance.now() - t0) / 1000) / total);
        if (v.ended || t >= d - 0.02) { clearInterval(iv); res(); }
      }, 33);
    });
    elapsed += (performance.now() - t0) / 1000;
    src.disconnect(); v.remove(); URL.revokeObjectURL(url);
  }
  if (txt.contact) await hold(3000, k => { card(g, txt, true); g.fillStyle = `rgba(0,0,0,${k < 0.15 ? 1 - k / 0.15 : k > 0.85 ? (k - 0.85) / 0.15 : 0})`; g.fillRect(0, 0, W, H); });
  rec.stop(); await stopped; ac.close();
  return { blob: new Blob(parts, { type: rec.mimeType || type || 'video/webm' }), type: rec.mimeType || type || 'video/webm', dur: Math.round(elapsed) };
}
