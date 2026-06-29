#!/usr/bin/env python3
"""Build the Paragon Task Checklist & Build Update deck (landscape A4)."""
import fitz
from PIL import Image

SHOTS = "progress-updates/paragon-task-checklist-2026-06-29/screenshots"
OUT   = "progress-updates/paragon-task-checklist-2026-06-29/Paragon-Task-Checklist.pdf"

# ---- palette ----
NAVY   = (18/255, 33/255, 64/255)
NAVY2  = (28/255, 46/255, 84/255)
GOLD   = (182/255, 138/255, 58/255)
GOLD_L = (214/255, 178/255, 110/255)
CREAM  = (249/255, 246/255, 235/255)
GREEN  = (40/255, 132/255, 96/255)
AMBER  = (193/255, 138/255, 38/255)
INK    = (0.16, 0.20, 0.29)
INK2   = (0.42, 0.46, 0.54)
WHITE  = (1, 1, 1)
LINE   = (0.86, 0.85, 0.80)

W, H = 842, 595           # A4 landscape
M = 50

SERIF   = "Times-Roman"
SERIFB  = "Times-Bold"
SERIFI  = "Times-Italic"
SANS    = "Helvetica"
SANSB   = "Helvetica-Bold"

doc = fitz.open()

# Base-14 fonts only carry Latin-1, so map typographic glyphs to ASCII.
_MAP = {"“": '"', "”": '"', "‘": "'", "’": "'",
        "—": " - ", "–": "-", "→": "->", "⇄": "/",
        "↔": "/", "≥": ">=", "≤": "<=", "₹": "Rs ",
        "×": "x"}


def asc(s):
    if not isinstance(s, str):
        return s
    for k, v in _MAP.items():
        s = s.replace(k, v)
    return s


_oit = fitz.Page.insert_text
_oitb = fitz.Page.insert_textbox
fitz.Page.insert_text = lambda self, p, text, **k: _oit(self, p, asc(text), **k)
fitz.Page.insert_textbox = lambda self, r, text, **k: _oitb(self, r, asc(text), **k)


def spaced(s, n=1):
    return (" " * n).join(list(s))


def rrect(page, rect, fill=None, color=None, width=0.8, radius=0.06,
          fill_opacity=1, stroke_opacity=1):
    page.draw_rect(rect, color=color, fill=fill, width=width, radius=radius,
                   fill_opacity=fill_opacity, stroke_opacity=stroke_opacity)


def img_size(path):
    with Image.open(path) as im:
        return im.size


