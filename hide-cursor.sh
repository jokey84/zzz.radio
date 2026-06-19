#!/usr/bin/env bash
# Blendet den Mauszeiger im cage/Wayland-Kiosk zuverlässig aus:
#   1) transparentes XCursor-Theme (kein Paket nötig)
#   2) Software-Cursor erzwingen (Pi-GPU zeichnet sonst einen Hardware-Cursor,
#      den das Theme nicht überdeckt)
# Danach: sudo reboot
set -e

echo "▶ 1/3  transparentes Cursor-Theme bauen …"
python3 - <<'PY'
import struct, os
head  = b'Xcur' + struct.pack('<III', 16, 0x00010000, 1)
toc   = struct.pack('<III', 0xfffd0002, 24, 28)
chunk = struct.pack('<IIIIIIIII', 36, 0xfffd0002, 24, 1, 1, 1, 0, 0, 0) + struct.pack('<I', 0)
data  = head + toc + chunk
d = os.path.expanduser('~/.icons/zzz-blank/cursors')
os.makedirs(d, exist_ok=True)
names = ['left_ptr','default','arrow','top_left_arrow','hand','hand1','hand2','pointer',
         'pointing_hand','xterm','text','ibeam','watch','wait','progress','crosshair','cross',
         'fleur','move','grab','grabbing','question_arrow','sb_h_double_arrow','sb_v_double_arrow',
         'bottom_right_corner','bottom_left_corner','top_right_corner','top_left_corner',
         'left_side','right_side','top_side','bottom_side','X_cursor','dotbox']
for n in names:
    p = os.path.join(d, n)
    try: os.remove(p)
    except OSError: pass
    open(p, 'wb').write(data)
open(os.path.expanduser('~/.icons/zzz-blank/index.theme'), 'w').write('[Icon Theme]\nName=zzz-blank\nInherits=core\n')
print('   Theme: %d transparente Cursor in %s' % (len(names), d))
PY

echo "▶ 2/3  Launcher patchen …"
L=$(find "$HOME" -name launch-cage.sh 2>/dev/null | head -1)
if [ -z "$L" ]; then echo "   FEHLER: launch-cage.sh nicht gefunden"; exit 1; fi
echo "   Launcher: $L"
sed -i '/XCURSOR_THEME/d; /XCURSOR_SIZE/d; /XCURSOR_PATH/d; /WLR_NO_HARDWARE_CURSORS/d' "$L"
sed -i "/exec cage/i export XCURSOR_PATH=$HOME/.icons:/usr/share/icons\nexport XCURSOR_THEME=zzz-blank\nexport XCURSOR_SIZE=24\nexport WLR_NO_HARDWARE_CURSORS=1" "$L"

echo "▶ 3/3  Kontrolle:"
grep -nE 'XCURSOR|WLR_NO|exec cage' "$L" | sed 's/^/   /'
echo
echo "✅ Fertig. Jetzt:  sudo reboot"
