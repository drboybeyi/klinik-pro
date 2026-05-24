// ABCD² — GİA (TIA) sonrası erken inme riski (Johnston et al. Lancet 2007)
// 2 günlük inme riski. Not: güncel pratik tüm GİA'larda hızlı uzman değerlendirmesi öneriyor;
// ABCD² tek başına triyaj için yeterli kabul edilmiyor (NICE 2019).

export default {
  id: 'abcd2',
  ad: 'ABCD²',
  kategori: 'noro',
  kilavuz: 'Johnston 2007',
  aciklama: 'GİA sonrası 2 günlük inme riski',
  link: 'https://www.mdcalc.com/calc/357/abcd2-score-tia',

  inputs: [
    { key: 'yas',      tip: 'sayi', label: 'Yaş', birim: 'yıl', min: 18, max: 120, autofill: 'yas' },
    { key: 'tansiyon', tip: 'bool', label: 'Başvuru TA ≥140/90 mmHg (+1)' },
    { key: 'klinik',   tip: 'enum', label: 'Klinik bulgu',
      secenekler: [
        { v: '0', label: 'Diğer (0)' },
        { v: '1', label: 'Konuşma bozukluğu, güçsüzlük yok (+1)' },
        { v: '2', label: 'Tek taraflı güçsüzlük (+2)' }
      ] },
    { key: 'sure',     tip: 'enum', label: 'Semptom süresi',
      secenekler: [
        { v: '0', label: '<10 dk (0)' },
        { v: '1', label: '10-59 dk (+1)' },
        { v: '2', label: '≥60 dk (+2)' }
      ] },
    { key: 'diyabet',  tip: 'bool', label: 'Diyabet (+1)',
      autofillTanilar: ['diyabet', 'dm', 't2dm', 't1dm', 'diabetes'] }
  ],

  calc(v) {
    const yas = +v.yas || 0;
    const bilesenler = [
      { ad: 'Yaş ≥60',        puan: yas >= 60 ? 1 : 0 },
      { ad: 'TA ≥140/90',     puan: v.tansiyon ? 1 : 0 },
      { ad: 'Klinik bulgu',   puan: +v.klinik || 0 },
      { ad: 'Süre',           puan: +v.sure || 0 },
      { ad: 'Diyabet',        puan: v.diyabet ? 1 : 0 }
    ];
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 7, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 6) {
      return {
        etiket: `${p} puan — yüksek risk`,
        seviye: 'kritik',
        mesaj: '2 günlük inme riski ~%8.1. Acil değerlendirme, nörogörüntüleme ve hospitalizasyon önerilir.',
        detay: 'Antitrombotik başlat, karotis ve kardiyak kaynak araştır (ABCD² ≥4 genelde hızlı uzman/yatış gerektirir).'
      };
    }
    if (p >= 4) {
      return {
        etiket: `${p} puan — orta risk`,
        seviye: 'izlem',
        mesaj: '2 günlük inme riski ~%4.1. Hızlı (≤24 saat) uzman değerlendirmesi, sekonder korunma başlat.',
        detay: ''
      };
    }
    return {
      etiket: `${p} puan — düşük risk`,
      seviye: 'stabil',
      mesaj: '2 günlük inme riski ~%1.0. Yine de erken değerlendirme + sekonder korunma önerilir.',
      detay: 'ABCD² tek başına triyajda yetersiz olabilir (NICE: tüm GİA\'lar ≤24 sa uzman değerlendirmesi).'
    };
  }
};
