"""Bring the database up to date with PhilGEPS in one command.

Run with: python -m pipeline.refresh              (every step)
          python -m pipeline.refresh --no-scrape  (skip the document request scrape)

Steps, each stopping the refresh if it fails:
  1. migrate   apply any new schema files
  2. download  fetch quarters listed in pipeline/sources.py that are not yet in data/raw
  3. load      clean and load contracts (existing ones are updated, not duplicated)
  4. notices   fetch document request counts for notices not yet stored
  5. score     score every contract as a new scoring run

New quarters are not discovered automatically: when PhilGEPS publishes one, add
its Google Drive file ID to pipeline/sources.py first (see docs/data-source.md).
The scrape takes about two seconds a notice, so a new quarter of about 20,000
notices takes about half a day. It can be stopped and run again.

On the dashboard, contracts flagged in the new run but not the previous one are
marked "New" and listed in the RSS feed (/api/feed.xml).
"""

import argparse
import subprocess
import sys

STEPS = [
    ("migrate", ["-m", "pipeline.migrate"]),
    ("download", ["-m", "pipeline.download"]),
    ("load", ["-m", "pipeline.load"]),
    ("notices", ["-m", "pipeline.notices", "--all"]),
    ("score", ["-m", "ml.score"]),
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--no-scrape", action="store_true", help="skip fetching document request counts"
    )
    args = parser.parse_args(argv)

    for name, command in STEPS:
        if name == "notices" and args.no_scrape:
            print("\n== notices: skipped (--no-scrape)")
            continue
        print(f"\n== {name}")
        result = subprocess.run([sys.executable, *command], check=False)
        if result.returncode != 0:
            print(f"\nStopped: the {name} step failed (exit code {result.returncode}).")
            print("Fix the cause, then run python -m pipeline.refresh again.")
            return result.returncode
    print("\nRefresh finished. Copy the database to the hosted site when ready (README.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