def framed(page, path, box, pad=9):
    """Fit image into box preserving aspect, draw a white card+shadow snugly."""
    iw, ih = img_size(path)
    bw, bh = box.width - 2 * pad, box.height - 2 * pad
    s = min(bw / iw, bh / ih)
    dw, dh = iw * s, ih * s
    cx, cy = (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2
    img = fitz.Rect(cx - dw / 2, cy - dh / 2, cx + dw / 2, cy + dh / 2)
    card = fitz.Rect(img.x0 - pad, img.y0 - pad, img.x1 + pad, img.y1 + pad)
    sh = card + (3.5, 4.5, 3.5, 4.5)
    page.draw_rect(sh, fill=(0.55, 0.56, 0.60), radius=0.05,
                   fill_opacity=0.18, width=0)
    rrect(page, card, fill=WHITE, color=LINE, width=0.7, radius=0.05)
    page.insert_image(img, filename=path, keep_proportion=True)
    return card


def status_pill(page, x, y, kind):
    """kind: 'done' or 'updated'. Returns right edge x."""
    if kind == "done":
        txt, col = "DONE", GREEN
    else:
        txt, col = "UPDATED FOR LIVE DATA", AMBER
    tw = fitz.get_text_length(spaced(txt), SANSB, 7.2)
    w = tw + 30
    r = fitz.Rect(x, y, x + w, y + 19)
    rrect(page, r, fill=col, radius=0.5, width=0)
    page.draw_circle((x + 12, y + 9.5), 2.4, fill=WHITE, width=0)
    page.insert_text((x + 19, y + 12.6), spaced(txt), fontsize=7.2,
                     fontname=SANSB, color=WHITE)
    return x + w


def kicker(page, x, y, text, color=GOLD, size=8.5):
    page.insert_text((x, y), spaced(text), fontsize=size, fontname=SANSB,
                     color=color)


def footer(page, pageno):
    y = H - 30
    page.draw_line((M, y), (W - M, y), color=LINE, width=0.7)
    page.insert_text((M, y + 13), "Task Checklist & Build Update", fontsize=8,
                     fontname=SANS, color=INK2)
    page.insert_text((M + 170, y + 13),
                     "·  Munshot  for  Paragon Partners (India)", fontsize=8,
                     fontname=SANS, color=INK2)
    rt = f"Page {pageno}"
    page.insert_text((W - M - fitz.get_text_length(rt, SANS, 8), y + 13), rt,
                     fontsize=8, fontname=SANS, color=INK2)


# ============================== COVER ==============================
def cover():
    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), fill=NAVY, width=0)
    # depth: faint lighter ellipse top-right + diagonal gold hairline
    p.draw_circle((W - 60, 70), 230, fill=NAVY2, fill_opacity=0.55, width=0)
    p.draw_circle((W - 10, 120), 150, fill=(0.10, 0.16, 0.30),
                  fill_opacity=0.4, width=0)
    # gold vertical bar (echoes reference)
    rrect(p, fitz.Rect(W - 60, 70, W - 49, H - 120), fill=GOLD, radius=0.5,
          width=0)

    x = M + 6
    p.draw_line((x, 132), (x + 34, 132), color=GOLD, width=2.2)
    p.insert_text((x, 122), spaced("WEEKLY BUILD UPDATE  ·  TASK CHECKLIST  ·  2026-06-29"),
                  fontsize=8.5, fontname=SANSB, color=GOLD_L)

    p.insert_text((x - 2, 230), "Task Checklist", fontsize=54,
                  fontname=SERIFB, color=CREAM)
    p.insert_text((x - 2, 288), "& Build Update", fontsize=54,
                  fontname=SERIFB, color=CREAM)
    p.insert_text((x, 322),
                  "Seven requested changes — what was asked, and the work delivered, with a zoomed-in view of each.",
                  fontsize=12, fontname=SANS, color=(0.80, 0.83, 0.90))

    # metadata blocks
    cols = [
        ("DATE", "2026-06-29"),
        ("PREPARED FOR", "Paragon Partners (India)"),
        ("SCOPE", "7 build tasks  ·  1 dashboard"),
    ]
    bx, by = x, 400
    for i, (lab, val) in enumerate(cols):
        cxx = bx + i * 235
        p.draw_line((cxx, by), (cxx + 200, by), color=(0.30, 0.38, 0.55),
                    width=0.8)
        p.insert_text((cxx, by + 18), spaced(lab), fontsize=7.5,
                      fontname=SANSB, color=GOLD_L)
        p.insert_text((cxx, by + 36), val, fontsize=12.5, fontname=SANSB,
                      color=CREAM)

    # status pill
    py = 470
    txt = "6 delivered   ·   1 updated as live data lands"
    tw = fitz.get_text_length(txt, SANSB, 11)
    r = fitz.Rect(x, py, x + tw + 46, py + 34)
    rrect(p, r, fill=None, color=GOLD, width=1.4, radius=0.5)
    p.draw_circle((x + 22, py + 17), 4, fill=GREEN, width=0)
    p.insert_text((x + 36, py + 21.5), txt, fontsize=11, fontname=SANSB,
                  color=CREAM)


# ============================ CHECKLIST ============================
TASKS = [
    ("01", "Remove life insurance from the industry data", "done",
     "The industry view now reads purely on general insurance — no life premium blended in."),
    ("02", "Pie chart for general insurance, split by segment", "done",
     "A donut of GI premium across Health, Motor, Fire, Crop, PA, Marine & Others."),
    ("03", "Move financial-year references from FY25 to FY26", "updated",
     "Rolled to FY26 wherever FY26 data is published; remaining periods stay honestly labelled."),
    ("04", "Star Health data visibility", "done",
     "Star Health is now a fully populated row across every scorecard metric."),
    ("05", "Toggle between IGAAP (statutory) and IFRS views", "done",
     "An accounting-basis switch restates the combined ratio onto IFRS, basis-safe."),
    ("06", "Fix the channel / retail-mix conflict (67% vs 88–96%)", "done",
     "One derived figure now feeds every surface, so the numbers agree by construction."),
    ("07", "Clarify the “60% guidance delivered” metric", "done",
     "The Promise Tracker shows the exact 3 targets met and the 2 not yet met."),
]


