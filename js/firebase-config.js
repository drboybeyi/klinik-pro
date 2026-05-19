import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC7_KUAJC2iYXw_aENLbCyLL5U1nUyBWxY",
  authDomain:        "klinik-pro.firebaseapp.com",
  databaseURL:       "https://klinik-pro-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "klinik-pro",
  storageBucket:     "klinik-pro.firebasestorage.app",
  messagingSenderId: "105811632834",
  appId:             "1:105811632834:web:99103794931713dba1515b",
  measurementId:     "G-9W6MTL31BG"
};

const app = initializeApp(firebaseConfig);
export const db      = getDatabase(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

export function getFirebaseErrorMessage(error) {
  const msgs = {
    'auth/email-already-in-use':   'Bu e-posta zaten kayıtlı',
    'auth/invalid-email':          'Geçersiz e-posta adresi',
    'auth/weak-password':          'Şifre en az 6 karakter olmalı',
    'auth/user-not-found':         'Kullanıcı bulunamadı',
    'auth/wrong-password':         'Yanlış şifre',
    'auth/invalid-credential':     'E-posta veya şifre hatalı',
    'auth/network-request-failed': 'İnternet bağlantısı yok',
    'auth/too-many-requests':      'Çok fazla hatalı giriş. Lütfen bekle.',
  };
  return msgs[error.code] || `Hata: ${error.code}`;
}

export const registerUser      = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const loginUser         = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutUser        = ()                 => signOut(auth);
export const sendPasswordReset = (email)            => sendPasswordResetEmail(auth, email);
export const onAuthChange      = (cb)               => onAuthStateChanged(auth, cb);
