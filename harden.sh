#!/usr/bin/env bash
# Raspberry Pi gegen komplettes Einfrieren absichern:
#   1) Hardware-Watchdog -> bei einem Hänger automatischer Reboot (kein Strom-aus mehr nötig)
#   2) zram-Swap        -> weniger Out-of-Memory-Einfrieren (Chromium über Tage)
# Danach: sudo reboot
set -e

# Boot-Konfiguration finden (neuer Pfad zuerst)
CFG=/boot/firmware/config.txt; [ -f "$CFG" ] || CFG=/boot/config.txt

echo "▶ 1/3  Hardware-Watchdog aktivieren …"
grep -q '^dtparam=watchdog=on' "$CFG" 2>/dev/null || echo 'dtparam=watchdog=on' | sudo tee -a "$CFG" >/dev/null
sudo mkdir -p /etc/systemd/system.conf.d
sudo tee /etc/systemd/system.conf.d/zzzradio-watchdog.conf >/dev/null <<'EOF'
[Manager]
# systemd pingt den Hardware-Watchdog; bleibt das System stehen, rebootet die HW nach ~15 s
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
EOF

echo "▶ 2/3  zram-Swap einrichten …"
sudo apt-get install -y zram-tools >/dev/null 2>&1 || echo "   (zram-tools nicht installierbar – übersprungen)"
if [ -f /etc/default/zramswap ]; then
  sudo sed -i 's/^#\?ALGO=.*/ALGO=zstd/'   /etc/default/zramswap
  sudo sed -i 's/^#\?PERCENT=.*/PERCENT=50/' /etc/default/zramswap
  grep -q '^ALGO='    /etc/default/zramswap || echo 'ALGO=zstd'   | sudo tee -a /etc/default/zramswap >/dev/null
  grep -q '^PERCENT=' /etc/default/zramswap || echo 'PERCENT=50'  | sudo tee -a /etc/default/zramswap >/dev/null
  sudo systemctl restart zramswap 2>/dev/null || true
fi

echo "▶ 3/3  Status:"
echo -n "   Watchdog-Gerät:  "; ls /dev/watchdog* 2>/dev/null || echo '(erst nach Reboot vorhanden)'
echo -n "   Drosselung:      "; vcgencmd get_throttled 2>/dev/null || echo 'n/a'
echo    "                    (0x0 = ok; alles andere = Netzteil/Unterspannung-Problem!)"
echo -n "   Temperatur:      "; vcgencmd measure_temp 2>/dev/null || echo 'n/a'
echo
echo "✅ Fertig. Jetzt: sudo reboot"
echo "   Danach startet sich der Pi bei einem Hänger selbst neu, statt dauerhaft zu stehen."
