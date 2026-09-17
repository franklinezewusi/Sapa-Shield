"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Dashboard from './dashboard';

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Custom Bottom Sheet Alert State
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [authSuccess, setAuthSuccess] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      setIsSigningIn(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      setIsSigningIn(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorModal(null);
    setAuthSuccess('');
    setIsSigningIn(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setAuthSuccess('Check your email for the confirmation link!');
        setIsSigningIn(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setIsSigningIn(false);
      setErrorModal({
        title: isSignUp ? 'Registration Failed' : 'Login Failed',
        message: err.message || 'Invalid credentials entered. Please verify your email and password.',
      });
    }
  };

  const handleForgotPassword = async () => {
    setErrorModal(null);
    setAuthSuccess('');
    if (!email) {
      setErrorModal({
        title: 'Email Required',
        message: 'Please enter your email address in the field above to receive a reset link.',
      });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setAuthSuccess('Password reset link has been sent to your email!');
    } catch (err: any) {
      setErrorModal({
        title: 'Reset Link Error',
        message: err.message || 'Failed to send password reset email. Please try again.',
      });
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <style>{`
          @keyframes spinRing {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div style={styles.loadingContent}>
          <div style={styles.logoRingWrapper}>
            <div style={styles.spinningRing} />
            <img src="/SSL.jpg" alt="Sapa-Shield Logo" style={styles.centerLogoImg} />
          </div>
          <p style={styles.loadingText}></p>
        </div>
      </div>
    );
  }

  if (session) {
    return <Dashboard session={session} onLogout={() => setSession(null)} />;
  }

  return (
    <div style={styles.authContainer}>
      <div style={{ ...styles.authCard, filter: errorModal ? 'blur(4px)' : 'none', transition: 'filter 0.3s ease' }}>
        
        {/* Brand Header */}
        <div style={styles.brandHeaderContainer}>
          <div style={styles.brandRow}>
            <img src="/SSL.jpg" alt="Sapa-Shield Logo" style={styles.loginLogo} />
            <h1 style={styles.brandTitle}>
              SAPA<span style={{ color: '#38bdf8' }}>-SHIELD</span>
            </h1>
          </div>
          <p style={styles.brandSubtitle}>Protect your finances from Sapa</p>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleAuth} style={styles.form}>
          {authSuccess && <div style={styles.successAlert}>{authSuccess}</div>}

          <div style={styles.formGroup}>
            <label style={styles.label}>EMAIL ADDRESS</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.edu"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
  <div style={styles.passwordLabelRow}>
    <label style={styles.label}>PASSWORD</label>
    {!isSignUp && (
      <button
        type="button"
        onClick={handleForgotPassword}
        style={styles.forgotBtn}
      >
        Forgot password?
      </button>
    )}
  </div>

  {/* Password Input Wrapper with Embedded Vector Eye Toggle */}
  <div style={styles.passwordInputWrapper}>
    <input
      type={showPassword ? "text" : "password"}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="••••••••"
      required={!authSuccess}
      style={{ ...styles.input, paddingRight: '2.5rem' }}
    />
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      style={styles.eyeToggleBtn}
      title={showPassword ? "Hide Password" : "Show Password"}
    >
      {showPassword ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      )}
    </button>
  </div>
</div>

          <button 
            type="submit" 
            disabled={isSigningIn}
            style={{ 
              ...styles.submitBtn, 
              opacity: isSigningIn ? 0.75 : 1,
              cursor: isSigningIn ? 'not-allowed' : 'pointer'
            }}
          >
            {isSigningIn ? 'Signing in...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div style={styles.toggleFooter}>
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorModal(null);
              setAuthSuccess('');
            }} 
            style={styles.toggleBtn}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

      </div>

      {/* Sapa-Shield Themed Bottom Sheet Alert */}
      {errorModal && (
        <div style={styles.modalOverlay} onClick={() => setErrorModal(null)}>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <div 
            style={styles.modalSheet}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div style={styles.modalHandle} />

            {/* Glowing Danger Badge */}
            <div style={styles.dangerIconBadge}>
              <span style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: '900' }}>!</span>
            </div>

            {/* Title & Message */}
            <h3 style={styles.modalTitle}>{errorModal.title}</h3>
            <p style={styles.modalMessage}>{errorModal.message}</p>

            {/* Sapa-Shield Gradient Close Button */}
            <button 
              onClick={() => setErrorModal(null)}
              style={styles.modalCloseBtn}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  loadingContainer: {
    minHeight: '100vh',
    background: '#090d16',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  logoRingWrapper: {
    position: 'relative',
    width: '90px',
    height: '90px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  },
  spinningRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '3px solid transparent',
    borderTopColor: '#38bdf8',
    borderRightColor: 'rgba(56, 189, 248, 0.2)',
    borderBottomColor: '#0284c7',
    borderLeftColor: 'rgba(56, 189, 248, 0.2)',
    animation: 'spinRing 1.2s linear infinite',
    boxShadow: '0 0 15px rgba(56, 189, 248, 0.3)',
    boxSizing: 'border-box',
  },
  centerLogoImg: {
    width: '52px',
    height: '52px',
    objectFit: 'contain',
    borderRadius: '12px',
    filter: 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.5))',
    zIndex: 2,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    letterSpacing: '0.03em',
  },
  authContainer: {
    minHeight: '100vh',
    background: '#090d16',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  authCard: {
    width: '100%',
    maxWidth: '400px',
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '1.25rem',
    padding: '2.25rem 1.75rem',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
  },
  brandHeaderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '3rem',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.1rem',
    marginBottom: '-1rem',
  },
  loginLogo: {
    width: '80px',
    height: '90px',
    objectFit: 'contain',
    borderRadius: '12px',
    marginRight: '-25px',
    marginLeft: '-30px',
    filter: 'drop-shadow(0 0 16px rgba(56, 189, 248, 0.6))',
  },
  brandTitle: {
    fontSize: '1.8rem',
    fontWeight: '900',
    color: '#ffffff',
    margin: 0,
    padding: 0,
    lineHeight: 1.2,
    letterSpacing: '0.04em',
  },
  brandSubtitle: {
    fontSize: '0.8rem',
    fontWeight: '500',
    color: '#94a3b8',
    margin: 0,
    marginLeft: '5px',
    padding: 0,
    lineHeight: 0.50,
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  passwordLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.7rem',
    fontWeight: '700',
    color: '#cbd5e1',
    letterSpacing: '0.04em',
  },
  forgotBtn: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
  },
  input: {
    width: '100%',
    padding: '0.75rem 0.85rem',
    background: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '0.75rem',
    fontSize: '0.85rem',
    color: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  },
  submitBtn: {
    width: '100%',
    padding: '0.8rem',
    background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
    color: '#090d16',
    border: 'none',
    borderRadius: '0.75rem',
    fontWeight: '800',
    fontSize: '0.875rem',
    letterSpacing: '0.04em',
    marginTop: '0.5rem',
    boxShadow: '0 4px 12px rgba(56, 189, 248, 0.25)',
    transition: 'opacity 0.2s ease',
  },
  successAlert: {
    padding: '0.65rem',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '0.5rem',
    color: '#34d399',
    fontSize: '0.75rem',
    textAlign: 'center',
  },
  toggleFooter: {
    marginTop: '1.25rem',
    textAlign: 'center',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  passwordInputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  eyeToggleBtn: {
    position: 'absolute',
    right: '0.85rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  /* Sapa-Shield Dark Brand Bottom Sheet Modal */
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(9, 13, 22, 0.8)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalSheet: {
    width: '100%',
    maxWidth: '450px',
    background: '#0f172a', // Sapa-Shield Navy Blue background
    borderTop: '1px solid rgba(56, 189, 248, 0.3)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    borderTopLeftRadius: '1.75rem',
    borderTopRightRadius: '1.75rem',
    padding: '1.25rem 1.75rem 2.25rem 1.75rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: '0 -15px 50px rgba(0, 0, 0, 0.8)',
    animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    boxSizing: 'border-box',
  },
  modalHandle: {
    width: '42px',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '9999px',
    marginBottom: '1.25rem',
  },
  dangerIconBadge: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'rgba(244, 63, 94, 0.15)',
    border: '2px solid #f43f5e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
    boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)',
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#ffffff',
    margin: '0 0 0.5rem 0',
    letterSpacing: '0.02em',
  },
  modalMessage: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    lineHeight: 1.4,
    margin: '0 0 1.5rem 0',
    maxWidth: '320px',
  },
  modalCloseBtn: {
    width: '100%',
    padding: '0.8rem',
    background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)', // Brand Gradient
    color: '#090d16',
    border: 'none',
    borderRadius: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: '800',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)',
  },
};