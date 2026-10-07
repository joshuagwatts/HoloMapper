#!/usr/bin/env python3
"""HoloMapper bridge — the VJ laptop's companion server for the phone remote.

Double-clickable: just run `python bridge.py` and leave the window open.

What it does (stdlib only, no dependencies):
  * Serves this folder over HTTP (default port 8090):
      /holomapper.html  the VJ engine (open on the laptop)
      /remote.html       the phone remote control surface
      /setup            pairing page with a QR code (phone scans this)
      /api/info         JSON with LAN URLs (for debugging)
  * Relays JSON messages over WebSocket (/ws) between exactly two roles:
      engine  -> holomapper.html with "Phone remote" enabled
      remote  -> remote.html on the phone
    The phone scans the QR on /setup (or the engine's pair screen) and lands
    on the remote page already pointed at this bridge. No typing, no OSC.

Protocol (JSON text frames):
  client -> bridge:  {"role":"engine"} / {"role":"remote"}   (first message)
  bridge -> engine:  {"type":"welcome","remoteUrl":..,"lanUrls":[..],"wsUrl":..}
  bridge -> remote:  {"type":"peer","role":"engine","online":true/false}
  remote -> engine:  {"type":"macro","i":0,"value":0.7}
                     {"type":"param","id":"L0.op","value":0.8}
                     {"type":"tap"} {"type":"preset","dir":1} {"type":"blackout","on":true}
  engine -> remote:  {"type":"state", ...}   (macro values, opacities, blackout)

Both sides auto-reconnect; roles are re-announced with {"role":...} on every
(new) connection, so a laptop sleep or network drop heals itself.
"""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import socket
import struct
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# ---------------------------------------------------------------- config

def get_args():
    p = argparse.ArgumentParser(description="HoloMapper bridge: phone-remote relay for the HoloMapper VJ engine")
    p.add_argument("--port", type=int, default=int(os.environ.get("HOLOMAPPER_PORT", 8090)))
    p.add_argument("--no-browser", action="store_true",
                   help="don't auto-open the setup page on launch")
    return p.parse_args()

ARGS = get_args()

# QR renderer for /setup (vendored qrcodejs, MIT). Inlined so the setup page
# has zero dependencies. If the file is missing we still serve the page with
# the plain URL instead of a QR.
def _load_qrjs():
    try:
        return (HERE / "qrcode.js").read_text(encoding="utf-8")
    except OSError:
        return ""
QRJS = _load_qrjs()

# ---------------------------------------------------------------- network helpers

def lan_ips():
    """All non-loopback IPv4 addresses, best route first. Never a guessing game."""
    ips = []
    def add(ip):
        if ip and not ip.startswith("127.") and ip not in ips:
            ips.append(ip)
    try:  # the address the default route would use
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:  # every other interface address
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except OSError:
        pass
    return ips or ["127.0.0.1"]

def info_payload():
    ips = lan_ips()
    return {
        "ok": True,
        "service": "holomapper-bridge",
        "port": ARGS.port,
        "lan_ips": ips,
        "remote_url": "http://%s:%d/remote.html" % (ips[0], ARGS.port),
        "engine_url": "http://%s:%d/holomapper.html" % (ips[0], ARGS.port),
        "setup_url": "http://%s:%d/setup" % (ips[0], ARGS.port),
        "ws_url": "ws://%s:%d/ws" % (ips[0], ARGS.port),
    }

# ---------------------------------------------------------------- websocket relay

peers = {}            # socket -> "engine" | "remote" | None
peers_lock = threading.Lock()

def _peers_snapshot():
    with peers_lock:
        return dict(peers)

def drop_peer(conn):
    with peers_lock:
        peers.pop(conn, None)
    try:
        conn.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    try:
        conn.close()
    except OSError:
        pass

def ws_send(conn, text):
    data = text.encode("utf-8") if isinstance(text, str) else bytes(text)
    hdr = bytes([0x81])
    n = len(data)
    if n < 126:
        hdr += bytes([n])
    elif n < 65536:
        hdr += bytes([126]) + struct.pack(">H", n)
    else:
        hdr += bytes([127]) + struct.pack(">Q", n)
    conn.sendall(hdr + data)

def send_to(role, obj, exclude=None):
    msg = json.dumps(obj)
    dead = []
    for conn, r in _peers_snapshot().items():
        if r == role and conn is not exclude:
            try:
                ws_send(conn, msg)
            except OSError:
                dead.append(conn)
    for conn in dead:
        drop_peer(conn)

def ws_recv_frame(conn, buf):
    """Read one WS frame from conn, appending to bytearray buf. Returns
    (fin, opcode, payload) or None on clean EOF."""
    def need(n):
        nonlocal buf
        while len(buf) < n:
            chunk = conn.recv(65536)
            if not chunk:
                return False
            buf += chunk
        return True
    if not need(2):
        return None
    b1, b2 = buf[0], buf[1]
    fin = b1 & 0x80
    op = b1 & 0x0F
    masked = b2 & 0x80
    ln = b2 & 0x7F
    idx = 2
    if ln == 126:
        if not need(4):
            return None
        ln = struct.unpack(">H", bytes(buf[2:4]))[0]
        idx = 4
    elif ln == 127:
        if not need(10):
            return None
        ln = struct.unpack(">Q", bytes(buf[2:10]))[0]
        idx = 10
    if masked:
        if not need(idx + 4):
            return None
        mask = bytes(buf[idx:idx + 4])
        idx += 4
    else:
        mask = None
    if not need(idx + ln):
        return None
    payload = bytes(buf[idx:idx + ln])
    del buf[:idx + ln]
    if mask:
        payload = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
    return fin, op, payload

