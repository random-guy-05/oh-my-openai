#!/usr/bin/env python3
"""Extract Oops error UI strings and recent chrome_debug errors."""
from pathlib import Path
import re

assets = Path("src/mac-x64/_asar/webview/assets")
for name in ["ogh9jurw", "jj50pjos", "local-conversation"]:
    for f in assets.glob(f"*{name}*.js"):
        s = f.read_text(errors="ignore")
        for m in re.finditer(r".{0,80}Oops.{0,160}", s):
            print(f"\n==== {f.name} @ {m.start()}")
            print(m.group(0))

log = Path.home() / "Library/Application Support/CodexDesktop-Rebuild/chrome_debug.log"
if log.exists():
    print("\n==== chrome_debug.log tail errors ====")
    lines = log.read_text(errors="ignore").splitlines()
    for line in lines[-400:]:
        if re.search(r"(?i)error|exception|TypeError|Cannot read|Oops|failed", line):
            print(line[:400])
