"""
07_cek_tumpang_tindih.py  -- hanya MEMBACA.
Mencari poligon yang saling menimpa (antar kab/kota, atau di dalam satu
kab/kota yang tergabung) dengan merasterisasi peta ke grid kasar.

Pemakaian (dari folder proyek):
  python scripts/07_cek_tumpang_tindih.py [docs/data/kabkota_miskin.geojson] [ukuran_sel_derajat]
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

path = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/data/kabkota_miskin.geojson")
CELL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.02
BATAS = 0.20          # laporkan jika tumpang tindih >= 20% dari poligon yang lebih kecil

d = json.loads(path.read_text(encoding="utf-8"))
polys = []            # (indeks fitur, nama, provinsi, cincin luar)
for fi, f in enumerate(d["features"]):
    g = f["geometry"]
    if not g:
        continue
    kum = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for pl in kum:
        polys.append((fi, f["properties"]["nama"], f["properties"]["prov"],
                      np.array(pl[0], dtype=float)))

allp = np.vstack([p[3] for p in polys])
x0, y0 = allp[:, 0].min() - CELL, allp[:, 1].min() - CELL
W = int((allp[:, 0].max() - x0) / CELL) + 2
H = int((allp[:, 1].max() - y0) / CELL) + 2
owner = np.full(H * W, -1, dtype=np.int32)


def di_dalam(px, py, ring):
    """Ray casting vektor: apakah titik (px,py) di dalam cincin."""
    x, y = ring[:, 0], ring[:, 1]
    xa, ya, xb, yb = x[:-1], y[:-1], x[1:], y[1:]
    ins = np.zeros(px.shape, dtype=bool)
    for i in range(len(xa)):
        cond = (ya[i] > py) != (yb[i] > py)
        if not cond.any():
            continue
        xi = (xb[i] - xa[i]) * (py - ya[i]) / (yb[i] - ya[i] + 1e-18) + xa[i]
        ins ^= cond & (px < xi)
    return ins


luas_sel = {}
pasang = Counter()
for n, (fi, nama, prov, ring) in enumerate(polys):
    cx0, cx1 = int((ring[:, 0].min() - x0) / CELL), int((ring[:, 0].max() - x0) / CELL) + 1
    cy0, cy1 = int((ring[:, 1].min() - y0) / CELL), int((ring[:, 1].max() - y0) / CELL) + 1
    gx, gy = np.meshgrid(np.arange(cx0, cx1 + 1), np.arange(cy0, cy1 + 1))
    px, py = x0 + (gx.ravel() + .5) * CELL, y0 + (gy.ravel() + .5) * CELL
    m = di_dalam(px, py, ring)
    idx = (gy.ravel()[m] * W + gx.ravel()[m])
    luas_sel[n] = len(idx)
    if len(idx) == 0:
        continue
    lama = owner[idx]
    for o, c in Counter(lama[lama >= 0].tolist()).items():
        pasang[(o, n)] += c
    owner[idx[lama < 0]] = n

hasil = []
for (a, b), c in pasang.items():
    kecil = min(luas_sel[a], luas_sel[b])
    if kecil >= 3 and c / kecil >= BATAS:
        hasil.append((c / kecil, a, b, c))
hasil.sort(reverse=True)

print(f"Poligon: {len(polys)} | grid {W}x{H} sel {CELL} derajat")
print(f"Pasangan tumpang tindih >= {BATAS:.0%} dari yang lebih kecil: {len(hasil)}\n")
for frac, a, b, c in hasil[:40]:
    pa, pb = polys[a], polys[b]
    jenis = "DALAM SATU FITUR" if pa[0] == pb[0] else "antar fitur"
    print(f"{frac:5.0%}  [{jenis}]  {pa[1]} ({pa[2]})  x  {pb[1]} ({pb[2]})")
if len(hasil) > 40:
    print(f"... dan {len(hasil) - 40} pasangan lain")