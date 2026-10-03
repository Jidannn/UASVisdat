"""
06_siapkan_migrasi.py
Menyiapkan data Bab 3 (chord + matriks OD) dengan DUA periode:
  risen        : 5 tahun terakhir (tempat tinggal 5 tahun lalu -> sekarang)
  seumur_hidup : provinsi lahir -> tempat tinggal sekarang
Kemiskinan provinsi untuk Bab 3 = Maret 2020 (sezaman dengan SP2020, sudah 34 provinsi).
Kemiskinan 2025 dipetakan dari 38 ke 34 provinsi hanya untuk pemeriksaan kestabilan peringkat.

Masukan  : data/processed/od_matrix_<label>.csv, provinsi_migrasi_<label>.csv
           (hasil build_flow.py; periode seumur_hidup bersifat opsional)
           docs/data/provinsi.json (hasil 04_gabung_data.py)
           data/raw/bps/P0_Provinsi_2015_2020_2025.xlsx (BPS: P0 menurut provinsi, Maret)
Keluaran : docs/data/migrasi.json

Pemetaan 38 -> 34 (kode migrasi memakai kode LAMA):
  Papua, Papua Selatan, Papua Tengah, Papua Pegunungan -> PAPUA (94)
  Papua Barat, Papua Barat Daya                         -> PAPUA BARAT (91)
Persentase miskin provinsi gabungan dihitung ULANG dari jumlah miskin dan
perkiraan penduduk (tidak dirata-ratakan); IPM dibobot penduduk.

Pemakaian (dari folder proyek):  python scripts/06_siapkan_migrasi.py
"""
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROC = Path("data/processed")
PROV = Path("docs/data/provinsi.json")
OUT = Path("docs/data/migrasi.json")
P0_SERI = Path("data/raw/bps/P0_Provinsi_2015_2020_2025.xlsx")
TAHUN_P0 = 2020                      # tahun kemiskinan yang dipakai Bab 3
ALIAS_PROV = {"kep bangka belitung": "kepulauan bangka belitung", "kep riau": "kepulauan riau",
              "d i yogyakarta": "di yogyakarta", "daerah istimewa yogyakarta": "di yogyakarta"}

PERIODE = {
    "risen": {"label": "5 tahun terakhir",
              "keterangan": "Migrasi risen: provinsi tempat tinggal 5 tahun sebelum SP2020 dibandingkan dengan tempat tinggal saat ini. Pindah di dalam provinsi yang sama tidak ditampilkan."},
    "seumur_hidup": {"label": "Seumur hidup",
                     "keterangan": "Migrasi seumur hidup: provinsi tempat lahir dibandingkan dengan tempat tinggal saat ini (SP2020). Orang yang tinggal di provinsi kelahirannya tidak ditampilkan."},
}
PAPUA_94 = {"papua", "papua selatan", "papua tengah", "papua pegunungan"}
PAPUA_91 = {"papua barat", "papua barat daya"}
URUT_PULAU = ["Sumatera", "Jawa", "Bali & Nusa Tenggara", "Kalimantan", "Sulawesi", "Maluku", "Papua"]


def norm(s):
    return re.sub(r"\s+", " ", s.lower().replace(".", "")).strip()


def norm_prov(s):
    n = norm(s)
    return ALIAS_PROV.get(n, n)


