// Proben: der Partner liest, du sprichst, "Line!" hilft.
import { Runner, initials } from './runner.js';
import { srAvailable, makeVAD, micStream, tts } from './speech.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast } from './ui.js';
import { ls } from './db.js';
import { Reader } from './voices.js';
import { openVoiceSheet, voiceLabel } from './voicesheet.js';

const HIDE = [
  { k: 'zeigen', l: 'Text zeigen' },
  { k: 'anfang', l: 'Nur Anfangsbuchstaben' },
  { k: 'aus', l: 'Meinen Text verstecken' }
];

export function defaultOpts() {
  return Object.assign({ listen: srAvailable ? 'sr' : 'vad', hide: 'zeigen', rate: 1, pause: 1000, readActions: false, cueGap: 150 }, ls.get('rehearse.opts', {}));
}

export async function rehearseView(view, script, { exit }) {
  const opts = defaultOpts();
  const me = script.me || [];
  let mic = null, vad = null, wake = null;

  view.innerHTML = `
  <div class="rh">
   <div class="rh-top">
    <button class="ic" id="rhExit" type="button" aria-label="Proben beenden">${ICON.x}</button>
    <span class="t">${esc(script.title)}</span>
    <button class="ic" id="rhVoice" type="button" aria-label="Partnerstimme">${ICON.voice}</button><button class="ic" id="rhGear" type="button" aria-label="Einstellungen">${ICON.tune}</button>
   </div>
   <div class="rh-lines" id="rhLines">${script.blocks.map((b, i) => lineHtml(b, i, me)).join('')}</div>
   <div class="rh-state" id="rhState">Tippe auf Play. Du bist ${esc(me.join(' / '))}.</div>
   <div class="rh-ctl">
    <button class="rc" id="rhHide" type="button" aria-label="Textanzeige wechseln">${ICON.eye}</button>
    <button class="rc" id="rhPrev" type="button" aria-label="Zurück">${ICON.prev}</button>
    <button class="rc play" id="rhPlay" type="button" aria-label="Abspielen">${ICON.play}</button>
    <button class="rc" id="rhNext" type="button" aria-label="Weiter">${ICON.next}</button>
    <button class="rc" id="rhAgain" type="button" aria-label="Von vorn">${ICON.repeat}</button>
   </div>
   <button class="linebtn" id="rhLine" type="button" hidden>Line!</button>
  </div>`;

  const lines = $('#rhLines', view);
  const state = $('#rhState', view);
  const playBtn = $('#rhPlay', view);
  const lineBtn = $('#rhLine', view);

  const applyHide = () => {
    $$('.rl.me', view).forEach(el => {
      const b = script.blocks[+el.dataset.i];
      const passed = el.classList.contains('done');
      el.classList.toggle('hide', opts.hide === 'aus' && !passed && !el.dataset.revealed);
      $('.x', el).textContent = opts.hide === 'anfang' && !passed && !el.dataset.revealed ? initials(b.text) : b.text;
    });
  };

  const hooks = {
    onIndex(i) {
      $$('.rl', view).forEach(el => {
        const j = +el.dataset.i;
        el.classList.toggle('now', j === i);
        el.classList.toggle('done', j < i);
        $('.feed', el)?.remove();
      });
      applyHide();
      const cur = $(`.rl[data-i="${i}"]`, view);
      cur?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      lineBtn.hidden = !(script.blocks[i]?.type === 'line' && me.includes(script.blocks[i].who));
    },
    onState(s, who) {
      playBtn.innerHTML = (s === 'pause' || s === 'end') ? ICON.play : ICON.pause;
      playBtn.setAttribute('aria-label', (s === 'pause' || s === 'end') ? 'Abspielen' : 'Pause');
      if (s === 'reader') state.textContent = `${who} spricht …`;
      else if (s === 'you') state.innerHTML = opts.listen === 'sr' ? 'Du bist dran. Ich höre zu. Hänger? Sag „Line!“' :
        opts.listen === 'vad' ? 'Du bist dran. Wenn du eine Pause machst, geht es weiter. <span class="lvl"><i id="lvl"></i></span>' :
        opts.listen === 'auto' ? 'Du bist dran.' : 'Du bist dran. Tippe auf Weiter, wenn du fertig bist.';
      else if (s === 'pause') state.textContent = 'Pausiert.';
      else if (s === 'end') { state.textContent = 'Szene durch. Nochmal?'; lineBtn.hidden = true; releaseWake(); }
      else if (s === 'nomic') { state.textContent = 'Kein Mikro-Zugriff. Ich warte jetzt auf deinen Tipp auf Weiter.'; opts.listen = 'tap'; }
    },
    onFeed(text) {
      const cur = $('.rl.now', view);
      if (!cur) return;
      let f = $('.feed', cur);
      if (!f) { f = document.createElement('span'); f.className = 'feed'; cur.appendChild(f); }
      f.textContent = text;
      if (opts.hide !== 'zeigen') { cur.dataset.revealed = '1'; applyHide(); }
    },
    onHeard(pos, len) { state.textContent = `Gehört: ${pos} von ${len} Wörtern. Hänger? Sag „Line!“`; },
    onFinish() {}
  };

  let runner = null;
  const build = async () => {
    runner?.destroy();
    if (opts.listen === 'vad' && !vad) {
      try {
        mic = await micStream();
        vad = makeVAD(mic, { onLevel: v => { const l = document.getElementById('lvl'); if (l) l.style.width = Math.round(v * 100) + '%'; } });
      } catch { toast('Mikro nicht erlaubt. Weiter geht es per Tipp.'); opts.listen = 'tap'; }
    }
    runner = new Runner({ script, me, opts, mic, vad, hooks, reader: new Reader(script) });
  };
  await build();
  hooks.onIndex(0);

  async function wakeOn() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
  function releaseWake() { try { wake?.release(); } catch {} wake = null; }

  playBtn.onclick = () => {
    if (runner.playing) { runner.pause(); releaseWake(); }
    else { if (!tts.germanVoices().length && tts.ok) toast('Keine deutsche Stimme gefunden. Installiere „Google Sprachausgabe“ mit Deutsch.'); wakeOn(); runner.play(runner.idx >= script.blocks.length ? 0 : runner.idx); }
  };
  $('#rhNext', view).onclick = () => runner.next();
  $('#rhPrev', view).onclick = () => runner.prev();
  $('#rhAgain', view).onclick = () => { $$('.rl', view).forEach(el => delete el.dataset.revealed); wakeOn(); runner.jump(0); if (!runner.playing) runner.play(0); };
  lineBtn.onclick = () => runner.feed();
  $('#rhHide', view).onclick = () => {
    const i = HIDE.findIndex(h => h.k === opts.hide);
    opts.hide = HIDE[(i + 1) % HIDE.length].k;
    ls.set('rehearse.opts', { ...opts });
    applyHide();
    toast(HIDE.find(h => h.k === opts.hide).l);
  };
  lines.addEventListener('click', e => {
    const el = e.target.closest('.rl');
    if (!el) return;
    if (el.classList.contains('hide')) { el.dataset.revealed = '1'; applyHide(); return; }
    runner.jump(+el.dataset.i);
  });
  $('#rhGear', view).onclick = () => settingsSheet(opts, async () => {
    ls.set('rehearse.opts', { ...opts });
    const wasPlaying = runner.playing, at = runner.idx;
    runner.pause();
    await build();
    hooks.onIndex(at);
    runner.idx = at;
    if (wasPlaying) runner.play(at);
  });
  $('#rhVoice', view).onclick = () => { runner.pause(); openVoiceSheet(script, async () => { await build(); toast('Partnerstimme: ' + voiceLabel(script)); }); };
  const leave = () => { runner?.destroy(); vad?.close(); mic?.getTracks().forEach(t => t.stop()); releaseWake(); };
  $('#rhExit', view).onclick = () => { leave(); exit(); };
  return leave;
}

