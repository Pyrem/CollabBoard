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

  // Otherwise wait for auth state to resolve (handles page refresh)
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribe();
      if (firebaseUser) {
        firebaseUser.getIdToken().then(resolve).catch(() => resolve(null));
      } else {
        resolve(null);
      }
    });
  });
}

export { auth, onAuthStateChanged, type User };