def checklist():
    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), fill=CREAM, width=0)
    p.draw_circle((90, 70), 150, fill=GOLD, fill_opacity=0.05, width=0)
    p.draw_circle((W - 70, H - 60), 170, fill=GREEN, fill_opacity=0.05, width=0)

    kicker(p, M, 70, "BUILD CHECKLIST  ·  7 TASKS")
    p.insert_text((M - 2, 104), "What was asked — and where it stands",
                  fontsize=27, fontname=SERIFB, color=NAVY)
    p.insert_text((M, 126),
                  "Six tasks delivered and verified; one rolls forward automatically as fresh FY26 data is published.",
                  fontsize=10.5, fontname=SANS, color=INK2)

    top = 150
    rowh = (H - 60 - top) / len(TASKS)
    for i, (num, title, st, desc) in enumerate(TASKS):
        y = top + i * rowh
        cy = y + rowh / 2
        # number chip
        p.insert_text((M, cy - 4), num, fontsize=15, fontname=SERIFB,
                      color=GOLD)
        # check mark circle
        cxx = M + 34
        if st == "done":
            p.draw_circle((cxx, cy), 8.5, fill=GREEN, width=0)
            p.draw_line((cxx - 4, cy + 0.5), (cxx - 1, cy + 3.5),
                        color=WHITE, width=1.6)
            p.draw_line((cxx - 1, cy + 3.5), (cxx + 4.5, cy - 3),
                        color=WHITE, width=1.6)
        else:
            p.draw_circle((cxx, cy), 8.5, fill=AMBER, width=0)
            # in-progress: white right-pointing triangle (rolling forward)
            p.draw_polyline([(cxx - 3, cy - 4), (cxx + 4.5, cy),
                             (cxx - 3, cy + 4), (cxx - 3, cy - 4)],
                            fill=WHITE, color=WHITE, width=0.5)
        # title + desc
        p.insert_text((cxx + 22, cy - 3), title, fontsize=13.5,
                      fontname=SERIFB, color=NAVY)
        p.insert_text((cxx + 22, cy + 12), desc, fontsize=9, fontname=SANS,
                      color=INK2)
        # status tag right
        if st == "done":
            tg, col = "DONE", GREEN
        else:
            tg, col = "UPDATING", AMBER
        tw = fitz.get_text_length(spaced(tg), SANSB, 7)
        rr = fitz.Rect(W - M - tw - 26, cy - 9, W - M, cy + 9)
        rrect(p, rr, fill=None, color=col, width=1, radius=0.5)
        p.insert_text((rr.x0 + 13, cy + 2.6), spaced(tg), fontsize=7,
                      fontname=SANSB, color=col)
        if i < len(TASKS):
            p.draw_line((M, y), (W - M, y), color=LINE, width=0.5)

    footer(p, 2)


# ============================ DETAIL ============================
def wrap_bullets(page, rect, bullets, size=9.6, lh=1.42, color=INK):
    y = rect.y0
    for b in bullets:
        page.draw_circle((rect.x0 + 3, y + size * 0.42), 1.7, fill=GOLD,
                         width=0)
        sub = fitz.Rect(rect.x0 + 12, y - 2, rect.x1, rect.y1)
        rc = page.insert_textbox(sub, b, fontsize=size, fontname=SANS,
                                 color=color, align=0, lineheight=lh)
        # estimate consumed height
        used = _box_height(b, sub.width, size, lh)
        y += used + 7
    return y


def _box_height(text, width, size, lh):
    # rough line count by measuring word wrap (measure the rendered ASCII form)
    words = asc(text).split()
    line = ""
    lines = 1
    for w in words:
        t = (line + " " + w).strip()
        if fitz.get_text_length(t, SANS, size) > width:
            lines += 1
            line = w
        else:
            line = t
    return lines * size * lh


