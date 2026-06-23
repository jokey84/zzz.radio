#!/usr/bin/env bash
# Loggt Bluetooth- UND WLAN-Störungen (Abbrüche, Disconnect-Gründe, Kernel-Meldungen),
# um Aussetzer einzuordnen. Hinweis: "Deauth"-Angriffe betreffen WLAN, nicht Bluetooth –
# darum wird beides aufgezeichnet. Häufigste echte Ursache: 2,4-GHz-Interferenz/Überlastung.
#
# Einrichten (läuft danach dauerhaft als Dienst):  bash bt-monitor.sh install
# Auslesen:                                         tail -n 100 ~/zzz-link.log
# Beenden:                                          sudo systemctl disable --now zzzradio-linkmon

LOG="${LOGFILE:-$HOME/zzz-link.log}"

if [ "$1" = "install" ]; then
  S="$(cd "$(dirname "$0")" && pwd)/bt-monitor.sh"
  sudo tee /etc/systemd/system/zzzradio-linkmon.service >/dev/null <<EOF
[Unit]
Description=zzz.radio Link-Monitor (BT/WLAN-Stoerungen loggen)
After=bluetooth.service network.target

[Service]
Environment=LOGFILE=$HOME/zzz-link.log
ExecStart=/usr/bin/env bash "$S" run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now zzzradio-linkmon.service
  echo "✅ Link-Monitor läuft -> $HOME/zzz-link.log"
  echo "   Auslesen:  tail -n 100 $HOME/zzz-link.log"
  exit 0
fi

if [ "$1" = "run" ]; then
  last="$(date '+%Y-%m-%d %H:%M:%S')"
  prev="-"
  while true; do
    now="$(date '+%Y-%m-%d %H:%M:%S')"
    # 1) Kernel-Meldungen zu Bluetooth (inkl. "continuation frame", Link-Loss)
    journalctl -k --since "$last" -o short-iso --no-pager 2>/dev/null \
      | grep -iE 'blue|hci[0-9]|continuation|link.?loss' >> "$LOG" 2>/dev/null
    # 2) bluetoothd: Verbinden/Trennen/Profil/Fehler
    journalctl -u bluetooth --since "$last" -o short-iso --no-pager 2>/dev/null \
      | grep -iE 'disconnect|connect|profile|fail|error|reason' >> "$LOG" 2>/dev/null
    # 3) WLAN: Deauth/Disconnect mit Grund (wpa_supplicant / NetworkManager)
    journalctl --since "$last" -o short-iso --no-pager 2>/dev/null \
      | grep -iE 'deauth|disassoc|CTRL-EVENT-DISCONNECTED|reason=|beacon loss|nl80211.*del' >> "$LOG" 2>/dev/null
    last="$now"

    # 4) Zustand der verbundenen BT-Geräte (Übergänge protokollieren)
    conn=""
    for m in $(bluetoothctl devices 2>/dev/null | awk '{print $2}'); do
      if bluetoothctl info "$m" 2>/dev/null | grep -q 'Connected: yes'; then
        nm=$(bluetoothctl info "$m" 2>/dev/null | awk -F': ' '/Name:/{print $2; exit}')
        conn="$conn ${nm:-$m}"
      fi
    done
    n=$(printf '%s' "$conn" | wc -w)
    if [ "$n" != "$prev" ]; then
      echo "$now  [STATE] BT verbunden: $n -$conn" >> "$LOG"
      prev="$n"
    fi
    # 5) WLAN-Signal + Kurzstatus
    sig=$(awk 'NR==3{print $3}' /proc/net/wireless 2>/dev/null)
    echo "$now  [RF] wlan_signal=${sig:-?} bt_connected=$n" >> "$LOG"

    # Log begrenzen
    if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 6000 ]; then
      tail -n 4000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
    fi
    sleep 20
  done
fi

echo "Aufruf:  bash bt-monitor.sh install     |     Auslesen:  tail -n 100 $LOG"
