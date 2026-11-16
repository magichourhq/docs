from pathlib import Path

from PIL import Image


def source_image(source_path: Path) -> Image.Image:
    with Image.open(source_path) as image:
        return image.convert("RGB")


def thumbnail(source_image: Image.Image) -> Image.Image:
    result = source_image.copy()
    result.thumbnail((320, 320), resample=Image.Resampling.LANCZOS)
    return result


def saved_thumbnail(thumbnail: Image.Image, output_path: Path) -> Path:
    with output_path.open("xb") as output:
        thumbnail.save(output, format="PNG")
    return output_path
