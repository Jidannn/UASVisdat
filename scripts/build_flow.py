"""
build_flow.py
Mengubah JSON "Arus Migrasi Antar Provinsi" (WebAPI BPS / sensus.bps.go.id)
menjadi matriks asal-tujuan 34 x 34 yang siap dipakai D3.

Dua jenis berkas didukung (dikenali otomatis):
  risen        : provinsi tempat tinggal 5 TAHUN LALU -> tempat tinggal sekarang
                 (diagonal = pindah antar kab/kota dalam provinsi yang sama)
  seumur_hidup : provinsi LAHIR -> tempat tinggal sekarang, dirinci menurut
                 jenis kelamin; skrip memakai baris 'Total' jenis kelamin
                 (diagonal = lahir dan tinggal di provinsi yang sama,
                  BUKAN migran; kolom Total = seluruh penduduk provinsi)

Pada keduanya: baris (kode_wilayah) = provinsi TUJUAN / tempat tinggal sekarang,
kolom (kode di kategori) = provinsi ASAL. Keluaran memakai baris = ASAL.

Pemakaian (dari folder proyek):
  python scripts/build_flow.py data/raw/bps/Arus_Migrasi_Risen.json data/processed risen
  python scripts/build_flow.py data/raw/bps/migrasi_seumur_hidup.json data/processed seumur_hidup

Keluaran: od_matrix_<label>.csv, od_long_<label>.csv, provinsi_migrasi_<label>.csv
"""
import json
import sys
from pathlib import Path

import pandas as pd

src, out, label = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
out.mkdir(parents=True, exist_ok=True)

raw = json.loads(src.read_text(encoding="utf-8"))
df = pd.DataFrame(raw["data"])
df["nilai"] = pd.to_numeric(df["nilai"])
df["tujuan"] = df["kode_wilayah"].astype(str)
nama = (df[["kode_wilayah", "nama_wilayah"]].drop_duplicates()
        .set_index("kode_wilayah")["nama_wilayah"].to_dict())

# ---- jenis berkas & dimensi 'asal' ----
ada_jk = df["nama_kategori_1"].str.contains("Jenis Kelamin", na=False).any()
if ada_jk:
    print("Terdeteksi: migrasi SEUMUR HIDUP (ada dimensi jenis kelamin)")
    jk = df["kode_item_kategori_1"].astype(str)
    pv = df.assign(jk=jk).pivot_table(
        index=["tujuan", "kode_item_kategori_2"], columns="jk", values="nilai", aggfunc="sum")
    if {"L", "P", "999"} <= set(pv.columns):
        selisih = (pv["L"].fillna(0) + pv["P"].fillna(0) - pv["999"].fillna(0)).abs()
        print(f"Cek L + P = Total: selisih maks {selisih.max():.0f} orang, "
              f"{int((selisih > 3).sum())} sel selisih > 3 (pembulatan mestinya <= 2)")
    df = df[jk == "999"].copy()                         # pakai baris Total
    kat_n, kat_k, kat_i = "nama_kategori_2", "kode_item_kategori_2", "nama_item__kategori_2"
else:
    print("Terdeteksi: migrasi RISEN")
    kat_n, kat_k, kat_i = "nama_kategori_1", "kode_item_kategori_1", "nama_item__kategori_1"

df["asal"] = df[kat_k].astype(str)
jenis = df[kat_n].fillna("").str.lower()
item = df[kat_i].fillna("").str.lower()
is_total = (df["asal"] == "999") & jenis.str.contains("kewarganegaraan")
is_luar = jenis.str.contains("area kenegaraan") | item.str.contains("luar negeri")
is_prov = jenis.str.contains("wilayah") & ~is_total & ~is_luar
lain = df[~(is_total | is_luar | is_prov)]
if len(lain):
    print("! Kategori tak dikenal (diabaikan):",
          lain[[kat_n, kat_k, kat_i]].drop_duplicates().head(5).values.tolist())

total = df[is_total].groupby("tujuan")["nilai"].sum()
abroad = df[is_luar].groupby("tujuan")["nilai"].sum()
cells = df[is_prov]

prov = sorted(nama.keys())
mat = (cells.pivot_table(index="tujuan", columns="asal", values="nilai", aggfunc="sum")
       .reindex(index=prov, columns=prov))
n_missing = int(mat.isna().sum().sum())
mat = mat.fillna(0)

# ---- pemeriksaan ----
print(f"Provinsi: {len(prov)} | sel kosong (diisi 0): {n_missing} | "
      f"kolom luar negeri: {'ada' if len(abroad) else 'tidak ada'}")
resid = (total.reindex(prov) - mat.sum(axis=1) - abroad.reindex(prov).fillna(0))
print(f"Selisih Total - (jumlah sel + luar negeri): maks {resid.abs().max():.0f}")
besar = resid[resid.abs() > 5]
if len(besar):
    print("  provinsi dengan selisih > 5:", besar.rename(index=nama).round(0).to_dict())

diag = pd.Series({k: mat.loc[k, k] for k in prov})
inter = mat.copy()
for k in prov:
    inter.loc[k, k] = 0
masuk = inter.sum(axis=1)            # baris = tujuan
keluar = inter.sum(axis=0)           # kolom = asal
neto = masuk - keluar
pend = total.reindex(prov)

print("\nMigrasi neto antarprovinsi (masuk - keluar)"
      + (" dan per 100 penduduk:" if ada_jk else
         " (kolom Total pada data risen = jumlah migran, BUKAN penduduk, jadi tanpa angka per 100):"))
tampil = ["DKI JAKARTA", "JAWA TENGAH", "JAWA BARAT", "BANTEN", "KALIMANTAN TIMUR",
          "SUMATERA BARAT", "DI YOGYAKARTA"]
inv = {v: k for k, v in nama.items()}
for t in tampil:
    k = inv.get(t)
    if k:
        per100 = f"  {neto[k] / pend[k] * 100:+6.1f} per 100" if ada_jk else ""
        print(f"  {t:18s} {neto[k]:>12,.0f}{per100}")
print("  5 terendah:", neto.rename(index=nama).sort_values().head(5).round(0).to_dict())
print("  5 tertinggi:", neto.rename(index=nama).sort_values().tail(5).round(0).to_dict())

# ---- ekspor: baris = ASAL, kolom = TUJUAN ----
od = inter.T
od.index.name, od.columns.name = "asal", "tujuan"
od.to_csv(out / f"od_matrix_{label}.csv")
pd.DataFrame({"kode": prov, "nama": [nama[k] for k in prov],
              "masuk": masuk.values, "keluar": keluar.values, "neto": neto.values,
              "dalam_provinsi": diag.values,
              "dari_luar_negeri": abroad.reindex(prov).fillna(0).values,
              "total": pend.values,
              }).to_csv(out / f"provinsi_migrasi_{label}.csv", index=False)
od.reset_index().melt(id_vars="asal", var_name="tujuan", value_name="nilai") \
  .query("nilai > 0").to_csv(out / f"od_long_{label}.csv", index=False)
print(f"\nTersimpan di {out}/ : od_matrix_{label}.csv, od_long_{label}.csv, "
      f"provinsi_migrasi_{label}.csv")