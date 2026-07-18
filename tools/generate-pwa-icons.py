"""Generate Gym Diary PWA icons from the raster source icon."""

from collections import deque
from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "app" / "icons"
BACKGROUND = (250, 247, 241, 255)


def remove_black_background(image: Image.Image) -> Image.Image:
    icon = image.convert("RGBA")
    pixels = []
    data = icon.get_flattened_data() if hasattr(icon, "get_flattened_data") else icon.getdata()
    for red, green, blue, alpha in data:
        if alpha and red < 18 and green < 18 and blue < 18:
            pixels.append(BACKGROUND)
        else:
            pixels.append((red, green, blue, alpha))
    icon.putdata(pixels)
    return icon


def flatten_outer_background(image: Image.Image) -> Image.Image:
    icon = image.convert("RGBA")
    width, height = icon.size
    pixels = icon.load()
    queue = deque()
    seen = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    def is_background(pixel) -> bool:
        red, green, blue, alpha = pixel
        if alpha == 0:
            return True
        if red < 25 and green < 25 and blue < 25:
            return True
        return red > 185 and green > 178 and blue > 165

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        if not is_background(pixels[x, y]):
            continue
        seen.add((x, y))
        pixels[x, y] = BACKGROUND
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return icon


def trim_outer_edge(image: Image.Image, ratio: float = 0.028) -> Image.Image:
    icon = image.convert("RGBA")
    width, height = icon.size
    inset = max(1, round(min(width, height) * ratio))
    return icon.crop((inset, inset, width - inset, height - inset))


def wipe_outer_margin(image: Image.Image, ratio: float = 0.075) -> Image.Image:
    icon = image.convert("RGBA")
    width, height = icon.size
    margin = max(1, round(min(width, height) * ratio))
    pixels = icon.load()
    for y in range(height):
      for x in range(width):
        if x < margin or y < margin or x >= width - margin or y >= height - margin:
          pixels[x, y] = BACKGROUND
    return icon


def remove_outer_artifacts(image: Image.Image, ratio: float = 0.2) -> Image.Image:
    icon = image.convert("RGBA")
    width, height = icon.size
    inset = max(1, round(min(width, height) * ratio))
    pixels = icon.load()
    for y in range(height):
      for x in range(width):
        outside_safe_area = x < inset or y < inset or x >= width - inset or y >= height - inset
        red, green, blue, alpha = pixels[x, y]
        dark_artifact = alpha and red < 80 and green < 80 and blue < 80
        if outside_safe_area and dark_artifact:
          pixels[x, y] = BACKGROUND
    return icon


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    source = flatten_outer_background(trim_outer_edge(remove_black_background(Image.open(ICON_DIR / "icon-source.png"))))
    maskable_source = flatten_outer_background(remove_black_background(Image.open(ICON_DIR / "icon-maskable-source.png")))
    outputs = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
    }
    for filename, size in outputs.items():
        wipe_outer_margin(flatten_outer_background(source.resize((size, size), Image.Resampling.LANCZOS))).save(ICON_DIR / filename, optimize=True)
    maskable_outputs = {
        "icon-maskable-192.png": 192,
        "icon-maskable-512.png": 512,
    }
    for filename, size in maskable_outputs.items():
        wipe_outer_margin(flatten_outer_background(maskable_source.resize((size, size), Image.Resampling.LANCZOS)), 0.2).save(ICON_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()
