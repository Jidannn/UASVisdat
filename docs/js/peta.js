/* Bab 1 — di mana kantong kemiskinan? (geospasial, kabupaten/kota)
   Panggung scroll: teks di kiri, peta di kanan. Tiap langkah mengatur lapisan
   (warna persentase / lingkaran jumlah) dan zoom. Tetap memenuhi Lampiran A:
   dua jenis peta (choropleth + simbol proporsional), metode klasifikasi dapat
   dipilih, tooltip, legenda, zoom/pan, kontrol lapisan. */
(() => {
  'use strict';

  const K = window.Kisah;
  K.modul.peta = 6;
  const { f0, f1, f2, esc, daftarDan } = K;
  const K_KELAS = 6;
  const WARNA = d3.schemeYlOrBr[7].slice(1);        // ColorBrewer YlOrBr, aman buta warna
  const GERAK = K.kurangiGerak ? 0 : 700;
  const KASAR = matchMedia('(pointer: coarse)').matches;   // layar sentuh: seret satu jari menggulir halaman, bukan menggeser peta

  const PULAU = {
    'Sumatera': ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Jambi', 'Sumatera Selatan',
      'Bengkulu', 'Lampung', 'Kepulauan Bangka Belitung', 'Kepulauan Riau'],
    'Jawa': ['DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'Daerah Istimewa Yogyakarta', 'Jawa Timur', 'Banten'],
    'Bali & Nusa Tenggara': ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur'],
    'Kalimantan': ['Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan', 'Kalimantan Timur', 'Kalimantan Utara'],
    'Sulawesi': ['Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan', 'Sulawesi Tenggara', 'Sulawesi Barat', 'Gorontalo'],
    'Maluku': ['Maluku', 'Maluku Utara'],
    'Papua': ['Papua', 'Papua Barat', 'Papua Barat Daya', 'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan']
  };
  const pulauDari = (prov) => Object.keys(PULAU).find((k) => PULAU[k].includes(prov)) || '';
  const el = (id) => document.getElementById(id);

  K.dataPeta.then(mulai).catch((e) => {
    const saran = /fetch|404|network|load failed|json|unexpected/i.test(e.message)
      ? ' Jika berkas dibuka langsung dari folder, jalankan server lokal (python -m http.server di folder docs).' : '';
    el('peta').insertAdjacentHTML('beforeend', `<p class="galat">Peta tidak dapat ditampilkan: ${esc(e.message)}.${saran}</p>`);
  });

  /* ---------- Fisher-Jenks (natural breaks) ---------- */
  function jenks(data, nKelas) {
    const d = data.slice().sort(d3.ascending);
    const n = d.length;
    const lower = Array.from({ length: n + 1 }, () => new Array(nKelas + 1).fill(0));
    const varc = Array.from({ length: n + 1 }, () => new Array(nKelas + 1).fill(0));
    for (let i = 1; i <= nKelas; i++) {
      lower[1][i] = 1;
      varc[1][i] = 0;
      for (let j = 2; j <= n; j++) varc[j][i] = Infinity;
    }
    let variance = 0;
    for (let l = 2; l <= n; l++) {
      let sum = 0, sumSq = 0, w = 0;
      for (let m = 1; m <= l; m++) {
        const lc = l - m + 1;
        const val = d[lc - 1];
        w++; sum += val; sumSq += val * val;
        variance = sumSq - (sum * sum) / w;
        const i4 = lc - 1;
        if (i4 !== 0) {
          for (let j = 2; j <= nKelas; j++) {
            if (varc[l][j] >= variance + varc[i4][j - 1]) {
              lower[l][j] = lc;
              varc[l][j] = variance + varc[i4][j - 1];
            }
          }
        }
      }
      lower[l][1] = 1;
      varc[l][1] = variance;
    }
    const kelas = [];
    kelas[nKelas] = d[n - 1];
    let k = n, c = nKelas;
    while (c > 0) {
      kelas[c - 1] = d[lower[k][c] - 2];
      k = lower[k][c] - 1;
      c--;
    }
    return kelas;
  }

  function mulai(geo) {
    K.pastikanDom(['peta', 'peta-judul', 'leg-warna', 'leg-bulat', 'lyr-warna', 'lyr-lingkaran', 'metode', 'provinsi',
      'z-masuk', 'z-keluar', 'z-reset', 'kartu', 'rank-p0', 'rank-jml', 'b1-panggung']);
    const fitur = geo.features.filter((f) => f.geometry);
    fitur.forEach((f) => {
      const p = f.properties;
      p.p0 = +p.p0; p.p1 = +p.p1; p.jml = +p.jml;
    });
    const urut = (kunci) => [...fitur].sort((a, b) => b.properties[kunci] - a.properties[kunci]);
    const urutP0 = urut('p0'), urutJml = urut('jml');
    urutP0.forEach((f, i) => { f.properties.rP0 = i + 1; });
    urutJml.forEach((f, i) => { f.properties.rJml = i + 1; });
    const N = fitur.length;
    const lingkaranData = urutJml;

    const state = { warna: true, lingkaran: true, metode: 'kuantil', sorot: '', terpilih: null, pulau: '' };
    let skala = null, batas = [];
    let svg, g, gKab, gSel, gLing, proj, path, zoom, paths, circles, rad;
    let W = 0, H = 0, kZoom = 1;

    /* ---------- klasifikasi ---------- */
    function hitungKelas() {
      const v = fitur.map((f) => f.properties.p0).sort(d3.ascending);
      let b = state.metode === 'jenks'
        ? jenks(v, K_KELAS).slice(1, K_KELAS)
        : d3.range(1, K_KELAS).map((i) => d3.quantile(v, i / K_KELAS));
      b = b.map((x) => Math.round(x * 10) / 10);
      batas = b;
      skala = d3.scaleThreshold().domain(b).range(WARNA);
    }

    /* ---------- legenda ---------- */
    function gambarLegenda() {
      const hit = new Array(K_KELAS).fill(0);
      fitur.forEach((f) => { hit[WARNA.indexOf(skala(f.properties.p0))]++; });
      const lab = (i) => i === 0 ? `&lt; ${f1(batas[0])}`
        : i === K_KELAS - 1 ? `&ge; ${f1(batas[K_KELAS - 2])}`
          : `${f1(batas[i - 1])}&ndash;${f1(batas[i])}`;
      el('leg-warna').innerHTML = WARNA.map((w, i) =>
        `<div><i style="background:${w}"></i><span>${lab(i)}</span><small>${hit[i]} wil.</small></div>`).join('');

      const vMax = d3.max(fitur, (f) => f.properties.jml);
      const nice = (v) => v >= 100 ? Math.round(v / 50) * 50 : Math.round(v / 10) * 10;
      const ref = [nice(vMax * 0.06), nice(vMax * 0.3), nice(vMax)];
      const rr = ref.map((v) => rad(v));
      const tinggi = 2 * rr[2] + 4;
      const cx = rr[2] + 2;
      const s = d3.select('#leg-bulat').attr('width', 2 * rr[2] + 78).attr('height', tinggi);
      s.selectAll('*').remove();
      ref.forEach((v, i) => {
        const cy = tinggi - rr[i] - 2;
        s.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rr[i])
          .attr('fill', '#2b6ea6').attr('fill-opacity', .45).attr('stroke', '#1a2631').attr('stroke-width', .8);
        const ytop = tinggi - 2 * rr[i] - 2;
        s.append('line').attr('x1', cx).attr('x2', 2 * rr[2] + 8).attr('y1', ytop).attr('y2', ytop)
          .attr('stroke', '#46566a').attr('stroke-width', .6);
        s.append('text').attr('x', 2 * rr[2] + 12).attr('y', ytop + 4).text(f0(v));
      });
    }

    /* ---------- peta ---------- */
    function judulPeta() {
      el('peta-judul').textContent =
        state.warna && state.lingkaran ? 'Persentase (warna) dan jumlah (lingkaran) penduduk miskin per kab/kota, Maret 2025'
          : state.warna ? 'Persentase penduduk miskin per kab/kota, Maret 2025'
            : 'Jumlah penduduk miskin per kab/kota (ribu jiwa), Maret 2025';
    }
    const redup = (f) => state.sorot && f.properties.prov !== state.sorot;

    function terapkanGaya() {
      paths.attr('fill', (f) => state.warna ? skala(f.properties.p0) : '#e6ebef')
        .attr('fill-opacity', (f) => redup(f) ? 0.22 : 1);
      gLing.style('display', state.lingkaran ? null : 'none');
      circles.attr('opacity', (f) => redup(f) ? 0.2 : 1);
      svg.classed('hanya-lingkaran', !state.warna && state.lingkaran);
      judulPeta();
    }
    function setLapis(warna, lingkaran) {
      state.warna = warna; state.lingkaran = lingkaran;
      el('lyr-warna').checked = warna; el('lyr-lingkaran').checked = lingkaran;
      if (paths) terapkanGaya();
    }

    function render() {
      const kotak = el('peta');
      d3.select(kotak).select('svg').remove();
      W = kotak.clientWidth; H = Math.max(240, kotak.clientHeight);
      svg = d3.select(kotak).insert('svg', ':first-child')
        .attr('width', W).attr('height', H)
        .attr('role', 'img').attr('aria-label', 'Peta kemiskinan kabupaten/kota Indonesia');
      proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'FeatureCollection', features: fitur });
      path = d3.geoPath(proj);
      fitur.forEach((f) => { f._c = path.centroid(f); f._b = path.bounds(f); });
      rad = d3.scaleSqrt().domain([0, d3.max(fitur, (f) => f.properties.jml)]).range([0, W < 600 ? 10 : 20]);
      fitur.forEach((f) => { f._r = rad(f.properties.jml); });

      g = svg.append('g');
      gKab = g.append('g');
      paths = gKab.selectAll('path').data(fitur).join('path')
        .attr('class', 'wil').attr('d', path)
        .on('pointerenter', (e, f) => tampilTip(e, f))
        .on('pointermove', (e) => geserTip(e))
        .on('pointerleave', sembunyiTip)
        .on('click', (e, f) => pilih(f, false));
      gSel = g.append('g');
      gLing = g.append('g').attr('class', 'lingkaran');
      circles = gLing.selectAll('circle').data(lingkaranData).join('circle')
        .attr('cx', (f) => f._c[0]).attr('cy', (f) => f._c[1]).attr('r', (f) => f._r)
        .on('pointerenter', (e, f) => tampilTip(e, f))
        .on('pointermove', (e) => geserTip(e))
        .on('pointerleave', sembunyiTip)
        .on('click', (e, f) => pilih(f, false));

      zoom = d3.zoom().scaleExtent([1, 24]).translateExtent([[0, 0], [W, H]]).touchable(() => !KASAR)
        .on('zoom', (e) => {
          g.attr('transform', e.transform);
          kZoom = e.transform.k;
          circles.attr('r', (f) => f._r / kZoom);
        });
      svg.call(zoom);

      terapkanGaya();
      gambarLegenda();
      gambarSel();
      if (state.pulau) zoomKePulau(state.pulau, 0);
    }

    /* ---------- zoom ---------- */
    function gabungBatas(daftar) {
      return [[d3.min(daftar, (f) => f._b[0][0]), d3.min(daftar, (f) => f._b[0][1])],
        [d3.max(daftar, (f) => f._b[1][0]), d3.max(daftar, (f) => f._b[1][1])]];
    }
    function zoomKe(b, maxK = 24, durasi = GERAK) {
      const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
      const cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
      const kk = Math.max(1, Math.min(maxK, 0.85 / Math.max(dx / W, dy / H, 1e-6)));
      const t = d3.zoomIdentity.translate(W / 2 - kk * cx, H / 2 - kk * cy).scale(kk);
      svg.transition().duration(durasi).call(zoom.transform, t);
    }
    const zoomReset = (durasi = GERAK) => svg.transition().duration(durasi).call(zoom.transform, d3.zoomIdentity);
    function zoomKePulau(nama, durasi = GERAK) {
      state.pulau = nama;
      if (!nama) { zoomReset(durasi); return; }
      zoomKe(gabungBatas(fitur.filter((f) => PULAU[nama].includes(f.properties.prov))), 14, durasi);
    }

    /* ---------- pilihan dan kartu ---------- */
    function gambarSel() {
      const data = state.terpilih ? [state.terpilih] : [];
      gSel.selectAll('path.sel-halo').data(data).join('path').attr('class', 'sel-halo').attr('d', path);
      gSel.selectAll('path.sel').data(data).join('path').attr('class', 'sel').attr('d', path);
    }
    function pilih(f, fokus) {
      state.terpilih = f;
      gambarSel();
      isiKartu(f);
      if (fokus) { state.pulau = ''; zoomKe(f._b); }
    }
    function isiKartu(f) {
      const p = f.properties;
      const w = skala(p.p0);
      const kls = WARNA.indexOf(w) + 1;
      const k = el('kartu');
      k.hidden = false;
      k.style.borderLeftColor = w;
      k.innerHTML = `<button type="button" class="tutup" aria-label="Tutup kartu">&times;</button>
        <h3>${esc(p.nama)}</h3><p class="prov">${esc(p.prov)}</p>
        <div class="besar">${f2(p.p0)}%</div>
        <p class="ket">persentase penduduk miskin, kelas ${kls} dari ${K_KELAS}, peringkat ${p.rP0} dari ${N}</p>
        <dl><dt>Jumlah penduduk miskin</dt><dd>${f1(p.jml)} ribu jiwa</dd>
        <dt>Peringkat jumlah</dt><dd>${p.rJml} dari ${N}</dd>
        <dt>Kedalaman (P1)</dt><dd>${f2(p.p1)}</dd></dl>`;
      k.querySelector('.tutup').addEventListener('click', () => {
        k.hidden = true; state.terpilih = null; gambarSel();
      });
    }

    /* ---------- tooltip ---------- */
    const tip = el('tip');
    function tampilTip(e, f) {
      if (e.pointerType === 'touch') return;
      const p = f.properties;
      tip.innerHTML = `<strong>${esc(p.nama)}</strong><span class="p">${esc(p.prov)}</span>
        Persentase penduduk miskin <b>${f2(p.p0)}%</b><br>Jumlah penduduk miskin <b>${f1(p.jml)} ribu jiwa</b>`;
      tip.style.display = 'block';
      geserTip(e);
    }
    function geserTip(e) {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y + h > innerHeight - 8) y = e.clientY - h - 14;
      tip.style.left = Math.max(4, x) + 'px';
      tip.style.top = Math.max(4, y) + 'px';
    }
    function sembunyiTip() { tip.style.display = 'none'; }

    /* ---------- kontrol ---------- */
    function pastikanSatuLapisan(dari) {
      if (!state.warna && !state.lingkaran) {
        state[dari] = true;
        el(dari === 'warna' ? 'lyr-warna' : 'lyr-lingkaran').checked = true;
      }
    }
    el('lyr-warna').addEventListener('change', (e) => { state.warna = e.target.checked; pastikanSatuLapisan('warna'); terapkanGaya(); });
    el('lyr-lingkaran').addEventListener('change', (e) => { state.lingkaran = e.target.checked; pastikanSatuLapisan('lingkaran'); terapkanGaya(); });
    el('metode').addEventListener('change', (e) => {
      state.metode = e.target.value;
      hitungKelas(); terapkanGaya(); gambarLegenda();
      if (state.terpilih) isiKartu(state.terpilih);
    });

    const provs = d3.sort([...new Set(fitur.map((f) => f.properties.prov))],
      (a, b) => d3.ascending(Object.keys(PULAU).indexOf(pulauDari(a)), Object.keys(PULAU).indexOf(pulauDari(b))) || d3.ascending(a, b));
    d3.select('#provinsi').selectAll('option.p').data(provs).join('option').attr('class', 'p')
      .attr('value', (d) => d).text((d) => d);
    el('provinsi').addEventListener('change', (e) => {
      state.sorot = e.target.value;
      state.pulau = '';
      terapkanGaya();
      if (state.sorot) zoomKe(gabungBatas(fitur.filter((f) => f.properties.prov === state.sorot)), 14);
      else zoomReset();
    });

    el('z-masuk').addEventListener('click', () => svg.transition().duration(GERAK / 2).call(zoom.scaleBy, 1.7));
    el('z-keluar').addEventListener('click', () => svg.transition().duration(GERAK / 2).call(zoom.scaleBy, 1 / 1.7));
    el('z-reset').addEventListener('click', () => { state.pulau = ''; state.sorot = ''; el('provinsi').value = ''; terapkanGaya(); zoomReset(); });

    /* ---------- peringkat (di bawah panggung) ---------- */
    function daftar(idOl, arr, nilai) {
      d3.select(idOl).selectAll('li').data(arr.slice(0, 10)).join('li').html('')
        .append('button').attr('type', 'button')
        .html((f, i) => `<span class="no">${i + 1}</span><span class="nm">${esc(f.properties.nama)}<small>${esc(f.properties.prov)}</small></span><span class="nl">${nilai(f.properties)}</span>`)
        .on('click', (e, f) => {
          panggung.keLangkah(panggung.langkah.length - 1);
          setTimeout(() => { setLapis(true, true); pilih(f, true); }, K.kurangiGerak ? 0 : 450);
        });
    }
    daftar('#rank-p0', urutP0, (p) => f1(p.p0) + '%');
    daftar('#rank-jml', urutJml, (p) => f1(p.jml) + ' rb');

    /* =========================================================
       Langkah cerita (teks dihitung dari data)
       ========================================================= */
    const med = d3.median(fitur, (f) => f.properties.p0);
    const di20 = urutP0.filter((f) => f.properties.p0 >= 20);
    const total = d3.sum(fitur, (f) => f.properties.jml);
    const top = urutP0[0];
    const sepuluhP0 = urutP0.slice(0, 10);
    const dariPapua = sepuluhP0.filter((f) => pulauDari(f.properties.prov) === 'Papua').length;
    const sepuluhJml = urutJml.slice(0, 10);
    const dariJawa = sepuluhJml.filter((f) => pulauDari(f.properties.prov) === 'Jawa').length;
    const top10jml = d3.sum(sepuluhJml, (f) => f.properties.jml);
    const jawa = fitur.filter((f) => pulauDari(f.properties.prov) === 'Jawa');
    const medJawa = d3.median(jawa, (f) => f.properties.p0);
    const bagianJawa = d3.sum(jawa, (f) => f.properties.jml) / total * 100;
    const nm = (f) => `${esc(f.properties.nama)} (${f1(f.properties.p0)}%)`;

    const daftarUl = (arr) => `<ul class="rapi">${arr.map((t) => `<li>${t}</li>`).join('')}</ul>`;

    const LANGKAH = [
      {
        judul: 'Seberapa parah?', warna: true, lingkaran: false, zoom: '',
        isi: () => `<p>Setiap kabupaten/kota diwarnai menurut <strong>persentase penduduk miskin</strong>. Makin gelap, makin besar bagian penduduk yang miskin.</p>
          ${daftarUl([`Median ${N} kabupaten/kota: <strong>${f1(med)}%</strong>`,
            `Di atas 20%: <strong>${di20.length}</strong> kabupaten/kota`,
            `Tertinggi: <strong>${esc(top.properties.nama)}</strong> (${esc(top.properties.prov)}) dengan ${f1(top.properties.p0)}%, sekitar ${f1(top.properties.p0 / med)} kali median`])}`
      },
      {
        judul: 'Kantong terparah ada di timur', warna: true, lingkaran: false, zoom: 'Papua',
        isi: () => `<p>Peta diperbesar ke Papua. Dari 10 kabupaten/kota dengan persentase penduduk miskin tertinggi, <strong>${dariPapua}</strong> berada di sana.</p>
          <p>Tiga teratas</p>
          ${daftarUl(sepuluhP0.slice(0, 3).map(nm))}`
      },
      {
        judul: 'Tetapi berapa banyak orangnya?', warna: false, lingkaran: true, zoom: '',
        isi: () => `<p>Sekarang yang digambar adalah <strong>jumlah penduduk miskin</strong>. Luas lingkaran sebanding dengan jumlah orangnya.</p>
          ${daftarUl([`Total <strong>${f1(total / 1000)} juta jiwa</strong>, dijumlahkan dari semua kabupaten/kota`,
            `Sepuluh kabupaten/kota teratas menampung <strong>${f0(top10jml / total * 100)}%</strong> darinya`,
            `<strong>${dariJawa}</strong> dari sepuluh itu ada di Jawa`])}`
      },
      {
        judul: 'Jawa: jumlah besar, persentase biasa', warna: true, lingkaran: true, zoom: 'Jawa',
        isi: () => `<p>Kedua lapisan menyala. Jawa menunjukkan wajah yang berbeda: lingkarannya besar, tetapi warnanya tidak segelap Papua.</p>
          ${daftarUl([`Menampung <strong>${f0(bagianJawa)}%</strong> dari seluruh penduduk miskin`,
            `Median persentase penduduk miskin di sana hanya <strong>${f1(medJawa)}%</strong> (nasional ${f1(med)}%)`])}
          <p class="inti">"Di mana paling parah" dan "di mana paling banyak orangnya" punya jawaban berbeda.</p>`
      },
      {
        judul: 'Jelajahi sendiri', warna: true, lingkaran: true, zoom: '',
        isi: () => `<p>Gulir, seret, dan perbesar peta. Klik sebuah wilayah untuk melihat rinciannya.</p>
          <p>Bilah di atas peta mengatur lapisan, provinsi, dan cara membagi kelas warna:</p>
          ${daftarUl(['<strong>Kuantil</strong>: tiap warna berisi jumlah wilayah yang sama.',
            '<strong>Natural breaks</strong>: mengelompokkan nilai yang rapat, sehingga kelas teratas lebih kecil dan menyorot yang benar-benar ekstrem.'])}
          <p class="catatan">Peringkat lengkap ada di bawah peta.</p>`
      }
    ];

    const panggung = K.buatPanggung({
      scope: 'b1', langkah: LANGKAH,
      onAktif: (i, L) => {
        state.sorot = ''; el('provinsi').value = '';
        setLapis(L.warna, L.lingkaran);
        zoomKePulau(L.zoom);
      }
    });

    /* statistik untuk kartu bab */
    const stat = el('stat-b1');
    if (stat) stat.textContent = di20.length;

    /* ---------- mulai ---------- */
    hitungKelas();
    render();
    panggung.aktifkan(0);

    const uk = { w: el('b1-panggung').clientWidth, h: el('b1-panggung').clientHeight };
    let tunda;
    new ResizeObserver(() => {
      const w = el('b1-panggung').clientWidth, h = el('b1-panggung').clientHeight;
      if (Math.abs(w - uk.w) > 1 || Math.abs(h - uk.h) > 40) {
        uk.w = w; uk.h = h;
        clearTimeout(tunda); tunda = setTimeout(render, 150);
      }
    }).observe(el('b1-panggung'));
  }
})();