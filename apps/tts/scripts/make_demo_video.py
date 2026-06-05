from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "recordings"
WAV_PATH = ROOT / "outputs" / "recording_demo_announcer_male.wav"
VIDEO_PATH = OUT_DIR / "tts_demo_walkthrough.mp4"

WIDTH = 1280
HEIGHT = 720
FPS = 24


def load_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\consola.ttf"),
        Path(r"C:\Windows\Fonts\cour.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


FONT_TITLE = load_font(34)
FONT_BODY = load_font(24)
FONT_SMALL = load_font(20)


def make_canvas() -> Image.Image:
    return Image.new("RGB", (WIDTH, HEIGHT), (18, 18, 18))


def draw_lines(img: Image.Image, lines: list[str], x: int, y: int, font, fill):
    draw = ImageDraw.Draw(img)
    line_height = int(font.size * 1.45)
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height


def slide_title() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Local GPT-SoVITS TTS Demo", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            "This walkthrough shows the live local service flow.",
            "It checks health, selects a voice, sends new text, and confirms the wav file.",
        ],
        60,
        130,
        FONT_BODY,
        (235, 235, 235),
    )
    draw.text((60, 620), "No rented server. 3 selectable voices. API ready.", font=FONT_SMALL, fill=(170, 170, 170))
    return img


def slide_health() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Step 1  Health check", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            "GET http://127.0.0.1:8008/health",
            '{',
            '  "status": "ok",',
            '  "gpt_sovits_api": "http://127.0.0.1:9880",',
            '  "gpt_sovits_reachable": true',
            '}',
        ],
        60,
        140,
        FONT_BODY,
        (225, 225, 225),
    )
    return img


def slide_voices() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Step 2  Selectable voices", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            "gentle_female   | 温柔女生   | slower, softer",
            "lively_female   | 活泼女生   | faster, brighter",
            "announcer_male  | 播音腔男生 | steady, formal",
        ],
        60,
        150,
        FONT_BODY,
        (225, 225, 225),
    )
    return img


def slide_synthesis() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Step 3  Live synthesis request", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            'Text: "Welcome to the smart radio demo..."',
            "Voice: announcer_male",
            "POST http://127.0.0.1:8008/synthesize",
        ],
        60,
        150,
        FONT_BODY,
        (225, 225, 225),
    )
    return img


def slide_output() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Step 4  Generated output", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            f"File: {WAV_PATH}",
            "The wav file was generated from the text shown above.",
        ],
        60,
        150,
        FONT_BODY,
        (225, 225, 225),
    )
    return img


def slide_end() -> Image.Image:
    img = make_canvas()
    draw = ImageDraw.Draw(img)
    draw.text((60, 50), "Done", font=FONT_TITLE, fill=(120, 255, 150))
    draw_lines(
        img,
        [
            "The service is running locally.",
            "Three voices are available through the API.",
            "The demo text is synthesized on demand.",
        ],
        60,
        150,
        FONT_BODY,
        (225, 225, 225),
    )
    return img


def frame_from_image(img: Image.Image):
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slides = [
        (slide_title(), 3),
        (slide_health(), 5),
        (slide_voices(), 5),
        (slide_synthesis(), 5),
        (slide_output(), 5),
        (slide_end(), 3),
    ]

    writer = cv2.VideoWriter(
        str(VIDEO_PATH),
        cv2.VideoWriter_fourcc(*"mp4v"),
        FPS,
        (WIDTH, HEIGHT),
    )
    if not writer.isOpened():
        raise RuntimeError("Failed to open video writer")

    for img, seconds in slides:
        frame = frame_from_image(img)
        for _ in range(seconds * FPS):
            writer.write(frame)

    writer.release()
    print(VIDEO_PATH)


if __name__ == "__main__":
    main()
