"""
04_gabung_data.py
Menggabungkan data BPS ke peta kab/kota dan menyiapkan tabel provinsi.

Masukan  : data/processed/kabkota.geojson     (hasil 03b_pascaproses.py)
           data/raw/bps/*.csv, ipm_provinsi_2025.xlsx
Keluaran : docs/data/kabkota_miskin.geojson   (peta + P0, P1, jumlah miskin)
           docs/data/provinsi.json            (tabel 38 provinsi untuk PCA)

Aturan penggabungan:
  - CSV BPS: baris HURUF BESAR = provinsi, baris di bawahnya = kab/kota.
  - Kunci utama = (provinsi, nama) setelah dinormalisasi.
  - Cadangan   = nama saja, hanya jika nama itu unik di CSV
                 (contoh: 'Sorong' yang tercatat di dua provinsi pada peta).
  - Fitur peta yang cocok dengan baris CSV yang sama digabung menjadi satu.

Pemakaian (dari folder proyek):  python scripts/04_gabung_data.py
"""
import csv
import json
import re
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

RAW = Path("data/raw/bps")
CSV = {"p0": RAW / "Persentase_Penduduk_Miskin_2025.csv",
       "p1": RAW / "Indeks_Kedalaman_Kemiskinan_2025.csv",
       "jml": RAW / "Jumlah_Penduduk_Miskin_2025.csv"}
IPM = RAW / "ipm_provinsi_2025.xlsx"
GEO_IN = Path("data/processed/kabkota.geojson")
GEO_OUT = Path("docs/data/kabkota_miskin.geojson")
PROV_OUT = Path("docs/data/provinsi.json")


# ---------- normalisasi nama ----------
def norm(s):
    s = s.lower().replace(".", "")
    return re.sub(r"\s+", " ", s).strip()


ALIAS_PROV = {"daerah istimewa yogyakarta": "di yogyakarta",
              "d i yogyakarta": "di yogyakarta",
              "kep bangka belitung": "kepulauan bangka belitung",
              "kep riau": "kepulauan riau"}
ALIAS_KAB = {"maluku tenggara barat": "kepulauan tanimbar",   # ganti nama 2020
             "mamuju utara": "pasangkayu",                    # ganti nama 2022
             "toba samosir": "toba", "tobasa": "toba",        # ganti nama 2020
             "adm kep seribu": "kepulauan seribu",
             "administrasi kepulauan seribu": "kepulauan seribu",
             "kep siau tagulandang biaro": "siau tagulandang biaro",
             "kepulauan siau tagulandang biaro": "siau tagulandang biaro"}


def key_prov(s):
    n = norm(s)
    return ALIAS_PROV.get(n, n)


def key_kab(s):
    n = norm(s)
    n = re.sub(r"^kabupaten ", "", n)
    n = re.sub(r"^kota (adm|administrasi) ", "kota ", n)
    return ALIAS_KAB.get(n, n)


# ---------- baca CSV BPS ----------
def baca_csv(path):
    kab, prov, nama_prov, ditolak = {}, {}, {}, []
    cur = None
    dobel = []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.reader(fh):
            if len(row) < 2:
                continue
            nama, v = row[0].strip(), row[1].strip().replace(",", ".")
            if not nama or re.fullmatch(r"[\d.]+", nama):
                continue                          # baris header / '0,2025'
            try:
                val = float(v)
            except ValueError:
                if v and nama != "Province/Regency/City":
                    ditolak.append((nama, row[1]))
                continue
            if nama.isupper():                    # provinsi (atau INDONESIA)
                cur = key_prov(nama)
                prov[cur], nama_prov[cur] = val, nama
                continue
            if cur is None:
                continue
            k = (cur, key_kab(nama))
            if k in kab:
                dobel.append(k)
            kab[k] = val
    prov.pop("indonesia", None)
    return kab, prov, nama_prov, ditolak, dobel


data, provdata = {}, {}
for nama, p in CSV.items():
    kab, prov, nprov, ditolak, dobel = baca_csv(p)
    data[nama], provdata[nama] = kab, prov
    print(f"[{nama}] kab/kota: {len(kab)} | provinsi: {len(prov)} | "
          f"baris bernilai bukan angka: {len(ditolak)} | kunci ganda: {len(dobel)}")
    if ditolak:
        print("    contoh bukan angka:", ditolak[:5])

semua = set().union(*[set(d) for d in data.values()])
for nama, d in data.items():
    h = sorted(semua - set(d))
    if h:
        print(f"  ! kab/kota yang tidak ada di [{nama}]: {h[:8]}")

# ---------- indeks pencarian ----------
def padat(x):
    """Buang spasi/tanda baca: 'Muko Muko' == 'Mukomuko', 'Toli-Toli' == 'Tolitoli'."""
    return re.sub(r"[^a-z0-9]", "", x)


idx_padat = {(k[0], padat(k[1])): k for k in semua}
nama_cnt = Counter(k[1] for k in semua)
idx_nama = {k[1]: k for k in semua if nama_cnt[k[1]] == 1}

