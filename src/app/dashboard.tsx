"use client";
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  session: any;
  onLogout: () => void;
}

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const [balance, setBalance] = useState<string>('');
  const [spending, setSpending] = useState<string>('');
  const [result, setResult] = useState<{ days: number; balance: number; spending: number } | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [showTrends, setShowTrends] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  
  // Form validation states
  const [balanceError, setBalanceError] = useState<string>('');
  const [spendingError, setSpendingError] = useState<string>('');
  const [isFormValid, setIsFormValid] = useState<boolean>(false);
  
  // What-If states
  const [whatIfCost, setWhatIfCost] = useState<string>('');
  const [whatIfResult, setWhatIfResult] = useState<{ 
    daysLost: number; 
    newDays: number; 
    originalDays: number;
    percentage: number;
  } | null>(null);
  const [whatIfError, setWhatIfError] = useState<string>('');
  
  // Savings Goal states
  const [savingsTarget, setSavingsTarget] = useState<string>('');
  const [savingsResult, setSavingsResult] = useState<any>(null);
  const [savingsError, setSavingsError] = useState<string>('');
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userEmail = session?.user?.email || 'User';
  const userId = session?.user?.id;

  // Load dark mode preference
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('sapaShieldDarkMode');
    if (savedDarkMode !== null) {
      setDarkMode(savedDarkMode === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sapaShieldDarkMode', String(darkMode));
  }, [darkMode]);

  // Close dropdown when clicking outside
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
  }, []);

  // ============ VALIDATION FUNCTIONS ============
  const validateBalance = (value: string): boolean => {
    const trimmedValue = value.trim();
    
    if (!trimmedValue) {
      setBalanceError('Account balance is required');
      return false;
    }
    
    const numValue = parseFloat(trimmedValue);
    if (isNaN(numValue)) {
      setBalanceError('Please enter a valid number');
      return false;
    }
    
    if (numValue <= 0) {
      setBalanceError('Balance must be greater than ₦0');
      return false;
    }
    
    if (numValue > 100000000) {
      setBalanceError('Balance seems unrealistic. Maximum ₦100,000,000');
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
    if (isNaN(numValue)) {
      setSpendingError('Please enter a valid number');
      return false;
    }
    
    if (numValue <= 0) {
      setSpendingError('Daily spending must be greater than ₦0');
      return false;
    }
    
    if (numValue > 1000000) {
      setSpendingError('Daily spending seems unrealistic. Maximum ₦1,000,000');
      return false;
    }
    
    // Check if spending exceeds balance
    const balanceNum = parseFloat(balance);
    if (balance && !isNaN(balanceNum) && balanceNum > 0) {
      if (numValue > balanceNum) {
        setSpendingError('Daily spending cannot exceed your account balance');
        return false;
      }
    }
    
    setSpendingError('');
    return true;
  };

  // Update form validity
  useEffect(() => {
    const isBalanceValid = balance !== '' && balanceError === '';
    const isSpendingValid = spending !== '' && spendingError === '';
    setIsFormValid(isBalanceValid && isSpendingValid);
  }, [balance, spending, balanceError, spendingError]);

  // ============ HANDLER FUNCTIONS ============
  const handleBalanceChange = (value: string) => {
    setBalance(value);
    validateBalance(value);
    if (spending) validateSpending(spending);
  };

  const handleSpendingChange = (value: string) => {
    setSpending(value);
    validateSpending(value);
  };

  const handleWhatIfChange = (value: string) => {
    setWhatIfCost(value);
    if (!value.trim()) {
      setWhatIfError('');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setWhatIfError('Please enter a valid number');
    } else if (numValue <= 0) {
      setWhatIfError('Purchase amount must be greater than ₦0');
    } else if (result && numValue > result.balance) {
      setWhatIfError('Purchase amount cannot exceed your current balance');
    } else {
      setWhatIfError('');
    }
  };

  const handleSavingsTargetChange = (value: string) => {
    setSavingsTarget(value);
    if (!value.trim()) {
      setSavingsError('');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setSavingsError('Please enter a valid number');
    } else if (numValue <= 0) {
      setSavingsError('Target spending must be greater than ₦0');
    } else if (result && numValue >= result.spending) {
      setSavingsError('Target spending must be less than current daily spending');
    } else {
      setSavingsError('');
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    setIsDropdownOpen(false);
  };

  const getUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const storedUsername = user?.user_metadata?.username || userEmail.split('@')[0];
      setUsername(storedUsername);
    } catch (error) {
      setUsername(userEmail.split('@')[0]);
    }
  };

  const loadHistoryFromDatabase = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(30);

      if (error) throw error;
      
      const formattedHistory = data.map((item: any) => ({
        id: item.id,
        date: new Date(item.created_at).toLocaleDateString(),
        time: new Date(item.created_at).toLocaleTimeString(),
        balance: item.balance,
        spending: item.spending,
        days: item.survival_days,
        warning: item.survival_days < 7,
        username: item.username || 'User',
        status: item.status,
      }));
      
      setHistory(formattedHistory.reverse());
    } catch (error) {
      console.error('Error loading history:', error);
      const saved = localStorage.getItem('sapaShieldHistory');
      if (saved) setHistory(JSON.parse(saved));
    } finally {
      setLoading(false);
    }
  };

  const saveToDatabase = async (balanceNum: number, spendingNum: number, days: number, status: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userUsername = user?.user_metadata?.username || username || userEmail.split('@')[0];
      
      const { error } = await supabase.from('predictions').insert([{
        user_id: userId,
        username: userUsername,
        email: userEmail,
        balance: balanceNum,
        spending: spendingNum,
        survival_days: days,
        status: status,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;
      await loadHistoryFromDatabase();
      return true;
    } catch (error) {
      console.error('Error saving to database:', error);
      // Fallback to localStorage
      const newEntry = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        balance: balanceNum,
        spending: spendingNum,
        days: days,
        warning: days < 7,
        username: username || userEmail.split('@')[0],
      };
      const updatedHistory = [newEntry, ...history].slice(0, 30);
      localStorage.setItem('sapaShieldHistory', JSON.stringify(updatedHistory));
      setHistory(updatedHistory);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = async () => {
    if (confirm('Clear all history? This cannot be undone.')) {
      setSaving(true);
      try {
        await supabase.from('predictions').delete().eq('user_id', userId);
        setHistory([]);
        localStorage.removeItem('sapaShieldHistory');
        alert('History cleared successfully!');
      } catch (error) {
        alert('Failed to clear history');
      } finally {
        setSaving(false);
      }
    }
  };

  const calculateSurvival = async () => {
    const isBalanceValid = validateBalance(balance);
    const isSpendingValid = validateSpending(spending);
    
    if (!isBalanceValid || !isSpendingValid) return;
    
    const balanceNum = parseFloat(balance);
    const spendingNum = parseFloat(spending);
    const fullDays = Math.floor(balanceNum / spendingNum);
    
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
    
    setResult({ days: fullDays, balance: balanceNum, spending: spendingNum });
    setWhatIfResult(null);
    setWhatIfCost('');
    setSavingsResult(null);
    setSavingsTarget('');
    
    let status = '';
    if (fullDays >= 30) status = 'EXCELLENT';
    else if (fullDays >= 14) status = 'GOOD';
    else if (fullDays >= 7) status = 'CAUTION';
    else status = 'CRITICAL';
    
    await saveToDatabase(balanceNum, spendingNum, fullDays, status);
  };

  const simulatePurchase = () => {
    if (!result) {
      alert('Please calculate your survival days first');
      return;
    }
    
    if (!whatIfCost || whatIfCost === '') return;
    const cost = parseFloat(whatIfCost);
    if (isNaN(cost) || cost <= 0) {
      setWhatIfError('Please enter a valid purchase amount');
      return;
    }
    if (cost > result.balance) {
      setWhatIfError('Purchase amount cannot exceed your current balance');
      return;
    }
    
    const daysLost = cost / result.spending;
    const newDays = Math.floor((result.balance - cost) / result.spending);
    
    setWhatIfResult({
      daysLost: daysLost,
      newDays: newDays,
      originalDays: result.days,
      percentage: (daysLost / result.days) * 100
    });
    setWhatIfError('');
  };

  const clearWhatIf = () => {
    setWhatIfResult(null);
    setWhatIfCost('');
    setWhatIfError('');
  };

  const calculateSavingsGoal = () => {
    if (!result) {
      alert('Calculate your survival days first');
      return;
    }

    if (!savingsTarget || savingsTarget === '') return;
    const targetSpend = parseFloat(savingsTarget);
    if (isNaN(targetSpend) || targetSpend <= 0) {
      setSavingsError('Please enter a valid target amount');
      return;
    }
    if (targetSpend >= result.spending) {
      setSavingsError('Target spending must be less than current daily spending');
      return;
    }

    const newDays = result.balance / targetSpend;
    const daysGained = newDays - result.days;
    const dailySavings = result.spending - targetSpend;

    setSavingsResult({
      daysGained: daysGained,
      newDays: Math.floor(newDays),
      newDailySpend: targetSpend,
      weeklySavings: dailySavings * 7,
      monthlySavings: dailySavings * 30
    });
    setSavingsError('');
  };

  const setQuickSaving = (percentage: number) => {
    if (result) {
      const newTarget = result.spending * (1 - percentage / 100);
      setSavingsTarget(Math.round(newTarget).toString());
      setSavingsError('');
    }
  };

  const getStatus = (days: number) => {
    if (days >= 30) return { text: 'EXCELLENT', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', icon: '🎉', alertLevel: 'safe' };
    if (days >= 14) return { text: 'GOOD', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', icon: '👍', alertLevel: 'safe' };
    if (days >= 7) return { text: 'CAUTION', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', icon: '⚠️', alertLevel: 'warning' };
    return { text: 'DANGER', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '🚨', alertLevel: 'critical' };
  };

  const getChartData = () => {
    return [...history].reverse().map((item, idx) => ({
      index: idx + 1,
      days: item.days,
      balance: item.balance,
      spending: item.spending,
    }));
  };

  const getTrendAnalysis = () => {
    if (history.length < 2) return null;
    const recent = history[0];
    const oldest = history[history.length - 1];
    const daysChange = recent.days - oldest.days;
    return {
      isImproving: daysChange > 0,
      daysChange: Math.abs(daysChange),
      totalPredictions: history.length,
      recentDays: recent.days,
      oldestDays: oldest.days
    };
  };

  const getTrendInsight = () => {
    if (history.length < 3) return "Make more predictions to see your financial trend!";
    const recent = history.slice(0, 3);
    const avgDays = recent.reduce((sum, item) => sum + item.days, 0) / 3;
    const previousAvg = history.slice(3, 6).reduce((sum, item) => sum + item.days, 0) / 3;
    
    if (avgDays > previousAvg + 5) return "EXCELLENT! Your survival days are increasing!";
    if (avgDays < previousAvg - 5) return "WARNING: Your survival days are decreasing!";
    return "Your financial trend is stable. Keep it up!";
  };

  const status = result ? getStatus(result.days) : { text: 'READY', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: '💪', alertLevel: 'safe' };
  const isCritical = status.alertLevel === 'critical';
  const isWarning = status.alertLevel === 'warning';
  const chartData = getChartData();
  const trendAnalysis = getTrendAnalysis();

  const getBackgroundStyle = () => {
    if (darkMode) {
      if (isCritical) return 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)';
      if (isWarning) return 'linear-gradient(135deg, #9a3412 0%, #7c2d12 100%)';
      return 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
    }
    if (isCritical) return 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)';
    if (isWarning) return 'linear-gradient(135deg, #9a3412 0%, #7c2d12 100%)';
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  };

  const getCardStyle = () => ({
    background: darkMode ? '#1e1e2e' : 'white',
    borderRadius: '1rem',
    padding: 'clamp(0.75rem, 4vw, 1rem)',
    boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.3)' : '0 4px 20px rgba(0,0,0,0.08)',
    border: darkMode ? '1px solid #2d2d3d' : 'none',
  });

  const handleLogout = () => {
    setIsDropdownOpen(false);
    onLogout();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: getBackgroundStyle(), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 1s infinite' }}>🛡️</div>
          <p style={{ color: darkMode ? '#e0e0e0' : 'white' }}>Loading your financial data...</p>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: getBackgroundStyle(), padding: 'clamp(0.5rem, 3vw, 1rem)', transition: 'all 0.3s ease' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Critical Alert Banner */}
        {isCritical && (
          <div style={{ background: '#dc2626', padding: '0.5rem', marginBottom: '1rem', borderRadius: '0.5rem', animation: 'pulse 1s infinite' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(1rem, 4vw, 1.5rem)' }}>🚨🚨🚨</span>
              <span style={{ color: 'white', fontWeight: 'bold', fontSize: 'clamp(0.8rem, 4vw, 1.2rem)' }}>CRITICAL ALERT: FINANCIAL EMERGENCY</span>
              <span style={{ fontSize: 'clamp(1rem, 4vw, 1.5rem)' }}>🚨🚨🚨</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{
          background: darkMode ? '#1e1e2e' : 'white',
          borderRadius: '1rem',
          padding: 'clamp(0.5rem, 3vw, 0.75rem) clamp(0.75rem, 4vw, 1rem)',
          marginBottom: 'clamp(0.75rem, 3vw, 1rem)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: darkMode ? '1px solid #2d2d3d' : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1' }}>
              <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}>🛡️</div>
              <div>
                <h1 style={{ fontSize: 'clamp(0.9rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333', margin: 0, whiteSpace: 'nowrap' }}>SAPA-SHIELD</h1>
                <p style={{ fontSize: 'clamp(0.55rem, 2.5vw, 0.8rem)', color: darkMode ? '#a0a0a0' : '#666', margin: 0, whiteSpace: 'nowrap' }}>Student Survival System</p>
              </div>
            </div>
            
            {/* Avatar Dropdown */}
            <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '0.25rem 0.5rem', borderRadius: '2rem', transition: 'all 0.3s ease',
              }}>
                <div style={{
                  width: 'clamp(32px, 8vw, 40px)', height: 'clamp(32px, 8vw, 40px)',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 'clamp(0.9rem, 4vw, 1.1rem)',
                }}>{username.charAt(0).toUpperCase()}</div>
                <div style={{ fontSize: 'clamp(0.65rem, 3vw, 0.85rem)', fontWeight: '500', color: darkMode ? '#e0e0e0' : '#333' }}>
                  {username.split(' ')[0] || username}
                </div>
                <div style={{
                  width: 0, height: 0,
                  borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                  borderTop: `4px solid ${darkMode ? '#a0a0a0' : '#666'}`,
                  transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }} />
              </button>

              {isDropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: '0', width: 'clamp(260px, 80vw, 280px)',
                  background: darkMode ? '#2d2d3d' : 'white', borderRadius: '0.75rem', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                  border: darkMode ? '1px solid #3d3d4d' : '1px solid #e5e7eb', zIndex: 1000, overflow: 'hidden',
                }}>
                  <div style={{ padding: '1rem', borderBottom: `1px solid ${darkMode ? '#3d3d4d' : '#e5e7eb'}` }}>
                    <div style={{
                      width: '48px', height: '48px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.75rem',
                    }}>{username.charAt(0).toUpperCase()}</div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: darkMode ? '#e0e0e0' : '#333', wordBreak: 'break-word' }}>{username}</div>
                    <div style={{ fontSize: '0.7rem', color: darkMode ? '#a0a0a0' : '#666', marginTop: '0.25rem', wordBreak: 'break-word' }}>{userEmail}</div>
                  </div>
                  <button onClick={toggleDarkMode} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                    color: darkMode ? '#e0e0e0' : '#333',
                  }}>
                    <span>{darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}</span>
                    <span style={{ fontSize: '0.7rem', color: '#667eea' }}>Switch</span>
                  </button>
                  <button onClick={handleLogout} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.75rem 1rem', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: '0.85rem', color: '#ef4444', borderBottomLeftRadius: '0.75rem', borderBottomRightRadius: '0.75rem',
                  }}>
                    <span>🚪</span> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(0.75rem, 3vw, 1rem)', marginBottom: 'clamp(0.75rem, 3vw, 1rem)' }}>
          {/* Financial Analysis Card */}
          <div style={getCardStyle()}>
            <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333', marginBottom: '0.25rem' }}>💰 Financial Analysis</h2>
            <p style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#a0a0a0' : '#666', marginBottom: '1rem' }}>Calculate your survival days</p>
            
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#e0e0e0' : '#333' }}>Account Balance (₦)</label>
              <input type="number" value={balance} onChange={(e) => handleBalanceChange(e.target.value)} placeholder="Enter your balance"
                style={{
                  width: '100%', padding: 'clamp(0.5rem, 3vw, 0.75rem)', fontSize: 'clamp(0.85rem, 3.5vw, 1rem)',
                  background: darkMode ? '#2d2d3d' : 'white', color: darkMode ? '#e0e0e0' : '#333',
                  border: balanceError ? '2px solid #ef4444' : (darkMode ? '1px solid #3d3d4d' : '2px solid #e5e7eb'),
                  borderRadius: '0.5rem', outline: 'none',
                }}
              />
              {balanceError && <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.25rem' }}>⚠️ {balanceError}</div>}
            </div>
            
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#e0e0e0' : '#333' }}>Daily Spending (₦)</label>
              <input type="number" value={spending} onChange={(e) => handleSpendingChange(e.target.value)} placeholder="Enter daily expenses"
                style={{
                  width: '100%', padding: 'clamp(0.5rem, 3vw, 0.75rem)', fontSize: 'clamp(0.85rem, 3.5vw, 1rem)',
                  background: darkMode ? '#2d2d3d' : 'white', color: darkMode ? '#e0e0e0' : '#333',
                  border: spendingError ? '2px solid #ef4444' : (darkMode ? '1px solid #3d3d4d' : '2px solid #e5e7eb'),
                  borderRadius: '0.5rem', outline: 'none',
                }}
              />
              {spendingError && <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.25rem' }}>⚠️ {spendingError}</div>}
            </div>
            
            <button onClick={calculateSurvival} disabled={!isFormValid || saving} style={{
              width: '100%', padding: 'clamp(0.5rem, 3vw, 0.75rem)', fontSize: 'clamp(0.8rem, 3.5vw, 1rem)',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '0.5rem',
              fontWeight: '600', cursor: !isFormValid || saving ? 'not-allowed' : 'pointer', opacity: !isFormValid || saving ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem',
            }}>
              <span>✨</span> {saving ? 'Saving...' : 'Calculate Survival Days'}
            </button>
          </div>

          {/* Survival Analysis Card */}
          <div style={getCardStyle()}>
            <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333', marginBottom: '0.25rem' }}>📊 Survival Analysis</h2>
            <p style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#a0a0a0' : '#666', marginBottom: '1rem' }}>Your financial forecast</p>
            
            {result ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)', fontWeight: 'bold', color: '#4f46e5' }}>{result.days}</div>
                <div style={{ marginBottom: '0.75rem' }}>Days</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', borderRadius: '2rem', background: status.bg, color: status.color, marginBottom: '0.75rem' }}>
                  <span>{status.icon}</span> STATUS: {status.text}
                </div>
                <div style={{ background: darkMode ? '#2d2d3d' : '#f9fafb', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.7rem' }}>💰 Balance</div><div style={{ fontWeight: 'bold' }}>₦{result.balance.toLocaleString()}</div></div>
                  <div style={{ width: '1px', background: '#e5e7eb' }}></div>
                  <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: '0.7rem' }}>📉 Daily Spend</div><div style={{ fontWeight: 'bold' }}>₦{result.spending.toLocaleString()}</div></div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}><div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div><p>Enter your numbers to see analysis</p></div>
            )}
          </div>

          {/* Financial Coach Card */}
          <div style={{ ...getCardStyle(), background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white' }}>
            <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold', marginBottom: '0.25rem', color: 'white' }}>🎯 Financial Coach</h2>
            <p style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', marginBottom: '1rem', color: 'rgba(255,255,255,0.8)' }}>Personalized strategy</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}><span>💡</span><p style={{ fontSize: '0.8rem', margin: 0 }}>{getTrendInsight()}</p></div>
              {history.length >= 3 && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', fontSize: '0.75rem' }}>📊 You've made {history.length} predictions!</div>}
            </div>
          </div>
        </div>

        {/* Savings Goal Calculator */}
        <div style={{ marginBottom: 'clamp(0.75rem, 3vw, 1rem)' }}>
          <div style={getCardStyle()}>
            <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333' }}>🎯 Savings Goal Calculator</h2>
            <p style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#a0a0a0' : '#666', marginBottom: '1rem' }}>See how small changes extend your survival</p>
            
            {result ? (
              <>
                <div style={{ background: darkMode ? '#2d2d3d' : '#f3f4f6', padding: '0.6rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', fontSize: 'clamp(0.7rem, 3vw, 0.85rem)' }}>
                  <span>Current Daily Spend:</span><strong>₦{result.spending.toLocaleString()}/day</strong><span>→ {result.days} days left</span>
                </div>
                
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#e0e0e0' : '#333' }}>Target Daily Spending (₦)</label>
                  <input type="number" value={savingsTarget} onChange={(e) => handleSavingsTargetChange(e.target.value)} placeholder={`Less than ₦${result.spending.toLocaleString()}`}
                    style={{ width: '100%', padding: 'clamp(0.5rem, 3vw, 0.75rem)', background: darkMode ? '#2d2d3d' : 'white', color: darkMode ? '#e0e0e0' : '#333', border: savingsError ? '2px solid #ef4444' : (darkMode ? '1px solid #3d3d4d' : '2px solid #e5e7eb'), borderRadius: '0.5rem', outline: 'none' }}
                  />
                  {savingsError && <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.25rem' }}>⚠️ {savingsError}</div>}
                </div>
                
                <button onClick={calculateSavingsGoal} style={{ width: '100%', padding: 'clamp(0.5rem, 3vw, 0.75rem)', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', marginBottom: '0.75rem' }}>Calculate Days Gained</button>
                
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <button onClick={() => setQuickSaving(10)} style={{ padding: '0.25rem 0.75rem', background: darkMode ? '#2d2d3d' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '1rem', fontSize: '0.7rem', cursor: 'pointer' }}>Save 10%</button>
                  <button onClick={() => setQuickSaving(20)} style={{ padding: '0.25rem 0.75rem', background: darkMode ? '#2d2d3d' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '1rem', fontSize: '0.7rem', cursor: 'pointer' }}>Save 20%</button>
                  <button onClick={() => setQuickSaving(30)} style={{ padding: '0.25rem 0.75rem', background: darkMode ? '#2d2d3d' : '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '1rem', fontSize: '0.7rem', cursor: 'pointer' }}>Save 30%</button>
                </div>
                
                {savingsResult && (
                  <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem', border: '1px solid #10b981' }}>
                    <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}><span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981', display: 'block' }}>+{savingsResult.daysGained.toFixed(1)}</span><span style={{ fontSize: '0.65rem' }}>EXTRA DAYS</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px dashed #e5e7eb', fontSize: '0.8rem' }}><span>Daily Spend:</span><span>₦{savingsResult.newDailySpend.toLocaleString()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px dashed #e5e7eb', fontSize: '0.8rem' }}><span>New Days:</span><span>{savingsResult.newDays} days</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.8rem' }}><span>Monthly Savings:</span><span style={{ color: '#10b981', fontWeight: 'bold' }}>₦{savingsResult.monthlySavings.toLocaleString()}</span></div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}><p>Calculate survival days first</p></div>
            )}
          </div>
        </div>

        {/* What-If Simulator */}
        <div style={{ marginBottom: 'clamp(0.75rem, 3vw, 1rem)' }}>
          <div style={getCardStyle()}>
            <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333' }}>🤔 What-If Simulator</h2>
            <p style={{ fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: darkMode ? '#a0a0a0' : '#666', marginBottom: '1rem' }}>See the "Time Tax" of your purchases</p>
            
            {result ? (
              <>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <input type="number" value={whatIfCost} onChange={(e) => handleWhatIfChange(e.target.value)} placeholder="Enter purchase amount (₦)" style={{ flex: 2, padding: 'clamp(0.5rem, 3vw, 0.75rem)', background: darkMode ? '#2d2d3d' : 'white', color: darkMode ? '#e0e0e0' : '#333', border: whatIfError ? '2px solid #ef4444' : (darkMode ? '1px solid #3d3d4d' : '2px solid #e5e7eb'), borderRadius: '0.5rem', outline: 'none' }} />
                  <button onClick={simulatePurchase} style={{ flex: 1, padding: 'clamp(0.5rem, 3vw, 0.75rem)', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600' }}>Calculate Time Tax</button>
                </div>
                {whatIfError && <div style={{ color: '#ef4444', fontSize: '0.7rem', marginBottom: '0.75rem' }}>⚠️ {whatIfError}</div>}
                
                {whatIfResult && (
                  <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: whatIfResult.percentage > 20 ? '#ef4444' : '#f59e0b', color: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>⏱️ Costs <strong>{whatIfResult.daysLost.toFixed(1)} DAYS</strong> of survival!</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.7rem', marginBottom: '0.5rem' }}><span>{whatIfResult.originalDays} → {whatIfResult.newDays} days</span><span>Loss: {whatIfResult.percentage.toFixed(1)}% of time</span></div>
                    <button onClick={clearWhatIf} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', padding: '0.25rem 0.6rem', borderRadius: '0.25rem', cursor: 'pointer', color: 'white', fontSize: '0.7rem' }}>Clear</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}><p>Calculate survival days first</p></div>
            )}
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div style={{ background: darkMode ? '#1e1e2e' : 'white', borderRadius: '1rem', padding: 'clamp(0.75rem, 4vw, 1.5rem)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: darkMode ? '1px solid #2d2d3d' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div><h3 style={{ fontSize: 'clamp(1rem, 4vw, 1.3rem)', fontWeight: 'bold', color: darkMode ? '#e0e0e0' : '#333', margin: 0 }}>📜 Prediction History</h3><p style={{ fontSize: 'clamp(0.6rem, 2.5vw, 0.85rem)', color: darkMode ? '#a0a0a0' : '#666' }}>Track your financial journey</p></div>
              <button onClick={clearHistory} disabled={saving} style={{ padding: 'clamp(0.3rem, 2vw, 0.5rem) clamp(0.75rem, 3vw, 1rem)', background: darkMode ? '#2d2d3d' : '#f3f4f6', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: 'clamp(0.7rem, 3vw, 0.85rem)', color: '#ef4444' }}>Clear All</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
              {history.slice(0, 10).map((entry) => {
                const entryStatus = getStatus(entry.days);
                return (
                  <div key={entry.id} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: entryStatus.alertLevel === 'critical' ? (darkMode ? '#7f1d1d' : '#fee2e2') : (darkMode ? '#2d2d3d' : '#f9fafb'), borderLeft: `4px solid ${entryStatus.color}` }}>
                    <div style={{ fontSize: 'clamp(0.55rem, 2.5vw, 0.7rem)', color: darkMode ? '#a0a0a0' : '#999', marginBottom: '0.4rem' }}>📅 {entry.date} at {entry.time}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div><span style={{ fontSize: '0.6rem', display: 'block', color: darkMode ? '#a0a0a0' : '#999' }}>Balance</span><span style={{ fontSize: '0.8rem', fontWeight: '500' }}>₦{entry.balance.toLocaleString()}</span></div>
                        <div><span style={{ fontSize: '0.6rem', display: 'block', color: darkMode ? '#a0a0a0' : '#999' }}>Daily</span><span style={{ fontSize: '0.8rem', fontWeight: '500' }}>₦{entry.spending.toLocaleString()}</span></div>
                        <div><span style={{ fontSize: '0.6rem', display: 'block', color: darkMode ? '#a0a0a0' : '#999' }}>Days</span><span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#4f46e5' }}>{entry.days}</span></div>
                      </div>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: '2rem', background: entryStatus.bg, color: entryStatus.color, fontSize: '0.65rem', fontWeight: 'bold' }}>{entryStatus.icon} {entryStatus.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.8; }
        }
        input:focus { border-color: #667eea !important; box-shadow: 0 0 0 3px rgba(102,126,234,0.1) !important; }
        button:hover { opacity: 0.9; transform: translateY(-1px); transition: all 0.2s ease; }
        @media (max-width: 768px) { button, input { min-height: 44px; } }
      `}</style>
    </div>
  );
}