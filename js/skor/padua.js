// Padua Prediction Score — hastanede yatan MEDİKAL hastalarda VTE riski
// (Barbar et al. J Thromb Haemost 2010). ≥4 → yüksek risk, farmakolojik profilaksi.

const KANSER = ['malignite', 'kanser', 'cancer', 'tümör', 'karsinom', 'sarkom', 'lenfoma', 'lösemi', 'malign', 'ca', 'metastatik', 'metastaz'];
const VTE = ['dvt', 'derin ven trombozu', 'pulmoner emboli', 'pe', 'vte', 'tromboemboli'];
const TROMBOFILI = ['trombofili', 'faktör v', 'faktor v', 'leiden', 'antifosfolipid', 'protein c', 'protein s', 'antitrombin', 'lupus antikoagülan', 'antikardiyolipin'];

export default {
  id: 'padua',
  ad: 'Padua',
  kategori: 'vte',
  kilavuz: 'Barbar 2010',
  aciklama: 'Yatan medikal hastada VTE riski',
  link: 'https://www.mdcalc.com/calc/2151/padua-prediction-score-risk-vte',

  inputs: [
    { key: 'malignite',  tip: 'bool', label: 'Aktif kanser (+3)', autofillTanilar: KANSER },
    { key: 'onceVte',    tip: 'bool', label: 'Geçirilmiş VTE (yüzeyel hariç) (+3)', autofillTanilar: VTE },
    { key: 'immobilite', tip: 'bool', label: 'İmmobilite — yatak istirahati ≥3 gün (+3)' },
    { key: 'trombofili', tip: 'bool', label: 'Bilinen trombofili (+3)', autofillTanilar: TROMBOFILI },
    { key: 'travma',     tip: 'bool', label: 'Son ≤1 ay travma veya cerrahi (+2)' },
    { key: 'yas',        tip: 'sayi', label: 'Yaş', birim: 'yıl', min: 18, max: 120, autofill: 'yas' },
    { key: 'kalpSolYet', tip: 'bool', label: 'Kalp ve/veya solunum yetmezliği (+1)',
      autofillTanilar: ['kalp yetmezliği', 'hfref', 'hfpef', 'konjestif', 'ky', 'solunum yetmezliği', 'koah'] },
    { key: 'miInme',     tip: 'bool', label: 'Akut MI veya iskemik inme (+1)',
      autofillTanilar: ['miyokard enfarktüsü', 'mi', 'inme', 'iskemik inme', 'svo', 'stemi', 'nstemi'] },
    { key: 'enfRom',     tip: 'bool', label: 'Akut enfeksiyon ve/veya romatolojik hastalık (+1)',
      autofillTanilar: ['enfeksiyon', 'pnömoni', 'sepsis', 'romatoid', 'romatolojik', 'sle', 'vaskülit', 'fmf'] },
    { key: 'obezite',    tip: 'bool', label: 'Obezite (BMI ≥30) (+1)' },
    { key: 'hormonal',   tip: 'bool', label: 'Devam eden hormonal tedavi (+1)',
      autofillIlaclar: ['östrojen', 'estrojen', 'oral kontraseptif', 'hormon', 'tamoksifen', 'progesteron'] }
  ],

  calc(v) {
    const yas = +v.yas || 0;
    const bilesenler = [
      { ad: 'Aktif kanser',                    puan: v.malignite  ? 3 : 0 },
      { ad: 'Geçirilmiş VTE',                  puan: v.onceVte    ? 3 : 0 },
      { ad: 'İmmobilite (≥3 gün)',             puan: v.immobilite ? 3 : 0 },
      { ad: 'Trombofili',                      puan: v.trombofili ? 3 : 0 },
      { ad: 'Travma / cerrahi (≤1 ay)',        puan: v.travma     ? 2 : 0 },
      { ad: 'Yaş ≥70',                         puan: yas >= 70    ? 1 : 0 },
      { ad: 'Kalp / solunum yetmezliği',       puan: v.kalpSolYet ? 1 : 0 },
      { ad: 'Akut MI / iskemik inme',          puan: v.miInme     ? 1 : 0 },
      { ad: 'Enfeksiyon / romatolojik',        puan: v.enfRom     ? 1 : 0 },
      { ad: 'Obezite (BMI ≥30)',               puan: v.obezite    ? 1 : 0 },
      { ad: 'Hormonal tedavi',                 puan: v.hormonal   ? 1 : 0 }
    ];
    const puan = bilesenler.reduce((s, b) => s + b.puan, 0);
    return { puan, max: null, bilesenler };
  },

  interpret(r) {
    const p = r.puan;
    if (p >= 4) {
      return {
        etiket: `${p} puan — yüksek VTE riski`,
        seviye: 'kritik',
        mesaj: 'Farmakolojik tromboprofilaksi endike (kontrendikasyon yoksa LMWH/UFH). Kanama riski varsa mekanik profilaksi.',
        detay: 'Profilaksi öncesi kanama riski (örn. IMPROVE) ve böbrek fonksiyonu değerlendir.'
      };
    }
    return {
      etiket: `${p} puan — düşük VTE riski`,
      seviye: 'stabil',
      mesaj: 'Rutin farmakolojik profilaksi önerilmez. Erken mobilizasyon; klinik değişimde yeniden değerlendir.',
      detay: ''
    };
  }
};
