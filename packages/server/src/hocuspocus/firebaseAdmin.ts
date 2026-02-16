import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';

let authInstance: Auth | null = null;

function initializeFirebaseAdmin(): void {
  if (getApps().length > 0) return;

  const serviceAccount = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (serviceAccount) {
    try {
      const parsed: unknown = JSON.parse(serviceAccount);
      initializeApp({ credential: cert(parsed as Record<string, string>) });
    } catch {
      // Assume it's a file path
      initializeApp({ credential: cert(serviceAccount) });
    }
  } else {
    // Use application default credentials (for local development)
    console.warn('[AUTH] No FIREBASE_SERVICE_ACCOUNT set — using default credentials');
    initializeApp();
  }
}

export function getAuth(): Auth {
  if (!authInstance) {
    initializeFirebaseAdmin();
    authInstance = getFirebaseAuth();
  }
  return authInstance;
}