function lineHtml(b, i, me) {
  if (b.type === 'act') return `<div class="rl act" data-i="${i}"><span class="x">${esc(b.text)}</span></div>`;
  const mine = me.includes(b.who);
  const m = b.text.match(/^\(([^)]*)\)\s*/);
  const note = m ? m[1] : '';
  const text = m ? b.text.slice(m[0].length) : b.text;
  return `<div class="rl${mine ? ' me' : ''}" data-i="${i}"><span class="w">${esc(b.who)}</span>${note ? `<span class="n">(${esc(note)})</span>` : ''}<span class="x">${esc(text)}</span></div>`;
}

export function settingsSheet(opts, onSave, { tape = false } = {}) {
  const listenOpts = tape
    ? [['vad', 'Pause erkennen (empfohlen)'], ['tap', 'Ich tippe auf den Bildschirm'], ['auto', 'Nach Zeit']]
    : [...(srAvailable ? [['sr', 'Zuhören mit Spracherkennung (empfohlen)']] : []), ['vad', 'Pause erkennen'], ['tap', 'Ich tippe auf Weiter'], ['auto', 'Nach Zeit']];
  openSheet('Einstellungen', `
   <div class="field"><label for="sListen">Wann geht es nach deinem Satz weiter?</label>
    <select class="inp" id="sListen">${listenOpts.map(([k, l]) => `<option value="${k}"${opts.listen === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
   <div class="field"><label for="sPause">Pause bis zum Einsatz: <b id="sPauseV">${(opts.pause / 1000).toFixed(1)} s</b></label>
    <input id="sPause" type="range" min="500" max="2500" step="100" value="${opts.pause}"></div>
   <div class="field"><label for="sRate">Sprechtempo Partner: <b id="sRateV">${opts.rate.toFixed(2)}×</b></label>
    <input id="sRate" type="range" min="0.7" max="1.4" step="0.05" value="${opts.rate}"></div>
   <div class="field"><label for="sGap">Kurze Pause nach dem Partner: <b id="sGapV">${opts.cueGap} ms</b></label>
    <input id="sGap" type="range" min="0" max="1200" step="50" value="${opts.cueGap}"></div>
   ${tape ? '' : `<div class="set card"><div class="li-main"><b>Regieanweisungen vorlesen</b></div><label class="switch"><input type="checkbox" id="sAct"${opts.readActions ? ' checked' : ''} aria-label="Regieanweisungen vorlesen"><i></i></label></div>`}
   <button class="btn fill wide" id="sSave" type="button">Übernehmen</button>`, body => {
    const upd = () => {
      $('#sPauseV', body).textContent = (+$('#sPause', body).value / 1000).toFixed(1) + ' s';
      $('#sRateV', body).textContent = (+$('#sRate', body).value).toFixed(2) + '×';
      $('#sGapV', body).textContent = $('#sGap', body).value + ' ms';
    };
    body.addEventListener('input', upd);
    $('#sSave', body).onclick = () => {
      opts.listen = $('#sListen', body).value;
      opts.pause = +$('#sPause', body).value;
      opts.rate = +$('#sRate', body).value;
      opts.cueGap = +$('#sGap', body).value;
      if (!tape) opts.readActions = $('#sAct', body).checked;
      closeSheet();
      onSave();
    };
  });
}
