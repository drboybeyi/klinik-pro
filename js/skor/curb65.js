// CURB-65 — Lim et al. Thorax 2003
// Toplum kaynaklı pnömoni şiddet skoru

export default {
  id: 'curb65',
  ad: 'CURB-65',
  kategori: 'infek',
  kilavuz: 'Lim 2003 (BTS/IDSA)',
  aciklama: 'Toplum kaynaklı pnömoni şiddet ve yönetim',
  link: 'https://thorax.bmj.com/content/58/5/377',

  // Lab parser BUN ve üre ayrı alanlar olarak ister; applyLabParse hangisi
  // dönerse ona göre ureBirim'i de ayarlar.
  labParseEk: ['BUN'],

  applyLabParse(parsed) {
    // BUN tercih edilir (Türk lablarında yaygın); yoksa üre (mmol/L)
    if (parsed?.BUN?.deger != null && !Number.isNaN(+parsed.BUN.deger)) {
      return { ure: +parsed.BUN.deger, ureBirim: 'mgdl' };
    }
    if (parsed?.ure?.deger != null && !Number.isNaN(+parsed.ure.deger)) {
      return { ure: +parsed.ure.deger, ureBirim: 'mmol' };
    }
    return {};
  },

  inputs: [
    { key: 'konfuzyon', tip: 'bool', label: 'Konfüzyon (yeni başlangıçlı dezoryantasyon)' },
    { key: 'ure',       tip: 'ondalik', label: 'Üre / BUN', birim: 'mmol/L (BUN için >19 mg/dL)', min: 0, max: 100, adim: 0.1, labParseAlan: 'ure' },
    { key: 'ureBirim',  tip: 'enum', label: 'Birim',
      secenekler: [
        { v: 'mmol', label: 'mmol/L' },
        { v: 'mgdl', label: 'mg/dL (BUN)' }
      ] },
    { key: 'rr',        tip: 'sayi', label: 'Solunum sayısı (/dk)', min: 0, max: 80 },
    { key: 'sbp',       tip: 'sayi', label: 'Sistolik kan basıncı (mmHg)', min: 40, max: 250 },
    { key: 'dbp',       tip: 'sayi', label: 'Diastolik kan basıncı (mmHg)', min: 20, max: 150 },
    { key: 'yas',       tip: 'sayi', label: 'Yaş', min: 0, max: 120, autofill: 'yas' }
  ],

  calc(v) {
    // Üre eşiği: 7 mmol/L = ~19 mg/dL BUN (BUN ≈ üre / 2.14)
    const ureMmol = v.ureBirim === 'mgdl' ? (+v.ure) / 2.8 : +v.ure;
    // Aslında BUN(mg/dL) → üre(mmol/L) için /2.8 yaygın yaklaşım; ama makale BUN >19 mg/dL diyor
    const ureYuksek = v.ureBirim === 'mgdl' ? (+v.ure > 19) : (+v.ure > 7);

    const yas = +v.yas || 0;
    const sbp = +v.sbp || 0;
    const dbp = +v.dbp || 0;
    const rr  = +v.rr  || 0;

    const bilesenler = [
      { ad: 'C — Konfüzyon',             puan: v.konfuzyon ? 1 : 0 },
      { ad: 'U — Üre yüksek',            puan: ureYuksek ? 1 : 0 },
      { ad: 'R — Solunum ≥30/dk',        puan: rr >= 30 ? 1 : 0 },
      { ad: 'B — SBP<90 veya DBP≤60',    puan: (sbp < 90 || dbp <= 60) ? 1 : 0 },
      { ad: '65 — Yaş ≥65',              puan: yas >= 65 ? 1 : 0 }
    ];

    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: 5, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 4) {
      return {
        etiket: `${p} puan — çok ağır pnömoni`,
        seviye: 'kritik',
        mesaj: '30 günlük mortalite ~%27-57. Yoğun bakım değerlendirmesi.',
        detay: 'Geniş spektrumlu IV antibiyotik, hemodinamik destek, solunum desteği.'
      };
    }
    if (p === 3) {
      return {
        etiket: '3 puan — ağır pnömoni',
        seviye: 'kritik',
        mesaj: '30 günlük mortalite ~%14. Hastane yatışı, yoğun bakım değerlendirmesi düşünülmeli.',
        detay: ''
      };
    }
    if (p === 2) {
      return {
        etiket: '2 puan — orta',
        seviye: 'izlem',
        mesaj: '30 günlük mortalite ~%9. Kısa süreli hastane yatışı uygundur.',
        detay: ''
      };
    }
    if (p === 1) {
      return {
        etiket: '1 puan — düşük',
        seviye: 'stabil',
        mesaj: '30 günlük mortalite ~%2.7. Ayaktan tedavi mümkün; hasta tercihi ve komorbidite değerlendirilmeli.',
        detay: ''
      };
    }
    return {
      etiket: '0 puan — çok düşük',
      seviye: 'stabil',
      mesaj: '30 günlük mortalite ~%0.7. Ayaktan tedavi uygun.',
      detay: ''
    };
  }
};
