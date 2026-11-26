// Partnerstimmen: Handy (kostenlos), ElevenLabs (eigener Schlüssel), eigene Aufnahme, oder aus.
import { tts } from './speech.js';
import { speakable, words } from './parser.js';
import { db, ls } from './db.js';

export const SOURCES = [
  { k: 'device', l: 'Handy', d: 'Kostenlose Stimme deines Handys' },
  { k: 'eleven', l: 'ElevenLabs', d: 'Natürliche KI-Stimme, kostet Credits' },
  { k: 'record', l: 'Aufnahme', d: 'Ein Freund liest die Sätze ein' },
  { k: 'none', l: 'Aus', d: 'Nur Text, keine Stimme' }
];
export const PITCH = [{ k: 0.8, l: 'Tief' }, { k: 1, l: 'Normal' }, { k: 1.2, l: 'Hoch' }];

export function defaults() {
  return Object.assign({ source: 'device', elevenVoice: null }, ls.get('voice.defaults', {}));
}
export function setDefaults(v) { ls.set('voice.defaults', { ...defaults(), ...v }); }
export function scriptVoice(s) {
  const v = s.voice || {};
  return { source: v.source || defaults().source, chars: v.chars || {} };
}
export const partnerLines = (s, me = s.me || []) => s.blocks.filter(b => b.type === 'line' && !me.includes(b.who));

