import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// 1. Production Config (reads from Vite env variables)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if a real config is configured
const hasRealConfig = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';

let db: any = null;
let auth: any = null;
let isMocked = true;

if (hasRealConfig) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    isMocked = false;
    console.log('⚡ Firebase Cloud Client initialized successfully.');
    
    // Authenticate anonymously by default to allow fast cross-device sync
    signInAnonymously(auth).catch(err => {
      console.warn('Firebase Anonymous Auth failed, operating in local sync mode:', err);
    });
  } catch (err) {
    console.error('Firebase Cloud initialization failed, falling back to local simulation:', err);
    db = null;
    auth = null;
  }
}

// 2. High-fidelity simulated Firestore synchronization layer (fallback)
if (!db) {
  console.log('🔮 Firebase Config not set. Initializing local responsive storage syncing...');
  
  // Local storage mock DB
  db = {
    // Sync watchlist
    syncWatchlist: (callback: (watchlist: string[]) => void) => {
      const load = () => {
        const data = localStorage.getItem('aegis_watchlist');
        return data ? JSON.parse(data) : [];
      };
      
      callback(load());
      
      // Listen to window storage events for basic multi-tab synchronization
      const handler = () => callback(load());
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    
    saveWatchlist: (watchlist: string[]) => {
      localStorage.setItem('aegis_watchlist', JSON.stringify(watchlist));
      // Dispatch storage event locally to trigger same-browser updates
      window.dispatchEvent(new Event('storage'));
    },

    // Sync orders
    syncOrders: (callback: (orders: any[]) => void) => {
      const load = () => {
        const data = localStorage.getItem('aegis_orders');
        return data ? JSON.parse(data) : [];
      };
      
      callback(load());
      const handler = () => callback(load());
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },

    saveOrder: (order: any) => {
      const data = localStorage.getItem('aegis_orders');
      const orders = data ? JSON.parse(data) : [];
      const newOrders = [order, ...orders];
      localStorage.setItem('aegis_orders', JSON.stringify(newOrders));
      window.dispatchEvent(new Event('storage'));
    }
  };
}

export { db, auth, isMocked };
export default db;
