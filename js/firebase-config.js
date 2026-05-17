import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getDatabase
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js';

// TODO: Klinik Pro Firebase projesi oluşturulup config buraya girilecek
const firebaseConfig = {
  apiKey:            "REPLACE_ME",
  authDomain:        "REPLACE_ME.firebaseapp.com",
  databaseURL:       "https://REPLACE_ME-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "REPLACE_ME",
  storageBucket:     "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId:             "REPLACE_ME"
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);

export function registerUser(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logoutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
