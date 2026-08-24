#!/usr/bin/env python3
"""Build deterministic web renditions from the canonical mobile brand mark.

The source image is never modified. The full-size web master is copied byte for
byte; smaller web icons and the social canvas are resampled from those exact
pixels without redrawing, recoloring, or tracing the mark.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps" / "mobile" / "assets" / "brand" / "logo-mark-circle.png"
PUBLIC = ROOT / "apps" / "web" / "public"
BRAND = PUBLIC / "assets" / "brand"
MANIFEST = BRAND / "brand-assets-manifest.json"

EXPECTED_SOURCE_SHA256 = "a90e02e2ef2b5c6363a19679882af8634c50eb9665a967bef67379124b104c6b"
EXPECTED_SOURCE_SIZE = (1024, 1024)
EXPECTED_SOURCE_MODE = "RGBA"
BACKGROUND = (250, 244, 238, 255)
RESAMPLE = Image.Resampling.LANCZOS


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()


def ico_bytes(source: Image.Image) -> bytes:
    output = io.BytesIO()
    source.save(output, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    return output.getvalue()


def resized_png(source: Image.Image, size: int) -> bytes:
    return png_bytes(source.resize((size, size), RESAMPLE))


def social_preview(source: Image.Image) -> bytes:
    canvas = Image.new("RGBA", (1200, 630), BACKGROUND)
    mark = source.resize((420, 420), RESAMPLE)
    canvas.alpha_composite(
        mark,
        ((canvas.width - mark.width) // 2, (canvas.height - mark.height) // 2),
    )
    return png_bytes(canvas.convert("RGB"))


def source_image() -> tuple[bytes, Image.Image]:
    source_bytes = SOURCE.read_bytes()
    source_hash = sha256(source_bytes)
    if source_hash != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(
            "Canonical logo hash changed. Review the new source intentionally, then update "
            f"EXPECTED_SOURCE_SHA256. Expected {EXPECTED_SOURCE_SHA256}, received {source_hash}."
        )

    image = Image.open(io.BytesIO(source_bytes))
    image.load()
    if image.size != EXPECTED_SOURCE_SIZE or image.mode != EXPECTED_SOURCE_MODE:
        raise RuntimeError(
            "Canonical logo must remain a 1024x1024 RGBA PNG; "
            f"received size={image.size}, mode={image.mode}."
        )
    return source_bytes, image


def build_outputs(source_bytes: bytes, source: Image.Image) -> dict[Path, bytes]:
    return {
        BRAND / "logo-mark-circle.png": source_bytes,
        PUBLIC / "favicon.ico": ico_bytes(source),
        PUBLIC / "apple-touch-icon.png": resized_png(source, 180),
        BRAND / "icon-192.png": resized_png(source, 192),
        BRAND / "icon-512.png": resized_png(source, 512),
        BRAND / "social-preview-1200x630.png": social_preview(source),
    }


def output_metadata(path: Path, data: bytes) -> dict[str, object]:
    relative = path.relative_to(ROOT).as_posix()
    public_path = "/" + path.relative_to(PUBLIC).as_posix()
    record: dict[str, object] = {
        "path": relative,
        "public_path": public_path,
        "sha256": sha256(data),
        "bytes": len(data),
    }
    if path.suffix == ".png":
        image = Image.open(io.BytesIO(data))
        record.update({"width": image.width, "height": image.height, "mode": image.mode})
    elif path.suffix == ".ico":
        image = Image.open(io.BytesIO(data))
        record["sizes"] = sorted([list(size) for size in image.ico.sizes()])
    return record


def manifest_bytes(outputs: dict[Path, bytes]) -> bytes:
    payload = {
        "schema_version": 1,
        "source": {
            "path": SOURCE.relative_to(ROOT).as_posix(),
            "sha256": EXPECTED_SOURCE_SHA256,
            "width": EXPECTED_SOURCE_SIZE[0],
            "height": EXPECTED_SOURCE_SIZE[1],
            "mode": EXPECTED_SOURCE_MODE,
        },
        "outputs": [output_metadata(path, data) for path, data in sorted(outputs.items())],
    }
    return (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode()


def write_if_changed(path: Path, data: bytes) -> bool:
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify committed renditions without writing files.",
    )
    args = parser.parse_args()

    source_bytes, source = source_image()
    outputs = build_outputs(source_bytes, source)
    outputs[MANIFEST] = manifest_bytes(outputs)

    if args.check:
        mismatches = [
            path
            for path, expected in outputs.items()
            if not path.exists() or path.read_bytes() != expected
        ]
        if mismatches:
            for path in mismatches:
                print(f"out of date: {path.relative_to(ROOT)}", file=sys.stderr)
            return 1
        print(f"Verified {len(outputs)} canonical web brand assets.")
        return 0

    changed = [path for path, data in outputs.items() if write_if_changed(path, data)]
    for path in changed:
        print(f"wrote {path.relative_to(ROOT)}")
    print(f"Canonical web brand assets are current ({len(changed)} changed).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
