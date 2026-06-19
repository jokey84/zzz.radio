#!/usr/bin/env bash
# Mauszeiger im cage/Wayland-Kiosk ausblenden.
# Trick: ECHTE Cursor-Dateien aus dem vorhandenen Adwaita-Theme nehmen (garantiert
# gültiges Format, das cage sicher lädt) und nur ihre Pixel auf transparent setzen.
# Zusätzlich Adwaita selbst ersetzen, falls cage XCURSOR_THEME ignoriert.
set -e

SRC=/usr/share/icons/Adwaita/cursors
if [ ! -d "$SRC" ]; then
  echo "FEHLER: $SRC fehlt – ohne Adwaita-Theme geht dieser Weg nicht."; exit 1
fi

echo "▶ 1/3  transparente Cursor aus Adwaita erzeugen …"
python3 - "$SRC" <<'PY'
import struct, os, sys
src = sys.argv[1]
dst = os.path.expanduser('~/.icons/zzz-blank/cursors')
os.makedirs(dst, exist_ok=True)

def transparentize(data):
    b = bytearray(data)
    if b[:4] != b'Xcur':
        return None
    ntoc = struct.unpack('<I', b[12:16])[0]
    off = 16; tocs = []
    for _ in range(ntoc):
        t, sub, pos = struct.unpack('<III', b[off:off+12]); off += 12
        tocs.append((t, pos))
    for t, pos in tocs:
        if t == 0xfffd0002 and pos + 36 <= len(b):          # Bild-Chunk
            w, h = struct.unpack('<II', b[pos+16:pos+24])
            ps, pl = pos + 36, w * h * 4
            if ps + pl <= len(b):
                b[ps:ps+pl] = b'\x00' * pl                  # alle Pixel komplett durchsichtig
    return bytes(b)

done = 0
for n in os.listdir(src):
    try:
        data = open(os.path.realpath(os.path.join(src, n)), 'rb').read()
        out = transparentize(data)
        if out:
            open(os.path.join(dst, n), 'wb').write(out); done += 1
    except Exception:
        pass
open(os.path.expanduser('~/.icons/zzz-blank/index.theme'), 'w').write(
    '[Icon Theme]\nName=zzz-blank\nInherits=Adwaita\n')
print('   %d transparente Cursor erzeugt' % done)
PY

echo "▶ 2/3  Adwaita sichern und durch die transparenten ersetzen …"
if [ ! -d "${SRC}.orig" ]; then sudo cp -a "$SRC" "${SRC}.orig"; fi
sudo cp -af "$HOME/.icons/zzz-blank/cursors/." "$SRC/"

echo "▶ 3/3  Launcher-Variablen:"
L=$(find "$HOME" -name launch-cage.sh 2>/dev/null | head -1)
grep -nE 'XCURSOR|WLR_NO|exec cage' "$L" | sed 's/^/   /'
echo
echo "✅ Fertig. Jetzt: sudo reboot"
echo "   (Rückgängig: sudo cp -af ${SRC}.orig/. ${SRC}/ && sudo reboot)"
