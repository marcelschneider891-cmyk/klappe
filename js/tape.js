// Self-Tape: Kamera an, Partner liest. Im Video ist die Partnerstimme laut, leise oder gar nicht zu hören.
import { Runner, initials } from './runner.js';
import { makeVAD, tts } from './speech.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, buzz } from './ui.js';
import { db, uid, ls } from './db.js';
import { Reader, scriptVoice, SOURCES } from './voices.js';
import { openVoiceSheet, voiceLabel } from './voicesheet.js';
import { downloadTake, shareTake, trimSheet, toggleFav } from './takes.js';
import { makeChecker } from './techcheck.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const LEVELS = [
  { k: 'laut', l: 'Hörbar', v: 1, d: 'Casting hört Partner und dich' },
  { k: 'leise', l: 'Leise', v: 0.3, d: 'Partner deutlich leiser als du' },
  { k: 'stumm', l: 'Stumm', v: 0, d: 'Im Video bist nur du zu hören' }
];

// Videoformat: am liebsten MP4 mit H.264 (spielt überall, auch bei Casting-Büros mit Mac).
// Manche Geräte melden H.264 als möglich, liefern aber leere Dateien. Darum einmal kurz ausprobieren.
const H264 = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
const FALLBACK = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
export async function pickMime() {
  const key = navigator.userAgent;
  const saved = ls.get('rec.mime', null);
  if (saved && saved.ua === key) return saved.mime;
  let mime = FALLBACK.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  if (window.MediaRecorder?.isTypeSupported?.(H264) && await probe(H264)) mime = H264;
  ls.set('rec.mime', { ua: key, mime });
  return mime;
}
async function probe(type) {
  try {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator(), d = ac.createMediaStreamDestination(); osc.connect(d); osc.start();
    const s = new MediaStream([...c.captureStream(15).getVideoTracks(), ...d.stream.getAudioTracks()]);
    const rec = new MediaRecorder(s, { mimeType: type });
    let bytes = 0;
    rec.ondataavailable = e => { bytes += e.data.size; };
    const iv = setInterval(() => { g.fillStyle = `hsl(${Date.now() % 360},50%,50%)`; g.fillRect(0, 0, 320, 180); }, 60);
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(200);
    await new Promise(r => setTimeout(r, 700));
    rec.stop(); await done; clearInterval(iv); osc.stop(); ac.close(); s.getTracks().forEach(t => t.stop());
    return bytes > 1000;
  } catch { return false; }
}

const isTouch = () => matchMedia('(hover: none)').matches;

// Tonmischung fürs Video: Mikro + (bei ElevenLabs/Aufnahme) sauber eingemischter Partner
function makeMixer(cam, level) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const dest = ctx.createMediaStreamDestination();
  const micGain = ctx.createGain();
  const partnerGain = ctx.createGain();
  partnerGain.gain.value = level;
  ctx.createMediaStreamSource(new MediaStream(cam.getAudioTracks())).connect(micGain).connect(dest);
  partnerGain.connect(dest);
  let lvl = level;
  return {
    ctx,
    stream: new MediaStream([...cam.getVideoTracks(), ...dest.stream.getAudioTracks()]),
    attach(el) { const src = ctx.createMediaElementSource(el); src.connect(ctx.destination); src.connect(partnerGain); },
    // Während der Partner spricht: Mikro passend dämpfen
    partner(on, digital) {
      const target = !on ? 1 : digital ? 0 : lvl;
      micGain.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
    },
    setLevel(v) { lvl = v; partnerGain.gain.value = v; },
    resume() { if (ctx.state === 'suspended') return ctx.resume(); },
    close() { try { ctx.close(); } catch {} }
  };
}

