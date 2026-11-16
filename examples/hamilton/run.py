import argparse
from importlib.metadata import version
from pathlib import Path

from hamilton import driver

import media_flow


def main():
    parser = argparse.ArgumentParser(description="Save a PNG thumbnail of a recovered Magic Hour image.")
    parser.add_argument("source_path", type=Path)
    parser.add_argument("output_path", type=Path)
    args = parser.parse_args()

    flow = driver.Builder().with_modules(media_flow).build()
    outputs = flow.execute(
        ["saved_thumbnail"],
        inputs={"source_path": args.source_path, "output_path": args.output_path},
    )
    print(f"Apache Hamilton {version('apache-hamilton')}, Pillow {version('Pillow')}")
    print(outputs["saved_thumbnail"])


if __name__ == "__main__":
    main()
