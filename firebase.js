import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyARexIdke8cs9dV8yA3tQEt6KROjq34VvQ",
  authDomain: "jctripv009.firebaseapp.com",
  projectId: "jctripv009",
  storageBucket: "jctripv009.firebasestorage.app",
  messagingSenderId: "819437702614",
  appId: "1:819437702614:web:da562ba7321ec9297c6877",
  measurementId: "G-25YDYGNJ15"
};

const app = initializeApp(firebaseConfig);
// This 'db' is what allows you and your partner to share data
export const db = getFirestore(app);