def detail(num, eyebrow, title, status, ask, bullets, mode,
           images, top_strip=None, bottom_strip=None, pageno=0):
    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), fill=CREAM, width=0)
    p.draw_circle((W - 60, 60), 150, fill=GOLD, fill_opacity=0.045, width=0)

    # header
    status_pill(p, M, 44, status)
    kicker(p, M, 86, f"TASK {num}  ·  {eyebrow}")
    p.insert_text((M - 2, 116), title, fontsize=23, fontname=SERIFB,
                  color=NAVY)

    # THE ASK line
    ay = 138
    p.insert_text((M, ay + 11), spaced("THE ASK"), fontsize=7.5,
                  fontname=SANSB, color=GOLD)
    askbox = fitz.Rect(M + 62, ay, W - M, ay + 40)
    p.insert_textbox(askbox, ask, fontsize=10.5, fontname=SERIFI, color=INK,
                     align=0, lineheight=1.3)

    body_top = 180
    if top_strip:
        iw, ih = img_size(top_strip)
        sw = W - 2 * M
        sh = min(sw * ih / iw, 50)
        sw2 = sh * iw / ih
        framed(p, top_strip, fitz.Rect(M, body_top, M + sw2, body_top + sh + 4),
               pad=5)
        body_top += sh + 18

    # reserve space for a full-width bottom strip (e.g. an explanatory note)
    body_bottom = H - 46
    if bottom_strip:
        iw, ih = img_size(bottom_strip)
        bsh = min((W - 2 * M) * ih / iw + 10, 40)
        bsw = (bsh - 10) * iw / ih
        bs_y = H - 46 - bsh
        framed(p, bottom_strip, fitz.Rect(M, bs_y, M + bsw, bs_y + bsh), pad=5)
        body_bottom = bs_y - 14

    if mode == "side":
        # left text column, right image(s)
        lx0, lx1 = M, M + 268
        p.insert_text((lx0, body_top + 8), spaced("WORK DONE"), fontsize=7.5,
                      fontname=SANSB, color=GREEN)
        tb = fitz.Rect(lx0, body_top + 18, lx1, body_bottom)
        wrap_bullets(p, tb, bullets)
        ix0 = lx1 + 22
        ibox = fitz.Rect(ix0, body_top, W - M, body_bottom)
        if len(images) == 1:
            framed(p, images[0], ibox)
        else:
            half_h = (ibox.height - 14) / 2
            framed(p, images[0],
                   fitz.Rect(ibox.x0, ibox.y0, ibox.x1, ibox.y0 + half_h))
            framed(p, images[1],
                   fitz.Rect(ibox.x0, ibox.y0 + half_h + 14, ibox.x1, ibox.y1))
    else:  # stacked: text two-col on top, big image(s) below
        p.insert_text((M, body_top + 8), spaced("WORK DONE"), fontsize=7.5,
                      fontname=SANSB, color=GREEN)
        colw = (W - 2 * M - 26) / 2
        mid = len(bullets) - len(bullets) // 2
        tb1 = fitz.Rect(M, body_top + 18, M + colw, body_top + 120)
        tb2 = fitz.Rect(M + colw + 26, body_top + 18, W - M, body_top + 120)
        wrap_bullets(p, tb1, bullets[:mid])
        wrap_bullets(p, tb2, bullets[mid:])
        img_top = body_top + 118
        ibox = fitz.Rect(M, img_top, W - M, H - 46)
        if len(images) == 1:
            framed(p, images[0], ibox)
        else:
            half_w = (ibox.width - 16) / 2
            framed(p, images[0],
                   fitz.Rect(ibox.x0, ibox.y0, ibox.x0 + half_w, ibox.y1))
            framed(p, images[1],
                   fitz.Rect(ibox.x0 + half_w + 16, ibox.y0, ibox.x1, ibox.y1))
    footer(p, pageno)


# ============================ CLOSING ============================
def closing():
    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), fill=NAVY, width=0)
    p.draw_circle((W - 60, H - 60), 230, fill=NAVY2, fill_opacity=0.55,
                  width=0)
    x = M + 6
    p.draw_line((x, 250), (x + 34, 250), color=GOLD, width=2.2)
    p.insert_text((x, 242), spaced("HEALTHCARE DASHBOARD  ·  WEEKLY BUILD UPDATE"),
                  fontsize=8.5, fontname=SANSB, color=GOLD_L)
    p.insert_text((x - 2, 320), "Thank you", fontsize=50, fontname=SERIFB,
                  color=CREAM)
    p.insert_text((x, 356),
                  "Prepared for Paragon Partners (India), by Munshot",
                  fontsize=12.5, fontname=SANS, color=(0.80, 0.83, 0.90))
    p.insert_text((x, 384),
                  "2026-06-29   ·   6 tasks delivered, 1 updating with live FY26 data",
                  fontsize=10.5, fontname=SANSB, color=GOLD_L)


# ============================ ASSEMBLE ============================
cover()
checklist()

