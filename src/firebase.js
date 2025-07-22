// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDazyN2Hzugy4ogrl7jLZFmFPRlI7kljWc",
    authDomain: "gabojago-67419.firebaseapp.com",
    projectId: "gabojago-67419",
    storageBucket: "Ygabojago-67419.firebasestorage.app",
    messagingSenderId: "165924836629",
    appId: ":165924836629:web:6cba3afbdf0deb947e451c"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