export async function tapeView(view, script, { exit, profile }) {
  const opts = Object.assign({ listen: 'vad', hide: 'zeigen', rate: 1, pause: 1000, cueGap: 150, slate: false, facing: 'user', level: 'laut', eyeline: 'links', guide: true }, ls.get('tape.opts', {}));
  const me = script.me || [];
  let checker = null;
  let stream = null, vad = null, mixer = null, reader = null, rec = null, chunks = [], t0 = 0, timer = null, runner = null, recording = false, wake = null;
  const level = () => LEVELS.find(l => l.k === opts.level) || LEVELS[0];

  view.innerHTML = `
  <div class="tp">
   <video id="cam" playsinline autoplay muted></video>
   <div class="tp-guide" id="tpGuide"><i class="eyes"></i><i class="head"></i></div>
   <div class="tp-tap" id="tpTap"></div>
   <div class="tp-eye" id="tpLook">${ICON.eye}<span>Blick hierhin</span></div>
   <div class="tp-check" id="tpCheck"></div>
   <div class="tp-prompt" id="tpPrompt"><div class="w">Bereit</div><div class="x">${isTouch() ? 'Tippe auf Aufnahme' : 'Klick auf Aufnahme oder drück die Leertaste'}. Nach dem Countdown startet die Szene.</div></div>
   <div class="tp-keys"><span><span class="kbd">Leertaste</span> Aufnahme</span><span><span class="kbd">→</span> Weiter</span><span><span class="kbd">L</span> Line!</span><span><span class="kbd">Esc</span> Schließen</span></div>
   <div class="tp-top">
    <button class="ic" id="tpExit" type="button" aria-label="Schließen">${ICON.x}</button>
    <div class="row" style="gap:6px"><button class="ic" id="tpEye" type="button" aria-label="Textanzeige wechseln">${ICON.eye}</button><button class="ic" id="tpGear" type="button" aria-label="Einstellungen">${ICON.tune}</button></div>
   </div>
   <div class="tp-time" id="tpTime" hidden>0:00</div>
   <div class="rotate only-touch" id="tpRot">Handy quer halten, wie beim echten Self-Tape</div>
   <div class="count" id="tpCount" hidden></div>
   <div class="tp-ctl">
    <button class="tp-chip" id="tpVoice" type="button"></button>
    <button class="recbtn" id="tpRec" type="button" aria-label="Aufnahme starten"><i></i></button>
    <button class="ic" id="tpFlip" type="button" aria-label="Kamera wechseln">${ICON.flip}</button>
   </div>
  </div>`;

  const video = $('#cam', view), prompt = $('#tpPrompt', view), recBtn = $('#tpRec', view), time = $('#tpTime', view);
  const chip = () => {
    const src = scriptVoice(script).source;
    $('#tpVoice', view).innerHTML = `${ICON.voice}<span>${src === 'none' ? 'Stimme aus' : `${esc(voiceLabel(script))} · im Video ${esc(level().l.toLowerCase())}`}</span>`;
  };
  chip();
  // Technik-Check und Rahmen nur vor der Aufnahme, Blickmarke immer (falls an)
  function layout() {
    $('#tpCheck', view).hidden = recording;
    $('#tpGuide', view).hidden = recording || !opts.guide;
    const look = $('#tpLook', view);
    look.hidden = opts.eyeline === 'aus';
    look.className = 'tp-eye ' + (opts.eyeline === 'rechts' ? 'r' : 'l');
  }

  async function startCam() {
    stream?.getTracks().forEach(t => t.stop());
    vad?.close(); mixer?.close(); reader = null;
    const vid = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    const aud = { echoCancellation: false, noiseSuppression: false, autoGainControl: true };
    // Gewählte Kamera / gewähltes Mikro (PC mit Webcam, externem Mikro usw.), sonst Front- oder Rückkamera
    if (opts.camId) vid.deviceId = { exact: opts.camId }; else vid.facingMode = opts.facing;
    if (opts.micId) aud.deviceId = { exact: opts.micId };
    try {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: vid, audio: aud }); }
      catch (e) {
        if (!opts.camId && !opts.micId) throw e;
        opts.camId = ''; opts.micId = ''; ls.set('tape.opts', opts); // Gerät nicht mehr da: Standard nehmen
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...vid, deviceId: undefined, facingMode: opts.facing }, audio: { ...aud, deviceId: undefined } });
      }
    } catch {
      prompt.innerHTML = '<div class="w">Kamera</div><div class="x">Kein Zugriff auf Kamera oder Mikro. Erlaube beides in den Chrome-Einstellungen für diese Seite.</div>';
      recBtn.disabled = true;
      return;
    }
    video.srcObject = stream;
    const facing = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
    video.classList.toggle('mirror', facing ? facing === 'user' : (opts.camId ? true : opts.facing === 'user'));
    vad = makeVAD(stream, { onLevel: (v, rms, talking) => checker?.onLevel(v, rms, talking) });
    checker?.stop(); checker = makeChecker(video, $('#tpCheck', view));
    layout();
    mixer = makeMixer(stream, level().v);
    reader = new Reader(script, { mixer });
  }
  await startCam();

  const show = (who, text, mine) => {
    const t = mine && opts.hide === 'anfang' ? initials(text) : text;
    prompt.innerHTML = `<div class="w">${esc(who)}</div><div class="x${mine ? '' : ' dim'}${mine && opts.hide === 'aus' ? ' hide' : ''}">${esc(t)}</div>`;
    if (mine && opts.hide === 'aus') prompt.querySelector('.x').onclick = e => e.target.classList.remove('hide');
  };

  const hooks = {
    onIndex(i) {
      const b = script.blocks[i];
      if (!b) return;
      if (b.type === 'act') { show('Regie', b.text, false); return; }
      show(b.who, b.text, me.includes(b.who));
    },
    onState(s) { if (s === 'end' && recording) setTimeout(() => recording && stopRec(), 1400); },
    onPartner(on) { mixer?.partner(on, reader?.digital); },
    onFeed(text) { const x = prompt.querySelector('.x'); if (x) { x.classList.remove('hide'); x.textContent = text; } },
    onHeard() {}, onFinish() {}
  };

  async function countdown() {
    const c = $('#tpCount', view);
    c.hidden = false;
    for (const n of [3, 2, 1]) { c.textContent = n; buzz(6); await sleep(800); }
    c.hidden = true;
  }

  async function startRec() {
    if (!stream || !mixer) return;
    if (!window.MediaRecorder) { toast('Dieser Browser kann nicht aufnehmen.'); return; }
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
    await mixer.resume();
    recBtn.classList.add('on'); recBtn.setAttribute('aria-label', 'Aufnahme stoppen');
    recording = true;
    layout();
    $('#tpVoice', view).hidden = true; $('#tpFlip', view).hidden = true;
    await countdown();
    if (!recording) return;
    const mime = await mimeP;
    chunks = [];
    rec = new MediaRecorder(mixer.stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = saveTake;
    rec.start(1000);
    t0 = Date.now();
    time.hidden = false;
    timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    $('#tpRot', view).hidden = true;
    runner = new Runner({ script, me, opts: { ...opts, readActions: false }, vad, hooks, reader, quietFeed: true });
    if (opts.slate) {
      const p = profile || {};
      show('Vorstellung', [p.name, p.groesse ? p.groesse + ' cm' : '', p.wohnort].filter(Boolean).join(' · ') + '. Danach kurz Pause, dann startet die Szene.', true);
      await new Promise(res => vad ? vad.arm(opts.pause, res) : setTimeout(res, 6000));
      if (!recording) return;
    }
    await sleep(400);
    const first = script.blocks.findIndex(b => b.type === 'line');
    runner.play(first < 0 ? 0 : first);
  }

  function stopRec() {
    recording = false;
    layout();
    runner?.destroy(); runner = null;
    mixer?.partner(false);
    clearInterval(timer);
    time.hidden = true;
    recBtn.classList.remove('on'); recBtn.setAttribute('aria-label', 'Aufnahme starten');
    $('#tpCount', view).hidden = true;
    $('#tpVoice', view).hidden = false; $('#tpFlip', view).hidden = false;
    if (rec && rec.state !== 'inactive') rec.stop();
    try { wake?.release(); } catch {}
  }

  async function saveTake() {
    if (!chunks.length) return;
    const type = rec.mimeType || chunks[0].type || 'video/webm';
    const blob = new Blob(chunks, { type });
    const dur = Math.round((Date.now() - t0) / 1000);
    const n = (await db.all('takes')).filter(t => t.scriptId === script.id).length + 1;
    const take = { id: uid(), scriptId: script.id, n, created: new Date().toISOString(), type, dur, blob, voice: scriptVoice(script).source, level: opts.level };
    if (blob.size < 2000) { toast('Die Aufnahme ist leer geblieben. Bitte nochmal versuchen.'); ls.set('rec.mime', null); return; }
    try { await db.put('takes', take); } catch { toast('Speicher voll. Take bitte gleich herunterladen.'); }
    reviewTake(take, script);
  }

  const voiceSheet = () => {
    const src = scriptVoice(script).source;
    openSheet('Stimme im Self-Tape', `
     <div class="list">
      <button class="li" type="button" id="tvSrc"><span class="tile">${ICON.voice}</span><span class="li-main"><b>Partnerstimme</b><small>${esc(SOURCES.find(x => x.k === src)?.l)} · ${esc(SOURCES.find(x => x.k === src)?.d)}</small></span>${ICON.chev}</button>
     </div>
     <div class="field"><span class="flabel">Partner im fertigen Video</span>
      <div class="seg" id="tvLvl">${LEVELS.map(l => `<button type="button" data-k="${l.k}"${l.k === opts.level ? ' class="on"' : ''}>${l.l}</button>`).join('')}</div>
      <p class="muted small" id="tvLvlD">${esc(level().d)}</p></div>
     <div class="card pad row" style="flex-wrap:nowrap;align-items:flex-start"><span class="tile">${ICON.head}</span><p class="small muted">Mit Kopfhörern hörst nur du den Partner, das Video bleibt komplett sauber. Bei Handy-Stimme ohne Kopfhörer nimmt das Mikro den Lautsprecher mit auf. „Stumm“ schaltet das Mikro dann kurz weg, während der Partner spricht.</p></div>
     <button class="btn fill wide" type="button" data-close>Fertig</button>`, body => {
      $('#tvSrc', body).onclick = () => openVoiceSheet(script, () => { reader = new Reader(script, { mixer }); chip(); });
      $('#tvLvl', body).onclick = e => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        opts.level = b.dataset.k; ls.set('tape.opts', opts);
        mixer?.setLevel(level().v);
        $$('#tvLvl button', body).forEach(x => x.classList.toggle('on', x === b));
        $('#tvLvlD', body).textContent = level().d;
        chip();
      };
    });
  };

  recBtn.onclick = () => { buzz(); recording ? stopRec() : startRec(); };
  $('#tpVoice', view).onclick = voiceSheet;
  $('#tpTap', view).onclick = () => { if (recording && runner) runner.next(); };
  $('#tpFlip', view).onclick = async () => {
    if (recording) return;
    // Mehrere Kameras (PC, Handy mit mehreren Linsen): der Reihe nach durchschalten
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    if (cams.length > 2 || (cams.length === 2 && !isTouch())) {
      const cur = stream?.getVideoTracks()[0]?.getSettings?.().deviceId;
      const i = cams.findIndex(c => c.deviceId === cur);
      opts.camId = cams[(i + 1) % cams.length].deviceId;
      toast(cams[(i + 1) % cams.length].label || 'Kamera gewechselt');
    } else { opts.camId = ''; opts.facing = opts.facing === 'user' ? 'environment' : 'user'; }
    ls.set('tape.opts', opts);
    await startCam();
  };
  // Tastatur am PC
  const keys = e => {
    if (!document.getElementById('cam') || !$('#sheet').hidden || /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); recBtn.click(); }
    else if (e.key === 'ArrowRight' || e.key === 'n') { if (recording && runner) runner.next(); }
    else if (e.key === 'l' || e.key === 'L') { if (recording && runner) runner.feed(); }
    else if (e.key === 'Escape') { $('#tpExit', view).click(); }
  };
  document.addEventListener('keydown', keys);
  $('#tpEye', view).onclick = () => {
    const order = ['zeigen', 'anfang', 'aus'];
    opts.hide = order[(order.indexOf(opts.hide) + 1) % 3];
    ls.set('tape.opts', opts);
    toast({ zeigen: 'Dein Text wird angezeigt', anfang: 'Nur Anfangsbuchstaben', aus: 'Dein Text ist versteckt' }[opts.hide]);
  };
  $('#tpGear', view).onclick = () => tapeSettings(opts, () => startCam(), layout);
  const mimeP = pickMime(); // vorab testen, damit die Aufnahme ohne Wartezeit startet
  const leave = () => { checker?.stop(); document.removeEventListener('keydown', keys); stopRec(); vad?.close(); mixer?.close(); stream?.getTracks().forEach(t => t.stop()); tts.cancel(); };
  $('#tpExit', view).onclick = () => { leave(); exit(); };
  return leave;
}

