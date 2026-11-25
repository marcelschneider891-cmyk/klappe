// Self-Tape: Kamera an, Partner liest aus dem Off, Take landet auf dem Handy.
import { Runner, initials } from './runner.js';
import { makeVAD, tts } from './speech.js';
import { $, esc, ICON, openSheet, closeSheet, toast } from './ui.js';
import { db, uid, ls } from './db.js';
import { settingsSheet } from './rehearse.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

export async function tapeView(view, script, { exit, profile }) {
  const opts = Object.assign({ listen: 'vad', hide: 'zeigen', rate: 1, pause: 1000, cueGap: 150, slate: false, facing: 'user' }, ls.get('tape.opts', {}));
  const me = script.me || [];
  let stream = null, vad = null, rec = null, chunks = [], t0 = 0, timer = null, runner = null, recording = false, wake = null;

  view.innerHTML = `
  <div class="tp">
   <video id="cam" playsinline autoplay muted></video>
   <div class="tp-tap" id="tpTap"></div>
   <div class="tp-prompt" id="tpPrompt"><div class="w">Bereit</div><div class="x">Tippe auf Aufnahme. Nach dem Countdown liest dein Partner aus dem Off.</div></div>
   <div class="tp-top">
    <button class="ic" id="tpExit" type="button" aria-label="Schließen">${ICON.x}</button>
    <div class="row" style="gap:6px"><button class="ic" id="tpEye" type="button" aria-label="Textanzeige wechseln">${ICON.eye}</button><button class="ic" id="tpGear" type="button" aria-label="Einstellungen">${ICON.gear}</button></div>
   </div>
   <div class="tp-time" id="tpTime" hidden>0:00</div>
   <div class="rotate" id="tpRot">Tipp: Handy quer halten, wie beim echten Self-Tape</div>
   <div class="count" id="tpCount" hidden></div>
   <div class="tp-ctl">
    <button class="ic" id="tpFlip" type="button" aria-label="Kamera wechseln">${ICON.flip}</button>
    <button class="recbtn" id="tpRec" type="button" aria-label="Aufnahme starten"><i></i></button>
    <span style="width:44px"></span>
   </div>
  </div>`;

  const video = $('#cam', view), prompt = $('#tpPrompt', view), recBtn = $('#tpRec', view), time = $('#tpTime', view);

  async function startCam() {
    stream?.getTracks().forEach(t => t.stop());
    vad?.close();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: opts.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
      });
    } catch (e) {
      prompt.innerHTML = '<div class="w">Kamera</div><div class="x">Kein Zugriff auf Kamera oder Mikro. Erlaube beides in den Chrome-Einstellungen für diese Seite.</div>';
      recBtn.disabled = true;
      return;
    }
    video.srcObject = stream;
    video.classList.toggle('mirror', opts.facing === 'user');
    vad = makeVAD(stream);
  }
  await startCam();

  const show = (who, text, mine) => {
    const hidden = mine && opts.hide !== 'zeigen';
    const t = mine && opts.hide === 'anfang' ? initials(text) : text;
    prompt.innerHTML = `<div class="w">${esc(who)}</div><div class="x${mine ? '' : ' dim'}${mine && opts.hide === 'aus' ? ' hide' : ''}">${esc(t)}</div>`;
    prompt.hidden = false;
    if (hidden && opts.hide === 'aus') prompt.querySelector('.x').onclick = e => e.target.classList.remove('hide');
  };

  const hooks = {
    onIndex(i) {
      const b = script.blocks[i];
      if (!b) return;
      if (b.type === 'act') { show('Regie', b.text, false); return; }
      show(b.who, b.text, me.includes(b.who));
    },
    onState(s) { if (s === 'end' && recording) setTimeout(() => recording && stopRec(), 1400); },
    onFeed(text) { const x = prompt.querySelector('.x'); if (x) { x.classList.remove('hide'); x.textContent = text; } },
    onHeard() {}, onFinish() {}
  };

  async function countdown() {
    const c = $('#tpCount', view);
    c.hidden = false;
    for (const n of [3, 2, 1]) { c.textContent = n; await sleep(800); }
    c.hidden = true;
  }

  async function startRec() {
    if (!stream) return;
    if (!window.MediaRecorder) { toast('Dein Browser kann hier nicht aufnehmen.'); return; }
    try { wake = await navigator.wakeLock?.request('screen'); } catch {}
    tts.speak(' ');  // Sprachausgabe mit dem Tipp freischalten
    recBtn.classList.add('on'); recBtn.setAttribute('aria-label', 'Aufnahme stoppen');
    recording = true;
    await countdown();
    if (!recording) return;
    const mime = pickMime();
    chunks = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = saveTake;
    rec.start(1000);
    t0 = Date.now();
    time.hidden = false;
    timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    $('#tpRot', view).hidden = true;
    runner = new Runner({ script, me, opts: { ...opts, readActions: false }, vad, hooks });
    if (opts.slate) {
      const p = profile || {};
      show('Vorstellung', `Name: ${p.name || ''} · ${p.groesse || ''} · ${p.wohnort || ''}. Dann kurz Pause, die Szene startet.`, true);
      await new Promise(res => vad ? vad.arm(opts.pause, res) : setTimeout(res, 6000));
      if (!recording) return;
    }
    await sleep(500);
    runner.play(firstLine());
  }

  function firstLine() {
    const i = script.blocks.findIndex(b => b.type === 'line');
    return i < 0 ? 0 : i;
  }

  function stopRec() {
    recording = false;
    runner?.destroy(); runner = null;
    clearInterval(timer);
    time.hidden = true;
    recBtn.classList.remove('on'); recBtn.setAttribute('aria-label', 'Aufnahme starten');
    $('#tpCount', view).hidden = true;
    if (rec && rec.state !== 'inactive') rec.stop();
    try { wake?.release(); } catch {}
  }

  async function saveTake() {
    if (!chunks.length) return;
    const type = rec.mimeType || chunks[0].type || 'video/webm';
    const blob = new Blob(chunks, { type });
    const dur = Math.round((Date.now() - t0) / 1000);
    const n = (await db.all('takes')).filter(t => t.scriptId === script.id).length + 1;
    const take = { id: uid(), scriptId: script.id, n, created: new Date().toISOString(), type, dur, blob };
    try { await db.put('takes', take); } catch { toast('Speicher voll. Take bitte gleich aufs Handy speichern.'); }
    reviewTake(take, script);
  }

  recBtn.onclick = () => recording ? stopRec() : startRec();
  $('#tpTap', view).onclick = () => { if (recording && runner) runner.next(); };
  $('#tpFlip', view).onclick = async () => { if (recording) return; opts.facing = opts.facing === 'user' ? 'environment' : 'user'; ls.set('tape.opts', opts); await startCam(); };
  $('#tpEye', view).onclick = () => {
    const order = ['zeigen', 'anfang', 'aus'];
    opts.hide = order[(order.indexOf(opts.hide) + 1) % 3];
    ls.set('tape.opts', opts);
    toast({ zeigen: 'Text zeigen', anfang: 'Nur Anfangsbuchstaben', aus: 'Meinen Text verstecken' }[opts.hide]);
  };
  $('#tpGear', view).onclick = () => {
    settingsSheet(opts, () => ls.set('tape.opts', opts), { tape: true });
    const body = $('#sheetBody');
    const lab = document.createElement('label');
    lab.className = 'row';
    lab.innerHTML = `<input type="checkbox" id="sSlate"${opts.slate ? ' checked' : ''}> Mit Vorstellung beginnen (Name, Größe, Wohnort)`;
    body.insertBefore(lab, $('#sSave', body));
    $('#sSlate', body).onchange = e => { opts.slate = e.target.checked; ls.set('tape.opts', opts); };
  };
  const leave = () => { stopRec(); vad?.close(); stream?.getTracks().forEach(t => t.stop()); };
  $('#tpExit', view).onclick = () => { leave(); exit(); };
  return leave;
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
  toast('Wird in „Downloads“ gespeichert.');
}

export async function shareTake(take, title) {
  const f = takeFile(take, title);
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: f.name }); } catch {}
  } else downloadTake(take, title);
}

export function reviewTake(take, script) {
  const url = URL.createObjectURL(take.blob);
  openSheet(`Take ${take.n}`, `
   <video src="${url}" controls playsinline style="width:100%;border-radius:10px;background:#000;aspect-ratio:16/9"></video>
   <p class="leise small">${take.dur} Sekunden · bleibt nur auf deinem Handy</p>
   <div class="grid2">
    <button class="btn" id="tkSave" type="button">${ICON.dl} Speichern</button>
    <button class="btn gold" id="tkShare" type="button">${ICON.share} Teilen</button>
   </div>`, body => {
    $('#tkSave', body).onclick = () => downloadTake(take, script.title);
    $('#tkShare', body).onclick = () => shareTake(take, script.title);
  });
  const obs = new MutationObserver(() => { if ($('#sheet').hidden) { URL.revokeObjectURL(url); obs.disconnect(); } });
  obs.observe($('#sheet'), { attributes: true });
}
