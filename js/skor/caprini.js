// Caprini VTE Risk Skoru (2005 versiyonu) — cerrahi/genel hastada VTE riski
// Maddeler ağırlıklı (1/2/3/5 puan). Yaş ayrı bir sayı alanı olarak alınır,
// kademe (41-60:+1, 61-74:+2, ≥75:+3) calc'ta hesaplanır.
//
// NOT: bool'lar `varsayilan: false` — uzun kontrol listesi; her madde baştan "Hayır",
// kullanıcı yalnızca geçerli olanları işaretler (skor anında hesaplanır).

const KANSER = ['malignite', 'kanser', 'cancer', 'tümör', 'karsinom', 'sarkom', 'lenfoma', 'lösemi', 'malign', 'ca', 'metastatik', 'metastaz'];
const VTE = ['dvt', 'derin ven trombozu', 'pulmoner emboli', 'pe', 'vte', 'tromboemboli'];
const TROMBOFILI = ['trombofili', 'faktör v', 'faktor v', 'leiden', 'protrombin', 'antifosfolipid', 'protein c', 'protein s', 'antitrombin', 'lupus antikoagülan', 'antikardiyolipin', 'homosistein', 'hit'];
const b = (key, label, autofill) => ({ key, tip: 'bool', label, varsayilan: false, ...autofill });

