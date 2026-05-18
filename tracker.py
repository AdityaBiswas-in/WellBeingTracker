import ctypes
import os
import time
import json
import urllib.request
import urllib.error
import sys
import threading
import winsound

# Ensure console supports printing Unicode / emojis on Windows without crashing
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


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
    'applicationframehost.exe': 'Microsoft Store',

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
    config_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tracker_config.json'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tracker_config.json')
    ]
    for path in config_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[-] Error reading config file at {path}: {e}")
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
            if response.status == 200:
                res_body = response.read().decode('utf-8')
                return json.loads(res_body)
    except Exception:
        pass
    return None

def send_windows_toast(title, body):
    ps_script = f"""
$xml = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType, Windows.UI.Notifications, ContentType = WindowsRuntime]::ToastText02)
$textNodes = $xml.GetElementsByTagName("text")
$null = $textNodes.Item(0).AppendChild($xml.CreateTextNode("{title}"))
$null = $textNodes.Item(1).AppendChild($xml.CreateTextNode("{body}"))

$audioNode = $xml.CreateElement("audio")
$audioNode.SetAttribute("src", "ms-winsoundevent:Notification.Reminder")
$audioNode.SetAttribute("silent", "false")
$toastNode = $xml.SelectSingleNode("/toast")
$null = $toastNode.AppendChild($audioNode)

$toast = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::CreateToastNotifier("WellBeingTracker").Show($toast)
"""
    try:
        import subprocess
        subprocess.run(["powershell", "-NoProfile", "-Command", "-"], input=ps_script, encoding='utf-8', capture_output=True)
    except Exception:
        pass

