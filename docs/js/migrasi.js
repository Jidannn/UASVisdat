/* Bab 3 — ke mana orang bergerak? (aliran, 34 provinsi)
   Panggung scroll: teks di kiri, satu grafik di kanan yang berganti per langkah.
   Teknik: chord berarah, alluvial/Sankey, batang migrasi neto, matriks asal-tujuan.
   Volume = lebar pita / kepekatan sel; arah = ujung runcing pita + warna (keluar/masuk).
   Filter: periode, provinsi, arah, jumlah arus terbesar, tingkat agregasi Sankey.
   Data: scripts/build_flow.py + scripts/06_siapkan_migrasi.py */
(() => {
  'use strict';

  const K = window.Kisah;
  K.modul.migrasi = 10;
  const { f0, f1, f2, esc, daftarDan } = K;
  const fSigned = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3] }).format('+,.1f');
  const fSign1 = (v) => (Math.abs(v) < 0.05 ? '0,0' : fSigned(v));
  const WARNA_P = d3.schemeYlOrBr[7].slice(1);          // sama dengan Bab 1
  const C_KELUAR = '#0072B2', C_MASUK = '#D55E00', C_NETRAL = '#6b8199';
  const SING = {
    'Sumatera Utara': 'Sumut', 'Sumatera Barat': 'Sumbar', 'Sumatera Selatan': 'Sumsel',
    'Kepulauan Bangka Belitung': 'Babel', 'Kepulauan Riau': 'Kepri', 'DI Yogyakarta': 'DIY',
    'Jawa Barat': 'Jabar', 'Jawa Tengah': 'Jateng', 'Jawa Timur': 'Jatim',
    'Nusa Tenggara Barat': 'NTB', 'Nusa Tenggara Timur': 'NTT',
    'Kalimantan Barat': 'Kalbar', 'Kalimantan Tengah': 'Kalteng', 'Kalimantan Selatan': 'Kalsel',
    'Kalimantan Timur': 'Kaltim', 'Kalimantan Utara': 'Kaltara',
    'Sulawesi Utara': 'Sulut', 'Sulawesi Tengah': 'Sulteng', 'Sulawesi Selatan': 'Sulsel',
    'Sulawesi Tenggara': 'Sultra', 'Sulawesi Barat': 'Sulbar', 'Maluku Utara': 'Malut'
  };
  const sing = (nama) => SING[nama] || nama;
  const el = (id) => document.getElementById(id);
  const KASAR = matchMedia('(pointer: coarse)').matches;

  K.json('data/migrasi.json').then(mulai).catch((e) => {
    el('bab3-galat').hidden = false;
    el('bab3-galat').textContent = `Bab 3 tidak dapat ditampilkan: ${e.message}. Pastikan docs/data/migrasi.json ada (hasil scripts/06_siapkan_migrasi.py) dan halaman dibuka lewat server lokal.`;
  });

  function peringkat(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(a.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  }
  /* batas |rho| agar bermakna pada taraf 5% (dua sisi), aproksimasi t kritis Cornish-Fisher */
  function rKritis(n) {
    const z = 1.959964, df = n - 2;
    const t = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
    return t / Math.sqrt(df + t * t);
  }
  function pearson(x, y) {
    const mx = d3.mean(x), my = d3.mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; });
    return sxy / Math.sqrt(sxx * syy);
  }

  function mulai(D) {
    K.pastikanDom(['petunjuk-bab3', 'm-periode', 'm-fokus', 'm-n', 'm-n-out', 'm-jml-tampil', 'm-ket', 'chord', 'matriks', 'neto', 'sankey',
      'sankey-ket', 'm-leg-p0', 'm-skala', 'm-skala-max', 'm-kartu', 'b3-tabs', 'b3-panggung']);
    const nodes = D.simpul, n = nodes.length;
    const TP = D.tahun_p0 || 2025;                       // tahun persentase penduduk miskin yang dipakai di bab ini
    const KS = D.kestabilan || null;
    const info = document.getElementById('info-data');   // baris di kaki halaman: memastikan data terbaru yang terbaca
    if (info) info.textContent = `Data Bab 3 terbaca: persentase penduduk miskin Maret ${TP}` +
      (KS ? `, korelasi peringkat dengan 2025 \u03c1 = ${KS.rho_2020_2025.toString().replace('.', ',')}, ${KS.pindah_kelompok_2020_2025} dari ${KS.jumlah_provinsi} provinsi berpindah kelompok.` : ' (berkas migrasi.json belum memuat pemeriksaan kestabilan: jalankan ulang 06_siapkan_migrasi.py).');
    const per = D.urutan_periode;
    const S = { periode: per[0], fokus: -1, arah: 'keduanya', topN: 60, hover: -1, pasangan: null, level: 'provinsi' };
    const mat = () => D.periode[S.periode].matriks;
    const st = (i) => nodes[i][S.periode];
    const efektif = () => (S.hover >= 0 ? S.hover : S.fokus);
    const lab = (p) => D.periode[p].label.toLowerCase();
    const nilaiPer = (p, i) => nodes[i][p].neto_per100;

    const p0s = nodes.map((s) => s.p0).sort(d3.ascending);
    const skalaP = d3.scaleThreshold().domain(d3.range(1, 6).map((i) => d3.quantile(p0s, i / 6))).range(WARNA_P);
    const warnaNode = (i) => skalaP(nodes[i].p0);

    /* ---------- tooltip ---------- */
    const tip = el('tip');
    function tipTampil(e, html) {
      if (e.pointerType === 'touch') return;
      tip.innerHTML = html; tip.style.display = 'block'; tipGeser(e);
    }
    function tipGeser(e) {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > innerHeight - 8) y = e.clientY - h - 14;
      tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
    }
    const tipSembunyi = () => { tip.style.display = 'none'; };

    el('petunjuk-bab3').textContent = KASAR
      ? 'Gulir untuk berpindah langkah. Ketuk sebuah provinsi untuk memfokuskan arusnya.'
      : 'Gulir untuk berpindah langkah. Arahkan kursor ke busur atau pita untuk rincian, klik provinsi untuk mengunci fokus.';

    /* ---------- kontrol ---------- */
    d3.select('#m-periode').selectAll('label').data(per).join('label').attr('class', 'seg-opsi')
      .html((p) => `<input type="radio" name="m-periode" value="${p}"${p === S.periode ? ' checked' : ''}><span>${esc(D.periode[p].label)}</span>`);
    d3.selectAll('#m-periode input').on('change', (e) => terapkan({ periode: e.target.value }));

    d3.select('#m-fokus').selectAll('option.p').data(nodes).join('option').attr('class', 'p')
      .attr('value', (d, i) => i).text((d) => d.nama);
    el('m-fokus').addEventListener('change', (e) => setFokus(+e.target.value, null, true));
    d3.selectAll('input[name="m-arah"]').on('change', (e) => { S.arah = e.target.value; chordV.perbaruiRibbon(); chordV.gayaArc(); matV.perbarui(); sankeyV.gambar(); });
    el('m-n').addEventListener('input', (e) => { S.topN = +e.target.value; el('m-n-out').textContent = S.topN; chordV.perbaruiRibbon(); chordV.gayaArc(); sankeyV.gambar(); });
    el('m-n-out').textContent = S.topN;
    if (el('fokus-mini')) el('fokus-mini').addEventListener('click', () => setFokus(-1, null, true));
    d3.selectAll('input[name="m-level"]').on('change', (e) => { S.level = e.target.value; sankeyV.gambar(); });

    function setArah(a) {
      S.arah = a;
      d3.selectAll('input[name="m-arah"]').property('checked', function () { return this.value === a; });
    }
    function setFokus(i, pasangan, paksa) {
      S.fokus = (i === S.fokus && !pasangan && !paksa) ? -1 : i;
      S.pasangan = pasangan || null;
      el('m-fokus').value = S.fokus;
      d3.selectAll('input[name="m-arah"]').property('disabled', S.fokus < 0);
      chordV.perbaruiRibbon(); chordV.gayaArc(); matV.perbarui(); netoV.perbarui(); isiKartu(); sankeyV.gambar();
    }
    function terapkan(o) {
      if (o.periode && o.periode !== S.periode) {
        S.periode = o.periode; S.pasangan = null;
        d3.selectAll('#m-periode input').property('checked', function () { return this.value === o.periode; });
        el('m-ket').textContent = D.periode[S.periode].keterangan;
      }
      if (o.arah) setArah(o.arah);
      if (o.level) {
        S.level = o.level;
        d3.selectAll('input[name="m-level"]').property('checked', function () { return this.value === o.level; });
      }
      if (o.fokus !== undefined) {
        S.fokus = o.fokus; S.pasangan = null;
        el('m-fokus').value = S.fokus;
        d3.selectAll('input[name="m-arah"]').property('disabled', S.fokus < 0);
      }
      gambarSemua();
    }

    /* =========================================================
       1. Diagram chord berarah
       ========================================================= */
    const chordV = (() => {
      const host = d3.select('#chord');
      let gArc, gRib, rib, arcGen, chords;

      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth, hh = host.node().clientHeight || w, kecil = w < 520;
        const margin = kecil ? 54 : 84;
        const R = Math.max(80, Math.min(w, hh) / 2 - margin), r0 = R - 13;
        const svg = host.append('svg').attr('width', w).attr('height', hh)
          .attr('role', 'group').attr('aria-label', 'Diagram chord arus migrasi antarprovinsi');
        const g = svg.append('g').attr('transform', `translate(${w / 2},${hh / 2})`);
        chords = d3.chordDirected().padAngle(kecil ? 0.026 : 0.02).sortSubgroups(d3.descending)(mat());
        arcGen = d3.arc().innerRadius(r0).outerRadius(R);
        rib = d3.ribbonArrow().radius(r0 - 2).padAngle(1 / r0);
        gRib = g.append('g').attr('class', 'pita');
        gArc = g.append('g').attr('class', 'busur');

        const grp = gArc.selectAll('g').data(chords.groups).join('g').attr('class', 'busur-g');
        grp.append('path').attr('class', 'busur-p').attr('d', arcGen).attr('fill', (d) => warnaNode(d.index))
          .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (d) => nodes[d.index].nama)
          .on('pointerenter', (e, d) => { S.hover = d.index; perbaruiRibbon(); gayaArc(); tipTampil(e, htmlNode(d.index)); })
          .on('pointermove', tipGeser)
          .on('pointerleave', () => { S.hover = -1; perbaruiRibbon(); gayaArc(); tipSembunyi(); })
          .on('click', (e, d) => setFokus(d.index))
          .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFokus(d.index); } });
        grp.append('text').attr('class', 'busur-label')
          .each((d) => { d.angle = (d.startAngle + d.endAngle) / 2; })
          .attr('dy', '0.35em')
          .attr('transform', (d) => `rotate(${d.angle * 180 / Math.PI - 90}) translate(${R + 7}) ${d.angle > Math.PI ? 'rotate(180)' : ''}`)
          .attr('text-anchor', (d) => d.angle > Math.PI ? 'end' : null)
          .style('font-size', kecil ? '9px' : '11px')
          .text((d) => sing(nodes[d.index].nama));
        perbaruiRibbon(); gayaArc();
      }

      function htmlNode(i) {
        const s = nodes[i], v = s[S.periode];
        return `<strong>${esc(s.nama)}</strong><span class="p">${esc(s.pulau)}, penduduk miskin ${f1(s.p0)}%</span>
          Masuk <b>${f0(v.masuk)}</b><br>Keluar <b>${f0(v.keluar)}</b><br>Neto <b>${f0(v.neto)}</b>`;
      }
      function aliran() {
        const f = efektif(), out = [];
        chords.forEach((c) => {
          const i = c.source.index, j = c.target.index;
          if (i === j || c.source.value <= 0) return;
          if (f >= 0) {
            const k = (i === f && S.arah !== 'masuk') || (j === f && S.arah !== 'keluar');
            if (!k) return;
          }
          out.push(c);
        });
        out.sort((a, b) => b.source.value - a.source.value);
        return out.slice(0, S.topN).reverse();
      }
      function perbaruiRibbon() {
        if (!gRib) return;
        const f = efektif();
        const data = aliran();
        const warna = (c) => f < 0 ? C_NETRAL : c.source.index === f ? C_KELUAR : c.target.index === f ? C_MASUK : C_NETRAL;
        gRib.selectAll('path').data(data, (c) => c.source.index + '-' + c.target.index).join('path')
          .attr('class', 'pita-p').attr('d', rib).attr('fill', warna)
          .attr('fill-opacity', f < 0 ? 0.42 : 0.62)
          .on('pointerenter', (e, c) => tipTampil(e, `<strong>${esc(nodes[c.source.index].nama)} \u2192 ${esc(nodes[c.target.index].nama)}</strong>
            <b>${f0(c.source.value)}</b> orang<br><span class="p">${f1(c.source.value / st(c.source.index).keluar * 100)}% dari seluruh arus keluar ${esc(sing(nodes[c.source.index].nama))}</span>`))
          .on('pointermove', tipGeser).on('pointerleave', tipSembunyi);
        el('m-jml-tampil').textContent = `${data.length} arus ditampilkan`;
      }
      function gayaArc() {
        if (!gArc) return;
        const f = efektif();
        const terhubung = new Set();
        if (f >= 0) {
          terhubung.add(f);
          aliran().forEach((c) => { terhubung.add(c.source.index); terhubung.add(c.target.index); });
        }
        gArc.selectAll('.busur-p').attr('opacity', (d) => f < 0 || terhubung.has(d.index) ? 1 : 0.28)
          .attr('stroke', (d) => d.index === S.fokus ? '#1a2631' : '#fff')
          .attr('stroke-width', (d) => d.index === S.fokus ? 2.5 : 1);
        gArc.selectAll('.busur-label').attr('opacity', (d) => f < 0 || terhubung.has(d.index) ? 1 : 0.35)
          .style('font-weight', (d) => d.index === S.fokus ? 700 : 400);
      }
      return { gambar, perbaruiRibbon, gayaArc };
    })();
    function perbaruiRibbon() { chordV.perbaruiRibbon(); chordV.gayaArc(); }
    function gayaArc() { chordV.gayaArc(); }

    /* =========================================================
       2. Matriks asal-tujuan
       ========================================================= */
    const matV = (() => {
      const host = d3.select('#matriks');
      let rects, rowLab, colLab, cell, ovl;

      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth, hh = host.node().clientHeight || w, kecil = w < 520;
        const M0 = { t: kecil ? 58 : 70, l: kecil ? 54 : 84, r: kecil ? 20 : 30, b: 6 };
        cell = Math.max(5, Math.min((w - M0.l - M0.r) / n, (hh - M0.t - M0.b) / n));
        const svg = host.append('svg').attr('width', M0.l + cell * n + M0.r).attr('height', M0.t + cell * n + M0.b)
          .attr('role', 'group').attr('aria-label', 'Matriks arus migrasi: baris asal, kolom tujuan');
        const g = svg.append('g').attr('transform', `translate(${M0.l},${M0.t})`);
        const M = mat();
        const semua = [];
        M.forEach((r, i) => r.forEach((v, j) => { if (i !== j && v > 0) semua.push(v); }));
        const vmax = d3.quantile(semua.sort(d3.ascending), 0.99);
        const warna = d3.scaleSequentialSqrt(d3.interpolateBlues).domain([0, vmax]).clamp(true);
        el('m-skala-max').textContent = `\u2265 ${f0(Math.round(vmax / 1000) * 1000)}`;
        const fs = cell < 11 ? 8 : 10;
        rowLab = g.selectAll('text.rl').data(nodes).join('text').attr('class', 'lab-m')
          .attr('x', -4).attr('y', (d, i) => i * cell + cell / 2 + 3).attr('text-anchor', 'end')
          .style('font-size', fs + 'px').text((d) => sing(d.nama)).style('cursor', 'pointer')
          .on('click', (e, d) => { setArah('keluar'); setFokus(nodes.indexOf(d), null, true); });
        colLab = g.selectAll('text.cl').data(nodes).join('text').attr('class', 'lab-m')
          .attr('transform', (d, i) => `translate(${i * cell + cell / 2 + 3},-4) rotate(-60)`)
          .style('font-size', fs + 'px').text((d) => sing(d.nama)).style('cursor', 'pointer')
          .on('click', (e, d) => { setArah('masuk'); setFokus(nodes.indexOf(d), null, true); });

        const data = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) data.push({ i, j, v: M[i][j] });
        rects = g.selectAll('rect.c').data(data).join('rect').attr('class', 'sel-m')
          .attr('x', (d) => d.j * cell).attr('y', (d) => d.i * cell)
          .attr('width', Math.max(1, cell - 0.6)).attr('height', Math.max(1, cell - 0.6))
          .attr('fill', (d) => d.i === d.j ? '#e4e9ed' : d.v > 0 ? warna(d.v) : '#f5f8fa')
          .on('pointerenter', (e, d) => {
            if (d.i === d.j) return;
            const balik = M[d.j][d.i];
            tipTampil(e, `<strong>${esc(nodes[d.i].nama)} \u2192 ${esc(nodes[d.j].nama)}</strong><b>${f0(d.v)}</b> orang
              <br><span class="p">Arah sebaliknya: ${f0(balik)}; selisih bersih ${f0(d.v - balik)}</span>`);
          })
          .on('pointermove', tipGeser).on('pointerleave', tipSembunyi)
          .on('click', (e, d) => { if (d.i !== d.j) { setArah('keluar'); setFokus(d.i, [d.i, d.j], true); } });
        let prev = nodes[0].pulau;
        nodes.forEach((s, i) => {
          if (s.pulau !== prev) {
            g.append('line').attr('class', 'pisah-m').attr('x1', 0).attr('x2', cell * n).attr('y1', i * cell).attr('y2', i * cell);
            g.append('line').attr('class', 'pisah-m').attr('y1', 0).attr('y2', cell * n).attr('x1', i * cell).attr('x2', i * cell);
            prev = s.pulau;
          }
        });
        ovl = g.append('g').attr('pointer-events', 'none');
        svg.append('text').attr('class', 'judul-sumbu').attr('x', 4).attr('y', 14).text('asal \u2193');
        svg.append('text').attr('class', 'judul-sumbu').attr('x', M0.l).attr('y', 14).text('tujuan \u2192');
        perbarui();
      }
      function perbarui() {
        if (!rects) return;
        const f = S.fokus;
        rects.attr('opacity', (d) => {
          if (f < 0) return 1;
          const ok = (d.i === f && S.arah !== 'masuk') || (d.j === f && S.arah !== 'keluar');
          return ok ? 1 : 0.18;
        });
        rowLab.style('font-weight', (d, i) => i === f ? 700 : 400).attr('opacity', (d, i) => f < 0 || i === f ? 1 : 0.55);
        colLab.style('font-weight', (d, i) => i === f ? 700 : 400).attr('opacity', (d, i) => f < 0 || i === f ? 1 : 0.55);
        ovl.selectAll('*').remove();
        if (S.pasangan) {
          const [a, b] = S.pasangan;
          ovl.append('rect').attr('x', b * cell - 1).attr('y', a * cell - 1).attr('width', cell + 1.4).attr('height', cell + 1.4)
            .attr('fill', 'none').attr('stroke', '#1a2631').attr('stroke-width', 2);
        }
      }
      return { gambar, perbarui };
    })();

    /* =========================================================
       3. Batang migrasi neto
       ========================================================= */
    const nilaiNeto = (i) => st(i).neto_per100;
    const netoV = (() => {
      const host = d3.select('#neto');
      let barG;
      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth, hh = host.node().clientHeight || 600, kecil = w < 520;
        const M0 = { t: 30, l: kecil ? 72 : 108, r: 8, b: 4 };
        // tinggi baris menyesuaikan ruang yang ada agar seluruh 34 provinsi terlihat tanpa menggulir
        const rowH = Math.max(7.5, Math.min(20, (hh - M0.t - M0.b) / n));
        const h = M0.t + rowH * n + M0.b;
        const urut = d3.range(n).sort((a, b) => nilaiNeto(b) - nilaiNeto(a));
        const maks = d3.max(urut, (i) => Math.abs(nilaiNeto(i)));
        const sisi = kecil ? 34 : 40;                       // ruang di kedua ujung untuk angka nilai
        const xs = d3.scaleLinear().domain([-maks, maks]).range([sisi, w - M0.l - M0.r - sisi]);
        const fs = rowH < 10 ? 8 : rowH < 14 ? 9.5 : 10.5;
        const svg = host.append('svg').attr('width', w).attr('height', h)
          .attr('role', 'group').attr('aria-label', 'Migrasi neto per 100 penduduk menurut provinsi, diwarnai persentase penduduk miskin');
        const g = svg.append('g').attr('transform', `translate(${M0.l},${M0.t})`);
        g.append('g').attr('class', 'sumbu').call(d3.axisTop(xs).ticks(kecil ? 4 : 6).tickSize(-rowH * n))
          .call((a) => a.select('.domain').remove());
        g.append('line').attr('class', 'nol').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', 0).attr('y2', rowH * n);
        barG = g.selectAll('g.b').data(urut).join('g').attr('class', 'bar-m').attr('transform', (i, k) => `translate(0,${k * rowH})`)
          .on('click', (e, i) => setFokus(i))
          .on('pointerenter', (e, i) => tipTampil(e, `<strong>${esc(nodes[i].nama)}</strong>
            Neto <b>${f0(st(i).neto)}</b> orang<br>${fSign1(nilaiNeto(i))} per 100 penduduk<br><span class="p">Persentase penduduk miskin ${TP}: ${f1(nodes[i].p0)}%</span>`))
          .on('pointermove', tipGeser).on('pointerleave', tipSembunyi);
        barG.append('rect').attr('class', 'latar').attr('x', -M0.l).attr('width', w).attr('height', rowH).attr('fill', 'transparent');
        barG.append('rect').attr('class', 'isi').attr('y', Math.min(2, rowH * 0.15)).attr('height', rowH - 2 * Math.min(2, rowH * 0.15))
          .attr('x', (i) => Math.min(xs(0), xs(nilaiNeto(i)))).attr('width', (i) => Math.abs(xs(nilaiNeto(i)) - xs(0)))
          .attr('fill', (i) => warnaNode(i)).attr('stroke', 'rgba(0,0,0,.35)').attr('stroke-width', .6);
        barG.append('text').attr('class', 'lab-m').attr('x', -12).attr('y', rowH / 2 + fs * 0.35).attr('text-anchor', 'end')
          .style('font-size', fs + 'px').text((i) => sing(nodes[i].nama));
        barG.append('text').attr('class', 'nilai-m').attr('y', rowH / 2 + fs * 0.35)
          .attr('x', (i) => nilaiNeto(i) >= 0 ? xs(nilaiNeto(i)) + 4 : xs(nilaiNeto(i)) - 4)
          .attr('text-anchor', (i) => nilaiNeto(i) >= 0 ? 'start' : 'end').style('font-size', (fs - 0.5) + 'px')
          .text((i) => fSign1(nilaiNeto(i)));
        svg.append('text').attr('class', 'ujung-sumbu').attr('x', M0.l).attr('y', 10).text('\u2190 lebih banyak keluar');
        svg.append('text').attr('class', 'ujung-sumbu').attr('x', w - M0.r).attr('y', 10).attr('text-anchor', 'end').text('lebih banyak masuk \u2192');
        perbarui();
      }
      function perbarui() {
        if (!barG) return;
        barG.select('.latar').attr('fill', (i) => i === S.fokus ? '#d4e3ef' : 'transparent');
        barG.attr('opacity', (i) => S.fokus < 0 || i === S.fokus ? 1 : 0.55);
      }
      return { gambar, perbarui };
    })();
    function perbaruiNeto() { netoV.perbarui(); }

    /* =========================================================
       4. Diagram alluvial / Sankey
       ========================================================= */
    const PULAU_URUT = [...new Set(nodes.map((s) => s.pulau))];
    const WARNA_PULAU = ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#D55E00', '#CC79A7', '#555555'];
    const p0Urut = nodes.map((s) => s.p0).sort(d3.ascending);
    const batasKel = [d3.quantile(p0Urut, 1 / 3), d3.quantile(p0Urut, 2 / 3)];
    const kelompok = (i) => (nodes[i].p0 < batasKel[0] ? 0 : nodes[i].p0 < batasKel[1] ? 1 : 2);
    const NAMA_KEL = ['Kemiskinan rendah', 'Kemiskinan sedang', 'Kemiskinan tinggi'];
    const WARNA_KEL = [WARNA_P[1], WARNA_P[3], WARNA_P[5]];

    function arusTersaring() {
      const M = mat(), out = [];
      M.forEach((r, i) => r.forEach((v, j) => {
        if (i === j || v <= 0) return;
        if (S.fokus >= 0) {
          const ok = (i === S.fokus && S.arah !== 'masuk') || (j === S.fokus && S.arah !== 'keluar');
          if (!ok) return;
        }
        out.push({ i, j, v });
      }));
      return out;
    }
    function statKel(M, kecuali = -1) {
      let rendah = 0, sama = 0, tinggi = 0;
      M.forEach((r, i) => r.forEach((v, j) => {
        if (i === j || i === kecuali || j === kecuali) return;
        const a = kelompok(i), b = kelompok(j);
        if (b < a) rendah += v; else if (b === a) sama += v; else tinggi += v;
      }));
      const t = rendah + sama + tinggi;
      return { rendah: rendah / t * 100, sama: sama / t * 100, tinggi: tinggi / t * 100, total: t };
    }

    const sankeyV = (() => {
      const host = d3.select('#sankey');
      function ket() {
        const sk = statKel(mat());
        let t = `<strong>${f0(sk.rendah)}%</strong> dari ${f0(sk.total)} perpindahan antarprovinsi (${esc(lab(S.periode))}) menuju provinsi dengan kelompok kemiskinan <em>lebih rendah</em> daripada asalnya, <strong>${f0(sk.sama)}%</strong> ke kelompok yang sama, dan <strong>${f0(sk.tinggi)}%</strong> ke kelompok <em>lebih tinggi</em>.`;
        if (S.level === 'kemiskinan') t += ` Kelompok kemiskinan = sepertiga provinsi menurut persentase penduduk miskin ${TP}: rendah (&lt; ${f1(batasKel[0])}%), sedang, tinggi (&ge; ${f1(batasKel[1])}%).`;
        el('sankey-ket').innerHTML = t;
      }
      function gambar() {
        host.selectAll('*').remove();
        ket();
        if (!d3.sankey) { host.append('p').attr('class', 'kosong-viz').text('Pustaka d3-sankey tidak termuat (periksa koneksi internet).'); return; }
        const w = host.node().clientWidth, kecil = w < 520, level = S.level;
        const flows = arusTersaring();
        if (!flows.length) { host.append('p').attr('class', 'kosong-viz').text('Tidak ada arus untuk penyaring ini.'); return; }

        const daftar = [], idx = new Map(), links = [];
        const tambah = (kunci, label, warna, urut, ref) => {
          if (!idx.has(kunci)) { idx.set(kunci, daftar.length); daftar.push({ kunci, label, warna, urut, ref }); }
          return idx.get(kunci);
        };
        if (level === 'provinsi') {
          flows.sort((a, b) => b.v - a.v).slice(0, S.topN).forEach((f) => {
            const a = tambah('A' + f.i, sing(nodes[f.i].nama), warnaNode(f.i), f.i, f.i);
            const b = tambah('T' + f.j, sing(nodes[f.j].nama), warnaNode(f.j), f.j, f.j);
            links.push({ source: a, target: b, value: f.v, i: f.i, j: f.j });
          });
        } else {
          const gi = level === 'pulau' ? (i) => PULAU_URUT.indexOf(nodes[i].pulau) : kelompok;
          const nama = level === 'pulau' ? (g) => PULAU_URUT[g] : (g) => NAMA_KEL[g];
          const warna = level === 'pulau' ? (g) => WARNA_PULAU[g % 7] : (g) => WARNA_KEL[g];
          const agg = d3.rollup(flows, (v) => d3.sum(v, (d) => d.v), (d) => gi(d.i), (d) => gi(d.j));
          agg.forEach((m, a) => m.forEach((v, b) => {
            const sa = tambah('A' + a, nama(a), warna(a), a, a), sb = tambah('T' + b, nama(b), warna(b), b, b);
            links.push({ source: sa, target: sb, value: v, i: a, j: b });
          }));
        }

        const ml = kecil ? (level === 'provinsi' ? 48 : 70) : (level === 'provinsi' ? 82 : 128);
        const h = Math.max(220, host.node().clientHeight || (level === 'provinsi' ? 560 : 400));
        const sk = d3.sankey().nodeWidth(kecil ? 10 : 14).nodePadding(level === 'provinsi' ? (h < 380 ? 2.5 : 5) : (h < 380 ? 10 : 16))
          .nodeSort((a, b) => a.urut - b.urut).extent([[ml, 26], [w - ml, h - 8]]);
        const gr = sk({ nodes: daftar.map((d) => ({ ...d })), links: links.map((d) => ({ ...d })) });
        const total = d3.sum(gr.links, (l) => l.value);

        const svg = host.append('svg').attr('width', w).attr('height', h)
          .attr('role', 'group').attr('aria-label', 'Diagram Sankey arus migrasi dari provinsi asal ke provinsi tujuan');
        svg.append('text').attr('class', 'judul-sumbu').attr('x', ml).attr('y', 14).text('Asal');
        svg.append('text').attr('class', 'judul-sumbu').attr('x', w - ml).attr('y', 14).attr('text-anchor', 'end').text('Tujuan');

        const warnaLink = (l) => {
          if (level === 'provinsi') return S.fokus < 0 ? C_NETRAL : l.i === S.fokus ? C_KELUAR : l.j === S.fokus ? C_MASUK : C_NETRAL;
          return l.source.warna;
        };
        const op = S.fokus < 0 && level === 'provinsi' ? 0.38 : 0.5;
        svg.append('g').attr('fill', 'none').selectAll('path').data(gr.links).join('path').attr('class', 'sk-link')
          .attr('d', d3.sankeyLinkHorizontal()).attr('stroke', warnaLink)
          .attr('stroke-width', (d) => Math.max(1, d.width)).attr('stroke-opacity', op)
          .on('pointerenter', function (e, d) {
            d3.select(this).attr('stroke-opacity', 0.85);
            tipTampil(e, `<strong>${esc(d.source.label)} \u2192 ${esc(d.target.label)}</strong><b>${f0(d.value)}</b> orang
              <br><span class="p">${f1(d.value / total * 100)}% dari arus yang digambar</span>`);
          })
          .on('pointermove', tipGeser)
          .on('pointerleave', function () { d3.select(this).attr('stroke-opacity', op); tipSembunyi(); });

        const nd = svg.append('g').selectAll('g').data(gr.nodes).join('g').attr('class', 'sk-node');
        nd.append('rect').attr('x', (d) => d.x0).attr('y', (d) => d.y0).attr('width', (d) => d.x1 - d.x0)
          .attr('height', (d) => Math.max(1, d.y1 - d.y0)).attr('fill', (d) => d.warna)
          .attr('stroke', (d) => level === 'provinsi' && d.ref === S.fokus ? '#1a2631' : 'rgba(0,0,0,.4)')
          .attr('stroke-width', (d) => level === 'provinsi' && d.ref === S.fokus ? 2 : 0.6)
          .style('cursor', level === 'provinsi' ? 'pointer' : 'default')
          .on('click', (e, d) => { if (level === 'provinsi') setFokus(d.ref); })
          .on('pointerenter', (e, d) => tipTampil(e, `<strong>${esc(d.label)}</strong>${d.depth === 0 ? 'Keluar' : 'Masuk'} <b>${f0(d.value)}</b> orang<br><span class="p">dalam arus yang digambar</span>`))
          .on('pointermove', tipGeser).on('pointerleave', tipSembunyi);
        const fs = kecil || h < 380 ? 9 : 10.5;
        nd.append('text').attr('class', 'sk-label').style('font-size', fs + 'px')
          .attr('x', (d) => d.depth === 0 ? d.x0 - 6 : d.x1 + 6).attr('y', (d) => (d.y0 + d.y1) / 2)
          .attr('dy', level === 'provinsi' ? '0.35em' : '-0.1em')
          .attr('text-anchor', (d) => d.depth === 0 ? 'end' : 'start')
          .text((d) => d.label)
          .filter(() => level !== 'provinsi').append('tspan').attr('class', 'sk-sub').attr('x', function () { return this.parentNode.getAttribute('x'); }).attr('dy', '1.15em')
          .text((d) => d.value >= 1e6 ? f1(d.value / 1e6) + ' juta' : f0(d.value / 1000) + ' ribu');
      }
      return { gambar };
    })();

    /* ---------- kartu fokus (panel kiri) ---------- */
    function isiKartu() {
      const k = el('m-kartu');
      const fm = el('fokus-mini');
      if (fm) { fm.hidden = S.fokus < 0; if (S.fokus >= 0) fm.textContent = `Fokus: ${nodes[S.fokus].nama} \u2715`; }
      const bungkus = k.closest('.lk-pilihan-wrap');
      if (bungkus) bungkus.hidden = S.fokus < 0;          // tanpa fokus, panel kiri cukup berisi teks langkah
      if (S.fokus < 0) { k.innerHTML = ''; return; }
      const s = nodes[S.fokus], v = st(S.fokus), M = mat();
      const dari = nodes.map((x, i) => ({ i, v: M[i][S.fokus] })).filter((d) => d.i !== S.fokus).sort((a, b) => b.v - a.v).slice(0, 3);
      const ke = nodes.map((x, i) => ({ i, v: M[S.fokus][i] })).filter((d) => d.i !== S.fokus).sort((a, b) => b.v - a.v).slice(0, 3);
      const baris = (arr) => arr.map((d) => `<li><span>${esc(sing(nodes[d.i].nama))}</span><b>${f0(d.v)}</b></li>`).join('');
      k.style.borderLeftColor = warnaNode(S.fokus);
      let pas = '';
      if (S.pasangan) {
        const [a, b] = S.pasangan;
        pas = `<p class="pasang">${esc(nodes[a].nama)} \u2192 ${esc(nodes[b].nama)}: <b>${f0(M[a][b])}</b>; sebaliknya <b>${f0(M[b][a])}</b>.</p>`;
      }
      k.innerHTML = `<h3>${esc(s.nama)}</h3><p class="prov">${esc(s.pulau)}, penduduk miskin ${f1(s.p0)}%</p>
        <p class="besar2"><b>${fSign1(v.neto_per100)}</b> neto per 100 penduduk</p>
        <dl><dt>Masuk</dt><dd>${f0(v.masuk)}</dd><dt>Keluar</dt><dd>${f0(v.keluar)}</dd><dt>Neto</dt><dd>${f0(v.neto)}</dd></dl>
        ${pas}
        <div class="dua-kolom"><div><h4>Pendatang dari</h4><ol class="daftar-arus">${baris(dari)}</ol></div>
        <div><h4>Perantau ke</h4><ol class="daftar-arus">${baris(ke)}</ol></div></div>`;
    }

    /* =========================================================
       Isi tiap langkah (dihitung dari data)
       ========================================================= */
    const iDKI = Math.max(0, nodes.findIndex((s) => s.kode === '31'));
    const urutNeto = (p) => d3.range(n).sort((a, b) => nilaiPer(p, b) - nilaiPer(p, a));
    const nmN = (p, i) => `${esc(sing(nodes[i].nama))} (${fSign1(nilaiPer(p, i))})`;
    const sebelum = per[0], sesudah = per[1] || per[0];

    const daftarUl = (arr) => `<ul class="rapi">${arr.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    const SP2020 = '<abbr title="Sensus Penduduk 2020">SP2020</abbr>';

    function isiLangkah1() {
      const p = sebelum, M = D.periode[p].matriks, pas = [];
      M.forEach((r, i) => r.forEach((v, j) => { if (i !== j) pas.push({ i, j, v }); }));
      pas.sort((a, b) => b.v - a.v);
      return `<p>Setiap busur adalah satu provinsi, diwarnai menurut persentase penduduk miskin ${TP}. Pita menghubungkan provinsi asal dan tujuan.</p>
        ${daftarUl(['<strong>Makin lebar pita</strong>, makin banyak orang.', '<strong>Ujung runcing</strong> menunjuk provinsi tujuan.'])}
        <p>Periode ${esc(lab(p))}: <strong>${f0(D.periode[p].total_arus)}</strong> perpindahan antarprovinsi. Pindah di dalam provinsi tidak digambar.</p>
        <p>Lima arus terbesar:</p>
        ${daftarUl(pas.slice(0, 5).map((q) => `${esc(sing(nodes[q.i].nama))} \u2192 ${esc(sing(nodes[q.j].nama))} (${f0(q.v)})`))}`;
    }
    function isiLangkah2() {
      const s = nodes[iDKI];
      const baris = per.map((p) => { const v = s[p]; return `<strong>${esc(D.periode[p].label)}</strong><br>masuk ${f0(v.masuk)}, keluar ${f0(v.keluar)}, neto ${f0(v.neto)} (${fSign1(v.neto_per100)} per 100 penduduk)`; });
      const beda = per.length > 1 && Math.sign(s[per[0]].neto) !== Math.sign(s[per[1]].neto);
      return `<p>Fokus pada <strong>${esc(s.nama)}</strong>. Pita <span class="k-biru">biru</span> adalah orang yang keluar darinya, pita <span class="k-jingga">jingga</span> yang masuk.</p>
        ${daftarUl(baris)}
        ${beda ? `<p class="inti">Tanda migrasi netonya berbeda antar periode.</p>
        <p>Migrasi seumur hidup merekam arus yang menumpuk sejak lahir. Migrasi risen hanya merekam lima tahun menjelang ${SP2020}, termasuk masa pandemi. Keduanya tidak saling menggantikan.</p>` : ''}`;
    }
    function isiLangkah3() {
      const p = sebelum, u = urutNeto(p);
      return `<p>Migrasi <abbr title="Pendatang dikurangi perantau">neto</abbr> dibagi jumlah penduduk, periode ${esc(lab(p))}. Warna batang adalah persentase penduduk miskin ${TP}.</p>
        <p><strong>Penerima terbesar</strong></p>
        ${daftarUl(u.slice(0, 3).map((i) => nmN(p, i)))}
        <p><strong>Paling banyak kehilangan penduduk</strong></p>
        ${daftarUl(u.slice(-3).reverse().map((i) => nmN(p, i)))}`;
    }
    function isiLangkah4() {
      const p = sesudah, u = urutNeto(p);
      const beda = d3.range(n).filter((i) => Math.sign(nilaiPer(per[0], i)) !== Math.sign(nilaiPer(p, i)) && Math.abs(nilaiPer(per[0], i)) >= 1 && Math.abs(nilaiPer(p, i)) >= 1);
      return `<p>Periode berganti ke <strong>${esc(lab(p))}</strong>: provinsi tempat lahir dibandingkan dengan tempat tinggal sekarang.</p>
        <p><strong>Penerima terbesar</strong></p>
        ${daftarUl(u.slice(0, 3).map((i) => nmN(p, i)))}
        <p><strong>Paling banyak kehilangan penduduk</strong></p>
        ${daftarUl(u.slice(-3).reverse().map((i) => nmN(p, i)))}
        ${per.length > 1 ? (beda.length
          ? `<p><strong>Berganti tanda antar periode</strong></p>${daftarUl(beda.map((i) => `${esc(sing(nodes[i].nama))} (${fSign1(nilaiPer(per[0], i))} lalu ${fSign1(nilaiPer(p, i))})`))}
             <p class="inti">Migrasi seumur hidup menyimpan jejak arus lama, misalnya transmigrasi, yang tidak muncul pada lima tahun terakhir.</p>`
          : '<p>Tidak ada provinsi yang berganti tanda antar periode.</p>') : ''}`;
    }
    function isiLangkah5() {
      const sg = per.map((p) => statKel(D.periode[p].matriks));
      const sgTanpa = per.map((p) => statKel(D.periode[p].matriks, iDKI));
      const rho = per.map((p) => pearson(peringkat(nodes.map((s, i) => nilaiPer(p, i))), peringkat(nodes.map((s) => s.p0))));
      const rk = rKritis(n);
      const kata = (r) => Math.abs(r) < 0.2 ? 'sangat lemah' : Math.abs(r) < 0.4 ? 'lemah' : Math.abs(r) < 0.6 ? 'sedang' : 'kuat';
      const sama = per.length > 1 && kata(rho[0]) === kata(rho[1]);
      const lemah = rho.every((r) => Math.abs(r) < rk);
      const berlawanan = per.length > 1 && Math.sign(rho[0]) !== Math.sign(rho[1]);
      const rhoTxt = per.map((p, k) => `\u03c1 = ${f2(rho[k])} (${esc(lab(p))})`).join(' dan ');
      const stabil = KS ? `<p class="catatan">Pemeriksaan: urutan ${KS.jumlah_provinsi} provinsi menurut persentase penduduk miskin ${TP} dan 2025 berkorelasi \u03c1 = ${f2(KS.rho_2020_2025)}, dan ${KS.pindah_kelompok_2020_2025} provinsi berpindah kelompok.</p>` : '';
      return `<p>Provinsi dibagi tiga kelompok sama besar menurut persentase penduduk miskin ${TP}. Pita menunjukkan perpindahan antarkelompok.</p>
        <p><strong>Arah perpindahan</strong></p>
        ${daftarUl(per.map((p, k) => `<strong>${esc(D.periode[p].label)}</strong><br>${f0(sg[k].rendah)}% ke kelompok lebih rendah, ${f0(sg[k].sama)}% sama, ${f0(sg[k].tinggi)}% lebih tinggi`))}
        <p>Tanpa arus dari dan ke ${esc(nodes[iDKI].nama)}: ${per.map((p, k) => `${esc(lab(p))} ${f0(sgTanpa[k].rendah)}% ke kelompok lebih rendah dan ${f0(sgTanpa[k].tinggi)}% lebih tinggi`).join(', ')}.</p>
        <p>Korelasi peringkat (<abbr title="Korelasi Spearman: mengukur apakah dua urutan sejalan">Spearman</abbr>) antara migrasi neto dan persentase penduduk miskin: ${rhoTxt}, ${sama ? 'keduanya ' + kata(rho[0]) : per.map((p, k) => kata(rho[k])).join(' dan ')}. ${berlawanan ? 'Arahnya berlawanan antar periode. ' : ''}Dengan ${n} provinsi, korelasi baru bermakna secara statistik bila melebihi sekitar ${f2(rk)}${lemah ? ', sehingga belum ada yang bermakna' : ''}.</p>
        ${stabil}
        <p class="inti">Ini hubungan statistik, bukan sebab-akibat. Persentase penduduk miskin diukur pada ${TP}, sezaman dengan sensus. Migrasi seumur hidup merekam arus yang jauh lebih lama.</p>`;
    }
    function isiLangkah6() {
      const p = sebelum;
      const masuk = d3.range(n).sort((a, b) => nodes[b][p].masuk - nodes[a][p].masuk).slice(0, 3);
      return `<p>Setiap sel adalah arus dari provinsi di baris ke provinsi di kolom. Warna lebih pekat berarti lebih banyak orang. Garis tebal memisahkan kelompok pulau.</p>
        <p><strong>Tujuan dengan pendatang terbanyak</strong> (${esc(lab(p))})</p>
        ${daftarUl(masuk.map((i) => `${esc(sing(nodes[i].nama))} (${f0(nodes[i][p].masuk)})`))}
        <p>Kolom yang pekat menandai tujuan favorit. Baris yang pekat menandai provinsi pengirim.</p>
        <p class="coba"><strong>Jelajahi sendiri:</strong> klik sel untuk melihat arus dua arah, atau klik nama baris dan kolom untuk memfokuskan provinsi. Arah dan jumlah arus diatur di Pengaturan lanjutan.</p>`;
    }

    const LANGKAH = [
      { view: 'chord', judul: 'Seberapa besar arusnya?', terapkan: { periode: per[0], fokus: -1, arah: 'keduanya' }, isi: isiLangkah1 },
      { view: 'chord', judul: 'Jakarta: keluar atau masuk?', terapkan: { periode: per[0], fokus: iDKI, arah: 'keduanya' }, isi: isiLangkah2 },
      { view: 'neto', judul: 'Siapa penerima, siapa pengirim?', terapkan: { periode: per[0], fokus: -1 }, isi: isiLangkah3 },
      { view: 'neto', judul: 'Lima tahun versus seumur hidup', terapkan: { periode: sesudah, fokus: -1 }, isi: isiLangkah4 },
      { view: 'sankey', judul: 'Dari yang miskin ke yang sejahtera?', terapkan: { periode: per[0], fokus: -1, level: 'kemiskinan' }, isi: isiLangkah5 },
      { view: 'matriks', judul: 'Rincian asal dan tujuan', terapkan: { periode: per[0], fokus: -1, arah: 'keduanya' }, isi: isiLangkah6 }
    ];
    const NAMA_VIEW = { chord: 'Chord', neto: 'Neto', sankey: 'Sankey', matriks: 'Matriks' };   // urut sesuai langkah cerita

    function tampilkanView(v) {
      document.querySelectorAll('#bab3 .viz-item').forEach((f) => {
        const on = f.dataset.view === v;
        f.classList.toggle('aktif', on);
        f.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      d3.selectAll('#b3-tabs button').attr('aria-selected', function () { return this.dataset.view === v ? 'true' : 'false'; });
    }
    const panggung = K.buatPanggung({
      scope: 'b3', langkah: LANGKAH,
      onAktif: (i, L) => { tampilkanView(L.view); terapkan(L.terapkan); }
    });
    d3.select('#b3-tabs').selectAll('button').data(Object.keys(NAMA_VIEW)).join('button').attr('type', 'button').attr('role', 'tab')
      .attr('data-view', (d) => d).text((d) => NAMA_VIEW[d])
      .on('click', (e, d) => panggung.keLangkah(LANGKAH.findIndex((l) => l.view === d)));

    /* ---------- legenda ---------- */
    el('m-leg-p0').innerHTML = WARNA_P.map((w, i) => {
      const b = skalaP.domain();
      const lb = i === 0 ? `&lt; ${f1(b[0])}` : i === 5 ? `&ge; ${f1(b[4])}` : `${f1(b[i - 1])}&ndash;${f1(b[i])}`;
      return `<div><i style="background:${w}"></i><span>${lb}</span></div>`;
    }).join('');
    el('m-skala').style.background = `linear-gradient(90deg, ${d3.range(0, 1.01, 0.1).map((t) => d3.interpolateBlues(Math.sqrt(t))).join(',')})`;
    const statB3 = el('stat-b3');
    if (statB3) statB3.textContent = f1(D.periode[per[0]].total_arus / 1e6);

    /* ---------- gambar ---------- */
    function gambarSemua() {
      chordV.gambar(); matV.gambar(); netoV.gambar(); sankeyV.gambar(); isiKartu();
    }
    el('m-ket').textContent = D.periode[S.periode].keterangan;
    gambarSemua();
    d3.selectAll('input[name="m-arah"]').property('disabled', true);
    panggung.aktifkan(0);

    const uk = { w: el('b3-panggung').clientWidth, h: el('b3-panggung').clientHeight };
    let tunda;
    new ResizeObserver(() => {
      const w = el('b3-panggung').clientWidth, h = el('b3-panggung').clientHeight;
      if (Math.abs(w - uk.w) > 1 || Math.abs(h - uk.h) > 40) {
        uk.w = w; uk.h = h;
        clearTimeout(tunda); tunda = setTimeout(gambarSemua, 150);
      }
    }).observe(el('b3-panggung'));
  }
})();