S = SHOTS + "/"
pages = [
    dict(num="01", eyebrow="INDUSTRY DATA", status="done",
         title="Life insurance removed from the industry view",
         ask="“Remove life insurance from the industry data.”",
         mode="stacked", images=[S + "t1_industry_band.png"],
         bullets=[
             "The Industry Snapshot now reads purely on general insurance — the headline is General Insurance Premium Mix, and the health card splits SAHI vs the general insurers’ health book.",
             "No life-insurance premium is blended into any card. PSU-vs-Private is measured on general-insurance premium, and every figure cites the GI Council segment report.",
         ]),
    dict(num="02", eyebrow="SEGMENT PIE", status="done",
         title="A general-insurance pie, split by segment",
         ask="“Create a pie chart focused on general insurance, detailing segments like health and motor.”",
         mode="side", images=[S + "t2_gi_pie.png"],
         bullets=[
             "A compact donut shows the ₹3.36L Cr general-insurance premium split across Health, Motor, Fire, Crop, Personal Accident, Marine and Others.",
             "Health and Motor — the two segments called out in the ask — together form about 73% of GI premium, stated in plain English beneath the chart.",
             "Built in the house style: a thin-ring donut with a tinted, tone-coded legend rather than a heavy table.",
         ]),
    dict(num="03", eyebrow="FINANCIAL YEAR", status="updated",
         title="Headline year rolled from FY25 to FY26",
         ask="“Update all financial-year references from FY25 to the latest FY26 data.”",
         mode="stacked", images=[S + "t3_fy26_premium.png"],
         bullets=[
             "Every surface with published FY26 data now reads FY26 — the GI premium mix, SAHI vs Non-SAHI, the premium engine (shown here through the FY26 bar) and peer GWP growth.",
             "Where FY26 isn’t out yet (e.g. full-year profitability), the label honestly stays on its real period rather than mislabelling FY25 as FY26 — so no number ever lies about its year.",
             "New FY26 columns fill on their own as each disclosure lands, so the view keeps advancing without manual edits.",
         ]),
    dict(num="04", eyebrow="STAR HEALTH", status="done",
         title="Star Health is now fully visible",
         ask="“Star Health data visibility.”",
         mode="side", images=[S + "t4_star_scorecard_igaap.png"],
         bullets=[
             "Star Health appears as a complete row in the peer scorecard — every metric populated, no blanks.",
             "GWP growth 11.3%, retail mix 96.0%, combined ratio 101.1%, ROE 11.0%, solvency 2.21x, plus live multiples (P/E 39.6x, P/B 6.17x, P/GWP 1.49x).",
             "Statutory figures come from Star’s FY25 annual report; the multiples read live market data. Each cell is colour-coded against its peers.",
         ]),
    dict(num="05", eyebrow="ACCOUNTING BASIS", status="done",
         title="A one-click IGAAP ⇄ IFRS toggle",
         ask="“Add a toggle to allow users to switch between the statutory (IGAAP) and IFRS views.”",
         mode="side", images=[S + "t5_scorecard_ifrs.png"],
         top_strip=S + "t5_toggle_ifrs.png",
         bottom_strip=S + "t5_ifrs_note.png",
         bullets=[
             "An Accounting Basis switch sits on the peer scorecard — flip between IGAAP / Statutory and IFRS in one click (shown above).",
             "On IFRS, the Combined Ratio restates for the insurers that publish IFRS accounts (Niva Bupa, Star, Care). See the change here: Niva’s combined ratio moves 101.2% → 103.0%.",
             "Insurers with no IFRS filing show “—”, never a misleading cross-basis number. Premium, share, solvency and valuation are basis-neutral and stay put.",
         ]),
    dict(num="06", eyebrow="PREMIUM & DISTRIBUTION", status="done",
         title="The 67% vs 88–96% conflict, resolved",
         ask="“Validate and fix the data inaccuracy in the channel mix within Premium & Distribution — the conflicting 67% vs 88–96% figures.”",
         mode="side",
         images=[S + "t6_product_mix.png", S + "t6_channel_mix.png"],
         bullets=[
             "The clash came from two numbers for one thing: a hand-typed retail mix (Star 67%) sitting beside a chart that derived it from the GI Council health table (~96%).",
             "Now a single formula feeds every surface — Retail Mix = Retail Health ÷ Total Health — so the peer grid and these Premium & Distribution charts agree by construction (Star now reads 96%).",
             "A standing automated check blocks the two from ever silently diverging again.",
         ]),
    dict(num="07", eyebrow="GUIDANCE", status="done",
         title="“60% delivered” — the exact 3 met and 2 missed",
         ask="“Clarify the ‘60% guidance delivered’ metric — end-to-end visibility on which three targets were met and which two were missed.”",
         mode="stacked", images=[S + "t7_promise_tracker.png"],
         top_strip=S + "t7_signal.png",
         bullets=[
             "The Promise Tracker lays out all five public commitments with target, current value, status and a clickable source — 3 of 5 = the 60%.",
             "Met (3): GWP growth ≥20% (27.0%), retail-led book >50% (68.0%), solvency >1.5x (3.03x).",
             "Not yet met (2): combined ratio toward ~96% (now 101.2%, Delayed) and ROE to mid–high teens by FY29 (5.7%, On Track — a multi-year target).",
         ]),
]

for i, pg in enumerate(pages):
    detail(pageno=i + 3, **pg)

closing()
doc.save(OUT, deflate=True, garbage=4)
print("saved", OUT, "pages", doc.page_count)
