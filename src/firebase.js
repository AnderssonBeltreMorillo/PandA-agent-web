import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAXCnmxasZalPp7s_RjMfLfGl8fnJzIN-4",
  authDomain: "pya-agent.firebaseapp.com",
  projectId: "pya-agent",
  storageBucket: "pya-agent.firebasestorage.app",
  messagingSenderId: "551652468951",
  appId: "1:551652468951:web:527aac624ebda1c9616892",
  measurementId: "G-6QRL5F66FT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };