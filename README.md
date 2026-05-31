# 🌙 zzz.radio

Einschlaf-Radio für den Raspberry Pi mit Touch-Display (Waveshare 7.9",
400×1280 Hochformat): Einschlaf-Sounds, Internet-Radio, Wecker, Bluetooth –
als leichte Web-App im Chromium-Kiosk (kein Electron/GTK), Design inspiriert
von der Logitech Squeezebox Touch.

### 🚀 Installation
- **Schnell (Pi OS Lite):** [INSTALL-Lite-Quick.md](INSTALL-Lite-Quick.md) →
  `./install.sh` erledigt alles.
- **Ausführlich (Pi OS Desktop):** [INSTALL.md](INSTALL.md)

---

## Zwei Modi (Tabs oben)

### 🎚️ Sounds
Mehrere Einschlaf-Geräusche **gleichzeitig** mischbar, jedes mit eigenem
Lautstärke-Regler. **Echte Aufnahmen** (geloopte `.ogg`-Dateien in `sounds/`):

- 🌧️ Regen, ⛈️ Gewitter, 🌊 Meereswellen, 🏞️ Bach, 🍃 Wind
- 🔥 Kaminfeuer, 🐦 Vögel, 🦗 Sommernacht, 🚂 Zug, ⛵ Boot
- 🏙️ Stadt, ☕ Café, ⚪ Weißes / 🔴 Rosa Rauschen

> Sounds stammen aus dem **Blanket-Projekt** (freesound.org / soundbible),
> überwiegend CC0 / CC-BY / Public Domain — Quellen & Lizenzen in
> [`sounds/ATTRIBUTION.md`](sounds/ATTRIBUTION.md). Sie liegen lokal bei, laufen
> also **offline** auf dem Pi. Beim ersten Antippen wird die Datei kurz geladen
> (Punkt pulsiert), danach ist sie zwischengespeichert.

Karte antippen = an/aus (mit sanftem **Ein-/Ausfaden**). Regler darunter =
Lautstärke. Oben: Master-Lautstärke.

### 📻 Radio
Internet-Radio (das, was TuneIn im Hintergrund auch macht: direkte Stream-URLs).
Ein paar ruhige Sender sind voreingestellt. Eigene Sender per **„＋ Sender
hinzufügen"** (Name + Stream-URL).

- **Sender-Logos** werden automatisch geladen (Logo → Favicon → 📡 als Fallback).
- **Now-Playing** mit Album-Art und langem, sanft **scrollendem Sendernamen**.
- **Aktuelle Sendung/Song** wird unter dem Sendernamen angezeigt (aus den
  ICY-Stream-Metadaten, alle 20 s aktualisiert über `server.py`). Sender ohne
  Metadaten zeigen einfach nur den Sendernamen.
- **Cover-Bild:** Das **Senderlogo bleibt oben** in der Now-Playing-Leiste.
  Pusht der Sender ein Bild (ICY `StreamUrl`), klappt es **smooth darunter** auf
  und schiebt den Rest nach unten (Fußleiste bleibt). Ohne Cover bleibt nur das
  Logo. Akzeptiert werden Cover-URLs **mit und ohne Datei-Endung** (der Proxy
  prüft per Content-Type, ob es wirklich ein Bild ist).
  > Hinweis: **Die meisten Internet-Radio-Sender pushen gar kein Cover** im
  > Stream (Test: ~1 von 22). Sender wie SomaFM oder Radio Paradise tun es —
  > viele andere nicht; dann gibt es naturgemäß nur das Senderlogo.

> Logos & Cover werden über `server.py` geladen (`/api/img`) — gleiche Herkunft,
> umgeht Mixed-Content und toleriert eine falsch gestellte Pi-Uhr (häufigster
> Grund, warum sonst keine Bilder laden). **Wenn keine Bilder kommen:** läuft
> `server.py`? Hat der Pi Internet & die richtige Uhrzeit (`date` prüfen)?
- **Laufschrift** (Marquee) bei langem Sendernamen *und* Titel.
- **Auto-Reconnect:** Bricht der Stream ab, verbindet die App automatisch neu
  (Backoff 2→4→8…→30 s). Kommt die Verbindung laut Status-Graph zurück, wird
  **sofort** neu verbunden. Bewusstes Pausieren/Stoppen löst keinen Reconnect aus.