export default {
  id: 'caprini',
  ad: 'Caprini',
  kategori: 'vte',
  kilavuz: 'Caprini 2005',
  aciklama: 'Cerrahi/genel hastada VTE riski',
  link: 'https://www.mdcalc.com/calc/968/caprini-score-venous-thromboembolism-2005',

  inputs: [
    { key: 'yas', tip: 'sayi', label: 'Yaş', birim: 'yıl', min: 18, max: 120, autofill: 'yas' },

    // 1 puan
    b('minorCerrahi', 'Minör cerrahi planlı (+1)'),
    b('bmi25',        'BMI >25 (+1)'),
    b('bacakOdem',    'Bacaklarda şişlik (+1)'),
    b('varis',        'Varisli venler (+1)'),
    b('gebelik',      'Gebelik veya lohusalık <1 ay (+1)'),
    b('dusuk',        'Açıklanamayan/tekrarlayan düşük öyküsü (+1)'),
    b('hormonal',     'Oral kontraseptif / HRT (+1)', { autofillIlaclar: ['östrojen', 'estrojen', 'oral kontraseptif', 'hormon', 'progesteron'] }),
    b('sepsis',       'Sepsis <1 ay (+1)'),
    b('akcHastalik',  'Ciddi akciğer hastalığı / pnömoni <1 ay (+1)'),
    b('koah',         'Anormal pulmoner fonksiyon / KOAH (+1)', { autofillTanilar: ['koah', 'amfizem', 'gold'] }),
    b('akutMi',       'Akut miyokard enfarktüsü (+1)'),
    b('kalpYet',      'Konjestif kalp yetmezliği <1 ay (+1)', { autofillTanilar: ['kalp yetmezliği', 'hfref', 'hfpef', 'konjestif', 'ky'] }),
    b('ibd',          'İnflamatuar barsak hastalığı öyküsü (+1)', { autofillTanilar: ['crohn', 'ülseratif kolit', 'ulseratif kolit', 'ibd', 'inflamatuar barsak'] }),
    b('yatakMedikal', 'Yatak istirahatinde medikal hasta (+1)'),

    // 2 puan
    b('artroskopik',     'Artroskopik cerrahi (+2)'),
    b('majorCerrahi',    'Majör açık cerrahi >45 dk (+2)'),
    b('laparoskopik',    'Laparoskopik cerrahi >45 dk (+2)'),
    b('malignite',       'Malignite (+2)', { autofillTanilar: KANSER }),
    b('yatak72',         'Yatağa bağımlı >72 saat (+2)'),
    b('alci',            'İmmobilize edici alçı (+2)'),
    b('santralKateter',  'Santral venöz kateter (+2)'),

    // 3 puan
    b('onceVte',    'Geçirilmiş VTE öyküsü (+3)', { autofillTanilar: VTE }),
    b('aileVte',    'Ailede VTE öyküsü (+3)'),
    b('trombofili', 'Trombofili (F.V Leiden, protrombin 20210A, lupus antikoag., antikardiyolipin, hiperhomosistein, HIT, vb.) (+3)', { autofillTanilar: TROMBOFILI }),

    // 5 puan
    b('inme',          'İnme <1 ay (+5)', { autofillTanilar: ['inme', 'iskemik inme', 'svo', 'serebrovasküler'] }),
    b('artroplasti',   'Elektif majör alt ekstremite artroplastisi (+5)'),
    b('kirik',         'Kalça/pelvis/bacak kırığı <1 ay (+5)'),
    b('spinal',        'Akut spinal kord yaralanması <1 ay (+5)'),
    b('coklutravma',   'Çoklu travma <1 ay (+5)')
  ],

  calc(v) {
    const yas = +v.yas || 0;
    let yasPuan = 0, yasAd = '≤40';
    if (yas >= 75)      { yasPuan = 3; yasAd = '≥75'; }
    else if (yas >= 61) { yasPuan = 2; yasAd = '61-74'; }
    else if (yas >= 41) { yasPuan = 1; yasAd = '41-60'; }

    const PUAN = {
      // 1
      minorCerrahi: 1, bmi25: 1, bacakOdem: 1, varis: 1, gebelik: 1, dusuk: 1,
      hormonal: 1, sepsis: 1, akcHastalik: 1, koah: 1, akutMi: 1, kalpYet: 1,
      ibd: 1, yatakMedikal: 1,
      // 2
      artroskopik: 2, majorCerrahi: 2, laparoskopik: 2, malignite: 2, yatak72: 2,
      alci: 2, santralKateter: 2,
      // 3
      onceVte: 3, aileVte: 3, trombofili: 3,
      // 5
      inme: 5, artroplasti: 5, kirik: 5, spinal: 5, coklutravma: 5
    };

    const ETIKET = Object.fromEntries(this.inputs.filter(i => i.tip === 'bool').map(i => [i.key, i.label.replace(/\s*\(\+\d\)\s*$/, '')]));

    // Bileşen dökümü: yaş her zaman + yalnızca işaretli (puanı >0) maddeler
    const bilesenler = [{ ad: `Yaş (${yasAd})`, puan: yasPuan }];
    let toplam = yasPuan;
    for (const [key, p] of Object.entries(PUAN)) {
      if (v[key]) { toplam += p; bilesenler.push({ ad: ETIKET[key] || key, puan: p }); }
    }

    return { puan: toplam, max: null, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 5) {
      return {
        etiket: `${p} puan — yüksek risk`,
        seviye: 'kritik',
        mesaj: 'Farmakolojik + mekanik profilaksi önerilir (kontrendikasyon yoksa LMWH/UFH + bası çorabı/IPC).',
        detay: 'Yüksek riskli cerrahide uzatılmış profilaksi (28 güne dek) değerlendirilebilir.'
      };
    }
    if (p >= 3) {
      return {
        etiket: `${p} puan — orta risk`,
        seviye: 'izlem',
        mesaj: 'Farmakolojik veya mekanik profilaksi önerilir; kanama riskine göre seç.',
        detay: 'Caprini 3-4: orta risk.'
      };
    }
    if (p >= 1) {
      return {
        etiket: `${p} puan — düşük risk`,
        seviye: 'stabil',
        mesaj: 'Mekanik profilaksi (erken mobilizasyon, bası çorabı) yeterli olabilir.',
        detay: 'Caprini 1-2: düşük risk.'
      };
    }
    return {
      etiket: '0 puan — çok düşük risk',
      seviye: 'stabil',
      mesaj: 'Spesifik profilaksi gerekmez; erken mobilizasyon.',
      detay: ''
    };
  }
};
