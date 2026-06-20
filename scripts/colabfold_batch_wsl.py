from __future__ import annotations

import re
import subprocess
import sys


DRIVE_PATH = re.compile(r"^([A-Za-z]):[\\/](.*)$")


def to_wsl_path(value: str) -> str:
    match = DRIVE_PATH.match(value)
    if not match:
        return value
    drive, rest = match.groups()
    return f"/mnt/{drive.lower()}/{rest.replace(chr(92), '/')}"


def main() -> int:
    args = [to_wsl_path(arg) for arg in sys.argv[1:]]
    shell_args = " ".join(_quote(arg) for arg in args)
    results_dir = _quote(args[-1]) if args else "''"
    command = (
        "set -e; "
        "export XLA_PYTHON_CLIENT_PREALLOCATE=${XLA_PYTHON_CLIENT_PREALLOCATE:-false}; "
        "export XLA_PYTHON_CLIENT_MEM_FRACTION=${XLA_PYTHON_CLIENT_MEM_FRACTION:-0.75}; "
        "export TF_FORCE_UNIFIED_MEMORY=${TF_FORCE_UNIFIED_MEMORY:-0}; "
        f"mkdir -p -- {results_dir}; "
        "source ~/localcolabfold/conda/etc/profile.d/conda.sh; "
        "conda activate ~/localcolabfold/colabfold-conda; "
        f"exec colabfold_batch {shell_args}"
    )
    return subprocess.run(["wsl", "bash", "-lc", command], check=False).returncode


def _quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


if __name__ == "__main__":
    raise SystemExit(main())
