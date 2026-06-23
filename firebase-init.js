import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCewK8Ht3iCbqGfjSOI8ANYH-oWe-YA48",
  authDomain: "jostock-88374.firebaseapp.com",
  projectId: "jostock-88374",
  storageBucket: "jostock-88374.firebasestorage.app",
  messagingSenderId: "345684413510",
  appId: "1:345684413510:web:a0cf27b0cd725fb202ce47",
  measurementId: "G-DQDW92WBZZ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// AUTH UPDATE: Secondary app strictly for creating users without logging out the current admin
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
