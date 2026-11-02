"""Build the current source and package a clean release archive."""

import argparse
import platform
import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def native_archive() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    names = {
        ("windows", "amd64"): "win64",
        ("windows", "x86_64"): "win64",
        ("linux", "x86_64"): "linux64",
        ("linux", "aarch64"): "linux-arm64",
        ("linux", "arm64"): "linux-arm64",
        ("darwin", "arm64"): "macos-arm64",
        ("darwin", "x86_64"): "macos-x64",
    }
    return names.get((system, machine), f"{system}-{machine}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", default=native_archive())
    args = parser.parse_args()

    if DIST.is_symlink():
        DIST.unlink()
    elif DIST.exists():
        shutil.rmtree(DIST)

    subprocess.run(["cargo", "build", "--release", "--locked"], cwd=ROOT, check=True)

    binary_name = "navidrome-rpc.exe" if platform.system() == "Windows" else "navidrome-rpc"
    binary = ROOT / "target" / "release" / binary_name
    output = DIST / f"navidrome-rpc-{args.archive}.zip"
    DIST.mkdir()

    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.write(binary, binary.name)
        archive.write(ROOT / "config.example.json", "config.json")

    print(output)


if __name__ == "__main__":
    main()
