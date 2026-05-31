# zzz.radio — Installationsanleitung

Einschlaf-Radio für den Raspberry Pi mit Touch-Display: Einschlaf-Sounds,
Internet-Radio, Wecker, Bluetooth-Lautsprecher u. v. m.

Diese Anleitung führt von „leerer SD-Karte" bis zum fertigen Gerät, das beim
Einschalten direkt in zzz.radio startet. Befehle einfach der Reihe nach
ins Terminal kopieren.

---

## 1. Was du brauchst (Hardware)

| Teil | Empfehlung |
|---|---|
| Rechner | **Raspberry Pi 5** (oder Pi 4, 4 GB) |
| Display | **Waveshare 7.9" HDMI Touch, 400×1280** (HDMI + USB) |
| Speicher | microSD **A2** (32 GB+) oder USB-/NVMe-SSD |
| Ton | USB-Lautsprecher **oder** Bluetooth-Lautsprecher |
| Strom | kräftiges Netzteil (Pi 5: original 5 V / 5 A USB-C) |
| Gehäuse | 3D-gedruckt, mit Lüftungsschlitzen + passivem Kühlkörper |

> Das schwächste Glied ist oft das **Netzteil** – ein zu schwaches verursacht
> Ruckler und Abstürze.

---

## 2. Betriebssystem aufspielen

1. **Raspberry Pi Imager** am PC installieren (raspberrypi.com/software).
2. OS wählen: **Raspberry Pi OS (64-bit, Bookworm) – mit Desktop**.
3. Im Imager unter ⚙ vorab setzen: **WLAN**, **Benutzername/Passwort**,
   **SSH aktivieren**, **Hostname** z. B. `zzzradio`.
4. SD-Karte/SSD flashen, in den Pi stecken, einschalten.
5. Erst einmal komplett aktualisieren:
   ```bash
   sudo apt update && sudo apt full-upgrade -y && sudo reboot
   ```

---

## 3. Display einrichten (400×1280)

Das Waveshare-Panel wird nicht automatisch erkannt – feste Timings eintragen:

```bash
sudo nano /boot/firmware/config.txt
```
Am Ende einfügen:
```ini
hdmi_group=2
hdmi_mode=87
hdmi_timings=400 0 220 32 110 1280 0 10 10 10 0 0 0 60 0 59400000 3
```
Speichern (Strg+O, Enter, Strg+X) und neu starten. Das Bild erscheint im
**Hochformat** – genau richtig für zzz.radio.

> Querformat nur, falls du seitlich montierst: zusätzlich
> `video=HDMI-A-1:400x1280M@60,rotate=90` (dreht Bild **und** Touch zusammen).

**Bildschirm-Abschalten deaktivieren** (sonst geht das Display beim Einschlafen aus):
```bash
sudo raspi-config
```
→ **Display Options → Screen Blanking → Disable** → fertig.

---

## 4. Benötigte Programme installieren

```bash
sudo apt install -y chromium python3 git \
  network-manager pipewire-pulse pulseaudio-utils upower fonts-noto-color-emoji
```
> Heißt das Chromium-Paket „has no installation candidate"? Dann nutzt dein OS
> den alten Namen: `chromium-browser` statt `chromium` installieren. (Das
> `install.sh` erkennt beides automatisch.)

- **chromium** – zeigt die App im Vollbild
- **python3** – der kleine Dienst (`server.py`)
- **network-manager** (`nmcli`) – WLAN scannen/verbinden im Menü
- **pulseaudio-utils** (`pactl`) – Audio-Ausgang umschalten + Lautstärke-HUD
- **upower** – Akkustand des Bluetooth-Lautsprechers
- **fonts-noto-color-emoji** – damit die Emoji-Symbole in der Oberfläche angezeigt werden
- **git** – „Nach Updates suchen"

Optional, falls du im Suchfeld **tippen** willst (Bildschirmtastatur des
Systems – zzz.radio hat aber eine eingebaute, die meist reicht):
```bash
sudo apt install -y onboard
```

---

## 5. zzz.radio auf den Pi kopieren

Den Ordner **`sleep-radio`** (mit `index.html`, `app.js`, `server.py`,
`start-kiosk.sh`, `sounds/` …) auf den Pi bringen und nach `~/zzz.radio` legen.
Drei Wege – einer reicht:

**A) Per USB-Stick:** Ordner auf den Stick kopieren, am Pi:
```bash
cp -r /media/$USER/*/sleep-radio ~/zzz.radio
```

**B) Per SCP vom PC** (im Ordner, der `sleep-radio` enthält):
```bash
scp -r sleep-radio <benutzer>@zzzradio.local:~/zzz.radio
```

**C) Per Git:**
```bash
sudo apt install -y git    # auf Pi OS Lite noch nicht vorinstalliert
git clone https://github.com/jokey84/zzz.radio.git ~/zzz.radio
```

