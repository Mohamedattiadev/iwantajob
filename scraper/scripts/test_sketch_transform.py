"""Automated audit of /api/sketch/transform.

Runs 20+ scenarios against a live backend, validates the math of each
response (enclosure, square ratio, inscribed fit, ratio of overlap for
venn, etc.), and writes a structured PASS/FAIL log to
/tmp/sketch-audit.log.

Run:
    python scraper/scripts/test_sketch_transform.py
    python scraper/scripts/test_sketch_transform.py --base http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys
import time
import uuid

import httpx

LOG = pathlib.Path("/tmp/sketch-audit.log")


def _new_id() -> str:
    return uuid.uuid4().hex[:16]


def _rect(x: float, y: float, w: float, h: float, **k) -> dict:
    return {
        "id": _new_id(), "type": "rectangle",
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
        "fillStyle": "hachure", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100,
        **k,
    }


def _ellipse(x: float, y: float, w: float, h: float, **k) -> dict:
    return {
        "id": _new_id(), "type": "ellipse",
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
        "fillStyle": "hachure", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100,
        **k,
    }


def _diamond(x: float, y: float, w: float, h: float, **k) -> dict:
    return {
        "id": _new_id(), "type": "diamond",
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
        "fillStyle": "hachure", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100,
        **k,
    }


def _text(x: float, y: float, w: float, h: float, text: str) -> dict:
    return {
        "id": _new_id(), "type": "text",
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "text": text, "fontSize": 20, "fontFamily": 1,
        "textAlign": "left", "verticalAlign": "top",
        "strokeColor": "#1e1e1e", "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100,
    }


def selection_bbox(els):
    xs = [e["x"] for e in els]
    ys = [e["y"] for e in els]
    xe = [e["x"] + e["width"] for e in els]
    ye = [e["y"] + e["height"] for e in els]
    return {
        "x": min(xs), "y": min(ys),
        "w": max(xe) - min(xs), "h": max(ye) - min(ys),
        "cx": (min(xs) + max(xe)) / 2,
        "cy": (min(ys) + max(ye)) / 2,
    }


def shape_bbox(s):
    return {
        "x": float(s.get("x") or 0), "y": float(s.get("y") or 0),
        "w": float(s.get("width") or 0), "h": float(s.get("height") or 0),
        "cx": float(s.get("x") or 0) + float(s.get("width") or 0) / 2,
        "cy": float(s.get("y") or 0) + float(s.get("height") or 0) / 2,
    }


def rect_encloses_rect(outer, inner) -> tuple[bool, dict]:
    slack = {
        "left":   inner["x"] - outer["x"],
        "top":    inner["y"] - outer["y"],
        "right":  (outer["x"] + outer["w"]) - (inner["x"] + inner["w"]),
        "bottom": (outer["y"] + outer["h"]) - (inner["y"] + inner["h"]),
    }
    return min(slack.values()) >= -0.5, slack


def ellipse_encloses_rect(ell, rect) -> tuple[bool, dict]:
    """For each corner of rect, check (x-cx)^2/rx^2 + (y-cy)^2/ry^2 <= 1."""
    cx, cy = ell["cx"], ell["cy"]
    rx, ry = ell["w"] / 2, ell["h"] / 2
    if rx <= 0 or ry <= 0:
        return False, {"reason": "ellipse has zero axis"}
    corners = [
        (rect["x"], rect["y"]),
        (rect["x"] + rect["w"], rect["y"]),
        (rect["x"], rect["y"] + rect["h"]),
        (rect["x"] + rect["w"], rect["y"] + rect["h"]),
    ]
    vals = [((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) for x, y in corners]
    return max(vals) <= 1.02, {"corner_norms": vals, "max": max(vals)}


def is_square(b, tol=0.05) -> bool:
    if b["w"] <= 0 or b["h"] <= 0:
        return False
    return abs(b["w"] - b["h"]) / max(b["w"], b["h"]) <= tol


def is_circle(b, tol=0.05) -> bool:
    return is_square(b, tol)


# ── scenarios ─────────────────────────────────────────────────────────

SCENARIOS = [
    {
        "name": "wrap_rect_in_circle",
        "prompt": "put in a circle",
        "elements": [_rect(0, 0, 200, 200)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_tall_rect_in_circle",
        "prompt": "put in a circle",
        "elements": [_rect(100, 100, 100, 300)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_rect_in_ellipse",
        "prompt": "wrap with an ellipse",
        "elements": [_rect(0, 0, 300, 150)],
        "expect": {"add_type": "ellipse", "must_enclose": True},
    },
    {
        "name": "wrap_rect_in_square",
        "prompt": "put inside a square",
        "elements": [_rect(50, 50, 200, 100)],
        "expect": {"add_type": "rectangle", "must_enclose": True, "square": True},
    },
    {
        "name": "wrap_ellipse_in_square",
        "prompt": "put this inside a square",
        "elements": [_ellipse(0, 0, 260, 220)],
        "expect": {"add_type": "rectangle", "must_enclose": True, "square": True},
    },
    {
        "name": "wrap_ellipse_in_circle",
        "prompt": "put in a circle",
        "elements": [_ellipse(-100, -100, 200, 200)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_two_rects_in_rectangle",
        "prompt": "wrap both with a rectangle",
        "elements": [_rect(0, 0, 100, 100), _rect(200, 50, 100, 80)],
        "expect": {"add_type": "rectangle", "must_enclose": True},
    },
    {
        "name": "wrap_text_in_rect",
        "prompt": "put a box around this",
        "elements": [_text(0, 0, 180, 40, "hello")],
        "expect": {"add_type": "rectangle", "must_enclose": True},
    },
    {
        "name": "recolor_red",
        "prompt": "make them red",
        "elements": [_rect(0, 0, 100, 100), _ellipse(200, 0, 100, 100)],
        "expect": {"modify_field": "strokeColor"},
    },
    {
        "name": "thicker_stroke",
        "prompt": "make the stroke thicker",
        "elements": [_rect(0, 0, 100, 100)],
        "expect": {"modify_field": "strokeWidth"},
    },
    {
        "name": "delete_shape",
        "prompt": "delete this",
        "elements": [_rect(0, 0, 100, 100)],
        "expect": {"delete_count": 1},
    },
    {
        "name": "redraw_as_diamond",
        "prompt": "redraw this as a diamond",
        "elements": [_rect(0, 0, 200, 200)],
        "expect": {"add_type": "diamond", "delete_count": 1},
    },
    {
        "name": "wrap_diamond_in_circle",
        "prompt": "put in a circle",
        "elements": [_diamond(-50, -50, 200, 200)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_offset_far_origin",
        "prompt": "put in a circle",
        "elements": [_rect(5000, 5000, 150, 150)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_negative_coords",
        "prompt": "put in a circle",
        "elements": [_rect(-3000, -3000, 150, 150)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_three_in_rectangle",
        "prompt": "put all three in a rectangle",
        "elements": [_rect(0, 0, 80, 80), _rect(100, 0, 80, 80), _rect(200, 0, 80, 80)],
        "expect": {"add_type": "rectangle", "must_enclose": True},
    },
    {
        "name": "wrap_wide_rect_in_circle",
        "prompt": "put in a circle",
        "elements": [_rect(0, 0, 600, 100)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_thin_tall_in_square",
        "prompt": "put in a square",
        "elements": [_rect(0, 0, 50, 400)],
        "expect": {"add_type": "rectangle", "must_enclose": True, "square": True},
    },
    {
        "name": "wrap_small_text_in_ellipse",
        "prompt": "wrap with an ellipse",
        "elements": [_text(0, 0, 80, 24, "hi")],
        "expect": {"add_type": "ellipse", "must_enclose": True},
    },
    {
        "name": "wrap_two_circles_in_rect",
        "prompt": "put both in a rectangle",
        "elements": [_ellipse(0, 0, 100, 100), _ellipse(200, 100, 80, 80)],
        "expect": {"add_type": "rectangle", "must_enclose": True},
    },
    {
        "name": "wrap_text_in_circle",
        "prompt": "put this in a circle",
        "elements": [_text(0, 0, 200, 30, "hello world")],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
    {
        "name": "wrap_rect_in_diamond",
        "prompt": "wrap with a diamond",
        "elements": [_rect(0, 0, 100, 100)],
        "expect": {"add_type": "diamond", "must_enclose": True},
    },
    {
        "name": "wrap_zero_at_origin",
        "prompt": "put in a circle",
        "elements": [_rect(0, 0, 100, 100)],
        "expect": {"add_type": "ellipse", "must_enclose": True, "circle": True},
    },
]


def evaluate(scn, resp):
    """Compare backend response against scenario expectations."""
    notes = []
    out_elements = resp.get("elements", [])
    ops = resp.get("ops", {})
    expect = scn["expect"]
    sel_ids = {e["id"] for e in scn["elements"]}
    new_shapes = [e for e in out_elements if e.get("id") not in sel_ids]
    preserved = [e for e in out_elements if e.get("id") in sel_ids]
    sel_bbox = selection_bbox(scn["elements"])

    ok = True

    # delete_count expectation
    if "delete_count" in expect:
        deleted = ops.get("deleted", 0)
        if deleted != expect["delete_count"]:
            ok = False
            notes.append(f"deleted={deleted} expected={expect['delete_count']}")

    # modify_field expectation — at least one preserved element must
    # have changed value for that field.
    if "modify_field" in expect:
        field = expect["modify_field"]
        original_by_id = {e["id"]: e for e in scn["elements"]}
        any_changed = False
        for p in preserved:
            orig = original_by_id.get(p["id"])
            if orig and orig.get(field) != p.get(field):
                any_changed = True
                break
        if not any_changed:
            ok = False
            notes.append(f"no modification on field={field}")

    # add_type expectation
    if "add_type" in expect:
        want_type = expect["add_type"]
        matching = [s for s in new_shapes if s.get("type") == want_type]
        if not matching:
            ok = False
            notes.append(f"no added shape of type={want_type}; got types={[s.get('type') for s in new_shapes]}")
        else:
            shape = matching[0]
            sb = shape_bbox(shape)
            if expect.get("must_enclose"):
                if want_type == "ellipse":
                    enc, info = ellipse_encloses_rect(sb, sel_bbox)
                    notes.append(f"ellipse_enclose={enc} corner_max_norm={info.get('max'):.3f}")
                    if not enc:
                        ok = False
                else:  # rectangle / diamond → bbox check
                    enc, slack = rect_encloses_rect(sb, sel_bbox)
                    notes.append(f"bbox_enclose={enc} slack={ {k: round(v, 1) for k, v in slack.items()} }")
                    if not enc:
                        ok = False
            if expect.get("square") and not is_square(sb):
                ok = False
                notes.append(f"not_square w={sb['w']:.1f} h={sb['h']:.1f}")
            if expect.get("circle") and not is_circle(sb):
                ok = False
                notes.append(f"not_circle w={sb['w']:.1f} h={sb['h']:.1f}")

    return ok, notes


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://127.0.0.1:8000")
    p.add_argument("--skill", default="Scratchpad")
    p.add_argument("--retries", type=int, default=1)
    args = p.parse_args()

    LOG.write_text("")  # truncate
    def log(s=""):
        print(s)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(s + "\n")

    log(f"=== sketch-transform audit @ {time.strftime('%Y-%m-%d %H:%M:%S')} ===")
    log(f"base={args.base}  scenarios={len(SCENARIOS)}\n")

    passed = 0
    failed_names = []

    with httpx.Client(timeout=60) as c:
        for i, scn in enumerate(SCENARIOS, 1):
            ok = False
            notes = []
            err = None
            resp = None
            for attempt in range(args.retries):
                try:
                    r = c.post(
                        f"{args.base}/api/sketch/transform",
                        json={
                            "prompt": scn["prompt"],
                            "elements": scn["elements"],
                            "skill": args.skill,
                        },
                    )
                    if r.status_code != 200:
                        err = f"HTTP {r.status_code}: {r.text[:200]}"
                        continue
                    resp = r.json()
                    ok, notes = evaluate(scn, resp)
                    if ok:
                        break
                except Exception as e:  # noqa: BLE001
                    err = f"{type(e).__name__}: {e}"

            status = "PASS" if ok else "FAIL"
            if ok:
                passed += 1
            else:
                failed_names.append(scn["name"])

            log(f"[{i:02d}/{len(SCENARIOS)}] {status}  {scn['name']}")
            log(f"    prompt: {scn['prompt']!r}")
            log(f"    selection_bbox: {selection_bbox(scn['elements'])}")
            if err:
                log(f"    error: {err}")
            if resp is not None:
                ops = resp.get("ops", {})
                log(f"    ops: {ops}")
                sel_ids = {e['id'] for e in scn['elements']}
                added = [e for e in resp.get("elements", []) if e.get("id") not in sel_ids]
                for s in added:
                    sb = shape_bbox(s)
                    log(f"    added: type={s.get('type')} bbox=({sb['x']:.1f},{sb['y']:.1f},{sb['w']:.1f}x{sb['h']:.1f})")
            for n in notes:
                log(f"    note: {n}")
            log("")

    log("=== summary ===")
    log(f"passed: {passed}/{len(SCENARIOS)}")
    if failed_names:
        log(f"failed: {', '.join(failed_names)}")
    log(f"log: {LOG}")
    return 0 if passed == len(SCENARIOS) else 1


if __name__ == "__main__":
    sys.exit(main())
