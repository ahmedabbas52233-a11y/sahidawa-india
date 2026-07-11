#!/usr/bin/env python3
"""
SahiDawa — PR Engineering Comic Generator
==========================================
Generates a 16:9 whiteboard-style engineering micro-comic for each merged PR.
Style: Hand-drawn stickman on clean white/off-white background, developer humor.

Outputs: /tmp/pr_comic.png (1920×1080)
"""

import os
import sys
import io
import math
import textwrap
import requests
from PIL import Image, ImageDraw, ImageFont


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
W, H = 1920, 1080
BG_COLOR     = (252, 250, 248)   # warm off-white
INK          = (20, 20, 20)      # near-black ink
INK_LIGHT    = (120, 120, 120)   # light gray text
RED_STAT     = (200, 60, 60)
GREEN_STAT   = (50, 160, 80)
CARD_BG      = (255, 255, 255)
CARD_BORDER  = (210, 210, 210)
GRID_COLOR   = (220, 218, 215)   # subtle dot-grid
OUT_PATH     = "/tmp/pr_comic.png"


# ─────────────────────────────────────────────────────────────────────────────
# FONT LOADING  (falls back to PIL default if unavailable)
# ─────────────────────────────────────────────────────────────────────────────
def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


# ─────────────────────────────────────────────────────────────────────────────
# DRAWING PRIMITIVES
# ─────────────────────────────────────────────────────────────────────────────
def draw_grid(draw: ImageDraw.Draw, x0: int, y0: int, x1: int, y1: int, step: int = 40):
    """Subtle dot grid in a region."""
    for x in range(x0, x1, step):
        for y in range(y0, y1, step):
            draw.ellipse([x-1, y-1, x+1, y+1], fill=GRID_COLOR)