function hash(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const elKey = (voiceId, text) => `el:${voiceId}:${hash(speakable(text))}`;
export const recKey = (scriptId, blockId) => `rec:${scriptId}:${blockId}`;
export async function getAudio(k) { return (await db.get('audio', k))?.blob || null; }
export async function putAudio(k, blob) { return db.put('audio', { id: k, blob }); }
export async function delAudio(k) { return db.del('audio', k); }

// ---------- ElevenLabs ----------
const API = 'https://api.elevenlabs.io';
let voiceCache = null;
// Beim Kopieren rutschen oft Leerzeichen, Zeilenumbrüche, unsichtbare Zeichen oder Anführungszeichen mit rein
export const cleanKey = k => {
  const s = String(k || '').replace(/[\s​-‍⁠﻿"'„“”‚‘’`]/g, '');
  return (s.match(/sk_[A-Za-z0-9]+/) || [s])[0];
};
// Verständliche Fehlermeldung aus der Antwort von ElevenLabs
async function failMsg(r, perm) {
  let d = {};
  try { const j = await r.json(); d = j?.detail || j || {}; } catch {}
  if (typeof d === 'string') d = { message: d };
  const st = d.status || '', msg = d.message || '';
  if (st === 'invalid_api_key_length') {
    const m = msg.match(/exactly (\d+) characters, got (\d+)/);
    return `Der Schlüssel ist unvollständig${m ? ` (${m[2]} statt ${m[1]} Zeichen)` : ''}. Kopier ihn nochmal komplett aus ElevenLabs oder leg dort einen neuen an.`;
  }
  if (st === 'missing_permissions' || /permission/i.test(msg)) return `Dem Schlüssel fehlt die Berechtigung „${perm}“. In ElevenLabs unter Entwickler › API-Schlüssel beim Schlüssel einschalten.`;
  if (st === 'detected_unusual_activity') return 'ElevenLabs hat das kostenlose Konto vorübergehend gesperrt (ungewöhnliche Aktivität, z. B. VPN). Ohne VPN nochmal versuchen.';
  if (r.status === 402 || r.status === 429 || st === 'quota_exceeded' || /quota|credits/i.test(msg)) return 'ElevenLabs-Guthaben aufgebraucht oder zu viele Anfragen. Dein Guthaben siehst du bei ElevenLabs unter „Abonnement“.';
  if (r.status === 401 || st === 'invalid_api_key' || d.type === 'authentication_error') return 'Der Schlüssel stimmt nicht oder ist veraltet. Kopier ihn nochmal aus ElevenLabs (Entwickler › API-Schlüssel).';
  if (r.status >= 500) return `ElevenLabs hat gerade eine Störung (${r.status}). Versuch es später nochmal.`;
  return `ElevenLabs-Fehler ${r.status}${msg ? ': ' + msg : ''}`;
}
async function call(url, opts, perm) {
  let r;
  try { r = await fetch(url, opts); }
  catch { throw new Error(navigator.onLine ? 'ElevenLabs nicht erreichbar. Blockiert ein Werbeblocker oder Firmen-WLAN api.elevenlabs.io?' : 'Du bist offline.'); }
  if (!r.ok) throw new Error(await failMsg(r, perm));
  return r;
}
const listVoices = async key => {
  const j = await (await call(API + '/v1/voices', { headers: { 'xi-api-key': key } }, 'Stimmen: Lesen')).json();
  return (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, preview: v.preview_url, labels: v.labels || {} }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const eleven = {
  key: () => cleanKey(ls.get('eleven.key', '')),
  setKey(k) { ls.set('eleven.key', cleanKey(k)); voiceCache = null; },
  // Erst prüfen, dann speichern: ein kaputter Schlüssel darf den funktionierenden nicht ersetzen
  async checkAndSave(k) {
    const key = cleanKey(k);
    if (!key) throw new Error('Füge zuerst den Schlüssel ein.');
    const list = await listVoices(key);
    this.setKey(key);
    voiceCache = list;
    return list;
  },
  async voices() {
    if (voiceCache) return voiceCache;
    voiceCache = await listVoices(this.key());
    return voiceCache;
  },
  async quota() {
    try {
      const r = await fetch(API + '/v1/user/subscription', { headers: { 'xi-api-key': this.key() } });
      if (!r.ok) return null;
      const j = await r.json();
      return { used: j.character_count, limit: j.character_limit };
    } catch { return null; }
  },
  async tts(text, voiceId) {
    const r = await call(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': this.key(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: speakable(text), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 } })
    }, 'Text-zu-Sprache: Zugriff');
    return r.blob();
  }
};

export function elevenVoiceFor(s, who) {
  return scriptVoice(s).chars[who]?.eleven || defaults().elevenVoice || null;
}

// Fehlende ElevenLabs-Sätze erzeugen (wird gespeichert, kostet nur einmal)
export async function prepareEleven(s, onProgress, signal) {
  const lines = partnerLines(s);
  let done = 0, made = 0;
  for (const b of lines) {
    if (signal?.aborted) break;
    const v = elevenVoiceFor(s, b.who);
    if (!v) throw new Error(`Für ${b.who} ist keine ElevenLabs-Stimme gewählt.`);
    const k = elKey(v.id, b.text);
    if (!(await getAudio(k))) { await putAudio(k, await eleven.tts(b.text, v.id)); made++; }
    onProgress?.(++done, lines.length);
  }
  return made;
}
export async function elevenStatus(s) {
  const lines = partnerLines(s);
  let ready = 0, chars = 0;
  for (const b of lines) {
    const v = elevenVoiceFor(s, b.who);
    if (v && await getAudio(elKey(v.id, b.text))) ready++; else chars += speakable(b.text).length;
  }
  return { ready, total: lines.length, chars };
}
export async function recordStatus(s) {
  const lines = partnerLines(s);
  let ready = 0;
  for (const b of lines) if (await getAudio(recKey(s.id, b.id))) ready++;
  return { ready, total: lines.length };
}

// ---------- Vorleser für Proben und Self-Tape ----------
export class Reader {
  constructor(s, { mixer = null } = {}) {
    this.s = s;
    this.v = scriptVoice(s);
    this.source = this.v.source;
    this.mixer = mixer;
    this.cast = tts.castFor(s.characters, s.me || [], Object.fromEntries(Object.entries(this.v.chars).map(([c, x]) => [c, x.device || {}])));
    this.audio = null;
    this._stop = null;
  }
  get digital() { return this.source === 'eleven' || this.source === 'record'; }

  async say(b, rate = 1) {
    if (this.source === 'none') return this.wait(b, rate);
    if (this.source === 'device') return this.device(b, rate);
    let blob = null;
    try {
      if (this.source === 'eleven') {
        const v = elevenVoiceFor(this.s, b.who);
        if (v) {
          const k = elKey(v.id, b.text);
          blob = await getAudio(k);
          if (!blob && eleven.key() && navigator.onLine) { blob = await eleven.tts(b.text, v.id); await putAudio(k, blob); }
        }
      } else blob = await getAudio(recKey(this.s.id, b.id));
    } catch { blob = null; }
    if (!blob) return this.device(b, rate); // Rückfall auf Handy-Stimme
    return this.play(blob, rate);
  }
  device(b, rate) {
    const c = this.cast[b.who] || {};
    return tts.speak(b.text, { voice: c.voice, pitch: c.pitch, rate });
  }
  wait(b, rate) {
    const ms = 700 + words(b.text).length * 380 / rate;
    return new Promise(res => { const t = setTimeout(res, ms); this._stop = () => { clearTimeout(t); res(); }; });
  }
  play(blob, rate) {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      if (this.mixer) this.mixer.attach(this.audio);
    }
    const a = this.audio;
    return new Promise(res => {
      const url = URL.createObjectURL(blob);
      const end = () => { a.onended = a.onerror = null; URL.revokeObjectURL(url); this._stop = null; res(); };
      this._stop = () => { a.pause(); end(); };
      a.onended = end; a.onerror = end;
      a.src = url;
      a.playbackRate = rate;
      a.play().catch(end);
    });
  }
  cancel() { tts.cancel(); if (this._stop) this._stop(); }
}
