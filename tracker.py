import ctypes
import os
import time
import json
import urllib.request
import urllib.error
import sys

# ── Title & Visual Frame ──────────────────────────────────────────────────────
print("""
=========================================================
  WellBeing Tracker -- Windows Background Auto-Tracker
=========================================================
""")

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tracker_config.json')

APP_MAP = {
    'chrome.exe': 'Chrome',
    'msedge.exe': 'Edge',
    'firefox.exe': 'Firefox',
    'brave.exe': 'Brave Browser',
    'opera.exe': 'Opera',
    'code.exe': 'VS Code',
    'devenv.exe': 'Visual Studio',
    'python.exe': 'Python IDE',
    'pycharm64.exe': 'PyCharm',
    'idea64.exe': 'IntelliJ IDEA',
    'sublime_text.exe': 'Sublime Text',
    'notepad.exe': 'Notepad',
    'explorer.exe': 'File Explorer',
    'cmd.exe': 'Command Prompt',
    'powershell.exe': 'PowerShell',
    'bash.exe': 'Bash Terminal',
    'discord.exe': 'Discord',
    'whatsapp.exe': 'WhatsApp',
    'spotify.exe': 'Spotify',
    'vlc.exe': 'VLC Media Player',
    'zoom.exe': 'Zoom',
    'slack.exe': 'Slack',
    'teams.exe': 'Microsoft Teams',
    'excel.exe': 'Excel',
    'winword.exe': 'Word',
    'powerpnt.exe': 'PowerPoint',
    'steam.exe': 'Steam',
    'epicgameslauncher.exe': 'Epic Games',
    'taskmgr.exe': 'Task Manager'
}

IGNORE_LIST = {
    'searchhost.exe',
    'searchindexer.exe',
    'shellexperiencehost.exe',
    'startmenuexperiencehost.exe',
    'lockapp.exe',
    'textinputhost.exe',
    'runtimebroker.exe',
    'ctfmon.exe',
    'backgroundtaskhost.exe',
    'smartscreen.exe',
    'taskhostw.exe'
}

def get_active_window_title():
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except Exception:
        return "Unknown Window"

def get_active_process_name():
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        pid = ctypes.c_ulong()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        h_process = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not h_process:
            h_process = ctypes.windll.kernel32.OpenProcess(0x0400, False, pid) # PROCESS_QUERY_INFORMATION
            
        if h_process:
            try:
                buf_size = ctypes.c_ulong(260)
                buf = ctypes.create_unicode_buffer(260)
                if ctypes.windll.kernel32.QueryFullProcessImageNameW(h_process, 0, buf, ctypes.byref(buf_size)):
                    path = buf.value
                    return os.path.basename(path)
            finally:
                ctypes.windll.kernel32.CloseHandle(h_process)
    except Exception:
        pass
    return "Unknown.exe"

def clean_app_name(process_name):
    proc_lower = process_name.lower()
    if proc_lower in APP_MAP:
        return APP_MAP[proc_lower]
    
    name = process_name
    if name.lower().endswith('.exe'):
        name = name[:-4]
    
    name = name.replace('_', ' ').replace('-', ' ')
    return name.title()

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[-] Error reading config file: {e}")
        return None

def send_ping(server_url, app_name, window_title, switch_token):
    url = f"{server_url}/api/tracker/ping"
    data = json.dumps({
        "app_name": app_name,
        "window_title": window_title,
        "switch_token": switch_token
    }).encode('utf-8')
    
    req = urllib.request.Request(
        url,
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status == 200
    except Exception as e:
        return False

def main():
    print("[*] Starting tracker loop (polling active window every 3 seconds)...")
    print(f"[*] Config file target: {CONFIG_FILE}\n")
    
    last_app = None
    last_user = None
    
    while True:
        config = load_config()
        if not config:
            print("[-] No config file found. Please log in or refresh the dashboard.", end="\r")
            time.sleep(3)
            continue
            
        server_url = config.get('server_url', 'http://127.0.0.1:5000')
        switch_token = config.get('switch_token')
        username = config.get('username', 'Unknown User')
        
        if not switch_token:
            print("[-] Missing switch_token in config file. Retrying...", end="\r")
            time.sleep(3)
            continue
            
        process_name = get_active_process_name()
        if process_name.lower() in IGNORE_LIST:
            time.sleep(3)
            continue

        app_name = clean_app_name(process_name)
        window_title = get_active_window_title()
        
        # User session change logging
        if username != last_user:
            print(f"\n[+] Switched active session to: {username}")
            last_user = username
            last_app = None
            
        # Logging transitions in stdout
        if app_name != last_app:
            print(f"[+] Active Window: {app_name}  |  {window_title[:60]}")
            last_app = app_name
            
        success = send_ping(server_url, app_name, window_title, switch_token)
        if not success:
            print("[-] Failed to connect to server. Ensure Flask app is running at " + server_url, end="\r")
            
        time.sleep(3)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[-] Tracker stopped by user.")
        sys.exit(0)
