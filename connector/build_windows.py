"""Build on Windows. No company data or connection key is included."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


def main():
    if os.name != "nt":
        raise SystemExit("A Windows machine is required to produce the Windows executable.")
    root = Path(__file__).resolve().parent
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
                    "--onedir", "--windowed", "--name", "CommonsTallyConnector",
                    "--distpath", str(root / "release"), "--workpath", str(root / "build"),
                    "--specpath", str(root / "build"), str(root / "commons_connector.py")], check=True)
    package = root / "release" / "CommonsTallyConnector"
    executable = package / "CommonsTallyConnector.exe"
    subprocess.run([str(executable), "--self-test"], check=True, timeout=60)
    shutil.copy2(root / "README.txt", package / "README.txt")
    shutil.copy2(root.parent / "docs" / "TALLY_RELEASE_GATES.md", package / "TALLY_RELEASE_GATES.md")
    # Hash every distributed file; credentials/recovery data live outside this tree.
    hashes = [hashlib.sha256(f.read_bytes()).hexdigest()+"  "+f.relative_to(package).as_posix()
              for f in sorted(package.rglob("*")) if f.is_file() and f.name != "SHA256SUMS.txt"]
    (package / "SHA256SUMS.txt").write_text("\n".join(hashes)+"\n", encoding="utf-8")
    archive = root / "release" / "commons-tally-windows.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
        for f in sorted(package.rglob("*")):
            if f.is_file(): output.write(f, arcname=f.relative_to(package.parent))
    print("Built acceptance package:", archive)


if __name__ == "__main__":
    main()
