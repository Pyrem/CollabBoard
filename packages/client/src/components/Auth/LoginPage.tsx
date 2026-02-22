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
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="w-[380px] p-10 bg-white rounded-xl shadow-lg text-center">
        <h1 className="text-[28px] font-bold mb-1">CollabBoard</h1>
        <p className="text-sm text-gray-500 mb-6">Real-time collaborative whiteboard</p>

        <button
          onClick={() => void handleGoogleSignIn()}
          className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg bg-white cursor-pointer mb-4 hover:bg-gray-50"
        >
          Sign in with Google
        </button>

        <div className="my-4 text-gray-400 text-xs">
          <span>or</span>
        </div>

        <form onSubmit={(e) => void handleEmailSubmit(e)}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ boxSizing: 'border-box' }}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg mb-3 outline-none focus:border-blue-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ boxSizing: 'border-box' }}
            className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg mb-3 outline-none focus:border-blue-500"
            required
            minLength={6}
          />
          <button
            type="submit"
            className="w-full px-4 py-2.5 text-sm font-semibold border-none rounded-lg bg-blue-500 text-white cursor-pointer hover:bg-blue-600"
          >
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-3 border-none bg-transparent text-blue-500 cursor-pointer text-[13px] hover:underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>

        {error && <p className="mt-3 text-red-600 text-[13px]">{error}</p>}
      </div>
    </div>
  );
}
