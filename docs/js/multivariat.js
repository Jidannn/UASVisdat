/* Bab 2 — mengapa provinsi berbeda? (multivariat, 38 provinsi, 8 variabel)
   Tata letak scrollytelling: panel interpretasi di kiri, grafik di kanan.
   Saat halaman di-scroll, panggung tetap di tempat; teks dan grafik berganti
   per langkah. Pilihan provinsi (brushing) terbawa antar-grafik.
   Teknik: PCA (+ biplot), parallel coordinates, heatmap terklaster.
   Data dihitung di scripts/05_pca.py -> data/provinsi_pca.json */
(() => {
  'use strict';

  if (window.Kisah) window.Kisah.modul.multivariat = 9;
  const LOC = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3] });
  const f0 = LOC.format(',.0f'), f1 = LOC.format(',.1f'), f2 = LOC.format(',.2f');
  const WK = ['#0072B2', '#009E73', '#E69F00', '#CC79A7'];             // Okabe-Ito
  const BTK = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle];
  const SING = { p0: 'Miskin (%)', p1: 'P1', jml: 'Jml miskin', uhh: 'UHH', hls: 'HLS', rls: 'RLS', pengeluaran: 'Pengeluaran', ipm: 'IPM' };
  const PANJANG = {
    p0: 'persentase penduduk miskin', p1: 'kedalaman kemiskinan (P1)', jml: 'jumlah penduduk miskin',
    uhh: 'umur harapan hidup', hls: 'harapan lama sekolah', rls: 'rata-rata lama sekolah',
    pengeluaran: 'pengeluaran per kapita', ipm: 'IPM'
  };
  const SATUAN = { p0: '%', p1: '', jml: 'ribu jiwa', uhh: 'tahun', hls: 'tahun', rls: 'tahun', pengeluaran: 'ribu Rp/orang/tahun', ipm: '' };
  const FMT = { p0: f2, p1: f2, jml: f1, uhh: f2, hls: f2, rls: f2, pengeluaran: f0, ipm: f2 };
  const KASAR = matchMedia('(pointer: coarse)').matches;
  const GERAK = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pulauDariPk(pk) {
    if (pk.startsWith('papua')) return 'Papua';
    if (pk.startsWith('kalimantan')) return 'Kalimantan';
    if (pk.startsWith('sulawesi') || pk === 'gorontalo') return 'Sulawesi';
    if (pk.startsWith('maluku')) return 'Maluku';
    if (pk.startsWith('nusa tenggara') || pk === 'bali') return 'Bali & Nusa Tenggara';
    if (['dki jakarta', 'jawa barat', 'jawa tengah', 'jawa timur', 'banten', 'di yogyakarta'].includes(pk)) return 'Jawa';
    return 'Sumatera';
  }
  const daftarDan = (arr) => arr.length < 2 ? arr.join('')
    : arr.length === 2 ? arr.join(' dan ') : arr.slice(0, -1).join(', ') + ', dan ' + arr[arr.length - 1];

  (window.Kisah ? window.Kisah.json : d3.json)('data/provinsi_pca.json')
    .then((pca) => mulai(pca))
    .catch((e) => {
      el('bab2-galat').hidden = false;
      el('bab2-galat').textContent = `Bab 2 tidak dapat ditampilkan: ${e.message}. Pastikan docs/data/provinsi_pca.json ada (hasil scripts/05_pca.py) dan halaman dibuka lewat server lokal.`;
    });

  function mulai(pca) {
    const P = pca.provinsi;
    const byPk = new Map(P.map((p) => [p.pk, p]));
    const V = pca.variabel, kode = V.map((v) => v.kode);
    const kolom = pca.urutan_kolom;
    const baris = pca.urutan_baris.map((pk) => byPk.get(pk));
    const KL = pca.klaster, nK = KL.length;
    const lam = pca.pca.nilai_eigen, vp = pca.pca.varians_pct, kor = pca.pca.korelasi;
    const S = { sel: new Set(), sumber: null, hover: null };
    const views = {};

    el('petunjuk-bab2').textContent = KASAR
      ? 'Gulir untuk berpindah langkah. Ketuk titik atau baris untuk memilih provinsi.'
      : 'Gulir untuk berpindah langkah. Seret pada grafik atau klik titik dan baris untuk memilih provinsi.';

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
    const htmlProv = (p) => `<strong>${esc(p.provinsi)}</strong><span class="p">Klaster ${p.klaster + 1}${p.pencilan ? ', pencilan' : ''}</span>
      Persentase penduduk miskin <b>${f2(p.p0)}%</b><br>IPM <b>${f2(p.ipm)}</b>, UHH <b>${f1(p.uhh)}</b> th<br>Jumlah penduduk miskin <b>${f1(p.jml)} ribu</b>`;

    /* ---------- seleksi bersama ---------- */
    function setSel(set, sumber) {
      S.sel = set; S.sumber = sumber;
      if (sumber !== 'sebar') views.sebar.hapusBrush();
      if (sumber !== 'paralel') views.paralel.hapusBrush();
      perbarui();
    }
    function toggle(pk) {
      const n = new Set(S.sel);
      if (n.has(pk)) n.delete(pk); else n.add(pk);
      setSel(n, 'klik');
    }
    function hover(pk) {
      S.hover = pk;
      Object.values(views).forEach((v) => v.hover && v.hover(pk));
    }
    function perbarui() {
      Object.values(views).forEach((v) => v.update());
      ringkas();
      d3.selectAll('#legenda-klaster button').attr('aria-pressed', (d, i) => {
        const anggota = P.filter((p) => p.klaster === i).map((p) => p.pk);
        return anggota.length && anggota.length === S.sel.size && anggota.every((a) => S.sel.has(a)) ? 'true' : 'false';
      });
    }
    const adaSel = () => S.sel.size > 0;
    const redupOp = (pk) => (!adaSel() || S.sel.has(pk)) ? 1 : 0.2;

    /* ---------- legenda klaster ---------- */
    const simbol = (i, ukuran = 90) => d3.symbol().type(BTK[i % 4]).size(ukuran)();
    d3.select('#legenda-klaster').selectAll('button').data(KL).join('button')
      .attr('type', 'button').attr('aria-pressed', 'false')
      .attr('title', (k, i) => `Klaster ${i + 1}: ${k.n} provinsi, IPM rata-rata ${f1(k.rata.ipm)}, persentase penduduk miskin ${f1(k.rata.p0)}%`)
      .html((k, i) => `<svg width="16" height="16" aria-hidden="true"><path d="${simbol(i, 100)}" transform="translate(8,8)" fill="${WK[i % 4]}"/></svg>
        <span>K${i + 1}<small> ${k.n} prov.</small></span>`)
      .on('click', (e, k) => {
        const anggota = new Set(P.filter((p) => p.klaster === k.id).map((p) => p.pk));
        const sama = anggota.size === S.sel.size && [...anggota].every((a) => S.sel.has(a));
        setSel(sama ? new Set() : anggota, 'klik');
      });
    el('lk-hapus').addEventListener('click', () => setSel(new Set(), 'klik'));
    if (el('hapus-mini')) el('hapus-mini').addEventListener('click', () => setSel(new Set(), 'klik'));

    /* =========================================================
       1. Bidang sebar PCA + biplot
       ========================================================= */
    views.sebar = (() => {
      const host = d3.select('#sebar');
      const M = { t: 10, r: 14, b: 46, l: 50 };
      let x, y, iw, ih, gBrush, brush, titik, labelG, panahG, elips;
      let tampilPanah = false, tampilBatas = true;

      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth;
        const h = Math.max(260, host.node().clientHeight || Math.round(w * 0.8));
        iw = w - M.l - M.r; ih = h - M.t - M.b;
        const svg = host.append('svg').attr('width', w).attr('height', h)
          .attr('role', 'group').attr('aria-label', 'Bidang sebar dua komponen utama, satu titik per provinsi');
        svg.append('defs').append('marker').attr('id', 'ujung').attr('viewBox', '0 0 8 8').attr('refX', 7).attr('refY', 4)
          .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
          .append('path').attr('d', 'M0,0L8,4L0,8Z').attr('fill', '#46566a');
        const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
        const ex = d3.extent(P, (d) => d.pc1), ey = d3.extent(P, (d) => d.pc2);
        const px = (ex[1] - ex[0]) * 0.1, py = (ey[1] - ey[0]) * 0.12;
        x = d3.scaleLinear().domain([ex[0] - px, ex[1] + px]).range([0, iw]);
        y = d3.scaleLinear().domain([ey[0] - py, ey[1] + py]).range([ih, 0]);
        g.append('g').attr('class', 'sumbu').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickSize(-ih));
        g.append('g').attr('class', 'sumbu').call(d3.axisLeft(y).ticks(6).tickSize(-iw));
        g.selectAll('.sumbu .domain').remove();
        g.append('line').attr('class', 'nol').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih);
        g.append('line').attr('class', 'nol').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0));

        elips = g.append('ellipse').attr('class', 'batas-pencilan').attr('cx', x(0)).attr('cy', y(0))
          .attr('rx', Math.abs(x(2.45 * Math.sqrt(lam[0])) - x(0))).attr('ry', Math.abs(y(2.45 * Math.sqrt(lam[1])) - y(0)))
          .style('opacity', tampilBatas ? 1 : 0);

        svg.append('text').attr('class', 'judul-sumbu').attr('x', M.l + iw / 2).attr('y', h - 8).attr('text-anchor', 'middle')
          .text(`PC1 (${f1(vp[0])}% variasi): pembangunan manusia`);
        svg.append('text').attr('class', 'ujung-sumbu').attr('x', M.l).attr('y', h - 22).text('\u2190 rendah');
        svg.append('text').attr('class', 'ujung-sumbu').attr('x', M.l + iw).attr('y', h - 22).attr('text-anchor', 'end').text('tinggi \u2192');
        const pc2Kunci = kode.slice().sort((a, b) => Math.abs(kor[b][1]) - Math.abs(kor[a][1]))[0];
        svg.append('text').attr('class', 'judul-sumbu').attr('transform', `translate(14,${M.t + ih / 2}) rotate(-90)`).attr('text-anchor', 'middle')
          .text(`PC2 (${f1(vp[1])}%): ${pc2Kunci === 'jml' ? 'jumlah penduduk miskin' : 'komponen kedua'}`);

        brush = d3.brush().extent([[0, 0], [iw, ih]]).touchable(() => false)
          .on('start brush end', (e) => {
            if (!e.sourceEvent) return;
            const s = e.selection;
            if (!s) { setSel(new Set(), 'sebar'); return; }
            const [[x0, y0], [x1, y1]] = s;
            setSel(new Set(P.filter((d) => {
              const a = x(d.pc1), b = y(d.pc2);
              return a >= x0 && a <= x1 && b >= y0 && b <= y1;
            }).map((d) => d.pk)), 'sebar');
          });
        gBrush = g.append('g').attr('class', 'brush').call(brush);

        const maxS = Math.min(d3.max(P, (d) => Math.abs(d.pc1)), d3.max(P, (d) => Math.abs(d.pc2)));
        const sc = 0.85 * maxS;
        panahG = g.append('g').attr('class', 'panah').style('opacity', tampilPanah ? 1 : 0);
        const pk = kode.map((k) => ({ k, ex: x(kor[k][0] * sc), ey: y(kor[k][1] * sc) }));
        pk.forEach((o) => { o.kanan = o.ex >= x(0); o.ty = o.ey + 4; });
        [true, false].forEach((sisi) => {          // geser label yang berimpit (min. 11 px)
          const grp = pk.filter((o) => o.kanan === sisi).sort((a, b) => a.ty - b.ty);
          for (let i = 1; i < grp.length; i++) if (grp[i].ty < grp[i - 1].ty + 11) grp[i].ty = grp[i - 1].ty + 11;
        });
        pk.forEach((o) => {
          panahG.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', o.ex).attr('y2', o.ey).attr('marker-end', 'url(#ujung)');
          panahG.append('text').attr('x', o.ex + (o.kanan ? 5 : -5)).attr('y', o.ty)
            .attr('text-anchor', o.kanan ? 'start' : 'end').text(SING[o.k]);
        });

        titik = g.append('g').selectAll('path.titik').data(P).join('path').attr('class', 'titik')
          .attr('d', (d) => simbol(d.klaster, 130)).attr('fill', (d) => WK[d.klaster % 4])
          .attr('transform', (d) => `translate(${x(d.pc1)},${y(d.pc2)})`)
          .attr('tabindex', 0).attr('role', 'button')
          .attr('aria-label', (d) => `${d.provinsi}, klaster ${d.klaster + 1}`)
          .on('pointerenter', (e, d) => { hover(d.pk); tipTampil(e, htmlProv(d)); })
          .on('pointermove', tipGeser)
          .on('pointerleave', () => { hover(null); tipSembunyi(); })
          .on('click', (e, d) => { e.stopPropagation(); toggle(d.pk); })
          .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(d.pk); } });
        labelG = g.append('g').attr('class', 'label-titik');
        update();
      }

      function update() {
        if (!titik) return;
        titik.attr('opacity', (d) => redupOp(d.pk))
          .attr('stroke', (d) => S.sel.has(d.pk) ? '#1a2631' : '#fff').attr('stroke-width', (d) => S.sel.has(d.pk) ? 2.2 : 1);
        const tampil = P.filter((d) => d.pencilan || (S.sel.has(d.pk) && S.sel.size <= 8));
        labelG.selectAll('text').data(tampil, (d) => d.pk).join('text')
          .attr('x', (d) => x(d.pc1) + (x(d.pc1) > iw * 0.6 ? -10 : 10)).attr('y', (d) => y(d.pc2) + 4)
          .attr('text-anchor', (d) => x(d.pc1) > iw * 0.6 ? 'end' : 'start').text((d) => d.provinsi);
      }
      function hoverFn(pk) {
        if (!titik) return;
        titik.attr('d', (d) => simbol(d.klaster, d.pk === pk ? 260 : 130));
      }
      function hapusBrush() { if (gBrush) gBrush.call(brush.move, null); }
      function setPanah(v) { tampilPanah = v; if (panahG) panahG.style('opacity', v ? 1 : 0); }
      function setBatas(v) { tampilBatas = v; if (elips) elips.style('opacity', v ? 1 : 0); }
      return { gambar, update, hover: hoverFn, hapusBrush, setPanah, setBatas, host };
    })();

    /* =========================================================
       2. Parallel coordinates
       ========================================================= */
    views.paralel = (() => {
      const host = d3.select('#paralel');
      let M = { t: 50, r: 22, b: 14, l: 34 };
      let xs, ys, garis, hit, gAxis, brushes, rentang = new Map(), ih;

      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth, sempit = w < 520;
        M = sempit ? { t: 84, r: 26, b: 14, l: 30 } : { t: 50, r: 22, b: 14, l: 34 };
        const h = Math.max(280, host.node().clientHeight || 400);
        const iw = w - M.l - M.r; ih = h - M.t - M.b;
        const svg = host.append('svg').attr('width', w).attr('height', h)
          .attr('role', 'group').attr('aria-label', 'Parallel coordinates: satu garis per provinsi melintasi delapan variabel');
        const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
        xs = d3.scalePoint().domain(kolom).range([0, iw]);
        ys = {};
        kolom.forEach((k) => {
          const e = d3.extent(P, (d) => d[k]);
          const log = V.find((v) => v.kode === k).log;
          ys[k] = (log ? d3.scaleLog().domain([e[0] * 0.9, e[1] * 1.1])
            : d3.scaleLinear().domain([e[0] - (e[1] - e[0]) * 0.05, e[1] + (e[1] - e[0]) * 0.05])).range([ih, 0]).nice();
        });
        const line = d3.line();
        const lintasan = (d) => line(kolom.map((k) => [xs(k), ys[k](d[k])]));
        garis = g.append('g').selectAll('path.gp').data(P).join('path').attr('class', 'gp')
          .attr('d', lintasan).attr('stroke', (d) => WK[d.klaster % 4]);
        hit = g.append('g').selectAll('path.hit').data(P).join('path').attr('class', 'hit').attr('d', lintasan)
          .on('pointerenter', (e, d) => { hover(d.pk); tipTampil(e, htmlProv(d)); })
          .on('pointermove', tipGeser)
          .on('pointerleave', () => { hover(null); tipSembunyi(); })
          .on('click', (e, d) => toggle(d.pk));

        gAxis = g.selectAll('g.sb').data(kolom).join('g').attr('class', 'sb').attr('transform', (k) => `translate(${xs(k)},0)`);
        const tf = (k) => k === 'pengeluaran' ? (d) => (d / 1000) + 'k' : k === 'jml' ? (d) => f0(d) : null;
        gAxis.each(function (k) {
          d3.select(this).call(d3.axisLeft(ys[k]).ticks(k === 'jml' ? 3 : 4).tickFormat(tf(k)));
        });
        const satuanSb = (k) => V.find((v) => v.kode === k).log ? 'skala log' : (SATUAN[k] === 'ribu Rp/orang/tahun' ? 'ribu Rp' : SATUAN[k]);
        if (sempit) {
          gAxis.append('text').attr('class', 'judul-sb').attr('transform', 'translate(0,-10) rotate(-50)')
            .attr('text-anchor', 'start').text((k) => SING[k]);
        } else {
          gAxis.append('text').attr('class', 'judul-sb').attr('y', -22).attr('text-anchor', 'middle').text((k) => SING[k]);
          gAxis.append('text').attr('class', 'satuan-sb').attr('y', -10).attr('text-anchor', 'middle').text(satuanSb);
        }
        brushes = new Map();
        gAxis.each(function (k) {
          const b = d3.brushY().extent([[-9, 0], [9, ih]]).touchable(() => false)
            .on('start brush end', (e) => {
              if (!e.sourceEvent) return;
              if (e.selection) rentang.set(k, [ys[k].invert(e.selection[1]), ys[k].invert(e.selection[0])]);
              else rentang.delete(k);
              const set = rentang.size
                ? new Set(P.filter((d) => [...rentang].every(([kk, [lo, hi]]) => d[kk] >= lo && d[kk] <= hi)).map((d) => d.pk))
                : new Set();
              setSel(set, 'paralel');
            });
          brushes.set(k, b);
          d3.select(this).append('g').attr('class', 'brush').call(b);
        });
        update();
      }

      function update() {
        if (!garis) return;
        const ada = adaSel();
        garis.attr('stroke-opacity', (d) => !ada ? 0.55 : S.sel.has(d.pk) ? 0.95 : 0.08)
          .attr('stroke-width', (d) => ada && S.sel.has(d.pk) ? 2.6 : 1.4);
        garis.filter((d) => S.sel.has(d.pk)).raise();
      }
      function hoverFn(pk) {
        if (!garis) return;
        garis.classed('sorot', (d) => d.pk === pk);
        garis.filter((d) => d.pk === pk).raise();
      }
      function hapusBrush() {
        rentang = new Map();
        if (gAxis) gAxis.each(function (k) { d3.select(this).select('.brush').call(brushes.get(k).move, null); });
      }
      return { gambar, update, hover: hoverFn, hapusBrush, host };
    })();

    /* =========================================================
       3. Heatmap terklaster
       ========================================================= */
    views.heat = (() => {
      const host = d3.select('#heat');
      let rows;
      const warnaZ = d3.scaleSequential(d3.interpolatePRGn).domain([-2, 2]).clamp(true);

      function gambar() {
        host.selectAll('svg').remove();
        const w = host.node().clientWidth, hH = host.node().clientHeight || 620;
        const labelW = w < 520 ? 112 : 150;
        const M = { t: 72, r: 8, b: 6, l: labelW };
        const rowH = Math.max(10, Math.min(18, (hH - M.t - M.b) / baris.length));
        const iw = w - M.l - M.r, ih = baris.length * rowH;
        const colW = iw / kolom.length;
        const svg = host.append('svg').attr('width', w).attr('height', M.t + ih + M.b)
          .attr('role', 'group').attr('aria-label', 'Heatmap skor-z: provinsi diurutkan menurut dendrogram, kolom menurut kemiripan variabel');
        const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
        const xc = (k) => kolom.indexOf(k) * colW;

        g.selectAll('text.kol').data(kolom).join('text').attr('class', 'kol-heat')
          .attr('transform', (k) => `translate(${xc(k) + colW / 2},-8) rotate(-50)`).text((k) => SING[k]);

        rows = g.selectAll('g.baris').data(baris).join('g').attr('class', 'baris')
          .attr('transform', (d, i) => `translate(0,${i * rowH})`)
          .on('pointerenter', (e, d) => { hover(d.pk); })
          .on('pointerleave', () => { hover(null); tipSembunyi(); })
          .on('click', (e, d) => toggle(d.pk));
        rows.append('rect').attr('class', 'latar').attr('x', -M.l + 2).attr('width', w - 4).attr('height', rowH);
        rows.append('path').attr('d', (d) => simbol(d.klaster, rowH < 13 ? 40 : 60)).attr('fill', (d) => WK[d.klaster % 4])
          .attr('transform', `translate(${-M.l + 10},${rowH / 2})`);
        rows.append('text').attr('class', 'nama-baris').attr('x', -6).attr('y', rowH / 2 + 3.5).attr('text-anchor', 'end')
          .style('font-size', rowH < 13 ? '9.5px' : '11px').text((d) => d.provinsi);
        rows.selectAll('rect.sel-h').data((d) => kolom.map((k) => ({ p: d, k }))).join('rect').attr('class', 'sel-h')
          .attr('x', (c) => xc(c.k) + 0.5).attr('y', 0.5).attr('width', colW - 1).attr('height', rowH - 1)
          .attr('fill', (c) => warnaZ(c.p.z[c.k]))
          .on('pointerenter', (e, c) => tipTampil(e, `<strong>${esc(c.p.provinsi)}</strong>
            <span class="p">${esc(V.find((v) => v.kode === c.k).label)}</span>${FMT[c.k](c.p[c.k])} ${SATUAN[c.k]}<br>skor-z <b>${f2(c.p.z[c.k])}</b>`))
          .on('pointermove', tipGeser);
        baris.forEach((d, i) => {
          if (i > 0 && d.klaster !== baris[i - 1].klaster) {
            g.append('line').attr('class', 'pemisah').attr('x1', -M.l + 2).attr('x2', iw).attr('y1', i * rowH).attr('y2', i * rowH);
          }
        });
        update();
      }
      function update() {
        if (!rows) return;
        rows.attr('opacity', (d) => adaSel() && !S.sel.has(d.pk) ? 0.45 : 1).classed('dipilih', (d) => S.sel.has(d.pk));
      }
      function hoverFn(pk) { if (rows) rows.classed('sorot', (d) => d.pk === pk); }
      return { gambar, update, hover: hoverFn, hapusBrush() {}, host };
    })();

    /* ---------- ringkasan pilihan (panel kiri) ---------- */
    function ringkas() {
      const hm = el('hapus-mini');
      if (hm) hm.hidden = !adaSel();
      const k = el('lk-pilihan');
      if (!adaSel()) {
        k.innerHTML = '<p class="kosong">Belum ada provinsi dipilih.</p>';
        el('lk-hapus').hidden = true;
        return;
      }
      el('lk-hapus').hidden = false;
      const dipilih = P.filter((p) => S.sel.has(p.pk));
      const nama = dipilih.slice(0, 5).map((p) => esc(p.provinsi));
      const lebih = dipilih.length - nama.length;
      k.innerHTML = `<p><strong>${dipilih.length}</strong> provinsi dipilih: ${nama.join(', ')}${lebih > 0 ? ` dan ${lebih} lainnya` : ''}.</p>
        <p class="rata">Persentase penduduk miskin rata-rata <b>${f1(d3.mean(dipilih, (p) => p.p0))}%</b> (semua provinsi ${f1(d3.mean(P, (p) => p.p0))}%);
        IPM <b>${f1(d3.mean(dipilih, (p) => p.ipm))}</b> (semua ${f1(d3.mean(P, (p) => p.ipm))}).</p>`;
    }

    /* =========================================================
       Isi tiap langkah (dihitung dari data)
       ========================================================= */
    const top = (j) => kode.map((k) => ({ k, r: kor[k][j] })).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const teksKor = (o) => `${PANJANG[o.k]} (${o.r > 0 ? '+' : '\u2212'}${f2(Math.abs(o.r))})`;
    const rz = (a, b) => d3.mean(P, (p) => p.z[a] * p.z[b]);
    const klTerakhir = KL[nK - 1];
    const pencilan = P.filter((p) => p.pencilan).sort((a, b) => b.mahalanobis - a.mahalanobis);
    const zRata = (anggota, k) => d3.mean(anggota, (p) => p.z[k]);
    const zTxt = (v) => `${v > 0 ? '+' : '\u2212'}${f1(Math.abs(v))}`;
    const kunciPC2 = top(1)[0];

    const daftarUl = (arr) => `<ul class="rapi">${arr.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    const ikonK = (i) => `<svg class="ikon-k" width="14" height="14" aria-hidden="true"><path d="${simbol(i, 90)}" transform="translate(7,7)" fill="${WK[i % 4]}"/></svg>`;
    const kapital = (t) => t.charAt(0).toUpperCase() + t.slice(1);

    function isiLangkah1() {
      const t1 = top(0).slice(0, 3).map(teksKor).join(', ');
      return `<p>Setiap titik adalah satu provinsi. Posisinya dihitung dari delapan ukuran sekaligus dengan analisis komponen utama (<abbr title="Principal Component Analysis: meringkas banyak ukuran menjadi beberapa sumbu">PCA</abbr>).</p>
        <p>Dua sumbu pertama sudah merangkum <strong>${f1(vp[0] + vp[1])}%</strong> perbedaan antarprovinsi.</p>
        ${daftarUl([
          `<strong>Sumbu mendatar (${f1(vp[0])}%)</strong> memisahkan provinsi menurut pembangunan manusia. Paling berkaitan: ${t1}.`,
          `<strong>Sumbu tegak (${f1(vp[1])}%)</strong> paling berkaitan dengan ${teksKor(kunciPC2)}.`])}
        <p>Warna dan bentuk menandai ${nK} klaster:</p>
        <ul class="klaster">${KL.map((k, i) => `<li>${ikonK(i)}<span><strong>Klaster ${i + 1}</strong>: ${k.n} provinsi, IPM rata-rata ${f1(k.rata.ipm)}</span></li>`).join('')}</ul>`;
    }
    function isiLangkah2() {
      const pos = top(0).filter((o) => o.r > 0.5).map((o) => SING[o.k]);
      const neg = top(0).filter((o) => o.r < -0.5).map((o) => SING[o.k]);
      const r2 = kor[kunciPC2.k][0];
      return `<p>Panah menunjukkan ke mana tiap ukuran "menarik" provinsi. Makin panjang panah, makin kuat pengaruhnya.</p>
        ${daftarUl([`<strong>Ke kanan</strong> (provinsi makin maju): ${daftarDan(pos)}.`,
          `<strong>Ke kiri</strong>: ${neg.length ? daftarDan(neg) : 'tidak ada ukuran yang kuat'}.`])}
        <p>Panah yang searah bergerak bersama. Panah yang berlawanan saling bertentangan.</p>
        <p class="inti">${kapital(PANJANG[kunciPC2.k])} hampir tegak lurus dengan sumbu mendatar (korelasi hanya ${r2 > 0 ? '+' : '\u2212'}${f2(Math.abs(r2))}).${kunciPC2.k === 'jml' ? ' Jumlah orang miskin tidak mencerminkan tingkat pembangunan, karena sangat dipengaruhi jumlah penduduk provinsi.' : ''}</p>`;
    }
    function isiLangkah3() {
      if (!pencilan.length) return '<p>Tidak ada provinsi di luar batas pencilan. Seluruh provinsi berada dalam satu gugus yang cukup rapat.</p>';
      const ket = pencilan.map((p) => {
        const e = kode.map((k) => ({ k, z: p.z[k] })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
        return `<strong>${esc(p.provinsi)}</strong>: jarak ${f2(p.mahalanobis)}, paling ekstrem pada ${PANJANG[e.k]} (${zTxt(e.z)} simpangan baku dari rata-rata)`;
      });
      return `<p>Elips putus-putus adalah batas wajar, yaitu jarak <abbr title="Jarak statistik yang memperhitungkan sebaran dan hubungan antarukuran">Mahalanobis</abbr> 2,45. Provinsi di luarnya disebut pencilan.</p>
        ${daftarUl(ket)}
        <p class="inti">Pencilan bukan kesalahan data. Ia menandai tempat yang perlu dilihat tersendiri, sebab rata-rata nasional bisa menyesatkan.</p>`;
    }
    function isiLangkah4() {
      const anggota = P.filter((p) => p.klaster === klTerakhir.id);
      const z = kode.map((k) => ({ k, z: zRata(anggota, k) })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
      const sejajar = zRata(anggota, 'ipm') < -1 && zRata(anggota, 'p0') > 1;
      return `<p>Setiap garis adalah satu provinsi yang melintasi semua ukuran.</p>
        <p>Yang disorot adalah <strong>klaster ${nK}</strong>: ${daftarDan(klTerakhir.anggota.map(esc))}.</p>
        <p>Rata-rata klaster ini paling menyimpang pada:</p>
        ${daftarUl(z.map((o) => `${PANJANG[o.k]} (${zTxt(o.z)})`))}
        <p class="catatan">Angka dalam kurung: jarak dari rata-rata nasional dalam simpangan baku.</p>
        ${sejajar ? '<p class="inti">Garis-garis ini jatuh di ujung bawah pada ukuran pembangunan dan di ujung atas pada persentase penduduk miskin secara bersamaan.</p>' : ''}
        <p class="coba"><strong>Coba:</strong> seret pada salah satu sumbu untuk menyaring provinsi.</p>`;
    }
    function isiLangkah5() {
      const pairs = [];
      for (let i = 0; i < kode.length; i++) for (let j = i + 1; j < kode.length; j++) pairs.push({ a: kode[i], b: kode[j], r: rz(kode[i], kode[j]) });
      pairs.sort((a, b) => b.r - a.r);
      const pos = pairs[0], neg = pairs[pairs.length - 1];
      const jmlP0 = rz('jml', 'p0');
      return `<p>Setiap baris adalah provinsi, setiap kolom satu ukuran. Ungu berarti di bawah rata-rata, hijau di atas rata-rata.</p>
        <p>Baris dan kolom diurutkan agar yang mirip berdekatan. Garis tebal memisahkan klaster.</p>
        ${daftarUl([`<strong>Paling seirama</strong>: ${SING[pos.a]} dan ${SING[pos.b]} (r = ${f2(pos.r)})`,
          `<strong>Paling berlawanan</strong>: ${SING[neg.a]} dan ${SING[neg.b]} (r = ${f2(neg.r)})`])}
        <p class="inti">Jumlah penduduk miskin dan persentase penduduk miskin hampir tidak berkaitan (r = ${f2(jmlP0)}). "Di mana paling parah" dan "di mana paling banyak orangnya" memang punya jawaban berbeda.</p>`;
    }
    function isiLangkah6() {
      const dua = KL.slice(-2).flatMap((k) => P.filter((p) => p.klaster === k.id));
      const hit = d3.rollup(dua, (v) => v.length, (p) => pulauDariPk(p.pk));
      const urut = [...hit].sort((a, b) => b[1] - a[1]);
      const tiga = [...P].sort((a, b) => b.jml - a.jml).slice(0, 3);
      const sama = tiga.every((p) => p.klaster === tiga[0].klaster);
      return `<p>Kembali ke peta posisi. Dua klaster dengan IPM terendah kini disorot, berisi <strong>${dua.length} provinsi</strong>:</p>
        ${daftarUl(urut.map(([n, c]) => `${c} di ${n}`))}
        <p>Tiga provinsi dengan penduduk miskin terbanyak (${daftarDan(tiga.map((p) => esc(p.provinsi)))}) ${sama
          ? `semuanya ada di klaster ${tiga[0].klaster + 1}, dengan persentase penduduk miskin rata-rata ${f1(KL[tiga[0].klaster].rata.p0)}%.`
          : 'tersebar di beberapa klaster.'}</p>
        <p class="inti">${sama ? 'Jumlah besar belum tentu berarti persentase penduduk miskin yang tinggi.' : 'Jumlah besar tidak otomatis sejalan dengan persentase penduduk miskin yang tinggi.'}</p>
        <p class="coba"><strong>Jelajahi sendiri:</strong> kembali ke langkah mana pun, lalu seret atau klik untuk memilih provinsi.</p>`;
    }

    const LANGKAH = [
      { view: 'sebar', judul: 'Delapan ukuran, satu peta', panah: false, batas: true, sel: () => new Set(), isi: isiLangkah1 },
      { view: 'sebar', judul: 'Apa arti sumbunya?', panah: true, batas: false, sel: () => new Set(), isi: isiLangkah2 },
      { view: 'sebar', judul: 'Provinsi yang berdiri sendiri', panah: false, batas: true, sel: () => new Set(pencilan.map((p) => p.pk)), isi: isiLangkah3 },
      { view: 'paralel', judul: 'Profil lengkap di ujung bawah', sel: () => new Set(P.filter((p) => p.klaster === klTerakhir.id).map((p) => p.pk)), isi: isiLangkah4 },
      { view: 'heat', judul: 'Pola yang berulang', sel: () => new Set(), isi: isiLangkah5 },
      { view: 'sebar', judul: 'Kembali ke gambaran besar', panah: false, batas: true, sel: () => new Set(P.filter((p) => p.klaster >= nK - 2).map((p) => p.pk)), isi: isiLangkah6 }
    ];
    const NAMA_VIEW = { sebar: 'Posisi (PCA)', paralel: 'Profil', heat: 'Pola' };

    /* ---------- panggung ---------- */
    const pemicu = d3.select('#pemicu2').selectAll('div.pemicu').data(LANGKAH).join('div').attr('class', 'pemicu').attr('data-i', (d, i) => i);
    pemicu.each(function (d, i) {
      this.innerHTML = `<article class="kartu-langkah"><span class="lk-no">Langkah ${i + 1} dari ${LANGKAH.length}</span>
        <h3>${esc(d.judul)}</h3><div class="lk-isi">${d.isi()}</div></article>`;
    });
    d3.select('#lk-dots').selectAll('button').data(LANGKAH).join('button').attr('type', 'button')
      .attr('aria-label', (d, i) => `Langkah ${i + 1}: ${d.judul}`).on('click', (e, d) => keLangkah(LANGKAH.indexOf(d)));
    d3.select('#viz-tabs').selectAll('button').data(Object.keys(NAMA_VIEW)).join('button').attr('type', 'button').attr('role', 'tab')
      .attr('data-view', (d) => d).text((d) => NAMA_VIEW[d])
      .on('click', (e, d) => keLangkah(LANGKAH.findIndex((l) => l.view === d)));

    let aktif = -1;
    function keLangkah(i) {
      i = Math.max(0, Math.min(LANGKAH.length - 1, i));
      pemicu.nodes()[i].scrollIntoView({ block: 'center', behavior: GERAK });
      aktifkan(i);
    }
    function aktifkan(i) {
      if (i === aktif) return;
      const L = LANGKAH[i];
      aktif = i;
      document.querySelectorAll('#bab2 .viz-item').forEach((f) => {
        const on = f.dataset.view === L.view;
        f.classList.toggle('aktif', on);
        f.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      d3.selectAll('#viz-tabs button').attr('aria-selected', function () { return this.dataset.view === L.view ? 'true' : 'false'; });
      d3.selectAll('#lk-dots button').classed('on', (d, k) => k === i).attr('aria-current', (d, k) => k === i ? 'step' : null);
      if (L.view === 'sebar') {
        views.sebar.setPanah(!!L.panah); views.sebar.setBatas(L.batas !== false);
      }
      el('lk-no').textContent = `Langkah ${i + 1} dari ${LANGKAH.length}`;
      el('lk-judul').textContent = L.judul;
      const isi = el('lk-isi');
      isi.innerHTML = L.isi();
      isi.classList.remove('masuk'); void isi.offsetWidth; isi.classList.add('masuk');
      el('lk-judul').classList.remove('masuk'); void el('lk-judul').offsetWidth; el('lk-judul').classList.add('masuk');
      el('lk-prev').disabled = i === 0; el('lk-next').disabled = i === LANGKAH.length - 1;
      el('teks2').scrollTop = 0;
      setSel(L.sel(), 'langkah');
    }
    el('lk-prev').addEventListener('click', () => keLangkah(aktif - 1));
    el('lk-next').addEventListener('click', () => keLangkah(aktif + 1));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) aktifkan(+e.target.dataset.i); });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    pemicu.each(function () { io.observe(this); });

    el('skala-z').style.background = `linear-gradient(90deg, ${d3.range(0, 1.01, 0.1).map((t) => d3.interpolatePRGn(t)).join(',')})`;

    /* ---------- gambar, ukur ulang saat ukuran berubah ---------- */
    function semuaGambar() {
      Object.values(views).forEach((v) => v.gambar());
      perbarui();
    }
    semuaGambar();
    aktifkan(0);
    const uk = { w: el('panggung2').clientWidth, h: el('panggung2').clientHeight };
    let tunda;
    new ResizeObserver(() => {
      const w = el('panggung2').clientWidth, h = el('panggung2').clientHeight;
      if (Math.abs(w - uk.w) > 1 || Math.abs(h - uk.h) > 40) {
        uk.w = w; uk.h = h;
        clearTimeout(tunda); tunda = setTimeout(semuaGambar, 150);
      }
    }).observe(el('panggung2'));
  }
})();