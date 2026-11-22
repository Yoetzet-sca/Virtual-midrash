"""Headshots in one house style: the person cut out onto white, face centred, ready for the app's round orange-ringed frame.

    python3 scripts/headshots.py SOURCE_IMAGE OUT_MEDIUM.jpg OUT_SMALL.jpg

Finds where the face is (to centre and size it — never to tell who anyone is), removes the background, and places the
person on white. Exits 2 and writes nothing when there is no face (a logo, say), so the caller keeps the plain picture.
Needs: pip install uniface "rembg[cpu]" opencv-python-headless pillow
"""
import sys
import cv2
import numpy as np
from PIL import Image, ImageOps

SIZE, SMALL = 480, 160
FACE_W = 0.31      # face width (ear to ear) as a share of the picture
FACE_Y = 0.45      # where the middle of the face sits, from the top
_detector = _matting = _body = None


def find_face(bgr):
    """The subject's face as (centre x, centre y, width), or None."""
    global _detector
    if _detector is None:
        from uniface import RetinaFace
        _detector = RetinaFace()
    boxes = [f.bbox for f in _detector.detect(bgr) if f.confidence > 0.7]
    if not boxes:
        return None
    # With more than one person in the shot, the subject is the big face nearest the middle, not someone at the edge.
    mid = bgr.shape[1] / 2
    x1, y1, x2, y2 = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]) * (1 - 0.8 * min(1.0, abs((b[0] + b[2]) / 2 - mid) / mid)))
    return (x1 + x2) / 2, (y1 + y2) / 2, float(x2 - x1)