Wichtig: Der **`sounds/`-Ordner mit den `.ogg`-Dateien muss mitkopiert werden** –
die Klänge liegen lokal bei, damit alles offline läuft.

Start-Skript ausführbar machen und testen:
```bash
chmod +x ~/zzz.radio/start-kiosk.sh
~/zzz.radio/start-kiosk.sh
```
Chromium sollte im Vollbild öffnen und zzz.radio zeigen. Mit `Alt+F4` /
Terminal beenden.

---

## 6. Rechte für Menü-Funktionen (einmalig)

Damit **Neustart/Herunterfahren** und **Zeitzone/NTP** aus dem Menü funktionieren,
passwortloses `sudo` für genau diese Befehle erlauben:
```bash
echo "$USER ALL=(ALL) NOPASSWD: /sbin/shutdown, /usr/bin/timedatectl" \
  | sudo tee /etc/sudoers.d/zzzradio
```

(Optional) Für den **Bluetooth-Akku**, falls UPower nichts liefert:
```bash
sudo sed -i 's/#*Experimental = .*/Experimental = true/' /etc/bluetooth/main.conf
sudo systemctl restart bluetooth
```

---

## 7. Automatisch starten (Kiosk)

### 7a. Auto-Login
```bash
sudo raspi-config
```
→ **System Options → Boot / Auto Login → Desktop Autologin**.

### 7b. zzz.radio beim Hochfahren starten
Welcher Compositor läuft? Prüfen:
```bash
echo $XDG_CURRENT_DESKTOP ; ps -e | grep -E 'labwc|wayfire'
```

**Variante labwc** (Pi 5 / neuere Bookworm):
```bash
mkdir -p ~/.config/labwc
echo '/home/'$USER'/zzz.radio/start-kiosk.sh &' >> ~/.config/labwc/autostart
```

**Variante wayfire** (manche Pi-4-Images): in `~/.config/wayfire.ini`:
```ini
[autostart]
zzzradio = /home/<benutzer>/zzz.radio/start-kiosk.sh
```

Neu starten:
```bash
sudo reboot
```
Der Pi bootet jetzt direkt in zzz.radio. 🎉

---

## 8. Erste Schritte im Gerät

- **Sounds-Tab:** Geräusche antippen und mischen (Regen + Kaminfeuer + Vögel …),
  jeder mit eigenem Regler.
- **Radio-Tab:** „🔍 Sender suchen" → Genre antippen → Treffer abspielen,
  mit „+" zur Liste; Sender nach links wischen = löschen.
- **⚙ Einstellungen:**
  - **Netzwerk** – WLAN scannen & verbinden
  - **Bluetooth** – Lautsprecher koppeln, mit ★ als Standard (Auto-Ein/Aus)
  - **Audio-Ausgang** – Klinke / HDMI / Bluetooth wählen
  - **Anzeige** – Bildschirmschoner, Nachtlicht, Hintergrund-Effekte
  - **Wecker** – Sunrise-Alarm
  - **Datum & Zeit** – Zeitzone & NTP (**wichtig**, s. u.)
- **Untere Leiste:** ⏱ Timer · 🌙 Warm (Nachtlicht) · 🕐 Uhr (Screensaver) · ⏹ Aus

---

## 9. Problemlösungen

| Problem | Lösung |
|---|---|
| **Kein/verzerrtes Bild** | `hdmi_timings` aus Schritt 3 prüfen; Reboot |
| **Logos/Cover laden nicht** | Fast immer **falsche Uhrzeit** → Einstellungen → Datum & Zeit → NTP einschalten, oder `date` im Terminal prüfen |
| **Ruckelt / stürzt ab** | Unterspannung: `vcgencmd get_throttled` (≠ 0x0 = schwaches Netzteil/Kabel) |
| **Kein Ton** | Einstellungen → Audio-Ausgang richtiges Gerät wählen |
| **Display geht aus** | Screen Blanking nicht deaktiviert (Schritt 3) |
| **App startet nicht automatisch** | falschen Compositor-Abschnitt in Schritt 7b gewählt |
| **WLAN/BT/Audio im Menü „nur auf dem Pi"** | Pakete aus Schritt 4 fehlen |
| **Sounds fehlen** | `sounds/`-Ordner wurde nicht mitkopiert (Schritt 5) |

---

## 10. Updaten

Wenn per Git installiert: **Einstellungen → System → „Nach Updates suchen"**,
oder am Terminal:
```bash
git -C ~/zzz.radio pull
```
Sonst einfach den `sleep-radio`-Ordner neu kopieren (Schritt 5) und neu starten.

---

Viel Freude mit **zzz.radio** – und gute Nacht. 🌙
