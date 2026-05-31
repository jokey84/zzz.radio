#!/usr/bin/env bash
# ============================================================================
# Schlaf-Radio im Chromium-Kiosk starten (Raspberry Pi OS Bookworm, Wayland)
#
# 1) Diesen Ordner auf den Pi kopieren, z.B. nach  /home/pi/sleep-radio
# 2) Ausführbar machen:   chmod +x start-kiosk.sh
# 3) Testen:              ./start-kiosk.sh
# 4) Autostart: diese Datei im Compositor-Autostart eintragen
#    (siehe ../blanket-kiosk-setup.md, Schritt 4 — gleiche Stelle, nur
#     statt Blanket diese Zeile:   /home/pi/sleep-radio/start-kiosk.sh & )
# ============================================================================

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8080

# Lokaler Dienst: liefert die App AUS und stellt /api/system + /api/power bereit
# (für das Einstellungen-Menü: WLAN, IP-Adresse, Neustart/Herunterfahren).
pkill -f "server.py $PORT" 2>/dev/null
( python3 "$DIR/server.py" "$PORT" ) &
sleep 1

# Hinweis: Neustart/Herunterfahren und Zeitzone/NTP im Menü brauchen passwortloses
# sudo. Einmalig einrichten:
#   echo "$USER ALL=(ALL) NOPASSWD: /sbin/shutdown, /usr/bin/timedatectl" | sudo tee /etc/sudoers.d/schlafradio
# Außerdem für die Menü-Funktionen nötig: NetworkManager (nmcli, WLAN),
# PipeWire/pulseaudio-utils (pactl, Audio-Ausgang + Volume-HUD), git (Update),
# upower (BT-Akkustand). Für den BT-Akku ggf. in /etc/bluetooth/main.conf
# "Experimental = true" setzen, falls UPower nichts liefert.

# Bildschirmschoner / Energiesparen aus, damit das Display nicht ausgeht
# (unter X11; unter Wayland via raspi-config "Screen Blanking -> Disable")
command -v xset >/dev/null && { xset s off; xset -dpms; xset s noblank; }

# Chromium im Vollbild-Kiosk auf die App zeigen lassen
CHROME=$(command -v chromium-browser || command -v chromium)
"$CHROME" \
  --kiosk \
  --app="http://localhost:$PORT/index.html" \
  --disable-features=Translate,TranslateUI \
  --lang=de --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000
