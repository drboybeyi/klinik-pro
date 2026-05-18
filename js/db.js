import { db } from './firebase-config.js';
import {
  ref, set, get, push, update, remove, onValue, off
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import { setState } from './state.js';

let _uid = null;
const _listeners = {};

export function setCurrentUser(uid) { _uid = uid; }

function userRef(path) { return ref(db, `users/${_uid}/${path}`); }

// --- Listeners ---

export function startListeners() {
  ['hastalar', 'tanilar', 'ilaclar', 'alerjiler', 'notlar', 'ayarlar']
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
  const cols = ['tanilar', 'ilaclar', 'alerjiler', 'notlar'];
  const deletes = [remove(userRef(`hastalar/${hastaId}`))];
  for (const col of cols) {
    const snap = await get(userRef(col));
    if (snap.exists()) {
      snap.forEach(child => {
        if (child.val().hastaId === hastaId) {
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

export async function seedHastalar() {
  const snap = await get(userRef('hastalar'));
  if (snap.exists() && Object.keys(snap.val()).length > 0) return;

  const now = new Date().toISOString();

  const SEED = [
    {
      hasta: {
        ad: 'S.İ.', yas: 89, cinsiyet: 'E', mrn: 'SI-89E',
        klinikOzet: 'HFrEF EF %25-30, LVDD evre 3, asendan aort 3.9 cm, MY/TY orta, PABS 60. Plan: Coveram → 36sa washout → Entresto 24/26 2x1; 1. hafta Forxiga ekle. Cardura XL → Tamsulosin geçiş.'
      },
      tanilar: [
        { tanim: 'HFrEF EF %25-30',              seviye: 'kritik', icd: 'I50.21' },
        { tanim: 'LVDD evre 3',                   seviye: 'kritik', icd: '' },
        { tanim: 'Asendan aort dilatasyonu 3.9 cm', seviye: 'izlem', icd: '' },
        { tanim: 'MY/TY orta',                    seviye: 'izlem', icd: '' },
        { tanim: 'BPH PSA 3.81',                  seviye: 'izlem', icd: '' }
      ],
      ilaclar: [
        { ad: 'Coveram',   doz: '',       siklik: '',    endikasyon: 'HFrEF geçiş',   durum: 'kesilecek' },
        { ad: 'Entresto',  doz: '24/26 mg', siklik: '2x1', endikasyon: 'HFrEF',       durum: 'aktif' },
        { ad: 'Forxiga',   doz: '10 mg',  siklik: '1x1', endikasyon: 'HFrEF',         durum: 'planli' },
        { ad: 'Tamsulosin',doz: '0.4 mg', siklik: '1x1', endikasyon: 'BPH',           durum: 'aktif' }
      ]
    },
    {
      hasta: {
        ad: 'E.T.', yas: 68, cinsiyet: 'E', mrn: 'ET-68E',
        klinikOzet: 'KOAH akut alevlenme. Foster + Avelox + Prednol 16 mg/gün. PA grafi: bilateral hiperinflasyon. Plan: Prednol 5-7 gün, moksifloksasin 5-7 gün, LAMA ekle, eozinofil+spirometri+AKG+NT-proBNP, LDCT tarama, aşılama, PE/KY DDx.'
      },
      tanilar: [
        { tanim: 'KOAH akut alevlenme', seviye: 'kritik', icd: 'J44.1' },
        { tanim: 'KOAH GOLD 2025',      seviye: 'izlem',  icd: 'J44.9' }
      ],
      ilaclar: [
        { ad: 'Foster inhaler',          doz: '',       siklik: '2x1', endikasyon: 'KOAH',           durum: 'aktif' },
        { ad: 'Avelox (moksifloksasin)', doz: '400 mg', siklik: '1x1', endikasyon: 'KOAH alevlenme', durum: 'aktif' },
        { ad: 'Prednol',                 doz: '16 mg',  siklik: '1x1', endikasyon: 'KOAH alevlenme', durum: 'aktif' }
      ]
    },
    {
      hasta: {
        ad: 'Ş.S.', yas: 60, cinsiyet: 'K', mrn: 'SS-60K',
        klinikOzet: 'Yükselen Kromogranin A: Şubat 124 → Nisan 200 µg/L (%61↑, 7 hafta). PPI/H2RA yok. Plan: yalancı pozitif eleme (gastrin, eGFR, KCFT, TSH, anti-parietal Ab, B12, H.pylori), açlıkta 3. CgA tekrarı, klinik sorgulama (karsinoid, feo, MEN), 5-HIAA/metanefrin/NSE, üst GİS endoskopi, BT ± 68Ga-DOTATATE.'
      },
      tanilar: [
        { tanim: 'Yükselen Kromogranin A', seviye: 'izlem', icd: '' },
        { tanim: 'NET şüphesi workup',     seviye: 'izlem', icd: '' }
      ],
      ilaclar: []
    }
  ];

  for (const item of SEED) {
    const hr = push(userRef('hastalar'));
    const hid = hr.key;
    await set(hr, { ...item.hasta, id: hid, olusturmaTarih: now });

    for (const t of item.tanilar) {
      const tr = push(userRef('tanilar'));
      await set(tr, { ...t, id: tr.key, hastaId: hid, tarih: now });
    }

    for (const il of item.ilaclar) {
      const ir = push(userRef('ilaclar'));
      await set(ir, { ...il, id: ir.key, hastaId: hid, tarih: now });
    }
  }
}
