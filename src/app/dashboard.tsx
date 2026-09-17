"use client";
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DashboardProps {
  session: any;
  onLogout: () => void;
}

// Dynamic Circular Gauge Component
function RunwayGauge({ days, maxDays = 30, isDark }: { days: number; maxDays?: number; isDark: boolean }) {
  const percentage = Math.min(Math.max((days / maxDays) * 100, 0), 100);
  const radius = 60;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Dynamic status color transitions based on runway days
  const gaugeColor = 
    days >= 30 ? '#10b981' : // Green (Safe)
    days >= 14 ? '#38bdf8' : // Sky Blue (Moderate)
    days >= 7  ? '#f59e0b' : // Amber/Yellow (Caution)
                 '#f43f5e';  // Rose Red (Critical)

  return (
    <div style={{ position: 'relative', width: '150px', height: '150px', margin: '0 auto' }}>
      <svg height="150" width="150" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}>
        {/* Track Circle */}
        <circle
          stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx="75"
          cy="75"
        />
        {/* Progress Circle */}
        <circle
          stroke={gaugeColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease-in-out, stroke 0.5s ease' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx="75"
          cy="75"
        />
      </svg>
      {/* Overlay Content */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: '2.25rem', fontWeight: '900', color: isDark ? '#ffffff' : '#0f172a', lineHeight: 1 }}>
          {days}
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: '700', color: gaugeColor, marginTop: '2px', letterSpacing: '0.05em' }}>
          DAYS
        </span>
      </div>
    </div>
  );
}

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [balance, setBalance] = useState<string>('');
  const [spending, setSpending] = useState<string>('');
  const [result, setResult] = useState<{ days: number; balance: number; spending: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  
  // Validation States
  const [balanceError, setBalanceError] = useState<string>('');
  const [spendingError, setSpendingError] = useState<string>('');
  const [isFormValid, setIsFormValid] = useState<boolean>(false);
  
  // What-If States
  const [whatIfCost, setWhatIfCost] = useState<string>('');
  const [whatIfResult, setWhatIfResult] = useState<{ 
    daysLost: number; 
    newDays: number; 
    originalDays: number;
    percentage: number;
  } | null>(null);
  
  // Savings Goal States
  const [savingsTarget, setSavingsTarget] = useState<string>('');
  const [savingsResult, setSavingsResult] = useState<any>(null);
  const [activePercentage, setActivePercentage] = useState<number | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userEmail = session?.user?.email || 'User';
  const userId = session?.user?.id;

  const isDark = theme === 'dark';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadHistoryFromDatabase();
    getUserInfo();

    const handleStrictSecurityExit = async () => {
      if (document.visibilityState === 'hidden') {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error('Security Signout Error:', err);
        } finally {
          onLogout();
        }
      }
    };

    document.addEventListener('visibilitychange', handleStrictSecurityExit);
    window.addEventListener('pagehide', handleStrictSecurityExit);

    return () => {
      document.removeEventListener('visibilitychange', handleStrictSecurityExit);
      window.removeEventListener('pagehide', handleStrictSecurityExit);
    };
  }, []);

  const validateBalance = (value: string): boolean => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setBalanceError('Account balance is required');
      return false;
    }
    const numValue = parseFloat(trimmedValue);
    if (isNaN(numValue) || numValue <= 0) {
      setBalanceError('Please enter a valid amount');
      return false;
    }
    setBalanceError('');
    return true;
  };

  const validateSpending = (value: string): boolean => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setSpendingError('Daily spending is required');
      return false;
    }
    const numValue = parseFloat(trimmedValue);
    if (isNaN(numValue) || numValue <= 0) {
      setSpendingError('Please enter a valid amount');
      return false;
    }
    setSpendingError('');
    return true;
  };

  useEffect(() => {
    const isBalanceValid = balance !== '' && balanceError === '';
    const isSpendingValid = spending !== '' && spendingError === '';
    setIsFormValid(isBalanceValid && isSpendingValid);
  }, [balance, spending, balanceError, spendingError]);

  const getUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const storedUsername = user?.user_metadata?.username || userEmail.split('@')[0];
      setUsername(storedUsername);
    } catch (error) {
      setUsername(userEmail.split('@')[0]);
    }
  };

  const loadHistoryFromDatabase = async (isRetry = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(30);

      if (error) {
        if ((error.code === 'PGRST303' || error.message?.includes('future')) && !isRetry) {
          console.warn('Clock drift detected. Refreshing session and retrying query...');
          await supabase.auth.refreshSession();
          return await loadHistoryFromDatabase(true);
        }
        throw error;
      }
      
      const formattedHistory = data.map((item: any) => ({
        id: item.id,
        date: new Date(item.created_at).toLocaleDateString(),
        balance: item.balance,
        spending: item.spending,
        days: item.survival_days,
        warning: item.survival_days < 7,
        status: item.status,
      }));
      
      setHistory(formattedHistory.reverse());
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSurvival = async () => {
    const isBalanceValid = validateBalance(balance);
    const isSpendingValid = validateSpending(spending);
    if (!isBalanceValid || !isSpendingValid) return;
    
    const balanceNum = parseFloat(balance);
    const spendingNum = parseFloat(spending);
    const fullDays = Math.floor(balanceNum / spendingNum);
    
    setResult({ days: fullDays, balance: balanceNum, spending: spendingNum });
    setWhatIfResult(null);
    setWhatIfCost('');
    setSavingsResult(null);
    setSavingsTarget('');
    setActivePercentage(null);
    
    let status = fullDays >= 30 ? 'EXCELLENT' : fullDays >= 14 ? 'GOOD' : fullDays >= 7 ? 'CAUTION' : 'CRITICAL';
    
    setSaving(true);
    try {
      await supabase.from('predictions').insert([{
        user_id: userId,
        username: username || userEmail.split('@')[0],
        email: userEmail,
        balance: balanceNum,
        spending: spendingNum,
        survival_days: fullDays,
        status: status,
        created_at: new Date().toISOString()
      }]);
      await loadHistoryFromDatabase();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const simulatePurchase = () => {
    if (!result || !whatIfCost) return;
    const cost = parseFloat(whatIfCost);
    if (isNaN(cost) || cost <= 0 || cost > result.balance) return;
    
    const daysLost = cost / result.spending;
    const newDays = Math.floor((result.balance - cost) / result.spending);
    
    setWhatIfResult({
      daysLost: daysLost,
      newDays: newDays,
      originalDays: result.days,
      percentage: (daysLost / result.days) * 100
    });
  };

  const calculateSavingsGoal = (customTarget?: number) => {
    if (!result) return;
    const targetSpend = customTarget !== undefined ? customTarget : parseFloat(savingsTarget);
    if (isNaN(targetSpend) || targetSpend <= 0 || targetSpend >= result.spending) return;

    const newDays = result.balance / targetSpend;
    const daysGained = newDays - result.days;

    setSavingsResult({
      daysGained: daysGained,
      newDays: Math.floor(newDays),
      targetSpend: targetSpend
    });
  };

  const applyPercentageCut = (percent: number) => {
    if (!result) return;
    setActivePercentage(percent);
    const reducedSpend = Math.round(result.spending * (1 - percent / 100));
    setSavingsTarget(reducedSpend.toString());
    calculateSavingsGoal(reducedSpend);
  };

  const clearHistory = async () => {
    if (confirm('Clear all history logs?')) {
      await supabase.from('predictions').delete().eq('user_id', userId);
      setHistory([]);
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.loadingContainer, background: isDark ? '#090d16' : '#f8fafc' }}>
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
          <p style={{ ...styles.loadingText, color: isDark ? '#94a3b8' : '#64748b' }}>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, background: isDark ? '#090d16' : '#e2e8f0' }}>
      <div style={styles.wrapper}>

        {/* Header Structure */}
        <header style={{
          ...styles.headerCard,
          background: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#cbd5e1',
          boxShadow: isDark ? 'none' : '0 10px 25px -5px rgba(0, 0, 0, 0.05)'
        }}>
          
          {/* Top Row: Centered Brand Icon & Title */}
          <div style={styles.headerTopRow}>
            <img src="/SSL.jpg" alt="Logo" style={styles.headerLogo} />
            <h1 style={{ ...styles.brandTitle, color: isDark ? '#ffffff' : '#0f172a' }}>
              SAPA<span style={{ color: '#38bdf8' }}>-SHIELD</span>
            </h1>
          </div>

          {/* Bottom Row: Theme Toggle (Left) & User Dropdown (Right) */}
          <div style={styles.headerBottomRow}>
            
            {/* Left Side: Theme Toggle */}
            <button 
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              style={{
                ...styles.themeToggleBtn,
                background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#e2e8f0',
                color: isDark ? '#FFE3B3' : '#0f172a',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
              }}
              title="Toggle Theme"
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>

            {/* Right Side: User Dropdown */}
            <div style={styles.userContainer} ref={dropdownRef}>
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                style={{
                  ...styles.userButton,
                  background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#e2e8f0',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'
                }}
              >
                <div style={styles.userAvatar}>
                  {username ? username.charAt(0).toUpperCase() : 'U'}
                </div>
                <span style={{ ...styles.userName, color: isDark ? '#cbd5e1' : '#1e293b' }}>
                  {username || userEmail.split('@')[0]}
                </span>
                <span style={{ fontSize: '9px', color: isDark ? '#94a3b8' : '#64748b' }}>▼</span>
              </button>

              {isDropdownOpen && (
                <div style={{
                  ...styles.dropdownMenu,
                  background: isDark ? '#0f172a' : '#ffffff',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'
                }}>
                  <div style={{
                    ...styles.dropdownUserHeader,
                    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
                  }}>
                    <p style={{ fontWeight: 'bold', fontSize: '12px', color: isDark ? '#ffffff' : '#0f172a', margin: 0 }}>{username}</p>
                    <p style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</p>
                  </div>
                  <button 
                    onClick={async () => {
                      await supabase.auth.signOut();
                      onLogout();
                    }}
                    style={styles.logoutBtn}
                  >
                    🚪 Log Out
                  </button>
                </div>
              )}
            </div>

          </div>

        </header>

        {/* 3-Column Grid */}
        <div style={styles.threeColumnGrid}>
          
          {/* Card 1: Financial Analysis */}
          <div style={{
            ...styles.cardBase,
            background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#cbd5e1',
            boxShadow: isDark ? 'none' : '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
          }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>💰</span>
              <div>
                <h2 style={{ ...styles.cardTitle, color: isDark ? '#ffffff' : '#0f172a' }}>Financial Analysis</h2>
                <p style={{ ...styles.cardSubtitle, color: isDark ? '#94a3b8' : '#64748b' }}>Calculate your survival days</p>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={{ ...styles.fieldLabel, color: isDark ? '#cbd5e1' : '#475569' }}>ACCOUNT BALANCE (₦)</label>
              <input 
                type="number" 
                value={balance} 
                onChange={(e) => {
                  setBalance(e.target.value);
                  validateBalance(e.target.value);
                }}
                placeholder="Enter your balance"
                style={{
                  ...styles.inputField,
                  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'
                }}
              />
              {balanceError && <p style={styles.errorHint}>{balanceError}</p>}
            </div>

            <div style={styles.formGroup}>
              <label style={{ ...styles.fieldLabel, color: isDark ? '#cbd5e1' : '#475569' }}>DAILY SPENDING (₦)</label>
              <input 
                type="number" 
                value={spending} 
                onChange={(e) => {
                  setSpending(e.target.value);
                  validateSpending(e.target.value);
                }}
                placeholder="Enter daily burn"
                style={{
                  ...styles.inputField,
                  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'
                }}
              />
              {spendingError && <p style={styles.errorHint}>{spendingError}</p>}
            </div>

            <button 
              onClick={calculateSurvival}
              disabled={!isFormValid || saving}
              style={{
                ...styles.skyBlueActionBtn,
                opacity: (!isFormValid || saving) ? 0.5 : 1,
                cursor: (!isFormValid || saving) ? 'not-allowed' : 'pointer',
              }}
            >
              ✨ {saving ? 'Calculating...' : 'Calculate Survival Days'}
            </button>
          </div>

          {/* Card 2: Survival Analysis */}
          <div style={{
            ...styles.cardBase,
            background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={styles.cardHeader}>
                <span style={styles.cardIcon}>📊</span>
                <div>
                  <h2 style={{ ...styles.cardTitle, color: isDark ? '#ffffff' : '#0f172a' }}>Survival Analysis</h2>
                  <p style={{ ...styles.cardSubtitle, color: isDark ? '#94a3b8' : '#64748b' }}>Your financial forecast</p>
                </div>
              </div>
            </div>

            {result ? (
              <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
                <RunwayGauge days={result.days} maxDays={30} isDark={isDark} />
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                  <div style={{
                    ...styles.metricBadge,
                    background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'
                  }}>
                    <span style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>BALANCE</span>
                    <strong style={{ color: isDark ? '#ffffff' : '#0f172a', display: 'block' }}>₦{result.balance.toLocaleString()}</strong>
                  </div>
                  <div style={{
                    ...styles.metricBadge,
                    background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0'
                  }}>
                    <span style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>DAILY BURN</span>
                    <strong style={{ color: isDark ? '#FFE3B3' : '#d97706', display: 'block' }}>₦{result.spending.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.emptyPlaceholder}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: '500' }}>
                  Enter figures to compute survival telemetry
                </p>
              </div>
            )}
            <div></div>
          </div>

          {/* Card 3: Financial Coach */}
          <div style={styles.beigeAccentCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardIcon}>🎯</span>
              <div>
                <h2 style={{ ...styles.cardTitle, color: '#090d16' }}>Financial Coach</h2>
                <p style={{ ...styles.cardSubtitle, color: '#475569' }}>Personalized strategy</p>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div style={styles.coachPill}>
                💡 {result ? (result.days >= 14 ? "Your financial trend is stable. Keep it up!" : "Warning: Reduce daily spending to protect runway.") : "Your financial trend is stable. Keep it up!"}
              </div>
              <div style={{ ...styles.coachPill, marginTop: '0.75rem' }}>
                📊 You've made {history.length} predictions!
              </div>
            </div>
          </div>

        </div>

        {/* Savings Goal Calculator Section */}
        <div style={{
          ...styles.cardBase,
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
        }}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>🎯</span>
            <div>
              <h2 style={{ ...styles.cardTitle, color: isDark ? '#ffffff' : '#0f172a' }}>Savings Goal Calculator</h2>
              <p style={{ ...styles.cardSubtitle, color: isDark ? '#94a3b8' : '#64748b' }}>See how small changes extend your survival</p>
            </div>
          </div>

          {result ? (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              
              {/* Target Spend Input */}
              <input 
                type="number" 
                value={savingsTarget} 
                onChange={(e) => {
                  setSavingsTarget(e.target.value);
                  setActivePercentage(null);
                }}
                placeholder={`Target daily spend < ₦${result.spending}`}
                style={{
                  ...styles.inputField,
                  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'
                }}
              />

              {/* Save Options directly above Calculate Extension Button */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[10, 20, 30].map((pct) => {
                  const isSelected = activePercentage === pct;
                  return (
                    <button
                      key={pct}
                      onClick={() => applyPercentageCut(pct)}
                      style={{
                        flex: 1,
                        padding: '0.45rem 0.75rem',
                        borderRadius: '0.65rem',
                        border: '1px solid',
                        borderColor: isSelected ? '#38bdf8' : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'),
                        background: isSelected 
                          ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' 
                          : (isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9'),
                        color: isSelected ? '#090d16' : (isDark ? '#cbd5e1' : '#1e293b'),
                        fontWeight: '700',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textAlign: 'center',
                      }}
                    >
                      save {pct}%
                    </button>
                  );
                })}
              </div>

              {/* Calculate Button & Result Badge */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => calculateSavingsGoal()} style={{ ...styles.secondaryBtn, flex: 1 }}>
                  Calculate Extension
                </button>
                {savingsResult && (
                  <div style={{ ...styles.successPill, width: '100%' }}>
                    🎉 +{savingsResult.daysGained.toFixed(1)} Extra Days Unlocked! (New Runway: {savingsResult.newDays} Days)
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div style={{ ...styles.emptyCenterText, color: isDark ? '#64748b' : '#94a3b8' }}>
              Calculate survival days first
            </div>
          )}
        </div>

        {/* What-If Simulator Section */}
        <div style={{
          ...styles.cardBase,
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
        }}>
          <div style={styles.cardHeader}>
            <span style={styles.cardIcon}>🤔</span>
            <div>
              <h2 style={{ ...styles.cardTitle, color: isDark ? '#ffffff' : '#0f172a' }}>What-If Simulator</h2>
              <p style={{ ...styles.cardSubtitle, color: isDark ? '#94a3b8' : '#64748b' }}>See the "Time Tax" of your purchases</p>
            </div>
          </div>

          {result ? (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="number" 
                value={whatIfCost} 
                onChange={(e) => setWhatIfCost(e.target.value)}
                placeholder="Purchase cost (₦)"
                style={{
                  ...styles.inputField,
                  flex: 1,
                  minWidth: '200px',
                  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'
                }}
              />
              <button onClick={simulatePurchase} style={styles.secondaryBtn}>
                Simulate Risk
              </button>
              {whatIfResult && (
                <div style={styles.warningPill}>
                  ⚠️ Cost: -{whatIfResult.daysLost.toFixed(1)} Days Lost | New Runway: {whatIfResult.newDays} Days
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...styles.emptyCenterText, color: isDark ? '#64748b' : '#94a3b8' }}>
              Calculate survival days first
            </div>
          )}
        </div>

        {/* Historical Logs Data Table */}
        <div style={{
          ...styles.cardBase,
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ ...styles.cardTitle, color: isDark ? '#ffffff' : '#0f172a' }}>Historical Logs</h2>
            {history.length > 0 && (
              <button onClick={clearHistory} style={styles.clearBtn}>
                🗑️ Clear Logs
              </button>
            )}
          </div>

          {history.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr style={{
                    ...styles.tableHeaderRow,
                    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
                  }}>
                    <th style={styles.th}>DATE</th>
                    <th style={styles.th}>BALANCE</th>
                    <th style={styles.th}>DAILY SPEND</th>
                    <th style={styles.th}>SURVIVAL</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} style={{
                      ...styles.tableRow,
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'
                    }}>
                      <td style={{ ...styles.td, color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'monospace' }}>
                        {item.date}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: isDark ? '#ffffff' : '#0f172a' }}>
                        ₦{item.balance.toLocaleString()}
                      </td>
                      <td style={{ ...styles.td, color: isDark ? '#FFE3B3' : '#d97706' }}>
                        ₦{item.spending.toLocaleString()}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: '#38bdf8' }}>
                        {item.days} Days
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <span style={item.days >= 14 ? styles.statusGood : styles.statusBad}>
                          {item.status || (item.days >= 14 ? 'GOOD' : 'CRITICAL')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...styles.emptyCenterText, color: isDark ? '#64748b' : '#94a3b8' }}>
              No historical projections recorded yet.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  loadingContainer: {
    minHeight: '100vh',
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
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    letterSpacing: '0.03em',
  },
  container: {
    minHeight: '100vh',
    width: '100%',
    padding: '1.25rem 0.85rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
    transition: 'background 0.3s ease',
  },
  wrapper: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  headerCard: {
    border: '1px solid',
    borderRadius: '1.25rem',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
    position: 'relative',
    zIndex: 40,
  },
  headerTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.1rem',
  },
  headerBottomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  headerLogo: {
    width: '60px',
    height: '60px',
    objectFit: 'contain',
    borderRadius: '10px',
    marginRight: '-13px',
    marginLeft: '-9px',
    filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.45))',
  },
  brandTitle: {
    fontSize: '1.4rem',
    fontWeight: '800',
    margin: 0,
    marginRight: '12px',
    lineHeight: 1,
    letterSpacing: '0.04em',
  },
  themeToggleBtn: {
    padding: '0.35rem 0.75rem',
    borderRadius: '9999px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '700',
    whiteSpace: 'nowrap',
  },
  userContainer: {
    position: 'relative',
    zIndex: 50,
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    border: '1px solid',
    padding: '0.35rem 0.65rem',
    borderRadius: '9999px',
    cursor: 'pointer',
  },
  userAvatar: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
    color: '#090d16',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
  },
  userName: {
    fontSize: '0.75rem',
    fontWeight: '600',
    maxWidth: '90px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dropdownMenu: {
    position: 'absolute',
    right: 0,
    top: '125%',
    width: '180px',
    border: '1px solid',
    borderRadius: '0.75rem',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    padding: '0.5rem',
    zIndex: 100,
  },
  dropdownUserHeader: {
    padding: '0.4rem 0.5rem',
    borderBottom: '1px solid',
    marginBottom: '0.4rem',
  },
  logoutBtn: {
    width: '100%',
    padding: '0.45rem 0.65rem',
    background: 'rgba(244, 63, 94, 0.15)',
    color: '#fb7185',
    border: 'none',
    borderRadius: '0.5rem',
    fontWeight: '600',
    fontSize: '0.75rem',
    cursor: 'pointer',
    textAlign: 'left',
  },
  threeColumnGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.25rem',
  },
  cardBase: {
    border: '1px solid',
    borderRadius: '1.25rem',
    padding: '1.25rem',
    transition: 'background 0.3s ease, border-color 0.3s ease',
  },
  beigeAccentCard: {
    background: 'linear-gradient(135deg, #FFE3B3 0%, #fef08a 100%)',
    borderRadius: '1.25rem',
    padding: '1.25rem',
    color: '#090d16',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
    marginBottom: '0.85rem',
  },
  cardIcon: {
    fontSize: '1.35rem',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    margin: 0,
  },
  cardSubtitle: {
    fontSize: '0.7rem',
    margin: 0,
  },
  formGroup: {
    marginBottom: '0.85rem',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: '700',
    marginBottom: '0.3rem',
    letterSpacing: '0.04em',
  },
  inputField: {
    width: '100%',
    padding: '0.7rem 0.85rem',
    border: '1px solid',
    borderRadius: '0.75rem',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  errorHint: {
    fontSize: '0.7rem',
    color: '#fb7185',
    margin: '0.25rem 0 0 0',
  },
  skyBlueActionBtn: {
    width: '100%',
    padding: '0.8rem',
    background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
    color: '#090d16',
    border: 'none',
    borderRadius: '0.75rem',
    fontWeight: '800',
    fontSize: '0.85rem',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    marginTop: '0.25rem',
  },
  secondaryBtn: {
    padding: '0.7rem 1.1rem',
    background: '#0284c7',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.75rem',
    fontWeight: '700',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  metricBadge: {
    flex: 1,
    border: '1px solid',
    padding: '0.65rem',
    borderRadius: '0.75rem',
    textAlign: 'center',
  },
  emptyPlaceholder: {
    padding: '2.5rem 1rem',
    textAlign: 'center',
  },
  emptyCenterText: {
    padding: '2rem 1rem',
    textAlign: 'center',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  coachPill: {
    background: 'rgba(9, 13, 22, 0.1)',
    border: '1px solid rgba(9, 13, 22, 0.1)',
    padding: '0.65rem 0.85rem',
    borderRadius: '0.75rem',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#090d16',
  },
  successPill: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    padding: '0.65rem 0.85rem',
    borderRadius: '0.75rem',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
  warningPill: {
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    color: '#fbbf24',
    padding: '0.65rem 0.85rem',
    borderRadius: '0.75rem',
    fontSize: '0.8rem',
    fontWeight: '600',
  },
  clearBtn: {
    background: 'rgba(244, 63, 94, 0.15)',
    color: '#fb7185',
    border: 'none',
    padding: '0.35rem 0.75rem',
    borderRadius: '0.5rem',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.8rem',
  },
  tableHeaderRow: {
    borderBottom: '1px solid',
  },
  th: {
    padding: '0.65rem 0.5rem',
    fontSize: '0.65rem',
    color: '#64748b',
    fontWeight: '700',
    letterSpacing: '0.04em',
  },
  tableRow: {
    borderBottom: '1px solid',
  },
  td: {
    padding: '0.75rem 0.5rem',
  },
  statusGood: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    padding: '0.2rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.65rem',
    fontWeight: '700',
  },
  statusBad: {
    background: 'rgba(244, 63, 94, 0.15)',
    border: '1px solid rgba(244, 63, 94, 0.3)',
    color: '#fb7185',
    padding: '0.2rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.65rem',
    fontWeight: '700',
  },
};