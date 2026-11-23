#!/usr/bin/env python3
"""Prepare local project and terrain card images from the original image sheets."""

from __future__ import annotations

import argparse
import hashlib
import io
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "Backend" / "imagenes vimod"
MAX_BYTES = 150 * 1024
TARGET_SIZE = (900, 300)
NEAR_WHITE = 245
WHITE_ROW_RATIO = 0.98
MIN_BAND_HEIGHT = 3
DUPLICATE_MEAN_DIFFERENCE = 1.5
RESAMPLING = Image.Resampling.LANCZOS


@dataclass
class Scene:
    source: Path
    scene_number: int
    normalized: Image.Image
    duplicate_of: str | None = None
    output_name: str | None = None
    status: str = "válida"


def image_files(folder: Path) -> list[Path]:
    supported = {".png", ".jpg", ".jpeg", ".webp"}
    return sorted(
        (path for path in folder.iterdir()
         if path.is_file() and path.suffix.lower() in supported),
        key=lambda path: (path.stat().st_mtime_ns, path.name.casefold()),
    )


def detect_white_bands(image: Image.Image) -> list[tuple[int, int]]:
    rgb = image.convert("RGB")
    red, green, blue = rgb.split()
    darkest_channel = ImageChops.darker(ImageChops.darker(red, green), blue)
    white_mask = darkest_channel.point(
        [0 if value < NEAR_WHITE else 255 for value in range(256)]
    )
    width, height = image.size
    white_rows = []
    for y in range(height):
        white_pixels = white_mask.crop((0, y, width, y + 1)).histogram()[255]
        white_rows.append(white_pixels / width > WHITE_ROW_RATIO)

    bands: list[tuple[int, int]] = []
    start: int | None = None
    for y, is_white in enumerate(white_rows + [False]):
        if is_white and start is None:
            start = y
        elif not is_white and start is not None:
            if y - start >= MIN_BAND_HEIGHT:
                bands.append((start, y))
            start = None
    return bands


def classify_image(image: Image.Image, bands: list[tuple[int, int]]) -> str:
    width, height = image.size
    if len(bands) >= 2:
        return "hoja de 3 escenas"
    if height > 1.8 * width:
        return "hoja de 3 escenas (tercios)"
    return "imagen única"


def scene_crops(image: Image.Image, bands: list[tuple[int, int]]) -> list[Image.Image]:
    width, height = image.size
    if len(bands) >= 2:
        separators = sorted(
            sorted(bands, key=lambda band: band[1] - band[0], reverse=True)[:2]
        )
        ranges = [
            (0, separators[0][0]),
            (separators[0][1], separators[1][0]),
            (separators[1][1], height),
        ]
        padding = 6
        return [
            image.crop((
                0,
                top + (padding if top > 0 else 0),
                width,
                bottom - (padding if bottom < height else 0),
            ))
            for top, bottom in ranges
        ]

    if height > 1.8 * width:
        first_cut = round(height / 3)
        second_cut = round(2 * height / 3)
        ranges = [(0, first_cut), (first_cut, second_cut), (second_cut, height)]
        padding = 10
        return [
            image.crop((
                0,
                top + (padding if top > 0 else 0),
                width,
                bottom - (padding if bottom < height else 0),
            ))
            for top, bottom in ranges
        ]
    return [image.copy()]


