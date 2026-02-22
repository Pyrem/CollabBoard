import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env['VITE_FIREBASE_API_KEY'] as string,
  authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'] as string,
  projectId: import.meta.env['VITE_FIREBASE_PROJECT_ID'] as string,
  appId: import.meta.env['VITE_FIREBASE_APP_ID'] as string,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/**
 * Open the Google sign-in popup and return the authenticated user.
 *
 * Delegates to Firebase `signInWithPopup` with the pre-configured
 * `GoogleAuthProvider`. On success the returned `User` object includes
 * `uid`, `displayName`, `email`, and `photoURL` from the Google profile.
 *
 * @returns The authenticated Firebase `User`.
 * @throws {FirebaseError} If the popup is closed or blocked by the browser.
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Authenticate an existing user with email and password.
 *
 * @param email - The user's email address.
 * @param password - The user's password.
 * @returns The authenticated Firebase `User`.
 * @throws {FirebaseError} If credentials are invalid.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Create a new user account with email and password.
 *
 * @param email - The new user's email address.
 * @param password - A password of at least 6 characters.
 * @returns The newly created Firebase `User`.
 * @throws {FirebaseError} If the email is already in use or the password is too weak.
 */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

/**
 * Sign out the current user and clear the Firebase auth session.
 *
 * After this call, `auth.currentUser` is `null` and the `onAuthStateChanged`
 * listener fires with `null`, which triggers the `AuthGuard` redirect.
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Return the current user's Firebase ID token, or `null` if not signed in.
 *
 * Handles two cases:
 * 1. **`currentUser` is already available** — returns the token immediately
 *    via `user.getIdToken()`.
 * 2. **Auth state hasn't resolved yet** (e.g. page refresh) — waits for the
 *    first `onAuthStateChanged` callback, then resolves with the token (or
 *    `null` if the user is signed out).
 *
 * Used by the Hocuspocus provider's `token` callback and by
 * {@link useAI.sendCommand} to attach the `Authorization` header.
 *
 * @returns A JWT string, or `null` if not authenticated.
 */
export async function getIdToken(): Promise<string | null> {
  // If currentUser is already available, use it directly
  const user = auth.currentUser;
  if (user) return user.getIdToken();

  // Otherwise wait for auth state to resolve (handles page refresh).
  // Firebase may need a moment to restore the session from IndexedDB,
  // so we wait for the first onAuthStateChanged callback rather than
  // assuming the user is signed out.
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribe();
      if (firebaseUser) {
        firebaseUser.getIdToken().then(resolve).catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });

    // Safety timeout — if auth state never resolves, don't hang forever
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 5_000);
  });
}

/**
 * Wait until Firebase auth has fully resolved and return the ID token.
 *
 * Unlike {@link getIdToken}, this function waits through intermediate
 * `null` states that can occur during Firebase session restoration.
 * It polls `auth.currentUser` after `onAuthStateChanged` fires and,
 * if still `null`, waits briefly for a second callback before giving up.
 *
 * Used by the Hocuspocus provider's `token` callback where a missing
 * token causes a permanent connection failure.
 *
 * @returns A JWT string.
 * @throws {Error} If no authenticated user is found within the timeout.
 */
export async function getIdTokenOrThrow(): Promise<string> {
  // Fast path — user already available
  const user = auth.currentUser;
  if (user) return user.getIdToken();

  // Wait for Firebase to finish restoring the session
  const firebaseUser = await new Promise<User | null>((resolve) => {
    let settled = false;

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (settled) return;
      // If we get a user, resolve immediately
      if (u) {
        settled = true;
        unsubscribe();
        resolve(u);
        return;
      }
      // First null callback — Firebase may still be restoring.
      // Wait a short period for a second callback with the real user.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(auth.currentUser);
      }, 1_000);
    });

    // Hard timeout
    setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(null);
    }, 5_000);
  });

  if (!firebaseUser) {
    throw new Error('Not authenticated — cannot obtain token');
  }

  return firebaseUser.getIdToken();
}

export { auth, onAuthStateChanged, type User };
