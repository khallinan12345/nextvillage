from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = "/mnt/user-data/outputs/slides"
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080
MX = 150                      # side safe margin
NAVY = (11, 31, 51)
NAVY_D = (7, 21, 36)
WHITE = (255, 255, 255)
DIM = (150, 172, 190)
CYAN = (79, 195, 232)
AMBER = (242, 166, 90)
PURPLE = (167, 139, 250)
MUTED = (96, 118, 138)

F = "/usr/share/fonts/truetype/dejavu/"
def bold(s):  return ImageFont.truetype(F + "DejaVuSans-Bold.ttf", s)
def book(s):  return ImageFont.truetype(F + "DejaVuSans.ttf", s)
def mono(s):  return ImageFont.truetype(F + "DejaVuSansMono-Bold.ttf", s)


def canvas(transparent=False):
    if transparent:
        return Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    for y in range(H):                       # gentle vertical gradient
        t = y / H
        c = tuple(int(NAVY[i] + (NAVY_D[i] - NAVY[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    return img


def tw(d, text, font):
    b = d.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def wrap(d, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if tw(d, t, font)[0] <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def para(d, text, font, x, y, maxw, fill=WHITE, lead=1.35):
    lh = int(font.size * lead)
    for ln in wrap(d, text, font, maxw):
        d.text((x, y), ln, font=font, fill=fill)
        y += lh
    return y


def rule(d, x, y, w, color=AMBER, h=8):
    d.rectangle([x, y, x + w, y + h], fill=color)


def save(img, name):
    img.save(os.path.join(OUT, name))
    print(name)


# ---------------------------------------------------------------- title cards
def title_card(num, title, sub, fname, accent=AMBER):
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((MX, 300), "EPISODE %s" % num, font=bold(46), fill=accent)
    y = 380
    for ln in wrap(d, title, bold(130), W - 2 * MX):
        d.text((MX, y), ln, font=bold(130), fill=WHITE); y += 150
    rule(d, MX, y + 20, 220, accent)
    d.text((MX, y + 80), sub, font=book(42), fill=DIM)
    save(img, fname)


title_card("0", "Start Here", "The whole journey, and the one habit that matters", "00-title-ep0.png", CYAN)
title_card("1", "Make It Real\nby Tonight", "", "", AMBER) if False else None
# episode 1 title needs two lines handled by wrap
title_card("1", "Make It Real by Tonight", "Website Builder  ·  about one evening", "01-title-ep1.png", AMBER)
title_card("2", "When You Own the Code", "Vite + React  ·  about one week", "02-title-ep2.png", AMBER)
title_card("3", "Make It Remember", "React + Supabase + GitHub Pages  ·  about two weeks", "03-title-ep3.png", AMBER)
title_card("4", "Hand It Over", "One hour. No screen.", "04-title-ep4.png", CYAN)


# ------------------------------------------------------- journey (4 reveals)
PANELS = [
    ("BUILD IT",     "Website Builder",  "You describe it.\nAI writes every line."),
    ("OWN IT",       "Vite + React",     "Your code.\nYour direction."),
    ("REMEMBER IT",  "+ Supabase",       "A database,\nand a real address."),
    ("HAND IT OVER", "No screen",        "A real family.\nReal feedback."),
]

def journey(active):
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((MX, 130), "THE SAME PROBLEM, FOUR TIMES", font=bold(44), fill=CYAN)
    rule(d, MX, 200, 200, CYAN)
    pw, gap = 370, 40
    x0 = (W - (pw * 4 + gap * 3)) // 2
    for i, (head, tool, body) in enumerate(PANELS):
        on = i < active
        x = x0 + i * (pw + gap)
        top, bot = 300, 800
        d.rounded_rectangle([x, top, x + pw, bot], radius=22,
                            fill=(19, 44, 68) if on else (14, 34, 54),
                            outline=AMBER if on else (28, 52, 76), width=4 if on else 2)
        d.ellipse([x + 34, top + 40, x + 34 + 64, top + 104],
                  fill=AMBER if on else (30, 54, 78))
        n = str(i + 1)
        nw, nh = tw(d, n, bold(38))
        d.text((x + 34 + 32 - nw / 2, top + 40 + 32 - nh / 2 - 4), n,
               font=bold(38), fill=NAVY if on else MUTED)
        d.text((x + 34, top + 150), head, font=bold(40),
               fill=WHITE if on else MUTED)
        d.text((x + 34, top + 205), tool, font=book(30),
               fill=AMBER if on else MUTED)
        yy = top + 280
        for ln in body.split("\n"):
            d.text((x + 34, yy), ln, font=book(30), fill=DIM if on else (60, 82, 102))
            yy += 46
    d.text((MX, 890), "Each time round, you understand more of what is underneath.",
           font=book(38), fill=DIM)
    save(img, "05-journey-%d.png" % active)


for i in range(1, 5):
    journey(i)


# ---------------------------------------------------------- outcome cards
def outcome(ep, title, dur, have, able, third_label, third, fname, accent=AMBER):
    img = canvas(); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 200], fill=(16, 40, 62))
    d.text((MX, 52), "EPISODE %s" % ep, font=bold(38), fill=accent)
    d.text((MX, 104), title, font=bold(64), fill=WHITE)
    dw = tw(d, dur, book(36))[0]
    d.text((W - MX - dw, 118), dur, font=book(36), fill=DIM)

    zones = [("YOU'LL HAVE", have, CYAN),
             ("YOU'LL BE ABLE TO", able, AMBER),
             (third_label, third, MUTED)]
    y = 275
    for label, text, col in zones:
        d.rectangle([MX, y, MX + 8, y + 200], fill=col)
        d.text((MX + 42, y), label, font=bold(34), fill=col)
        para(d, text, book(46), MX + 42, y + 62, W - 2 * MX - 60,
             fill=WHITE if col is not MUTED else DIM)
        y += 262
    save(img, fname)


outcome("1", "Make It Real by Tonight", "about one evening",
        "A four-page website with your own market photographs, live at a public address.",
        "Describe a website precisely enough that an AI builds the right thing the first time.",
        "NOT YET",
        "It is a poster. It cannot calculate a price and it cannot remember a sale.",
        "06-outcome-ep1.png")

outcome("2", "When You Own the Code", "about one week",
        "An app running on code you own, that calculates a sale and tracks the day's total.",
        "Read a project's files. Direct an AI to build a feature. Find the cause of a bug before asking for help.",
        "NOT YET",
        "Memory. Press refresh and every sale disappears — and that is supposed to happen.",
        "07-outcome-ep2.png")

outcome("3", "Make It Remember", "about two weeks",
        "The same app with a real database behind it, published from your own GitHub repository.",
        "Design tables from a real problem. Read and write live data. Protect somebody's private information properly.",
        "NOT YET",
        "Any proof that a real person will use it. That is Episode 4.",
        "08-outcome-ep3.png")

outcome("4", "Hand It Over", "one hour, no screen",
        "The app in a real family's hands, and a list of changes you did not think of.",
        "Turn what a user did — not what they said — into your next build.",
        "WHY IT MATTERS",
        "This is the one that makes you a developer. The three before it were practice.",
        "09-outcome-ep4.png", CYAN)


# -------------------------------------------------------------- three things
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 150), "YOU FINISH WITH THREE THINGS", font=bold(44), fill=CYAN)
rule(d, MX, 220, 200, CYAN)
items = [("A live application", "at a public address anyone can open"),
         ("A GitHub repository", "with your name on it"),
         ("The habit of the second tab", "which outlasts the other two")]
y = 330
for i, (a, b) in enumerate(items):
    d.ellipse([MX, y + 6, MX + 66, y + 72], outline=AMBER, width=5)
    n = str(i + 1); nw, nh = tw(d, n, bold(36))
    d.text((MX + 33 - nw / 2, y + 39 - nh / 2 - 2), n, font=bold(36), fill=AMBER)
    d.text((MX + 110, y), a, font=bold(66), fill=WHITE)
    d.text((MX + 110, y + 86), b, font=book(38), fill=DIM)
    y += 200
save(img, "10-three-things.png")


# ------------------------------------------------------------------ timeline
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 150), "HOW LONG THIS TAKES", font=bold(44), fill=CYAN)
rule(d, MX, 220, 200, CYAN)
rows = [("EPISODE 1", "one evening", 130),
        ("EPISODE 2", "about a week", 430),
        ("EPISODE 3", "about two weeks", 800),
        ("EPISODE 4", "one hour, no screen", 150)]
