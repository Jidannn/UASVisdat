/* hook.js — gambar pembuka tiap bab, seluruhnya dibuat dari data (tanpa berkas gambar):
   Bab 1: "cakrawala" 514 batang kabupaten/kota diurutkan menurut persentase penduduk miskin
   Bab 2: 38 titik provinsi yang bergerak dari sebaran acak ke posisi PCA
   Bab 3: arus migrasi terbesar sebagai busur dengan titik bergerak di atas peta samar
   Animasi berjalan sekali saat gambar terlihat; pengguna "kurangi gerakan" melihat hasil akhir. */
(() => {
  'use strict';
  const K = window.Kisah;
  if (!K) return;
  K.modul.hook = 9;

  const { f0, f1, esc } = K;
  const WARNA = d3.schemeYlOrBr[7].slice(1);
  const WK = ['#0072B2', '#009E73', '#E69F00', '#CC79A7'];
  const BTK = [d3.symbolCircle, d3.symbolSquare, d3.symbolDiamond, d3.symbolTriangle];
  const diam = K.kurangiGerak;
  const el = (id) => document.getElementById(id);

  function saatTerlihat(node, fn) {
    if (diam) { fn(); return; }
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.35 });
    io.observe(node);
  }
  function biarUlang(host, gambar) {
    let tunda, w0 = host.clientWidth;
    new ResizeObserver(() => {
      const w = host.clientWidth;
      if (Math.abs(w - w0) < 2) return;
      w0 = w; clearTimeout(tunda); tunda = setTimeout(() => gambar(true), 200);
    }).observe(host);
  }

  /* ---------------- Bab 1: cakrawala kabupaten/kota ---------------- */
  K.dataPeta.then((geo) => {
    const host = el('hook-b1-isi');
    if (!host) return;
    const v = geo.features.filter((f) => f.geometry).map((f) => +f.properties.p0).filter(Number.isFinite).sort(d3.descending);
    const N = v.length;
    const cap = el('hook-b1-ket');
    if (cap) cap.textContent = `Setiap batang adalah satu kabupaten/kota (${f0(N)} wilayah), diurutkan dari persentase penduduk miskin tertinggi. Garis putus-putus: 20%.`;

    let sudah = false;
    function gambar(langsung) {
      host.innerHTML = '';
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      const M = { t: 18, r: 8, b: 30, l: 32 };
      const iw = w - M.l - M.r, ih = h - M.t - M.b;
      const lb = iw / N;                                  // lebar tiap batang (kurang dari 1 piksel: gambar sebagai bidang menyatu)
      const y = d3.scaleLinear().domain([0, d3.max(v)]).nice().range([ih, 0]);
      const asc = v.slice().sort(d3.ascending);
      const skala = d3.scaleThreshold().domain(d3.range(1, 6).map((i) => d3.quantile(asc, i / 6))).range(WARNA);
      const svg = d3.select(host).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true');
      const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
      g.append('g').attr('class', 'sumbu').call(d3.axisLeft(y).ticks(4).tickFormat((d) => d + '%').tickSize(-iw)).call((a) => a.select('.domain').remove());
      const tampil = langsung || sudah || diam;
      const bars = g.append('g').selectAll('rect').data(v).join('rect').attr('x', (d, i) => i * lb).attr('width', lb + 0.5)
        .attr('fill', (d) => skala(d))
        .attr('y', (d) => tampil ? y(d) : ih).attr('height', (d) => tampil ? ih - y(d) : 0);
      if (y.domain()[1] >= 20) {
        g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(20)).attr('y2', y(20)).attr('stroke', '#1a2631').attr('stroke-width', 1.2).attr('stroke-dasharray', '5 4');
        g.append('text').attr('x', iw).attr('y', y(20) - 5).attr('text-anchor', 'end').attr('class', 'hook-teks').text('ambang 20%');
      }
      svg.append('text').attr('class', 'hook-teks').attr('x', M.l).attr('y', h - 10).text('\u2190 persentase tertinggi');
      svg.append('text').attr('class', 'hook-teks').attr('x', w - M.r).attr('y', h - 10).attr('text-anchor', 'end').text('terendah \u2192');
      if (!tampil) {
        saatTerlihat(host, () => {
          sudah = true;
          bars.transition().delay((d, i) => i * 2.4).duration(700).ease(d3.easeCubicOut)
            .attr('y', (d) => y(d)).attr('height', (d) => ih - y(d));
        });
      }
    }
    gambar();
    biarUlang(host, gambar);
  }).catch(() => {});

  /* ---------------- Bab 2: titik provinsi bertemu di peta PCA ---------------- */
  K.json('data/provinsi_pca.json').then((pca) => {
    const host = el('hook-b2-isi');
    if (!host) return;
    const P = pca.provinsi;
    const cap = el('hook-b2-ket');
    if (cap) cap.textContent = `${P.length} provinsi. Delapan ukuran diringkas menjadi dua sumbu. Titik yang berdekatan memiliki profil serupa. Warna dan bentuk menandai klaster.`;
    let sudah = false;

    function gambar(langsung) {
      host.innerHTML = '';
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      const M = { t: 16, r: 14, b: 30, l: 14 };
      const iw = w - M.l - M.r, ih = h - M.t - M.b;
      const ex = d3.extent(P, (d) => d.pc1), ey = d3.extent(P, (d) => d.pc2);
      const x = d3.scaleLinear().domain([ex[0] - 0.6, ex[1] + 0.6]).range([0, iw]);
      const y = d3.scaleLinear().domain([ey[0] - 0.4, ey[1] + 0.4]).range([ih, 0]);
      const rnd = d3.randomLcg(11);
      const awal = P.map(() => [rnd() * iw, rnd() * ih]);
      const svg = d3.select(host).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true');
      const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
      g.append('line').attr('class', 'nol').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih);
      g.append('line').attr('class', 'nol').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0));
      const tampil = langsung || sudah || diam;
      const pos = (d, i) => tampil ? [x(d.pc1), y(d.pc2)] : awal[i];
      const dot = g.append('g').selectAll('path').data(P).join('path')
        .attr('d', (d) => d3.symbol().type(BTK[d.klaster % 4]).size(95)()).attr('fill', (d) => WK[d.klaster % 4])
        .attr('stroke', '#fff').attr('stroke-width', 1)
        .attr('transform', (d, i) => `translate(${pos(d, i)})`);
      const judul = svg.append('text').attr('class', 'hook-teks').attr('x', M.l).attr('y', h - 10);
      const akhir = 'pembangunan manusia lebih tinggi \u2192';
      judul.text(tampil ? akhir : 'delapan ukuran per provinsi');
      if (!tampil) {
        saatTerlihat(host, () => {
          sudah = true;
          dot.transition().delay((d, i) => 500 + i * 22).duration(1500).ease(d3.easeCubicInOut)
            .attr('transform', (d) => `translate(${x(d.pc1)},${y(d.pc2)})`);
          judul.transition().delay(1500).duration(500).style('opacity', 0)
            .transition().duration(500).style('opacity', 1).on('start', function () { d3.select(this).text(akhir); });
        });
      }
    }
    gambar();
    biarUlang(host, gambar);
  }).catch(() => {});

  /* ---------------- Bab 3: busur arus migrasi di atas peta samar ---------------- */
  Promise.all([K.dataPeta, K.json('data/migrasi.json')]).then(([geo, D]) => {
    const host = el('hook-b3-isi');
    if (!host) return;
    const fitur = geo.features.filter((f) => f.geometry);
    const per = D.urutan_periode[0];
    const M = D.periode[per].matriks, nodes = D.simpul;
    const NARUS = 30;
    const cap = el('hook-b3-ket');
    if (cap) cap.textContent = `${NARUS} arus antarprovinsi terbesar, ${D.periode[per].label.toLowerCase()} menjelang SP2020. Titik yang bergerak menunjukkan arah arus. Garis lebih tebal berarti lebih banyak orang.`;

    const norm = (s) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim().replace('daerah istimewa yogyakarta', 'di yogyakarta');
    const pas = [];
    M.forEach((r, i) => r.forEach((v, j) => { if (i !== j && v > 0) pas.push({ i, j, v }); }));
    pas.sort((a, b) => b.v - a.v);
    const arus = pas.slice(0, NARUS);

    function gambar() {
      host.innerHTML = '';
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      const proj = d3.geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], { type: 'FeatureCollection', features: fitur });
      const path = d3.geoPath(proj);
      const svg = d3.select(host).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true');
      svg.append('g').selectAll('path').data(fitur).join('path').attr('d', path).attr('fill', '#dbe4ea');

      const titik = nodes.map((s) => {
        const nama = (s.gabungan_dari || [s.nama]).map(norm);
        const fs = fitur.filter((f) => nama.includes(norm(f.properties.prov)));
        if (!fs.length) return null;
        const a = fs.map((f) => path.area(f));
        const tot = d3.sum(a) || 1;
        return [d3.sum(fs, (f, k) => path.centroid(f)[0] * a[k]) / tot, d3.sum(fs, (f, k) => path.centroid(f)[1] * a[k]) / tot];
      });
      const lebar = d3.scaleSqrt().domain([0, arus[0].v]).range([0.6, 3.4]);
      const busur = svg.append('g').attr('fill', 'none').attr('stroke-linecap', 'round');
      arus.forEach((a, k) => {
        const p1 = titik[a.i], p2 = titik[a.j];
        if (!p1 || !p2) return;
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1], jarak = Math.hypot(dx, dy) || 1;
        let nx = -dy / jarak, ny = dx / jarak;
        if (ny > 0) { nx = -nx; ny = -ny; }                                  // busur melengkung ke atas
        const c = [(p1[0] + p2[0]) / 2 + nx * jarak * 0.28, (p1[1] + p2[1]) / 2 + ny * jarak * 0.28];
        const d = `M${p1[0]},${p1[1]}Q${c[0]},${c[1]} ${p2[0]},${p2[1]}`;
        busur.append('path').attr('d', d).attr('stroke', '#0072B2').attr('stroke-opacity', 0.22).attr('stroke-width', lebar(a.v));
        const komet = busur.append('path').attr('d', d).attr('pathLength', 1).attr('class', 'komet').attr('stroke', '#0072B2')
          .attr('stroke-width', lebar(a.v) + 0.6).attr('stroke-opacity', diam ? 0 : 0.95);
        if (!diam) komet.style('animation-delay', `${(k * 0.23).toFixed(2)}s`);
        svg.append('circle').attr('cx', p2[0]).attr('cy', p2[1]).attr('r', 2.2).attr('fill', '#D55E00');
      });
    }
    gambar();
    biarUlang(host, gambar);
  }).catch(() => {});
})();