def on_ws_message(conn, text):
    try:
        msg = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return
    if not isinstance(msg, dict):
        return
    role = _peers_snapshot().get(conn)
    if role is None:
        r = msg.get("role")
        if r in ("engine", "remote"):
            with peers_lock:
                peers[conn] = r
            if r == "engine":
                info = info_payload()
                try:
                    ws_send(conn, json.dumps({
                        "type": "welcome",
                        "remoteUrl": info["remote_url"],
                        "lanUrls": info["lan_ips"],
                        "wsUrl": info["ws_url"],
                    }))
                except OSError:
                    pass
                send_to("remote", {"type": "peer", "role": "engine", "online": True})
            else:
                eng_online = any(v == "engine" for v in _peers_snapshot().values())
                try:
                    ws_send(conn, json.dumps({"type": "peer", "role": "engine", "online": eng_online}))
                except OSError:
                    pass
        return
    if role == "remote":
        send_to("engine", msg, exclude=conn)
    elif role == "engine":
        if msg.get("type") == "getInfo":
            try:
                ws_send(conn, json.dumps({"type": "info", **info_payload()}))
            except OSError:
                pass
        else:
            send_to("remote", msg, exclude=conn)

def handle_ws(conn, rest):
    buf = bytearray(rest)
    with peers_lock:
        peers[conn] = None
    frag = b""
    try:
        while True:
            fr = ws_recv_frame(conn, buf)
            if fr is None:
                break
            fin, op, payload = fr
            if op == 0x8:                       # close
                break
            if op == 0x9:                       # ping -> pong
                try:
                    conn.sendall(bytes([0x8A, 0x00]))
                except OSError:
                    break
                continue
            if op == 0xA:                       # pong
                continue
            if op in (0x1, 0x0):                # text / continuation
                frag += payload
                if not fin:
                    continue
                text, frag = frag.decode("utf-8", "replace"), b""
                on_ws_message(conn, text)
            # binary frames (0x2) are ignored
    except (OSError, ConnectionError):
        pass
    finally:
        role = _peers_snapshot().get(conn)
        drop_peer(conn)
        if role == "engine":
            send_to("remote", {"type": "peer", "role": "engine", "online": False})

# ---------------------------------------------------------------- HTTP

