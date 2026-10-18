#!/usr/bin/env python3
"""Genera le icone con la «Y» di Yonas (stessa dell'app): icons/icon-{16,32,48,128}.png. Uso: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw

BG, GOLD, SS = (28, 35, 50), (203, 157, 59), 8


def render(size):
    s = size * SS
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG + (255,))
    w = int(s * (0.16 if size <= 32 else 0.135))
    cx, top, joint, bottom, half = s / 2, s * 0.20, s * 0.52, s * 0.80, s * 0.24
    for a, b in (((cx - half, top), (cx, joint)), ((cx + half, top), (cx, joint)), ((cx, joint), (cx, bottom))):
        d.line([a, b], fill=GOLD + (255,), width=w)
        for p in (a, b):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=GOLD + (255,))
    return im.resize((size, size), Image.LANCZOS)


for n in (16, 32, 48, 128):
    render(n).save(f'icons/icon-{n}.png')
print('ok')
