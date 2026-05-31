// Vaka Tartışması — RTDB katmanı (v0.5.4 Sprint 6B)
//
// users/{uid}/tartismalar/{tartismaId} = {
//   hastaId, hastaAdi, baslik, olusturma, sonGuncelleme,
//   mesajlar: { {push-key}: { role, content, zaman } }
// }
//
// Yazma: firebase userRef. Okuma: getState('tartismalar') (canlı, db.js listener'ı doldurur).
// Mevcut konsültasyona (aiSorgulari) dokunulmaz — ayrı koleksiyon.

import { db } from '../firebase-config.js';
import {
  ref, push, set, update, remove
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import { getUid } from '../db.js';
import { getState } from '../state.js';

function _ref(path) { return ref(db, `users/${getUid()}/${path}`); }

/**
 * Yeni tartışma oluştur.
 * @returns {Promise<string>} tartismaId
 */
export async function createTartisma(hastaId, hastaAdi, baslik) {
  const r = push(_ref('tartismalar'));
  const now = new Date().toISOString();
  await set(r, {
    id:            r.key,
    hastaId:       hastaId || null,
    hastaAdi:      hastaAdi || null,
    baslik:        baslik || 'Yeni tartışma',
    olusturma:     now,
    sonGuncelleme: now
  });
  return r.key;
}

/**
 * Tartışmaya mesaj ekle (push-key) + sonGuncelleme'yi tazele.
 * @returns {Promise<string>} mesaj push-key
 */
export async function addMesaj(tartismaId, role, content) {
  const mr = push(_ref(`tartismalar/${tartismaId}/mesajlar`));
  await set(mr, { role, content: content || '', zaman: new Date().toISOString() });
  await update(_ref(`tartismalar/${tartismaId}`), { sonGuncelleme: new Date().toISOString() });
  return mr.key;
}

export async function updateBaslik(tartismaId, baslik) {
  await update(_ref(`tartismalar/${tartismaId}`), { baslik: baslik || 'Yeni tartışma' });
}

export async function deleteTartisma(tartismaId) {
  await remove(_ref(`tartismalar/${tartismaId}`));
}

/**
 * Bir hastanın tartışmaları (hastaId=null → genel sohbetler).
 * En yeni → eski (sonGuncelleme'ye göre).
 */
export function getTartismalar(hastaId) {
  const all = getState('tartismalar') || {};
  return Object.values(all)
    .filter(t => (hastaId ? t.hastaId === hastaId : !t.hastaId))
    .sort((a, b) => (b.sonGuncelleme || '').localeCompare(a.sonGuncelleme || ''));
}

/**
 * Tek tartışma + mesajları (zamana göre sıralı dizi olarak `mesajlarDizi`).
 */
export function getTartisma(tartismaId) {
  const all = getState('tartismalar') || {};
  const t = all[tartismaId];
  if (!t) return null;
  const mesajlarDizi = Object.values(t.mesajlar || {})
    .sort((a, b) => (a.zaman || '').localeCompare(b.zaman || ''));
  return { ...t, mesajlarDizi };
}
