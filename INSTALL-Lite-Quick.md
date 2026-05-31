# zzz.radio — Schnellinstallation (Raspberry Pi OS **Lite**)

Schlanke Variante ohne Desktop: bootet schneller, weniger Ballast. Der Kiosk
läuft über **cage** (Single-App-Wayland). Das `install.sh` macht alles.

⏱ Dauer: ~15 Minuten.

---

## 1. Pi OS Lite flashen
Mit dem **Raspberry Pi Imager**:
- OS: **Raspberry Pi OS Lite (64-bit, Bookworm)**
- Unter ⚙ setzen: **WLAN**, **Benutzer/Passwort**, **SSH aktivieren**,
  Hostname z. B. `zzzradio`.
- Karte/SSD flashen, in den Pi, einschalten.

## 2. Per SSH verbinden
Vom PC:
```bash
ssh <benutzer>@zzzradio.local
```

## 3. zzz.radio holen
**Per Git** (empfohlen):
```bash
git clone https://github.com/<DEIN-GITHUB>/zzz.radio.git ~/zzz.radio
```
*oder* den Ordner per USB/`scp` nach `~/zzz.radio` kopieren
(**inkl. `sounds/`-Ordner!**).

## 4. Installer ausführen
```bash
cd ~/zzz.radio
chmod +x install.sh
./install.sh
```
Das Script installiert Pakete (chromium, cage, python3, nmcli, pactl, upower,
git), trägt die **Display-Timings (400×1280)** ein, richtet **Touch** ein
(inkl. Zugriffsrechte), aktiviert **Auto-Login** + **Kiosk-Autostart** und setzt
die nötigen **sudo-Rechte**.

> **Anders montiert?** Für gedrehten Einbau einfach mit Drehung aufrufen –
> das dreht **Bild und Touch zusammen**:
> ```bash
> ROTATE=90 ./install.sh    # oder 180 / 270
> ```

## 5. Neu starten
```bash
sudo reboot
```
Der Pi bootet direkt in **zzz.radio**. 🌙

---

## Danach

- **WLAN ändern:** ⚙ → Netzwerk → „Netze suchen".
- **Bluetooth-Lautsprecher:** ⚙ → Bluetooth → koppeln, mit ★ als Standard.
- **Falsche Uhr → keine Logos/Cover:** ⚙ → Datum & Zeit → NTP einschalten.
- **Update:** ⚙ → System → „Nach Updates suchen" (oder `git -C ~/zzz.radio pull`).

## Wenn etwas klemmt

| Problem | Lösung |
|---|---|
| Schwarzes/verzerrtes Bild | Reboot; sonst `hdmi_timings` in `/boot/firmware/config.txt` prüfen |
| Nichts startet nach Reboot | `cat ~/.bash_profile` – endet die letzte Zeile auf `launch-cage.sh`? |
| Kein Ton | ⚙ → Audio-Ausgang richtiges Gerät wählen |
| Touch reagiert nicht | Nutzer in Gruppe `input`? (`groups`) – sonst `install.sh` erneut |
| Bluetooth-Akku leer/`--` | `sudo sed -i 's/#*Experimental = .*/Experimental = true/' /etc/bluetooth/main.conf && sudo systemctl restart bluetooth` |

> Die ausführliche Variante (mit Desktop-OS, Schritt-für-Schritt) steht in
> **INSTALL.md**.
