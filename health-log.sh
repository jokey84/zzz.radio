#!/usr/bin/env bash
# Schreibt jede Minute eine Zeile mit Speicher / Temperatur / Stromdrosselung.
# Nach einem Einfrieren (Watchdog rebootet) zeigt das LOG-ENDE die Ursache:
#   - mem steigt Richtung 100 % / swap voll  -> Speicher-Leck (OOM)
#   - throttled != 0x0                        -> Netzteil/Unterspannung
#   - temp > ~80°C                            -> Überhitzung
#
# Einrichten (einmalig):   bash health-log.sh install
# Auslesen nach Hänger:    tail -n 40 ~/zzz-health.log
LOG="$HOME/zzz-health.log"

if [ "$1" = "install" ]; then
  S="$(cd "$(dirname "$0")" && pwd)/health-log.sh"
  ( crontab -l 2>/dev/null | grep -v 'health-log.sh'; echo "* * * * * bash $S" ) | crontab -
  echo "✅ Health-Log aktiv (jede Minute) -> $LOG"
  echo "   Nach einem Einfrieren:  tail -n 40 $LOG   (und mir schicken)"
  exit 0
fi

ts=$(date '+%F %T')
mem=$(free -m  | awk '/Mem:/ {printf "%d/%dMB(%.0f%%)",$3,$2,($2?($3/$2*100):0)}')
swap=$(free -m | awk '/Swap:/{printf "%d/%dMB",$3,$2}')
temp=$(vcgencmd measure_temp 2>/dev/null | sed 's/temp=//')
thr=$(vcgencmd get_throttled 2>/dev/null | sed 's/.*=//')
top=$(ps -eo comm,rss --sort=-rss 2>/dev/null | awk 'NR==2{printf "%s=%dMB",$1,$2/1024}')
echo "$ts mem=$mem swap=$swap temp=${temp:-n/a} throttled=${thr:-n/a} top=$top" >> "$LOG"
# FIFO: über 10000 Zeilen (~1 Woche bei 1/min) auf die letzten 8000 kürzen
[ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 10000 ] && { tail -n 8000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"; }
