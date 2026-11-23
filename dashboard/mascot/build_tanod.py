"""Build the Barangay Tanod chatbot mascot in Blender.

Run with Blender 4.5 (no window needed), from the dashboard/ folder:

    D:/Blender/blender.exe -b --factory-startup --python mascot/build_tanod.py -- \
        --blend mascot/tanod.blend --glb public/mascot/tanod.glb --compare mascot/renders

Every flag is optional; with none, the script only builds the scene.

  --blend PATH    save the .blend (cel-shaded materials, for viewing in Blender)
  --glb PATH      export glTF binary (plain materials and inverted-hull outlines)
  --still PATH    render a transparent PNG (loading image and no-WebGL fallback)
  --compare DIR   render the 8 turnaround views and composite them over
                  turnaround.webp: compare_overlay.png, compare_blend.png,
                  compare_side.png

The model is measured from turnaround.webp: 1 unit = 200 px on the sheet,
feet on z = 0, the character faces -Y (glTF +Z), its left is +X. The hair
volume is carved from the sheet's own hair silhouettes (front, back and both
profiles), so its outline matches the drawing in those views.

Hierarchy (empties are pivots; animate them, not the meshes):

  tanod
  +- groundShadow
  +- hips                 bob / hop
     +- legL, legR        hip joints
     +- torso             waist: lean, twist
        +- armL, armR     shoulders
        +- head           neck: nod, tilt, turn
           +- hair
           +- eyeL, eyeR  scale to blink
           +- mouth       hidden by default (custom property startHidden)
"""

from __future__ import annotations

import math
import os
import sys
from collections import deque

import bmesh
import bpy
import numpy as np
from mathutils import Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, "turnaround.webp")
PX = 200.0  # sheet pixels per model unit

# Where each view sits on the sheet: (camera azimuth deg, centre x, feet y).
# Azimuth 0 = front, -90 = right profile (camera on the character's right).
VIEWS = [
    ("front", 0, 186, 484),
    ("front_right_34", -45, 463, 484),
    ("right_profile", -90, 738, 484),
    ("rear_right_34", -135, 1012, 484),
    ("back", 180, 186, 939),
    ("rear_left_34", 135, 463, 939),
    ("left_profile", 90, 737, 939),
    ("front_left_34", 45, 1016, 939),
]
ELEVATION = math.radians(7)

COLORS = {
    "outline": (0.05, 0.05, 0.063),
    "hair": (0.118, 0.145, 0.267),
    "navy": (0.122, 0.149, 0.275),
    "vest": (0.071, 0.275, 0.776),
    "stripe": (0.969, 0.969, 0.949),
    "patch": (1.0, 0.824, 0.122),
    "skin": (0.98, 0.725, 0.463),
    "eye": (0.067, 0.067, 0.067),
    "gear": (0.18, 0.18, 0.196),
    "buckle": (0.604, 0.604, 0.604),
    "shoe": (0.11, 0.11, 0.118),
    "mouth": (0.353, 0.122, 0.122),
    "zip": (0.05, 0.05, 0.063),
}
# The face: shared by the head and by the hair carving (absolute coordinates).
FACE_SHAPE_ARGS = ((0.345, 0.3, 0.37), 0.78, 0.6)
FACE_Y = -0.1
FACE_Z = 1.39
ARM_REST = 0.3  # shoulders at rest (glTF/three.js: armL rotation.z = +0.3)
ELBOW_REST = 0.1  # forearms bend back toward vertical (glTF: forearmL rotation.z = -0.1)
BLUR = 1.4  # hair density blur, in voxels
OUTLINE_W = 0.035  # the sheet's lines are 6-7 px


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ---------------------------------------------------------------------------
# Materials: cel shading for Blender renders, plain Principled for glTF
# ---------------------------------------------------------------------------

MATS: dict[str, bpy.types.Material] = {}


def material(name: str) -> bpy.types.Material:
    if name not in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m["srgb"] = COLORS[name] if name in COLORS else (0, 0, 0)
        MATS[name] = m
    return MATS[name]


def outline_material() -> bpy.types.Material:
    m = material("outline")
    m.use_backface_culling = True  # only the far side of the shell shows
    return m


def set_shading(toon: bool) -> None:
    """Rebuild every material's nodes: cel-shaded or plain (for export)."""
    for name, m in MATS.items():
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        rgb = [srgb_to_linear(c) for c in m["srgb"]]
        flat = name in ("outline", "eye", "zip", "mouth")
        if toon:
            emit = nt.nodes.new("ShaderNodeEmission")
            if flat:
                emit.inputs["Color"].default_value = (*rgb, 1)
            else:
                diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
                to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
                ramp = nt.nodes.new("ShaderNodeValToRGB")
                ramp.color_ramp.interpolation = "CONSTANT"
                ramp.color_ramp.elements[0].position = 0.0
                shade = 0.35 if name == "hair" else 0.62
                ramp.color_ramp.elements[0].color = (shade, shade, shade, 1)
                ramp.color_ramp.elements[1].position = 0.18
                ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
                mix = nt.nodes.new("ShaderNodeMix")
                mix.data_type = "RGBA"
                mix.blend_type = "MULTIPLY"
                mix.inputs["Factor"].default_value = 1.0
                mix.inputs[7].default_value = (*rgb, 1)
                nt.links.new(diff.outputs[0], to_rgb.inputs[0])
                nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
                nt.links.new(ramp.outputs["Color"], mix.inputs[6])
                nt.links.new(mix.outputs[2], emit.inputs["Color"])
            nt.links.new(emit.outputs[0], out.inputs["Surface"])
        else:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (*rgb, 1)
            bsdf.inputs["Roughness"].default_value = 0.9
            nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
        m.diffuse_color = (*rgb, 1)
        # Every shape is closed, so draw front faces only (glTF doubleSided = false).
        # The outline shells depend on this.
        m.use_backface_culling = True


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


