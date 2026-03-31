"""
run_generators.py
Runs both synthetic data generators in sequence, regenerating all six output files.
Usage (from repo root): python pipeline/generators/run_generators.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from outreach_generator import main as outreach_main
from salesloft_generator import main as salesloft_main


def main():
    print("=" * 60)
    print("OUTREACH GENERATOR")
    print("=" * 60)
    outreach_main()

    print()
    print("=" * 60)
    print("SALESLOFT GENERATOR")
    print("=" * 60)
    salesloft_main()


if __name__ == "__main__":
    main()
