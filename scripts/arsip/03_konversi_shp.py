"""
03_konversi_shp.py
Shapefile kab/kota (LapakGIS 2024) -> GeoJSON bersih & ringan untuk D3.

Yang dilakukan:
  1. Fitur berkolom nama KOSONG dibuang (potongan pulau tanpa nama),
     dicatat di data/processed/tanpa_nama.csv.
  2. Fitur sampah dibuang: nama berisi '/' (gabungan dua kab) dan 'Pahuwato'
     (salah eja dari 'Pohuwato', tumpang tindih).
  3. Fitur bernama sama di provinsi sama (potongan pulau) DIGABUNG menjadi
     satu MultiPolygon, bukan dibuang.
  4. Bentuk disederhanakan (Douglas-Peucker, toleransi dalam derajat).
  5. Arah cincin diperbaiki untuk D3 (luar = searah jarum jam).
  6. Koordinat dibulatkan (3-4 desimal, tergantung toleransi).
  7. Lubang poligon dibuang dan fitur diurutkan dari terluas ke tersempit
     (kota enclave tergambar di atas kabupaten pengepungnya).
  8. Pulau KECIL (luas < argumen ke-4, default 0.001 derajat persegi, kira-kira
     12 km2) dibuang, karena tidak terlihat pada peta nasional dan menjadi
     penyebab utama ukuran file besar. Setiap kab/kota tetap menyimpan
     minimal pulau terbesarnya, sehingga tidak ada wilayah yang hilang.

Pemakaian (dari folder proyek):
  python scripts/03_konversi_shp.py data/raw/geo/LapakGIS_Batas_Kabupaten_2024.shp docs/data/kabkota.geojson 0.01 0.001
  (argumen ke-3 = toleransi penyederhanaan, derajat; ke-4 = luas pulau minimum)
"""
import collections
import csv
import json
import sys
import time
from math import hypot
from pathlib import Path

import shapefile  # pyshp

src, dst = sys.argv[1], Path(sys.argv[2])
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.003
MIN_LUAS = float(sys.argv[4]) if len(sys.argv) > 4 else 0.001   # derajat persegi
DES = 3 if tol >= 0.005 else 4        # jumlah desimal koordinat
dst.parent.mkdir(parents=True, exist_ok=True)
NAMA_SAMPAH = {"Pahuwato"}


def luas(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
               for i in range(len(r) - 1)) / 2


def jarak(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy)
                     / (dx * dx + dy * dy)))
    return hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def tipis(pts, d):
    """Pra-penyederhanaan cepat O(n): buang titik yang terlalu dekat dengan
    titik sebelumnya. Mempercepat Douglas-Peucker pada data yang sangat rapat."""
    out = [pts[0]]
    for p in pts[1:-1]:
        if hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= d:
            out.append(p)
    out.append(pts[-1])
    return out


