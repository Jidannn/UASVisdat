# Kemiskinan Indonesia: di mana, mengapa, dan ke mana orang bergerak

Kisah data interaktif (*data story*) tentang kemiskinan di 514 kabupaten/kota dan 38 provinsi Indonesia, dengan data resmi BPS. Tugas UAS Visualisasi Data dan Informasi 2026.

- **Situs:** https://jidannn.github.io/UASvisdat/ 
- **Penulis:** Zidan Septian (222313447) 

Situs berjalan sepenuhnya di browser (HTML, CSS, JavaScript dengan D3.js), tanpa login dan tanpa server. Folder `docs/` adalah situs yang dipublikasikan GitHub Pages.

## Isi

| Bab | Pertanyaan | Topik | Teknik |
| --- | --- | --- | --- |
| 1 | Di mana kantong kemiskinan? | Geospasial (kabupaten/kota) | Peta choropleth persentase penduduk miskin + simbol proporsional jumlah penduduk miskin; kuantil atau natural breaks; zoom, tooltip, kontrol lapisan |
| 2 | Mengapa provinsi berbeda? | Multivariat (38 provinsi, 8 variabel) | PCA + biplot, parallel coordinates, heatmap terklaster; brushing dan linking; klaster dan pencilan |
| 3 | Ke mana orang bergerak? | Aliran (34 provinsi) | Diagram chord berarah, alluvial/Sankey, matriks asal-tujuan, batang migrasi neto; filter periode, provinsi, arah |

Setiap visualisasi memuat judul, legenda, satuan, dan keterangan sumber.

## Data

Tautan lengkap dan tanggal akses juga ada di bagian "Sumber data dan catatan metode" pada situs. 

| Data | Sumber | Berkas di `data/raw/` |
| --- | --- | --- |
| Persentase penduduk miskin (P0) kab/kota, Maret 2025 | BPS, Susenas | `bps/Persentase_Penduduk_Miskin_2025.csv` |
| Indeks kedalaman kemiskinan (P1) kab/kota, Maret 2025 | BPS, Susenas | `bps/Indeks_Kedalaman_Kemiskinan_2025.csv` |
| Jumlah penduduk miskin kab/kota (ribu jiwa), Maret 2025 | BPS, Susenas | `bps/Jumlah_Penduduk_Miskin_2025.csv` |
| IPM provinsi 2025 (UHH, HLS, RLS, pengeluaran, IPM) | BPS, publikasi *Indeks Pembangunan Manusia 2025* | `bps/ipm_provinsi_2025.xlsx` |
| P0 provinsi, Maret 2015, 2020, 2025 | BPS, Susenas | `bps/P0_Provinsi_2015_2020_2025.xlsx` |
| Arus migrasi risen antarprovinsi | BPS, SP2020 Long Form | `bps/Arus_Migrasi_Risen.json` |
| Arus migrasi seumur hidup antarprovinsi | BPS, SP2020 Long Form | `bps/migrasi_seumur_hidup.json` |
| Batas kabupaten/kota 2024 (**bukan BPS**) | LapakGIS | `geo/LapakGIS_Batas_Kabupaten_2024.shp` *(tidak disertakan di repositori: berukuran besar)* |

Tautan sumber BPS:

- P0 kab/kota: https://www.bps.go.id/indicator/23/621/1/persentase-penduduk-miskm-pQ-menurut-kabupaten-kota.html
- P1 kab/kota: https://www.bps.go.id/id/statistics-table/2/NjIyIzI=/indeks-kedalaman-kemiskinan--p1--menurut-kabupaten-kota.html
- Jumlah penduduk miskin kab/kota: https://www.bps.go.id/en/statistics-table/2/NjE5IzI=/jumlah-penduduk-miskin--ribu-jiwa--menurut-kabupaten-kota.html
- P0 provinsi (deret waktu): https://www.bps.go.id/id/statistics-table/2/MTkyIzI=/persentase-penduduk-miskin--p0--menurut-provinsi-dan-daerah.html
- IPM 2025: https://www.bps.go.id/en/publication/2026/04/24/f96755ab0e48765d028c0462/indeks-pembangunan-manusia-2025.html
- Migrasi (SP2020 Long Form): https://sensus.bps.go.id/topik/tabular/sp2022/170/0/0

## Struktur folder

```
poverty-story/
├── README.md
├── requirements.txt
├── .gitignore
├── data/
│   ├── raw/bps/ 
│   ├── raw/geo/ 
│   └── processed/ 
├── scripts/ 
│   └── arsip/  
└── docs/ 
    ├── index.html
    ├── css/style.css
    ├── js/ 
    │   └── vendor/
    └── data/
```

## Mengulang pengolahan data

Prasyarat: Python 3.10+, Node.js (untuk mapshaper), dan berkas data pada `data/raw/` seperti tabel di atas.