class Soft:
    """Superellipsoid: a smooth soft-square shape. r = (x, y depth, z height).

    (|x/rx|^(2/e2) + |y/ry|^(2/e2))^(e2/e1) + |z/rz|^(2/e1) = 1.
    e = 1 is an ellipsoid; smaller e is boxier.
    """

    def __init__(self, r, e1, e2):
        self.r = r
        self.e1 = e1
        self.e2 = e2

    def f(self, p) -> float:
        rx, ry, rz = self.r
        h = abs(p[0] / rx) ** (2 / self.e2) + abs(p[1] / ry) ** (2 / self.e2)
        return h ** (self.e2 / self.e1) + abs(p[2] / rz) ** (2 / self.e1)

    def normal(self, p) -> Vector:
        e = 1e-3
        return Vector(
            (
                self.f((p[0] + e, p[1], p[2])) - self.f((p[0] - e, p[1], p[2])),
                self.f((p[0], p[1] + e, p[2])) - self.f((p[0], p[1] - e, p[2])),
                self.f((p[0], p[1], p[2] + e)) - self.f((p[0], p[1], p[2] - e)),
            )
        ).normalized()

    def y_at(self, x: float, z: float, sign: int = -1) -> float:
        """y of the front (sign -1, facing -Y) or back (+1) surface at (x, z)."""
        rx, ry, rz = self.r
        v = max(0.0, 1 - abs(z / rz) ** (2 / self.e1))
        yy = max(0.0, v ** (self.e1 / self.e2) - abs(x / rx) ** (2 / self.e2))
        return sign * ry * yy ** (self.e2 / 2)

    def mesh(self, name, seg_w=40, seg_h=28, band=None, scale=1.0) -> bpy.types.Mesh:
        rx, ry, rz = self.r

        def sp(v, e):
            return math.copysign(abs(v) ** e, v)

        def eta_of(z):
            return math.asin(max(-1.0, min(1.0, sp(z / rz, 1 / self.e1))))

        e0, e1_ = (eta_of(band[0]), eta_of(band[1])) if band else (-math.pi / 2, math.pi / 2)
        rows = max(2, seg_h // 6) if band else seg_h
        verts = []
        for j in range(rows + 1):
            eta = e0 + (e1_ - e0) * j / rows
            ce = sp(math.cos(eta), self.e1)
            z = rz * sp(math.sin(eta), self.e1)
            for i in range(seg_w):
                w = -math.pi + 2 * math.pi * i / seg_w
                verts.append(
                    (
                        rx * ce * sp(math.cos(w), self.e2) * scale,
                        ry * ce * sp(math.sin(w), self.e2) * scale,
                        z * scale,
                    )
                )
        faces = []
        for j in range(rows):
            for i in range(seg_w):
                a = j * seg_w + i
                b = j * seg_w + (i + 1) % seg_w
                faces.append((a, b, b + seg_w, a + seg_w))
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        return me


FACE_SHAPE = Soft(*FACE_SHAPE_ARGS)


def link(obj: bpy.types.Object, parent: bpy.types.Object | None) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, parent, loc) -> bpy.types.Object:
    o = bpy.data.objects.new(name, None)
    o.empty_display_type = "PLAIN_AXES"
    o.empty_display_size = 0.08
    o.location = loc
    return link(o, parent)


def add_outline(obj: bpy.types.Object, width: float = OUTLINE_W, skip=None) -> None:
    """Inverted-hull outline: a copy pushed out along normals, faces flipped.

    skip(position) -> True drops the shell there (positions in the object's space).
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    calm = obj.get("_outline_normals")
    if calm is not None and len(calm) == 3 * len(bm.verts):
        bm.verts.ensure_lookup_table()
        for i, v in enumerate(bm.verts):
            v.co += Vector(calm[3 * i : 3 * i + 3]) * width
        del obj["_outline_normals"]
    else:
        for v in bm.verts:
            v.co += v.normal * width
    if skip is not None:
        drop = [f for f in bm.faces if any(skip(v.co) for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new(obj.name + "_outline")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.validate()
    me.materials.append(outline_material())
    shell = bpy.data.objects.new(obj.name + "_outline", me)
    link(shell, obj)


def mesh_obj(name, me, mat, parent, loc=(0, 0, 0), outline=True) -> bpy.types.Object:
    me.materials.append(material(mat))
    o = bpy.data.objects.new(name, me)
    o.location = loc
    link(o, parent)
    if outline:
        add_outline(o)
    return o


def blob(name, shape: Soft, mat, parent, loc, outline=True, taper=0.0) -> bpy.types.Object:
    """Soft shape at loc. taper > 0 widens it toward the bottom (sleeve openings)."""
    big = max(shape.r) > 0.15
    me = shape.mesh(name, 32 if big else 18, 22 if big else 12)
    if taper:
        rz = shape.r[2]
        for v in me.vertices:
            f = 1 + taper * (-v.co.z / rz) * 0.5
            v.co.x *= f
            v.co.y *= f
    return mesh_obj(name, me, mat, parent, loc, outline)


def box(name, size, mat, parent, loc, outline=False) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return mesh_obj(name, me, mat, parent, loc, outline)


def orient(obj, normal: Vector, spin: float = 0.0) -> None:
    """Point the object's -Y (its front) along `normal`, then spin about it."""
    q = Vector((0, -1, 0)).rotation_difference(normal.normalized())
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Quaternion(normal.normalized(), spin) @ q


