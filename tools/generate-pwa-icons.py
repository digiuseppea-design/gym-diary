"""Generate Gym Diary PWA icons from the existing notebook brand mark."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "app" / "icons"
CANVAS = 1024


def build_icon() -> Image.Image:
    image = Image.new("RGB", (CANVAS, CANVAS), "#f5f0e7")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((152, 152, 872, 872), radius=184, fill="#a94f38")

    white = "#fffdf8"
    width = 60
    draw.line((394, 310, 672, 310, 732, 370, 732, 750, 394, 750), fill=white, width=width, joint="curve")
    draw.line((394, 310, 394, 750), fill=white, width=width)
    draw.line((394, 310, 310, 310, 254, 366, 254, 610, 310, 694, 394, 750), fill=white, width=width, joint="curve")
    draw.line((476, 464, 634, 464), fill=white, width=width)
    draw.line((476, 570, 602, 570), fill=white, width=width)
    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    source = build_icon()
    outputs = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-maskable-512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
    }
    for filename, size in outputs.items():
        source.resize((size, size), Image.Resampling.LANCZOS).save(ICON_DIR / filename, optimize=True)


if __name__ == "__main__":
    main()