```
pip install -r requirements.txt
npm install -g mapshaper
```

Jalankan dari folder proyek, berurutan (perintah untuk Windows CMD):

```
1. Peta: buang fitur tanpa nama dan sampah, sederhanakan dengan menjaga batas bersama (topologi)
mapshaper data/raw/geo/LapakGIS_Batas_Kabupaten_2024.shp -filter "!!WADMKK && WADMKK.indexOf('/') == -1 && WADMKK != 'Pahuwato'" -simplify 1% keep-shapes -o data/processed/kabkota_mapshaper.geojson format=geojson precision=0.0001 force

2. Gabung potongan bernama sama, buang pulau kecil (< ~12 km2) dan lubang, perbaiki arah poligon
python scripts/03b_pascaproses.py data/processed/kabkota_mapshaper.geojson data/processed/kabkota.geojson 0.001

3. Gabungkan data BPS ke peta (Bab 1) dan susun tabel provinsi
python scripts/04_gabung_data.py

4. PCA, klaster, pencilan (Bab 2)
python scripts/05_pca.py

5. Matriks migrasi (Bab 3), lalu gabungkan dengan kemiskinan provinsi 2020
python scripts/build_flow.py data/raw/bps/Arus_Migrasi_Risen.json data/processed risen
python scripts/build_flow.py data/raw/bps/migrasi_seumur_hidup.json data/processed seumur_hidup
python scripts/06_siapkan_migrasi.py

6. (Opsional) uji kepekaan PCA dan klaster
python scripts/08_uji_kepekaan_pca.py
```

Hasil akhir yang dibaca situs: `docs/data/kabkota_miskin.geojson`, `docs/data/provinsi_pca.json`, `docs/data/migrasi.json`.

## Menjalankan situs secara lokal

Berkas JSON dimuat lewat `fetch`, jadi `index.html` tidak bisa dibuka dengan klik ganda. Dari folder proyek:

```
python scripts/serve.py
```

lalu buka http://localhost:8000. Server ini tidak memakai cache, sehingga perubahan berkas langsung terbaca.

## Metode ringkas

- **Peta:** kuantil (default) atau natural breaks (Fisher-Jenks), enam kelas, palet ColorBrewer YlOrBr; luas lingkaran sebanding dengan jumlah penduduk miskin.
- **Bab 2:** delapan variabel (persentase penduduk miskin, kedalaman kemiskinan P1, log jumlah penduduk miskin, UHH, HLS, RLS, pengeluaran per kapita, IPM), skor-z, PCA dari matriks korelasi. Pencilan: jarak Mahalanobis pada PC1-PC2 > 2,45. Klaster: Ward pada skor PC1-PC2, k = 3, dipilih dari enam alternatif berdasarkan kemantapan terhadap pilihan variabel dan contoh acak provinsi (`scripts/08_uji_kepekaan_pca.py`).
- **Bab 3:** migrasi neto = pendatang dikurangi perantau tanpa pindah dalam provinsi, dibagi jumlah penduduk SP2020. Kemiskinan yang dipakai: Maret 2020 (sezaman dengan sensus, 34 provinsi). Kelompok kemiskinan = tertil provinsi menurut persentase penduduk miskin.

## Keterbatasan

- Persentase penduduk miskin Bab 1 dan 2 adalah Maret 2025, sedangkan Bab 3 memakai Maret 2020. Migrasi seumur hidup merekam arus yang jauh lebih lama dari satu tahun kemiskinan. Hubungan migrasi dan kemiskinan hanya gambaran statistik, bukan sebab-akibat.
- Angka kabupaten/kota berasal dari survei (Susenas), bukan sensus, sehingga mengandung galat sampling.
- IPM disusun dari empat variabel lain dalam analisis, dan P1 hampir kembar dengan P0 (VIF tinggi). Peta posisi PCA dan pencilan mantap terhadap hal ini, tetapi pembagian klaster tidak mantap pada ruang skor-z. Struktur klaster tergolong lemah, sehingga klaster bersifat deskriptif.
- Batas wilayah disederhanakan; pulau yang sangat kecil tidak digambar.
- Pada ponsel, peta tidak dapat digeser dengan satu jari agar halaman tetap bisa digulir; gunakan tombol zoom.

## Lisensi dan atribusi

- Data: BPS (sumber resmi, dicantumkan pada setiap visualisasi). Batas wilayah: LapakGIS 2024 (data pendukung non-BPS).
- Pustaka: [D3.js](https://d3js.org) v7.9.0 (ISC) dan [d3-sankey](https://github.com/d3/d3-sankey) v0.12.3 (BSD-3-Clause), disertakan di `docs/js/vendor/`.
- Huruf: Source Serif 4 dan IBM Plex Sans (SIL Open Font License) dimuat dari Google Fonts.
- Kode: [pilih lisensi, mis. MIT] *(isi)*