**Sender löschen:** eine Sender-Zeile **nach links wischen** → rote Mülltonne
erscheint; auf die rote Fläche tippen (oder weit wischen) löscht den Sender.

**🔍 Sender suchen** (Button unten) durchsucht das große Verzeichnis
**radio-browser.info**:
- **Genre-Chips** antippen (Ambient, Sleep, Lo-Fi, Jazz, Klassik, Natur …) –
  *ohne Tippen*, ideal für Touch.
- Oder einen **Namen/Begriff** ins Suchfeld eingeben.
- **Treffer antippen → spielt nur ab** (ohne ihn zu speichern).
- Soll der Sender in die Liste, mit dem **„+"** rechts hinzufügen.

> **Eigene Bildschirmtastatur:** Tippt man ins Suchfeld, erscheint eine
> eingebaute, dunkle/augenschonende On-Screen-Tastatur mit großen Tasten
> (keine System-Tastatur nötig). Unten links das **Layout umschalten:
> DE / EN / HR (kroatisch)**. „Suchen" startet die Suche. Die Genre-Chips
> brauchen ohnehin keine Tastatur.

> Sender werden ausschließlich über die Suche gefunden und mit „+" zur Liste
> hinzugefügt. (Einen ganz bestimmten Sender findest du meist über die
> Namenssuche im Suchfeld.)

## Globale Leiste unten

- **⏱ Timer** — tippen schaltet durch: aus → 15 → 30 → 45 → 60 → 90 min.
  Nach Ablauf wird **sanft über 30 s ausgeblendet** und alles gestoppt.
- **🌙 Warm** — **Nachtlicht / Blaulichtfilter**: legt einen warmen Schleier
  über alles und nimmt den Blauanteil raus (augenschonend am Abend). Schnell
  ein/aus; Intensität (Aus/Sanft/Mittel/Stark) unter **Einstellungen → Anzeige**.
- **🕐 Uhr** — zeigt einen **Uhr-Screensaver** mit **wählbarem Hintergrund-Effekt**
  (Aurora / Nebel / Sterne / Aus), rein CSS/GPU, `prefers-reduced-motion`-Fallback.
  Große Uhr + Datum, tippen zum Aufwecken. Erscheint **auch automatisch nach
  Inaktivität** (Zeit einstellbar). Effekt & ob er **auch im App-Hintergrund**
  läuft, wählst du unter **Einstellungen → Anzeige**.
- **⏹ Aus** — stoppt alle Sounds und das Radio.

Einstellungen (Lautstärken, aktive Sounds, Sender) werden lokal gespeichert.

### 📶 Statusleiste (oben links)
- **WLAN-Signalbalken** (4 Balken, Farbe nach Stärke; rot = keine Verbindung).
- **Connectivity-Graph** daneben: rollender Verlauf der Erreichbarkeit –
  grüne Balken = online (Höhe = Latenz), **rote Balken = Übertragungsunterbrechung**.
- **Lautsprecher-Akku**: ist ein Bluetooth-Lautsprecher (★) verbunden, zeigt eine
  Batterie + Prozent dessen Akkustand (über BlueZ/UPower, nur Pi).
- Aktualisiert über `server.py` (`/api/net`, `/api/bt/battery`).

### 🔊 Lautstärke-HUD (Apple-Stil)
Drückt man die **Lautstärke-Tasten am Bluetooth-Lautsprecher**, erscheint kurz
ein elegantes Glas-Overlay mit Balken & Prozent (erkennt externe Änderungen der
System-Lautstärke über `pactl`, nur Pi).

### ⚙️ Einstellungen
Über das Zahnrad oben rechts — Squeezebox-Stil (Drill-down mit ‹-Zurück):

- **Netzwerk** — aktuelle Verbindung (SSID, IP, Signal, Hostname) **plus
  „🔍 Netze suchen"**: listet WLANs mit Signalstärke & Schloss-Symbol; antippen,
  Passwort über die Bildschirmtastatur eingeben und **verbinden** (via `nmcli`,
  nur Pi).
