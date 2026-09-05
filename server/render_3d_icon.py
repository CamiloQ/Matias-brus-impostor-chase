import math
from PIL import Image, ImageDraw

def create_radial_gradient(size, center_x, center_y, radius, inner_color, outer_color):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = img.load()
    w, h = size
    for y in range(h):
        for x in range(w):
            dx = x - center_x
            dy = y - center_y
            dist = math.hypot(dx, dy)
            t = min(1.0, dist / radius)
            r = int(inner_color[0] + (outer_color[0] - inner_color[0]) * t)
            g = int(inner_color[1] + (outer_color[1] - inner_color[1]) * t)
            b = int(inner_color[2] + (outer_color[2] - inner_color[2]) * t)
            a = int(inner_color[3] + (outer_color[3] - inner_color[3]) * t)
            pixels[x, y] = (r, g, b, a)
    return img

def render_icon():
    S = 1024
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background rounded badge with radial gradient
    bg = create_radial_gradient((S, S), S // 2, int(S * 0.35), int(S * 0.65), (30, 41, 59, 255), (2, 6, 23, 255))
    mask = Image.new("L", (S, S), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([20, 20, S - 20, S - 20], radius=260, fill=255)
    img.paste(bg, (0, 0), mask)

    # Outer Gold & Cyan Ring
    draw.ellipse([40, 40, S - 40, S - 40], outline=(241, 196, 15, 200), width=12)
    draw.ellipse([60, 60, S - 60, S - 60], outline=(56, 189, 248, 150), width=4)

    # 2. Ground 3D Shadow
    draw.ellipse([S//2 - 280, 910, S//2 + 280, 960], fill=(0, 0, 0, 160))

    def sx(x): return int(x * 2)
    def sy(y): return int(y * 2)

    # 3. LEGS: ALL-YELLOW SUIT (PANTALÓN AMARILLO 3D)
    draw.polygon([
        (sx(185), sy(340)), (sx(175), sy(425)), (sx(235), sy(425)), (sx(230), sy(340))
    ], fill=(245, 158, 11))
    draw.polygon([
        (sx(282), sy(340)), (sx(277), sy(425)), (sx(337), sy(425)), (sx(327), sy(340))
    ], fill=(217, 119, 6))
    draw.line([(sx(256), sy(340)), (sx(256), sy(375))], fill=(180, 83, 9), width=5)
    draw.arc([sx(188), sy(345), sx(230), sy(365)], start=0, end=180, fill=(180, 83, 9), width=4)
    draw.arc([sx(284), sy(345), sx(326), sy(365)], start=0, end=180, fill=(180, 83, 9), width=4)

    # 4. SNEAKERS (ZAPATOS BLANCOS 3D)
    draw.rounded_rectangle([sx(160), sy(438), sx(242), sy(455)], radius=12, fill=(100, 116, 139))
    draw.ellipse([sx(168), sy(415), sx(242), sy(442)], fill=(248, 250, 252))
    draw.ellipse([sx(170), sy(430), sx(198), sy(448)], fill=(255, 255, 255))
    draw.line([(sx(195), sy(424)), (sx(215), sy(424))], fill=(148, 163, 184), width=6)
    draw.line([(sx(198), sy(430)), (sx(218), sy(430))], fill=(148, 163, 184), width=6)

    draw.rounded_rectangle([sx(270), sy(438), sx(352), sy(455)], radius=12, fill=(100, 116, 139))
    draw.ellipse([sx(278), sy(415), sx(352), sy(442)], fill=(248, 250, 252))
    draw.ellipse([sx(318), sy(430), sx(346), sy(448)], fill=(255, 255, 255))
    draw.line([(sx(295), sy(424)), (sx(315), sy(424))], fill=(148, 163, 184), width=6)
    draw.line([(sx(298), sy(430)), (sx(318), sy(430))], fill=(148, 163, 184), width=6)

    # 5. TORSO: YELLOW HOODIE WITH ZIPPER (BUSO AMARILLO CON CIERRE 3D)
    draw.ellipse([sx(160), sy(220), sx(352), sy(365)], fill=(245, 158, 11))
    draw.ellipse([sx(168), sy(224), sx(344), sy(355)], fill=(253, 216, 53))
    draw.rounded_rectangle([sx(195), sy(315), sx(317), sy(352)], radius=16, fill=(217, 119, 6, 180))

    # Metallic Zipper Track
    draw.rounded_rectangle([sx(252), sy(215), sx(260), sy(357)], radius=4, fill=(51, 65, 85))
    for zy in range(sy(218), sy(355), 14):
        draw.line([(sx(253), zy), (sx(259), zy)], fill=(255, 255, 255), width=3)
    draw.polygon([
        (sx(251), sy(260)), (sx(261), sy(260)), (sx(264), sy(280)), (sx(248), sy(280))
    ], fill=(226, 232, 240), outline=(30, 41, 59))
    draw.ellipse([sx(253), sy(268), sx(259), sy(274)], fill=(30, 41, 59))

    # Hoodie Collar fold
    draw.ellipse([sx(196), sy(196), sx(316), sy(232)], fill=(217, 119, 6))
    draw.ellipse([sx(201), sy(198), sx(311), sy(228)], fill=(253, 216, 53))

    # Sleeves & Arms
    draw.polygon([
        (sx(170), sy(235)), (sx(130), sy(270)), (sx(145), sy(335)), (sx(175), sy(305))
    ], fill=(245, 158, 11))
    draw.ellipse([sx(133), sy(328), sx(157), sy(352)], fill=(251, 199, 148))

    draw.polygon([
        (sx(342), sy(235)), (sx(410), sy(200)), (sx(420), sy(175)), (sx(380), sy(170)), (sx(335), sy(220))
    ], fill=(245, 158, 11))
    draw.ellipse([sx(400), sy(162), sx(428), sy(188)], fill=(251, 199, 148))

    # 6. FRYING PAN WITH SUNNY EGG (SARTEN CON HUEVO FRITO)
    px, py = sx(430), sy(130)
    draw.line([(px - 20, py + 50), (px, py)], fill=(30, 41, 59), width=20)
    draw.ellipse([px - 75, py - 75, px + 75, py + 75], fill=(71, 85, 105))
    draw.ellipse([px - 65, py - 65, px + 65, py + 65], fill=(15, 23, 42))
    draw.ellipse([px - 45, py - 40, px + 45, py + 40], fill=(255, 255, 255))
    draw.ellipse([px - 18, py - 18, px + 22, py + 22], fill=(245, 158, 11))
    draw.ellipse([px - 14, py - 14, px + 18, py + 18], fill=(251, 191, 36))
    draw.ellipse([px - 8, py - 8, px - 2, py - 2], fill=(255, 255, 255))

    # 7. BOY HEAD & 3D CHILD FACE
    draw.ellipse([sx(169), sy(132), sx(195), sy(164)], fill=(251, 199, 148))
    draw.ellipse([sx(317), sy(132), sx(343), sy(164)], fill=(251, 199, 148))
    draw.ellipse([sx(180), sy(69), sx(332), sy(221)], fill=(251, 199, 148))

    draw.ellipse([sx(195), sy(156), sx(225), sy(174)], fill=(248, 113, 113, 120))
    draw.ellipse([sx(287), sy(156), sx(317), sy(174)], fill=(248, 113, 113, 120))

    # Big Expressive Eyes
    draw.ellipse([sx(199), sy(118), sx(237), sy(166)], fill=(255, 255, 255))
    draw.ellipse([sx(208), sy(125), sx(234), sy(159)], fill=(30, 41, 59))
    draw.ellipse([sx(218), sy(130), sx(230), sy(142)], fill=(255, 255, 255))
    draw.ellipse([sx(212), sy(144), sx(218), sy(150)], fill=(255, 255, 255))

    draw.ellipse([sx(275), sy(118), sx(313), sy(166)], fill=(255, 255, 255))
    draw.ellipse([sx(278), sy(125), sx(304), sy(159)], fill=(30, 41, 59))
    draw.ellipse([sx(288), sy(130), sx(300), sy(142)], fill=(255, 255, 255))
    draw.ellipse([sx(282), sy(144), sx(288), sy(150)], fill=(255, 255, 255))

    draw.line([(sx(200), sy(115)), (sx(235), sy(116))], fill=(54, 34, 23), width=8)
    draw.line([(sx(312), sy(115)), (sx(277), sy(116))], fill=(54, 34, 23), width=8)

    draw.ellipse([sx(252), sy(152), sx(260), sy(158)], fill=(212, 139, 82))
    draw.chord([sx(230), sy(168), sx(282), sy(200)], start=0, end=180, fill=(127, 29, 29))
    draw.chord([sx(240), sy(178), sx(272), sy(200)], start=0, end=180, fill=(244, 63, 94))

    # Boy Hair (Castano 3D)
    draw.chord([sx(175), sy(55), sx(337), sy(145)], start=180, end=360, fill=(54, 34, 23))
    draw.polygon([
        (sx(230), sy(70)), (sx(255), sy(35)), (sx(275), sy(65)), (sx(295), sy(40)), (sx(305), sy(75))
    ], fill=(54, 34, 23))

    # 8. MINI-MATIAS ON HEAD
    mx, my = sx(256), sy(46)
    draw.ellipse([mx - 40, my + 10, mx + 40, my + 44], fill=(244, 63, 94))
    draw.ellipse([mx - 38, my - 38, mx + 38, my + 38], fill=(251, 199, 148))
    draw.chord([mx - 38, my - 38, mx + 38, my + 15], start=180, end=360, fill=(44, 24, 16))
    draw.ellipse([mx - 18, my - 12, mx - 8, my - 2], fill=(30, 41, 59))
    draw.ellipse([mx + 8, my - 12, mx + 18, my - 2], fill=(30, 41, 59))
    draw.arc([mx - 12, my + 2, mx + 12, my + 16], start=0, end=180, fill=(185, 28, 28), width=3)

    img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save("client/icons/icon-512.png", "PNG")
    print("Saved client/icons/icon-512.png")

    img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
    img_192.save("client/icons/icon-192.png", "PNG")
    print("Saved client/icons/icon-192.png")

if __name__ == "__main__":
    render_icon()