# ---------- gabung ke peta (4 tahap, dari paling ketat) ----------
geo = json.loads(GEO_IN.read_text(encoding="utf-8"))
feats = geo["features"]
cocok, metode = {}, defaultdict(list)

for n, f in enumerate(feats):                     # 1. persis / ejaan padat
    p = f["properties"]
    kp, kk = key_prov(p["prov"]), key_kab(p["nama"])
    if (kp, kk) in semua:
        cocok[n] = (kp, kk)
    elif (kp, padat(kk)) in idx_padat:
        cocok[n] = idx_padat[(kp, padat(kk))]
        metode["ejaan"].append((p["nama"], cocok[n][1]))

terpakai = set(cocok.values())
for n, f in enumerate(feats):                     # 2. mirip, dalam provinsi sama
    if n in cocok:
        continue
    p = f["properties"]
    kp, kk = key_prov(p["prov"]), padat(key_kab(p["nama"]))
    cand = [k for k in semua if k[0] == kp and k not in terpakai]
    if cand:
        best = max(cand, key=lambda k: SequenceMatcher(None, kk, padat(k[1])).ratio())
        if SequenceMatcher(None, kk, padat(best[1])).ratio() >= 0.8:
            cocok[n] = best
            terpakai.add(best)
            metode["mirip"].append((p["nama"], best[1]))

for n, f in enumerate(feats):                     # 3. nama saja (hanya jika unik)
    if n in cocok:
        continue
    p = f["properties"]
    alt = idx_nama.get(key_kab(p["nama"]))
    if alt:
        cocok[n] = alt
        metode["nama saja"].append((p["nama"], p["prov"], "->", alt[0]))

grup, tanpa_data = defaultdict(list), []
for n, f in enumerate(feats):
    if n in cocok:
        grup[cocok[n]].append(f)
    else:                                         # 4. tidak ketemu
        p = f["properties"]
        tanpa_data.append((p["nama"], p["prov"]))
        grup[("-", n, p["nama"])].append(f)
terpakai = set(cocok.values())

fitur = []
for k, lst in grup.items():
    if len(lst) == 1:
        f = lst[0]
    else:                                      # gabungkan potongan
        lst = sorted(lst, key=lambda z: z["properties"]["prov"] != k[0])
        polys = []
        for z in lst:
            g = z["geometry"]
            polys += [g["coordinates"]] if g["type"] == "Polygon" \
                else g["coordinates"]
        f = {"type": "Feature", "properties": dict(lst[0]["properties"]),
             "geometry": {"type": "MultiPolygon", "coordinates": polys}}
        print("  Digabung:", [(z["properties"]["nama"], z["properties"]["prov"])
                              for z in lst])
    p = f["properties"]
    p["pk"] = k[0] if k[0] != "-" else key_prov(p["prov"])   # kunci provinsi
    p["p0"] = data["p0"].get(k)
    p["p1"] = data["p1"].get(k)
    p["jml"] = data["jml"].get(k)             # ribu jiwa
    fitur.append(f)

geo["features"] = fitur
GEO_OUT.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

belum_ada = sorted(semua - terpakai)
print(f"\nFitur peta akhir          : {len(fitur)}")
for nm, daftar in metode.items():
    print(f"Cocok via {nm:10s} ({len(daftar)}): {daftar}")
print(f"Peta tanpa data CSV ({len(tanpa_data)}): {tanpa_data}")
print(f"Baris CSV tanpa peta ({len(belum_ada)}): {belum_ada}")
kosong = [f["properties"]["nama"] for f in fitur
          if f["properties"]["p0"] is None]
print(f"Fitur dengan P0 kosong    : {len(kosong)} {kosong[:10]}")

# ---------- tabel provinsi ----------
ipm = pd.read_excel(IPM)
ipm["_k"] = ipm["Provinsi"].map(key_prov)
ipm = ipm[ipm["_k"] != "indonesia"]
baris = []
for _, r in ipm.iterrows():
    k = r["_k"]
    p0, p1 = provdata["p0"].get(k), provdata["p1"].get(k)
    jml = provdata["jml"].get(k)
    baris.append({
        "provinsi": r["Provinsi"], "pk": k, "p0": p0, "p1": p1, "jml": jml,
        "penduduk": round(jml * 100 / p0, 1) if p0 and jml else None,
        "uhh": float(r["UHH (tahun)"]), "hls": float(r["HLS (tahun)"]),
        "rls": float(r["RLS (tahun)"]),
        "pengeluaran": int(r["Pengeluaran (ribu rupiah)"]),
        "ipm": float(r["IPM"]), "pertumbuhan": float(r["Pertumbuhan (%)"]),
    })
PROV_OUT.write_text(json.dumps(baris, ensure_ascii=False, indent=1),
                    encoding="utf-8")
lengkap = sum(all(v is not None for v in b.values()) for b in baris)
print(f"\nProvinsi: {len(baris)} | lengkap semua variabel: {lengkap}")
for b in baris:
    if any(v is None for v in b.values()):
        print("  ! tidak lengkap:", b["provinsi"], b)
print(f"\nTersimpan: {GEO_OUT} ({GEO_OUT.stat().st_size/1024:.0f} KB), {PROV_OUT}")