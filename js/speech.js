// Stimme (Vorlesen), Spracherkennung und Pausen-Erkennung über das Mikro.
import { speakable } from './parser.js';

// ---------- Vorlesen ----------
const synth = window.speechSynthesis || null;
let voicesCache = [];
function loadVoices() { if (synth) voicesCache = synth.getVoices(); return voicesCache; }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }

export const tts = {
  ok: !!synth,
  germanVoices() {
    const v = (voicesCache.length ? voicesCache : loadVoices()).filter(x => /^de([-_]|$)/i.test(x.lang));
    // Deutschland zuerst, dann Österreich/Schweiz
    return v.sort((a, b) => (b.lang === 'de-DE') - (a.lang === 'de-DE') || (b.localService - a.localService));
  },
  // Jede Figur bekommt eine eigene Stimme bzw. Tonlage
  castFor(characters, me, prefs = {}) {
    const vs = this.germanVoices();
    const pitches = [1, 0.82, 1.16, 0.92, 1.08, 0.75, 1.24];
    const cast = {};
    characters.filter(c => !me.includes(c)).forEach((c, i) => {
      const chosen = prefs[c];
      const voice = vs.find(v => v.voiceURI === chosen?.voiceURI) || vs[i % Math.max(vs.length, 1)] || null;
      cast[c] = { voice, pitch: chosen?.pitch ?? pitches[i % pitches.length] };
    });
    return cast;
  },
  speak(text, { voice = null, pitch = 1, rate = 1 } = {}) {
    return new Promise(resolve => {
      if (!synth) return setTimeout(resolve, Math.min(4000, text.length * 60));
      const clean = speakable(text);
      if (!clean) return resolve();
      // In Sätze teilen: Chrome bricht lange Äußerungen sonst manchmal ab
      const parts = clean.match(/[^.!?…]+[.!?…]*["“”»«]?\s*/g) || [clean];
      if (this._cancel) this._cancel();
      let i = 0, done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      this._cancel = finish;
      const next = () => {
        if (done) return;
        if (i >= parts.length) return finish();
        const u = new SpeechSynthesisUtterance(parts[i++].trim());
        u.lang = voice?.lang || 'de-DE';
        if (voice) u.voice = voice;
        u.pitch = pitch; u.rate = rate;
        u.onend = next; u.onerror = next;
        synth.speak(u);
      };
      synth.cancel();
      setTimeout(next, 30);
    });
  },
  cancel() { if (synth) synth.cancel(); if (this._cancel) this._cancel(); }
};

// ---------- Spracherkennung ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export const srAvailable = !!SR;

export function makeRecognizer({ onText, onFatal }) {
  if (!SR) return null;
  let rec = null, want = false, committed = '', session = '';
  const boot = () => {
    rec = new SR();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    session = '';
    rec.onresult = e => {
      let fin = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript + ' '; else interim += r[0].transcript + ' ';
      }
      session = fin;
      onText((committed + ' ' + fin + ' ' + interim).trim());
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want = false; onFatal?.(e.error); }
    };
    rec.onend = () => {
      committed = (committed + ' ' + session).trim();
      if (want) setTimeout(() => { if (want) { try { boot(); } catch {} } }, 120);
    };
    try { rec.start(); } catch {}
  };
  return {
    start() { want = true; committed = ''; session = ''; if (rec) { try { rec.abort(); } catch {} } boot(); },
    reset() { committed = ''; session = ''; },
    stop() { want = false; if (rec) { try { rec.abort(); } catch {} } }
  };
}

// ---------- Pausen-Erkennung (wann bist du mit deinem Satz fertig?) ----------
export function makeVAD(stream, { onLevel } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let floor = 0.006, armed = null;
  const iv = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    const thr = Math.max(floor * 2.6, 0.012);
    onLevel?.(Math.min(1, rms / (thr * 2.5)), rms, !!armed?.talking);
    if (!armed) { floor = Math.max(0.003, floor * 0.93 + rms * 0.07); return; }
    if (rms > thr) { armed.speech += 50; armed.silence = 0; if (armed.speech >= 250) armed.talking = true; }
    else if (armed.talking) {
      armed.silence += 50;
      if (armed.silence >= armed.pause) { const f = armed.done; armed = null; f(); }
    } else { floor = Math.max(0.003, floor * 0.97 + rms * 0.03); }
  }, 50);
  return {
    arm(pauseMs, done) { if (ctx.state === 'suspended') ctx.resume(); armed = { pause: pauseMs, done, speech: 0, silence: 0, talking: false }; },
    disarm() { armed = null; },
    get talking() { return !!armed?.talking; },
    close() { clearInterval(iv); armed = null; try { src.disconnect(); ctx.close(); } catch {} }
  };
}

export async function micStream() {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
}
