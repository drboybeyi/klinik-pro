import { db, storage } from './firebase-config.js';
import {
  ref, set, get, push, update, remove, onValue, off
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';
import { setState } from './state.js';

let _uid = null;
const _listeners = {};

export function setCurrentUser(uid) { _uid = uid; }

function userRef(path) { return ref(db, `users/${_uid}/${path}`); }

// --- Listeners ---

export function startListeners() {
  ['hastalar', 'tanilar', 'ilaclar', 'alerjiler', 'notlar', 'tetkikler', 'aiSorgulari', 'ayarlar']
    .forEach(_listen);
}

export function stopListeners() {
  Object.values(_listeners).forEach(r => off(r));
  Object.keys(_listeners).forEach(k => delete _listeners[k]);
}

function _listen(col) {
  const r = userRef(col);
  _listeners[col] = r;
  onValue(r, snap => setState(col, snap.val() || {}));
}

// --- Hasta CRUD ---

export async function createHasta(data) {
  const r = push(userRef('hastalar'));
  await set(r, { ...data, id: r.key, olusturmaTarih: new Date().toISOString() });
  return r.key;
}

export async function updateHasta(id, data) {
  await update(userRef(`hastalar/${id}`), { ...data, guncellemeTarih: new Date().toISOString() });
}

export async function deleteHastaWithRelated(hastaId) {
  const cols = ['tanilar', 'ilaclar', 'alerjiler', 'notlar', 'tetkikler'];
  const deletes = [remove(userRef(`hastalar/${hastaId}`))];
  for (const col of cols) {
    const snap = await get(userRef(col));
    if (snap.exists()) {
      snap.forEach(child => {
        const v = child.val();
        if (v.hastaId === hastaId) {
          // Tetkik silinirken yüklü Storage dosyalarını da temizle (best-effort)
          if (col === 'tetkikler') {
            for (const d of (v.dosyalar || [])) {
              if (d.path) deletes.push(deleteTetkikDosya(d.path).catch(() => {}));
            }
          }
          deletes.push(remove(userRef(`${col}/${child.key}`)));
        }
      });
    }
  }
  await Promise.all(deletes);
}

// --- Tanı CRUD ---

export async function saveTani(data) {
  if (data.id) {
    await update(userRef(`tanilar/${data.id}`), data);
    return data.id;
  }
  const r = push(userRef('tanilar'));
  await set(r, { ...data, id: r.key, tarih: new Date().toISOString() });
  return r.key;
}

export async function deleteTani(id) {
  await remove(userRef(`tanilar/${id}`));
}

// --- İlaç CRUD ---

export async function saveIlac(data) {
  if (data.id) {
    await update(userRef(`ilaclar/${data.id}`), data);
    return data.id;
  }
  const r = push(userRef('ilaclar'));
  await set(r, { ...data, id: r.key, tarih: new Date().toISOString() });
  return r.key;
}

export async function deleteIlac(id) {
  await remove(userRef(`ilaclar/${id}`));
}

// --- Alerji CRUD ---

export async function saveAlerji(data) {
  if (data.id) {
    await update(userRef(`alerjiler/${data.id}`), data);
    return data.id;
  }
  const r = push(userRef('alerjiler'));
  await set(r, { ...data, id: r.key, tarih: new Date().toISOString() });
  return r.key;
}

export async function deleteAlerji(id) {
  await remove(userRef(`alerjiler/${id}`));
}

// --- Not CRUD ---

export async function saveNot(data) {
  if (data.id) {
    await update(userRef(`notlar/${data.id}`), data);
    return data.id;
  }
  const r = push(userRef('notlar'));
  await set(r, { ...data, id: r.key, olusturmaTarih: new Date().toISOString() });
  return r.key;
}

export async function deleteNot(id) {
  await remove(userRef(`notlar/${id}`));
}

// --- Tetkik CRUD + Storage ---

export async function saveTetkik(data) {
  if (data.id) {
    await update(userRef(`tetkikler/${data.id}`), data);
    return data.id;
  }
  const r = push(userRef('tetkikler'));
  await set(r, { ...data, id: r.key, olusturmaTarih: new Date().toISOString() });
  return r.key;
}

export async function deleteTetkik(id) {
  // Önce dosyaları Storage'tan sil (best-effort), sonra RTDB kaydını sil
  const snap = await get(userRef(`tetkikler/${id}`));
  if (snap.exists()) {
    const dosyalar = snap.val().dosyalar || [];
    await Promise.all(dosyalar.map(d =>
      d.path ? deleteTetkikDosya(d.path).catch(() => {}) : Promise.resolve()
    ));
  }
  await remove(userRef(`tetkikler/${id}`));
}

function _safeFileName(name) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 80);
}

/**
 * Storage'a dosya yükler ve progress callback'i çağırır.
 * @returns {Promise<{ad, url, path, boyut, tip, yuklemeTarihi}>}
 */
export function uploadTetkikDosya(file, hastaId, onProgress) {
  return new Promise((resolve, reject) => {
    if (!_uid) return reject(new Error('Oturum yok'));
    const path = `users/${_uid}/tetkikler/${hastaId}/${Date.now()}-${_safeFileName(file.name)}`;
    const r = storageRef(storage, path);
    const task = uploadBytesResumable(r, file, { contentType: file.type });

    task.on('state_changed',
      snap => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
      err  => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({
          ad: file.name,
          url,
          path,
          boyut: file.size,
          tip: file.type || 'application/octet-stream',
          yuklemeTarihi: new Date().toISOString()
        });
      }
    );
  });
}

export async function deleteTetkikDosya(path) {
  try {
    await deleteObject(storageRef(storage, path));
  } catch (e) {
    // Dosya yoksa sessizce geç; diğer hatalarda fırlat
    if (e.code !== 'storage/object-not-found') throw e;
  }
}

// --- AI Sorgu CRUD ---

export async function saveAiSorgu(data) {
  const r = push(userRef('aiSorgulari'));
  await set(r, { ...data, id: r.key, olusturmaTarih: new Date().toISOString() });
  return r.key;
}

export async function deleteAiSorgu(id) {
  await remove(userRef(`aiSorgulari/${id}`));
}

// --- Ayarlar ---

export async function saveAyarlar(data) {
  await update(userRef('ayarlar'), data);
}

// --- Init ---

export async function initDefaultData() {
  const snap = await get(userRef('ayarlar'));
  if (snap.exists()) return;
  await set(userRef('ayarlar'), { pinAktif: false, pin: null, kilitSuresi: 5 });
}

