"""
Composeapelago - Build, Generate, and Host in one step.

Usage:
  python test_build.py

After it starts:
  - Open the webapp at http://127.0.0.1:5173
  - Connect to host localhost, port 38281
  - Slot name: Player1
"""

import glob
import os
import shutil
import subprocess
import sys
import zipfile


AP_DIR = r"C:\ProgramData\Archipelago"
REPO_DIR = os.path.dirname(__file__)
APWORLD_SRC = os.path.join(REPO_DIR, "composeapelago")
LOCAL_APWORLD_PATH = os.path.join(REPO_DIR, "composeapelago.apworld")
APWORLD_DST = os.path.join(AP_DIR, "custom_worlds", "composeapelago.apworld")
YAML_SRC = os.path.join(REPO_DIR, "Composeapelago.yaml")
PLAYERS_DIR = os.path.join(REPO_DIR, "test_players")
YAML_DST = os.path.join(PLAYERS_DIR, "Composeapelago.yaml")
AP_OUTPUT_DIR = os.path.join(AP_DIR, "output")
GENERATE_LOG_PATH = os.path.join(REPO_DIR, "generate_log.txt")

GENERATE_EXE = os.path.join(AP_DIR, "ArchipelagoGenerate.exe")
SERVER_EXE = os.path.join(AP_DIR, "ArchipelagoServer.exe")


def step(message):
    print(f"\n{'=' * 50}")
    print(f"  {message}")
    print(f"{'=' * 50}")


def write_apworld_zip():
    step("1. Packaging apworld")

    with zipfile.ZipFile(LOCAL_APWORLD_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(APWORLD_SRC):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for file in files:
                if file.endswith(".pyc"):
                    continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, APWORLD_SRC)
                zip_path = os.path.join("composeapelago", rel_path).replace("\\", "/")
                zf.write(full_path, zip_path)
                print(f"  + {zip_path}")

    print(f"  Created local apworld: {LOCAL_APWORLD_PATH}")


def install_apworld():
    step("2. Installing apworld")

    custom_worlds = os.path.dirname(APWORLD_DST)
    os.makedirs(custom_worlds, exist_ok=True)
    shutil.copy2(LOCAL_APWORLD_PATH, APWORLD_DST)
    print(f"  Installed apworld: {APWORLD_DST}")


def stage_yaml():
    step("3. Staging YAML")

    if os.path.exists(PLAYERS_DIR):
        shutil.rmtree(PLAYERS_DIR)
    os.makedirs(PLAYERS_DIR)

    shutil.copy2(YAML_SRC, YAML_DST)
    print(f"  Player files path: {PLAYERS_DIR}")


def generate():
    step("4. Generating game")

    before = set(glob.glob(os.path.join(AP_OUTPUT_DIR, "*.zip")))
    result = subprocess.run(
        [GENERATE_EXE, "--player_files_path", PLAYERS_DIR],
        cwd=AP_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )

    with open(GENERATE_LOG_PATH, "w", encoding="utf-8") as log_file:
        log_file.write("=== STDOUT ===\n")
        log_file.write(result.stdout or "(empty)")
        log_file.write("\n=== STDERR ===\n")
        log_file.write(result.stderr or "(empty)")

    print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode != 0:
        print(f"GENERATE FAILED! Full log: {GENERATE_LOG_PATH}")
        sys.exit(result.returncode)

    after = set(glob.glob(os.path.join(AP_OUTPUT_DIR, "*.zip")))
    new_files = after - before
    output_file = max(new_files or after, key=os.path.getmtime)

    print(f"  Output: {output_file}")
    return output_file


def host_server(output_file):
    step("5. Starting server")

    print(f"  Hosting: {os.path.basename(output_file)}")
    print("  Connect to: localhost:38281")
    print("  Slot name: Player1")
    print("  Press Ctrl+C to stop the server.")
    print()

    try:
        subprocess.run([SERVER_EXE, output_file], cwd=AP_DIR)
    except KeyboardInterrupt:
        print("\n  Server stopped.")


if __name__ == "__main__":
    print("Composeapelago - Test Build Script")
    print("==================================")

    write_apworld_zip()
    install_apworld()
    stage_yaml()
    output = generate()
    host_server(output)
