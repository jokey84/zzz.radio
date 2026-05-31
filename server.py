#!/usr/bin/env python3
# ============================================================================
# Schlaf-Radio – lokaler Dienst
# Liefert die statischen Dateien AUS und bietet zwei API-Endpunkte:
#   GET  /api/system  -> Hostname, IP, WLAN-SSID, Signal, MAC, OS, Laufzeit
#   POST /api/power   -> {"action":"reboot"|"shutdown"}  (nur unter Linux/Pi)
#
# Start:   python3 server.py [PORT]      (Standard-Port 8080)
# ============================================================================
import http.server, json, os, platform, re, socket, ssl, subprocess, sys, threading, time, uuid
import urllib.request
from urllib.parse import urlparse, parse_qs

DIR  = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
IS_LINUX = platform.system() == 'Linux'
MAC_RE = re.compile(r'^[0-9A-Fa-f:]{17}$')


def sh(cmd, timeout=3):
    """Befehl ausführen, stdout zurück oder '' bei Fehler."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout).stdout.strip()
    except Exception:
        return ''


def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return ''
    finally:
        s.close()


def get_ssid():
    if IS_LINUX:
        ssid = sh(['iwgetid', '-r'])
        if ssid:
            return ssid
        for line in sh(['nmcli', '-t', '-f', 'active,ssid', 'dev', 'wifi']).splitlines():
            if line.startswith('yes:'):
                return line.split(':', 1)[1]
    elif platform.system() == 'Windows':
        for line in sh(['netsh', 'wlan', 'show', 'interfaces']).splitlines():
            line = line.strip()
            if line.startswith('SSID') and not line.startswith('BSSID'):
                return line.split(':', 1)[1].strip()
    return ''


def get_signal():
    if IS_LINUX:
        for line in sh(['nmcli', '-t', '-f', 'active,signal', 'dev', 'wifi']).splitlines():
            if line.startswith('yes:'):
                return line.split(':', 1)[1]
    elif platform.system() == 'Windows':
        for line in sh(['netsh', 'wlan', 'show', 'interfaces']).splitlines():
            if 'Signal' in line:
                return line.split(':', 1)[1].strip().replace('%', '')
    return ''


def get_mac():
    m = uuid.getnode()
    return ':'.join('%02X' % ((m >> e) & 0xff) for e in range(40, -1, -8))


def get_uptime():
    if IS_LINUX:
        try:
            with open('/proc/uptime') as f:
                secs = int(float(f.read().split()[0]))
            h, m = secs // 3600, (secs % 3600) // 60
            return f'{h} h {m} min'
        except Exception:
            return ''
    return ''


def _read_exact(resp, n):
    """Genau n Bytes lesen (Sockets liefern oft weniger pro read)."""
    buf = b''
    while len(buf) < n:
        chunk = resp.read(n - len(buf))
        if not chunk:
            break
        buf += chunk
    return buf


def now_playing(url):
    """Aktuellen Titel (ICY StreamTitle) + optionales Cover (StreamUrl) auslesen."""
    empty = {'title': '', 'art': ''}
    if not url or not url.lower().startswith(('http://', 'https://')):
        return empty
    req = urllib.request.Request(url, headers={
        'Icy-MetaData': '1',
        'User-Agent': 'SchlafRadio/1.0',
    })
    try:
        resp = urllib.request.urlopen(req, timeout=6)
    except Exception:
        return empty
    try:
        metaint = resp.headers.get('icy-metaint')
        if not metaint:
            return empty
        _read_exact(resp, int(metaint))          # Audio bis zum Metadaten-Block überspringen
        length = resp.read(1)
        if not length:
            return empty
        meta = _read_exact(resp, length[0] * 16).decode('utf-8', 'ignore')
        tm = re.search(r"StreamTitle='(.*?)';", meta)
        um = re.search(r"StreamUrl='(.*?)';", meta)
        title = tm.group(1).strip() if tm else ''
        art = um.group(1).strip() if um else ''
        # jede http(s)-URL als möglichen Cover-Link zulassen;
        # ob es WIRKLICH ein Bild ist, prüft der Proxy per Content-Type.
        if art and not re.match(r'^https?://', art, re.I):
            art = ''
        return {'title': title, 'art': art}
    except Exception:
        return empty
    finally:
        try:
            resp.close()
        except Exception:
            pass


# ---- Netz: Signalstärke + Erreichbarkeit (für Statusleiste/Graph) ----------
def signal_pct():
    """WLAN-Signal in % (Linux schnell über /proc/net/wireless)."""
    if IS_LINUX:
        try:
            with open('/proc/net/wireless') as f:
                for line in f.readlines()[2:]:
                    p = line.split()
                    if len(p) >= 3:
                        return int(min(100, float(p[2].rstrip('.')) / 70 * 100))
        except Exception:
            pass
    s = get_signal()
    try:
        return int(s)
    except Exception:
        return None


def net_status():
    """Aktueller Netz-Sample: online + Latenz + Signal."""
    online, latency = False, None
    t = time.time()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1.5)
        s.connect(('8.8.8.8', 53))
        s.close()
        online = True
        latency = int((time.time() - t) * 1000)
    except Exception:
        online = False
    return {'online': online, 'latency': latency, 'signal': signal_pct()}


# ---- Bluetooth (BlueZ / bluetoothctl, nur Linux) ---------------------------
def bt_available():
    return IS_LINUX and bool(sh(['which', 'bluetoothctl']))


def valid_mac(m):
    return bool(m and MAC_RE.match(m))


def bt_list():
    """Bekannte Geräte mit Status (gekoppelt/verbunden)."""
    devices = []
    for line in sh(['bluetoothctl', 'devices']).splitlines():
        parts = line.split(' ', 2)
        if len(parts) >= 3 and parts[0] == 'Device':
            mac, name = parts[1], parts[2]
            info = sh(['bluetoothctl', 'info', mac])
            nm = re.search(r'(?m)^\s*Name:\s*(.+?)\s*$', info)
            al = re.search(r'(?m)^\s*Alias:\s*(.+?)\s*$', info)
            friendly = (nm.group(1) if nm else '') or (al.group(1) if al else '') or name
            bm = re.search(r'Battery Percentage:.*\((\d+)\)', info)
            devices.append({
                'mac': mac, 'name': friendly,
                'paired':    'Paired: yes' in info,
                'connected': 'Connected: yes' in info,
                'battery':   int(bm.group(1)) if bm else None,
            })
    return devices


def bt_battery(mac):
    """Akkustand eines BT-Geräts (BlueZ-Info, sonst UPower)."""
    if not (IS_LINUX and valid_mac(mac)):
        return None
    m = re.search(r'Battery Percentage:.*\((\d+)\)', sh(['bluetoothctl', 'info', mac]))
    if m:
        return int(m.group(1))
    macu = mac.replace(':', '_')
    for line in sh(['upower', '-e']).splitlines():
        if macu in line:
            mm = re.search(r'percentage:\s*(\d+)%', sh(['upower', '-i', line.strip()]))
            if mm:
                return int(mm.group(1))
    return None


def sink_volume():
    """Lautstärke des Standard-Ausgangs in % (für das Volume-HUD)."""
    if not IS_LINUX:
        return None
    m = re.search(r'(\d+)%', sh(['pactl', 'get-sink-volume', '@DEFAULT_SINK@']))
    return int(m.group(1)) if m else None


def bt_scan(timeout=12):
    sh(['bluetoothctl', 'power', 'on'])
    sh(['bluetoothctl', '--timeout', str(timeout), 'scan', 'on'], timeout=timeout + 5)
    return bt_list()


BT_LOG = '/tmp/zzzradio-bt.log'

def _btlog(text):
    try:
        with open(BT_LOG, 'a') as f:
            f.write(text)
    except Exception:
        pass

def bt_log_read():
    try:
        with open(BT_LOG) as f:
            return f.read()[-6000:]
    except Exception:
        return '(noch kein Pairing-Log – erst einen Koppel-Versuch starten)'

def bt_pair(mac):
    """Koppeln in EINER bluetoothctl-Sitzung mit Agent. Gibt {ok, log} zurück.
    Vollständiges Protokoll landet in BT_LOG. stdout wird laufend abgeholt,
    sonst blockiert bluetoothctl beim Scannen (voller Ausgabe-Puffer)."""
    if not (IS_LINUX and valid_mac(mac)):
        return {'ok': False, 'log': 'nicht verfügbar'}
    try:
        open(BT_LOG, 'w').close()                       # frisches Log
    except Exception:
        pass
    _btlog('=== Pairing %s  (Benutzer: %s) ===\n' % (mac, os.environ.get('USER', '?')))
    try:
        p = subprocess.Popen(['bluetoothctl'], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except Exception as e:
        _btlog('Popen-Fehler: %s\n' % e)
        return {'ok': False, 'log': str(e)}

    lines = []
    def drain():
        try:
            for ln in p.stdout:
                lines.append(ln); _btlog(ln)
        except Exception:
            pass
    threading.Thread(target=drain, daemon=True).start()

    def send(cmd, wait):
        _btlog('\n> %s\n' % cmd)
        try:
            p.stdin.write(cmd + '\n'); p.stdin.flush()
        except Exception as e:
            _btlog('  (stdin-Fehler: %s)\n' % e)
        time.sleep(wait)

    send('power on', 1.0)
    send('agent NoInputNoOutput', 0.4)   # Lautsprecher: „Just Works" automatisch annehmen
    send('default-agent', 0.4)
    send('pairable on', 0.4)
    send('scan on', 8.0)                  # Gerät entdecken
    send('pair ' + mac, 12.0)
    send('trust ' + mac, 1.0)            # damit es sich künftig automatisch verbindet
    send('connect ' + mac, 6.0)
    send('scan off', 0.4)
    send('quit', 0.3)
    try:
        p.wait(timeout=5)
    except Exception:
        try: p.kill()
        except Exception: pass

    out = ''.join(lines)
    info = sh(['bluetoothctl', 'info', mac])
    _btlog('\n--- info nach Pairing ---\n' + info + '\n')
    ok = ('Connected: yes' in info) or ('Paired: yes' in info)
    _btlog('=== Ergebnis: %s ===\n' % ('OK' if ok else 'FEHLGESCHLAGEN'))
    hints = [l.strip() for l in out.splitlines() if any(k in l for k in (
        'Failed', 'successful', 'not available', 'AuthenticationFailed',
        'AlreadyExists', 'NotReady', 'org.bluez.Error', 'Agent', 'PIN', 'Pairing'))]
    return {'ok': ok, 'log': ' | '.join(hints[-6:])[:300]}


def bt_connect(mac):
    sh(['bluetoothctl', 'power', 'on'])
    for _ in range(2):
        c = sh(['bluetoothctl', 'connect', mac], timeout=15)
        if 'Connection successful' in c or 'Connected: yes' in sh(['bluetoothctl', 'info', mac]):
            return True
        time.sleep(1.5)
    return False


def bt_disconnect(mac):
    sh(['bluetoothctl', 'disconnect', mac], timeout=10)
    return True


def bt_remove(mac):
    sh(['bluetoothctl', 'remove', mac], timeout=10)
    return True


# ---- WLAN (NetworkManager / nmcli, nur Linux) ------------------------------
def wifi_scan():
    if not IS_LINUX:
        return []
    sh(['nmcli', 'dev', 'wifi', 'rescan'], timeout=10)      # frische Suche anstoßen
    out = sh(['nmcli', '-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list'], timeout=10)
    nets = {}
    for line in out.splitlines():
        parts = re.split(r'(?<!\\):', line)                 # nmcli escaped ':' in Werten als '\:'
        if len(parts) < 4:
            continue
        inuse, ssid = parts[0], parts[1].replace('\\:', ':')
        signal, security = parts[2], parts[3]
        if not ssid:
            continue
        sig = int(signal) if signal.isdigit() else 0
        sec = security.strip() not in ('', '--')
        cur = nets.get(ssid)
        if not cur or sig > cur['signal']:
            nets[ssid] = {'ssid': ssid, 'signal': sig, 'secure': sec, 'active': inuse.strip() == '*'}
    return sorted(nets.values(), key=lambda n: (not n['active'], -n['signal']))


def wifi_connect(ssid, password):
    if not IS_LINUX:
        return {'ok': False, 'msg': 'Nur auf dem Raspberry Pi verfügbar.'}
    if not ssid:
        return {'ok': False, 'msg': 'Kein Netzwerk angegeben.'}
    args = ['nmcli', 'dev', 'wifi', 'connect', ssid]
    if password:
        args += ['password', password]
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=30)
        msg = (r.stdout + r.stderr).strip()
        return {'ok': r.returncode == 0, 'msg': '' if r.returncode == 0 else (msg[:180] or 'Verbindung fehlgeschlagen')}
    except Exception as e:
        return {'ok': False, 'msg': str(e)[:180]}


# ---- Audio-Ausgänge (PipeWire/PulseAudio via pactl) ------------------------
def audio_sinks():
    if not IS_LINUX:
        return {'available': False, 'sinks': []}
    default = sh(['pactl', 'get-default-sink']).strip()
    out = sh(['pactl', 'list', 'sinks'])
    sinks, cur = [], None
    for raw in out.splitlines():
        line = raw.strip()
        if line.startswith('Name:'):
            if cur:
                sinks.append(cur)
            cur = {'name': line.split(':', 1)[1].strip(), 'desc': ''}
        elif line.startswith('Description:') and cur is not None:
            cur['desc'] = line.split(':', 1)[1].strip()
    if cur:
        sinks.append(cur)
    for s in sinks:
        s['default'] = (s['name'] == default)
    return {'available': bool(sinks), 'sinks': sinks}


def audio_set_default(name):
    if not IS_LINUX:
        return {'ok': False, 'msg': 'Nur auf dem Pi.'}
    if not name:
        return {'ok': False}
    try:
        r = subprocess.run(['pactl', 'set-default-sink', name], capture_output=True, text=True, timeout=8)
        for li in sh(['pactl', 'list', 'short', 'sink-inputs']).splitlines():
            sid = li.split('\t')[0].strip()
            if sid.isdigit():
                subprocess.run(['pactl', 'move-sink-input', sid, name], timeout=5)
        return {'ok': r.returncode == 0}
    except Exception as e:
        return {'ok': False, 'msg': str(e)[:160]}


# ---- Datum / Uhrzeit / Zeitzone (timedatectl) ------------------------------
def time_info():
    info = {'time': time.strftime('%H:%M'), 'date': time.strftime('%a %d.%m.%Y'),
            'tz': '', 'ntp': False, 'synced': False}
    if IS_LINUX:
        for li in sh(['timedatectl', 'show']).splitlines():
            if li.startswith('Timezone='):        info['tz'] = li.split('=', 1)[1]
            elif li.startswith('NTP='):            info['ntp'] = li.split('=', 1)[1] == 'yes'
            elif li.startswith('NTPSynchronized='): info['synced'] = li.split('=', 1)[1] == 'yes'
    return info


def time_set(tz, ntp):
    if not IS_LINUX:
        return {'ok': False, 'msg': 'Nur auf dem Pi.'}
    oks = []
    if tz:
        oks.append(subprocess.run(['sudo', 'timedatectl', 'set-timezone', tz],
                                  capture_output=True, text=True, timeout=8).returncode == 0)
    if ntp is not None:
        oks.append(subprocess.run(['sudo', 'timedatectl', 'set-ntp', 'true' if ntp else 'false'],
                                  capture_output=True, text=True, timeout=8).returncode == 0)
    return {'ok': all(oks) if oks else True}


# ---- Pi-Status & Update ----------------------------------------------------
def health():
    h = {'tempC': None, 'load': '', 'memPct': None, 'diskPct': None, 'uptime': get_uptime()}
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f:
            h['tempC'] = round(int(f.read().strip()) / 1000, 1)
    except Exception:
        pass
    try:
        with open('/proc/loadavg') as f:
            h['load'] = f.read().split()[0]
    except Exception:
        pass
    try:
        mem = {}
        with open('/proc/meminfo') as f:
            for li in f:
                k, v = li.split(':'); mem[k] = int(v.strip().split()[0])
        if mem.get('MemTotal'):
            h['memPct'] = round((mem['MemTotal'] - mem.get('MemAvailable', 0)) / mem['MemTotal'] * 100)
    except Exception:
        pass
    try:
        import shutil
        du = shutil.disk_usage(DIR); h['diskPct'] = round(du.used / du.total * 100)
    except Exception:
        pass
    return h


def git_run(args, timeout=30):
    try:
        r = subprocess.run(['git', '-C', DIR] + args, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:
        return 1, str(e)


def update_check():
    """Mit GitHub abgleichen: gibt es eine neuere Version?"""
    code, _ = git_run(['rev-parse', '--is-inside-work-tree'], timeout=6)
    if code != 0:
        return {'git': False,
                'msg': 'Kein Git-Repo – Update nur möglich, wenn per git geklont wurde.'}
    git_run(['fetch', '--quiet'], timeout=30)
    _, local  = git_run(['rev-parse', 'HEAD'])
    _, remote = git_run(['rev-parse', '@{u}'])
    _, behind = git_run(['rev-list', '--count', 'HEAD..@{u}'])
    _, url    = git_run(['config', '--get', 'remote.origin.url'])
    _, lmsg   = git_run(['log', '-1', '--format=%h %s', 'HEAD'])
    _, rmsg   = git_run(['log', '-1', '--format=%h %s', '@{u}'])
    bn = int(behind) if behind.strip().isdigit() else 0
    return {'git': True, 'available': bn > 0, 'behind': bn,
            'current': local[:7], 'latest': remote[:7],
            'currentMsg': lmsg, 'latestMsg': rmsg, 'url': url}


def update_apply():
    """Sauber auf den GitHub-Stand setzen und Dienst neu starten."""
    code, _ = git_run(['rev-parse', '--is-inside-work-tree'], timeout=6)
    if code != 0:
        return {'ok': False, 'msg': 'Kein Git-Repo.'}
    git_run(['config', 'core.fileMode', 'false'])               # chmod +x nicht als Änderung werten
    git_run(['fetch', '--prune'], timeout=60)
    code, out = git_run(['reset', '--hard', '@{u}'], timeout=60)  # hart auf origin/main (keine Merge-Konflikte)
    if code != 0:
        code, out = git_run(['reset', '--hard', 'origin/main'], timeout=60)
    ok = code == 0
    if ok and IS_LINUX:                       # Dienst neu starten, damit server.py neu lädt
        threading.Timer(1.2, lambda: os.execv(sys.executable, [sys.executable] + sys.argv)).start()
    return {'ok': ok, 'msg': out[:400], 'restart': ok and IS_LINUX}


# ---- Bildschirm-Helligkeit (echte Hardware, sonst Fallback im Frontend) -----
BRI_PCT = [20, 35, 50, 68, 84, 100]   # 6 Stufen → Prozent

def set_brightness(level):
    try:
        level = max(0, min(5, int(level)))
    except Exception:
        level = 5
    pct = BRI_PCT[level]
    if not IS_LINUX:
        return {'ok': False, 'method': None, 'pct': pct}
    # 1) Hardware-Backlight (DSI/Panels mit /sys/class/backlight)
    base = '/sys/class/backlight'
    try:
        for name in sorted(os.listdir(base)):
            d = os.path.join(base, name)
            try:
                with open(os.path.join(d, 'max_brightness')) as f:
                    mx = int(f.read().strip())
                val = max(1, min(mx, round(pct / 100 * mx)))
                with open(os.path.join(d, 'brightness'), 'w') as f:
                    f.write(str(val))
                return {'ok': True, 'method': 'backlight:' + name, 'pct': pct}
            except Exception:
                continue
    except Exception:
        pass
    # 2) DDC/CI (HDMI-Monitore mit Helligkeitssteuerung)
    if sh(['which', 'ddcutil']):
        try:
            r = subprocess.run(['ddcutil', '--noverify', 'setvcp', '10', str(pct)],
                               capture_output=True, text=True, timeout=15)
            if r.returncode == 0:
                return {'ok': True, 'method': 'ddcutil', 'pct': pct}
        except Exception:
            pass
    return {'ok': False, 'method': None, 'pct': pct}


def system_info():
    return {
        'hostname': socket.gethostname(),
        'ip':       get_ip(),
        'ssid':     get_ssid(),
        'signal':   get_signal(),
        'mac':      get_mac(),
        'os':       platform.platform(),
        'uptime':   get_uptime(),
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIR, **k)

    def log_message(self, *a):
        pass  # ruhig bleiben

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get('Content-Length', 0))
        try:
            return json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            return {}

    def serve_image(self, url):
        """Bild (Logo/Cover) serverseitig laden und gleiche Herkunft ausliefern.
        Toleriert ungültige Zertifikate (z.B. falsche Pi-Uhr) und setzt UA."""
        if not url or not re.match(r'^https?://', url, re.I):
            return self.send_error(400)
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={'User-Agent': 'SchlafRadio/1.0'})
            with urllib.request.urlopen(req, timeout=6, context=ctx) as r:
                ctype = r.headers.get('Content-Type', '')
                is_img = ctype.lower().startswith('image/') or bool(
                    re.search(r'\.(jpe?g|png|webp|gif|bmp|ico)(\?|#|$)', url, re.I))
                if not is_img:
                    return self.send_error(415)   # kein Bild (z.B. Webseite) → Frontend klappt zu
                data = r.read(3_000_000)          # max ~3 MB
                if not ctype:
                    ctype = 'image/jpeg'
        except Exception:
            return self.send_error(502)
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=3600')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        p = self.path
        if p.startswith('/api/system'):
            return self._json(system_info())
        if p.startswith('/api/net'):
            return self._json(net_status())
        if p.startswith('/api/nowplaying'):
            q = parse_qs(urlparse(p).query)
            return self._json(now_playing((q.get('url') or [''])[0]))
        if p.startswith('/api/img'):
            q = parse_qs(urlparse(p).query)
            return self.serve_image((q.get('url') or [''])[0])
        if p.startswith('/api/bt/battery'):
            q = parse_qs(urlparse(p).query)
            return self._json({'battery': bt_battery((q.get('mac') or [''])[0])})
        if p.startswith('/api/bt/log'):
            return self._json({'log': bt_log_read()})
        if p.rstrip('/') == '/api/bt' or p.startswith('/api/bt?'):
            avail = bt_available()
            return self._json({'available': avail, 'devices': bt_list() if avail else []})
        if p.startswith('/api/audio/volume'):
            return self._json({'volume': sink_volume()})
        if p.startswith('/api/wifi/scan'):
            return self._json({'available': IS_LINUX, 'networks': wifi_scan()})
        if p.startswith('/api/audio/sinks'):
            return self._json(audio_sinks())
        if p.startswith('/api/time'):
            return self._json(time_info())
        if p.startswith('/api/status'):
            return self._json(health())
        if p.startswith('/api/update/check'):
            return self._json(update_check())
        return super().do_GET()

    def do_POST(self):
        p = self.path
        if p.startswith('/api/power'):
            action = self._body().get('action')
            if not IS_LINUX:
                return self._json({'ok': False, 'msg': 'Nur auf dem Raspberry Pi verfügbar.'})
            if action == 'reboot':
                self._json({'ok': True}); subprocess.Popen(['sudo', 'shutdown', '-r', 'now'])
            elif action == 'shutdown':
                self._json({'ok': True}); subprocess.Popen(['sudo', 'shutdown', '-h', 'now'])
            else:
                self._json({'ok': False, 'msg': 'Unbekannte Aktion.'})
            return

        if p.startswith('/api/wifi/connect'):
            b = self._body()
            return self._json(wifi_connect((b.get('ssid') or '').strip(), b.get('password') or ''))
        if p.startswith('/api/audio/default'):
            return self._json(audio_set_default((self._body().get('name') or '').strip()))
        if p.startswith('/api/time'):
            b = self._body()
            return self._json(time_set((b.get('timezone') or '').strip(), b.get('ntp')))
        if p.startswith('/api/update/apply'):
            return self._json(update_apply())
        if p.startswith('/api/brightness'):
            return self._json(set_brightness(self._body().get('level', 5)))

        if p.startswith('/api/bt/'):
            if not bt_available():
                return self._json({'ok': False, 'available': False,
                                   'msg': 'Bluetooth nur auf dem Pi verfügbar.'})
            action = p.rstrip('/').rsplit('/', 1)[-1]
            if action == 'scan':
                return self._json({'ok': True, 'available': True, 'devices': bt_scan()})
            mac = self._body().get('mac')
            if not valid_mac(mac):
                return self._json({'ok': False, 'msg': 'Ungültige MAC-Adresse.'})
            if action == 'pair':
                r = bt_pair(mac)
                return self._json({'ok': bool(r.get('ok')), 'msg': r.get('log', ''), 'devices': bt_list()})
            fn = {'connect': bt_connect, 'disconnect': bt_disconnect, 'remove': bt_remove}.get(action)
            if not fn:
                return self.send_error(404)
            return self._json({'ok': bool(fn(mac)), 'devices': bt_list()})

        return self.send_error(404)


if __name__ == '__main__':
    print(f'zzz.radio läuft auf http://localhost:{PORT}  (Strg+C zum Beenden)')
    http.server.ThreadingHTTPServer(('', PORT), Handler).serve_forever()
