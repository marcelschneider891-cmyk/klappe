// Spielt eine Szene ab: liest die anderen Rollen, wartet auf dich, hilft bei "Line!".
import { tts, makeRecognizer, srAvailable } from './speech.js';
import { words } from './parser.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function near(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  // Levenshtein <= 1
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}

const LINE_CALL = /\b(line|lein|lain|lajn|lyne|nein line)\b/g;

export class Runner {
  constructor({ script, me, opts, mic = null, vad = null, hooks, reader, quietFeed = false }) {
    this.blocks = script.blocks;
    this.me = me;
    this.opts = opts; // {listen:'sr'|'vad'|'tap'|'auto', rate, pause, readActions, cueGap}
    this.mic = mic;
    this.vad = vad;
    this.h = hooks; // onIndex(i), onState(s, extra), onFeed(text), onPartner(on), onFinish
    this.reader = reader;
    this.quietFeed = quietFeed; // beim Self-Tape nur anzeigen, nicht vorsagen
    this.idx = 0;
    this.token = 0;
    this.playing = false;
    this.rec = null;
    this.feedPos = 0;
    this.heardPos = 0;
    this._resolveMe = null;
  }

  isMine(b) { return b.type === 'line' && this.me.includes(b.who); }

  async play(from = this.idx) {
    const tok = ++this.token;
    this.playing = true;
    this.idx = from;
    this.h.onState('play');
    while (this.idx < this.blocks.length) {
      if (tok !== this.token) return;
      const b = this.blocks[this.idx];
      this.h.onIndex(this.idx);
      if (b.type === 'act') {
        if (this.opts.readActions) { this.h.onState('reader', 'Regie'); await tts.speak(b.text, { rate: this.opts.rate * 1.05, pitch: 1 }); }
      } else if (!this.isMine(b)) {
        this.h.onState('reader', b.who);
        this.h.onPartner?.(true);
        await this.reader.say(b, this.opts.rate);
        this.h.onPartner?.(false);
        if (tok !== this.token) return;
        await sleep(this.opts.cueGap ?? 150);
      } else {
        this.h.onState('you', b.who);
        await this.waitForMe(b, tok);
      }
      if (tok !== this.token) return;
      this.idx++;
    }
    this.playing = false;
    this.h.onState('end');
    this.h.onFinish?.();
  }

  waitForMe(b, tok) {
    this.feedPos = 0;
    this.heardPos = 0;
    const lw = words(b.text);
    return new Promise(resolve => {
      let settled = false, quiet = null, lineCalls = 0;
      const done = () => {
        if (settled) return; settled = true;
        clearTimeout(quiet); this._resolveMe = null;
        if (this.rec) this.rec.stop();
        this.vad?.disarm();
        resolve();
      };
      this._resolveMe = done;
      const mode = this.opts.listen;
      if (mode === 'sr' && srAvailable) {
        if (!this.rec) this.rec = makeRecognizer({ onText: t => this._onHeard?.(t), onFatal: () => this.h.onState('nomic') });
        this._onHeard = text => {
          if (settled || tok !== this.token) return;
          const calls = (text.toLowerCase().match(LINE_CALL) || []).length;
          if (calls > lineCalls) { lineCalls = calls; this.feed(); return; }
          const hw = words(text.replace(LINE_CALL, ' '));
          let pos = 0;
          for (const w of hw) {
            for (let k = pos; k < Math.min(lw.length, pos + 4); k++) if (near(w, lw[k])) { pos = k + 1; break; }
          }
          if (pos > this.heardPos) { this.heardPos = pos; this.feedPos = Math.max(this.feedPos, pos); this.h.onHeard?.(pos, lw.length); }
          clearTimeout(quiet);
          if (this.heardPos >= lw.length - 1) quiet = setTimeout(done, 450);
          else if (this.heardPos >= lw.length * 0.6) quiet = setTimeout(done, 2200);
        };
        this.rec.start();
      } else if (mode === 'vad' && this.vad) {
        this.vad.arm(this.opts.pause, done);
      } else if (mode === 'auto') {
        const ms = 900 + lw.length * 420 / this.opts.rate;
        quiet = setTimeout(done, ms);
      }
      // 'tap': nur über "Weiter"
    });
  }

  // "Line!": die nächsten Wörter einsagen
  async feed() {
    const b = this.blocks[this.idx];
    if (!b || !this.isMine(b)) return;
    const lw = speakWords(b.text);
    const from = Math.max(this.feedPos, this.heardPos);
    if (from >= lw.length) return;
    const chunk = lw.slice(from, from + 4).join(' ');
    this.feedPos = from + 4;
    this.h.onFeed(chunk + (this.feedPos < lw.length ? ' …' : ''));
    if (this.quietFeed) return;
    const wasArmed = this.opts.listen === 'vad' && this.vad;
    if (wasArmed) this.vad.disarm();
    if (this.rec) this.rec.stop();
    await tts.speak(chunk, { rate: this.opts.rate * 0.95, pitch: 1 });
    if (!this._resolveMe) return;
    if (wasArmed) this.vad.arm(this.opts.pause, this._resolveMe);
    if (this.rec && this.opts.listen === 'sr') this.rec.start();
  }

  next() {
    if (this._resolveMe && this.playing) { this._resolveMe(); return; }
    this.jump(this.idx + 1);
  }
  prev() {
    let i = this.idx - 1;
    while (i > 0 && this.blocks[i].type === 'act') i--;
    this.jump(Math.max(0, i));
  }
  jump(i) {
    const wasPlaying = this.playing;
    this.stopAudio();
    this.idx = Math.min(Math.max(0, i), this.blocks.length - 1);
    this.h.onIndex(this.idx);
    if (wasPlaying) this.play(this.idx); else this.h.onState('pause');
  }
  pause() { this.stopAudio(); this.playing = false; this.h.onState('pause'); }
  stopAudio() {
    this.token++;
    this.reader?.cancel();
    tts.cancel();
    this.h.onPartner?.(false);
    if (this._resolveMe) { const r = this._resolveMe; this._resolveMe = null; r(); }
    if (this.rec) this.rec.stop();
    this.vad?.disarm();
  }
  destroy() { this.pause(); this.rec = null; }
}

function speakWords(t) {
  return t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => /[\p{L}\p{N}]/u.test(w));
}

// Merkhilfe: nur Anfangsbuchstaben zeigen
export function initials(t) {
  return t.replace(/(\p{L})(\p{L}|['’\-])*/gu, (m, a) => a);
}
