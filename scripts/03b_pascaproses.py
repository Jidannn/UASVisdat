"""
03b_pascaproses.py
Tahap kedua setelah mapshaper. Mapshaper sudah menyederhanakan bentuk DENGAN
menjaga batas bersama antar wilayah (topologi), jadi tidak ada garis ganda.
Skrip ini melakukan sisanya:

  1. Potongan bernama sama digabung menjadi satu MultiPolygon.
  2. Pulau kecil (< argumen ke-3, derajat persegi) dibuang; setiap wilayah
     tetap menyimpan pulau terbesarnya.
  3. Lubang dibuang; fitur diurutkan dari terluas ke tersempit (kota enclave
     tergambar di atas kabupaten).
  4. Arah cincin luar dibuat searah jarum jam (aturan D3).
  5. Properti diganti nama: kode, nama, prov, kota.

TIDAK menyederhanakan lagi (itu tugas mapshaper).

Pemakaian (dari folder proyek):
  python scripts/03b_pascaproses.py data/processed/kabkota_mapshaper.geojson docs/data/kabkota.geojson 0.001
"""
import collections
import json
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
MIN_LUAS = float(sys.argv[3]) if len(sys.argv) > 3 else 0.001
DES = 4
dst.parent.mkdir(parents=True, exist_ok=True)


def luas(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
               for i in range(len(r) - 1)) / 2


def luar_cw(ring):
    r = ring if luas(ring) <= 0 else ring[::-1]       # luas <= 0 = searah jarum jam
    return [[round(x, DES), round(y, DES)] for x, y in r]


d = json.loads(src.read_text(encoding="utf-8"))
grup = collections.OrderedDict()
n_poli = n_buang = n_titik = 0

for f in d["features"]:
    g, p = f.get("geometry"), f["properties"]
    nama = (p.get("WADMKK") or "").strip()
    if not g or not nama:
        continue
    prov = (p.get("WADMPR") or "").strip()
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    e = grup.setdefault((prov, nama), {"kode": (p.get("KDPKAB") or "").strip(),
                                       "besar": [], "kecil": None, "ka": -1.0})
    if not e["kode"]:
        e["kode"] = (p.get("KDPKAB") or "").strip()
    for poly in polys:
        n_poli += 1
        ring = poly[0]                                  # lubang diabaikan
        n_titik += len(ring)
        a = abs(luas(ring))
        if a >= MIN_LUAS:
            e["besar"].append((a, ring))
        else:
            n_buang += 1
            if a > e["ka"]:
                e["ka"], e["kecil"] = a, ring

fitur = []
for (prov, nama), e in grup.items():
    rings = [r for _, r in e["besar"]]
    if not rings and e["kecil"] is not None:
        rings = [e["kecil"]]                            # wilayah hanya pulau kecil
    if not rings:
        continue
    cw = [[luar_cw(r)] for r in rings]
    geom = ({"type": "Polygon", "coordinates": cw[0]} if len(cw) == 1
            else {"type": "MultiPolygon", "coordinates": cw})
    total = sum(a for a, _ in e["besar"]) or e["ka"]
    fitur.append((total, {"type": "Feature",
                          "properties": {"kode": e["kode"], "nama": nama,
                                         "prov": prov,
                                         "kota": nama.startswith("Kota")},
                          "geometry": geom}))
fitur.sort(key=lambda t: -t[0])
fitur = [f for _, f in fitur]

dst.write_text(json.dumps({"type": "FeatureCollection", "features": fitur},
                          ensure_ascii=False, separators=(",", ":")),
               encoding="utf-8")
gabung = [(k, len(v["besar"])) for k, v in grup.items() if len(v["besar"]) > 1]
print(f"Fitur masuk: {len(d['features'])} | fitur akhir: {len(fitur)} | "
      f"provinsi: {len({f['properties']['prov'] for f in fitur})}")
print(f"Poligon: {n_poli} -> {n_poli - n_buang} dipertahankan "
      f"({n_buang} pulau kecil dibuang)")
print(f"Wilayah dengan beberapa potongan besar: {len(gabung)}")
print(f"Ukuran: {dst.stat().st_size/1024:.0f} KB -> {dst}")