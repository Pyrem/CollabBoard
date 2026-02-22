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

/** Open the Google sign-in popup and return the authenticated user. */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/** Authenticate with email and password. */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Create a new user account with email and password. */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

/** Sign out the current user. */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Return the current user's Firebase ID token, or `null` if not signed in.
 * If auth state hasn't resolved yet (e.g. page refresh), waits for it.
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
