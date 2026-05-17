import { db } from './firebase-config.js';
import {
  ref, set, get, push, update, remove, onValue, off
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';
import { setState } from './state.js';

let _uid = null;
const _listeners = {};

export function setCurrentUser(uid) {
  _uid = uid;
}

function userRef(path) {
  return ref(db, `users/${_uid}/${path}`);
}

// --- Listeners ---

export function startListeners() {
  _listen('hastalar');
  _listen('ayarlar');
}

export function stopListeners() {
  Object.keys(_listeners).forEach(key => {
    off(_listeners[key].ref);
    delete _listeners[key];
  });
}

function _listen(collection) {
  const r = userRef(collection);
  _listeners[collection] = { ref: r };
  onValue(r, snap => {
    setState(collection, snap.val() || {});
  });
}

// --- CRUD ---

export async function saveHasta(hasta) {
  if (hasta.id) {
    await update(userRef(`hastalar/${hasta.id}`), hasta);
    return hasta.id;
  } else {
    const newRef = push(userRef('hastalar'));
    await set(newRef, { ...hasta, id: newRef.key, olusturmaTarih: new Date().toISOString() });
    return newRef.key;
  }
}

export async function deleteHasta(id) {
  await remove(userRef(`hastalar/${id}`));
}

export async function saveAyarlar(data) {
  await update(userRef('ayarlar'), data);
}

// --- Default data on first login ---

export async function initDefaultData() {
  const snap = await get(userRef('ayarlar'));
  if (snap.exists()) return;
  await set(userRef('ayarlar'), {
    pinAktif: false,
    pin: null,
    kilitSuresi: 5
  });
}
