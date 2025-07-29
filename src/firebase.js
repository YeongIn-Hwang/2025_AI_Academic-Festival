// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyDazyN2Hzugy4ogrl7jLZFmFPRlI7kljWc",
    authDomain: "gabojago-67419.firebaseapp.com",
    projectId: "gabojago-67419",
    storageBucket: "gabojago-67419.firebasestorage.app",  // ✅ 여기가 중요!
    messagingSenderId: "165924836629",
    appId: "1:165924836629:web:6cba3afbdf0deb947e451c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
