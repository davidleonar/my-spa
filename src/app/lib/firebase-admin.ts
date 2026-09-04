import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let app;
if (getApps().length === 0) {
  try {
    app = initializeApp();
  } catch {
    // Graceful fallback during build-time page collection when GCP credentials are missing
  }
} else {
  app = getApp();
}

export const adminAuth = app ? getAuth(app) : ({} as ReturnType<typeof getAuth>);