/* kesimpulan.js — bagian penutup: tiga pertanyaan, tiga jawaban.
   Semua angka dihitung dari data yang sama dengan bab-bab di atasnya, sehingga
   tidak pernah berbeda dari yang tampil pada grafik. */
(() => {
  'use strict';
  const K = window.Kisah;
  if (!K) return;
  K.modul.kesimpulan = 10;
  const { f0, f1, f2, esc, daftarDan } = K;
  const el = (id) => document.getElementById(id);
  if (!el('kes-grid')) return;

  const JAWA = ['DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'Daerah Istimewa Yogyakarta', 'Jawa Timur', 'Banten'];
  const isPapua = (prov) => /^papua/i.test(prov);
  const rKritis = (n) => { const z = 1.959964, df = n - 2; const t = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2); return t / Math.sqrt(df + t * t); };
  const minus = (v) => (v < 0 ? '\u2212' : '') + f2(Math.abs(v));

  Promise.all([K.dataPeta, K.json('data/provinsi_pca.json'), K.json('data/migrasi.json')]).then(([geo, pca, D]) => {
    const kartu = [];

    /* ---------- 1. Di mana? ---------- */
    const fitur = geo.features.filter((f) => f.geometry).map((f) => f.properties);
    fitur.forEach((p) => { p.p0 = +p.p0; p.jml = +p.jml; });
    const urutP0 = [...fitur].sort((a, b) => b.p0 - a.p0);
    const urutJml = [...fitur].sort((a, b) => b.jml - a.jml);
    const di20 = fitur.filter((p) => p.p0 >= 20).length;
    const sepuluh = urutP0.slice(0, 10);
    const dariPapua = sepuluh.filter((p) => isPapua(p.prov)).length;
    const total = d3.sum(fitur, (p) => p.jml);
    const bagianJawa = d3.sum(fitur.filter((p) => JAWA.includes(p.prov)), (p) => p.jml) / total * 100;
    const top = urutP0[0];
    kartu.push({
      no: '01', tanya: 'Di mana?', angka: di20, ket: 'kabupaten/kota memiliki persentase penduduk miskin di atas 20%',
      isi: `<p>${dariPapua} dari 10 kabupaten/kota dengan persentase penduduk miskin tertinggi berada di Papua. Puncaknya <strong>${esc(top.nama)}</strong> dengan ${f1(top.p0)}%.</p>
        <p>Jumlah orang terbanyak ada di tempat lain: Jawa menampung <strong>${f0(bagianJawa)}%</strong> dari seluruh penduduk miskin kabupaten/kota.</p>`
    });

    /* ---------- 2. Mengapa? ---------- */
    const P = pca.provinsi, vp = pca.pca.varians_pct, KL = pca.klaster;
    const rata = (a, b) => d3.mean(P, (p) => p.z[a] * p.z[b]);
    const rIpm = rata('ipm', 'p0'), rJml = rata('jml', 'p0');
    const bawah = KL[KL.length - 1];
    kartu.push({
      no: '02', tanya: 'Mengapa?', angka: `${f0(vp[0] + vp[1])}%`, ket: 'perbedaan antarprovinsi dirangkum oleh dua sumbu hasil PCA',
      isi: `<p>IPM dan persentase penduduk miskin berlawanan arah (r = ${minus(rIpm)}). Klaster terbawah, <strong>${daftarDan(bawah.anggota.map(esc))}</strong>, memiliki IPM rata-rata ${f1(bawah.rata.ipm)} dan persentase penduduk miskin rata-rata ${f1(bawah.rata.p0)}%.</p>
        <p>Jumlah penduduk miskin ${Math.abs(rJml) < 0.3 ? 'hampir tidak berkaitan dengan' : 'berkaitan dengan'} persentasenya (r = ${minus(rJml)}), karena dipengaruhi jumlah penduduk provinsi.</p>`
    });

    /* ---------- 3. Ke mana? ---------- */
    const per = D.urutan_periode, nodes = D.simpul;
    const p0s = nodes.map((s) => s.p0).sort(d3.ascending);
    const bt = [d3.quantile(p0s, 1 / 3), d3.quantile(p0s, 2 / 3)];
    const kel = (i) => (nodes[i].p0 < bt[0] ? 0 : nodes[i].p0 < bt[1] ? 1 : 2);
    const stat = (M) => {
      let r = 0, s = 0, t = 0;
      M.forEach((row, i) => row.forEach((v, j) => { if (i === j) return; const a = kel(i), b = kel(j); if (b < a) r += v; else if (b === a) s += v; else t += v; }));
      const jml = r + s + t; return { r: r / jml * 100, s: s / jml * 100, t: t / jml * 100 };
    };
    const peringkat = (a) => {
      const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length);
      for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
      return r;
    };
    const pearson = (x, y) => { const mx = d3.mean(x), my = d3.mean(y); let a = 0, b = 0, c = 0; x.forEach((v, i) => { a += (v - mx) * (y[i] - my); b += (v - mx) ** 2; c += (y[i] - my) ** 2; }); return a / Math.sqrt(b * c); };
    const p = per[0], M = D.periode[p].matriks;
    const hit = per.map((q) => ({
      q, label: D.periode[q].label.toLowerCase(), st: stat(D.periode[q].matriks),
      rho: pearson(peringkat(nodes.map((s) => s[q].neto_per100)), peringkat(nodes.map((s) => s.p0)))
    }));
    const rk = rKritis(nodes.length);
    const lemah = hit.every((h) => Math.abs(h.rho) < rk);
    const berlawanan = hit.length > 1 && Math.sign(hit[0].rho) !== Math.sign(hit[1].rho);
    const pas = []; M.forEach((r, i) => r.forEach((v, j) => { if (i !== j) pas.push({ i, j, v }); })); pas.sort((a, b) => b.v - a.v);
    const nm = (i) => esc(nodes[i].nama);
    const arah = hit.map((h) => `<strong>${f0(h.st.r)}% berbanding ${f0(h.st.t)}%</strong> (${esc(h.label)})`);
    const rhoTeks = hit.map((h) => (h.rho > 0 ? '+' : '') + minus(h.rho)).join(' dan ');
    const sisa = lemah
      ? `${berlawanan ? 'Arahnya berlawanan antar periode, dan korelasi' : 'Korelasi'} migrasi neto dengan persentase penduduk miskin lemah (\u03c1 = ${rhoTeks}), di bawah batas bermakna sekitar ${f2(rk)} untuk ${nodes.length} provinsi. Data ini tidak menunjukkan pola yang konsisten bahwa penduduk berpindah dari provinsi miskin ke yang lebih sejahtera.`
      : hit.filter((h) => Math.abs(h.rho) >= rk).map((h) => `Pada ${esc(h.label)}, provinsi dengan persentase penduduk miskin lebih tinggi cenderung ${h.rho > 0 ? 'menerima lebih banyak pendatang' : 'kehilangan penduduk'} (\u03c1 = ${(h.rho > 0 ? '+' : '') + minus(h.rho)}).`).join(' ');
    kartu.push({
      no: '03', tanya: 'Ke mana?', angka: f1(D.periode[p].total_arus / 1e6), ket: `juta perpindahan antarprovinsi (${D.periode[p].label.toLowerCase()})`,
      isi: `<p>Arus terbesar: <strong>${nm(pas[0].i)} \u2192 ${nm(pas[0].j)}</strong>.</p>
        <p>Perpindahan menuju provinsi dengan kelompok kemiskinan lebih rendah berbanding lebih tinggi: ${daftarDan(arah)}.</p>
        <p>${sisa}</p>`
    });

    el('kes-grid').innerHTML = kartu.map((k, i) => `
      <article class="kes-kartu muncul" style="--d:${i}">
        <p class="kes-no" aria-hidden="true">${k.no}</p>
        <h3>${k.tanya}</h3>
        <p class="kes-angka"><b>${k.angka}</b><span>${k.ket}</span></p>
        <div class="kes-isi">${k.isi}</div>
      </article>`).join('');
    document.querySelectorAll('#kes-grid .muncul').forEach((n) => {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { n.classList.add('terlihat'); io.disconnect(); } }, { threshold: 0.15 });
      io.observe(n);
    });

    const kunci = (a) => new Set(a.slice(0, 10).map((q) => q.kode || q.nama));
    const irisan = [...kunci(urutP0)].filter((x) => kunci(urutJml).has(x)).length;
    el('kes-penutup').innerHTML = irisan <= 2
      ? 'Persentase penduduk miskin tertinggi dan jumlah penduduk miskin terbanyak berada di tempat yang berbeda. Ukuran yang kita pilih menentukan di mana kita melihat masalahnya.'
      : 'Persentase penduduk miskin dan jumlah penduduk miskin sebagian menunjuk wilayah yang sama, tetapi urutannya berbeda. Ukuran yang kita pilih memengaruhi wilayah mana yang tampak paling mendesak.';
  }).catch((e) => {
    el('kes-grid').innerHTML = `<p class="galat">Kesimpulan tidak dapat ditampilkan: ${esc(e.message)}</p>`;
  });
})();