"""
08_uji_kepekaan_pca.py
Uji kepekaan analisis Bab 2. Menjawab dua pertanyaan penguji:
  1. Apakah hasil bertahan jika variabel yang tumpang tindih dibuang?
     (IPM disusun dari UHH, HLS, RLS, dan pengeluaran; P0 dan P1 hampir kembar.)
  2. Apa dasar memilih jumlah klaster k?

Metode (sama dengan 05_pca.py): 8 variabel, jumlah penduduk miskin di-log10,
skor-z, PCA dari matriks korelasi, klaster Ward, pencilan = jarak Mahalanobis
pada PC1-PC2 > 2,45.

Bagian 4 menguji ALTERNATIF pengelompokan (ruang skor-z vs ruang komponen utama, k = 3 dan 4)
dengan dua ukuran kemantapan: kemiripan antar susunan variabel (ARI) dan bootstrap atas provinsi.

Masukan  : docs/data/provinsi.json  (dan, bila ada, docs/data/provinsi_pca.json untuk verifikasi)
Keluaran : layar, data/processed/uji_kepekaan_pca.json, data/processed/uji_kepekaan_pca.md

Pemakaian (dari folder proyek):  python scripts/08_uji_kepekaan_pca.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import pdist, squareform

SRC = Path("docs/data/provinsi.json")
HASIL_WEB = Path("docs/data/provinsi_pca.json")
OUT_JSON = Path("data/processed/uji_kepekaan_pca.json")
OUT_MD = Path("data/processed/uji_kepekaan_pca.md")
K_DASAR = 4
BATAS_PENCILAN = 2.45
SEMUA = ["p0", "p1", "jml", "uhh", "hls", "rls", "pengeluaran", "ipm"]
NAMA = {"p0": "persentase miskin", "p1": "kedalaman (P1)", "jml": "jumlah miskin (log)", "uhh": "UHH",
        "hls": "HLS", "rls": "RLS", "pengeluaran": "pengeluaran", "ipm": "IPM"}
VARIAN = {
    "Dasar (8 variabel)": SEMUA,
    "Tanpa IPM": [v for v in SEMUA if v != "ipm"],
    "Tanpa P1": [v for v in SEMUA if v != "p1"],
    "Tanpa IPM dan P1": [v for v in SEMUA if v not in ("ipm", "p1")],
}

rows = json.loads(SRC.read_text(encoding="utf-8"))
bad = [r["provinsi"] for r in rows if any(r.get(k) is None for k in SEMUA)]
if bad:
    sys.exit(f"Data tidak lengkap untuk: {bad}")
NAMA_PROV = [r["provinsi"] for r in rows]
PK = [r["pk"] for r in rows]
n = len(rows)
X_ALL = {k: np.array([np.log10(r[k]) if k == "jml" else r[k] for r in rows], dtype=float) for k in SEMUA}


# ---------------------------------------------------------------- alat bantu
def analisis(kolom, k=K_DASAR):
    X = np.column_stack([X_ALL[c] for c in kolom])
    Z = (X - X.mean(axis=0)) / X.std(axis=0)
    R = np.corrcoef(Z, rowvar=False)
    lam, vec = np.linalg.eigh(R)
    o = np.argsort(lam)[::-1]
    lam, vec = lam[o], vec[:, o]
    for j in range(vec.shape[1]):                       # tanda komponen: variabel acuan berbobot positif
        acuan = next((kolom.index(c) for c in ("ipm", "uhh", "rls") if c in kolom), 0) if j == 0 \
            else int(np.argmax(np.abs(vec[:, j])))
        if vec[acuan, j] < 0:
            vec[:, j] = -vec[:, j]
    S = Z @ vec
    m = np.sqrt(S[:, 0] ** 2 / lam[0] + S[:, 1] ** 2 / lam[1])
    L = linkage(Z, method="ward")
    return {"kolom": kolom, "Z": Z, "R": R, "lam": lam, "vec": vec, "S": S, "m": m,
            "pencilan": set(np.where(m > BATAS_PENCILAN)[0].tolist()), "L": L,
            "label": fcluster(L, k, criterion="maxclust") - 1,
            "var_pct": lam / lam.sum() * 100}


def ari(a, b):
    """Adjusted Rand Index (1 = identik, ~0 = acak)."""
    a, b = np.asarray(a), np.asarray(b)
    ka, kb = a.max() + 1, b.max() + 1
    C = np.zeros((ka, kb))
    for i, j in zip(a, b):
        C[i, j] += 1
    comb = lambda x: x * (x - 1) / 2
    s_ij = comb(C).sum()
    s_a, s_b = comb(C.sum(axis=1)).sum(), comb(C.sum(axis=0)).sum()
    exp = s_a * s_b / comb(len(a))
    mx = (s_a + s_b) / 2
    return float((s_ij - exp) / (mx - exp)) if mx != exp else 1.0


def berpindah(a, b):
    """Jumlah provinsi yang klasternya berbeda setelah label dicocokkan secara optimal."""
    ka, kb = a.max() + 1, b.max() + 1
    C = np.zeros((ka, kb))
    for i, j in zip(a, b):
        C[i, j] += 1
    r, c = linear_sum_assignment(-C)
    return int(len(a) - C[r, c].sum())


def siluet(Z, label):
    D = squareform(pdist(Z))
    s = np.zeros(len(label))
    for i in range(len(label)):
        sama = (label == label[i])
        if sama.sum() <= 1:
            continue
        a_i = D[i, sama].sum() / (sama.sum() - 1)
        b_i = min(D[i, label == c].mean() for c in set(label) if c != label[i])
        s[i] = (b_i - a_i) / max(a_i, b_i)
    return float(s.mean())


def tabel_k(A, ks=range(2, 9)):
    h = A["L"][:, 2]
    out = []
    for k in ks:
        lab = fcluster(A["L"], k, criterion="maxclust") - 1
        out.append({"k": k, "siluet": round(siluet(A["Z"], lab), 3),
                    "celah": round(float(h[n - k] - h[n - k - 1]), 3),          # tinggi lompatan sebelum k -> k-1
                    "terkecil": int(np.bincount(lab).min())})
    return out


# ---------------------------------------------------------------- 1. kolinearitas
dasar = analisis(VARIAN["Dasar (8 variabel)"])
vif = np.diag(np.linalg.inv(dasar["R"]))
vif_d = {c: round(float(v), 1) for c, v in zip(SEMUA, vif)}
ix = lambda c: SEMUA.index(c)
r_p0_p1 = float(dasar["R"][ix("p0"), ix("p1")])
komp = ["uhh", "hls", "rls", "pengeluaran"]
A_c = np.column_stack([dasar["Z"][:, ix(c)] for c in komp] + [np.ones(n)])
koef, *_ = np.linalg.lstsq(A_c, dasar["Z"][:, ix("ipm")], rcond=None)
res = dasar["Z"][:, ix("ipm")] - A_c @ koef
r2_ipm = float(1 - res.var() / dasar["Z"][:, ix("ipm")].var())

print("=" * 72)
print("1. DIAGNOSTIK KOLINEARITAS (data dasar, 8 variabel)")
print("=" * 72)
print(f"Korelasi persentase miskin dengan P1      : r = {r_p0_p1:.3f}")
print(f"IPM diregresikan pada UHH, HLS, RLS, pengeluaran: R^2 = {r2_ipm:.3f}")
print("VIF (di atas 10 = tumpang tindih kuat):")
for c in SEMUA:
    tanda = "  <-- tinggi" if vif_d[c] > 10 else ""
    print(f"  {NAMA[c]:22s} {vif_d[c]:8.1f}{tanda}")

verif = None                                   # diisi setelah bagian 4

# ---------------------------------------------------------------- 2. varian variabel
print("\n" + "=" * 72)
print(f"2. UJI KEPEKAAN VARIABEL (k = {K_DASAR})")
print("=" * 72)
ringkas = {}
A_VAR = {}
for nama, kolom in VARIAN.items():
    A = dasar if nama.startswith("Dasar") else analisis(kolom)
    A_VAR[nama] = A
    pc1_r = abs(float(np.corrcoef(A["S"][:, 0], dasar["S"][:, 0])[0, 1]))
    pc2_r = abs(float(np.corrcoef(A["S"][:, 1], dasar["S"][:, 1])[0, 1]))
    pen = sorted(NAMA_PROV[i] for i in A["pencilan"])
    ringkas[nama] = {
        "variabel": len(kolom), "pc1_pct": round(float(A["var_pct"][0]), 1), "pc2_pct": round(float(A["var_pct"][1]), 1),
        "pc12_pct": round(float(A["var_pct"][:2].sum()), 1),
        "ari_vs_dasar": round(ari(dasar["label"], A["label"]), 3),
        "pindah_klaster": berpindah(dasar["label"], A["label"]),
        "korelasi_skor_pc1": round(pc1_r, 3), "korelasi_skor_pc2": round(pc2_r, 3),
        "pencilan": pen,
        "pencilan_dasar_tetap": sorted(NAMA_PROV[i] for i in dasar["pencilan"] & A["pencilan"]),
        "ukuran_klaster": sorted(np.bincount(A["label"]).tolist(), reverse=True),
    }
    r = ringkas[nama]
    print(f"\n{nama}")
    print(f"  PC1 {r['pc1_pct']}%, PC2 {r['pc2_pct']}%, keduanya {r['pc12_pct']}%")
    print(f"  Kemiripan klaster dengan dasar: ARI = {r['ari_vs_dasar']}, {r['pindah_klaster']} dari {n} provinsi berpindah klaster")
    print(f"  Korelasi skor PC1 dengan dasar: {r['korelasi_skor_pc1']}, PC2: {r['korelasi_skor_pc2']}")
    print(f"  Ukuran klaster: {r['ukuran_klaster']}")
    print(f"  VIF tertinggi pada susunan ini: {float(np.diag(np.linalg.inv(A['R'])).max()):.1f}")
    print(f"  Pencilan: {pen if pen else '(tidak ada)'}")

# ---------------------------------------------------------------- 3. memilih k
print("\n" + "=" * 72)
print("3. DASAR MEMILIH JUMLAH KLASTER (Ward)")
print("=" * 72)
kt = {}
for nama in ("Dasar (8 variabel)", "Tanpa IPM dan P1"):
    A = dasar if nama.startswith("Dasar") else analisis(VARIAN[nama])
    t = tabel_k(A)
    kt[nama] = t
    print(f"\n{nama}")
    print("   k   siluet   celah   klaster terkecil")
    for b in t:
        tanda = "  <-- k awal pada skor-z (situs kini: PC1-PC2, k = 3)" if b["k"] == K_DASAR else ""
        print(f"  {b['k']:2d}   {b['siluet']:6.3f}  {b['celah']:6.3f}   {b['terkecil']:3d}{tanda}")
    best_s = max(t, key=lambda b: b["siluet"])["k"]
    best_s3 = max(t[1:], key=lambda b: b["siluet"])["k"]        # k = 2 hampir selalu menang (pemisahan kasar): dinilai juga mulai k = 3
    best_g = max(t[1:], key=lambda b: b["celah"])["k"]
    print(f"  Siluet tertinggi pada k = {best_s} (k >= 3: k = {best_s3}); celah terbesar (k >= 3) pada k = {best_g}")
    kt[nama + "_terbaik"] = {"siluet": best_s, "siluet_k3plus": best_s3, "celah_k3plus": best_g}


# ---------------------------------------------------------------- 5. alternatif pengelompokan
print("\n" + "=" * 72)
print("4. KEMANTAPAN ALTERNATIF PENGELOMPOKAN (Ward)")
print("=" * 72)
print("ARI antar-variabel : kemiripan hasil dasar dengan hasil tiga susunan variabel lain (rata-rata dan terendah).")
print("ARI bootstrap      : kemiripan hasil seluruh data dengan hasil pada contoh acak provinsi (300 ulangan).")
print("Siluet (pedoman Kaufman-Rousseeuw): > 0,70 kuat; 0,51-0,70 wajar; 0,26-0,50 lemah (bisa artifisial); <= 0,25 tanpa struktur.\n")

rng = np.random.default_rng(2026)


def ruang(A, jenis):
    return A["Z"] if jenis == "Z" else A["S"][:, :(2 if jenis == "PC2" else 3)]


def klaster(X, k):
    return fcluster(linkage(X, method="ward"), k, criterion="maxclust") - 1


def boot_ari(X, k, B=300):
    penuh, skor = klaster(X, k), []
    for _ in range(B):
        u = np.unique(rng.integers(0, X.shape[0], X.shape[0]))
        if len(u) < k + 3:
            continue
        skor.append(ari(penuh[u], klaster(X[u], k)))
    return float(np.mean(skor))


NAMA_RUANG = {"Z": "skor-z (semua dimensi)", "PC2": "komponen utama 1-2", "PC3": "komponen utama 1-3"}
alt = []
for jenis in ("Z", "PC2", "PC3"):
    for k in (3, 4):
        Xd = ruang(dasar, jenis)
        lab_d = klaster(Xd, k)
        a_var = [ari(lab_d, klaster(ruang(A_VAR[v], jenis), k)) for v in VARIAN if not v.startswith("Dasar")]
        alt.append({
            "ruang": NAMA_RUANG[jenis], "k": k, "ari_antarvariabel_rata": round(float(np.mean(a_var)), 3),
            "ari_antarvariabel_min": round(float(np.min(a_var)), 3), "ari_bootstrap": round(boot_ari(Xd, k), 3),
            "siluet": round(siluet(Xd, lab_d), 3), "ukuran": sorted(np.bincount(lab_d).tolist(), reverse=True),
        })
print(f"{'ruang':26s} {'k':>2s} {'ARI var (rata)':>15s} {'ARI var (min)':>14s} {'ARI boot':>9s} {'siluet':>7s}  ukuran klaster")
for a in sorted(alt, key=lambda a: -(a["ari_antarvariabel_rata"] + a["ari_bootstrap"])):
    tanda = "  <-- pengelompokan saat ini" if (a["ruang"].startswith("skor-z") and a["k"] == K_DASAR) else ""
    print(f"{a['ruang']:26s} {a['k']:2d} {a['ari_antarvariabel_rata']:15.3f} {a['ari_antarvariabel_min']:14.3f} "
          f"{a['ari_bootstrap']:9.3f} {a['siluet']:7.3f}  {a['ukuran']}{tanda}")

# keanggotaan klaster pada pilihan teratas, agar mudah ditafsirkan
atas = max(alt, key=lambda a: a["ari_antarvariabel_rata"] + a["ari_bootstrap"])
jenis_atas = {v: k for k, v in NAMA_RUANG.items()}[atas["ruang"]]
lab_atas = klaster(ruang(dasar, jenis_atas), atas["k"])
urut_ipm = sorted(range(atas["k"]), key=lambda c: -np.mean([rows[i]["ipm"] for i in range(n) if lab_atas[i] == c]))
print(f"\nAnggota klaster untuk pilihan teratas ({atas['ruang']}, k = {atas['k']}), urut dari IPM rata-rata tertinggi:")
for no, c in enumerate(urut_ipm, 1):
    idx = [i for i in range(n) if lab_atas[i] == c]
    print(f"  Klaster {no} (n = {len(idx)}, IPM {np.mean([rows[i]['ipm'] for i in idx]):.1f}, "
          f"miskin {np.mean([rows[i]['p0'] for i in idx]):.1f}%): " + ", ".join(NAMA_PROV[i] for i in idx))


# ---------------------------------------------------------------- verifikasi terhadap situs
if HASIL_WEB.exists():
    web = json.loads(HASIL_WEB.read_text(encoding="utf-8"))
    meta = web.get("metode_klaster", {"ruang": "skor-z", "k": 4})
    jenis_web = "PC2" if meta["ruang"] == "PC1-PC2" else "PC3" if meta["ruang"] == "PC1-PC3" else "Z"
    peta_web = {p["pk"]: p for p in web["provinsi"]}
    lab_web = np.array([peta_web[pk]["klaster"] for pk in PK])
    pen_web = {i for i, pk in enumerate(PK) if peta_web[pk]["pencilan"]}
    lab_cek = klaster(ruang(dasar, jenis_web), meta["k"])
    verif = {"metode_di_situs": meta, "ARI_dengan_situs": round(ari(lab_cek, lab_web), 3),
             "pencilan_sama": pen_web == dasar["pencilan"]}
    print(f"\nVerifikasi terhadap provinsi_pca.json (metode di situs: {meta['ruang']}, k = {meta['k']}): "
          f"ARI = {verif['ARI_dengan_situs']}, pencilan {'sama' if verif['pencilan_sama'] else 'BERBEDA'} "
          f"(ARI 1.0 = identik dengan situs)")
    if (atas["ruang"], atas["k"]) != ({"PC2": "komponen utama 1-2", "PC3": "komponen utama 1-3", "Z": "skor-z (semua dimensi)"}[jenis_web], meta["k"]):
        print(f"  CATATAN: pilihan teratas pada uji ini ({atas['ruang']}, k = {atas['k']}) berbeda dari yang dipakai situs "
              f"({meta['ruang']}, k = {meta['k']}). Samakan RUANG_KLASTER dan K_KLASTER di 05_pca.py bila perlu.")

# ---------------------------------------------------------------- 4. paragraf siap pakai
def kata_ari(x):
    return "sangat mirip" if x >= 0.8 else "cukup mirip" if x >= 0.5 else "berbeda nyata"


def fd(x, d=2):
    return f"{x:.{d}f}".replace(".", ",")


t_d = kt["Dasar (8 variabel)"]
s4 = next(b for b in t_d if b["k"] == K_DASAR)["siluet"]
terbaik = kt["Dasar (8 variabel)_terbaik"]
pen_dasar = sorted(NAMA_PROV[i] for i in dasar["pencilan"])
varian_lain = [r for nm, r in ringkas.items() if not nm.startswith("Dasar")]
min_pc1 = min(r["korelasi_skor_pc1"] for r in varian_lain)
min_pc2 = min(r["korelasi_skor_pc2"] for r in varian_lain)
pen_sama = all(set(r["pencilan"]) == set(pen_dasar) for r in varian_lain)
z_asal = next(a for a in alt if a["ruang"].startswith("skor-z") and a["k"] == K_DASAR)
kategori_siluet = ("kuat" if atas["siluet"] > 0.70 else "wajar" if atas["siluet"] > 0.50
                   else "lemah" if atas["siluet"] > 0.25 else "tanpa struktur")

par = []
par.append(f"Karena IPM dibentuk dari umur harapan hidup, harapan lama sekolah, rata-rata lama sekolah, dan pengeluaran per kapita, "
           f"serta persentase penduduk miskin dan P1 berkorelasi sangat tinggi (r = {fd(r_p0_p1)}), dilakukan uji kepekaan. "
           f"Faktor inflasi varians (VIF) IPM adalah {fd(vif_d['ipm'], 1)} dan persentase penduduk miskin {fd(vif_d['p0'], 1)}, "
           f"{'melampaui' if max(vif_d['ipm'], vif_d['p0']) > 10 else 'tidak melampaui'} ambang umum 10.")
par.append(f"Peta posisi hasil PCA mantap terhadap pilihan variabel: pada tiga susunan lain (tanpa IPM, tanpa P1, tanpa keduanya) "
           f"korelasi skor PC1 dengan hasil dasar minimal {fd(min_pc1, 3)} dan skor PC2 minimal {fd(min_pc2, 3)}, "
           f"dengan dua komponen pertama menjelaskan {fd(min(r['pc12_pct'] for r in ringkas.values()), 1)}% sampai "
           f"{fd(max(r['pc12_pct'] for r in ringkas.values()), 1)}% variasi. "
           + (f"Pencilan {', '.join(pen_dasar)} sama pada semua susunan." if pen_sama
              else f"Pencilan dasar ({', '.join(pen_dasar) or 'tidak ada'}) berubah pada sebagian susunan."))
par.append(f"Sebaliknya, pengelompokan pada ruang skor-z dengan k = {K_DASAR} tidak mantap: kemiripan antar-susunan-variabel "
           f"rata-rata ARI = {fd(z_asal['ari_antarvariabel_rata'])} (terendah {fd(z_asal['ari_antarvariabel_min'])}) dan ARI bootstrap "
           f"{fd(z_asal['ari_bootstrap'])}. Dari enam alternatif (ruang skor-z, PC1-2, dan PC1-3; k = 3 dan 4), yang paling mantap adalah "
           f"pengelompokan Ward pada {atas['ruang']} dengan k = {atas['k']} (ARI antar-susunan-variabel rata-rata "
           f"{fd(atas['ari_antarvariabel_rata'])}, terendah {fd(atas['ari_antarvariabel_min'])}; ARI bootstrap {fd(atas['ari_bootstrap'])}; "
           f"siluet {fd(atas['siluet'])}). Skor siluet itu tergolong {kategori_siluet}, sehingga klaster ditafsirkan sebagai "
           f"pengelompokan deskriptif atas suatu kontinum, bukan kelompok alami. Karena pilihan dibuat setelah membandingkan beberapa "
           f"alternatif, semua alternatif dilaporkan.")

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps({"vif": vif_d, "r_p0_p1": round(r_p0_p1, 3), "r2_ipm_dari_komponen": round(r2_ipm, 3),
                                "varian": ringkas, "pilih_k": kt, "alternatif_pengelompokan": alt,
                                "verifikasi_situs": verif},
                               ensure_ascii=False, indent=1), encoding="utf-8")
OUT_MD.write_text("# Uji kepekaan PCA dan klaster (Bab 2)\n\n" + "\n\n".join(par) + "\n", encoding="utf-8")

print("\n" + "=" * 72)
print("5. PARAGRAF SIAP PAKAI UNTUK MAKALAH (periksa dan sesuaikan)")
print("=" * 72)
for p in par:
    print("\n" + p)
print(f"\nTersimpan: {OUT_JSON}, {OUT_MD}")