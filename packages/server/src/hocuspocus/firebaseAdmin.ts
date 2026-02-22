import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';

let authInstance: Auth | null = null;

/**
 * Initialise the Firebase Admin SDK — called once, lazily, by {@link getAuth}.
 *
 * Resolution order for credentials:
 * 1. `FIREBASE_SERVICE_ACCOUNT` env var parsed as a JSON string.
 * 2. `FIREBASE_SERVICE_ACCOUNT` env var treated as a file path.
 * 3. Application default credentials (for local development).
 *
 * A `console.warn` is emitted when falling back to default credentials so
 * the developer knows no explicit service account was configured.
 *
 * No-ops if `firebase-admin/app.getApps()` already has an initialised app
 * (guards against duplicate initialisation in hot-reload scenarios).
 */
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

/**
 * Return the singleton Firebase `Auth` instance, initialising the SDK on
 * first call via {@link initializeFirebaseAdmin}.
 *
 * Subsequent calls return the cached instance without re-initialisation.
 * Used by {@link onAuthenticate} and {@link authMiddleware} to verify
 * Firebase ID tokens.
 *
 * @returns The Firebase Admin `Auth` service instance.
 */
export function getAuth(): Auth {
  if (!authInstance) {
    initializeFirebaseAdmin();
    authInstance = getFirebaseAuth();
  }
  return authInstance;
}