async function tapeSettings(opts, restartCam, relayout) {
  const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const cams = devs.filter(d => d.kind === 'videoinput'), mics = devs.filter(d => d.kind === 'audioinput' && d.deviceId !== 'communications');
  const devSel = (id, list, cur, std) => `<select class="inp" id="${id}"><option value="">${std}</option>${list.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cur ? ' selected' : ''}>${esc(d.label || (id === 'tCam' ? 'Kamera ' : 'Mikrofon ') + (i + 1))}</option>`).join('')}</select>`;
  openSheet('Aufnahme', `
   <div class="field"><label for="tCam">Kamera</label>${devSel('tCam', cams, opts.camId, 'Standard (Frontkamera)')}</div>
   <div class="field"><label for="tMic">Mikrofon</label>${devSel('tMic', mics, opts.micId, 'Standard')}</div>
   <div class="field"><label for="tE">Blickrichtung (wo dein Partner stünde)</label><select class="inp" id="tE">${[['links', 'Links neben der Kamera'], ['rechts', 'Rechts neben der Kamera'], ['aus', 'Keine Markierung']].map(([k, l]) => `<option value="${k}"${opts.eyeline === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="set card"><div class="li-main"><b>Bildrahmen einblenden</b><small>Hilfslinien für Augenhöhe und Kopf, nur vor der Aufnahme</small></div><label class="switch"><input type="checkbox" id="tG"${opts.guide ? ' checked' : ''} aria-label="Bildrahmen einblenden"><i></i></label></div>
   <div class="field"><label for="tL">Wann geht es nach deinem Satz weiter?</label>
    <select class="inp" id="tL">${[['vad', 'Pause erkennen'], ['tap', 'Ich tippe oder drücke →'], ['auto', 'Nach Zeit']].map(([k, l]) => `<option value="${k}"${opts.listen === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="field"><label for="tP">Pause bis zum Einsatz: <b id="tPV">${(opts.pause / 1000).toFixed(1)} s</b></label><input id="tP" type="range" min="500" max="2500" step="100" value="${opts.pause}"></div>
   <div class="field"><label for="tR">Sprechtempo Partner: <b id="tRV">${opts.rate.toFixed(2)}×</b></label><input id="tR" type="range" min="0.7" max="1.4" step="0.05" value="${opts.rate}"></div>
   <div class="set card"><div class="li-main"><b>Mit Vorstellung beginnen</b><small>Name, Größe, Wohnort als Slate</small></div><label class="switch"><input type="checkbox" id="tS"${opts.slate ? ' checked' : ''} aria-label="Mit Vorstellung beginnen"><i></i></label></div>
   <button class="btn fill wide" id="tSave" type="button">Übernehmen</button>`, body => {
    body.addEventListener('input', () => {
      $('#tPV', body).textContent = (+$('#tP', body).value / 1000).toFixed(1) + ' s';
      $('#tRV', body).textContent = (+$('#tR', body).value).toFixed(2) + '×';
    });
    $('#tSave', body).onclick = () => {
      const devChanged = $('#tCam', body).value !== (opts.camId || '') || $('#tMic', body).value !== (opts.micId || '');
      opts.camId = $('#tCam', body).value; opts.micId = $('#tMic', body).value;
      opts.listen = $('#tL', body).value; opts.pause = +$('#tP', body).value; opts.rate = +$('#tR', body).value; opts.slate = $('#tS', body).checked;
      opts.eyeline = $('#tE', body).value; opts.guide = $('#tG', body).checked;
      ls.set('tape.opts', opts); closeSheet(); toast('Gespeichert'); relayout?.();
      if (devChanged) restartCam?.();
    };
  });
}

export function reviewTake(take, script) {
  const url = URL.createObjectURL(take.blob);
  const lv = LEVELS.find(l => l.k === take.level);
  openSheet(`Take ${take.n}`, `
   <video src="${url}" controls playsinline style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9"></video>
   <p class="muted small">${take.dur} Sekunden${lv ? ` · Partner im Video: ${esc(lv.l.toLowerCase())}` : ''}${take.trimOf ? ` · zugeschnitten aus Take ${take.trimOf}` : ''} · nur auf diesem Handy</p>
   <div class="grid2">
    <button class="btn out" id="tkSave" type="button">${ICON.dl} Speichern</button>
    <button class="btn fill" id="tkShare" type="button">${ICON.share} Teilen</button>
   </div>
   <div class="grid2">
    <button class="btn tonal" id="tkTrim" type="button">Zuschneiden</button>
    <button class="btn tonal" id="tkFav" type="button">${take.fav ? ICON.starOn + ' Favorit' : ICON.star + ' Favorit'}</button>
   </div>`, body => {
    $('#tkSave', body).onclick = () => downloadTake(take, script);
    $('#tkShare', body).onclick = () => shareTake(take, script);
    $('#tkTrim', body).onclick = () => trimSheet(take, script, () => { if (location.hash.startsWith('#skript-')) window.dispatchEvent(new HashChangeEvent('hashchange')); });
    $('#tkFav', body).onclick = async () => { const on = await toggleFav(take); $('#tkFav', body).innerHTML = (on ? ICON.starOn : ICON.star) + ' Favorit'; toast(on ? 'Als Favorit markiert' : 'Favorit entfernt'); };
  }, { onClose: () => URL.revokeObjectURL(url) });
}