# Bold, slightly condensed lettering like the sheet. Windows fonts first;
# Blender's built-in font if none is found.
FONT_CANDIDATES = [r"C:\Windows\Fonts\ariblk.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
CONDENSE = 0.86


def text_mesh(name, text, width, height, depth, bend=None) -> bpy.types.Mesh:
    """Solid letters facing -Y, centred on the origin, fitted inside width x height.

    bend(x, z) -> y offset lets the letters follow a curved surface.
    """
    cu = bpy.data.curves.new(name + "_font", "FONT")
    cu.body = text
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            cu.font = bpy.data.fonts.load(path, check_existing=True)
            break
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = depth / 2
    cu.resolution_u = 3
    cu.size = 1.0
    obj = bpy.data.objects.new(name + "_font", cu)
    bpy.context.scene.collection.objects.link(obj)
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    w0 = (max(xs) - min(xs)) * CONDENSE
    h0 = max(ys) - min(ys)
    cx0 = (max(xs) + min(xs)) / 2
    cy0 = (max(ys) + min(ys)) / 2
    k = min(width / w0, height / h0)
    for v in bm.verts:
        # Font space: letters in XY facing +Z. Model space: letters in XZ facing -Y.
        x = (v.co.x - cx0) * CONDENSE * k
        z = (v.co.y - cy0) * k
        y = -v.co.z  # extrude already spans -depth/2..depth/2
        v.co = Vector((x, y, z))
    if bend:
        for v in bm.verts:
            v.co.y += bend(v.co.x, v.co.z)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.name = name
    return me


# ---------------------------------------------------------------------------
# Hair volume carved from the sheet's hair silhouettes
# ---------------------------------------------------------------------------


def load_sheet() -> np.ndarray:
    img = bpy.data.images.load(SHEET, check_existing=True)
    w, h = img.size
    # 8-bit images come back as their stored sRGB values (0..1), top row last.
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    return np.round(px[..., :3] * 255).astype(np.int32)


def shift(m: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(dy, 0) : h + min(dy, 0), max(dx, 0) : w + min(dx, 0)] = m[
        max(-dy, 0) : h + min(-dy, 0), max(-dx, 0) : w + min(-dx, 0)
    ]
    return out


def erode(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out &= shift(m, dy, dx)
    return out


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out |= shift(m, dy, dx)
    return out


def largest_component(m: np.ndarray) -> np.ndarray:
    seen = np.zeros_like(m)
    best = None
    best_n = 0
    h, w = m.shape
    for y0, x0 in zip(*np.nonzero(m), strict=True):
        if seen[y0, x0]:
            continue
        comp = []
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(comp) > best_n:
            best_n = len(comp)
            best = comp
    out = np.zeros_like(m)
    if best:
        ys, xs = zip(*best, strict=True)
        out[list(ys), list(xs)] = True
    return out


def smooth_mask(m: np.ndarray, sigma: float) -> np.ndarray:
    """Blur a 2D mask and threshold it again: same shape, smooth edges."""
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = m.astype(np.float32)
    for axis in range(2):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r, r)
        ap = np.pad(a, pad)
        out = np.zeros_like(a)
        n = a.shape[axis]
        for i, w in enumerate(k):
            sl = [slice(None), slice(None)]
            sl[axis] = slice(i, i + n)
            out += w * ap[tuple(sl)]
        a = out
    return a > 0.5


def open3(m: np.ndarray, r: int) -> np.ndarray:
    """3D opening (6-neighbour steps): removes strands thinner than about 2r voxels."""

    def step(a, grow):
        out = a.copy()
        for axis in range(3):
            for d in (1, -1):
                sh = np.zeros_like(a)
                src = [slice(None)] * 3
                dst = [slice(None)] * 3
                if d == 1:
                    src[axis], dst[axis] = slice(0, -1), slice(1, None)
                else:
                    src[axis], dst[axis] = slice(1, None), slice(0, -1)
                sh[tuple(dst)] = a[tuple(src)]
                out = (out | sh) if grow else (out & sh)
        return out

    for _ in range(r):
        m = step(m, False)
    for _ in range(r):
        m = step(m, True)
    return m


def hair_masks(sheet: np.ndarray) -> dict[str, tuple[np.ndarray, np.ndarray, int, int, int, int]]:
    """Per view: (hair mask, skin mask, x0, y0, centre x, feet y), cropped to the head.

    "Skin" is everything drawn that is not hair (face, ears, eyes, outlines):
    hair can hide behind it but must not show in front of it.
    """
    r, g, b = sheet[..., 0], sheet[..., 1], sheet[..., 2]
    bg = (np.abs(r - 254) + np.abs(g - 243) + np.abs(b - 226)) < 45
    skin = (r > 170) & (g > 100) & (b < 170) & (r - b > 50)
    yellow = (r > 200) & (g > 170) & (b < 120)
    white = (r > 200) & (g > 200) & (b > 190) & ~bg
    blue = (b > 140) & (b - r > 80)
    grey = (np.abs(r - g) < 20) & (np.abs(g - b) < 25) & (r > 70) & (r < 200)
    hairish = ~bg & ~skin & ~yellow & ~white & ~blue & ~grey
    out = {}
    for name, _az, cx, feet in VIEWS:
        if name not in ("front", "back", "right_profile", "left_profile"):
            continue
        x0, x1 = cx - 140, cx + 140
        y0, y1 = feet - 400, feet - 196  # head region only (z > 0.98)
        m = largest_component(hairish[y0:y1, x0:x1].copy())
        m = dilate(erode(m, 3), 3)  # drop thin outline strokes round the face and ears
        m = largest_component(m)
        m = erode(m, 3)  # the drawn outline is part of the silhouette; ours is added later
        drawn = ~bg[y0:y1, x0:x1]
        m = smooth_mask(m, 2.0)  # follow the drawn curve, not the pixel steps
        sk = dilate(drawn & ~m, 2) & ~m
        out[name] = (m, sk, x0, y0, cx, feet)
    return out


def face_surfaces(X, Y, Z):
    """Front y, back y and side |x| of the face surface (absolute coordinates)."""
    fs = FACE_SHAPE
    dz = np.clip(np.abs((Z - FACE_Z) / fs.r[2]), 0, 1)
    v = np.clip(1 - dz ** (2 / fs.e1), 0, None) ** (fs.e1 / fs.e2)
    yy = np.clip(v - np.abs(X / fs.r[0]) ** (2 / fs.e2), 0, None)
    half = fs.r[1] * yy ** (fs.e2 / 2)
    xx = np.clip(v - np.abs((Y - FACE_Y) / fs.r[1]) ** (2 / fs.e2), 0, None)
    return FACE_Y - half, FACE_Y + half, fs.r[0] * xx ** (fs.e2 / 2)


def carve_hair(sheet: np.ndarray):
    """The hair, fitted to the sheet's hair silhouettes.

    A smooth mass comes from the silhouettes with their spikes opened away: a
    rounded slice at every height, cut wherever a view shows skin so hair never
    covers the face. The spikes come back as thick bands, and the fringe follows
    the drawn hairline. The sheet's back view
    only keeps the ears and neck clear. Returns the occupancy grid, its origin
    and voxel size.
    """
    masks = hair_masks(sheet)
    vox = 0.005
    ce, se = math.cos(ELEVATION), math.sin(ELEVATION)

    def sample(name, which, sx, sv, open_r=0):
        hair, skin, x0, y0, cx, feet = masks[name]
        m = hair if which == "hair" else skin
        if open_r:
            m = opened[(name, open_r)]
        px, py = np.broadcast_arrays(
            np.round(cx + sx * PX - x0).astype(int), np.round(feet - sv * PX - y0).astype(int)
        )
        ok = (px >= 0) & (px < m.shape[1]) & (py >= 0) & (py < m.shape[0])
        res = np.zeros(px.shape, dtype=bool)
        res[ok] = m[py[ok], px[ok]]
        return res

    OPEN = 10
    opened = {}
    for name in ("front", "right_profile", "left_profile"):
        opened[(name, OPEN)] = dilate(erode(masks[name][0], OPEN), OPEN) & masks[name][0]

    # 1. Body ------------------------------------------------------------
    xs = np.arange(-0.64, 0.64, vox)
    ys = np.arange(-0.62, 0.62, vox)
    zs = np.arange(0.95, 2.05, vox)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    vf, vb = Z * ce + Y * se, Z * ce - Y * se
    vr, vl = Z * ce + X * se, Z * ce - X * se

    zg = zs[None, :] * ce
    fx = sample("front", "hair", xs[:, None], zg, OPEN) | sample("back", "hair", -xs[:, None], zg)
    sy = sample("right_profile", "hair", -ys[:, None], zg, OPEN) | sample(
        "left_profile", "hair", ys[:, None], zg, OPEN
    )
    keep = np.zeros(X.shape, dtype=bool)
    ymid = np.zeros(len(zs))
    for k in range(len(zs)):
        xi = np.nonzero(fx[:, k])[0]
        yi = np.nonzero(sy[:, k])[0]
        if len(xi) == 0 or len(yi) == 0:
            continue
        xa, xb = xs[xi[0]], xs[xi[-1]]
        ya, yb = ys[yi[0]], ys[yi[-1]]
        cxs, rxs = (xa + xb) / 2, max((xb - xa) / 2, 1e-3)
        cys, rys = (ya + yb) / 2, max((yb - ya) / 2, 1e-3)
        ymid[k] = cys
        sl = np.abs((X[:, :, k] - cxs) / rxs) ** 2.6 + np.abs((Y[:, :, k] - cys) / rys) ** 2.6
        keep[:, :, k] = sl <= 1.15

    face_front, face_back, face_side = face_surfaces(X, Y, Z)
    mg = 0.03
    front_ok = sample("front", "hair", X, vf) | (
        sample("front", "skin", X, vf) & (Y > face_front + mg)
    )
    back_skin = sample("back", "skin", -X, vb) & ~sample("back", "hair", -X, vb)
    back_ok = ~back_skin | (Y < face_back - mg)
    right_ok = sample("right_profile", "hair", -Y, vr, OPEN) | (
        sample("right_profile", "skin", -Y, vr) & (X > -face_side + mg)
    )
    left_ok = sample("left_profile", "hair", Y, vl, OPEN) | (
        sample("left_profile", "skin", Y, vl) & (X < face_side - mg)
    )
    keep &= front_ok & back_ok & np.where(X < 0, right_ok, left_ok)

    # Spikes the opening removed come back as thick bands, so they keep real
    # depth instead of thinning to nothing at the edge of a rounded slice.
    spike_f = sample("front", "hair", X, vf) & ~sample("front", "hair", X, vf, OPEN)
    near_mid = np.abs(Y - ymid[None, None, :]) < 0.09
    spike_p = np.where(
        X < 0,
        sample("right_profile", "hair", -Y, vr) & ~sample("right_profile", "hair", -Y, vr, OPEN),
        sample("left_profile", "hair", Y, vl) & ~sample("left_profile", "hair", Y, vl, OPEN),
    )
    keep |= spike_f & near_mid & back_ok
    keep |= spike_p & (np.abs(X) < 0.13) & front_ok
    # Drawn fringe over the forehead lies on the face as a layer thick enough
    # that its edge never dips under the skin.
    on_face = (Y > face_front - 0.06) & (Y < face_front + 0.07) & (face_front < FACE_Y - 0.01)
    on_face &= np.abs(X) < 0.24  # fringe only: side locks became slivers on the cheeks
    keep |= sample("front", "hair", X, vf) & on_face & (Z > 1.18)  # not the chin outline
    keep = open3(keep, 2)  # no wisps or slivers along the skin edges
    return keep.astype(np.float32), np.array([xs[0], ys[0], zs[0]]), vox


def blur3(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur of a 3D array (vectorised)."""
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    for axis in range(3):
        pad = [(0, 0)] * 3
        pad[axis] = (r, r)
        ap = np.pad(a, pad)
        out = np.zeros_like(a)
        n = a.shape[axis]
        for i, w in enumerate(k):
            sl = [slice(None)] * 3
            sl[axis] = slice(i, i + n)
            out += w * ap[tuple(sl)]
        a = out
    return a


def grid_to_mesh(name: str, grid: np.ndarray, origin: np.ndarray, vox: float) -> bpy.types.Object:
    """Occupancy grid -> smooth surface: blur, then mesh the 0.5 level with OpenVDB."""
    import tempfile

    import openvdb

    dens = blur3(np.pad(grid, 4), BLUR).astype(np.float32)
    g = openvdb.FloatGrid()
    g.name = "density"
    start = tuple(int(v) for v in np.round(origin / vox) - 4)
    g.copyFromArray(dens, ijk=start, tolerance=1e-4)
    g.transform = openvdb.createLinearTransform(voxelSize=vox)
    path = os.path.join(tempfile.gettempdir(), f"{name}_density.vdb")
    openvdb.write(path, grids=[g])

    vol_data = bpy.data.volumes.new(name + "_vol")
    vol_data.filepath = path
    vol = bpy.data.objects.new(name + "_vol", vol_data)
    bpy.context.scene.collection.objects.link(vol)

    holder = bpy.data.objects.new(name + "_tmp", bpy.data.meshes.new(name + "_tmp"))
    bpy.context.scene.collection.objects.link(holder)
    v2m = holder.modifiers.new("v2m", "VOLUME_TO_MESH")
    v2m.object = vol
    v2m.grid_name = "density"
    v2m.threshold = 0.5
    v2m.resolution_mode = "GRID"
    v2m.adaptivity = 0.0
    sm = holder.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 1
    dec = holder.modifiers.new("decimate", "DECIMATE")
    dec.ratio = 0.055

    def evaluated_mesh(o):
        me_ = bpy.data.meshes.new_from_object(
            o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        )
        me_.materials.clear()
        return me_

    shape_me = evaluated_mesh(holder)
    bpy.data.objects.remove(holder)
    bpy.data.objects.remove(vol)
    bpy.data.volumes.remove(vol_data)
    os.remove(path)
    bm = bmesh.new()
    bm.from_mesh(shape_me)
    # Drop small loose pieces (stray voxels at the edge of a spike).
    bm.verts.ensure_lookup_table()
    seen = set()
    islands = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        islands.append(island)
    biggest = max(len(i) for i in islands)
    small = [v for i in islands if len(i) < 0.05 * biggest for v in i]
    if small:
        bmesh.ops.delete(bm, geom=small, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(shape_me)
    bm.free()
    for p in shape_me.polygons:
        p.use_smooth = True

    # A heavily smoothed copy supplies calm normals for even cel shading.
    calm = bpy.data.objects.new(name + "_calm", shape_me.copy())
    bpy.context.scene.collection.objects.link(calm)
    cs = calm.modifiers.new("smooth", "SMOOTH")
    cs.factor = 1.0
    cs.iterations = 25
    calm_me = evaluated_mesh(calm)
    bpy.data.objects.remove(calm)
    calm_obj = bpy.data.objects.new(name + "_calm", calm_me)
    bpy.context.scene.collection.objects.link(calm_obj)
    out = bpy.data.objects.new(name, shape_me)
    bpy.context.scene.collection.objects.link(out)
    dt = out.modifiers.new("normals", "DATA_TRANSFER")
    dt.object = calm_obj
    dt.use_loop_data = True
    dt.data_types_loops = {"CUSTOM_NORMAL"}
    dt.loop_mapping = "POLYINTERP_NEAREST"
    final_me = evaluated_mesh(out)
    calm_normals = [v.normal.copy() for v in calm_me.vertices]
    bpy.data.objects.remove(out)
    bpy.data.objects.remove(calm_obj)
    final_me.name = name
    final_me.validate(clean_customdata=False)
    result = bpy.data.objects.new(name, final_me)
    result["_outline_normals"] = [c for n in calm_normals for c in n]
    return result


# ---------------------------------------------------------------------------
# The model
# ---------------------------------------------------------------------------


def build() -> bpy.types.Object:
    root = empty("tanod", None, (0, 0, 0))

    # Ground shadow: a flat translucent disc.
    bpy.ops.mesh.primitive_circle_add(
        vertices=40, radius=0.42, fill_type="NGON", location=(0, 0, 0.002)
    )
    shadow = bpy.context.active_object
    shadow.name = "groundShadow"
    shadow.scale = (1, 0.4, 1)
    sm = bpy.data.materials.new("groundShadow")
    sm.use_nodes = True
    sm["srgb"] = (0.541, 0.416, 0.29)
    shadow.data.materials.append(sm)
    MATS["groundShadow"] = sm
    shadow.parent = root

    # Hips and legs (hip joint at z 0.40).
    hips = empty("hips", root, (0, 0, 0.4))
    blob("pantsSeat", Soft((0.235, 0.19, 0.09), 0.5, 0.6), "navy", hips, (0, 0, 0))
    for side, nm in ((1, "legL"), (-1, "legR")):
        leg = empty(nm, hips, (side * 0.125, 0, 0))
        blob(nm + "_pants", Soft((0.104, 0.16, 0.18), 0.45, 0.6), "navy", leg, (0, 0, -0.16))
        blob(
            nm + "_shoe",
            Soft((0.118, 0.19, 0.064), 0.35, 0.55),
            "shoe",
            leg,
            (side * 0.004, -0.04, -0.335),
        )

    # Torso.
    torso = empty("torso", hips, (0, 0, 0))
    vz = 0.355
    vest_shape = Soft((0.25, 0.215, 0.245), 0.32, 0.5)
    blob("vest", vest_shape, "vest", torso, (0, 0, vz))
    for i, band in enumerate(((-0.125, -0.08), (-0.04, 0.005))):
        mesh_obj(
            f"vestStripe{i + 1}",
            vest_shape.mesh(f"vestStripe{i + 1}", 32, 22, band, 1.012),
            "stripe",
            torso,
            (0, 0, vz),
            False,
        )

    def front_y(x, z):
        return vest_shape.y_at(x, z - vz, -1)

    def vest_normal(x, z, sign=-1):
        return vest_shape.normal((x, vest_shape.y_at(x, z - vz, sign), z - vz))

    box("vestZipper", (0.012, 0.01, 0.3), "zip", torso, (0, front_y(0, 0.37) - 0.004, 0.37))

    # Polo collar: band round the neck, two flaps making a V.
    blob("collarBand", Soft((0.155, 0.15, 0.04), 0.5, 0.7), "navy", torso, (0, 0, 0.585))
    for side, nm in ((1, "collarL"), (-1, "collarR")):
        x, z = side * 0.09, 0.555
        flap = blob(
            nm, Soft((0.09, 0.014, 0.045), 0.5, 0.6), "navy", torso, (x, front_y(x, z) - 0.01, z)
        )
        orient(flap, vest_normal(x, z), side * 0.5)

    # Chest patch on the character's left.
    x, z = 0.125, 0.44
    patch = empty("chestPatchGroup", torso, (x, front_y(x, z) - 0.004, z))
    orient(patch, vest_normal(x, z))
    plate = blob(
        "chestPatch", Soft((0.09, 0.006, 0.038), 0.25, 0.25), "patch", patch, (0, 0, 0), False
    )
    add_outline(plate, 0.009)
    mesh_obj(
        "chestPatchText",
        text_mesh("chestPatchText", "TANOD", 0.15, 0.05, 0.004),
        "eye",
        patch,
        (0, -0.007, 0),
        False,
    )

    # Back print, bent to follow the vest.
    zb = 0.515
    yc = vest_shape.y_at(0, zb - vz, 1)

    def bend(lx, lz):
        # Letters are rotated to face +Y, so their local +x is the model's -x.
        return -(vest_shape.y_at(-lx, zb + lz - vz, 1) - yc)

    back = mesh_obj(
        "backPrint",
        text_mesh("backPrint", "TANOD", 0.42, 0.13, 0.012, bend),
        "patch",
        torso,
        (0, yc + 0.004, zb),
        False,
    )
    back.rotation_euler = (0, 0, math.pi)
    add_outline(back, 0.008)

    # Duty belt, buckle, pouches, holster and baton (character's right).
    blob("belt", Soft((0.285, 0.25, 0.046), 0.3, 0.5), "gear", torso, (0, 0, 0.12))
    blob("beltBuckle", Soft((0.05, 0.012, 0.036), 0.4, 0.4), "buckle", torso, (0, -0.25, 0.12))
    blob(
        "beltBuckleInner",
        Soft((0.026, 0.006, 0.016), 0.4, 0.4),
        "gear",
        torso,
        (0, -0.26, 0.12),
        False,
    )
    for nm, loc in (
        ("beltPouchFL", (0.2, -0.23, 0.11)),
        ("beltPouchFR", (-0.2, -0.23, 0.11)),
        ("beltPouchBL", (0.18, 0.23, 0.11)),
        ("beltPouchBR", (-0.18, 0.23, 0.11)),
    ):
        blob(nm, Soft((0.032, 0.024, 0.05), 0.4, 0.5), "gear", torso, loc)
    blob("holster", Soft((0.038, 0.05, 0.075), 0.45, 0.6), "gear", torso, (-0.285, 0.06, 0.1))
    blob("baton", Soft((0.034, 0.034, 0.185), 0.9, 1.0), "gear", torso, (-0.29, 0.06, -0.04))

    # Arms (shoulder pivots); rest pose swings the hands slightly outward.
    for side, nm in ((1, "armL"), (-1, "armR")):
        arm = empty(nm, torso, (side * 0.255, 0, 0.53))
        arm.rotation_euler = (0, -side * ARM_REST, 0)
        sleeve = blob(
            nm + "_sleeve",
            Soft((0.085, 0.1, 0.105), 0.45, 0.6),
            "navy",
            arm,
            (side * 0.01, 0, -0.075),
            outline=False,
            taper=0.3,
        )
        add_outline(sleeve)
        # Elbow: the forearm hangs straighter than the sleeve, as drawn.
        fore = empty(nm.replace("arm", "forearm"), arm, (side * 0.012, 0, -0.165))
        fore.rotation_euler = (0, side * ELBOW_REST, 0)
        blob(nm + "_forearm", Soft((0.05, 0.056, 0.065), 0.6, 0.8), "skin", fore, (0, 0, -0.045))
        blob(
            nm + "_hand",
            Soft((0.088, 0.092, 0.09), 0.7, 0.8),
            "skin",
            fore,
            (side * 0.006, -0.006, -0.165),
        )

    # Head (neck pivot at z 0.97 absolute).
    head = empty("head", torso, (0, 0, 0.57))
    fc = Vector((0, FACE_Y, FACE_Z - 0.97))
    face_shape = FACE_SHAPE
    blob("face", face_shape, "skin", head, tuple(fc))
    for side, nm in ((1, "earL"), (-1, "earR")):
        blob(nm, Soft((0.06, 0.065, 0.1), 0.7, 0.8), "skin", head, (side * 0.37, 0, 0.25))

    def on_face(nm, size, x, z, mat):
        local = Vector((x, face_shape.y_at(x, z - fc.z, -1), z - fc.z))
        n = face_shape.normal(local)
        me = Soft((size[0], size[1], size[2]), 1.0, 1.0).mesh(nm, 20, 14)
        o = mesh_obj(nm, me, mat, head, tuple(local + fc - n * size[1] * 0.3), False)
        orient(o, n)
        return o

    on_face("eyeL", (0.03, 0.02, 0.07), 0.14, 0.335, "eye")
    on_face("eyeR", (0.03, 0.02, 0.07), -0.14, 0.335, "eye")
    mouth = on_face("mouth", (0.04, 0.012, 0.018), 0, 0.17, "mouth")
    mouth.hide_render = True
    mouth.hide_set(True)  # view-layer hide keeps it evaluated, so it exports in place
    mouth["startHidden"] = True

    # Hair carved from the sheet; built in model space, then parented to the head.
    hair_obj = grid_to_mesh("hair", *carve_hair(load_sheet()))
    hair_obj.data.materials.append(material("hair"))
    link(hair_obj, None)
    bpy.context.view_layer.update()
    head_world = head.matrix_world.copy()
    hair_obj.parent = head
    hair_obj.matrix_parent_inverse = head_world.inverted()

    def over_forehead(co):
        # The shell below the fringe showed as a ghost line on the forehead.
        return abs(co.x) < 0.34 and 1.1 < co.z < 1.6 and co.y < FACE_Y - 0.1

    add_outline(hair_obj, 0.025, skip=over_forehead)

    return root


# ---------------------------------------------------------------------------
# Comparison renders
# ---------------------------------------------------------------------------


def setup_render() -> None:
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.resolution_x = 300
    sc.render.resolution_y = 435
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.eevee.taa_render_samples = 16
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("sun", sun_data)
    sc.collection.objects.link(sun)
    # The sheet is lit from the viewer's upper left.
    sun.rotation_euler = Vector((2, 3, -4)).normalized().to_track_quat("-Z", "Y").to_euler()


def render_views(out_dir: str) -> dict[str, np.ndarray]:
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 435 / PX
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    centre_h = (410 - 25) / 2 / PX
    shots = {}
    for name, az, _cx, _feet in VIEWS:
        a = math.radians(az)
        d = Vector(
            (
                math.sin(a) * math.cos(ELEVATION),
                -math.cos(a) * math.cos(ELEVATION),
                math.sin(ELEVATION),
            )
        )
        target = Vector((0, 0, centre_h / math.cos(ELEVATION)))
        cam.location = target + d * 10
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"view_{name}.png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
        bpy.data.images.remove(img)
        shots[name] = px
    return shots


def save_png(path: str, rgba_topdown: np.ndarray) -> None:
    h, w, _ = rgba_topdown.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels = rgba_topdown[::-1].ravel().tolist()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def compare(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for name, (m, sk, *_rest) in hair_masks(load_sheet()).items():
        rgba = np.zeros((*m.shape, 4), np.float32)
        rgba[..., 2] = m
        rgba[..., 0] = sk
        rgba[..., 3] = 1
        save_png(os.path.join(out_dir, f"hairmask_{name}.png"), rgba)
    set_shading(True)
    setup_render()
    shots = render_views(out_dir)
    sheet = load_sheet().astype(np.float32) / 255
    H, W, _ = sheet.shape
    base = np.concatenate([sheet, np.ones((H, W, 1), np.float32)], axis=2)
    for label, alpha in (("overlay", 1.0), ("blend", 0.5)):
        canvas = base.copy()
        for name, _az, cx, feet in VIEWS:
            s = shots[name]
            x0, y0 = cx - 150, feet - 410
            region = canvas[y0 : y0 + 435, x0 : x0 + 300]
            a = s[..., 3:4] * alpha
            region[..., :3] = region[..., :3] * (1 - a) + s[..., :3] * a
        save_png(os.path.join(out_dir, f"compare_{label}.png"), canvas)
    # Side by side: sheet crop | render, for each view.
    tiles = []
    for name, _az, cx, feet in VIEWS:
        ref = base[feet - 410 : feet + 25, cx - 150 : cx + 150].copy()
        s = shots[name]
        mine = base[feet - 410 : feet + 25, cx - 150 : cx + 150].copy()
        mine[..., :3] = np.where(
            s[..., 3:4] > 0, mine[..., :3] * (1 - s[..., 3:4]) + s[..., :3] * s[..., 3:4], 1.0
        )
        mine[..., :3] = np.where(s[..., 3:4] > 0, mine[..., :3], np.array([0.996, 0.953, 0.886]))
        tiles.append(np.concatenate([ref, mine], axis=1))
    row1 = np.concatenate(tiles[:4], axis=1)
    row2 = np.concatenate(tiles[4:], axis=1)
    save_png(os.path.join(out_dir, "compare_side.png"), np.concatenate([row1, row2], axis=0))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def render_still(path: str) -> None:
    """A transparent PNG of the mascot, shown while the 3D view loads or without WebGL."""
    set_shading(True)
    if "sun" not in bpy.data.objects:
        setup_render()
    sc = bpy.context.scene
    sc.render.resolution_x = 320
    sc.render.resolution_y = 400
    sc.render.film_transparent = True
    cam_data = bpy.data.cameras.new("still_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.25
    cam = bpy.data.objects.new("still_cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    a, e = math.radians(20), math.radians(6)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = Vector((0, 0, 0.98)) + d * 10
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    print(f"wrote {path}")


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = dict(zip(argv[::2], argv[1::2], strict=False))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    build()
    if "--compare" in args:
        compare(os.path.abspath(args["--compare"]))
    if "--still" in args:
        render_still(os.path.abspath(args["--still"]))
    if "--glb" in args:
        set_shading(False)
        path = os.path.abspath(args["--glb"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_visible=False,
            export_extras=True,
            export_apply=True,
            export_yup=True,
            export_texcoords=False,
            export_lights=False,
            export_cameras=False,
            use_selection=False,
        )
        print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")
    if "--blend" in args:
        set_shading(True)
        for o in list(bpy.data.objects):
            if o.name in ("cam", "sun"):
                bpy.data.objects.remove(o)
        path = os.path.abspath(args["--blend"])
        bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
