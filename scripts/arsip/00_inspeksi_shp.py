"""
00_inspeksi_shp.py  -- hanya MEMBACA, tidak mengubah apa pun.
Menampilkan isi shapefile supaya skrip konversi bisa ditulis dengan tepat.

Pemasangan : pip install pyshp
Pemakaian  : python scripts/00_inspeksi_shp.py data/raw/geo/LapakGIS_Batas_Kabupaten_2024.shp
"""
import sys
from pathlib import Path

import shapefile  # pyshp

shp = Path(sys.argv[1])
try:
    r = shapefile.Reader(str(shp), encoding="utf-8")
except UnicodeDecodeError:
    r = shapefile.Reader(str(shp), encoding="latin-1")

print("Jumlah fitur :", len(r))
print("Tipe geometri:", r.shapeTypeName)
print("Bounding box :", [round(v, 3) for v in r.bbox])

print("\nKolom atribut:")
for f in r.fields[1:]:
    print("  -", f[0])

print("\n3 baris pertama:")
for rec in r.records()[:3]:
    print(" ", rec.as_dict())

kosong = [i for i, s in enumerate(r.shapes()) if s.shapeType == shapefile.NULL]
print("\nFitur tanpa geometri:", len(kosong))

prj = shp.with_suffix(".prj")
if prj.exists():
    print("\nSistem koordinat (.prj):")
    print(prj.read_text(errors="ignore")[:300])