y = 340
maxbar = 1000
for name, dur, span in rows:
    d.text((MX, y + 14), name, font=bold(40), fill=WHITE)
    bx = MX + 330
    d.rounded_rectangle([bx, y, bx + int(maxbar * span / 800), y + 66],
                        radius=12, fill=AMBER if span < 800 else CYAN)
    d.text((bx + int(maxbar * span / 800) + 30, y + 14), dur, font=book(38), fill=DIM)
    y += 130
d.text((MX, y + 60), "Nobody is racing you.", font=bold(48), fill=WHITE)
save(img, "11-timeline.png")


# ------------------------------------------------------------------ two tabs
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 130), "THE RULE FOR EVERYTHING THAT FOLLOWS", font=bold(44), fill=CYAN)
rule(d, MX, 200, 200, CYAN)
bw, bh, top = 640, 470, 330
lx, rx = MX, W - MX - bw
for x, head, sub, lines, col in [
    (lx, "THE BUILD PAGE", "asks you questions",
     ["Guided, in order", "Scored on how you ask", "One question at a time"], AMBER),
    (rx, "THE AI PLAYGROUND", "is where you work it out",
     ["Prompts you are unsure of", "Errors you do not understand", "The question behind the task"], PURPLE)]:
    d.rounded_rectangle([x, top, x + bw, top + bh], radius=26,
                        fill=(19, 44, 68), outline=col, width=5)
    d.text((x + 40, top + 46), head, font=bold(44), fill=col)
    d.text((x + 40, top + 106), sub, font=book(32), fill=DIM)
    yy = top + 190
    for ln in lines:
        d.ellipse([x + 40, yy + 13, x + 54, yy + 27], fill=col)
        d.text((x + 76, yy), ln, font=book(32), fill=WHITE)
        yy += 64
