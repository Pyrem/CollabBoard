import { useState, use, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../../lib/firebase.js';
import { AuthContext } from '../../hooks/useAuth.js';

export function LoginPage(): React.JSX.Element {
  const { user } = use(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      void navigate('/board/default', { replace: true });
    }
  }, [user, navigate]);

  const handleGoogleSignIn = async (): Promise<void> => {
    try {
      await signInWithGoogle();
      void navigate('/board/default');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      void navigate('/board/default');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>CollabBoard</h1>
        <p style={styles.subtitle}>Real-time collaborative whiteboard</p>

        <button onClick={() => void handleGoogleSignIn()} style={styles.googleBtn}>
          Sign in with Google
        </button>

        <div style={styles.divider}>
          <span>or</span>
        </div>

        <form onSubmit={(e) => void handleEmailSubmit(e)}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
            minLength={6}
          />
          <button type="submit" style={styles.submitBtn}>
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <button onClick={() => setIsSignUp(!isSignUp)} style={styles.toggleBtn}>
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
    width: 380,
    textAlign: 'center',
  },
  title: { fontSize: 28, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  googleBtn: {
    width: '100%',
    padding: '10px 16px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    cursor: 'pointer',
    marginBottom: 16,
  },
  divider: { margin: '16px 0', color: '#999', fontSize: 12 },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 8,
    marginBottom: 12,
    outline: 'none',
  },
  submitBtn: {
    width: '100%',
    padding: '10px 16px',
    fontSize: 14,
    border: 'none',
    borderRadius: 8,
    backgroundColor: '#2196F3',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  toggleBtn: {
    marginTop: 12,
    border: 'none',
    background: 'none',
    color: '#2196F3',
    cursor: 'pointer',
    fontSize: 13,
  },
  error: { marginTop: 12, color: '#e53935', fontSize: 13 },
};