def cut_out(bgr, cx, cy, fw):
    """How much of each pixel is the person (0 to 1). Other people standing apart in the background are dropped."""
    global _matting
    if _matting is None:
        from uniface import MODNet
        _matting = MODNet()
    alpha = np.clip(np.asarray(_matting.predict(bgr), dtype=np.float32), 0, 1)
    if alpha.ndim == 3:
        alpha = alpha[..., 0]
    # That cut-out is good at heads and hair but can lose a dark jacket against a dark backdrop, slicing off a
    # shoulder. A second cut-out that is good at bodies fills in from the chin down.
    try:
        global _body
        from rembg import new_session, remove
        if _body is None:
            _body = new_session('u2net_human_seg')
        body = np.asarray(remove(Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)), session=_body, only_mask=True), dtype=np.float32) / 255
        rows = np.clip((np.arange(alpha.shape[0]) - (cy + 0.75 * fw)) / (0.25 * fw), 0, 1)[:, None]
        alpha = np.maximum(alpha, body * rows)
    except ImportError:
        pass
    # Thin leftovers (the rim of a frame someone already drew round the photo) are rubbed out before choosing the person.
    k = max(5, int(max(alpha.shape) * 0.02)) | 1
    solid = cv2.morphologyEx((alpha > 0.5).astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    count, labels = cv2.connectedComponents(solid)
    mine = labels[int(min(alpha.shape[0] - 1, max(0, cy))), int(min(alpha.shape[1] - 1, max(0, cx)))]
    if mine == 0:
        return None  # the cut-out lost the face
    keep = cv2.dilate((labels == mine).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k + 4, k + 4)))
    alpha = alpha * keep
    # Where such a rim touches the shoulders it survives the step above; its bright orange gives it away at the edge.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    rim = (hsv[..., 0] >= 4) & (hsv[..., 0] <= 16) & (hsv[..., 1] > 160) & (hsv[..., 2] > 190)
    edge = keep - cv2.erode(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * k, 3 * k)))
    alpha[cv2.dilate((rim & (edge > 0)).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0] = 0
    return alpha


def restyle(img):
    img = ImageOps.exif_transpose(img).convert('RGB')
    if max(img.size) > 1400:
        img.thumbnail((1400, 1400), Image.LANCZOS)
    rgb = np.asarray(img)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    face = find_face(bgr)
    if face is None:
        return None
    cx, cy, fw = face
    h, w = rgb.shape[:2]
    alpha = cut_out(bgr, cx, cy, fw)
    if alpha is None:
        return plain(img, cx, cy, fw)
    base = SIZE * FACE_W / fw
    # (Where the person ends is read from the cut-out, not the picture's edge: some photos were already cut to a circle.)
    under = np.nonzero((alpha[:, int(max(0, cx - fw / 2)):int(cx + fw / 2) + 1] > 0.5).any(axis=1))[0]
    below = max(1.0, (under[-1] if len(under) else h) - cy) / 1.03
    # Choose where the face goes. Ideal: the standard size, dead centre. But the round frame must never show where the
    # photo itself stops — a shoulder sliced by the photo's edge, a head cropped at the top, white under a photo that
    # ends at the chest. So every nearby placement is tried (a little larger, a little off-centre, a little higher or
    # lower) and the one that shows the least of the photo's edges, for the least departure from the ideal, wins.
    T = 96
    yy, xx = np.mgrid[0:T, 0:T]
    frame = ((xx - T / 2 + 0.5) ** 2 + (yy - T / 2 + 0.5) ** 2) <= (T / 2 - 1) ** 2
    best = None
    for zoom in (1, 1.08, 1.17, 1.27, 1.4, 1.55, 1.75, 2.0, 2.3):
        s = base * zoom
        for y in (0.45, 0.40, 0.50, 0.35, 0.55, 0.30):
            if s < SIZE * (1 - y) / below:
                continue  # would leave white under the person
            for x in (0.5, 0.45, 0.55, 0.40, 0.60, 0.35, 0.65):
                m = np.float32([[s, 0, SIZE * x - cx * s], [0, s, SIZE * y - cy * s]]) * (T / SIZE)
                cut = cv2.warpAffine(alpha, m, (T, T), flags=cv2.INTER_LINEAR, borderValue=0)
                run = cv2.warpAffine(alpha, m, (T, T), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                gap = (run > 0.5) & (cut < 0.5) & frame
                above = yy < m[1][2]  # beyond the photo's top edge: a hat or hair cropped by the photo
                shows = float(gap.sum()) / frame.sum()
                # A sliced shoulder or missing chest is what the eye catches, so sliding the person sideways or
                # enlarging a little is cheap by comparison; a hat clipped at the top matters much less.
                cost = float((gap & ~above).sum()) / frame.sum() * 70 + float((gap & above).sum()) / frame.sum() * 15 \
                    + (zoom - 1) * 1.0 + abs(x - 0.5) * 3 + abs(y - FACE_Y) * 3
                # A cut-out can also lose one shoulder by itself (a dark jacket on a dark backdrop). The sign is a
                # body filled on one side of the frame's lower part and empty on the other; lean away from that.
                low = frame & (yy > T * 0.74)
                fx = T * x
                lgap = float((low & (xx < fx) & (cut < 0.5)).sum()) / max(1, (low & (xx < fx)).sum())
                rgap = float((low & (xx >= fx) & (cut < 0.5)).sum()) / max(1, (low & (xx >= fx)).sum())
                cost += max(0.0, abs(lgap - rgap) - 0.12) * 3
                if best is None or cost < best[0]:
                    best = (cost, s, x, y, shows, zoom)
    if best is None:
        return plain(img, cx, cy, fw)
    _, scale, x, y, _, _ = best
    move = np.float32([[scale, 0, SIZE * x - cx * scale], [0, scale, SIZE * y - cy * scale]])
    # Place the person on white with one transform, so edges stay smooth.
    how = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
    person = cv2.warpAffine(rgb, move, (SIZE, SIZE), flags=how, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    a = cv2.warpAffine(alpha, move, (SIZE, SIZE), flags=cv2.INTER_LINEAR, borderValue=0)[..., None]
    return Image.fromarray(np.clip(person * a + 255 * (1 - a), 0, 255).astype(np.uint8))


def plain(img, cx, cy, fw):
    """The photo as it is, cropped square around the face."""
    w, h = img.size
    side = min(w, h, fw / FACE_W)
    left = min(max(0, cx - side / 2), w - side)
    top = min(max(0, cy - side * FACE_Y), h - side)
    return img.crop((round(left), round(top), round(left + side), round(top + side))).resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == '__main__':
    src, medium, small = sys.argv[1:4]
    out = restyle(Image.open(src))
    if out is None:
        sys.exit(2)
    out.save(medium, 'JPEG', quality=84, optimize=True)
    out.resize((SMALL, SMALL), Image.LANCZOS).save(small, 'JPEG', quality=82, optimize=True)