def crop_to_card_ratio(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("La escena tiene dimensiones vacías.")
    if width / height < 3:
        crop_height = max(1, round(width / 3))
        top = max(0, (height - crop_height) // 2)
        box = (0, top, width, min(height, top + crop_height))
    else:
        crop_width = max(1, round(height * 3))
        left = max(0, (width - crop_width) // 2)
        box = (left, 0, min(width, left + crop_width), height)
    return image.crop(box).resize(TARGET_SIZE, RESAMPLING)


def encoded_jpeg(image: Image.Image) -> bytes:
    for quality in range(82, 59, -1):
        buffer = io.BytesIO()
        image.convert("RGB").save(
            buffer, format="JPEG", quality=quality, optimize=True, progressive=True
        )
        data = buffer.getvalue()
        if len(data) <= MAX_BYTES:
            return data
    raise ValueError("La escena supera 150 KB incluso con calidad 60.")


def scene_signature(image: Image.Image) -> tuple[str, Image.Image]:
    thumbnail = image.convert("L").resize((96, 32), RESAMPLING)
    signature = hashlib.sha256(thumbnail.tobytes()).hexdigest()
    return signature, thumbnail


def is_duplicate(
    thumbnail: Image.Image,
    signature: str,
    previous: list[tuple[str, Image.Image, Scene]],
) -> Scene | None:
    for previous_signature, previous_thumbnail, previous_scene in previous:
        if signature == previous_signature:
            return previous_scene
        difference = ImageChops.difference(thumbnail, previous_thumbnail)
        if ImageStat.Stat(difference).mean[0] <= DUPLICATE_MEAN_DIFFERENCE:
            return previous_scene
    return None


def inventory(folder: Path) -> list[tuple[Path, int, int, str, str, list[tuple[int, int]]]]:
    result = []
    for path in image_files(folder):
        with Image.open(path) as image:
            width, height = image.size
            image_format = image.format or path.suffix.lstrip(".").upper()
            bands = detect_white_bands(image)
            result.append(
                (path, width, height, image_format, classify_image(image, bands), bands)
            )
    return result


def print_inventory(title: str, items: Iterable[tuple[Path, int, int, str, str, list[tuple[int, int]]]]) -> None:
    print(f"\nInventario: {title}")
    print("Archivo | Ancho x alto | Tipo | Franjas detectadas")
    for path, width, height, image_format, kind, bands in items:
        band_label = ", ".join(f"{start}-{end - 1}" for start, end in bands) or "ninguna"
        print(
            f"{path.name} ({image_format}) | {width} x {height} | "
            f"{kind} | {band_label}"
        )


def make_contact_sheet(scenes: list[Scene], destination: Path) -> None:
    columns = 3
    cell_width = 380
    image_width = 360
    image_height = 120
    label_height = 38
    margin = 10
    rows = max(1, (len(scenes) + columns - 1) // columns)
    sheet = Image.new(
        "RGB",
        (columns * cell_width, rows * (image_height + label_height + margin) + margin),
        "#f2f2f2",
    )
    draw = ImageDraw.Draw(sheet)
    for index, scene in enumerate(scenes, start=1):
        column = (index - 1) % columns
        row = (index - 1) // columns
        x = column * cell_width + margin
        y = row * (image_height + label_height + margin) + margin
        sheet.paste(
            scene.normalized.resize((image_width, image_height), RESAMPLING), (x, y)
        )
        source_label = unicodedata.normalize("NFKD", scene.source.name)
        source_label = source_label.encode("ascii", "ignore").decode("ascii")
        label = f"{index:02d}. {source_label} - escena {scene.scene_number}"
        if len(label) > 54:
            label = label[:51] + "..."
        draw.text((x, y + image_height + 4), label, fill="#111111")
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, format="PNG", optimize=True)


def process_category(
    category: str,
    source_folder: Path,
    output_folder: Path,
    prefix: str,
    maximum: int,
    contact_path: Path,
) -> None:
    all_scenes: list[Scene] = []
    for source in image_files(source_folder):
        with Image.open(source) as source_image:
            image = ImageOps.exif_transpose(source_image).convert("RGB")
            bands = detect_white_bands(image)
            for scene_number, crop in enumerate(scene_crops(image, bands), start=1):
                normalized = crop_to_card_ratio(crop)
                all_scenes.append(Scene(source, scene_number, normalized))

    unique_scenes: list[tuple[str, Image.Image, Scene]] = []
    output_scenes: list[Scene] = []
    for scene in all_scenes:
        signature, thumbnail = scene_signature(scene.normalized)
        duplicate = is_duplicate(thumbnail, signature, unique_scenes)
        if duplicate:
            scene.duplicate_of = duplicate.source.name + f" (escena {duplicate.scene_number})"
            scene.status = "duplicada"
            continue
        unique_scenes.append((signature, thumbnail, scene))
        if len(output_scenes) >= maximum:
            scene.status = f"sobrante (límite {maximum})"
            continue
        scene.output_name = f"{prefix}-{len(output_scenes) + 1}.jpg"
        output_scenes.append(scene)

    output_folder.mkdir(parents=True, exist_ok=True)
    for stale_output in output_folder.iterdir():
        if stale_output.is_file() and re.fullmatch(
            rf"{re.escape(prefix)}-\d+\.jpg", stale_output.name, re.IGNORECASE
        ):
            stale_output.unlink()

    for scene in output_scenes:
        data = encoded_jpeg(scene.normalized)
        (output_folder / scene.output_name).write_bytes(data)

    make_contact_sheet(all_scenes, contact_path)
    print(f"\n{category}: origen | escena | resultado")
    for scene in all_scenes:
        if scene.output_name:
            result = scene.output_name
        elif scene.duplicate_of:
            result = f"descartada: duplicada de {scene.duplicate_of}"
        else:
            result = scene.status
        print(f"{scene.source.name} | {scene.scene_number} | {result}")
    print(f"Hoja de contacto: {contact_path.relative_to(ROOT)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inventory-only",
        action="store_true",
        help="Muestra medidas y clasificación sin crear o reemplazar salidas.",
    )
    options = parser.parse_args()
    categories = [
        (
            "casas",
            SOURCE_ROOT / "Casas",
            ROOT / "assets" / "img" / "proyectos",
            "casa",
            15,
            SOURCE_ROOT / "revision-casas.png",
        ),
        (
            "terrenos",
            SOURCE_ROOT / "terrenos",
            ROOT / "assets" / "img" / "terrenos",
            "terreno",
            12,
            SOURCE_ROOT / "revision-terrenos.png",
        ),
    ]

    for category, source_folder, *_ in categories:
        if not source_folder.is_dir():
            raise FileNotFoundError(f"No existe la carpeta de origen: {source_folder}")
        items = inventory(source_folder)
        print_inventory(category, items)

    if options.inventory_only:
        return 0

    for category, source_folder, output_folder, prefix, maximum, contact_path in categories:
        process_category(
            category, source_folder, output_folder, prefix, maximum, contact_path
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Error al preparar imágenes: {error}", file=sys.stderr)
        raise
