// CKD-EPI 2021 (race-free) — Inker et al. NEJM 2021
// eGFR = 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^-1.200 × 0.9938^Age × (1.012 if female)
// κ: 0.7 (kadın), 0.9 (erkek) | α: -0.241 (kadın), -0.302 (erkek)

export default {
  id: 'ckdEpi2021',
  ad: 'CKD-EPI 2021',
  kategori: 'renal',
  kilavuz: 'NEJM 2021 (race-free)',
  aciklama: 'eGFR — kronik böbrek hastalığı evrelemesi',
  link: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2102953',

  inputs: [
    { key: 'yas',      tip: 'sayi', label: 'Yaş', min: 18, max: 120, autofill: 'yas' },
    { key: 'cinsiyet', tip: 'enum', label: 'Cinsiyet', autofill: 'cinsiyet',
      secenekler: [{ v: 'E', label: 'Erkek' }, { v: 'K', label: 'Kadın' }] },
    { key: 'kreatinin', tip: 'ondalik', label: 'Serum kreatinin', birim: 'mg/dL', min: 0.1, max: 20, adim: 0.01, labParseAlan: 'kreatinin' }
  ],

  calc(v) {
    const yas = +v.yas;
    const scr = +v.kreatinin;
    const kadin = v.cinsiyet === 'K';

    const kappa = kadin ? 0.7 : 0.9;
    const alfa  = kadin ? -0.241 : -0.302;

    const ratio = scr / kappa;
    const minPart = Math.pow(Math.min(ratio, 1), alfa);
    const maxPart = Math.pow(Math.max(ratio, 1), -1.200);
    const yasPart = Math.pow(0.9938, yas);
    const cinsPart = kadin ? 1.012 : 1;

    const egfr = 142 * minPart * maxPart * yasPart * cinsPart;
    const egfrYuv = Math.round(egfr);

    // KDIGO evrelemesi
    let evre, evreAd;
    if (egfr >= 90)      { evre = 'G1';  evreAd = 'Normal/yüksek'; }
    else if (egfr >= 60) { evre = 'G2';  evreAd = 'Hafif azalma'; }
    else if (egfr >= 45) { evre = 'G3a'; evreAd = 'Hafif-orta azalma'; }
    else if (egfr >= 30) { evre = 'G3b'; evreAd = 'Orta-ileri azalma'; }
    else if (egfr >= 15) { evre = 'G4';  evreAd = 'İleri azalma'; }
    else                 { evre = 'G5';  evreAd = 'Böbrek yetmezliği'; }

    return {
      puan: egfrYuv,
      birim: 'mL/dk/1.73m²',
      max: null,
      evre,
      evreAd,
      bilesenler: [
        { ad: 'Yaş',        puan: yas },
        { ad: 'Cinsiyet',   puan: kadin ? 'Kadın' : 'Erkek' },
        { ad: 'Kreatinin',  puan: `${scr} mg/dL` },
        { ad: 'KDIGO evre', puan: `${evre} (${evreAd})` }
      ]
    };
  },

  interpret(r) {
    const e = r.evre;
    if (e === 'G5') {
      return {
        etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
        seviye: 'kritik',
        mesaj: 'Renal replasman tedavisine hazırlık (diyaliz veya transplant). Nefroloji izlemi şart.',
        detay: 'KDIGO G5: eGFR <15 mL/dk/1.73m². Üremi semptomları, hiperkalemi, asidoz değerlendirmesi.'
      };
    }
    if (e === 'G4') {
      return {
        etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
        seviye: 'kritik',
        mesaj: 'Nefroloji konsültasyonu. Komplikasyonlar (anemi, hiperparatiroidi, asidoz) tarama; vasküler erişim planlaması.',
        detay: 'KDIGO G4: eGFR 15-29. İlaç doz ayarı zorunlu (özellikle DOAC, metformin).'
      };
    }
    if (e === 'G3b') {
      return {
        etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
        seviye: 'izlem',
        mesaj: 'Nefroloji konsültasyonu önerilir. KBH komplikasyonları tarama. İlaç doz ayarı.',
        detay: 'KDIGO G3b: eGFR 30-44.'
      };
    }
    if (e === 'G3a') {
      return {
        etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
        seviye: 'izlem',
        mesaj: 'KBH evresi — yıllık eGFR ve albüminüri (UACR) takibi. Risk faktör kontrolü (HT, DM).',
        detay: 'KDIGO G3a: eGFR 45-59.'
      };
    }
    if (e === 'G2') {
      return {
        etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
        seviye: 'stabil',
        mesaj: 'Hafif azalma — albüminüri varsa KBH. Yıllık takip yeterli.',
        detay: 'KDIGO G2: eGFR 60-89.'
      };
    }
    return {
      etiket: `eGFR ${r.puan} — ${e} (${r.evreAd})`,
      seviye: 'stabil',
      mesaj: 'Normal/yüksek eGFR. Risk faktörü varsa rutin takip.',
      detay: 'KDIGO G1: eGFR ≥90.'
    };
  }
};
