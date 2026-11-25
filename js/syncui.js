// Einstellungen für den Abgleich Handy ↔ PC, inklusive Koppeln per QR-Code.
import { $, esc, ICON, openSheet, closeSheet, toast, buzz } from './ui.js';
import { syncCfg, setSyncCfg, syncState, syncNow, testConnection } from './sync.js';

const DEFAULT_REPO = 'marcelschneider891-cmyk/klappe-daten';
const QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const pairCode = () => { const c = syncCfg(); return 'KLAPPE1:' + btoa(JSON.stringify({ r: c.repo, t: c.token })); };
function readCode(s) {
  const m = String(s || '').trim().match(/^KLAPPE1:([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  try { const j = JSON.parse(atob(m[1])); return j.r && j.t ? j : null; } catch { return null; }
}
function loadQr() {
  return window.qrcode ? Promise.resolve(window.qrcode) : new Promise((res, rej) => { const s = document.createElement('script'); s.src = QR; s.onload = () => res(window.qrcode); s.onerror = () => rej(new Error('offline')); document.head.appendChild(s); });
}

export function syncSection(box, rerender) {
  const c = syncCfg(), st = syncState();
  const on = !!(c.repo && c.token);
  const when = st.last ? new Date(st.last).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : '';
  box.innerHTML = on ? `
   <div class="card pad stack">
    <div class="row" style="justify-content:space-between"><b>Abgleich aktiv</b><span class="tag ${st.ok === false ? '' : 'ok'}" style="${st.ok === false ? 'background:var(--bad-c);color:var(--bad)' : ''}">${st.ok === false ? 'Fehler' : 'Verbunden'}</span></div>
    <p class="muted small">${when ? `Zuletzt: ${esc(when)} · ${esc(st.msg || '')}` : 'Noch nicht abgeglichen.'}</p>
    <div class="set" style="padding:0"><div class="li-main"><b>Videos (Takes) mit abgleichen</b><small>Braucht viel Datenvolumen, am besten im WLAN</small></div><label class="switch"><input type="checkbox" id="syTakes"${c.takes ? ' checked' : ''} aria-label="Takes mit abgleichen"><i></i></label></div>
    <div class="set" style="padding:0"><div class="li-main"><b>ElevenLabs-Schlüssel mit abgleichen</b><small>Dann musst du ihn nur auf einem Gerät eintragen. Er liegt dafür in deinem privaten Speicher.</small></div><label class="switch"><input type="checkbox" id="syKey"${localStorage.getItem('klappe.sync.noKey') === 'true' ? '' : ' checked'} aria-label="ElevenLabs-Schlüssel mit abgleichen"><i></i></label></div>
    <div class="grid2"><button class="btn fill" id="syNow" type="button">${ICON.refresh} Jetzt abgleichen</button><button class="btn tonal" id="syPair" type="button">Gerät koppeln</button></div>
    <button class="btn text" id="syOff" type="button">Abgleich auf diesem Gerät trennen</button>
   </div>` : `
   <div class="card pad stack">
    <p>Halte Skripte, Tagebuch, Gagen, Profil und Stimmen auf Handy und PC automatisch gleich. Die Daten liegen in einem <b>privaten</b> GitHub-Repository, das nur du sehen kannst.</p>
    <div class="grid2"><button class="btn fill" id="syScan" type="button">${ICON.cam} Code scannen</button><button class="btn tonal" id="syPaste" type="button">Code einfügen</button></div>
    <p class="muted small">Schon auf dem anderen Gerät eingerichtet? Dort unter „Gerät koppeln“ den Code anzeigen und hier scannen.</p>
    <details><summary class="muted small" style="cursor:pointer">Zum ersten Mal einrichten</summary>
     <div class="stack" style="margin-top:12px">
      <div class="field"><label for="syRepo">Repository</label><input class="inp" id="syRepo" value="${esc(c.repo || DEFAULT_REPO)}" spellcheck="false" autocomplete="off"></div>
      <div class="field"><label for="syTok">Zugangsschlüssel (Fine-grained Token)</label><input class="inp" id="syTok" type="password" spellcheck="false" autocomplete="off" placeholder="github_pat_…"></div>
      <button class="btn fill" id="syGo" type="button">Verbinden und abgleichen</button>
     </div></details>
   </div>`;

  const connect = async (repo, token) => {
    setSyncCfg({ repo, token });
    try {
      await testConnection();
      toast('Verbunden. Gleiche ab …');
      const r = await syncNow();
      buzz(15); toast('Abgleich fertig: ' + (r.msg || ''));
    } catch (e) { setSyncCfg({ token: '' }); toast(e.message); }
    rerender();
  };

  $('#syGo', box)?.addEventListener('click', () => {
    const repo = $('#syRepo', box).value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), tok = $('#syTok', box).value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !tok) return toast('Repository und Schlüssel eintragen.');
    connect(repo, tok);
  });
  $('#syPaste', box)?.addEventListener('click', () => openSheet('Code einfügen', `<div class="field"><label for="pc">Kopplungs-Code vom anderen Gerät</label><textarea class="inp" id="pc" style="min-height:90px" spellcheck="false"></textarea></div><button class="btn fill wide" id="pcGo" type="button">Koppeln</button>`, b => {
    $('#pcGo', b).onclick = () => { const j = readCode($('#pc', b).value); if (!j) return toast('Das ist kein gültiger Klappe-Code.'); closeSheet(); connect(j.r, j.t); };
  }));
  $('#syScan', box)?.addEventListener('click', () => scan(j => connect(j.r, j.t)));
  $('#syNow', box)?.addEventListener('click', async () => {
    const b = $('#syNow', box); b.disabled = true;
    try { const r = await syncNow(); toast('Abgleich: ' + r.msg); } catch (e) { toast(e.message); }
    rerender();
  });
  $('#syKey', box)?.addEventListener('change', e => { try { localStorage.setItem('klappe.sync.noKey', e.target.checked ? 'false' : 'true'); } catch {} toast(e.target.checked ? 'Schlüssel wird mit abgeglichen' : 'Schlüssel bleibt nur auf diesem Gerät'); if (e.target.checked) syncNow({ quiet: true }); });
  $('#syTakes', box)?.addEventListener('change', e => { setSyncCfg({ takes: e.target.checked }); toast(e.target.checked ? 'Takes werden mit abgeglichen' : 'Takes bleiben auf dem Gerät'); });
  $('#syOff', box)?.addEventListener('click', () => { setSyncCfg({ token: '' }); toast('Getrennt. Deine Daten bleiben auf diesem Gerät.'); rerender(); });
  $('#syPair', box)?.addEventListener('click', async () => {
    const code = pairCode();
    openSheet('Gerät koppeln', `
     <p class="muted">Öffne Klappe auf dem anderen Gerät: Einstellungen › Abgleich › <b>Code scannen</b>. Zeig diesen Code nur deinen eigenen Geräten, er ist dein Zugang.</p>
     <div id="qrBox" style="display:flex;justify-content:center;background:#fff;border-radius:16px;padding:16px"></div>
     <button class="btn out wide" id="cpy" type="button">Code als Text kopieren</button>`, async b => {
      try { const q = (await loadQr())(0, 'M'); q.addData(code); q.make(); $('#qrBox', b).innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); $('#qrBox svg', b).style.cssText = 'width:min(70vw,280px);height:auto'; }
      catch { $('#qrBox', b).innerHTML = '<p style="color:#333">QR-Code braucht Internet. Nimm „Code als Text kopieren“.</p>'; }
      $('#cpy', b).onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Kopiert'); } catch { toast('Kopieren nicht möglich'); } };
    });
  });
}

// QR-Code mit der Kamera lesen (Chrome auf Android kann das von Haus aus)
function scan(onCode) {
  if (!('BarcodeDetector' in window)) { toast('Scannen geht hier nicht. Nimm „Code einfügen“.'); return; }
  let stream = null, iv = null;
  openSheet('Code scannen', `<video id="scV" playsinline muted autoplay style="width:100%;border-radius:12px;background:#000;aspect-ratio:1;object-fit:cover"></video><p class="muted small">Halte die Kamera auf den Code am anderen Gerät.</p>`, async b => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#scV', b); v.srcObject = stream;
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      iv = setInterval(async () => {
        try {
          const r = await det.detect(v);
          const j = r.length && readCode(r[0].rawValue);
          if (j) { clearInterval(iv); buzz(20); closeSheet(); onCode(j); }
        } catch {}
      }, 350);
    } catch { toast('Kein Kamerazugriff.'); }
  }, { onClose: () => { clearInterval(iv); stream?.getTracks().forEach(t => t.stop()); } });
}
