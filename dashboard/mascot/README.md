# Tanod mascot (Blender)

The chatbot mascot from the "Barangay Tanod" turnaround sheet, built in Blender
by a script so it can be rebuilt and adjusted. The dashboard loads the exported
GLB; this folder is not part of the dashboard build.

| File                         | What it is                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `turnaround.webp`            | The character sheet. The script measures it and carves the hair from it.         |
| `build_tanod.py`             | Builds the model in Blender, renders comparisons, exports.                       |
| `tanod.blend`                | The built scene with cel-shaded materials, for viewing or hand edits in Blender. |
| `../public/mascot/tanod.glb` | The export the app loads (about 1.5 MB, about 0.95 MB gzipped).                  |

## Rebuild

Needs Blender 4.5 (installed at `D:\Blender` on the dev machine). Run from `dashboard/`:

```powershell
D:\Blender\blender.exe -b --factory-startup --python mascot/build_tanod.py -- --blend mascot/tanod.blend --glb public/mascot/tanod.glb --compare mascot/renders
```

All three flags are optional. `--compare` renders the 8 views at the sheet's own
scale and writes `compare_overlay.png`, `compare_blend.png` (50% over the
sheet) and `compare_side.png` (sheet and model side by side). `mascot/renders/`
is gitignored.

Hand edits made in `tanod.blend` are lost on the next rebuild. Put lasting changes in the script.

## How it matches the sheet

- 1 model unit = 200 px on the sheet. Feet are at height 0 and the top of the hair at 1.93.
- Body parts are superellipsoids (smooth "soft squares") sized from the sheet.
- The hair is carved from the sheet's hair silhouettes (front, both profiles,
  back), seen from the sheet's slight overhead angle (7°), and meshed with
  OpenVDB. A rounded mass comes from the silhouettes with their spikes removed;
  the spikes come back as thick bands at the head's mid-depth, and drawn hair
  over the face (fringe, side locks by the temples) lies on the face as a thin
  layer. Wherever a view shows skin, hair is only allowed behind the face.
- The sheet's views disagree in places: the back view's spikes don't match the
  front view's, and "front right ¾" faces the wrong way. So the front view and
  profiles take priority. Measured silhouette overlap (IoU, whole figure) with
  the drawing: front 0.85, right profile 0.86, left profile 0.85, back 0.83.
- "TANOD" on the chest patch and the back print is real lettering (Arial Black,
  condensed to 86%), with the back print bent to follow the vest. If that font
  is missing, the script falls back to Arial Bold, then Blender's built-in font.
- Outlines are inverted hulls: a slightly larger copy of each part, with flipped
  faces and a black material that draws front faces only. In the GLB every
  material is single-sided (`doubleSided: false`), which makes three.js and
  other glTF viewers draw the outlines correctly. Don't make them double-sided.

## Rig (pivot nodes)

In glTF/three.js terms the character faces +Z, its left is +X, and up is +Y.
Animate the pivot nodes, not the meshes.

| Node                   | Pivot           | Use                                                                                                                |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `tanod`                | ground          | root: place, scale or turn the whole mascot                                                                        |
| `hips`                 | hips (y 0.40)   | `position.y` to bob or hop                                                                                         |
| `torso`                | waist           | lean, twist                                                                                                        |
| `head`                 | neck (y 0.97)   | nod, tilt, turn                                                                                                    |
| `armL`, `armR`         | shoulders       | rest pose `rotation.z = ±0.30` (sleeves flare out); raise to wave                                                  |
| `forearmL`, `forearmR` | elbows          | rest pose `rotation.z = ∓0.10` (forearm hangs straighter); bend for gestures                                       |
| `legL`, `legR`         | hip joints      | `rotation.x` to walk                                                                                               |
| `eyeL`, `eyeR`         | eye centres     | `scale.y` toward 0.1 to blink (scale is 1 at rest)                                                                 |
| `mouth`                | mouth           | hidden on the sheet. Its node carries `extras.startHidden = true`; hide it after loading and show it while talking |
| `hair`                 | (child of head) | follows the head                                                                                                   |
| `groundShadow`         | floor           | flat disc; scale it with hops                                                                                      |

Outline meshes are named `<part>_outline` and are children of their part, so they move with it.
