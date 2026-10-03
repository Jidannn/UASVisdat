/* umum.js — pustaka bersama untuk seluruh halaman (dimuat setelah d3).
   - Kisah.dataPeta: satu kali unduh GeoJSON untuk hero dan Bab 1
   - Kisah.buatPanggung: pengendali panggung scroll (teks kiri, grafik kanan)
   - animasi muncul saat terlihat, navigasi atas, bilah progres */
(() => {
  'use strict';
  const K = window.Kisah = {};
  K.modul = { umum: 9 };                           // dicek oleh index.html: berkas lama terdeteksi

  K.kurangiGerak = matchMedia('(prefers-reduced-motion: reduce)').matches;
  K.gulir = K.kurangiGerak ? 'auto' : 'smooth';
  // 'no-cache': browser selalu memeriksa ke server apakah berkas data berubah (tetap hemat: 304 bila sama)
  K.json = (url) => d3.json(url, { cache: 'no-cache' });
  K.dataPeta = K.json('data/kabkota_miskin.geojson');
  K.dataPeta.catch(() => {});                      // galat ditangani oleh pemakai masing-masing

  const loc = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3] });
  K.f0 = loc.format(',.0f'); K.f1 = loc.format(',.1f'); K.f2 = loc.format(',.2f');
  K.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.daftarDan = (arr) => arr.length < 2 ? arr.join('')
    : arr.length === 2 ? arr.join(' dan ') : arr.slice(0, -1).join(', ') + ', dan ' + arr[arr.length - 1];

  /* pastikan elemen yang dibutuhkan ada; jika tidak, beri pesan yang jelas */
  K.pastikanDom = function (ids) {
    const hilang = ids.filter((id) => !document.getElementById(id));
    if (hilang.length) {
      throw new Error(`index.html tidak cocok dengan skrip: elemen ${hilang.map((h) => '#' + h).join(', ')} tidak ditemukan. Pastikan index.html adalah versi terbaru`);
    }
  };

  /* ---------- panggung scroll ----------
     DOM yang diharapkan (scope = 'b1', 'b3', ...):
       #<scope>-teks (aside), #<scope>-no, #<scope>-dots, #<scope>-judul, #<scope>-isi,
       #<scope>-prev, #<scope>-next, #<scope>-pemicu (wadah penanda langkah)          */
  K.buatPanggung = function ({ scope, langkah, onAktif }) {
    K.pastikanDom(['teks', 'no', 'dots', 'judul', 'isi', 'prev', 'next', 'pemicu'].map((x) => `${scope}-${x}`));
    const $ = (s) => document.getElementById(`${scope}-${s}`);
    const pemicu = d3.select($('pemicu')).selectAll('div.pemicu').data(langkah).join('div')
      .attr('class', 'pemicu').attr('data-i', (d, i) => i);
    let aktif = -1;

    /* di layar sempit, tiap penanda langkah menampilkan kartu teksnya sendiri (panel samping disembunyikan lewat CSS) */
    pemicu.each(function (d, i) {
      this.innerHTML = `<article class="kartu-langkah"><span class="lk-no">Langkah ${i + 1} dari ${langkah.length}</span>
        <h3>${K.esc(d.judul)}</h3><div class="lk-isi">${d.isi()}</div></article>`;
    });

    d3.select($('dots')).selectAll('button').data(langkah).join('button').attr('type', 'button')
      .attr('aria-label', (d, i) => `Langkah ${i + 1}: ${d.judul}`).on('click', (e, d) => keLangkah(langkah.indexOf(d)));

    function keLangkah(i) {
      i = Math.max(0, Math.min(langkah.length - 1, i));
      pemicu.nodes()[i].scrollIntoView({ block: 'center', behavior: K.gulir });
      aktifkan(i);
    }
    function aktifkan(i) {
      if (i === aktif) return;
      const L = langkah[i];
      aktif = i;
      d3.select($('dots')).selectAll('button').classed('on', (d, k) => k === i).attr('aria-current', (d, k) => (k === i ? 'step' : null));
      $('no').textContent = `Langkah ${i + 1} dari ${langkah.length}`;
      $('judul').textContent = L.judul;
      const isi = $('isi');
      isi.innerHTML = L.isi();
      [isi, $('judul')].forEach((n) => { n.classList.remove('masuk'); void n.offsetWidth; n.classList.add('masuk'); });
      $('prev').disabled = i === 0; $('next').disabled = i === langkah.length - 1;
      $('teks').scrollTop = 0;
      if (onAktif) onAktif(i, L);
    }
    $('prev').addEventListener('click', () => keLangkah(aktif - 1));
    $('next').addEventListener('click', () => keLangkah(aktif + 1));

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) aktifkan(+e.target.dataset.i); });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    pemicu.each(function () { io.observe(this); });

    return { keLangkah, aktifkan, langkah, get aktif() { return aktif; } };
  };

  /* ---------- muncul saat terlihat ---------- */
  const muncul = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('terlihat'); muncul.unobserve(e.target); } });
  }, { threshold: 0.18 });
  document.querySelectorAll('.muncul').forEach((n) => muncul.observe(n));

  /* ---------- navigasi atas + bilah progres ---------- */
  const nav = document.getElementById('nav-atas');
  const bar = document.getElementById('progres');
  let tunggu = false;
  function perbaruiGulir() {
    const y = scrollY, h = innerHeight, maks = document.documentElement.scrollHeight - h;
    if (bar) bar.style.transform = `scaleX(${maks > 0 ? Math.min(1, y / maks) : 0})`;
    if (nav) nav.classList.toggle('tampil', y > h * 0.7);
    tunggu = false;
  }
  addEventListener('scroll', () => { if (!tunggu) { tunggu = true; requestAnimationFrame(perbaruiGulir); } }, { passive: true });
  addEventListener('resize', perbaruiGulir);
  perbaruiGulir();

  const bagian = ['bab1', 'bab2', 'bab3', 'kesimpulan'].map((id) => document.getElementById(id)).filter(Boolean);
  if (bagian.length && nav) {
    const ioNav = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        nav.querySelectorAll('a[data-bab]').forEach((a) => {
          if (a.dataset.bab === e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    bagian.forEach((s) => ioNav.observe(s));
  }
})();