cx = W // 2
ay = top + bh // 2 + 30
x1, x2 = lx + bw + 46, rx - 46
d.line([x1, ay, x2, ay], fill=PURPLE, width=7)
for tipx, dirn in [(x1, -1), (x2, 1)]:
    d.polygon([(tipx, ay), (tipx - dirn * 36, ay - 24), (tipx - dirn * 36, ay + 24)], fill=PURPLE)
lab = "SWIVEL"
lw = tw(d, lab, bold(42))[0]
d.text((cx - lw // 2, ay - 100), lab, font=bold(42), fill=PURPLE)
d.text((MX, 900), "Two tabs. One where you build. One where you think.",
       font=bold(48), fill=WHITE)
save(img, "12-two-tabs.png")


# ------------------------------------------------------------ thinning ladder
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 120), "THE HELP THINS ON PURPOSE", font=bold(44), fill=PURPLE)
rule(d, MX, 190, 200, PURPLE)
steps = [("EPISODE 1", "The exact words. Copy them.", 1.0),
         ("EPISODE 2", "The goal only. You write the prompt.", 0.7),
         ("EPISODE 3", "A marker. Nothing else.", 0.4),
         ("EPISODE 4", "Nothing. And you open the tab anyway.", 0.12)]
y = 300
for name, text, strength in steps:
    barw = int(1050 * strength)
    d.text((MX, y + 16), name, font=bold(40), fill=WHITE)
    bx = MX + 300
    d.rounded_rectangle([bx, y, bx + max(barw, 26), y + 70], radius=12,
                        fill=tuple(int(PURPLE[i] * strength + NAVY[i] * (1 - strength)) for i in range(3)))
    d.text((bx + max(barw, 26) + 30, y + 16), text, font=book(36), fill=DIM)
    y += 140
d.text((MX, y + 50), "That is not laziness. That is the whole point of the series.",
       font=book(40), fill=WHITE)
save(img, "13-thinning-ladder.png")


# ----------------------------------------------------------------- checklist
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 120), "BEFORE EPISODE 1", font=bold(44), fill=AMBER)
rule(d, MX, 190, 200, AMBER)
items = [("Your nextvillage login", "you already have it"),
         ("Three real photographs from the market", "your stall, fish on ice, a boat"),
         ("A free GitHub account", "use a name you would show an employer"),
         ("Swivel #1", "come back with your page list on paper")]
y = 290
for a, b in items:
    d.rounded_rectangle([MX, y, MX + 62, y + 62], radius=10, outline=AMBER, width=5)
    d.text((MX + 110, y - 6), a, font=bold(52), fill=WHITE)
    d.text((MX + 110, y + 60), b, font=book(34), fill=DIM)
    y += 165
d.text((MX, y + 40), "Supabase comes later — and sign in with GitHub when it does.",
       font=book(38), fill=CYAN)
save(img, "14-checklist.png")


