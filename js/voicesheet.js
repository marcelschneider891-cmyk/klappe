// Sheet: Partnerstimme für ein Skript wählen (Handy, ElevenLabs, Aufnahme, Aus)
import { $, $$, esc, ICON, openSheet, closeSheet, toast, buzz } from './ui.js';
import { db } from './db.js';
import { tts, micStream } from './speech.js';
import { SOURCES, PITCH, scriptVoice, partnerLines, eleven, elevenVoiceFor, prepareEleven, elevenStatus, recordStatus, recKey, getAudio, putAudio, delAudio, defaults } from './voices.js';

export function voiceLabel(s) {
  const v = scriptVoice(s);
  return SOURCES.find(x => x.k === v.source)?.l || 'Handy';
}

export function openVoiceSheet(s, onSaved) {
  const v = scriptVoice(s);
  let source = v.source;
  const chars = JSON.parse(JSON.stringify(v.chars));
  const others = s.characters.filter(c => !(s.me || []).includes(c));
  let abort = null, recCleanup = null;

  const save = async (notify = true) => {
    s.voice = { source, chars };
    await db.put('scripts', s);
    if (notify) onSaved?.(s);
  };

  openSheet('Partnerstimme', `
   <div class="seg" id="vSeg">${SOURCES.map(x => `<button type="button" data-k="${x.k}"${x.k === source ? ' class="on"' : ''}>${x.l}</button>`).join('')}</div>
   <p class="muted small" id="vDesc"></p>
   <div id="vBody"></div>
   <button class="btn fill wide" id="vDone" type="button">Fertig</button>`, body => {
    const draw = async () => {
      recCleanup?.(); recCleanup = null;
      $$('#vSeg button', body).forEach(b => b.classList.toggle('on', b.dataset.k === source));
      $('#vDesc', body).textContent = SOURCES.find(x => x.k === source).d;
      const box = $('#vBody', body);
      if (source === 'device') box.innerHTML = deviceHtml();
      else if (source === 'eleven') box.innerHTML = '<div class="skel" style="height:120px"></div>', box.innerHTML = await elevenHtml();
      else if (source === 'record') box.innerHTML = await recordHtml();
      else box.innerHTML = `<div class="card pad stack"><p>Die Sätze deines Partners stehen nur auf dem Bildschirm. Die App wartet so lange, wie der Satz ungefähr dauert. Tippen überspringt.</p><p class="muted small">Gut, wenn ein echter Mensch neben der Kamera liest oder du ganz ohne Stimme drehen willst.</p></div>`;
      wire(box);
    };

    const deviceHtml = () => {
      const vs = tts.germanVoices();
      if (!vs.length) return `<div class="card pad"><p>Auf diesem Gerät ist keine deutsche Stimme installiert. Unter Android: Einstellungen › Bedienungshilfen › Sprachausgabe › Google Sprachausgabe › Deutsch installieren.</p></div>`;
      return `<div class="card pad">${others.map(c => {
        const cur = chars[c]?.device || {};
        return `<div class="vrow" data-c="${esc(c)}"><div class="li-main stack" style="gap:8px"><b>${esc(c)}</b>
          <select class="inp" data-f="voice">${vs.map(x => `<option value="${esc(x.voiceURI)}"${x.voiceURI === cur.voiceURI ? ' selected' : ''}>${esc(x.name.replace(/\s*-\s*German.*$/i, '').replace(/^Microsoft\s+/i, ''))}</option>`).join('')}</select>
          <div class="seg" data-f="pitch">${PITCH.map(p => `<button type="button" data-p="${p.k}"${(cur.pitch ?? 1) === p.k ? ' class="on"' : ''}>${p.l}</button>`).join('')}</div></div>
          <button class="ic" type="button" data-try="device" aria-label="Probe hören">${ICON.play}</button></div>`;
      }).join('')}</div>`;
    };

    const elevenHtml = async () => {
      if (!eleven.key()) return `<div class="card pad stack"><p>Für ElevenLabs brauchst du einen eigenen API-Schlüssel. Den trägst du einmal in den Einstellungen ein. Die erzeugten Sätze werden gespeichert und kosten nur einmal.</p><a class="btn tonal" href="#einstellungen" data-close>Zu den Einstellungen</a></div>`;
      let list;
      try { list = await eleven.voices(); } catch (e) { return `<div class="card pad"><p>${esc(e.message)}</p></div>`; }
      const st = await elevenStatus(s);
      const q = await eleven.quota();
      return `<div class="card pad">${others.map(c => {
        const cur = elevenVoiceFor(s, c) || (chars[c]?.eleven);
        const sel = chars[c]?.eleven?.id || cur?.id || '';
        return `<div class="vrow" data-c="${esc(c)}"><div class="li-main stack" style="gap:8px"><b>${esc(c)}</b>
          <select class="inp" data-f="eleven"><option value="">Stimme wählen …</option>${list.map(x => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.name)}${x.labels.gender ? ' · ' + esc(x.labels.gender === 'male' ? 'männlich' : x.labels.gender === 'female' ? 'weiblich' : x.labels.gender) : ''}${x.labels.age ? ' · ' + esc(x.labels.age) : ''}</option>`).join('')}</select></div>
          <button class="ic" type="button" data-try="eleven" aria-label="Hörprobe">${ICON.play}</button></div>`;
      }).join('')}</div>
      <div class="card pad stack">
       <div class="row" style="justify-content:space-between"><b>${st.ready} von ${st.total} Sätzen fertig</b>${st.chars ? `<span class="muted small">≈ ${st.chars} Zeichen</span>` : ''}</div>
       ${q ? `<p class="muted small">Dein Guthaben: ${(q.limit - q.used).toLocaleString('de-DE')} von ${q.limit.toLocaleString('de-DE')} Zeichen übrig</p>` : ''}
       <div class="progress" id="elProg"><i style="width:${st.total ? st.ready / st.total * 100 : 0}%"></i></div>
       <button class="btn tonal" id="elGo" type="button"${st.ready === st.total ? ' disabled' : ''}>${ICON.voice} ${st.ready === st.total ? 'Alles bereit' : 'Jetzt erzeugen'}</button>
       <p class="muted small">Erzeugte Sätze bleiben auf dem Handy und funktionieren auch offline.</p>
      </div>`;
    };

    const recordHtml = async () => {
      const lines = partnerLines(s);
      if (!lines.length) return '<div class="card pad"><p>Wähle zuerst deine Rolle.</p></div>';
      const st = await recordStatus(s);
      const rows = [];
      for (const b of lines) {
        const has = !!(await getAudio(recKey(s.id, b.id)));
        rows.push(`<div class="recline${has ? ' done' : ''}" data-b="${esc(b.id)}"><div><b class="small" style="color:var(--primary)">${esc(b.who)}</b><p>${esc(b.text)}</p></div>
          <div class="row"><button class="btn sm ${has ? 'out' : 'red'}" type="button" data-rec>${has ? 'Neu aufnehmen' : `${ICON.rec} Aufnehmen`}</button>${has ? `<button class="btn sm out" type="button" data-play>${ICON.play} Anhören</button><button class="ic" type="button" data-del aria-label="Aufnahme löschen">${ICON.trash}</button>` : ''}</div></div>`);
      }
      return `<p class="muted small">${st.ready} von ${st.total} Sätzen eingesprochen. Lass am besten einen Freund lesen: Casting-Büros hören lieber einen echten Menschen als dich selbst vom Band. Fehlende Sätze spricht die Handy-Stimme.</p><div class="stack">${rows.join('')}</div>`;
    };

    const wire = box => {
      box.onchange = e => {
        const row = e.target.closest('[data-c]'); if (!row) return;
        const c = row.dataset.c;
        chars[c] = chars[c] || {};
        if (e.target.dataset.f === 'voice') chars[c].device = { ...(chars[c].device || {}), voiceURI: e.target.value };
        if (e.target.dataset.f === 'eleven') {
          const name = e.target.selectedOptions[0]?.textContent.split(' · ')[0];
          chars[c].eleven = e.target.value ? { id: e.target.value, name } : null;
          s.voice = { source, chars }; draw();
        }
      };
      box.onclick = async e => {
        const pitchBtn = e.target.closest('[data-p]');
        const row = e.target.closest('[data-c]');
        if (pitchBtn && row) {
          const c = row.dataset.c;
          chars[c] = chars[c] || {};
          chars[c].device = { ...(chars[c].device || {}), pitch: +pitchBtn.dataset.p };
          $$('[data-p]', row).forEach(x => x.classList.toggle('on', x === pitchBtn));
          return;
        }
        const tryBtn = e.target.closest('[data-try]');
        if (tryBtn && row) {
          const c = row.dataset.c;
          const sample = partnerLines(s).find(b => b.who === c)?.text || 'Hallo, ich lese heute deinen Partner.';
          if (tryBtn.dataset.try === 'device') {
            const d = chars[c]?.device || {};
            const voice = tts.germanVoices().find(x => x.voiceURI === d.voiceURI) || tts.germanVoices()[0];
            tts.speak(sample, { voice, pitch: d.pitch ?? 1 });
          } else {
            const id = chars[c]?.eleven?.id || elevenVoiceFor(s, c)?.id;
            const pv = (await eleven.voices().catch(() => [])).find(x => x.id === id);
            if (pv?.preview) new Audio(pv.preview).play().catch(() => toast('Hörprobe nicht verfügbar.'));
            else toast('Wähle zuerst eine Stimme.');
          }
          return;
        }
        if (e.target.closest('#elGo')) {
          s.voice = { source, chars };
          const btn = $('#elGo', box); btn.disabled = true;
          abort = new AbortController();
          try {
            const made = await prepareEleven(s, (d, t) => { $('#elProg i', box).style.width = (d / t * 100) + '%'; btn.textContent = `Erzeuge ${d} von ${t} …`; }, abort.signal);
            await save(); toast(made ? `${made} Sätze erzeugt` : 'Alles bereit'); draw();
          } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Nochmal versuchen'; }
          return;
        }
        const line = e.target.closest('[data-b]');
        if (line) {
          const k = recKey(s.id, line.dataset.b);
          if (e.target.closest('[data-play]')) { const bl = await getAudio(k); if (bl) { const a = new Audio(URL.createObjectURL(bl)); a.play(); } }
          else if (e.target.closest('[data-del]')) { await delAudio(k); draw(); }
          else if (e.target.closest('[data-rec]')) recordLine(line, k);
        }
      };
    };

    // Einen Partnersatz einsprechen
    const recordLine = async (line, k) => {
      let stream;
      try { stream = await micStream(); } catch { toast('Mikro nicht erlaubt.'); return; }
      buzz();
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const parts = [];
      rec.ondataavailable = e => e.data.size && parts.push(e.data);
      const btn = $('[data-rec]', line);
      btn.className = 'btn sm red'; btn.innerHTML = `<span class="recdot"></span> Stopp`;
      const stop = () => { if (rec.state !== 'inactive') rec.stop(); };
      recCleanup = stop;
      btn.onclick = ev => { ev.stopPropagation(); stop(); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        recCleanup = null;
        if (parts.length) { await putAudio(k, new Blob(parts, { type: rec.mimeType || 'audio/webm' })); buzz(12); }
        draw();
      };
      rec.start();
    };

    $('#vSeg', body).onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; source = b.dataset.k; draw(); };
    $('#vDone', body).onclick = async () => { await save(); closeSheet(); toast('Partnerstimme: ' + SOURCES.find(x => x.k === source).l); };
    draw();
  }, { onClose: () => { abort?.abort(); recCleanup?.(); tts.cancel(); save(false); } });
}
