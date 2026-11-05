"""Build the practice app for a workspace: copy the app template, write its config, build the content.

usage: python build_app.py <workspace> [--shortcut] [--open] [--port N]
  --shortcut   create a desktop shortcut (Windows .lnk, macOS .command, Linux .desktop)
  --open       start the server and open the browser
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
TEMPLATE = SKILL / "assets" / "app"


def python_for_server() -> str:
    """A windowless interpreter on Windows (pythonw.exe next to this python), else this interpreter."""
    exe = Path(sys.executable)
    if os.name == "nt":
        w = exe.with_name("pythonw.exe")
        if w.exists():
            return str(w)
    return str(exe)


def make_shortcut(app: Path, title: str) -> str:
    if os.name == "nt":
        ps = f"""
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '{title}.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = "$env:WINDIR\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
$s.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{app / 'launch.ps1'}"'
$s.WorkingDirectory = '{app}'
$s.IconLocation = '{app / 'static' / 'assets' / 'icon.ico'},0'
$s.WindowStyle = 7
$s.Save()
Write-Output $lnk
"""
        r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, encoding="utf-8")
        if r.returncode:
            raise SystemExit(f"shortcut failed: {r.stderr.strip()}")
        return r.stdout.strip()
    desktop = Path.home() / "Desktop"
    desktop.mkdir(exist_ok=True)
    if sys.platform == "darwin":
        target = desktop / f"{title}.command"
        target.write_text(f'#!/bin/bash\nexec bash "{app / "launch.sh"}"\n', encoding="utf-8")
    else:
        target = desktop / f"{title}.desktop"
        target.write_text(f"[Desktop Entry]\nType=Application\nName={title}\nExec=bash \"{app / 'launch.sh'}\"\n"
                          f"Icon={app / 'static' / 'assets' / 'icon.png'}\nTerminal=false\n", encoding="utf-8")
    target.chmod(0o755)
    return str(target)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workspace")
    ap.add_argument("--shortcut", action="store_true")
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--port", type=int)
    a = ap.parse_args()

    ws = Path(a.workspace).resolve()
    coach = json.loads((ws / "coach.json").read_text(encoding="utf-8"))
    pack_name = coach.get("pack", "none")
    pack_dir = SKILL / "assets" / "packs" / pack_name if pack_name != "none" else None
    if pack_dir and not pack_dir.exists():
        raise SystemExit(f"pack '{pack_name}' not found in {SKILL / 'assets' / 'packs'}")
    pack_meta = json.loads((pack_dir / "pack.json").read_text(encoding="utf-8")) if pack_dir else {}
    title = coach.get("title") or pack_meta.get("title") or "Interview Coach"
    port = a.port or coach.get("port", 48200)

    app = ws / "app"
    for sub in ("static", "data"):
        shutil.rmtree(app / sub, ignore_errors=True)
    shutil.copytree(TEMPLATE, app, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "data"))
    if pack_dir:                                   # a pack may bring its own icon
        for ext in ("png", "ico"):
            if (pack_dir / f"icon.{ext}").exists():
                shutil.copy2(pack_dir / f"icon.{ext}", app / "static" / "assets" / f"icon.{ext}")
    if (ws / "diagrams").exists():
        shutil.copytree(ws / "diagrams", app / "static" / "diagrams", dirs_exist_ok=True)

    env_file = coach.get("env_file") or str(ws / ".env")
    config = {"workspace": str(ws), "pack_dir": str(pack_dir) if pack_dir else "", "port": port,
              "env_file": env_file, "title": title, "python": python_for_server()}
    (app / "app_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=1), encoding="utf-8")
    # PowerShell 5.1 reads BOM-less scripts as ANSI; keep the launcher UTF-8 with BOM
    ps1 = app / "launch.ps1"
    ps1.write_text(ps1.read_text(encoding="utf-8-sig"), encoding="utf-8-sig")
    (app / "launch.sh").chmod(0o755)

    r = subprocess.run([sys.executable, str(app / "build_data.py")], cwd=str(app), capture_output=True, text=True, encoding="utf-8")
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode:
        raise SystemExit("content build failed — run scripts/validate.py on the workspace")
    print(f"app built at {app} (port {port}, title '{title}', AI key file: {'found' if Path(env_file).exists() else 'missing — AI features off'})")

    if a.shortcut:
        print("shortcut:", make_shortcut(app, title))
    if a.open:
        if os.name == "nt":
            subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(ps1)])
        else:
            subprocess.Popen(["bash", str(app / "launch.sh")])
        print(f"opening http://127.0.0.1:{port}/")


if __name__ == "__main__":
    main()