# ------------------------------------------------------------ ep4 four steps
img = canvas(); d = ImageDraw.Draw(img)
d.text((MX, 120), "SIT WITH A FAMILY. ONE HOUR.", font=bold(44), fill=CYAN)
rule(d, MX, 190, 200, CYAN)
steps = ["Ask how they decide a price.",
         "Ask what happens to fish nobody buys.",
         "Show them. Do not explain.",
         "Watch their hands, not their face."]
y = 300
for i, s in enumerate(steps):
    d.ellipse([MX, y, MX + 70, y + 70], fill=CYAN)
    n = str(i + 1); nw, nh = tw(d, n, bold(40))
    d.text((MX + 35 - nw / 2, y + 35 - nh / 2 - 3), n, font=bold(40), fill=NAVY)
    d.text((MX + 120, y + 2), s, font=bold(56), fill=WHITE)
    y += 130
d.text((MX, y + 60), "Then come back and change it. That round trip is the job.",
       font=book(40), fill=DIM)
save(img, "15-ep4-four-steps.png")


# ------------------------------------------------------------- swivel badges
def curved_arrow(d, cx, cy, r, color, width=13):
    """Circular arrow with a tangent-aligned head."""
    a0, a1 = 120, 380
    d.arc([cx - r, cy - r, cx + r, cy + r], start=a0, end=a1, fill=color, width=width)
    th = math.radians(a1)
    px, py = cx + r * math.cos(th), cy + r * math.sin(th)
    tx, ty = -math.sin(th), math.cos(th)          # tangent, direction of travel
    nx, ny = math.cos(th), math.sin(th)           # radial
    hl, hw = width * 2.6, width * 1.9
    d.polygon([(px + tx * hl, py + ty * hl),
               (px - tx * hl * 0.35 + nx * hw, py - ty * hl * 0.35 + ny * hw),
               (px - tx * hl * 0.35 - nx * hw, py - ty * hl * 0.35 - ny * hw)], fill=color)


def swivel_badge(fname, scale=1.0, sub="AI PLAYGROUND"):
    pad = int(40 * scale)
    fs = int(58 * scale)
    fs2 = int(30 * scale)
    f1, f2 = bold(fs), bold(fs2)
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    tw1 = tw(tmp, "SWIVEL", f1)[0]
    tw2 = tw(tmp, sub, f2)[0]
    r = int(46 * scale)
    bw = pad * 2 + r * 2 + int(34 * scale) + max(tw1, tw2)
    bh = int(150 * scale)
    img = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=bh // 2, fill=(88, 43, 173, 235))
    d.rounded_rectangle([0, 0, bw - 1, bh - 1], radius=bh // 2, outline=PURPLE, width=int(5 * scale))
    curved_arrow(d, pad + r, bh // 2, r - int(8 * scale), WHITE, int(13 * scale))
    tx = pad + r * 2 + int(34 * scale)
    d.text((tx, bh // 2 - fs + int(6 * scale)), "SWIVEL", font=f1, fill=WHITE)
    d.text((tx, bh // 2 + int(12 * scale)), sub, font=f2, fill=(214, 198, 255))
    img.save(os.path.join(OUT, fname))
    print(fname, img.size)


swivel_badge("16-swivel-badge.png", 1.0)
swivel_badge("17-swivel-badge-large.png", 1.7)

# full-frame swivel transition card
img = canvas(); d = ImageDraw.Draw(img)
curved_arrow(d, W // 2, 420, 130, PURPLE, 26)
t = "SWIVEL"
twd = tw(d, t, bold(120))[0]
d.text((W // 2 - twd / 2, 600), t, font=bold(120), fill=WHITE)
s = "Leave the build page. Go work it out."
sw = tw(d, s, book(46))[0]
d.text((W // 2 - sw / 2, 760), s, font=book(46), fill=PURPLE)
save(img, "18-swivel-fullframe.png")


# --------------------------------------------------- lower-third name plate
img = Image.new("RGBA", (1100, 260), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 40, 1000, 220], radius=18, fill=(16, 40, 62, 240))
d.rectangle([0, 40, 14, 220], fill=AMBER)
d.text((60, 76), "Divinegift Morris", font=bold(64), fill=WHITE)
d.text((62, 152), "Developer  ·  Oloibiri", font=book(36), fill=DIM)
img.save(os.path.join(OUT, "19-lower-third-divinegift.png"))
print("19-lower-third-divinegift.png")
