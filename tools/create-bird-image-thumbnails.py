#!/usr/bin/env python3
"""Create compact WebP thumbnails for the local bird image library."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "bird-images"
DEFAULT_OUTPUT_DIR = DEFAULT_INPUT_DIR / "thumbnails"
SUPPORTED_EXTENSIONS = {".webp", ".jpg", ".jpeg", ".png"}


def find_source_images(input_dir: Path, output_dir: Path) -> list[Path]:
    """Collects image files from the source folder without recursing into thumbnails."""
    return sorted(
        path
        for path in input_dir.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and path.parent.resolve() != output_dir.resolve()
    )


def run_ffmpeg(source_path: Path, target_path: Path, max_edge: int, quality: int) -> bool:
    """Runs ffmpeg once with a fixed size and quality preset."""
    scale_filter = (
        "scale="
        f"'if(gt(iw,ih),{max_edge},-2)':"
        f"'if(gt(iw,ih),-2,{max_edge})'"
    )
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-vf",
        scale_filter,
        "-frames:v",
        "1",
        "-an",
        "-c:v",
        "libwebp",
        "-preset",
        "picture",
        "-compression_level",
        "6",
        "-quality",
        str(quality),
        str(target_path),
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode == 0:
        return True
    stderr = result.stderr.decode("utf-8", errors="replace").strip()
    print(f"ffmpeg failed for {source_path.name}: {stderr}", file=sys.stderr)
    return False


def make_thumbnail(source_path: Path, target_path: Path, max_bytes: int) -> bool:
    """Creates one thumbnail, reducing quality and dimensions until it fits the byte limit."""
    attempts = [
        (260, 62),
        (240, 56),
        (220, 50),
        (200, 45),
        (180, 40),
        (160, 36),
        (144, 32),
        (128, 28),
        (112, 24),
        (96, 20),
    ]

    best_path: Path | None = None
    best_size: int | None = None
    temporary_paths: list[Path] = []

    for max_edge, quality in attempts:
        with NamedTemporaryFile(suffix=".webp", delete=False) as temporary_file:
            temporary_path = Path(temporary_file.name)
        temporary_paths.append(temporary_path)

        if not run_ffmpeg(source_path, temporary_path, max_edge, quality):
            continue

        output_size = temporary_path.stat().st_size
        if best_size is None or output_size < best_size:
            best_path = temporary_path
            best_size = output_size

        if output_size <= max_bytes:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(temporary_path), target_path)
            for path in temporary_paths:
                if path.exists() and path != target_path:
                    path.unlink(missing_ok=True)
            return True

    if best_path is not None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(best_path), target_path)
        print(
            f"WARNING {source_path.name}: smallest thumbnail is {best_size} bytes, above limit {max_bytes}",
            file=sys.stderr,
        )

    for path in temporary_paths:
        if path.exists():
            path.unlink(missing_ok=True)
    return best_path is not None


def parse_args() -> argparse.Namespace:
    """Parses command line options for thumbnail generation."""
    parser = argparse.ArgumentParser(description="Create <=50 KB WebP bird thumbnails.")
    parser.add_argument("--in-dir", default=str(DEFAULT_INPUT_DIR), help="Source image directory")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUTPUT_DIR), help="Thumbnail output directory")
    parser.add_argument("--max-kb", type=int, default=50, help="Maximum thumbnail size in KB")
    parser.add_argument("--overwrite", action="store_true", help="Recreate existing thumbnails")
    parser.add_argument("--limit", type=int, help="Process only the first N source images")
    return parser.parse_args()


def main() -> int:
    """Builds the thumbnail folder and reports any files that could not be converted."""
    args = parse_args()
    input_dir = Path(args.in_dir)
    output_dir = Path(args.out_dir)
    max_bytes = args.max_kb * 1024

    if not input_dir.is_absolute():
        input_dir = (PROJECT_ROOT / input_dir).resolve()
    if not output_dir.is_absolute():
        output_dir = (PROJECT_ROOT / output_dir).resolve()

    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 1

    source_images = find_source_images(input_dir, output_dir)
    if args.limit:
        source_images = source_images[: args.limit]

    print(f"Creating thumbnails for {len(source_images)} images into {output_dir}")
    failures: list[str] = []
    created = 0
    skipped = 0

    for index, source_path in enumerate(source_images, start=1):
        target_path = output_dir / f"{source_path.stem}.webp"
        if target_path.exists() and target_path.stat().st_size <= max_bytes and not args.overwrite:
            skipped += 1
            continue

        print(f"[{index}/{len(source_images)}] {source_path.name}")
        if make_thumbnail(source_path, target_path, max_bytes):
            created += 1
        else:
            failures.append(source_path.name)

    print(f"Created/updated: {created}; skipped: {skipped}; failed: {len(failures)}")
    if failures:
        print("Failed files:")
        for name in failures:
            print(f"- {name}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
