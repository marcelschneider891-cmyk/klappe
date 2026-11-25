// „Was ist neu“: bei jedem Update oben einen neuen Eintrag ergänzen (neuester zuerst).
import { ls } from './db.js';
import { esc, ICON, setTop, setFab, largeTitle } from './ui.js';

export const CHANGELOG = [
  {
    id: '2026-11-25b',
    titel: 'ElevenLabs repariert',
    datum: '25. November 2026',
    besser: [
      'Klare Meldung, was mit dem ElevenLabs-Schlüssel nicht stimmt, statt nur „antwortet nicht“',
      'Leerzeichen, Zeilenumbrüche und Anführungszeichen beim Einfügen des Schlüssels werden automatisch entfernt'
    ],
    behoben: [
      'Ein falscher Schlüssel wurde gespeichert, obwohl die Prüfung fehlschlug, und konnte per Abgleich auch das andere Gerät stören. Jetzt wird nur ein funktionierender Schlüssel übernommen.'
    ]
  },
  {
    id: '2026-11-25',
    titel: 'Das große Update',
    datum: '25. November 2026',
    intro: 'Alles, was in Klappe bisher dazugekommen ist, auf einen Blick.',
    neu: [
      ['Proben mit Szenenpartner', 'Die App liest die anderen Rollen vor, hört dir zu und sagt bei „Line!“ die nächsten Wörter ein.'],
      ['Self-Tape', 'Aufnehmen mit Partner aus dem Off, im Querformat (16:9) oder Hochformat, in 720p, 1080p oder 4K.'],
      ['Technik-Check beim Self-Tape', 'Live-Anzeige für Licht, Ton und Bildausschnitt, Bildrahmen und die Marke „Blick hierhin“.'],
      ['Partnerstimme nach Wahl', 'Handy-Stimme, ElevenLabs, eine eigene Aufnahme von einem Freund oder ganz aus. Im Video hörbar, leise oder stumm.'],
      ['Takes bearbeiten', 'Zuschneiden, als Favorit markieren, nebeneinander vergleichen und automatisch richtig benennen.'],
      ['Showreel-Baukasten', 'Die besten Takes mit Titel- und Kontaktkarte zu einem Video zusammenfügen.'],
      ['Lern-Modus', 'Lückentext in zwei Stufen, nur Anfangsbuchstaben oder versteckt, dazu „Text sitzt zu X %“ pro Szene.'],
      ['Rollenarbeit', 'Acht Fragen zur Figur, eigene Notizen pro Zeile, *Betonung* und / Pausen im Text.'],
      ['Monologe', 'Karl und Franz Moor, Mortimer und Faust im Originaltext zum Lernen.'],
      ['Warm-up', 'Neun Übungen für Atmung, Stimme und Artikulation, etwa 6 Minuten, mit Timer und Ansage.'],
      ['Casting-Tagebuch', 'Jedes Vorsprechen mit Stand, Kalender, Eintrag in den Google Kalender und Jahresrückblick zum Teilen.'],
      ['Gagen', 'Drehtage und Gagen festhalten, offene Beträge sehen und als CSV für die Steuer exportieren.'],
      ['Casting-Radar', 'Sucht zweimal täglich passende Castings aus 30 Quellen, mit Push-Nachricht und Markierung „Kostenlos“ oder „Mitgliedschaft“.'],
      ['Bewerbungs-Helfer', 'Zu jedem Radar-Treffer ein fertiger Bewerbungstext, zum Kopieren oder direkt Senden.'],
      ['Radar lernt mit', 'Was du ausblendest, merkst oder bewirbst, fließt in die nächsten Suchen ein.'],
      ['Profil', 'Foto, Spielalter, Größe, Sprachen, Skills und Links, das Radar sucht damit.'],
      ['Abgleich Handy ↔ PC', 'Skripte, Tagebuch, Gagen, Profil, Stimmen und Einstellungen auf beiden Geräten gleich, Koppeln per QR-Code.'],
      ['Sicherung', 'Alles in eine Datei, z. B. in Google Drive, und jederzeit zurückholen.'],
      ['Texterkennung', 'Gescannte Sides und Fotos von Skriptseiten werden gelesen.'],
      ['Am PC', 'Seitenleiste, Tastenkürzel (Leertaste, Pfeile, L, Esc) und Dateien einfach ins Fenster ziehen.']
    ],
    besser: [
      'Videos in deutlich höherer Qualität (12 statt 6 Mbit/s) und als MP4, wenn dein Gerät es kann',
      'Text oben im Videomodus größer, und es steht immer dabei, welche Lernstufe an ist',
      'Optik wie eine echte Android-App, neues Icon und Start-Animation',
      'ElevenLabs-Schlüssel und Einstellungen wandern beim Abgleich mit aufs andere Gerät'
    ],
    behoben: [
      'Klappe startete nach einem Update nicht mehr, wenn noch ein alter Tab offen war',
      'Auf manchen Geräten blieben Aufnahmen leer',
      'Am PC löste die Leertaste nach einem Mausklick doppelt aus',
      'Ein Klick ins Videobild sprang ungewollt zum nächsten Satz',
      'Bei „Anfangsbuchstaben“ standen einzelne Buchstaben ohne Erklärung da',
      'ElevenLabs war am PC nicht verbunden, obwohl es am Handy eingerichtet war'
    ]
  }
];

export const latest = () => CHANGELOG[0].id;
export const hasUnseen = () => ls.get('neu.seen', '') !== latest();
export const markSeen = () => ls.set('neu.seen', latest());

export function neuView(view) {
  setTop({ title: 'Was ist neu', back: true, large: true });
  setFab(null);
  markSeen();
  view.innerHTML = `${largeTitle('Was ist neu')}${CHANGELOG.map(c => `
   <section class="sec">
    <div class="neu-h"><span class="tag new">${esc(c.datum)}</span><h2>${esc(c.titel)}</h2>${c.intro ? `<p class="muted">${esc(c.intro)}</p>` : ''}</div>
    ${c.neu?.length ? `<div class="group-h">Neu</div><div class="list">${c.neu.map(([t, d]) => `<div class="li" style="align-items:flex-start"><span class="tile t-halten">${ICON.star}</span><span class="li-main"><b style="white-space:normal">${esc(t)}</b><small style="white-space:normal">${esc(d)}</small></span></div>`).join('')}</div>` : ''}
    ${c.besser?.length ? `<div class="group-h">Besser</div><div class="list">${c.besser.map(t => `<div class="li"><span class="tile t-eingereicht">${ICON.check}</span><span class="li-main"><small style="white-space:normal;color:var(--on)">${esc(t)}</small></span></div>`).join('')}</div>` : ''}
    ${c.behoben?.length ? `<div class="group-h">Behoben</div><div class="list">${c.behoben.map(t => `<div class="li"><span class="tile t-gebucht">${ICON.check}</span><span class="li-main"><small style="white-space:normal;color:var(--on)">${esc(t)}</small></span></div>`).join('')}</div>` : ''}
   </section>`).join('')}
   <div class="sec"><a class="btn tonal wide" href="#" id="tutAgain">Tutorial nochmal ansehen</a></div>`;
  view.querySelector('#tutAgain').onclick = e => { e.preventDefault(); window.dispatchEvent(new Event('klappe-tutorial')); };
}
