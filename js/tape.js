// Self-Tape: Kamera an, Partner liest. Im Video ist die Partnerstimme laut, leise oder gar nicht zu hören.
import { Runner, initials } from './runner.js';
import { makeVAD, tts } from './speech.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, buzz } from './ui.js';
import { db, uid, ls } from './db.js';
import { Reader, scriptVoice, SOURCES } from './voices.js';
import { openVoiceSheet, voiceLabel } from './voicesheet.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const LEVELS = [
  { k: 'laut', l: 'Hörbar', v: 1, d: 'Casting hört Partner und dich' },
  { k: 'leise', l: 'Leise', v: 0.3, d: 'Partner deutlich leiser als du' },
  { k: 'stumm', l: 'Stumm', v: 0, d: 'Im Video bist nur du zu hören' }
];

function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

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
  const opts = Object.assign({ listen: 'vad', hide: 'zeigen', rate: 1, pause: 1000, cueGap: 150, slate: false, facing: 'user', level: 'laut' }, ls.get('tape.opts', {}));
  const me = script.me || [];
  let stream = null, vad = null, mixer = null, reader = null, rec = null, chunks = [], t0 = 0, timer = null, runner = null, recording = false, wake = null;
  const level = () => LEVELS.find(l => l.k === opts.level) || LEVELS[0];

  view.innerHTML = `
  <div class="tp">
   <video id="cam" playsinline autoplay muted></video>
   <div class="tp-tap" id="tpTap"></div>
   <div class="tp-prompt" id="tpPrompt"><div class="w">Bereit</div><div class="x">Tippe auf Aufnahme. Nach dem Countdown startet die Szene.</div></div>
   <div class="tp-top">
    <button class="ic" id="tpExit" type="button" aria-label="Schließen">${ICON.x}</button>
    <div class="row" style="gap:6px"><button class="ic" id="tpEye" type="button" aria-label="Textanzeige wechseln">${ICON.eye}</button><button class="ic" id="tpGear" type="button" aria-label="Einstellungen">${ICON.tune}</button></div>
   </div>
   <div class="tp-time" id="tpTime" hidden>0:00</div>
   <div class="rotate" id="tpRot">Handy quer halten, wie beim echten Self-Tape</div>
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

  async function startCam() {
    stream?.getTracks().forEach(t => t.stop());
    vad?.close(); mixer?.close(); reader = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: opts.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
      });
    } catch {
      prompt.innerHTML = '<div class="w">Kamera</div><div class="x">Kein Zugriff auf Kamera oder Mikro. Erlaube beides in den Chrome-Einstellungen für diese Seite.</div>';
      recBtn.disabled = true;
      return;
    }
    video.srcObject = stream;
    video.classList.toggle('mirror', opts.facing === 'user');
    vad = makeVAD(stream);
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
    $('#tpVoice', view).hidden = true; $('#tpFlip', view).hidden = true;
    await countdown();
    if (!recording) return;
    const mime = pickMime();
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
    try { await db.put('takes', take); } catch { toast('Speicher voll. Take bitte gleich aufs Handy speichern.'); }
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
  $('#tpFlip', view).onclick = async () => { if (recording) return; opts.facing = opts.facing === 'user' ? 'environment' : 'user'; ls.set('tape.opts', opts); await startCam(); };
  $('#tpEye', view).onclick = () => {
    const order = ['zeigen', 'anfang', 'aus'];
    opts.hide = order[(order.indexOf(opts.hide) + 1) % 3];
    ls.set('tape.opts', opts);
    toast({ zeigen: 'Dein Text wird angezeigt', anfang: 'Nur Anfangsbuchstaben', aus: 'Dein Text ist versteckt' }[opts.hide]);
  };
  $('#tpGear', view).onclick = () => tapeSettings(opts);
  const leave = () => { stopRec(); vad?.close(); mixer?.close(); stream?.getTracks().forEach(t => t.stop()); tts.cancel(); };
  $('#tpExit', view).onclick = () => { leave(); exit(); };
  return leave;
}

function tapeSettings(opts) {
  openSheet('Aufnahme', `
   <div class="field"><label for="tL">Wann geht es nach deinem Satz weiter?</label>
    <select class="inp" id="tL">${[['vad', 'Pause erkennen'], ['tap', 'Ich tippe auf den Bildschirm'], ['auto', 'Nach Zeit']].map(([k, l]) => `<option value="${k}"${opts.listen === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="field"><label for="tP">Pause bis zum Einsatz: <b id="tPV">${(opts.pause / 1000).toFixed(1)} s</b></label><input id="tP" type="range" min="500" max="2500" step="100" value="${opts.pause}"></div>
   <div class="field"><label for="tR">Sprechtempo Partner: <b id="tRV">${opts.rate.toFixed(2)}×</b></label><input id="tR" type="range" min="0.7" max="1.4" step="0.05" value="${opts.rate}"></div>
   <div class="set card"><div class="li-main"><b>Mit Vorstellung beginnen</b><small>Name, Größe, Wohnort als Slate</small></div><label class="switch"><input type="checkbox" id="tS"${opts.slate ? ' checked' : ''} aria-label="Mit Vorstellung beginnen"><i></i></label></div>
   <button class="btn fill wide" id="tSave" type="button">Übernehmen</button>`, body => {
    body.addEventListener('input', () => {
      $('#tPV', body).textContent = (+$('#tP', body).value / 1000).toFixed(1) + ' s';
      $('#tRV', body).textContent = (+$('#tR', body).value).toFixed(2) + '×';
    });
    $('#tSave', body).onclick = () => {
      opts.listen = $('#tL', body).value; opts.pause = +$('#tP', body).value; opts.rate = +$('#tR', body).value; opts.slate = $('#tS', body).checked;
      ls.set('tape.opts', opts); closeSheet(); toast('Gespeichert');
    };
  });
}

export function takeFile(take, title) {
  const ext = take.type.includes('mp4') ? 'mp4' : 'webm';
  const name = `${(title || 'SelfTape').replace(/[^\wäöüÄÖÜß\- ]/g, '').trim().replace(/\s+/g, '_')}_Take${take.n}.${ext}`;
  return new File([take.blob], name, { type: take.type.split(';')[0] });
}
export function downloadTake(take, title) {
  const f = takeFile(take, title);
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url; a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Wird unter „Downloads“ gespeichert');
}
export async function shareTake(take, title) {
  const f = takeFile(take, title);
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: f.name }); } catch {} }
  else downloadTake(take, title);
}
export function reviewTake(take, script) {
  const url = URL.createObjectURL(take.blob);
  const lv = LEVELS.find(l => l.k === take.level);
  openSheet(`Take ${take.n}`, `
   <video src="${url}" controls playsinline style="width:100%;border-radius:12px;background:#000;aspect-ratio:16/9"></video>
   <p class="muted small">${take.dur} Sekunden${lv ? ` · Partner im Video: ${esc(lv.l.toLowerCase())}` : ''} · nur auf diesem Handy</p>
   <div class="grid2">
    <button class="btn out" id="tkSave" type="button">${ICON.dl} Speichern</button>
    <button class="btn fill" id="tkShare" type="button">${ICON.share} Teilen</button>
   </div>`, body => {
    $('#tkSave', body).onclick = () => downloadTake(take, script.title);
    $('#tkShare', body).onclick = () => shareTake(take, script.title);
  }, { onClose: () => URL.revokeObjectURL(url) });
}
