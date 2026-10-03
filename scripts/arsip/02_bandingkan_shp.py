"""
02_bandingkan_shp.py  -- hanya MEMBACA.
Membandingkan shapefile (533 fitur) dengan JSON lama (514 kab/kota sah)
untuk memahami fitur berkolom kosong dan 7 wilayah yang hilang.

Pemakaian (dari folder proyek):
  python scripts/02_bandingkan_shp.py ^
     data/raw/geo/LapakGIS_Batas_Kabupaten_2024.shp ^
     data/raw/geo/38_Provinsi_Indonesia_Kabupaten.json
"""
import collections
import json
import sys
from pathlib import Path

import shapefile  # pyshp

shp_path, json_path = sys.argv[1], sys.argv[2]
try:
    r = shapefile.Reader(shp_path, encoding="utf-8")
except UnicodeDecodeError:
    r = shapefile.Reader(shp_path, encoding="latin-1")

recs = [x.as_dict() for x in r.records()]
shapes = r.shapes()

kosong = [i for i, x in enumerate(recs) if not x["WADMKK"].strip()]
print(f"Total fitur: {len(recs)} | WADMKK kosong: {len(kosong)}")

print("\nFitur WADMKK kosong (indeks, provinsi, jumlah titik, lebar x tinggi derajat):")
for i in kosong[:25]:
    b = shapes[i].bbox
    print(f"  {i:3d} | {recs[i]['WADMPR'] or '-':22s} | "
          f"{len(shapes[i].points):6d} titik | "
          f"{b[2]-b[0]:.3f} x {b[3]-b[1]:.3f}")
if len(kosong) > 25:
    print("  ... dan", len(kosong) - 25, "lainnya")

isi = [x for x in recs if x["WADMKK"].strip()]
nama = collections.Counter(x["WADMKK"].strip() for x in isi)
ganda = [k for k, v in nama.items() if v > 1]
print(f"\nBernama: {len(isi)} | nama unik: {len(nama)} | nama ganda: {ganda}")
print("Provinsi unik di shapefile:",
      len({x['WADMPR'] for x in isi if x['WADMPR']}))

# bandingkan dengan JSON lama
d = json.loads(Path(json_path).read_text(encoding="utf-8"))
lama = set()
for f in d["features"]:
    p = f["properties"]
    n = p.get("WADMKK")
    if p.get("KDPKAB") and n and "/" not in n and n != "Pahuwato":
        lama.add(n.strip())
baru = set(nama)

print(f"\nDi shapefile TAPI tidak di JSON lama ({len(baru - lama)}):")
print(" ", sorted(baru - lama))
print(f"Di JSON lama TAPI tidak di shapefile ({len(lama - baru)}):")
print(" ", sorted(lama - baru))

tujuh = ["Kota Padang Panjang", "Kota Sibolga", "Administrasi Kepulauan Seribu",
         "Kota Tebing Tinggi", "Kota Bukittinggi", "Kota Mojokerto",
         "Kota Magelang"]
print("\n7 wilayah yang tadi tanpa poligon -> ada di shapefile?")
for t in tujuh:
    print(f"  {t:35s}", "ADA" if t in baru else "tidak ada")