#!/usr/bin/env bash
# ============================================================================
# zzz.radio – Installer für Raspberry Pi OS (Lite empfohlen, Bookworm 64-bit)
# Richtet alles ein: Pakete, Display-Timings, Kiosk-Autostart (cage),
# Auto-Login, Rechte fürs Menü. Danach bootet der Pi direkt in zzz.radio.
#
# Aufruf auf dem Pi, IM zzz.radio-Ordner:
#   chmod +x install.sh && ./install.sh
# ============================================================================
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
echo "▶ zzz.radio Installer  (Ordner: $DIR)"

# Git: Ausführbar-Bit nicht als Änderung werten (sonst blockiert es Updates)
git -C "$DIR" config core.fileMode false 2>/dev/null || true

# ---- 1) Pakete -------------------------------------------------------------
echo "▶ Pakete installieren …"
sudo apt update
# Chromium heißt je nach OS unterschiedlich: 'chromium' (Debian/trixie) oder
# 'chromium-browser' (ältere Pi-OS-Versionen)
if apt-cache show chromium >/dev/null 2>&1; then CHROME_PKG=chromium; else CHROME_PKG=chromium-browser; fi
echo "   Chromium-Paket: $CHROME_PKG"
sudo apt install -y \
  cage "$CHROME_PKG" python3 git \
  network-manager pipewire-pulse pulseaudio-utils upower \
  fonts-dejavu-core fonts-noto-color-emoji
fc-cache -f >/dev/null 2>&1 || true   # Emoji-Schrift sofort verfügbar machen

# ---- 2) Display: Waveshare 7.9" 400x1280 + TOUCH ---------------------------
# ROTATE: 0 = Hochformat (Standard). 90/180/270, falls anders montiert.
#   Aufruf z.B.:  ROTATE=90 ./install.sh
ROTATE="${ROTATE:-0}"
CFG=/boot/firmware/config.txt
[ -f "$CFG" ] || CFG=/boot/config.txt

if ! grep -q "hdmi_timings=400 0 220" "$CFG"; then
  echo "▶ Display-Timings (400x1280) eintragen …"
  sudo tee -a "$CFG" >/dev/null <<'EOF'

# zzz.radio – Waveshare 7.9" HDMI 400x1280
hdmi_group=2
hdmi_mode=87
hdmi_timings=400 0 220 32 110 1280 0 10 10 10 0 0 0 60 0 59400000 3
EOF
fi

# Drehung des Bildes (nur falls gewünscht)
if [ "$ROTATE" != "0" ] && ! grep -q "video=HDMI-A-1:400x1280" "$CFG"; then
  echo "▶ Bild um ${ROTATE}° drehen …"
  echo "video=HDMI-A-1:400x1280M@60,rotate=$ROTATE" | sudo tee -a "$CFG" >/dev/null
fi

# TOUCH: Kalibrierung passend zur Drehung (Touch folgt der Drehung sonst NICHT)
echo "▶ Touch einrichten …"
TOUCHRULE=/etc/udev/rules.d/99-zzzradio-touch.rules
case "$ROTATE" in
  90)  MAT="0 -1 1 1 0 0" ;;
  180) MAT="-1 0 1 0 -1 1" ;;
  270) MAT="0 1 0 -1 0 1" ;;
  *)   MAT="" ;;
esac
if [ -n "$MAT" ]; then
  echo "SUBSYSTEM==\"input\", ENV{ID_INPUT_TOUCHSCREEN}==\"1\", ENV{LIBINPUT_CALIBRATION_MATRIX}=\"$MAT\"" \
    | sudo tee "$TOUCHRULE" >/dev/null
  sudo udevadm control --reload 2>/dev/null || true
else
  sudo rm -f "$TOUCHRULE" 2>/dev/null || true   # Hochformat: keine Matrix nötig
fi

# ---- 3) Bildschirm nicht abdunkeln -----------------------------------------
CMD=/boot/firmware/cmdline.txt
[ -f "$CMD" ] || CMD=/boot/cmdline.txt
grep -q "consoleblank=0" "$CMD" || sudo sed -i 's/$/ consoleblank=0/' "$CMD"

# ---- 4) Rechte fürs Menü (Neustart/Herunterfahren, Zeitzone/NTP) -----------
echo "▶ sudo-Rechte fürs Menü …"
echo "$USER_NAME ALL=(ALL) NOPASSWD: /sbin/shutdown, /usr/bin/timedatectl" \
  | sudo tee /etc/sudoers.d/zzzradio >/dev/null

# ---- 5) Gruppen für GPU/Touch unter cage -----------------------------------
sudo usermod -aG video,render,input "$USER_NAME" || true

# ---- 6) Kiosk-Launcher (cage startet Chromium im Vollbild) -----------------
echo "▶ Kiosk-Launcher erstellen …"
cat > "$DIR/launch-cage.sh" <<EOF
#!/usr/bin/env bash
pkill -f "server.py 8080" 2>/dev/null || true
python3 "$DIR/server.py" 8080 &
sleep 1
CHROME="\$(command -v chromium || command -v chromium-browser)"
exec cage -- "\$CHROME" \\
  --kiosk --app=http://localhost:8080/index.html \\
  --enable-features=UseOzonePlatform --ozone-platform=wayland \\
  --noerrdialogs --disable-infobars --disable-translate --disable-pinch \\
  --overscroll-history-navigation=0 \\
  --autoplay-policy=no-user-gesture-required \\
  --check-for-update-interval=31536000
EOF
chmod +x "$DIR/launch-cage.sh"

# ---- 7) Konsolen-Auto-Login auf tty1 ---------------------------------------
echo "▶ Auto-Login aktivieren …"
sudo raspi-config nonint do_boot_behaviour B2 || true

# ---- 8) Beim Login auf tty1 zzz.radio starten ------------------------------
PROFILE="$HOME/.bash_profile"
LINE="[ \"\$(tty)\" = \"/dev/tty1\" ] && exec \"$DIR/launch-cage.sh\""
grep -qxF "$LINE" "$PROFILE" 2>/dev/null || echo "$LINE" >> "$PROFILE"

echo ""
echo "✅ Fertig!  Jetzt neu starten:   sudo reboot"
echo "   Danach bootet der Pi direkt in zzz.radio."
echo "   (Bluetooth-Akku ohne Wert? In /etc/bluetooth/main.conf 'Experimental = true' setzen.)"
