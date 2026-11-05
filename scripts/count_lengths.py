"""Check the 30-second and 1-minute sections of every unit in scripts.md against the timing budgets.

usage: python count_lengths.py <workspace>
Exit code 1 if any section is clearly outside its budget.
"""
import sys
from pathlib import Path

from common import BUDGETS, TOLERANCE, parse_scripts, spoken_lengths


def main():
    ws = Path(sys.argv[1])
    units = parse_scripts(ws / "scripts.md")
    if not units:
        raise SystemExit(f"no units found in {ws / 'scripts.md'}")
    bad = 0
    print(f"{'unit':16s} {'zh 30s':>9s} {'zh 1min':>9s} {'en 30s':>9s} {'en 1min':>9s}   budgets: zh 100–130 / 230–280, en 65–85 / 140–170")
    for u in units:
        lens = spoken_lengths(u)
        cells = []
        for lang in ("zh", "en"):
            for key in ("30", "60"):
                v = lens.get(lang, {}).get(key)
                if v is None:
                    cells.append(f"{'—':>9s}")
                    continue
                lo, hi = BUDGETS[lang][key]
                tol = TOLERANCE[lang]
                flag = "" if lo - tol <= v <= hi + tol else " !"
                bad += bool(flag)
                cells.append(f"{str(v) + flag:>9s}")
        print(f"{u['id']:16s} " + " ".join(cells))
    print("all spoken sections within budget" if not bad else f"{bad} section(s) outside budget (marked !)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