def angka(v):
    """Angka dari sel Excel/CSV: menerima float, teks berkoma desimal, dan sel kosong."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float, np.integer, np.floating)):
        return float(v)
    t = str(v).strip().replace("\u00a0", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def baca_seri(path):
    """Membaca tabel BPS (judul berlapis): baris tahun dicari otomatis. Hasil: {tahun: {nama_norm: nilai}}."""
    if not path.exists():
        sys.exit(f"Berkas {path} tidak ditemukan. Unduh tabel P0 menurut provinsi dari BPS (Maret 2015, 2020, 2025).")
    raw = (pd.read_excel(path, header=None) if path.suffix.lower() in (".xlsx", ".xls")
           else pd.read_csv(path, header=None, sep=None, engine="python", dtype=str))
    kol, baris_tahun = {}, None
    for i in range(min(12, len(raw))):
        c = {}
        for j in range(1, raw.shape[1]):
            v = angka(raw.iat[i, j])
            if v is not None and 1990 <= v <= 2035 and float(v).is_integer():
                c[j] = int(v)
        if len(c) >= 2:
            kol, baris_tahun = c, i
            break
    if baris_tahun is None:
        sys.exit("Baris tahun (2015, 2020, 2025) tidak ditemukan di " + path.name)
    seri = {y: {} for y in kol.values()}
    for i in range(baris_tahun + 1, len(raw)):
        nama = raw.iat[i, 0]
        if not isinstance(nama, str) or not nama.strip():
            continue
        for j, y in kol.items():
            v = angka(raw.iat[i, j])
            if v is not None:
                seri[y][norm_prov(nama)] = v
    return seri


def pulau(kode):
    if kode == "21" or kode.startswith("1"):
        return "Sumatera"
    return {"3": "Jawa", "5": "Bali & Nusa Tenggara", "6": "Kalimantan",
            "7": "Sulawesi", "8": "Maluku", "9": "Papua"}[kode[0]]


def muat(label):
    od_p, nd_p = PROC / f"od_matrix_{label}.csv", PROC / f"provinsi_migrasi_{label}.csv"
    if not od_p.exists() and label == "risen" and (PROC / "od_matrix.csv").exists():
        od_p, nd_p = PROC / "od_matrix.csv", PROC / "provinsi_migrasi.csv"   # nama lama
    if not od_p.exists():
        return None
    od = pd.read_csv(od_p, index_col=0, dtype={0: str})
    od.index, od.columns = od.index.astype(str), od.columns.astype(str)
    nd = pd.read_csv(nd_p, dtype={"kode": str}).set_index("kode")
    if list(od.index) != list(od.columns):
        sys.exit(f"Baris dan kolom {od_p.name} tidak sama urutannya.")
    return od, nd


data = {lb: muat(lb) for lb in PERIODE}
if data["risen"] is None:
    sys.exit("od_matrix_risen.csv tidak ditemukan. Jalankan build_flow.py untuk 'risen' dulu.")
for lb, v in data.items():
    if v is None:
        print(f"! Periode '{lb}' tidak ditemukan dan dilewati.")
data = {lb: v for lb, v in data.items() if v is not None}
od0, nd0 = data["risen"]
for lb, (od, nd) in data.items():
    if list(od.index) != list(od0.index):
        sys.exit(f"Daftar provinsi periode '{lb}' berbeda dari 'risen'.")

prov = json.loads(PROV.read_text(encoding="utf-8"))
nama_ke_kode = {norm(n): k for k, n in nd0["nama"].items()}
for r in prov:
    k = norm(r["provinsi"])
    r["_lama"] = ("94" if k in PAPUA_94 else "91" if k in PAPUA_91
                  else nama_ke_kode.get(k) or nama_ke_kode.get(k.replace("d i ", "di ")))
tak = [r["provinsi"] for r in prov if r["_lama"] is None]
if tak:
    print("! Provinsi 2025 tanpa padanan kode lama:", tak)

urut = sorted(od0.index, key=lambda k: (URUT_PULAU.index(pulau(k)), k))
simpul = []
for k in urut:
    ps = [r for r in prov if r["_lama"] == k]
    jml = sum(r["jml"] for r in ps if r["jml"] is not None)
    pend = sum(r["penduduk"] for r in ps if r["penduduk"])
    ipm = (sum(r["ipm"] * r["penduduk"] for r in ps) / pend) if pend else None
    nama = nd0.loc[k, "nama"].title().replace("Di ", "DI ").replace("Dki", "DKI")
    s = {"kode": k, "nama": nama, "pulau": pulau(k),
         "gabungan_dari": [r["provinsi"] for r in ps] if len(ps) > 1 else None,
         "p0": round(jml * 100 / pend, 2) if pend else None,
         "ipm": round(ipm, 2) if ipm else None,
         "penduduk_2025_ribu": round(pend, 1) if pend else None}
    pop2020 = None
    if "seumur_hidup" in data:
        pop2020 = float(data["seumur_hidup"][1].loc[k, "total"])
        s["penduduk_2020"] = int(pop2020)
    for lb, (od, nd) in data.items():
        n = nd.loc[k]
        s[lb] = {"masuk": int(n["masuk"]), "keluar": int(n["keluar"]), "neto": int(n["neto"]),
                 "diagonal": int(n["dalam_provinsi"]), "luar_negeri": int(n["dari_luar_negeri"]),
                 "neto_per100": round(float(n["neto"]) / pop2020 * 100, 2) if pop2020 else None}
    simpul.append(s)

# ---------- kemiskinan provinsi: 2020 (dipakai Bab 3) + 2015 + 2025 (pemeriksaan) ----------
seri = baca_seri(P0_SERI)
for y in (2015, TAHUN_P0):
    if y not in seri:
        sys.exit(f"Tahun {y} tidak ada di {P0_SERI.name}. Tahun yang terbaca: {sorted(seri)}")
tak_cocok = []
for sm in simpul:
    kunci = norm_prov(nd0.loc[sm["kode"], "nama"])
    sm["p0_2025"] = sm["p0"]                                   # hasil gabungan 38 -> 34 provinsi
    for y in (2015, TAHUN_P0):
        sm[f"p0_{y}"] = seri[y].get(kunci)
        if sm[f"p0_{y}"] is None:
            tak_cocok.append((sm["nama"], y))
    sm["p0"] = sm[f"p0_{TAHUN_P0}"]
if tak_cocok:
    sys.exit(f"Provinsi tanpa nilai P0 pada tabel BPS: {tak_cocok}. Periksa ejaan nama provinsi di berkas.")


def tertil(nilai):
    q1, q2 = np.quantile(list(nilai.values()), [1 / 3, 2 / 3])
    return {k: (0 if v < q1 else 1 if v < q2 else 2) for k, v in nilai.items()}


def rho(a, b):
    return float(pd.Series(a).rank().corr(pd.Series(b).rank()))


kode_s = [sm["kode"] for sm in simpul]
v15 = {k: sm["p0_2015"] for k, sm in zip(kode_s, simpul)}
v20 = {k: sm["p0_2020"] for k, sm in zip(kode_s, simpul)}
v25 = {k: sm["p0_2025"] for k, sm in zip(kode_s, simpul) if sm["p0_2025"] is not None}
t20, t25 = tertil(v20), tertil(v25)
kestabilan = {
    "rho_2015_2020": round(rho([v15[k] for k in kode_s], [v20[k] for k in kode_s]), 3),
    "rho_2020_2025": round(rho([v20[k] for k in v25], [v25[k] for k in v25]), 3),
    "pindah_kelompok_2020_2025": int(sum(t20[k] != t25[k] for k in v25)),
    "jumlah_provinsi": len(v25),
}

periode = {}
for lb, (od, nd) in data.items():
    m = [[int(od.loc[a, t]) for t in urut] for a in urut]            # [asal][tujuan]
    periode[lb] = {**PERIODE[lb], "matriks": m, "total_arus": int(sum(map(sum, m)))}

OUT.write_text(json.dumps({
    "catatan": ("Sumber: BPS, Sensus Penduduk 2020 Long Form. Baris matriks = provinsi asal, "
                "kolom = provinsi tujuan (tempat tinggal saat ini). Diagonal dikeluarkan. "
                "Kemiskinan = persentase penduduk miskin Maret 2020 (BPS, 34 provinsi). "
                "Angka 2015 dan 2025 hanya untuk pemeriksaan kestabilan peringkat."),
    "tahun_p0": TAHUN_P0, "kestabilan": kestabilan,
    "urutan_periode": list(periode), "periode": periode, "simpul": simpul},
    ensure_ascii=False), encoding="utf-8")

print(f"Simpul: {len(simpul)} | periode: {list(periode)}")
for lb, p in periode.items():
    print(f"  {lb:13s} total arus antarprovinsi: {p['total_arus']:,}".replace(",", "."))
print(f"Kemiskinan Bab 3: Maret {TAHUN_P0}, {sum(sm['p0'] is not None for sm in simpul)} dari {len(simpul)} provinsi terisi")
print("Pemeriksaan kestabilan peringkat provinsi menurut persentase penduduk miskin:")
print(f"  2015 vs 2020: rho = {kestabilan['rho_2015_2020']}")
print(f"  2020 vs 2025: rho = {kestabilan['rho_2020_2025']} | pindah kelompok (tertil): "
      f"{kestabilan['pindah_kelompok_2020_2025']} dari {kestabilan['jumlah_provinsi']} provinsi")
print("Provinsi gabungan (hanya untuk angka 2025):")
for sm in simpul:
    if sm["gabungan_dari"]:
        print(f"  {sm['nama']}: P0 2025={sm['p0_2025']}  dari {sm['gabungan_dari']}")
print(f"Tersimpan: {OUT} ({OUT.stat().st_size/1024:.0f} KB)")