// PESI — Pulmonary Embolism Severity Index (Aujesky et al. 2005)
// Akut PE'de 30 günlük mortalite riski. Orijinal PESI (yaşa dayalı, 5 sınıf).
// sPESI (basitleştirilmiş) klinikte yaygın; burada orijinal granüler versiyon.

const KANSER = ['malignite', 'kanser', 'cancer', 'tümör', 'karsinom', 'sarkom', 'lenfoma', 'lösemi', 'malign', 'ca', 'metastatik', 'metastaz'];

export default {
  id: 'pesi',
  ad: 'PESI',
  kategori: 'vte',
  kilavuz: 'Aujesky 2005 / ESC 2024',
  aciklama: 'Akut PE — 30 günlük mortalite sınıfı',
  link: 'https://www.mdcalc.com/calc/1304/pulmonary-embolism-severity-index-pesi',

  inputs: [
    { key: 'yas',      tip: 'sayi', label: 'Yaş', birim: 'yıl', min: 18, max: 120, autofill: 'yas' },
    { key: 'cinsiyet', tip: 'enum', label: 'Cinsiyet', autofill: 'cinsiyet',
      secenekler: [{ v: 'K', label: 'Kadın (0)' }, { v: 'E', label: 'Erkek (+10)' }] },
    { key: 'malignite', tip: 'bool', label: 'Kanser öyküsü (+30)', autofillTanilar: KANSER },
    { key: 'kalpYet',   tip: 'bool', label: 'Kronik kalp yetmezliği (+10)',
      autofillTanilar: ['kalp yetmezliği', 'hfref', 'hfpef', 'konjestif', 'ky'] },
    { key: 'kronikAkc', tip: 'bool', label: 'Kronik akciğer hastalığı (+10)',
      autofillTanilar: ['koah', 'kronik akciğer', 'amfizem', 'astım', 'gold'] },
    { key: 'nabiz110',  tip: 'bool', label: 'Nabız ≥110/dk (+20)' },
    { key: 'sbp100',    tip: 'bool', label: 'Sistolik KB <100 mmHg (+30)' },
    { key: 'ss30',      tip: 'bool', label: 'Solunum sayısı ≥30/dk (+20)' },
    { key: 'ates36',    tip: 'bool', label: 'Ateş <36 °C (+20)' },
    { key: 'mental',    tip: 'bool', label: 'Mental durum değişikliği (+60)' },
    { key: 'spo290',    tip: 'bool', label: 'Arteriyel O₂ satürasyonu <%90 (+20)' }
  ],

  calc(v) {
    const yas = +v.yas || 0;
    const bilesenler = [
      { ad: 'Yaş',                       puan: yas },
      { ad: 'Erkek cinsiyet',            puan: v.cinsiyet === 'E' ? 10 : 0 },
      { ad: 'Kanser',                    puan: v.malignite ? 30 : 0 },
      { ad: 'Kronik kalp yetmezliği',    puan: v.kalpYet   ? 10 : 0 },
      { ad: 'Kronik akciğer hastalığı',  puan: v.kronikAkc ? 10 : 0 },
      { ad: 'Nabız ≥110/dk',             puan: v.nabiz110  ? 20 : 0 },
      { ad: 'SBP <100 mmHg',             puan: v.sbp100    ? 30 : 0 },
      { ad: 'Solunum ≥30/dk',            puan: v.ss30      ? 20 : 0 },
      { ad: 'Ateş <36 °C',               puan: v.ates36    ? 20 : 0 },
      { ad: 'Mental durum değişikliği',  puan: v.mental    ? 60 : 0 },
      { ad: 'SpO₂ <%90',                 puan: v.spo290    ? 20 : 0 }
    ];
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);

    let sinif;
    if (puan <= 65)       sinif = 'I';
    else if (puan <= 85)  sinif = 'II';
    else if (puan <= 105) sinif = 'III';
    else if (puan <= 125) sinif = 'IV';
    else                  sinif = 'V';

    return { puan, max: null, sinif, bilesenler };
  },

  interpret(r) {
    const s = r.sinif;
    if (s === 'I' || s === 'II') {
      return {
        etiket: `${r.puan} puan — Sınıf ${s} (düşük risk)`,
        seviye: 'stabil',
        mesaj: `30 günlük mortalite ${s === 'I' ? '~%1.0' : '~%3.1'}. Seçilmiş hastalarda erken taburculuk/ayaktan tedavi düşünülebilir.`,
        detay: 'ESC 2024: PESI I-II (veya sPESI=0) + sağ ventrikül normal + Hestia uygunsa ayaktan. Sosyal/klinik uygunluk değerlendir.'
      };
    }
    if (s === 'III') {
      return {
        etiket: `${r.puan} puan — Sınıf III (orta risk)`,
        seviye: 'izlem',
        mesaj: '30 günlük mortalite ~%6.5. Hastane yatışı önerilir.',
        detay: 'Orta-yüksek riski ayırmak için sağ ventrikül (EKO/BT) + troponin değerlendir.'
      };
    }
    return {
      etiket: `${r.puan} puan — Sınıf ${s} (yüksek risk)`,
      seviye: 'kritik',
      mesaj: `30 günlük mortalite ${s === 'IV' ? '~%10.4' : '~%24.5'}. Yakın izlem; hemodinami bozulursa reperfüzyon (tromboliz) değerlendir.`,
      detay: 'Yoğun bakım/monitörizasyon. Sağ ventrikül disfonksiyonu + biyobelirteç ile risk sınıflaması.'
    };
  }
};
