"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient'; 

import Clients from './Clients';
import Payments from './Payments';
import BodyMetrics from './BodyMetrics';
import ExerciseLibrary from './ExerciseLibrary';
import WorkoutLogs from './WorkoutLogs';

const NAV_ITEMS = [
  { key: 'dashboard', title: 'Dashboard (Overview)' },
  { key: 'clients', title: 'Clients' },
  { key: 'body-metrics', title: 'Body Metrics' },
  { key: 'payments', title: 'Payments' },
  { key: 'exercise-library', title: 'Exercise Library' },
  { key: 'workout-logs', title: 'Workout Logs' },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Command Center',
  clients: 'Clients',
  'body-metrics': 'Body Metrics',
  payments: 'Payments',
  'exercise-library': 'Exercise Library',
  'workout-logs': 'Workout Logs',
};

// --- TYPES ---
interface Client { id: number; name: string; renewal_status: string; }
interface BodyMetric { id: string; client_id: number; date: string; height: number; body_weight: number; muscle_mass: number; fat_mass: number; }
interface WorkoutLog { id: string; client_id: number; exercise_id: number; date: string; weight: number; reps: number; }

export default function Dashboard() {
  // ================= LAYOUT & GLOBAL STATE =================
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  const [globalClientId, setGlobalClientId] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // ================= OPTIMIZED DATA STATE =================
  const [clients, setClients] = useState<Client[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1. FETCH ONLY CLIENT NAMES FOR DROPDOWN (Runs ONCE)
  useEffect(() => {
    supabase.from('clients').select('id, name, renewal_status').order('name').then(res => {
      if (res.data) setClients(res.data);
    });
  }, []);

  const filteredClients = useMemo(() => {
    return clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clients]);

  // 2. FETCH HEAVY ANALYTICS ONLY WHEN NEEDED
  useEffect(() => {
    async function fetchDashboardStats() {
      // STOP THE LAG: Do not fetch dashboard analytics if we are on a different page!
      if (currentPage !== 'dashboard') return;

      setIsLoading(true);
      try {
        if (!globalClientId) {
          // --- GYM OVERVIEW (LIGHTWEIGHT COUNTS ONLY) ---
          const [clientCountRes, workoutCountRes, paymentsRes] = await Promise.all([
            supabase.from('clients').select('*', { count: 'exact', head: true }),
            supabase.from('workout_logs').select('*', { count: 'exact', head: true }),
            supabase.from('payments').select('client_id, amount, status, date') // Lightweight fetch
          ]);

          const allPayments = paymentsRes.data || [];
          const pendingPayments = allPayments.filter(p => p.status === 'Pending' || p.status === 'Due');
          const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
          const totalRevenue = allPayments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + p.amount, 0);
          
          const overdueClientsList = pendingPayments.map(p => {
            const c = clients.find(cl => cl.id == p.client_id);
            return { id: p.client_id, name: c?.name || 'Unknown', date: p.date, amount: p.amount, status: p.status };
          });
          
          setDashboardData({ 
            view: 'overview', 
            totalClients: clientCountRes.count || 0,
            totalWorkouts: workoutCountRes.count || 0,
            pendingTotal, 
            totalRevenue, 
            overdueClientsList 
          });

        } else {
          // --- SINGLE CLIENT (TARGETED FETCH) ---
          const selectedClient = clients.find(c => c.id == globalClientId);
          
          // Using .eq('client_id') prevents downloading the rest of the gym's data
          const [metricsRes, paymentsRes, logsRes, exercisesRes] = await Promise.all([
            supabase.from('body_metrics').select('*').eq('client_id', globalClientId).order('date', { ascending: true }),
            supabase.from('payments').select('*').eq('client_id', globalClientId).order('date', { ascending: true }),
            supabase.from('workout_logs').select('*').eq('client_id', globalClientId).order('date', { ascending: true }),
            supabase.from('exercise_library').select('id, name')
          ]);

          const cMetrics = metricsRes.data || [];
          const cPayments = paymentsRes.data || [];
          const cLogs = logsRes.data || [];
          const exercisesList = exercisesRes.data || [];

          // Gym Age Calculation
          let gymAgeText = "New Member";
          const allDates = [...cMetrics.map(m=>m.date), ...cPayments.map(p=>p.date), ...cLogs.map(l=>l.date)].sort();
          if (allDates.length > 0) {
            const joinDate = new Date(allDates[0]);
            const diffDays = Math.ceil(Math.abs(new Date().getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 30) gymAgeText = `${diffDays} Days`;
            else if (diffDays < 365) gymAgeText = `${Math.floor(diffDays/30)} Months`;
            else gymAgeText = `${(diffDays/365).toFixed(1)} Years`;
          }

          const currentMetrics = cMetrics.length > 0 ? cMetrics[cMetrics.length - 1] : null;
          const paymentStatus = selectedClient?.renewal_status || 'Unknown';
          const totalDue = cPayments.filter(p => p.status === 'Pending' || p.status === 'Due').reduce((sum, p) => sum + p.amount, 0);

          // PR Calculation Map
          const prMap = new Map();
          cLogs.forEach(log => {
            const currentMax = prMap.get(log.exercise_id)?.weight || 0;
            if (log.weight > currentMax) {
              prMap.set(log.exercise_id, { weight: log.weight, date: log.date });
            }
          });
          const personalRecords = Array.from(prMap.entries()).map(([exId, data]) => ({
            name: exercisesList.find(e => e.id == exId)?.name || 'Unknown Lift',
            weight: data.weight,
            date: data.date
          })).sort((a, b) => b.weight - a.weight);

          setDashboardData({
            view: 'client',
            clientName: selectedClient?.name,
            gymAgeText,
            currentMetrics,
            cMetrics, 
            cLogs,    
            paymentStatus,
            totalDue,
            personalRecords
          });
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Only run the heavy fetch if the basic clients array is ready
    if (clients.length > 0) {
      fetchDashboardStats();
    }
  }, [currentPage, globalClientId, clients]);


  // ================= REAL SVG CHARTS =================
  const renderBodyCompChart = (clientMetrics: BodyMetric[]) => {
    if (clientMetrics.length < 2) return <div style={{ padding: '20px', color: '#9ca3af', textAlign: 'center', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>Need at least 2 metric logs to generate chart.</div>;
    
    const width = 500; const height = 200;
    const scaleY = (val: number) => height - ((val / 200) * height);
    
    const getPoints = (key: keyof BodyMetric) => {
      return clientMetrics.map((m, i) => {
        const x = (i / (clientMetrics.length - 1)) * width;
        const y = scaleY(Number(m[key]) || 0);
        return `${x},${y}`;
      }).join(' L ');
    };

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', minHeight: '200px', overflow: 'visible' }}>
        <path d={`M0,${height/2} L${width},${height/2}`} stroke="#f3f4f6" strokeWidth="1" />
        <path d={`M ${getPoints('height')}`} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="4 4" /> 
        <path d={`M ${getPoints('body_weight')}`} fill="none" stroke="#2563eb" strokeWidth="4" /> 
        <path d={`M ${getPoints('muscle_mass')}`} fill="none" stroke="#10b981" strokeWidth="4" /> 
        <path d={`M ${getPoints('fat_mass')}`} fill="none" stroke="#ef4444" strokeWidth="4" /> 
      </svg>
    );
  };

  const renderLiftProgressChart = (logs: WorkoutLog[]) => {
    if (logs.length === 0) return <div style={{ padding: '20px', color: '#9ca3af', textAlign: 'center', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>No workout data available yet.</div>;
    
    const sessionMap = new Map();
    logs.forEach(log => {
      if (!sessionMap.has(log.date)) sessionMap.set(log.date, []);
      sessionMap.get(log.date).push(log.weight);
    });
    
    const sessions = Array.from(sessionMap.entries())
      .map(([date, weights]) => ({ date, avgWeight: weights.reduce((a:number,b:number)=>a+b,0)/weights.length }))
      .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sessions.length < 2) return <div style={{ padding: '20px', color: '#9ca3af', textAlign: 'center', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }}>Need at least 2 sessions to show strength trend.</div>;

    const width = 500; const height = 150;
    const maxW = Math.max(...sessions.map(s => s.avgWeight)) + 10;
    const minW = Math.max(0, Math.min(...sessions.map(s => s.avgWeight)) - 10);
    const range = maxW - minW || 1;

    const pathString = sessions.map((s, i) => {
      const x = (i / (sessions.length - 1)) * width;
      const y = height - ((s.avgWeight - minW) / range) * height;
      return `${i===0?'M':'L'}${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', minHeight: '150px', overflow: 'visible' }}>
        <path d={`${pathString} L${width},${height} L0,${height} Z`} fill="rgba(139, 92, 246, 0.1)" />
        <path d={pathString} fill="none" stroke="#8b5cf6" strokeWidth="4" />
      </svg>
    );
  };

  // ================= HANDLERS =================
  const handleNavClick = (key: string) => {
    setCurrentPage(key);
    setIsSidebarOpen(false);
  };

  const isSingleClient = globalClientId !== null;

  return (
    <>
      <style>{`
        .sidebar {
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          width: 260px;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          z-index: 1000;
        }
        
        .sidebar.open {
          transform: translateX(0);
        }
        
        .mobile-overlay {
          z-index: 999;
        }

        header {
          z-index: 100;
        }
        
        @media (min-width: 768px) {
          .sidebar {
            position: sticky;
            transform: none !important;
            height: 100vh;
          }
          .hamburger {
            display: none !important; 
          }
          .mobile-overlay {
            display: none !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'sans-serif', color: '#111827', position: 'relative' }}>
        
        {isSidebarOpen && (
          <div 
            className="mobile-overlay"
            onClick={() => setIsSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
          />
        )}

        <aside 
          className={`sidebar ${isSidebarOpen ? "open" : ""}`}
          style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: '24px 20px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
            <h2 style={{ margin: '0 0 0 10px', color: '#2563eb', fontWeight: '900', fontSize: '1.8rem', letterSpacing: '-1px' }}>
              HEVY <span style={{ color: '#111827' }}>Coach</span>
            </h2>
            <button type="button" className="hamburger" onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '8px' }}>✕</button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            {NAV_ITEMS.map((item) => (
              <SidebarItem key={item.key} title={item.title} active={currentPage === item.key} onClick={() => handleNavClick(item.key)} />
            ))}
          </nav>
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'hidden' }}>
          
          <header style={{ 
            backgroundColor: '#ffffff', padding: '16px 5%', borderBottom: '1px solid #e5e7eb',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
            position: 'sticky', top: 0, zIndex: 100
          }}>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 9999, pointerEvents: 'auto' }}>
              <div 
                className="hamburger"
                onClick={() => setIsSidebarOpen(prev => !prev)}
                style={{ fontSize: '1.8rem', cursor: 'pointer', padding: '5px 10px', userSelect: 'none', color: '#111827' }}
              >☰</div>

              <span style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 'bold' }}>FILTER:</span>
              
              <div style={{ position: 'relative', minWidth: '220px', flexGrow: 1 }}>
                <input
                  type="text"
                  placeholder="Search & select client..."
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                  style={{ 
                    padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none', 
                    width: '100%', boxSizing: 'border-box', fontSize: '0.9rem', backgroundColor: isSingleClient ? '#eff6ff' : '#ffffff'
                  }}
                />
                
                {isDropdownOpen && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #d1d5db', 
                    borderRadius: '8px', marginTop: '4px', maxHeight: '250px', overflowY: 'auto', zIndex: 10000,
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}>
                    <div
                      onClick={() => { setGlobalClientId(null); setClientSearch(''); setIsDropdownOpen(false); }}
                      style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', color: '#2563eb', backgroundColor: '#f9fafb' }}
                    >
                      Total (All Clients)
                    </div>
                    {filteredClients.length > 0 ? (
                      filteredClients.map(client => (
                        <div
                          key={client.id}
                          onClick={() => { setGlobalClientId(client.id); setClientSearch(client.name); setIsDropdownOpen(false); }}
                          style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.9rem' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {client.name}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: '0.9rem' }}>No clients found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ textAlign: 'right' }}><p style={{ margin: '0', fontWeight: 'bold', fontSize: '0.95rem' }}>Robin J.</p></div>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>RJ</div>
            </div>
          </header>

          <div style={{ padding: '24px 5%', maxWidth: '1600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            
            <h1 style={{ margin: '0 0 24px 0', fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>
              {isSingleClient ? `${clientSearch}'s ${PAGE_TITLES[currentPage]}` : PAGE_TITLES[currentPage]}
            </h1>

            {currentPage === 'dashboard' ? (
              <>
                {isLoading || !dashboardData ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontWeight: 'bold' }}>Loading highly optimized data...</div>
                ) : (
                  <>
                    {dashboardData.view === 'overview' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                          <KPICard title="Total Active Clients" value={dashboardData.totalClients.toString()} trend="Live from DB" color="#2563eb" />
                          <KPICard title="Total Workouts Logged" value={dashboardData.totalWorkouts.toString()} trend="Live from DB" color="#8b5cf6" />
                          <KPICard title="Total Revenue" value={`₹${dashboardData.totalRevenue}`} trend="Paid In Full" color="#10b981" />
                          <KPICard title="Pending Dues" value={`₹${dashboardData.pendingTotal}`} trend={dashboardData.pendingTotal === 0 ? "All caught up" : "Action Required"} color="#ef4444" isAlert={dashboardData.pendingTotal > 0} />
                        </div>
                        
                        <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                          <h3 style={{ margin: '0 0 16px 0', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            ⚠️ Action Needed: Overdue Payments
                          </h3>
                          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontSize: '0.9rem' }}>
                                  <th style={{ padding: '12px 8px' }}>Client ID</th>
                                  <th style={{ padding: '12px 8px' }}>Client Name</th>
                                  <th style={{ padding: '12px 8px' }}>Due Date</th>
                                  <th style={{ padding: '12px 8px' }}>Amount</th>
                                  <th style={{ padding: '12px 8px' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dashboardData.overdueClientsList.length > 0 ? (
                                  dashboardData.overdueClientsList.map((client: any) => (
                                    <TableRow 
                                      key={client.id + client.date}
                                      id={`CL-${client.id}`} 
                                      name={client.name} 
                                      date={client.date} 
                                      amount={`₹${client.amount}`} 
                                      status={client.status}
                                    />
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>
                                      🎉 All clear! No overdue payments found in the database.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
                          <div style={{ background: '#eff6ff', padding: '24px', borderRadius: '12px', border: '2px solid #bfdbfe', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <h4 style={{ margin: '0 0 8px 0', color: '#1e3a8a', fontSize: '0.9rem', textTransform: 'uppercase', fontWeight: '900' }}>Active Profile</h4>
                            <span style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', marginBottom: '8px', lineHeight: '1.2' }}>{dashboardData.clientName}</span>
                            <div style={{ fontSize: '1rem', color: '#2563eb', fontWeight: 'bold' }}>Gym Age: {dashboardData.gymAgeText}</div>
                          </div>

                          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderTop: '4px solid #10b981' }}>
                            <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '0.9rem', textTransform: 'uppercase' }}>Current Body Metrics</h4>
                            {dashboardData.currentMetrics ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '1.1rem' }}>
                                <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Weight</span><br/><strong style={{ color: '#111827' }}>{dashboardData.currentMetrics.body_weight} kg</strong></div>
                                <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Fat %</span><br/><strong style={{ color: '#111827' }}>{dashboardData.currentMetrics.fat_mass} %</strong></div>
                                <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Muscle</span><br/><strong style={{ color: '#111827' }}>{dashboardData.currentMetrics.muscle_mass} kg</strong></div>
                                <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Height</span><br/><strong style={{ color: '#111827' }}>{dashboardData.currentMetrics.height} cm</strong></div>
                              </div>
                            ) : (
                              <span style={{ color: '#9ca3af' }}>No metrics recorded yet.</span>
                            )}
                          </div>

                          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderTop: dashboardData.totalDue > 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                            <h4 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: '0.9rem', textTransform: 'uppercase' }}>Account Status</h4>
                            <div style={{ marginBottom: '12px' }}>
                              <span style={{ background: dashboardData.totalDue > 0 ? '#fee2e2' : '#dcfce7', color: dashboardData.totalDue > 0 ? '#991b1b' : '#166534', padding: '6px 12px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                {dashboardData.paymentStatus}
                              </span>
                            </div>
                            {dashboardData.totalDue > 0 && (
                              <div style={{ fontSize: '1.2rem', color: '#ef4444', fontWeight: '900' }}>Due: ₹{dashboardData.totalDue}</div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '24px' }}>
                          <ChartCard title="Body Composition Trends (4-Line)">
                            <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '16px', flexWrap: 'wrap' }}>
                              <span style={{ color: '#2563eb' }}>— Weight</span>
                              <span style={{ color: '#10b981' }}>— Muscle</span>
                              <span style={{ color: '#ef4444' }}>— Fat</span>
                              <span style={{ color: '#94a3b8' }}>- - Height</span>
                            </div>
                            <div style={{ width: '100%', height: '200px' }}>
                              {renderBodyCompChart(dashboardData.cMetrics)}
                            </div>
                          </ChartCard>

                          <ChartCard title="Strength Progression (Avg Wgt/Session)">
                            <div style={{ width: '100%', height: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                              {renderLiftProgressChart(dashboardData.cLogs)}
                            </div>
                          </ChartCard>
                        </div>

                        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                           <h4 style={{ margin: '0 0 16px 0', color: '#111827' }}>Personal Records (Max Lifts)</h4>
                           {dashboardData.personalRecords.length > 0 ? (
                             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                               {dashboardData.personalRecords.map((pr: any, idx: number) => (
                                 <div key={idx} style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                   <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold', marginBottom: '4px' }}>{pr.name}</div>
                                   <div style={{ fontSize: '1.4rem', color: '#111827', fontWeight: '900' }}>{pr.weight} kg</div>
                                   <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>Achieved: {pr.date}</div>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <div style={{ color: '#9ca3af', padding: '10px 0' }}>No exercises logged yet to calculate PRs.</div>
                           )}
                        </div>

                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              (() => {
                switch (currentPage) {
                  case 'clients': return <Clients globalClientId={globalClientId} />;
                  case 'body-metrics': return <BodyMetrics globalClientId={globalClientId} />;
                  case 'payments': return <Payments globalClientId={globalClientId} />;
                  case 'exercise-library': return <ExerciseLibrary globalClientId={globalClientId} />;
                  case 'workout-logs': return <WorkoutLogs globalClientId={globalClientId} />;
                  default: 
                    return (
                      <div style={{ background: '#fff', padding: '40px 24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>Page Not Found</h3>
                      </div>
                    );
                }
              })()
            )}
          </div>
        </main>
      </div>
    </>
  );
}

// ================= UI REUSABLE COMPONENTS =================
function SidebarItem({ title, active = false, onClick }: { title: string; active?: boolean; onClick?: () => void; }) {
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      style={{ 
        padding: '12px 16px', borderRadius: '8px', cursor: 'pointer',
        backgroundColor: active ? '#eff6ff' : 'transparent',
        color: active ? '#2563eb' : '#4b5563', fontWeight: active ? 'bold' : '600',
        transition: 'all 0.2s', pointerEvents: 'auto', position: 'relative', zIndex: 10001
      }}
    >
      {title}
    </div>
  );
}

function KPICard({ title, value, trend, color, isAlert = false }: { title: string; value: string; trend: string; color: string; isAlert?: boolean; }) {
  return (
    <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', borderLeft: `5px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '0.9rem' }}>{title}</h4>
      <div style={{ fontSize: '2rem', fontWeight: '900', color: '#111827' }}>{value}</div>
      <div style={{ marginTop: '8px', fontSize: '0.85rem', color: isAlert ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{trend}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode; }) {
  return (
    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '1.05rem', fontWeight: '800' }}>{title}</h3>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

function TableRow({ id, name, date, amount, status }: { id: string; name: string; date: string; amount: string; status: string; }) {
  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '16px 8px', color: '#6b7280', fontWeight: 'bold', fontSize: '0.9rem' }}>{id}</td>
      <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>{name}</td>
      <td style={{ padding: '16px 8px', color: '#ef4444', fontWeight: 'bold' }}>{date}</td>
      <td style={{ padding: '16px 8px', fontWeight: '900', fontSize: '1.1rem' }}>{amount}</td>
      <td style={{ padding: '16px 8px' }}>
        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          {status}
        </span>
      </td>
    </tr>
  );
}