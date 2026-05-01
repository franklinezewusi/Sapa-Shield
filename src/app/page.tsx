"use client";
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import Dashboard from './dashboard';

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  
  // Form validation states
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  
  // Use ref to track if component is mounted
  const isMounted = useRef(true);

  // Real-time validation functions
  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailValue) {
      setEmailError("Email is required");
      return false;
    }
    if (!emailRegex.test(emailValue)) {
      setEmailError("Please enter a valid email address (e.g., name@example.com)");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (passwordValue: string): boolean => {
    if (!passwordValue) {
      setPasswordError(isLogin ? "Password is required" : "Password is required");
      return false;
    }
    if (!isLogin && passwordValue.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const validateUsername = (usernameValue: string): boolean => {
    if (!isLogin && !usernameValue) {
      setUsernameError("Username is required");
      return false;
    }
    if (!isLogin && usernameValue.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return false;
    }
    if (!isLogin && usernameValue.length > 20) {
      setUsernameError("Username must be less than 20 characters");
      return false;
    }
    setUsernameError("");
    return true;
  };

  useEffect(() => {
    isMounted.current = true;
    
    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted.current) {
          setSession(session);
          setLoading(false);
        }
      } catch (error) {
        console.error("Session error:", error);
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };
    
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted.current) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    validateEmail(e.target.value);
    setAuthError("");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    validatePassword(e.target.value);
    setAuthError("");
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    validateUsername(e.target.value);
    setAuthError("");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    
    if (!resetEmail) {
      setResetError("Please enter your email address");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      setResetError("Please enter a valid email address");
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      
      if (error) {
        if (error.message.includes("Email not confirmed")) {
          setResetError("Please verify your email first. Check your inbox for verification link.");
        } else {
          setResetError(error.message);
        }
        setLoading(false);
        return;
      }
      
      setResetMessage("✅ Password reset email sent! Check your inbox (and spam folder) for the link.");
      setResetEmail("");
      
      // Return to login after 3 seconds
      setTimeout(() => {
        setShowResetPassword(false);
        setResetMessage("");
      }, 3000);
      
    } catch (error: any) {
      setResetError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setSuccessMessage("");
    
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isUsernameValid = !isLogin ? validateUsername(username) : true;
    
    if (!isEmailValid || !isPasswordValid || !isUsernameValid) {
      return;
    }
    
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });
        
        if (error) {
          if (error.message === "Invalid login credentials") {
            setAuthError("❌ Incorrect email or password. Please try again.");
          } else if (error.message.includes("Email not confirmed")) {
            setAuthError("📧 Please verify your email address before logging in. Check your inbox!");
          } else {
            setAuthError(`❌ ${error.message}`);
          }
          setLoading(false);
          return;
        }
        
        console.log("Login successful:", data.user?.email);
        
      } else {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              username: username,
              full_name: username
            }
          }
        });
        
        if (error) {
          if (error.message.includes("User already registered")) {
            setAuthError("📧 An account with this email already exists. Please login instead.");
          } else if (error.message.includes("Password should be at least 6 characters")) {
            setAuthError("🔒 Password must be at least 6 characters long.");
          } else {
            setAuthError(`❌ ${error.message}`);
          }
          setLoading(false);
          return;
        }
        
        if (data.user) {
          setSuccessMessage("✅ Account created successfully! Please check your email to verify your account, then login.");
          setEmail("");
          setPassword("");
          setUsername("");
          setTimeout(() => {
            setIsLogin(true);
            setSuccessMessage("");
          }, 3000);
        }
        setLoading(false);
        return;
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      setAuthError(`❌ An unexpected error occurred. Please try again.`);
      setLoading(false);
      return;
    }
    
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Loading state
  if (loading && !session) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingContent}>
          <div style={styles.loadingIcon}>🛡️</div>
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    );
  }

  // Password Reset Page
  if (showResetPassword) {
    return (
      <div style={styles.container}>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <div style={styles.authLogo}>🔐</div>
            <h1 style={styles.authTitle}>Reset Password</h1>
            <p style={styles.authSubtitle}>We'll send you a link to reset your password</p>
          </div>

          {resetMessage && (
            <div style={styles.successMessage}>
              <span>✅</span> {resetMessage}
            </div>
          )}

          {resetError && (
            <div style={styles.errorMessage}>
              <span>⚠️</span> {resetError}
            </div>
          )}

          <form onSubmit={handleResetPassword} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Email Address
                <span style={styles.required}> *</span>
              </label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                style={styles.input}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              style={{
                ...styles.submitButton,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <div style={styles.toggleContainer}>
              <button
                type="button"
                onClick={() => {
                  setShowResetPassword(false);
                  setResetError("");
                  setResetMessage("");
                }}
                style={styles.toggleButton}
              >
                ← Back to Login
              </button>
            </div>
          </form>

          <footer style={styles.footer}>
            <p>Secure authentication powered by Supabase</p>
          </footer>
        </div>

        <div style={styles.backgroundDecoration}>
          <div style={styles.sphere1}></div>
          <div style={styles.sphere2}></div>
          <div style={styles.sphere3}></div>
        </div>
      </div>
    );
  }

  // Login/Signup page
  if (!session) {
    return (
      <div style={styles.container}>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <div style={styles.authLogo}>🛡️</div>
            <h1 style={styles.authTitle}>SAPA-SHIELD</h1>
            <p style={styles.authSubtitle}>Protect your finances from Sapa</p>
          </div>

          {successMessage && (
            <div style={styles.successMessage}>
              <span>✅</span> {successMessage}
            </div>
          )}

          {authError && (
            <div style={styles.errorMessage}>
              <span>⚠️</span> {authError}
            </div>
          )}

          <form onSubmit={handleAuth} style={styles.form}>
            {!isLogin && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  Username
                  <span style={styles.required}> *</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="Choose a username"
                  style={{
                    ...styles.input,
                    borderColor: usernameError ? '#ef4444' : '#e5e7eb'
                  }}
                />
                {usernameError && <p style={styles.errorText}>{usernameError}</p>}
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Email
                <span style={styles.required}> *</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                style={{
                  ...styles.input,
                  borderColor: emailError ? '#ef4444' : '#e5e7eb'
                }}
              />
              {emailError && <p style={styles.errorText}>{emailError}</p>}
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>
                Password
                <span style={styles.required}> *</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder={isLogin ? "Enter your password" : "Create a password (min. 6 characters)"}
                style={{
                  ...styles.input,
                  borderColor: passwordError ? '#ef4444' : '#e5e7eb'
                }}
              />
              {passwordError && <p style={styles.errorText}>{passwordError}</p>}
            </div>

            {/* Forgot Password Link - Only show on login */}
            {isLogin && (
              <div style={styles.forgotPasswordContainer}>
                <button
                  type="button"
                  onClick={() => setShowResetPassword(true)}
                  style={styles.forgotPasswordButton}
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              style={{
                ...styles.submitButton,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? "Processing..." : (isLogin ? "LOGIN" : "SIGN UP")}
            </button>

            <div style={styles.toggleContainer}>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setAuthError("");
                  setSuccessMessage("");
                  setEmailError("");
                  setPasswordError("");
                  setUsernameError("");
                }}
                style={styles.toggleButton}
              >
                {isLogin ? "Need an account? Sign Up" : "Already have an account? Login"}
              </button>
            </div>
          </form>

          <footer style={styles.footer}>
            <p>Secure authentication powered by Supabase</p>
          </footer>
        </div>

        <div style={styles.backgroundDecoration}>
          <div style={styles.sphere1}></div>
          <div style={styles.sphere2}></div>
          <div style={styles.sphere3}></div>
        </div>
      </div>
    );
  }

  return <Dashboard session={session} onLogout={handleLogout} />;
}

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  loadingContainer: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContent: {
    textAlign: 'center',
  },
  loadingIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
    animation: 'pulse 1s infinite',
  },
  loadingText: {
    color: 'white',
    fontSize: '1rem',
  },
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    position: 'relative',
    overflow: 'hidden',
  },
  authCard: {
    background: 'white',
    borderRadius: '1rem',
    padding: '2rem',
    maxWidth: '450px',
    width: '100%',
    boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
    zIndex: 10,
    position: 'relative',
  },
  authHeader: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  authLogo: {
    fontSize: '3rem',
    marginBottom: '0.5rem',
  },
  authTitle: {
    fontSize: '1.8rem',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '0.25rem',
  },
  authSubtitle: {
    fontSize: '0.85rem',
    color: '#666',
  },
  successMessage: {
    background: '#d1fae5',
    color: '#065f46',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  errorMessage: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#333',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '2px solid #e5e7eb',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    transition: 'all 0.3s ease',
    outline: 'none',
  },
  errorText: {
    fontSize: '0.7rem',
    color: '#ef4444',
    marginTop: '0.25rem',
  },
  forgotPasswordContainer: {
    textAlign: 'right',
    marginTop: '-0.5rem',
  },
  forgotPasswordButton: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '0.75rem',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  submitButton: {
    width: '100%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '0.75rem',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    marginTop: '0.5rem',
  },
  toggleContainer: {
    textAlign: 'center',
    marginTop: '0.5rem',
  },
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '0.85rem',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  footer: {
    textAlign: 'center',
    marginTop: '2rem',
    paddingTop: '1rem',
    borderTop: '1px solid #f0f0f0',
    fontSize: '0.7rem',
    color: '#999',
  },
  backgroundDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: 0,
  },
  sphere1: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(102,126,234,0.3), transparent)',
    borderRadius: '50%',
    top: '-100px',
    left: '-100px',
    animation: 'float 20s infinite ease-in-out',
  },
  sphere2: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    background: 'radial-gradient(circle, rgba(118,75,162,0.3), transparent)',
    borderRadius: '50%',
    bottom: '-150px',
    right: '-150px',
    animation: 'float 20s infinite ease-in-out reverse',
  },
  sphere3: {
    position: 'absolute',
    width: '200px',
    height: '200px',
    background: 'radial-gradient(circle, rgba(240,147,251,0.2), transparent)',
    borderRadius: '50%',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    animation: 'float 15s infinite ease-in-out',
  },
};

// Add animations to the document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.05); }
    }
    @keyframes float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(20px, -20px) scale(1.1); }
      66% { transform: translate(-20px, 20px) scale(0.9); }
    }
    input:focus {
      border-color: #667eea !important;
      box-shadow: 0 0 0 3px rgba(102,126,234,0.1) !important;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102,126,234,0.3);
    }
  `;
  document.head.appendChild(style);
}