def draw_stickman(draw: ImageDraw.Draw, cx: int, cy: int, size: int = 60,
                  lean: float = 0.0, sweat: bool = False):
    """Draw a simple stickman centered at (cx, cy).
    lean: pixel offset of head/body from vertical (negative = lean back)
    """
    r = size // 5            # head radius
    body_h = size // 2       # body length
    leg_h = size // 2
    arm_h = size // 3

    # Head
    hx = cx + lean
    draw.ellipse([hx - r, cy - r, hx + r, cy + r], outline=INK, width=3)
    # Eyes (dots)
    draw.ellipse([hx - r//2 - 2, cy - 4, hx - r//2 + 2, cy], fill=INK)
    draw.ellipse([hx + r//2 - 2, cy - 4, hx + r//2 + 2, cy], fill=INK)
    # Mouth (slight frown or neutral)
    draw.arc([hx - r//2, cy + 2, hx + r//2, cy + r//2], start=0, end=180, fill=INK, width=2)

    # Body
    neck_y = cy + r
    waist_y = neck_y + body_h
    body_cx = cx + lean // 2
    draw.line([(hx, neck_y), (body_cx, waist_y)], fill=INK, width=3)

    # Arms
    arm_y = neck_y + body_h // 3
    draw.line([(body_cx, arm_y), (body_cx - arm_h, arm_y + arm_h // 2)], fill=INK, width=3)
    draw.line([(body_cx, arm_y), (body_cx + arm_h, arm_y + arm_h // 2)], fill=INK, width=3)

    # Legs
    draw.line([(body_cx, waist_y), (cx - size // 4, waist_y + leg_h)], fill=INK, width=3)
    draw.line([(body_cx, waist_y), (cx + size // 4, waist_y + leg_h)], fill=INK, width=3)

    # Sweat drop
    if sweat:
        sx, sy = hx + r + 4, cy - r + 8
        draw.ellipse([sx, sy, sx + 10, sy + 14], fill=(180, 210, 240))

    return (hx, cy - r, body_cx, waist_y)   # (head_x, head_top, body_cx, waist_y)


def draw_speech_bubble(draw: ImageDraw.Draw, x: int, y: int, text: str,
                       font: ImageFont.FreeTypeFont, direction: str = "left",
                       small: bool = False):
    """Rounded rect speech bubble with a tail."""
    pad = 10 if small else 14
    lines = textwrap.wrap(text, width=18 if small else 15)
    line_h = font.size + 4
    bw = max(len(l) for l in lines) * (font.size // 2 + 1) + pad * 2
    bh = len(lines) * line_h + pad * 2

    # box
    bx, by = x - bw // 2, y - bh
    draw.rounded_rectangle([bx, by, bx + bw, by + bh], radius=10,
                            fill=(255, 255, 255), outline=INK, width=2)
    # tail
    if direction == "left":
        draw.polygon([(bx + 10, by + bh), (bx + 20, by + bh), (bx + 5, by + bh + 12)],
                     fill=(255, 255, 255))
        draw.line([(bx + 10, by + bh), (bx + 5, by + bh + 12), (bx + 20, by + bh)],
                  fill=INK, width=2)
    else:
        draw.polygon([(bx + bw - 10, by + bh), (bx + bw - 20, by + bh), (bx + bw - 5, by + bh + 12)],
                     fill=(255, 255, 255))
        draw.line([(bx + bw - 10, by + bh), (bx + bw - 5, by + bh + 12), (bx + bw - 20, by + bh)],
                  fill=INK, width=2)
    # text
    for i, line in enumerate(lines):
        draw.text((bx + pad, by + pad + i * line_h), line, fill=INK, font=font)


def draw_label_tag(draw: ImageDraw.Draw, cx: int, bottom_y: int, text: str,
                   font: ImageFont.FreeTypeFont):
    """Label below a stickman."""
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, bottom_y + 6), text, fill=INK, font=font)


def draw_box_stack(draw: ImageDraw.Draw, cx: int, bottom_y: int,
                   labels: list, sizes: list, arm_y: int):
    """Boxes stacked on each other, held up at arm_y."""
    fn_sm = _load_font(18, bold=True)
    y = bottom_y
    for label, bw in zip(reversed(labels), reversed(sizes)):
        bh = 38 if bw < 100 else 56
        x0, y0 = cx - bw // 2, y - bh
        draw.rectangle([x0, y0, x0 + bw, y0], fill=None)
        draw.rectangle([x0, y0, x0 + bw, y], fill=(245, 245, 240),
                       outline=INK, width=3)
        # box label
        bbox = fn_sm.getbbox(label)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, y0 + (bh - fn_sm.size) // 2), label,
                  fill=INK, font=fn_sm)
        y = y0


def draw_arrow(draw: ImageDraw.Draw, x0: int, y0: int, x1: int, y1: int, label: str = ""):
    """Simple arrow."""
    draw.line([(x0, y0), (x1, y1)], fill=INK, width=3)
    # Arrowhead
    angle = math.atan2(y1 - y0, x1 - x0)
    arrow_len = 16
    for side in [0.4, -0.4]:
        ax = x1 - arrow_len * math.cos(angle - side)
        ay = y1 - arrow_len * math.sin(angle - side)
        draw.line([(x1, y1), (ax, ay)], fill=INK, width=3)
    if label:
        mx, my = (x0 + x1) // 2, (y0 + y1) // 2 - 16
        draw.text((mx, my), label, fill=INK, font=_load_font(18))


def draw_loading_spinner(draw: ImageDraw.Draw, cx: int, cy: int, r: int = 12):
    """Little spinning dashes (static representation)."""
    for i in range(8):
        angle = math.radians(i * 45)
        x0 = cx + int((r - 5) * math.cos(angle))
        y0 = cy + int((r - 5) * math.sin(angle))
        x1 = cx + int(r * math.cos(angle))
        y1 = cy + int(r * math.sin(angle))
        alpha = 40 + i * 27
        draw.line([(x0, y0), (x1, y1)], fill=(INK[0], INK[1], INK[2]), width=2)


def draw_handwritten(draw: ImageDraw.Draw, x: int, y: int, text: str, size: int = 22):
    """Simulate handwritten feel using italic-ish font."""
    fn = _load_font(size, bold=False)
    draw.text((x, y), text, fill=INK, font=fn)


def fetch_avatar(url: str) -> Image.Image | None:
    """Download contributor avatar and return as circular PIL image."""
    if not url:
        return None
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
        img = img.resize((90, 90), Image.LANCZOS)
        # Circular mask
        mask = Image.new("L", (90, 90), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, 90, 90], fill=255)
        img.putalpha(mask)
        return img
    except Exception as e:
        print(f"⚠️  Avatar fetch failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# MAIN COMIC BUILDER
# ─────────────────────────────────────────────────────────────────────────────
def generate_comic(pr: dict) -> str:
    """
    Build the stickman engineering comic for a PR.
    Returns the output path on success, raises on failure.
    """
    pr_number   = pr.get("number", "???")
    pr_title    = pr.get("title", "Untitled PR")
    pr_author   = pr.get("author", "contributor")
    pr_avatar   = pr.get("author_avatar", "")
    pr_url      = pr.get("url", "")
    pr_repo     = pr.get("repo", "RatLoopz/sahidawa-india")
    lines_ch    = pr.get("lines_changed", "0")
    pr_additions = pr.get("additions", "?")
    pr_deletions = pr.get("deletions", "?")
    pr_files     = pr.get("files_count", "?")
    pr_commits   = pr.get("commits_count", "?")

    # Extract short action from title for boxes
    title_lower = pr_title.lower()
    if "image" in title_lower or "photo" in title_lower:
        heavy_box = "IMAGE\nPROCESSING"
    elif "api" in title_lower:
        heavy_box = "API\nCALLS"
    elif "db" in title_lower or "database" in title_lower or "query" in title_lower:
        heavy_box = "DB\nQUERIES"
    elif "cache" in title_lower:
        heavy_box = "CACHE\nLOGIC"
    elif "auth" in title_lower or "login" in title_lower:
        heavy_box = "AUTH\nCHECKS"
    elif "scrape" in title_lower or "scraper" in title_lower or "etl" in title_lower:
        heavy_box = "DATA\nSCRAPE"
    elif "worker" in title_lower or "thread" in title_lower:
        heavy_box = "HEAVY\nWORK"
    elif "upload" in title_lower or "file" in title_lower:
        heavy_box = "FILE\nUPLOAD"
    elif "notif" in title_lower:
        heavy_box = "NOTIFY\nFLOW"
    else:
        heavy_box = "HEAVY\nTASK"

    # ── Canvas
    img  = Image.new("RGB", (W, H), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # ── Grid accents (top-right corner & bottom-left corner only)
    draw_grid(draw, W - 260, 30, W - 30, 260, step=30)
    draw_grid(draw, 30, H - 260, 260, H - 30, step=30)

    # ── Fonts
    fn_hand   = _load_font(24)
    fn_label  = _load_font(22, bold=True)
    fn_bubble = _load_font(22)
    fn_bub_sm = _load_font(18)
    fn_title  = _load_font(32, bold=True)
    fn_cap    = _load_font(26, bold=True)
    fn_cap_sm = _load_font(20)
    fn_brand  = _load_font(36, bold=True)
    fn_tag    = _load_font(20)

    # ── Top-left handwritten annotation
    draw.text((48, 44), "'meanwhile, inside\nthe browser...'", fill=INK, font=fn_hand)

    # ═══════════════════════════════════════════════════════════════
    # SCENE 1 — MAIN THREAD (left, leaning back, carrying boxes)
    # ═══════════════════════════════════════════════════════════════
    mt_cx, mt_cy = 320, 380
    sm1 = draw_stickman(draw, mt_cx, mt_cy, size=80, lean=-18, sweat=True)

    # Boxes above stickman (arm_y ≈ neck_y + 1/3 body)
    box_bottom = mt_cy - 80 - 12   # just above the hands
    draw_box_stack(draw, mt_cx - 12, box_bottom,
                   ["UI", "INPUT", "RENDER", heavy_box],
                   [60, 70, 70, 110],
                   arm_y=sm1[3] - 30)

    # Speech bubble
    draw_speech_bubble(draw, mt_cx + 30, mt_cy - 85, "I'm fine.",
                       fn_bubble, direction="left")

    # Loading spinner beside stickman
    draw_loading_spinner(draw, mt_cx + 90, mt_cy + 20)

    # Label
    draw_label_tag(draw, mt_cx, sm1[3] + 80, "MAIN THREAD", fn_label)

    # ═══════════════════════════════════════════════════════════════
    # SCENE 1 — WEB WORKER (right, casual)
    # ═══════════════════════════════════════════════════════════════
    ww_cx, ww_cy = 680, 370
    sm2 = draw_stickman(draw, ww_cx, ww_cy, size=80)

    # Speech bubbles — stacked
    draw_speech_bubble(draw, ww_cx - 20, ww_cy - 90, "bro.",
                       fn_bubble, direction="right")
    draw_speech_bubble(draw, ww_cx - 10, ww_cy - 145, "you're literally\nfreezing.",
                       fn_bub_sm, direction="right", small=True)

    draw_label_tag(draw, ww_cx, sm2[3] + 80, "WEB WORKER", fn_label)

    # ═══════════════════════════════════════════════════════════════
    # SCENE 2 — TRANSITION (center-right area)
    # ═══════════════════════════════════════════════════════════════
    # WW walking toward MT (WW now at ~900, MT now at ~760)
    mt2_cx, mt2_cy = 830, 420
    ww2_cx, ww2_cy = 1000, 415

    sm3 = draw_stickman(draw, mt2_cx, mt2_cy, size=70)    # Main Thread relieved
    sm4 = draw_stickman(draw, ww2_cx, ww2_cy, size=70)    # Web Worker approaching

    # WW's "give me" bubble
    draw_speech_bubble(draw, ww2_cx - 30, ww2_cy - 85, "give me the\nimage stuff.",
                       fn_bub_sm, direction="right", small=True)

    # Arrow showing box transfer
    heavy_box_x = (mt2_cx + ww2_cx) // 2
    heavy_box_y = mt2_cy - 30
    hbw, hbh = 120, 55
    draw.rectangle([heavy_box_x - hbw//2, heavy_box_y - hbh,
                    heavy_box_x + hbw//2, heavy_box_y],
                   fill=(245, 245, 240), outline=INK, width=3)
    fn_box = _load_font(17, bold=True)
    tw = fn_box.getbbox(heavy_box.replace("\n"," "))[2]
    for i, part in enumerate(heavy_box.split("\n")):
        pw = fn_box.getbbox(part)[2]
        draw.text((heavy_box_x - pw//2, heavy_box_y - hbh + 8 + i*22),
                  part, fill=INK, font=fn_box)

    draw_arrow(draw, heavy_box_x - hbw//2 - 4, heavy_box_y - hbh//2,
               heavy_box_x + hbw//2 + 60, heavy_box_y - hbh//2)

    # MT's relief boxes (only 3 small ones)
    draw_box_stack(draw, mt2_cx - 8, mt2_cy - 75,
                   ["UI", "INPUT", "RENDER"], [58, 65, 65], arm_y=0)

    draw_speech_bubble(draw, mt2_cx + 20, mt2_cy - 85, "...oh.",
                       fn_bub_sm, direction="left", small=True)
    draw_speech_bubble(draw, ww2_cx + 20, ww2_cy - 70, "yeah.",
                       fn_bub_sm, direction="right", small=True)

    # "PR entered the chat" caption between scenes
    pc_text = f"PR #{pr_number} entered the chat."
    draw.text((750, 520), pc_text, fill=INK, font=_load_font(28, bold=True))

    # ═══════════════════════════════════════════════════════════════
    # GITHUB PR CARD  (bottom-left quadrant)
    # ═══════════════════════════════════════════════════════════════
    card_x0, card_y0 = 50, 580
    card_w, card_h   = 640, 180
    draw.rounded_rectangle([card_x0, card_y0, card_x0 + card_w, card_y0 + card_h],
                           radius=14, fill=CARD_BG, outline=CARD_BORDER, width=2)

    # Repo header
    draw.text((card_x0 + 20, card_y0 + 14), pr_repo, fill=INK_LIGHT, font=_load_font(19))

    # PR title
    fn_pr_title = _load_font(26, bold=True)
    pr_title_short = pr_title[:55] + ("…" if len(pr_title) > 55 else "")
    draw.text((card_x0 + 20, card_y0 + 42), f"#{pr_number}  {pr_title_short}",
              fill=(30, 90, 200), font=fn_pr_title)

    # Stats row
    stats_y = card_y0 + 92
    draw.text((card_x0 + 20, stats_y), f"@{pr_author}  •  {pr_files} files  •  {pr_commits} commits",
              fill=INK_LIGHT, font=_load_font(19))

    # +/- badges
    badge_y = card_y0 + 128
    draw.text((card_x0 + 20, badge_y), f"+{pr_additions}", fill=GREEN_STAT,
              font=_load_font(22, bold=True))
    draw.text((card_x0 + 100, badge_y), f"−{pr_deletions}", fill=RED_STAT,
              font=_load_font(22, bold=True))

    # Avatar circle
    avatar_img = fetch_avatar(pr_avatar)
    if avatar_img:
        img.paste(avatar_img, (card_x0 + card_w - 115, card_y0 + (card_h - 90) // 2),
                  avatar_img)
    else:
        draw.ellipse([card_x0 + card_w - 115, card_y0 + 45,
                      card_x0 + card_w - 25, card_y0 + 135],
                     outline=CARD_BORDER, width=2)

    # "This person fixed it" annotation
    ann_x = card_x0 + card_w - 110
    ann_y = card_y0 - 52
    draw.text((ann_x - 90, ann_y), "this person fixed\nthe workload drama ↓", fill=INK, font=_load_font(18))
    draw.line([(ann_x - 20, ann_y + 38), (ann_x + 25, ann_y + 55)], fill=INK, width=2)
    # mini label below avatar
    draw.text((card_x0 + card_w - 120, card_y0 + card_h + 6),
              f"@{pr_author}", fill=INK, font=_load_font(18))
    draw.text((card_x0 + card_w - 120, card_y0 + card_h + 28),
              "cooked this one 👨‍🍳", fill=INK, font=_load_font(17))

    # ═══════════════════════════════════════════════════════════════
    # TECHNICAL CAPTION  (bottom-center)
    # ═══════════════════════════════════════════════════════════════
    # Short description derived from title
    if len(pr_title) > 80:
        cap_title = pr_title[:78] + "…"
    else:
        cap_title = pr_title

    cap_y = 600
    cap_x = 730
    draw.text((cap_x, cap_y), cap_title, fill=INK, font=fn_cap)
    draw.text((cap_x, cap_y + 46),
              "better code separation.  less blocking.  more throughput.",
              fill=INK_LIGHT, font=fn_cap_sm)

    # ═══════════════════════════════════════════════════════════════
    # BOTTOM BRANDING
    # ═══════════════════════════════════════════════════════════════
    brand_y = H - 110
    # Separator line
    draw.line([(80, brand_y - 16), (W - 80, brand_y - 16)], fill=CARD_BORDER, width=1)

    brand_text = "SahiDawa — सही दवा"
    bw = fn_brand.getbbox(brand_text)[2]
    draw.text(((W - bw) // 2, brand_y), brand_text, fill=INK, font=fn_brand)

    sub_text = "engineering notes from an open-source healthcare project"
    sw = fn_cap_sm.getbbox(sub_text)[2]
    draw.text(((W - sw) // 2, brand_y + 44), sub_text, fill=INK_LIGHT, font=fn_cap_sm)

    gss_text = "GSSoC '26"
    gw = fn_tag.getbbox(gss_text)[2]
    draw.text(((W - gw) // 2, brand_y + 72), gss_text, fill=INK_LIGHT, font=fn_tag)

    img.save(OUT_PATH, "PNG", optimize=True)
    print(f"✅ Comic saved to {OUT_PATH}")
    return OUT_PATH


# ─────────────────────────────────────────────────────────────────────────────
# CLI usage (called from linkedin_shoutout.py)
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    pr = {
        "number":       os.environ.get("PR_NUMBER", "0"),
        "title":        os.environ.get("PR_TITLE", "Untitled PR"),
        "author":       os.environ.get("PR_AUTHOR", "contributor"),
        "author_avatar":os.environ.get("PR_AUTHOR_AVATAR", ""),
        "url":          os.environ.get("PR_URL", ""),
        "repo":         os.environ.get("PR_REPO", "RatLoopz/sahidawa-india"),
        "lines_changed":os.environ.get("PR_LINES_CHANGED", "0"),
        "additions":    os.environ.get("PR_ADDITIONS", "?"),
        "deletions":    os.environ.get("PR_DELETIONS", "?"),
        "files_count":  os.environ.get("PR_FILES_COUNT", "?"),
        "commits_count":os.environ.get("PR_COMMITS_COUNT", "?"),
    }
    try:
        path = generate_comic(pr)
        print(path)
    except Exception as e:
        print(f"❌ Comic generation failed: {e}", file=sys.stderr)
        sys.exit(1)