def show_warning_box(app_name, used_min, limit_min, sound_style='short'):
    # Format minutes helper
    def fmt_min(m):
        h = int(m // 60)
        mins = int(round(m % 60))
        if h > 0:
            return f"{h}h {mins}m"
        return f"{mins}m"

    print(f"\n[!] LIMIT EXCEEDED WARNING: {app_name} | Used: {fmt_min(used_min)} | Limit: {fmt_min(limit_min)}")

    title = f"⏰ Limit Exceeded: {app_name}"
    body = f"You've used {fmt_min(used_min)} of {fmt_min(limit_min)} today. Take a break! 🌿🧘‍♂️"
    
    # 1. Trigger modern native Windows Notification Toast on laptop
    send_windows_toast(title, body)

    # 2. Trigger standard async system MessageBox dialog as a backup
    def target():
        # Play user's preferred notification sound style natively using winsound
        try:
            if sound_style == 'short':
                # ⚡ Standard Chirp
                winsound.Beep(523, 100)
                winsound.Beep(1046, 150)
            elif sound_style == 'long':
                # 🎵 Calming Zen Chimes (Warm Em7 chord arpeggio)
                for freq in [330, 392, 494, 659, 988]:
                    winsound.Beep(freq, 150)
            elif sound_style == 'alarm':
                # 🔔 Repeating Chime Alarm (3 double-beeps at 880Hz)
                for _ in range(3):
                    winsound.Beep(880, 100)
                    time.sleep(0.05)
                    winsound.Beep(880, 100)
                    time.sleep(0.5)
            elif sound_style == 'drip':
                # 💧 Water Droplet
                winsound.Beep(1200, 80)
                winsound.Beep(400, 100)
            elif sound_style == 'ding':
                # 🛎️ Classic Ding
                winsound.Beep(2000, 300)
            elif sound_style == 'synth':
                # 🎛️ Synth Echo
                for freq in [600, 500, 400, 300]:
                    winsound.Beep(freq, 120)
                    time.sleep(0.08)
            else:
                # Fallback: simple double chirp
                winsound.Beep(800, 100)
                winsound.Beep(1000, 150)
        except Exception as e:
            # Fallback to default alert sound if beep fails
            try:
                winsound.PlaySound("SystemAsterisk", winsound.SND_ALIAS | winsound.SND_ASYNC)
            except Exception:
                pass
            
        msg = (
            f"You've reached your daily limit for {app_name}!\n\n"
            f"You've used {fmt_min(used_min)} of your {fmt_min(limit_min)} limit today.\n\n"
            "It's time to step away, rest your eyes, and get some offline relaxation! 🌿🧘‍♂️"
        )
        # 0x30 = MB_ICONWARNING, 0x40000 = MB_TOPMOST
        ctypes.windll.user32.MessageBoxW(
            0,
            msg,
            f"Limit Exceeded: {app_name} ⏰",
            0x30 | 0x40000
        )
    threading.Thread(target=target, daemon=True).start()

def interactive_setup():
    print("""
=========================================================
  WellBeing Tracker -- Background Agent Setup Wizard 🚀
=========================================================
No configuration file found. Let's get you connected!
""")
    
    import getpass
    
    while True:
        server_url = input("Enter your server URL [default: http://127.0.0.1:5000]: ").strip()
        if not server_url:
            server_url = "http://127.0.0.1:5000"
            
        # Clean trailing slashes
        if server_url.endswith('/'):
            server_url = server_url[:-1]
            
        username = input("Enter your username or email: ").strip()
        if not username:
            print("[-] Username cannot be empty. Please try again.")
            continue
            
        password = getpass.getpass("Enter your password: ")
        if not password:
            print("[-] Password cannot be empty. Please try again.")
            continue
            
        print("[*] Authenticating with the server...")
        
        # Call the API
        url = f"{server_url}/api/tracker/authorize"
        data = json.dumps({
            "username": username,
            "password": password
        }).encode('utf-8')
        
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        try:
            with urllib.request.urlopen(req, timeout=8) as response:
                if response.status == 200:
                    res_body = response.read().decode('utf-8')
                    res_data = json.loads(res_body)
                    
                    # Successfully authenticated!
                    switch_token = res_data.get('switch_token')
                    user_actual = res_data.get('username')
                    
                    # Write to config file (.tracker_config.json)
                    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tracker_config.json')
                    with open(config_path, 'w') as f:
                        json.dump({
                            'server_url': server_url,
                            'switch_token': switch_token,
                            'username': user_actual
                        }, f)
                    
                    print(f"\n[+] Authorization successful! Connected to {server_url} as {user_actual}.")
                    print("[+] Configuration saved successfully.")
                    time.sleep(2)
                    return True
        except urllib.error.HTTPError as e:
            try:
                err_data = json.loads(e.read().decode('utf-8'))
                err_msg = err_data.get('error', 'Invalid credentials')
            except Exception:
                err_msg = f"HTTP Error {e.code}"
            print(f"[-] Authentication failed: {err_msg}")
        except urllib.error.URLError as e:
            print(f"[-] Connection failed. Could not reach server at {server_url}: {e.reason}")
        except Exception as e:
            print(f"[-] An unexpected error occurred: {e}")
            
        retry = input("\nWould you like to try again? (y/n): ").strip().lower()
        if retry != 'y':
            print("[-] Setup cancelled. Exiting.")
            sys.exit(0)


def main():
    print("[*] Starting tracker loop (polling active window every 3 seconds)...")
    print(f"[*] Config file target: {CONFIG_FILE}\n")
    
    last_app = None
    last_user = None
    notified_apps = set()
    last_notified_date = None
    
    while True:
        # Date change resetting
        current_date = time.strftime('%Y-%m-%d')
        if last_notified_date != current_date:
            notified_apps.clear()
            last_notified_date = current_date
            
        config = load_config()
        if not config or not config.get('switch_token'):
            print("\n[-] Configuration not found or incomplete. Starting interactive setup wizard...")
            interactive_setup()
            continue
            
        server_url = config.get('server_url', 'http://127.0.0.1:5000')
        switch_token = config.get('switch_token')
        username = config.get('username', 'Unknown User')
            
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
            notified_apps.clear()  # Reset notified cache when swapping users!
            
        # Logging transitions in stdout
        if app_name != last_app:
            print(f"[+] Active Window: {app_name}  |  {window_title[:60]}")
            last_app = app_name
            
        res_data = send_ping(server_url, app_name, window_title, switch_token)
        if res_data is None:
            print("[-] Failed to connect to server. Ensure Flask app is running at " + server_url, end="\r")
        else:
            sound_style = res_data.get('sound_style', 'short')
            # 1. Process all exceeded limits returned by the server
            exceeded_list = res_data.get('exceeded_limits', [])
            for item in exceeded_list:
                lim_app = item['app_name']
                lim_min = item['limit_minutes']
                usd_min = item['used_minutes']
                app_key = (lim_app.lower(), lim_min)
                
                if app_key not in notified_apps:
                    notified_apps.add(app_key)
                    show_warning_box(lim_app, usd_min, lim_min, sound_style)
            
            # 2. Legacy fallback for single active app limit info
            limit_info = res_data.get('limit_info')
            if limit_info and limit_info.get('exceeded'):
                limit_min = limit_info['limit_minutes']
                used_min = limit_info['used_minutes']
                app_key = (app_name.lower(), limit_min)
                
                if app_key not in notified_apps:
                    notified_apps.add(app_key)
                    show_warning_box(app_name, used_min, limit_min, sound_style)
            
        time.sleep(3)

def configure_startup(add=True):
    import winreg
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    app_name = "WellBeingTracker"
    
    if add:
        script_path = os.path.abspath(__file__)
        pythonw_path = sys.executable.replace("python.exe", "pythonw.exe")
        if not os.path.exists(pythonw_path):
            pythonw_path = sys.executable
        cmd = f'"{pythonw_path}" "{script_path}"'
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, cmd)
            winreg.CloseKey(key)
            print("\n[+] Success: WellBeingTracker registered to run silently in background on Windows startup!")
            print("    You will never have to run tracker.py manually again! It starts with your PC. 🚀")
            return True
        except Exception as e:
            print(f"\n[-] Error registering startup registry key: {e}")
            return False
    else:
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, app_name)
            winreg.CloseKey(key)
            print("\n[+] Success: WellBeingTracker removed from Windows startup registry.")
            return True
        except FileNotFoundError:
            print("\n[*] WellBeingTracker was not registered in startup registry.")
            return True
        except Exception as e:
            print(f"\n[-] Error deleting registry key: {e}")
            return False


if __name__ == "__main__":
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == '--startup':
            configure_startup(add=True)
            sys.exit(0)
        elif arg == '--remove-startup':
            configure_startup(add=False)
            sys.exit(0)
            
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[-] Tracker stopped by user.")
        sys.exit(0)