- **Bluetooth** — Lautsprecher **suchen, koppeln, verbinden/trennen, entfernen**
  (über `bluetoothctl`, nur Pi). Mit ★ einen **Standard-Lautsprecher** wählen:
  der wird **automatisch verbunden, sobald etwas spielt**, und **nach 1 Minute
  Stille getrennt** (weckt den Lautsprecher bzw. lässt ihn abschalten).
- **Audio-Ausgang** — Ausgabegerät wählen: **Klinke / HDMI / Bluetooth**
  (über `pactl`/PipeWire) + **Lautstärke-Limit**.
- **Wecker** — Sunrise-Alarm: zur eingestellten Zeit startet ein Aufwach-Klang
  (Vögel/Wellen/Bach/Regen/Radio) und wird über ~3 min **sanft lauter**.
- **Datum & Zeit** — Uhrzeit/Datum, **Zeitzone wählen**, **NTP einschalten**
  (wichtig gegen das Bilder-/Zertifikatsproblem bei falscher Uhr).
- **Anzeige** — Bildschirmschoner-Zeit, **Nachtlicht-Stärke**, **Hintergrund-Effekt**
  (Aus / Aurora / Nebel / Lava / Plasma / Bokeh / Atem / Sterne), **Bewegung**
  (Aus / Langsam / Normal / Schnell) und ob der Effekt auch im App-Hintergrund
  läuft; Screensaver sofort starten.
- **System** — App-Version, Hostname, OS, **Pi-Status** (CPU-Temperatur,
  Auslastung, Speicher, Datenträger, Laufzeit); **App neu laden**, **Pi neu
  starten/herunterfahren**, **Nach Updates suchen** (git pull), **Werkseinstellungen**.
- **Über** — Version & Info.

> Die echten Systeminfos, Bluetooth und Neustart/Herunterfahren brauchen
> `server.py` (Browser allein darf WLAN/IP/Bluetooth nicht lesen).
> `start-kiosk.sh` startet das automatisch. Für Neustart/Herunterfahren einmalig
> passwortloses `shutdown` erlauben (Befehl steht in `start-kiosk.sh`).

> **Bluetooth-Audio:** Sobald ein Lautsprecher verbunden ist, leitet Pi OS
> (PipeWire) den Ton automatisch dorthin. BlueZ/`bluetoothctl` ist auf Pi OS
> vorinstalliert. Klappt das Pairing nicht, den Lautsprecher in den
> Pairing-Modus bringen und „Lautsprecher suchen" erneut drücken.

## Testen am PC (Windows)

Im Ordner den lokalen Dienst starten (dann funktionieren auch Radio und das
Einstellungen-Menü):
```
python server.py 8080
```
Dann `http://localhost:8080` öffnen. (Der erste Tap aktiviert den Ton —
Browser-Vorgabe.)

## Auf dem Raspberry Pi (Kiosk)

1. Ordner auf den Pi kopieren (z.B. `/home/pi/sleep-radio`).
2. `chmod +x start-kiosk.sh`
3. Test: `./start-kiosk.sh`
4. Autostart einrichten — siehe `../blanket-kiosk-setup.md`, **Schritt 4**.
   Dort statt der Blanket-Zeile eintragen:
   `/home/pi/sleep-radio/start-kiosk.sh &`
5. Display-Config (Auflösung/Hochformat) und Auto-Login: ebenfalls in
   `../blanket-kiosk-setup.md` (Schritte 2b und 5).

## Dateien

| Datei            | Zweck                                        |
|------------------|----------------------------------------------|
| `index.html`     | Aufbau (Tabs, Views, Leisten, Einstellungen) |
| `style.css`      | Squeezebox-Theme, für 400 px optimiert       |
| `app.js`         | Sound-Engine, Radio, Timer, Einstellungen    |
| `server.py`      | Lokaler Dienst: liefert App + /api (Netzwerk, Power) |
| `start-kiosk.sh` | Startet server.py + Chromium-Kiosk           |

## Eigene Sounddateien (optional, später)

Aktuell sind alle Sounds synthetisch. Wer echte Aufnahmen (z.B. Kaminfeuer,
Vögel) will: in `app.js` in `SOUND_DEFS` einen Eintrag mit einem
`AudioBufferSourceNode` ergänzen, der eine Datei lädt — sag Bescheid, dann baue
ich das ein.