def dp(pts, tol):
    """Douglas-Peucker iteratif (tanpa rekursi)."""
    n = len(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        dmax, k = 0.0, None
        for m in range(i + 1, j):
            d = jarak(pts[m], pts[i], pts[j])
            if d > dmax:
                dmax, k = d, m
        if k is not None and dmax > tol:
            keep[k] = True
            stack.append((i, k))
            stack.append((k, j))
    return [p for p, kp in zip(pts, keep) if kp]


def cincin(ring, luar):
    pts = [(p[0], p[1]) for p in ring]
    s = dp(tipis(pts, tol * 0.5), tol)
    if len(s) < 4:                       # terlalu kecil: pakai cuplikan kasar
        step = max(1, len(pts) // 6)
        s = pts[::step]
        if s[-1] != pts[-1]:
            s.append(pts[-1])
        if len(s) < 4:
            s = pts
    if len(s) < 4:
        return None
    a = luas(s)
    if (luar and a > 0) or ((not luar) and a < 0):
        s = s[::-1]
    return [[round(x, DES), round(y, DES)] for x, y in s]


def poligon(poly):
    """Hanya cincin LUAR. Lubang (enclave kota di dalam kabupaten) dibuang:
    simplifikasi cincin yang berbagi batas yang sama menghasilkan garis ganda
    dan celah. Sebagai gantinya, wilayah kecil digambar DI ATAS wilayah besar
    (fitur diurutkan dari yang terluas ke yang tersempit)."""
    out = []
    for i, ring in enumerate(poly[:1]):
        c = cincin(ring, i == 0)
        if c is None:
            if i == 0:
                return None
            continue                      # lubang terlalu kecil: abaikan
        out.append(c)
    return out


try:
    r = shapefile.Reader(src, encoding="utf-8")
except UnicodeDecodeError:
    r = shapefile.Reader(src, encoding="latin-1")

t0 = time.time()
grup = collections.OrderedDict()          # (prov, nama) -> {kode, polys, n}
tanpa_nama, sampah = [], []
titik_awal = 0
n_poli = n_buang = 0

for i, sr in enumerate(r.iterShapeRecords()):
    if i % 25 == 0:
        print(f"  memproses fitur {i}/{len(r)} ... {time.time()-t0:.0f} detik",
              flush=True)
    rec = sr.record.as_dict()
    nama = (rec.get("WADMKK") or "").strip()
    prov = (rec.get("WADMPR") or "").strip()
    kode = (rec.get("KDPKAB") or "").strip()
    geo = sr.shape.__geo_interface__
    if geo.get("type") not in ("Polygon", "MultiPolygon"):
        continue
    titik_awal += len(sr.shape.points)
    if not nama:
        b = sr.shape.bbox
        tanpa_nama.append((i, prov, len(sr.shape.points),
                           round(b[0], 3), round(b[1], 3),
                           round(b[2] - b[0], 3), round(b[3] - b[1], 3)))
        continue
    if "/" in nama or nama in NAMA_SAMPAH:
        sampah.append((nama, prov))
        continue
    polys = [geo["coordinates"]] if geo["type"] == "Polygon" \
        else geo["coordinates"]
    g = grup.setdefault((prov, nama), {"kode": kode, "polys": [], "n": 0,
                                       "best_a": -1.0, "best": None})
    g["n"] += 1
    if not g["kode"]:
        g["kode"] = kode
    for p in polys:
        n_poli += 1
        a = abs(luas(p[0]))
        if a >= MIN_LUAS:
            q = poligon(p)
            if q:
                g["polys"].append(q)
        else:
            n_buang += 1
            if a > g["best_a"]:               # simpan pulau kecil terbesar
                g["best_a"], g["best"] = a, p

fitur, titik_akhir = [], 0
for (prov, nama), g in grup.items():
    if not g["polys"] and g["best"] is not None:
        q = poligon(g["best"])            # wilayah hanya berisi pulau kecil
        if q:
            g["polys"].append(q)
    if not g["polys"]:
        continue
    if len(g["polys"]) == 1:
        geom = {"type": "Polygon", "coordinates": g["polys"][0]}
    else:
        geom = {"type": "MultiPolygon", "coordinates": g["polys"]}
    titik_akhir += sum(len(rg) for p in g["polys"] for rg in p)
    fitur.append({"type": "Feature",
                  "properties": {"kode": g["kode"], "nama": nama, "prov": prov,
                                 "kota": nama.startswith("Kota")},
                  "geometry": geom})

def luas_fitur(f):
    g = f["geometry"]
    ps = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    return sum(abs(luas(p[0])) for p in ps)


fitur.sort(key=luas_fitur, reverse=True)      # terluas dulu, tersempit terakhir
dst.write_text(json.dumps({"type": "FeatureCollection", "features": fitur},
                          ensure_ascii=False, separators=(",", ":")),
               encoding="utf-8")

proc = Path("data/processed")
proc.mkdir(parents=True, exist_ok=True)
with open(proc / "tanpa_nama.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["indeks", "prov", "titik", "x_min", "y_min", "lebar", "tinggi"])
    w.writerows(tanpa_nama)

print(f"\nSelesai dalam {time.time()-t0:.0f} detik")
print(f"Fitur di shapefile        : {len(r)}")
print(f"Dibuang (tanpa nama)      : {len(tanpa_nama)}  -> data/processed/tanpa_nama.csv")
print(f"Dibuang (sampah)          : {len(sampah)}  {sampah}")
gabung = [(k, v['n']) for k, v in grup.items() if v['n'] > 1]
print(f"Digabung (nama kembar)    : {gabung}")
cnt = collections.Counter(k[1] for k in grup)
lintas = [n for n, c in cnt.items() if c > 1]
print(f"Nama sama beda provinsi   : "
      f"{[(n, [k[0] for k in grup if k[1] == n]) for n in lintas]}")
print(f"\nFitur akhir               : {len(fitur)}")
print(f"Provinsi                  : {len({f['properties']['prov'] for f in fitur})}")
print(f"Poligon (pulau/potongan)  : {n_poli} -> {n_poli - n_buang} dipertahankan "
      f"({n_buang} pulau kecil dibuang)")
terberat = sorted(fitur, key=lambda f: -len(json.dumps(f["geometry"])))[:6]
print("Fitur terbesar di file    :",
      [(f["properties"]["nama"], len(json.dumps(f["geometry"])) // 1024)
       for f in terberat], "(KB)")
print(f"Titik: {titik_awal} -> {titik_akhir}  |  Ukuran: "
      f"{dst.stat().st_size/1024:.0f} KB  (toleransi {tol} derajat)")