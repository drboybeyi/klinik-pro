// MELD 3.0 — UNOS Temmuz 2023
// Kim et al. Gastroenterology 2021
// MELD 3.0 = 1.33×(female) + 4.56×ln(bili) + 0.82×(137-Na) - 0.24×(137-Na)×ln(bili)
//          + 9.09×ln(INR) + 11.14×ln(Cr) + 1.85×(3.5-alb) - 1.83×(3.5-alb)×ln(Cr) + 6
//
// Clipping kuralları (UNOS):
//   Bili ≥ 1.0    | INR ≥ 1.0
//   Na: 125-137   | Cr: 1.0-3.0 (diyaliz haftada ≥2 → Cr = 3.0)
//   Alb: 1.5-3.5
//   Female: 1 / Male: 0
//   Sonuç 6-40 aralığında clip edilir.

export default {
  id: 'meld3',
  ad: 'MELD 3.0',
  kategori: 'hepato',
  kilavuz: 'UNOS Tem 2023',
  aciklama: 'Siroz prognoz / transplant önceliği (≥12 yaş)',
  link: 'https://optn.transplant.hrsa.gov/news/improving-meld-the-new-meld-3-0/',

  inputs: [
    { key: 'cinsiyet', tip: 'enum', label: 'Cinsiyet', autofill: 'cinsiyet',
      secenekler: [{ v: 'E', label: 'Erkek' }, { v: 'K', label: 'Kadın' }] },
    { key: 'bilirubin', tip: 'ondalik', label: 'Total bilirubin', birim: 'mg/dL', min: 0.1, max: 50, adim: 0.1 },
    { key: 'inr',       tip: 'ondalik', label: 'INR',             birim: '',      min: 0.5, max: 20, adim: 0.01 },
    { key: 'kreatinin', tip: 'ondalik', label: 'Serum kreatinin', birim: 'mg/dL', min: 0.1, max: 15, adim: 0.01 },
    { key: 'sodyum',    tip: 'sayi',    label: 'Serum sodyum',    birim: 'mEq/L', min: 100, max: 160 },
    { key: 'albumin',   tip: 'ondalik', label: 'Serum albümin',   birim: 'g/dL',  min: 0.5, max: 7,  adim: 0.1 },
    { key: 'diyaliz',   tip: 'bool',    label: 'Haftada ≥2 diyaliz veya 24 sa CRRT (son hafta)' }
  ],

  calc(v) {
    const female = v.cinsiyet === 'K' ? 1 : 0;

    // Clipping
    let bili = Math.max(+v.bilirubin, 1.0);
    let inr  = Math.max(+v.inr, 1.0);
    let cr   = v.diyaliz ? 3.0 : Math.max(Math.min(+v.kreatinin, 3.0), 1.0);
    let na   = Math.max(Math.min(+v.sodyum, 137), 125);
    let alb  = Math.max(Math.min(+v.albumin, 3.5), 1.5);

    const lnBili = Math.log(bili);
    const lnInr  = Math.log(inr);
    const lnCr   = Math.log(cr);
    const naDiff = 137 - na;
    const albDiff = 3.5 - alb;

    let meld = 1.33 * female
             + 4.56 * lnBili
             + 0.82 * naDiff
             - 0.24 * naDiff * lnBili
             + 9.09 * lnInr
             + 11.14 * lnCr
             + 1.85 * albDiff
             - 1.83 * albDiff * lnCr
             + 6;

    meld = Math.round(meld);
    meld = Math.max(6, Math.min(meld, 40));

    return {
      puan: meld,
      max: 40,
      bilesenler: [
        { ad: 'Cinsiyet',         puan: female ? 'Kadın (+1.33)' : 'Erkek' },
        { ad: 'Bilirubin',        puan: `${(+v.bilirubin).toFixed(1)} (kullanılan ${bili.toFixed(1)})` },
        { ad: 'INR',              puan: `${(+v.inr).toFixed(2)} (kullanılan ${inr.toFixed(2)})` },
        { ad: 'Kreatinin',        puan: `${(+v.kreatinin).toFixed(2)} (kullanılan ${cr.toFixed(2)})${v.diyaliz ? ' • diyaliz' : ''}` },
        { ad: 'Sodyum',           puan: `${+v.sodyum} (kullanılan ${na})` },
        { ad: 'Albümin',          puan: `${(+v.albumin).toFixed(1)} (kullanılan ${alb.toFixed(1)})` }
      ]
    };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 30) {
      return {
        etiket: `MELD 3.0 = ${p} — çok yüksek mortalite`,
        seviye: 'kritik',
        mesaj: '3 aylık mortalite ~%52+. Transplant değerlendirmesi acildir.',
        detay: 'UNOS önceliği yüksek. Yoğun hepatoloji izlemi.'
      };
    }
    if (p >= 20) {
      return {
        etiket: `MELD 3.0 = ${p} — yüksek mortalite`,
        seviye: 'kritik',
        mesaj: '3 aylık mortalite ~%20. Transplant listesi değerlendirmesi.',
        detay: 'Hepatoloji konsültasyonu, varis taraması güncel olmalı.'
      };
    }
    if (p >= 15) {
      return {
        etiket: `MELD 3.0 = ${p} — orta mortalite`,
        seviye: 'izlem',
        mesaj: '3 aylık mortalite ~%6. Transplant değerlendirmesi başlatılabilir (MELD ≥15).',
        detay: ''
      };
    }
    if (p >= 10) {
      return {
        etiket: `MELD 3.0 = ${p} — düşük-orta mortalite`,
        seviye: 'izlem',
        mesaj: '3 aylık mortalite ~%1.9. Düzenli hepatoloji takibi.',
        detay: ''
      };
    }
    return {
      etiket: `MELD 3.0 = ${p} — düşük mortalite`,
      seviye: 'stabil',
      mesaj: '3 aylık mortalite ~%1. Rutin izlem.',
      detay: ''
    };
  }
};