SETUP_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HoloMapper — pair your phone</title>
<style>
body{background:#08090c;color:#e2e8f2;font:15px/1.6 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.card{background:#10131a;border:1px solid #232b38;border-radius:16px;padding:28px;max-width:440px;text-align:center}
h1{font-size:20px;margin:0 0 6px;background:linear-gradient(90deg,#8b5cf6,#22d3ee);
  -webkit-background-clip:text;background-clip:text;color:transparent}
#qr{display:flex;justify-content:center;margin:16px 0;min-height:230px;align-items:center}
#qr img,#qr canvas,#qr table{border:8px solid #fff;border-radius:8px}
.url{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#22d3ee;word-break:break-all;
  background:#0b0e13;border:1px solid #232b38;border-radius:8px;padding:8px;margin:10px 0}
ol{text-align:left;color:#8b95a8;font-size:14px;padding-left:22px}
ol b{color:#e2e8f2}
.warn{color:#f5a623;font-size:13px}
.lans{font-size:12px;color:#8b95a8;margin-top:10px}
</style></head>
<body><div class="card">
<h1>HoloMapper phone remote</h1>
<div>Scan with your phone camera — the remote opens already connected.</div>
<div id="qr"><span class="warn">rendering QR…</span></div>
<div class="url" id="url">__REMOTE_URL__</div>
<ol>
<li>Phone + laptop on the <b>same Wi-Fi</b></li>
<li>In HoloMapper, turn on <b>Phone remote</b> (status bar)</li>
<li>Scan — no typing needed</li>
</ol>
<div class="warn" id="noqr" style="display:none">QR library missing — type the address above into the phone browser.</div>
<div class="lans">This laptop: __LAN_LIST__</div>
</div>
<script>__QRJS__</script>
<script>
(function(){
  var url = document.getElementById('url').textContent.trim();
  try{
    if(typeof QRCode === 'undefined') throw new Error('no lib');
    document.getElementById('qr').innerHTML='';
    new QRCode(document.getElementById('qr'),{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
  }catch(e){ document.getElementById('noqr').style.display='block'; }
})();
</script>
</body></html>"""

INDEX_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HoloMapper bridge</title>
<style>body{background:#08090c;color:#e2e8f2;font:15px/1.8 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#10131a;border:1px solid #232b38;border-radius:16px;padding:28px;max-width:420px;text-align:center}
a{color:#22d3ee;font-size:17px}</style></head>
<body><div class="card"><h2>HoloMapper bridge</h2>
<p><a href="/holomapper.html">Open the VJ engine</a> (this laptop)</p>
<p><a href="/setup">Pair your phone</a> (QR code)</p>
<p><a href="/remote.html">Phone remote</a></p></div></body></html>"""

def http_response(status, body, ctype="text/plain; charset=utf-8"):
    if isinstance(body, str):
        body = body.encode("utf-8")
    reason = {200: "OK", 404: "Not Found", 500: "Internal Server Error"}.get(status, "OK")
    head = ("HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %d\r\n"
            "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
            % (status, reason, ctype, len(body)))
    return head.encode("latin1") + body

def render_setup():
    info = info_payload()
    page = SETUP_HTML.replace("__REMOTE_URL__", info["remote_url"])
    page = page.replace("__LAN_LIST__", ", ".join(info["lan_ips"]))
    page = page.replace("__QRJS__", QRJS)
    return page

def serve_path(path):
    rel = path.split("?", 1)[0].split("#", 1)[0]
    if rel == "/":
        return http_response(200, INDEX_HTML, "text/html; charset=utf-8")
    if rel == "/setup":
        return http_response(200, render_setup(), "text/html; charset=utf-8")
    if rel == "/api/info":
        return http_response(200, json.dumps(info_payload()), "application/json")
    # static files from the project dir only
    name = rel.lstrip("/").split("/")[0]
    if not name or ".." in name or name.startswith("."):
        return http_response(404, "not found")
    target = (HERE / name).resolve()
    if HERE.resolve() not in target.parents or not target.is_file():
        return http_response(404, "not found")
    ctype, _ = mimetypes.guess_type(str(target))
    try:
        return http_response(200, target.read_bytes(), ctype or "application/octet-stream")
    except OSError:
        return http_response(500, "read error")

def handle_conn(conn):
    try:
        conn.settimeout(15)
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = conn.recv(4096)
            if not chunk:
                conn.close()
                return
            data += chunk
            if len(data) > 65536:
                conn.close()
                return
        head, rest = data.split(b"\r\n\r\n", 1)
        lines = head.decode("latin1").split("\r\n")
        parts = lines[0].split(" ")
        if len(parts) < 2:
            conn.close()
            return
        method, path = parts[0], parts[1]
        headers = {}
        for ln in lines[1:]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        is_ws = (headers.get("upgrade", "").lower() == "websocket"
                 and "upgrade" in headers.get("connection", "").lower()
                 and path.split("?", 1)[0] == "/ws")
        if is_ws and headers.get("sec-websocket-key"):
            key = headers["sec-websocket-key"]
            acc = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
            conn.sendall(("HTTP/1.1 101 Switching Protocols\r\n"
                          "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                          "Sec-WebSocket-Accept: %s\r\n\r\n" % acc).encode())
            conn.settimeout(None)
            handle_ws(conn, rest)
        else:
            conn.sendall(serve_path(path))
            conn.close()
    except (OSError, ConnectionError):
        try:
            conn.close()
        except OSError:
            pass
    except Exception:
        import traceback
        traceback.print_exc()
        try:
            conn.sendall(http_response(500, "bridge error"))
            conn.close()
        except OSError:
            pass

# ---------------------------------------------------------------- main

def print_banner(info):
    bar = "=" * 62
    print(bar)
    print("  HoloMapper bridge — your phone as a HoloMapper control surface")
    print(bar)
    print("  Pairing page (QR):  %s" % info["setup_url"])
    print("  Phone remote URL:   %s" % info["remote_url"])
    print("  VJ engine (laptop): http://127.0.0.1:%d/holomapper.html" % ARGS.port)
    print()
    if len(info["lan_ips"]) > 1:
        print("  All LAN addresses:")
        for ip in info["lan_ips"]:
            print("    http://%s:%d/remote.html" % (ip, ARGS.port))
        print()
    print("  1. Phone + laptop on the SAME Wi-Fi")
    print("  2. In HoloMapper, enable 'Phone remote' in the status bar")
    print("  3. Scan the QR — no typing needed")
    print("  LEAVE THIS WINDOW OPEN — closing it stops the remote")
    print(bar)
    print()

def main():
    # unbuffered console output even when double-clicked (Windows opens a
    # console window; the banner below is the "it's running" indicator)
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass
    info = info_payload()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        srv.bind(("0.0.0.0", ARGS.port))
    except OSError as e:
        print("Could not bind port %d: %s" % (ARGS.port, e))
        print("Is another bridge already running? (python bridge.py --port 8091)")
        sys.exit(1)
    srv.listen(32)
    print_banner(info)
    if not ARGS.no_browser:
        import webbrowser
        threading.Thread(target=webbrowser.open,
                         args=("http://127.0.0.1:%d/setup" % ARGS.port,),
                         daemon=True).start()
    try:
        while True:
            conn, _ = srv.accept()
            t = threading.Thread(target=handle_conn, args=(conn,), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print("\nstopped.")

if __name__ == "__main__":
    main()
