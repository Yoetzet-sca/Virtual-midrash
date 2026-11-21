"""Headshots in one house style: the person cut out onto white, face centred, ready for the app's round orange-ringed frame.

    python3 scripts/headshots.py SOURCE_IMAGE OUT_MEDIUM.jpg OUT_SMALL.jpg

Finds where the face is (to centre and size it — never to tell who anyone is), removes the background, and places the
person on white. Exits 2 and writes nothing when there is no face (a logo, say), so the caller keeps the plain picture.
Needs: pip install uniface opencv-python-headless pillow
"""
import sys
import cv2
import numpy as np
from PIL import Image, ImageOps

SIZE, SMALL = 480, 160
FACE_W = 0.31      # face width (ear to ear) as a share of the picture
FACE_Y = 0.45      # where the middle of the face sits, from the top
FACE_Y_LOW = 0.52  # ...for a photo that ends just under the chin
_detector = _matting = None


def find_face(bgr):
    """The largest face as (centre x, centre y, width), or None."""
    global _detector
    if _detector is None:
        from uniface import RetinaFace
        _detector = RetinaFace()
    boxes = [f.bbox for f in _detector.detect(bgr) if f.confidence > 0.7]
    if not boxes:
        return None
    x1, y1, x2, y2 = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
    return (x1 + x2) / 2, (y1 + y2) / 2, float(x2 - x1)


def cut_out(bgr, cx, cy):
    """How much of each pixel is the person (0 to 1). Other people standing apart in the background are dropped."""
    global _matting
    if _matting is None:
        from uniface import MODNet
        _matting = MODNet()
    alpha = np.clip(np.asarray(_matting.predict(bgr), dtype=np.float32), 0, 1)
    if alpha.ndim == 3:
        alpha = alpha[..., 0]
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
    alpha = cut_out(bgr, cx, cy)
    if alpha is None:
        return plain(img, cx, cy, fw)
    scale = SIZE * FACE_W / fw
    # Never leave white under a picture that stops at the chin or the chest: the picture must reach the bottom edge.
    # A tight photo sits a little lower and larger rather than losing its white background; only a photo that is nearly
    # all face keeps its own background.
    # (Where the person ends is read from the cut-out, not the picture's edge: some photos were already cut to a circle.)
    under = np.nonzero((alpha[:, int(max(0, cx - fw / 2)):int(cx + fw / 2) + 1] > 0.5).any(axis=1))[0]
    below = max(1.0, (under[-1] if len(under) else h) - cy) / 1.03
    y = FACE_Y
    need = SIZE * (1 - y) / below
    if need > scale:
        y = FACE_Y_LOW
        need = SIZE * (1 - y) / below
    if need > scale * 2.3:
        return plain(img, cx, cy, fw)
    scale = max(scale, need)
    # Place the person on white with one transform, so edges stay smooth.
    move = np.float32([[scale, 0, SIZE / 2 - cx * scale], [0, scale, SIZE * y - cy * scale]])
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
