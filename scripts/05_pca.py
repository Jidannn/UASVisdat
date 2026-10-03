"""
05_pca.py
Analisis multivariat 38 provinsi untuk Bab 2 (PCA + klaster + pencilan).

Masukan  : docs/data/provinsi.json            (hasil 04_gabung_data.py)
Keluaran : docs/data/provinsi_pca.json        (dibaca langsung oleh D3)

Metode (semua dapat dijelaskan di makalah):
  - 8 variabel: P0, P1, log10(jumlah miskin), UHH, HLS, RLS, pengeluaran, IPM.
    Jumlah miskin di-log karena sangat menceng (dipengaruhi jumlah penduduk).
  - Standardisasi z-score, lalu PCA dari matriks korelasi (eigen-dekomposisi).
  - Tanda PC1 diatur agar IPM berbobot positif (PC1 tinggi = pembangunan baik).
  - Klaster: Ward pada skor dua komponen utama pertama (PC1-PC2), k = 3; label diurutkan dari IPM
    rata-rata tertinggi. Dipilih dari enam alternatif karena paling mantap (lihat 08_uji_kepekaan_pca.py:
    ARI antar-susunan-variabel dan bootstrap). Pengelompokan pada skor-z delapan dimensi dengan k = 4
    ternyata sensitif terhadap pilihan variabel.
  - Pencilan: jarak Mahalanobis pada bidang PC1-PC2 > 2,45
    (batas khi-kuadrat 95% untuk 2 derajat kebebasan).
  - Urutan baris/kolom heatmap diambil dari dendrogram (heatmap terklaster).

Pemakaian (dari folder proyek):  python scripts/05_pca.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import fcluster, leaves_list, linkage
from scipy.spatial.distance import pdist

SRC = Path("docs/data/provinsi.json")
OUT = Path("docs/data/provinsi_pca.json")
K_KLASTER = 3
RUANG_KLASTER = "PC1-PC2"
BATAS_PENCILAN = 2.45

VARS = [("p0", "Penduduk miskin (%)", False),
        ("p1", "Kedalaman kemiskinan (P1)", False),
        ("jml", "Jumlah penduduk miskin (log10 ribu jiwa)", True),
        ("uhh", "Umur harapan hidup (tahun)", False),
        ("hls", "Harapan lama sekolah (tahun)", False),
        ("rls", "Rata-rata lama sekolah (tahun)", False),
        ("pengeluaran", "Pengeluaran per kapita (ribu Rp)", False),
        ("ipm", "IPM", False)]
kode = [v[0] for v in VARS]

rows = json.loads(SRC.read_text(encoding="utf-8"))
bad = [r["provinsi"] for r in rows if any(r.get(k) is None for k in kode)]
if bad:
    sys.exit(f"Data tidak lengkap untuk: {bad}. Perbaiki dulu di 04_gabung_data.py")

X = np.array([[np.log10(r[k]) if lg else r[k] for k, _, lg in VARS]
              for r in rows], dtype=float)
sd = X.std(axis=0)
if (sd == 0).any():
    sys.exit(f"Variabel tanpa variasi: {[kode[i] for i in np.where(sd == 0)[0]]}")
Z = (X - X.mean(axis=0)) / sd

# ---- PCA (matriks korelasi) ----
R = np.corrcoef(Z, rowvar=False)
lam, vec = np.linalg.eigh(R)
o = np.argsort(lam)[::-1]
lam, vec = lam[o], vec[:, o]
i_ipm = kode.index("ipm")
for j in range(vec.shape[1]):
    ref = i_ipm if j == 0 else int(np.argmax(np.abs(vec[:, j])))
    if vec[ref, j] < 0:
        vec[:, j] = -vec[:, j]
S = Z @ vec                                   # skor
kor = vec * np.sqrt(lam)                      # korelasi variabel-komponen

var_pct = lam / lam.sum() * 100
print("Varians dijelaskan (%):", [round(float(v), 1) for v in var_pct[:4]],
      "| kumulatif 2 PC:", round(float(var_pct[:2].sum()), 1),
      "| 3 PC:", round(float(var_pct[:3].sum()), 1))
print("\nKorelasi variabel dengan PC1, PC2, PC3:")
for k, (c, lab, _) in zip(kode, VARS):
    print(f"  {c:12s} {kor[kode.index(k), 0]:+.2f} {kor[kode.index(k), 1]:+.2f} "
          f"{kor[kode.index(k), 2]:+.2f}")

# ---- pencilan ----
m = np.sqrt((S[:, 0] ** 2) / lam[0] + (S[:, 1] ** 2) / lam[1])
pencilan = m > BATAS_PENCILAN

# ---- klaster ----
L = linkage(S[:, :2], method="ward")          # klaster pada ruang komponen utama (lebih mantap)
lab = fcluster(L, K_KLASTER, criterion="maxclust")
ipm_rata = {c: np.mean([r["ipm"] for r, l in zip(rows, lab) if l == c])
            for c in set(lab)}
urut = {c: i for i, c in enumerate(sorted(ipm_rata, key=ipm_rata.get,
                                          reverse=True))}
klaster = np.array([urut[l] for l in lab])
urutan_baris = [rows[i]["pk"] for i in leaves_list(L)]
Lk = linkage(pdist(Z.T, metric="correlation"), method="average")
urutan_kolom = [kode[i] for i in leaves_list(Lk)]

ringkas = []
print("\nKlaster (0 = IPM rata-rata tertinggi):")
for c in range(K_KLASTER):
    idx = [i for i in range(len(rows)) if klaster[i] == c]
    rata = {k: round(float(np.mean([rows[i][k] for i in idx])), 2) for k in kode}
    ringkas.append({"id": c, "n": len(idx), "rata": rata,
                    "anggota": [rows[i]["provinsi"] for i in idx]})
    print(f"  K{c} (n={len(idx)}) IPM={rata['ipm']} P0={rata['p0']}: "
          f"{', '.join(rows[i]['provinsi'] for i in idx)}")
print("\nPencilan (Mahalanobis PC1-PC2 > %.2f):" % BATAS_PENCILAN,
      [(rows[i]["provinsi"], round(float(m[i]), 2))
       for i in range(len(rows)) if pencilan[i]])

# ---- ekspor ----
prov = []
for i, r in enumerate(rows):
    prov.append({**r,
                 "z": {k: round(float(Z[i, j]), 3) for j, k in enumerate(kode)},
                 "pc1": round(float(S[i, 0]), 3), "pc2": round(float(S[i, 1]), 3),
                 "pc3": round(float(S[i, 2]), 3),
                 "klaster": int(klaster[i]), "pencilan": bool(pencilan[i]),
                 "mahalanobis": round(float(m[i]), 2)})
out = {
    "variabel": [{"kode": c, "label": lab_, "log": lg} for c, lab_, lg in VARS],
    "pca": {"nilai_eigen": [round(float(v), 4) for v in lam],
            "varians_pct": [round(float(v), 2) for v in var_pct],
            "korelasi": {k: [round(float(kor[j, c]), 3) for c in range(3)]
                         for j, k in enumerate(kode)}},
    "urutan_baris": urutan_baris, "urutan_kolom": urutan_kolom,
    "klaster": ringkas, "provinsi": prov,
    "metode_klaster": {"metode": "Ward", "ruang": RUANG_KLASTER, "k": K_KLASTER},
}
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nTersimpan: {OUT} ({OUT.stat().st_size/1024:.0f} KB)")