/* hero.js — sampul halaman: peta samar, angka besar yang menghitung naik,
   dan sampul yang memudar saat pembaca mulai menggulir (terinspirasi Snow Fall). */
(() => {
  'use strict';
  const hero = document.getElementById('hero');
  if (!hero || !window.Kisah) return;
  const K = window.Kisah;
  K.modul.hero = 3;
  const WARNA = d3.schemeYlOrBr[7].slice(1);

  /* sampul memudar saat gulir */
  let tunggu = false;
  function perbarui() {
    const p = Math.min(1, scrollY / (innerHeight * 0.85));
    hero.style.setProperty('--p', p.toFixed(3));
    hero.style.visibility = p >= 1 ? 'hidden' : 'visible';
    tunggu = false;
  }
  addEventListener('scroll', () => { if (!tunggu) { tunggu = true; requestAnimationFrame(perbarui); } }, { passive: true });
  perbarui();

  K.dataPeta.then((geo) => {
    const fitur = geo.features.filter((f) => f.geometry);

    /* angka besar */
    const total = d3.sum(fitur, (f) => +f.properties.jml) / 1000;      // juta jiwa
    const el = document.getElementById('hero-angka');
    const n = document.getElementById('hero-n');
    if (n) n.textContent = K.f0(fitur.length);
    if (K.kurangiGerak) el.textContent = K.f1(total);
    else {
      const t0 = performance.now() + 700, dur = 1700;
      const tik = (t) => {
        const u = Math.max(0, Math.min(1, (t - t0) / dur));
        el.textContent = K.f1(total * (1 - Math.pow(1 - u, 3)));
        if (u < 1) requestAnimationFrame(tik);
      };
      requestAnimationFrame(tik);
    }

    /* peta latar */
    const host = document.getElementById('hero-peta');
    const gambar = () => {
      host.innerHTML = '';
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      const v = fitur.map((f) => +f.properties.p0).filter(Number.isFinite).sort(d3.ascending);
      const skala = d3.scaleThreshold().domain(d3.range(1, 6).map((i) => d3.quantile(v, i / 6))).range(WARNA);
      const proj = d3.geoMercator().fitExtent([[10, 10], [w - 10, h - 10]], { type: 'FeatureCollection', features: fitur });
      const path = d3.geoPath(proj);
      const svg = d3.select(host).append('svg').attr('width', w).attr('height', h).attr('aria-hidden', 'true');
      svg.append('g').selectAll('path').data(fitur).join('path').attr('class', 'hp').attr('d', path)
        .attr('fill', (f) => skala(+f.properties.p0))
        .style('animation-delay', (f) => `${(path.centroid(f)[0] / w * 1.2 + 0.5).toFixed(2)}s`);
    };
    gambar();
    let tunda;
    new ResizeObserver(() => { clearTimeout(tunda); tunda = setTimeout(gambar, 200); }).observe(host);
  }).catch(() => { const el = document.getElementById('hero-angka'); if (el) el.textContent = '\u2013'; });
})();