// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyARexIdke8cs9dV8yA3tQEt6KROjq34VvQ",
  authDomain: "jctripv009.firebaseapp.com",
  projectId: "jctripv009",
  storageBucket: "jctripv009.firebasestorage.app",
  messagingSenderId: "819437702614",
  appId: "1:819437702614:web:da562ba7321ec9297c6877",
  measurementId: "G-25YDYGNJ15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
