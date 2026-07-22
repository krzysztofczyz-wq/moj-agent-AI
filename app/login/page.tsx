'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // If user is already logged in, redirect them to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/');
      }
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isRegistering) {
        // Register new account
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        // Supabase returns a user. If email confirmation is enabled, they need to check email.
        // If not, they are signed in.
        if (data.session) {
          setSuccessMsg('Rejestracja pomyślna! Zalogowano.');
          setTimeout(() => {
            router.replace('/');
          }, 1500);
        } else {
          setSuccessMsg('Konto zostało utworzone! Sprawdź skrzynkę e-mail, aby potwierdzić rejestrację.');
        }
      } else {
        // Log in existing account
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        setSuccessMsg('Zalogowano pomyślnie! Przekierowywanie...');
        setTimeout(() => {
          router.replace('/');
        }, 1000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Wystąpił błąd podczas uwierzytelniania.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <style jsx global>{`
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
          overflow: hidden;
          background: #06060c;
        }
      `}</style>
      
      <style jsx>{`
        .login-container {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 50% 30%, #17153b 0%, #06060c 70%);
          font-family: system-ui, -apple-system, sans-serif;
          color: #f4f4f7;
          padding: 1rem;
        }

        .login-card {
          background: rgba(13, 13, 22, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(24px);
          border-radius: 24px;
          padding: 2.5rem;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
          animation: appear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes appear {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .card-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .logo {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
          display: inline-block;
        }

        .title {
          font-size: 1.75rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #ffffff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          font-size: 0.88rem;
          color: #64748b;
          margin: 0;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .label {
          font-size: 0.78rem;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.8rem 1rem;
          color: #f4f4f7;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
        }

        .input:focus {
          border-color: rgba(99, 102, 241, 0.5);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.15);
        }

        .submit-btn {
          margin-top: 0.5rem;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          border: none;
          color: white;
          padding: 0.9rem;
          border-radius: 10px;
          font-size: 0.98rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.95;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
        }

        .submit-btn:disabled {
          background: #334155;
          color: #64748b;
          cursor: not-allowed;
          box-shadow: none;
        }

        .toggle-mode {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.88rem;
          color: #94a3b8;
        }

        .toggle-btn {
          background: none;
          border: none;
          color: #818cf8;
          font-weight: 700;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
          margin-left: 0.25rem;
        }

        .toggle-btn:hover {
          color: #a5b4fc;
        }

        .alert {
          border-radius: 10px;
          padding: 0.8rem 1rem;
          font-size: 0.85rem;
          line-height: 1.4;
        }

        .alert-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
      `}</style>

      <div className="login-card">
        <div className="card-header">
          <span className="logo">🤖</span>
          <h2 className="title">Antigravity Agent</h2>
          <p className="subtitle">
            {isRegistering ? 'Stwórz konto, aby rozpocząć' : 'Zaloguj się do swojego konta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {errorMsg && <div className="alert alert-error">⚠️ {errorMsg}</div>}
          {successMsg && <div className="alert alert-success">{successMsg}</div>}

          <div className="form-group">
            <label className="label">E-mail</label>
            <input
              type="email"
              className="input"
              placeholder="np. jan@kowalski.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="label">Hasło</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading || !email || !password}>
            {loading ? 'Przetwarzanie...' : isRegistering ? 'Zarejestruj się' : 'Zaloguj się'}
          </button>
        </form>

        <div className="toggle-mode">
          {isRegistering ? 'Masz już konto?' : 'Nie masz konta?'}
          <button
            type="button"
            className="toggle-btn"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            disabled={loading}
          >
            {isRegistering ? 'Zaloguj się' : 'Zarejestruj się'}
          </button>
        </div>
      </div>
    </div>
  );
}
