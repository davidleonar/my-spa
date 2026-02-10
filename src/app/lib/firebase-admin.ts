import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = getApps().length === 0 ? initializeApp() : getApp();

export const adminAuth = getAuth(app);
// export const adminDb = getFirestore(app); // if you need it later