// --- Seed ---
// Idempotent: aynı isimli hasta varsa hasta/tanı/ilaç ekleme yapmaz,
// ancak SEED'deki serbest-metin alanları için backfill yapar (boş olanları doldurur,
// elle girilenleri ezmez). Ayrıca v0.3.2.b'de hasta objesi içinde tutulan
// laboratuvar/goruntuleme/digerTetkikler alanları artık `tetkikler/` koleksiyonuna
// taşındığı için seed çalışırken bu ölü alanlar mevcut kayıtlardan temizlenir.

const SEMPTOM_KEYS = ['sikayetler', 'hikaye', 'ozgecmis', 'soygecmis', 'fmBulgular'];
const ESKI_TETKIK_KEYS = ['laboratuvar', 'goruntuleme', 'digerTetkikler']; // v0.3.2.b → v0.3.3 migration

export async function seedHastalar() {
  const now = new Date().toISOString();

  const [hSnap, tSnap] = await Promise.all([
    get(userRef('hastalar')),
    get(userRef('tetkikler'))
  ]);

  const mevcutMap = new Map();
  if (hSnap.exists()) {
    hSnap.forEach(child => {
      const v = child.val();
      const ad = (v.ad || '').trim().toLowerCase();
      if (ad) mevcutMap.set(ad, { id: child.key, data: v });
    });
  }

  // Her hasta için kayıtlı tetkik sayısı (idempotent ekleme için)
  const tetkikSayisi = new Map();
  if (tSnap.exists()) {
    tSnap.forEach(child => {
      const hid = child.val().hastaId;
      if (hid) tetkikSayisi.set(hid, (tetkikSayisi.get(hid) || 0) + 1);
    });
  }

  const SEED = [
    {
      hasta: {
        ad: 'Selahattin İkisivri', yas: 89, cinsiyet: 'E', mrn: 'SI-89E',
        klinikOzet: 'HFrEF EF %25-30, LVDD evre 3, asendan aort 3.9 cm, MY/TY orta, PABS 60. Plan: Coveram → 36sa washout → Entresto 24/26 2x1; 1. hafta Forxiga ekle. Cardura XL → Tamsulosin geçiş. Lab 06.05.26: BNP 817, Kr 0.56/GFR 98, K 4.1, Na 142, Hgb 12.7. 14.04.26: CRP 111.6, TropI 17.6. PSA 3.81 → üroloji şart.',
        sikayetler: 'Nefes darlığı (eforla), bacaklarda şişlik, gece sırtüstü uyuyamama. 1 hafta önce ortopneyle uyandı.',
        hikaye: '3 ay önce dekompanze KY ile yatış. Coveram başlandı. Son 2 hafta ilerleyen ortopne ve bilateral pretibial ödem. NT-proBNP 817 (artmış).',
        ozgecmis: 'Hipertansiyon 15 yıl, KAH 8 yıl, BPH 5 yıl. PCI 2020. Asetilsalisilik asit, statin kullanıyor.',
        soygecmis: 'Baba 65y MI nedeniyle ex. Erkek kardeş HT.',
        fmBulgular: 'TA 118/72, KH 88, SS 22/dk. Akciğer bazallerde ince raller. S3 duyuluyor. Bilateral 2+ pretibial ödem. JVD belirgin (10 cm).',
        laboratuvar: '06.05.2026: NT-proBNP 817 ↑, Kreatinin 0.56 / eGFR 98, K 4.1, Na 142, Hgb 12.7. 14.04.2026: CRP 111.6 ↑, Troponin I 17.6 ↑. PSA 3.81 — üroloji konsültasyonu planlandı.',
        goruntuleme: 'Ekokardiyografi: EF %25-30, LVDD evre 3, MY/TY orta, PABS 60 mmHg. Asendan aort 3.9 cm (dilatasyon, yıllık takip).',
        digerTetkikler: 'EKG: sinüs ritmi, ileti bozukluğu yok. PA grafi: kardiyomegali (+), aktif pulmoner konjesyon bulgusu yok.'
      },
      tanilar: [
        { tanim: 'HFrEF EF %25-30',                seviye: 'kritik', icd: 'I50.21' },
        { tanim: 'LVDD evre 3',                    seviye: 'kritik', icd: '' },
        { tanim: 'Asendan aort dilatasyonu 3.9 cm', seviye: 'izlem',  icd: '' },
        { tanim: 'MY/TY orta',                     seviye: 'izlem',  icd: '' },
        { tanim: 'BPH PSA 3.81',                   seviye: 'izlem',  icd: '' },
        { tanim: 'Mikroalbüminüri',                seviye: 'izlem',  icd: '' }
      ],
      ilaclar: [
        { ad: 'Coveram',    doz: '',         siklik: '',    endikasyon: 'HFrEF geçiş', durum: 'kesilecek' },
        { ad: 'Entresto',   doz: '24/26 mg', siklik: '2x1', endikasyon: 'HFrEF',       durum: 'aktif' },
        { ad: 'Forxiga',    doz: '10 mg',    siklik: '1x1', endikasyon: 'HFrEF',       durum: 'planli' },
        { ad: 'Tamsulosin', doz: '0.4 mg',   siklik: '1x1', endikasyon: 'BPH',         durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-06', tur: 'kan',  baslik: 'Tam biyokimya + NT-proBNP', ozet: 'NT-proBNP 817 ↑, Kreatinin 0.56 / eGFR 98, K 4.1, Na 142, Hgb 12.7', kritik: false },
        { tarih: '2026-04-14', tur: 'kan',  baslik: 'Akut faz + troponin',       ozet: 'CRP 111.6 ↑, Troponin I 17.6 ↑. PSA 3.81 — üroloji konsültasyonu planlandı', kritik: true },
        { tarih: '2026-05-01', tur: 'echo', baslik: 'Ekokardiyografi',           ozet: 'EF %25-30, LVDD evre 3, MY/TY orta, PABS 60 mmHg. Asendan aort 3.9 cm (dilatasyon, yıllık takip)', kritik: true },
        { tarih: '2026-04-14', tur: 'ekg',  baslik: 'EKG + PA grafi',            ozet: 'EKG: sinüs ritmi, ileti bozukluğu yok. PA grafi: kardiyomegali (+), aktif pulmoner konjesyon yok', kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Ertuğrul Tüfekçi', yas: 68, cinsiyet: 'E', mrn: 'ET-68E',
        klinikOzet: 'KOAH akut alevlenme. Foster + Avelox + Prednol 16 mg/gün. PA grafi 06.05.2026: bilateral hiperinflasyon, diyafragma düzleşmesi. Plan: Prednol 5-7 gün (GOLD 2025), moksifloksasin 5-7 gün, LAMA ekle (Trimbow/Trelegy), eozinofil + spirometri + AKG + NT-proBNP, LDCT tarama, aşılama, PE/KY DDx.',
        sikayetler: '5 gündür artan nefes darlığı, balgam miktarı arttı (sarı-yeşil). Wheezing belirgin.',
        hikaye: '20 paket-yıl sigara öyküsü. 4 yıldır KOAH tanılı. Son alevlenme 8 ay önce.',
        ozgecmis: 'KOAH GOLD evre 3. HT yok, DM yok. Aşıları eksik (pnömokok, grip).',
        soygecmis: 'Anne KOAH, baba AC Ca (sigara).',
        fmBulgular: 'TA 130/80, KH 102, SS 26/dk, SpO2 oda havası 89%. Bilateral yaygın ronküs ve wheezing. Aksesuar kas kullanımı +.',
        laboratuvar: 'Bekleyen: tam kan eozinofil sayımı, NT-proBNP, arter kan gazı. Atak için CRP gönderildi. Serum elektrolitleri normal sınırlarda.',
        goruntuleme: 'PA grafi 06.05.2026: bilateral hiperinflasyon, diyafragma düzleşmesi, akut konsolidasyon yok. LDCT akciğer tarama (sigara öyküsü) planlandı.',
        digerTetkikler: 'Spirometri post-tedavi planlandı. Pnömokok ve grip aşıları eksik — planda.'
      },
      tanilar: [
        { tanim: 'KOAH akut alevlenme', seviye: 'kritik', icd: 'J44.1' },
        { tanim: 'KOAH GOLD 2025',      seviye: 'izlem',  icd: 'J44.9' }
      ],
      ilaclar: [
        { ad: 'Foster inhaler',          doz: '',       siklik: '2x1', endikasyon: 'KOAH',           durum: 'aktif' },
        { ad: 'Avelox (moksifloksasin)', doz: '400 mg', siklik: '1x1', endikasyon: 'KOAH alevlenme', durum: 'aktif' },
        { ad: 'Prednol',                 doz: '16 mg',  siklik: '1x1', endikasyon: 'KOAH alevlenme', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-06', tur: 'rontgen', baslik: 'PA akciğer grafi',      ozet: 'Bilateral hiperinflasyon, diyafragma düzleşmesi, akut konsolidasyon yok',        kritik: false },
        { tarih: '2026-05-08', tur: 'kan',     baslik: 'Atak paneli (CRP)',     ozet: 'Bekleyen: tam kan eozinofil sayımı, NT-proBNP, AKG. CRP gönderildi',           kritik: false },
        { tarih: '2026-05-15', tur: 'diger',   baslik: 'Spirometri (planlı)',   ozet: 'Post-tedavi spirometri planlandı. Pnömokok ve grip aşıları eksik — planda',    kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Şükriye Sönduk', yas: 60, cinsiyet: 'K', mrn: 'SS-60K',
        klinikOzet: 'Yükselen Kromogranin A: 28.02.2026=124 → 16.04.2026=200 µg/L (%61↑, 7 haftada). PPI/H2RA yok. Plan: yalancı pozitif eleme (gastrin, eGFR, KCFT, TSH, anti-parietal Ab, B12, H.pylori), açlıkta 3. CgA tekrarı, klinik sorgulama (karsinoid, feo, MEN), 5-HIAA/metanefrin/NSE, üst GİS endoskopi, BT ± 68Ga-DOTATATE.',
        sikayetler: 'Belirgin şikayet yok. Rutin check-up\'ta yüksek kromogranin A tespit edildi.',
        hikaye: 'Asemptomatik. CgA: Şubat 124, Nisan 200 µg/L (% 61 artış). Flush, ishal, taşikardi öyküsü yok.',
        ozgecmis: 'Hashimoto tiroiditi (Euthyrox 50 mcg).',
        soygecmis: 'Anne meme Ca, teyze tiroid Ca.',
        fmBulgular: 'TA 122/78, KH 76. Boyun: tiroid normal. Karın: yumuşak, organomegali yok. Cilt: flush/telanjiektazi yok.',
        laboratuvar: 'Kromogranin A: 28.02.2026 = 124 → 16.04.2026 = 200 µg/L (% 61 artış, 7 hafta). PPI/H2RA kullanımı yok. Plan: gastrin, eGFR, KCFT, TSH, anti-parietal Ab, B12, H.pylori; açlıkta 3. CgA tekrarı; 24 saat idrar 5-HIAA, plazma/idrar metanefrin, NSE.',
        goruntuleme: 'Üst GİS endoskopi planlandı. Abdominal BT ± 68Ga-DOTATATE PET değerlendirmeye alındı.',
        digerTetkikler: ''
      },
      tanilar: [
        { tanim: 'Yükselen Kromogranin A', seviye: 'izlem', icd: '' },
        { tanim: 'NET şüphesi workup',     seviye: 'izlem', icd: '' }
      ],
      ilaclar: [],
      tetkikler: [
        { tarih: '2026-04-16', tur: 'kan',   baslik: 'Kromogranin A (kontrol)', ozet: 'CgA 200 µg/L (28.02.2026=124 → 16.04.2026=200, %61 artış, 7 hafta). Plan: açlıkta 3. CgA tekrarı', kritik: true },
        { tarih: '2026-05-10', tur: 'diger', baslik: 'NET workup paneli',       ozet: 'İstemler: gastrin, eGFR, KCFT, TSH, anti-parietal Ab, B12, H.pylori, 24 saat idrar 5-HIAA, plazma/idrar metanefrin, NSE',                       kritik: false },
        { tarih: '2026-05-20', tur: 'bt',    baslik: 'Abdominal BT (planlı)',   ozet: 'Üst GİS endoskopi planlandı. Abdominal BT ± 68Ga-DOTATATE PET değerlendirmeye alındı',                                                          kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Türcihan Çelik', yas: 63, cinsiyet: 'K', mrn: 'TC-63K',
        klinikOzet: 'Warfarin 20 yıl (unprovoke DVT). INR: 2.36→2.44→2.92. GFR: 50→46→40 (3 ayda -10, hızlı düşüş). BUN Mar.26=100.9. Hgb ~11.2 normositik. HbA1c 5.77, Albümin/Kr=24. Plan: APS paneli (LAC+aCL+anti-β2GPI+ANA+dsDNA+C3/C4) — warfarin notu şart. APS(-) ise apixaban 5 mg 2x1. GFR nedeni araştırılacak.',
        sikayetler: 'Aktif şikayet yok. Rutin INR ve böbrek fonksiyonları takibi için başvurdu. Son haftalarda hafif halsizlik.',
        hikaye: '20 yıl önce unprovoke DVT sonrası warfarin başlandı, INR 2-3 aralığında tutuluyor. Son 3 ayda eGFR 50→46→40 (10 puan kayıp), INR 2.36→2.44→2.92 yükselişte. Mart.26 BUN 100.9. Hgb ~11.2 normositik. APS workup planlandı — APS(-) çıkarsa apixaban geçişi gündemde.',
        ozgecmis: 'Unprovoke DVT (yaklaşık 20 yıl önce). Kronik warfarin kullanımı. DM yok, HT yok. Önceden APS taraması yapılmamış.',
        soygecmis: 'Belirgin tromboembolik hastalık öyküsü yok. Annede HT, babada KAH.',
        fmBulgular: 'TA 128/76, KH 72. Bacaklarda kronik venöz değişiklik (+), aktif DVT bulgusu yok (Homans negatif, asimetri yok). Periferik nabızlar palpabl. Cilt: ekimoz veya peteşi yok. Karın yumuşak.',
        laboratuvar: 'INR: 2.36 → 2.44 → 2.92 (son 3 ölçüm, yükselişte). eGFR: 50 → 46 → 40 (3 ayda 10 puan kayıp). Mart.2026 BUN 100.9 ↑. Hgb ~11.2 (normositik). HbA1c 5.77. Albümin/Kreatinin oranı 24. APS paneli istendi (LAC + aCL + anti-β2GPI + ANA + dsDNA + C3/C4) — warfarin notu eklendi.',
        goruntuleme: 'Bekleyen: renal USG (hızlı eGFR düşüşü etyolojisi). Önceki abdominal görüntüleme yok.',
        digerTetkikler: 'Periferik damar değerlendirmesi: bilinen DVT sekeli, aktif yeni trombüs bulgusu yok.'
      },
      tanilar: [
        { tanim: 'Unprovoke DVT (20 yıl warfarin)', seviye: 'izlem',  icd: 'I82.4' },
        { tanim: 'Hızlı GFR düşüşü (-10/3 ay)',     seviye: 'kritik', icd: '' },
        { tanim: 'APS şüphesi workup',              seviye: 'izlem',  icd: '' }
      ],
      ilaclar: [
        { ad: 'Warfarin', doz: '', siklik: '', endikasyon: 'Unprovoke DVT (INR hedef 2-3)', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-05', tur: 'kan', baslik: 'INR + böbrek paneli', ozet: 'INR 2.92 ↑, eGFR 40 (3 ayda 10 puan kayıp). BUN 100.9 ↑. Hgb ~11.2, HbA1c 5.77',                       kritik: true  },
        { tarih: '2026-05-08', tur: 'kan', baslik: 'APS paneli',          ozet: 'LAC + aCL + anti-β2GPI + ANA + dsDNA + C3/C4 istendi — warfarin notu eklendi',                          kritik: false },
        { tarih: '2026-05-12', tur: 'usg', baslik: 'Renal USG (planlı)',  ozet: 'Renal USG planlandı (hızlı eGFR düşüşü etyolojisi)',                                                    kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Dursun Ağyüz', yas: 70, cinsiyet: 'E', mrn: 'DA-70E',
        klinikOzet: 'KC siroz Child B (MELD-Na ~16). Aldacton 100, Lasix, Dideral, Duphalac. BT: makrolobülasyon + milimetrik hipodens odaklar (kontrastsız — HCC dışlanmadı). Anti-HBc IgG+, HBsAg−. Lab 01.05.2026: NH3 127, K 5.59, Cr 1.15/eGFR 61, LDH 299, Na 130, Alb 2.9, PLT 91. Bekleyen: AFP, kontrastlı KC MR/BT, HBV-DNA, rifaximin, aldacton revizyon, endoskopi.',
        sikayetler: 'Karın şişliği, halsizlik, gündüz uyku eğilimi (eşi son 2 haftadır artış belirtiyor). 10 gün önce ev içinde konfüzyon atağı.',
        hikaye: '4 yıl önce siroz tanısı konuldu (Anti-HBc IgG+, kronik geçirilmiş HBV). Asit ve bacak ödemi atakları tekrarlıyor. Son BT\'de makrolobülasyon + milimetrik hipodens odaklar — kontrastsız çekildiği için HCC ekarte edilemedi. 01.05.2026 NH3 127 → hepatik ensefalopati ile uyumlu, rifaximin eklemesi planlandı. K 5.59 nedeniyle aldakton revizyonu gündemde.',
        ozgecmis: 'Kronik geçirilmiş HBV (HBsAg−, Anti-HBc IgG+). HCV negatif. Alkol kullanımı yok. Bilinen HT/DM yok. Üst GİS endoskopi henüz yapılmamış (varis taraması bekleniyor).',
        soygecmis: 'Belirgin karaciğer hastalığı öyküsü yok.',
        fmBulgular: 'TA 110/68, KH 86, ateş yok. Skleralarda hafif ikter. Karın: distandü, shifting dullness (+), spider angioma 2 adet. Bilateral pretibial ödem +1. Asterixis (+). Bilinç: oryantasyon korunmuş ancak yavaş yanıtlar (West Haven grade 1-2)',
        laboratuvar: '01.05.2026: NH3 127 ↑, K 5.59 ↑, Kreatinin 1.15 / eGFR 61, LDH 299, Na 130 ↓, Albümin 2.9 ↓, PLT 91 ↓. HBsAg negatif, Anti-HBc IgG pozitif. Bekleyen: AFP, HBV-DNA.',
        goruntuleme: 'Abdominal BT (kontrastsız): makrolobülasyon + milimetrik hipodens odaklar — HCC ekarte edilemedi. Plan: kontrastlı KC MR veya dinamik BT.',
        digerTetkikler: 'Üst GİS endoskopi bekleniyor (özofagus varis taraması).'
      },
      tanilar: [
        { tanim: 'KC siroz Child B (MELD-Na 16)',      seviye: 'kritik', icd: 'K74.6' },
        { tanim: 'HCC şüphesi (kontrastsız BT)',       seviye: 'kritik', icd: '' },
        { tanim: 'Hiperamonyemi',                       seviye: 'izlem',  icd: '' },
        { tanim: 'Hiperkalemi',                         seviye: 'izlem',  icd: '' }
      ],
      ilaclar: [
        { ad: 'Aldacton', doz: '100 mg', siklik: '1x1', endikasyon: 'Asit',                  durum: 'aktif' },
        { ad: 'Lasix',    doz: '',       siklik: '',    endikasyon: 'Asit',                  durum: 'aktif' },
        { ad: 'Dideral',  doz: '',       siklik: '',    endikasyon: 'Variks profilaksisi',   durum: 'aktif' },
        { ad: 'Duphalac', doz: '',       siklik: '',    endikasyon: 'Hepatik ensefalopati',  durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-01', tur: 'kan',       baslik: 'KC paneli + NH3',         ozet: 'NH3 127 ↑, K 5.59 ↑, Kreatinin 1.15/eGFR 61, LDH 299, Na 130 ↓, Albümin 2.9 ↓, PLT 91 ↓. HBsAg negatif, Anti-HBc IgG pozitif', kritik: true  },
        { tarih: '2026-04-25', tur: 'bt',        baslik: 'Abdominal BT (kontrastsız)', ozet: 'Makrolobülasyon + milimetrik hipodens odaklar — HCC ekarte edilemedi. Plan: kontrastlı KC MR veya dinamik BT',           kritik: true  },
        { tarih: '2026-05-15', tur: 'endoskopi', baslik: 'Üst GİS endoskopi (planlı)', ozet: 'Özofagus varis taraması bekleniyor',                                                                                       kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Kerime Uysal', yas: 80, cinsiyet: 'K', mrn: 'KU-80K',
        klinikOzet: 'Akut deliryum (zoopsi), halsizlik, ayak ödemi. Hgb 8.6/MCV 62.3/Ferritin 10.1 (DEA), hematüri, GFR 48 (AKI), K 3.37/Mg 1.05/P 2.5 (refrakter hipokalemi — Mg eksikliğine bağlı), CRP 62.3, AKŞ 267/HbA1c 5.7, metabolik alkaloz. Plan: yatış, Mg+K+P+tiamin, GİS endoskopi, BT ürografi + sistoskopi (ürotelyal Ca taraması), beyin BT, kültürler, ilaç sorgulaması, Lewy/Wernicke ayırıcı tanı.',
        sikayetler: '2 gün önce başlayan akut konfüzyon — "duvarda hayvanlar görüyorum" (zoopsi). Halsizlik, ayak ödemi. Son haftada iştahsızlık ve sıvı alımında azalma.',
        hikaye: 'Bazal kognisyonu normal olan hasta, evde halüsinasyon ve ajitasyon geliştirince yakınları tarafından getirildi. Hgb 8.6 / MCV 62.3 / Ferritin 10.1 — kronik DEA. GFR 48 (AKI), CRP 62.3 (enfeksiyon olası), AKŞ 267 ancak HbA1c 5.7 (stres hiperglisemisi). K 3.37, Mg 1.05, P 2.5 — refrakter hipokalemi muhtemelen hipomagnezemiye sekonder. Metabolik alkaloz ve hematüri mevcut — ürotelyal Ca taraması (BT ürografi + sistoskopi) planlandı.',
        ozgecmis: 'Bilinen DM/HT tanısı yok ya da tanımlanmamış. Demir replasmanı veya GİS endoskopi öyküsü yok. Polifarmasi sorgulanmadı.',
        soygecmis: 'Ablada kolon Ca öyküsü.',
        fmBulgular: 'Bilinç: konfüze, oryantasyon kısmi (zaman−, yer ±, kişi+). TA 138/82, KH 96, ateş 37.4. Konjonktiva soluk, dil papillaları silik. Bilateral pretibial ödem +1. Nörolojik: asterixis yok, lateralize bulgu yok. Mini-mental kooperasyon kısıtlı, ölçülemedi.',
        laboratuvar: 'Hgb 8.6 ↓ / MCV 62.3 ↓ / Ferritin 10.1 ↓ — kronik mikrositer DEA. eGFR 48 (AKI). K 3.37 ↓, Mg 1.05 ↓, P 2.5 ↓ — refrakter hipokalemi (muhtemelen Mg eksikliğine sekonder). CRP 62.3 ↑. AKŞ 267 / HbA1c 5.7 (stres hiperglisemisi). Metabolik alkaloz. Hematüri (+). Kan ve idrar kültürleri gönderildi.',
        goruntuleme: 'Beyin BT planlandı (akut deliryum etyolojisi). BT ürografi + sistoskopi: ürotelyal Ca taraması (hematüri).',
        digerTetkikler: 'GİS endoskopi planlandı (mikrositer DEA kaynağı). EKG: sinüs ritmi, QTc normal.'
      },
      tanilar: [
        { tanim: 'Akut deliryum (zoopsi)',           seviye: 'kritik', icd: 'F05' },
        { tanim: 'Demir eksikliği anemisi (mikrositer)', seviye: 'kritik', icd: '' },
        { tanim: 'AKI (GFR 48)',                     seviye: 'kritik', icd: '' },
        { tanim: 'Hipomagnezemi + refrakter hipokalemi', seviye: 'kritik', icd: '' },
        { tanim: 'Hematüri — ürotelyal Ca?',         seviye: 'izlem',  icd: '' }
      ],
      ilaclar: [],
      tetkikler: [
        { tarih: '2026-05-12', tur: 'kan',   baslik: 'Acil panel',          ozet: 'Hgb 8.6 / MCV 62.3 / Ferritin 10.1 (DEA). eGFR 48 (AKI). K 3.37, Mg 1.05, P 2.5 (refrakter hipokalemi). CRP 62.3 ↑. AKŞ 267, HbA1c 5.7. Metabolik alkaloz', kritik: true },
        { tarih: '2026-05-13', tur: 'idrar', baslik: 'İdrar analizi + kültür', ozet: 'Hematüri (+). İdrar kültürü gönderildi. Kan kültürleri de alındı',                                                                                                kritik: true },
        { tarih: '2026-05-14', tur: 'bt',    baslik: 'Beyin BT (planlı)',   ozet: 'Akut deliryum etyolojisi. BT ürografi + sistoskopi: ürotelyal Ca taraması (hematüri)',                                                                                  kritik: false },
        { tarih: '2026-05-14', tur: 'ekg',   baslik: 'EKG',                 ozet: 'Sinüs ritmi, QTc normal',                                                                                                                                              kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Ömer Özel', yas: 50, cinsiyet: 'E', mrn: 'OO-50E',
        klinikOzet: 'Biyokimyasal hipertiroidi: FT3 6.56, FT4 2.53, TSH 0.01. TRAb negatif, Anti-TPO negatif. USG: diffüz guatr, heterojen hipoekoik, nodül yok. MMI 20 mg/gün × 7 gün → yanıt yok. Tanı: Muhtemel Jod-Basedow veya sessiz tiroidit. Bekleyen: Doppler USG, Tiroglobulin, idrar iyot, IL-6, TRAb tekrarı.',
        sikayetler: 'Çarpıntı, terleme, son 2 ayda yaklaşık 3 kg kilo kaybı. Sıcak intoleransı, hafif el tremoru.',
        hikaye: '2 ay önce çarpıntı yakınmasıyla başvurdu. FT3 6.56, FT4 2.53, TSH 0.01 — biyokimyasal hipertiroidi. TRAb (−) ve Anti-TPO (−). USG: diffüz guatr, heterojen hipoekoik, nodül yok. MMI 20 mg/gün başlandı; 7 gün sonra hormon değerlerinde düşüş yok. Ayırıcı tanıda Jod-Basedow ve sessiz tiroidit ön planda — yakın iyot maruziyeti sorgulanacak.',
        ozgecmis: 'Yakın dönemde kontrastlı görüntüleme öyküsü sorgulanacak (iyot yükü). Bilinen tiroid hastalığı yok. KAH/DM yok.',
        soygecmis: 'Anne hipotiroidi, kız kardeş Graves hastalığı.',
        fmBulgular: 'TA 132/74, KH 104 (sinüs taşikardi), ateş yok. Boyun: diffüz hafif büyümüş tiroid, palpabl nodül yok, tiroid üzerinde üfürüm duyulmadı. Hafif distal tremor (+). Cilt sıcak ve nemli. Egzoftalmi yok, lid lag yok.',
        laboratuvar: 'FT3 6.56 ↑, FT4 2.53 ↑, TSH 0.01 ↓. TRAb negatif, Anti-TPO negatif. Bekleyen: tiroglobulin, 24 saat idrar iyot atılımı, IL-6, TRAb tekrarı.',
        goruntuleme: 'Tiroid USG: diffüz guatr, heterojen hipoekoik parankim, nodül yok. Plan: Doppler USG (vaskülarite — Graves vs sessiz tiroidit ayırıcısı).',
        digerTetkikler: ''
      },
      tanilar: [
        { tanim: 'Hipertiroidi (TRAb negatif)', seviye: 'izlem', icd: 'E05.9' },
        { tanim: 'Diffüz guatr',                 seviye: 'izlem', icd: '' }
      ],
      ilaclar: [
        { ad: 'Metimazol', doz: '20 mg', siklik: '1x1', endikasyon: 'Hipertiroidi', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-04-15', tur: 'kan', baslik: 'Tiroid fonksiyon',    ozet: 'FT3 6.56 ↑, FT4 2.53 ↑, TSH 0.01 ↓. TRAb negatif, Anti-TPO negatif',                                                          kritik: false },
        { tarih: '2026-04-18', tur: 'usg', baslik: 'Tiroid USG',          ozet: 'Diffüz guatr, heterojen hipoekoik parankim, nodül yok. Plan: Doppler USG (Graves vs sessiz tiroidit ayırıcısı)',             kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Nasiba Atag', yas: 33, cinsiyet: 'K', mrn: 'NA-33K',
        klinikOzet: 'FMF + artralji, kolşisine yanıtlı. Lab 16.03.2026: ANA (FANA) POZİTİF 4+ nükleer benekli, Anti-dsDNA 78.17 (negatif <100), C4 0.13 düşük. ENA profili istendi. Romatoloji konsültasyonu planlandı.',
        sikayetler: 'Tekrarlayan el ve diz eklem ağrıları (son 6 aydır artış), yorgunluk. Kolşisin altında FMF karın atakları belirgin azaldı.',
        hikaye: '10 yıl önce FMF tanısı konuldu, kolşisin 2x0.5 mg ile atak sıklığı belirgin azaldı. Son 6 ayda eklem ağrıları yeni semptom olarak eklendi. 16.03.2026 lab: ANA 4+ nükleer benekli, Anti-dsDNA 78.17 (sınırda), C4 0.13 düşük — SLE şüphesi. ENA profili gönderildi, romatoloji konsültasyonu planlandı.',
        ozgecmis: 'FMF (MEFV mutasyonu pozitif). Bilinen başka kronik hastalık yok. Gebelik yok, doğum kontrolü yöntemi kullanmıyor.',
        soygecmis: 'Anne FMF, babaanne SLE.',
        fmBulgular: 'TA 118/72, KH 78, ateş yok. Eklemler: hafif el bilek hassasiyeti var, aktif sinovit veya efüzyon yok. Karın yumuşak, organomegali yok. Cilt: malar raş yok, oral ülser yok. Lenfadenopati yok.',
        laboratuvar: '16.03.2026: ANA (FANA) 4+ nükleer benekli, Anti-dsDNA 78.17 (sınırın hemen altında), C4 0.13 ↓, C3 normal. ENA profili istendi. MEFV mutasyonu pozitif (eski kayıt).',
        goruntuleme: '',
        digerTetkikler: 'Romatoloji konsültasyonu planlandı (SLE şüphesi).'
      },
      tanilar: [
        { tanim: 'FMF',                                seviye: 'stabil', icd: 'E85.0' },
        { tanim: 'ANA pozitif + düşük C4 (SLE şüphesi)', seviye: 'izlem', icd: '' }
      ],
      ilaclar: [
        { ad: 'Kolşisin', doz: '0.5 mg', siklik: '2x1', endikasyon: 'FMF', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-03-16', tur: 'kan', baslik: 'Otoimmün panel', ozet: 'ANA (FANA) 4+ nükleer benekli, Anti-dsDNA 78.17 (sınırın hemen altında), C4 0.13 ↓, C3 normal. ENA profili istendi. MEFV mutasyonu pozitif (eski kayıt)', kritik: true }
      ]
    },
    {
      hasta: {
        ad: 'Deniz Korkmaz Önal', yas: 43, cinsiyet: 'K', mrn: 'DKO-43K',
        klinikOzet: 'Lab 29.04.2026: PP2h 62, LDL 172, TotalKol 245, CRP 4.3, GFR 89, Hgb 13.4. Tanı: Reaktif hipoglisemi + hiperkolesterolemi. Eksik: OGTT+insülin, HbA1c, HOMA-IR. Plan: acarbose/statin değerlendirmesi.',
        sikayetler: 'Yemekten 2-3 saat sonra titreme, terleme, açlık hissi, hafif baş dönmesi. Atak sıklığı haftada 2-3.',
        hikaye: '29.04.2026 lab: PP2h 62 (düşük), LDL 172, TotalKol 245, CRP 4.3, GFR 89, Hgb 13.4. Klinik + lab reaktif hipoglisemi ile uyumlu. OGTT+insülin, HbA1c, HOMA-IR henüz istenmedi. Hiperkolesterolemi eşlik ediyor. Diyet düzenlemesi + acarbose ve statin değerlendirmesi planlandı.',
        ozgecmis: 'Bilinen DM yok. Tiroid hastalığı yok. PCOS sorgulanacak. Gebelik diyabeti öyküsü yok.',
        soygecmis: 'Anne T2DM, baba 52 yaşında MI geçirdi.',
        fmBulgular: 'TA 122/78, KH 76, BMI 27.4. Boyun: tiroid normal. Akantozis nigrikans yok. Karın yumuşak, hepatomegali yok. Periferik nabızlar palpabl. Nörolojik: tremor yok.',
        laboratuvar: '29.04.2026: PP2h 62 ↓, LDL 172 ↑, Total kolesterol 245 ↑, CRP 4.3, eGFR 89, Hgb 13.4. Eksik: OGTT + insülin profili, HbA1c, HOMA-IR, TSH.',
        goruntuleme: '',
        digerTetkikler: ''
      },
      tanilar: [
        { tanim: 'Reaktif hipoglisemi',  seviye: 'izlem', icd: '' },
        { tanim: 'Hiperkolesterolemi',   seviye: 'izlem', icd: 'E78.0' }
      ],
      ilaclar: [],
      tetkikler: [
        { tarih: '2026-04-29', tur: 'kan', baslik: 'Glukoz + lipid paneli', ozet: 'PP2h 62 ↓, LDL 172 ↑, Total kolesterol 245 ↑, CRP 4.3, eGFR 89, Hgb 13.4. Eksik: OGTT + insülin, HbA1c, HOMA-IR, TSH', kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Kazım Kısmöro', yas: 70, cinsiyet: 'E', mrn: 'KK-70E',
        klinikOzet: 'T2DM + KBH (diyabetik nefropati). HbA1c 6.6, Krea 1.4, eGFR 50-55. Forxiga kullanıyor. Kerendia eklenmesi değerlendiriliyor: UACR ≥30, K+ ≤4.8, ACEi/ARB durumu doğrulanmalı. Uygunsa Kerendia 10 mg/gün → 4 hafta sonra titre.',
        sikayetler: 'Belirgin yeni şikayet yok. Yokuş çıkarken hafif efor dispnesi. Rutin kontrol için başvurdu.',
        hikaye: '12 yıl T2DM, son 4 yıldır mikroalbüminüri. HbA1c 6.6 (iyi kontrol), Krea 1.4 / eGFR 50-55 (KBH G3a). Forxiga altında 2 yıldır stabil. UACR ≥30 ve K+ ≤4.8 ise finerenon (Kerendia) eklemesi gündemde; ACEi/ARB rejimi ve K+ takibi doğrulanacak.',
        ozgecmis: 'T2DM 12 yıl. HT 8 yıl. KAH veya MI öyküsü yok. Diyabetik retinopati taraması 6 ay önce normaldi. Sigara yok.',
        soygecmis: 'Baba T2DM, erkek kardeş T2DM, annede HT.',
        fmBulgular: 'TA 134/82, KH 76, BMI 29.6. Periferik nabızlar palpabl, pretibial ödem yok. Monofilament testi normal (diyabetik nöropati yok). Akciğer ve kalp auskültasyonu temiz.',
        laboratuvar: 'HbA1c 6.6 (iyi kontrol), Kreatinin 1.4, eGFR 50-55 (KBH G3a). UACR ≥30. Bekleyen: tekrar K+ ölçümü (Kerendia eklemesi öncesi, ≤4.8 olmalı).',
        goruntuleme: '',
        digerTetkikler: 'Diyabetik retinopati taraması (göz dibi) 6 ay önce normaldi. Monofilament normal — nöropati taraması temiz.'
      },
      tanilar: [
        { tanim: 'T2DM',                        seviye: 'stabil', icd: 'E11.9' },
        { tanim: 'Diyabetik nefropati (KBH G3a)', seviye: 'izlem', icd: 'N18.3' }
      ],
      ilaclar: [
        { ad: 'Forxiga', doz: '10 mg', siklik: '1x1', endikasyon: 'T2DM + KBH', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-01', tur: 'kan',   baslik: 'Diyabet + böbrek paneli',   ozet: 'HbA1c 6.6, Kreatinin 1.4, eGFR 50-55 (KBH G3a). UACR ≥30. Bekleyen: tekrar K+ ölçümü (Kerendia eklemesi öncesi)', kritik: false },
        { tarih: '2025-11-15', tur: 'diger', baslik: 'Diyabetik retinopati taraması', ozet: 'Göz dibi muayenesi normal. Monofilament testi normal — nöropati taraması temiz',                                       kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Arif Kaya', yas: 75, cinsiyet: 'E', mrn: 'AK-75E',
        klinikOzet: 'Forxiga kullanıyor. Transferrin sat %27 (normal), Hgb 18, Htc 48. Sonuç: Demir eksikliği yok, tablo SGLT2i fizyolojisi. Yıllık takip önerildi.',
        sikayetler: 'Belirgin şikayet yok. Yıllık check-up\'ta Hgb yüksekliği fark edilmesi üzerine başvurdu.',
        hikaye: 'Forxiga altında 18 aydır stabil. Hgb 18, Htc 48, transferrin satürasyonu %27 (normal) — demir eksikliği yok. Tablo SGLT2i fizyolojisi ile uyumlu (eritropoetin uyarımı + hafif hemokonsantrasyon). Yıllık takip kararlaştırıldı; pletora veya semptomatik hiperviskozite olmadığı için JAK2 mutasyonu istenmedi.',
        ozgecmis: 'T2DM 6 yıl. Sigara yok. Yüksek irtifada yaşam yok. KOAH veya OSAS bilinmiyor.',
        soygecmis: 'Belirgin hematolojik hastalık öyküsü yok.',
        fmBulgular: 'TA 128/78, KH 72, BMI 26.1. Cilt rengi normal, pletora yok. Splenomegali yok. Periferik nabızlar normal. SpO2 oda havası %97.',
        laboratuvar: 'Hgb 18, Htc 48. Transferrin satürasyonu %27 (normal). Ferritin normal. Demir eksikliği yok. EPO ve JAK2 mutasyonu istenmedi (klinik gerekçesi yok).',
        goruntuleme: '',
        digerTetkikler: ''
      },
      tanilar: [
        { tanim: 'SGLT2i fizyolojisi — eritrositoz', seviye: 'stabil', icd: '' }
      ],
      ilaclar: [
        { ad: 'Forxiga', doz: '10 mg', siklik: '1x1', endikasyon: 'T2DM', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-02', tur: 'kan', baslik: 'Tam kan + demir profili', ozet: 'Hgb 18, Htc 48. Transferrin satürasyonu %27 (normal). Ferritin normal. Demir eksikliği yok — tablo SGLT2i fizyolojisi ile uyumlu', kritik: false }
      ]
    },
    {
      hasta: {
        ad: 'Aydın Aydoğdu', yas: 75, cinsiyet: 'E', mrn: 'AA-75E',
        klinikOzet: 'Prostat Ca takipli, bilateral nefrostomi, PCT 2.5, CRP ~150, ürosepsis ön tanısı. Meropenem (extended infusion) başlandı.',
        sikayetler: 'Yüksek ateş, titreme, halsizlik. Son 24 saatte idrar miktarında azalma. Yakınları bilincinde hafif bulanıklık tarif ediyor.',
        hikaye: 'Metastatik prostat Ca takipli, bilateral nefrostomi mevcut (obstrüktif üropati). 48 saat önce ateş 39 °C ve titreme atağıyla başvurdu. PCT 2.5, CRP ~150 → ürosepsis ön tanısı. Kan, idrar ve nefrostomi kültürleri alındı. Meropenem extended infusion başlandı. Hemodinami yakın izleme alındı.',
        ozgecmis: 'Prostat Ca (4 yıl), kemik metastazı (+). Önceki RT ve androjen deprivasyon tedavisi. Bilateral nefrostomi 14 ay önce yerleştirildi. KAH yok.',
        soygecmis: 'Babada prostat Ca.',
        fmBulgular: 'TA 96/58 (sepsiste), KH 112, ateş 38.7, SS 22/dk, SpO2 oda havası %94. Bilinç: GKS 14 (hafif yavaş yanıtlar, oryantasyon kısmi). Karın: hafif suprapubik hassasiyet, defans yok. Bilateral nefrostomi açık, idrar bulanık görünümde. Bacaklarda 1+ ödem.',
        laboratuvar: 'Prokalsitonin 2.5 ↑, CRP ~150 ↑. Kan, idrar ve nefrostomi kültürleri gönderildi. Kreatinin ve elektrolitler yakın izlemde. PSA takipte.',
        goruntuleme: 'Bekleyen: kemik sintigrafisi takibi (metastaz progresyonu). Nefrostomi kateterleri açık görünümde — USG kontrolü planlandı.',
        digerTetkikler: 'EKG: sinüs taşikardi (sepsiste, KH ~112). PSA takibi devam ediyor.'
      },
      tanilar: [
        { tanim: 'Prostat Ca (takip)',       seviye: 'izlem',  icd: 'C61' },
        { tanim: 'Bilateral nefrostomi',     seviye: 'izlem',  icd: '' },
        { tanim: 'Ürosepsis (ön tanı)',      seviye: 'kritik', icd: '' }
      ],
      ilaclar: [
        { ad: 'Meropenem', doz: '', siklik: '', endikasyon: 'Ürosepsis (extended infusion)', durum: 'aktif' }
      ],
      tetkikler: [
        { tarih: '2026-05-14', tur: 'kan', baslik: 'Sepsis paneli + kültür', ozet: 'PCT 2.5 ↑, CRP ~150 ↑. Kan, idrar ve nefrostomi kültürleri gönderildi. Kreatinin ve elektrolitler yakın izlemde', kritik: true  },
        { tarih: '2026-05-14', tur: 'ekg', baslik: 'EKG',                    ozet: 'Sinüs taşikardi (sepsiste, KH ~112)',                                                                              kritik: false },
        { tarih: '2026-05-15', tur: 'usg', baslik: 'Nefrostomi kontrol USG', ozet: 'Bilateral nefrostomi kateterleri açık görünümde. Kemik sintigrafisi takibi planlandı',                            kritik: false }
      ]
    }
  ];

  // Yeni hasta objesinde v0.3.2.b'nin 3 ölü alanı kalmasın — SEED'i yazarken çıkar
  const sterilHasta = h => {
    const o = { ...h };
    for (const k of ESKI_TETKIK_KEYS) delete o[k];
    return o;
  };

  let eklenen = 0;
  let guncellenen = 0;
  let tetkikEklenen = 0;

  for (const item of SEED) {
    const ad = (item.hasta.ad || '').trim().toLowerCase();
    const mevcut = mevcutMap.get(ad);

    if (mevcut) {
      // 1) Mevcut hastada boş semptom alanlarını backfill et (elle girileni ezme)
      //    + v0.3.2.b'den kalan 3 ölü alanı temizle (laboratuvar/goruntuleme/digerTetkikler)
      const patch = {};
      for (const key of SEMPTOM_KEYS) {
        const mevcutVal = (mevcut.data?.[key] || '').trim();
        const seedVal   = (item.hasta?.[key] || '').trim();
        if (!mevcutVal && seedVal) patch[key] = item.hasta[key];
      }
      for (const key of ESKI_TETKIK_KEYS) {
        if (mevcut.data?.[key] !== undefined) patch[key] = null; // RTDB'de null = sil
      }
      if (Object.keys(patch).length) {
        await update(userRef(`hastalar/${mevcut.id}`), patch);
        guncellenen++;
      }

      // 2) Bu hasta için henüz tetkik kaydı yoksa SEED tetkiklerini ekle
      if ((tetkikSayisi.get(mevcut.id) || 0) === 0) {
        for (const tt of (item.tetkikler || [])) {
          const tr = push(userRef('tetkikler'));
          await set(tr, { ...tt, id: tr.key, hastaId: mevcut.id, olusturmaTarih: now });
          tetkikEklenen++;
        }
      }
      continue;
    }

    // Yeni hasta + ilişkili kayıtlar (tetkikler dahil)
    const hr = push(userRef('hastalar'));
    const hid = hr.key;
    await set(hr, { ...sterilHasta(item.hasta), id: hid, olusturmaTarih: now });

    for (const t of item.tanilar) {
      const tr = push(userRef('tanilar'));
      await set(tr, { ...t, id: tr.key, hastaId: hid, tarih: now });
    }

    for (const il of item.ilaclar) {
      const ir = push(userRef('ilaclar'));
      await set(ir, { ...il, id: ir.key, hastaId: hid, tarih: now });
    }

    for (const tt of (item.tetkikler || [])) {
      const tr = push(userRef('tetkikler'));
      await set(tr, { ...tt, id: tr.key, hastaId: hid, olusturmaTarih: now });
      tetkikEklenen++;
    }

    eklenen++;
  }

  return { eklenen, guncellenen, tetkikEklenen };
}
