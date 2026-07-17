"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// --- TYPES ---
interface ClientSnippet {
  id: number | string; 
  name: string;
}

interface BodyMetric {
  id?: string; 
  client_id: number | string; 
  date: string;
  body_weight: number;
  muscle_mass: number;
  fat_mass: number;
  height: number; 
  notes: string;
}

export default function BodyMetrics({ globalClientId }: { globalClientId?: number | string | null }) {
  // --- STATE ---
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [clientsList, setClientsList] = useState<ClientSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [formData, setFormData] = useState<Partial<BodyMetric>>({ date: new Date().toISOString().split('T')[0] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- FETCH DATA ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [clientsResponse, metricsResponse] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('body_metrics').select('*').order('date', { ascending: false })
      ]);

      if (clientsResponse.data) setClientsList(clientsResponse.data);
      if (metricsResponse.data) setMetrics(metricsResponse.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- AUTO-SELECT CLIENT & AUTO-FILL HEIGHT ---
  useEffect(() => {
    if (globalClientId && clientsList.length > 0) {
      const selectedClient = clientsList.find(c => c.id == globalClientId);
      if (selectedClient) {
        const clientLogs = metrics.filter(m => m.client_id == globalClientId);
        const latestHeight = clientLogs.length > 0 ? clientLogs[0].height : undefined;

        setFormData(prev => ({ 
          ...prev, 
          client_id: selectedClient.id,
          height: prev.height || latestHeight 
        }));
        setClientSearch(selectedClient.name);
      }
    } else if (!globalClientId) {
      setFormData(prev => ({ ...prev, client_id: undefined, height: undefined }));
      setClientSearch('');
    }
  }, [globalClientId, clientsList, metrics]);

  // --- DERIVED DATA & CALCULATIONS ---
  const filteredClients = useMemo(() => {
    return clientsList.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientsList]);

  const filteredMetrics = useMemo(() => {
    if (globalClientId) return metrics.filter(m => m.client_id == globalClientId);
    return metrics;
  }, [metrics, globalClientId]);

  // 1. LEADERBOARD LOGIC (When No Client Selected)
  const appWideStats = useMemo(() => {
    if (metrics.length === 0) return null;

    const latestLogsMap = new Map();
    metrics.forEach(m => {
      if (!latestLogsMap.has(m.client_id)) latestLogsMap.set(m.client_id, m);
    });
    const latestLogs = Array.from(latestLogsMap.values());

    if (latestLogs.length === 0) return null;

    const highestWeight = latestLogs.reduce((prev, current) => (prev.body_weight > current.body_weight) ? prev : current);
    const lowestWeight = latestLogs.reduce((prev, current) => (prev.body_weight < current.body_weight) ? prev : current);
    const mostMuscle = latestLogs.reduce((prev, current) => (prev.muscle_mass > current.muscle_mass) ? prev : current);
    const leastFat = latestLogs.reduce((prev, current) => (prev.fat_mass < current.fat_mass) ? prev : current);

    const getClientName = (id: string | number) => clientsList.find(c => c.id == id)?.name || 'Unknown';

    return {
      highestWeight: { name: getClientName(highestWeight.client_id), val: highestWeight.body_weight },
      lowestWeight: { name: getClientName(lowestWeight.client_id), val: lowestWeight.body_weight },
      mostMuscle: { name: getClientName(mostMuscle.client_id), val: mostMuscle.muscle_mass },
      leastFat: { name: getClientName(leastFat.client_id), val: leastFat.fat_mass },
    };
  }, [metrics, clientsList]);

  // 2. CLIENT PROGRESS LOGIC (When Client Selected)
  const clientProgress = useMemo(() => {
    if (!globalClientId || filteredMetrics.length === 0) return null;

    const chronoLogs = [...filteredMetrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const start = chronoLogs[0];
    const current = chronoLogs[chronoLogs.length - 1];

    return {
      start,
      current,
      logs: chronoLogs,
      diffs: {
        height: (current.height - start.height).toFixed(1),
        weight: (current.body_weight - start.body_weight).toFixed(1),
        muscle: (current.muscle_mass - start.muscle_mass).toFixed(1),
        fat: (current.fat_mass - start.fat_mass).toFixed(1)
      }
    };
  }, [filteredMetrics, globalClientId]);

  // 3. DYNAMIC GRAPH CALCULATION
  const renderGraphPoints = () => {
    if (!clientProgress || clientProgress.logs.length < 2) return null;
    
    const logs = clientProgress.logs;
    const width = 400;
    const height = 180;
    
    const maxW = Math.max(...logs.map(l => l.body_weight)) + 2;
    const minW = Math.min(...logs.map(l => l.body_weight)) - 2;
    const range = maxW - minW || 1; 

    const points = logs.map((log, index) => {
      const x = (index / (logs.length - 1)) * width;
      const y = height - ((log.body_weight - minW) / range) * height;
      return { x, y, val: log.body_weight };
    });

    const pathString = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <path d={`${pathString} L${width},${height} L0,${height} Z`} fill="rgba(37,99,235,0.1)" />
        <path d={pathString} fill="none" stroke="#2563eb" strokeWidth="4" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5" fill="#2563eb" />
            <text x={p.x} y={p.y - 12} fontSize="12" fill="#4b5563" textAnchor="middle" fontWeight="bold">{p.val}kg</text>
          </g>
        ))}
      </svg>
    );
  };

  // --- HANDLERS ---
  const handleClientSelect = (clientId: number | string, clientName: string) => {
    const clientLogs = metrics.filter(m => m.client_id == clientId);
    const latestHeight = clientLogs.length > 0 ? clientLogs[0].height : undefined;

    setFormData({ ...formData, client_id: clientId, height: latestHeight });
    setClientSearch(clientName);
    setIsDropdownOpen(false);
  };

  const handleEdit = (metric: BodyMetric) => {
    setEditingId(metric.id!);
    setFormData(metric);
    const client = clientsList.find(c => c.id == metric.client_id);
    setClientSearch(client ? client.name : '');
    setIsConfirmingDelete(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ date: new Date().toISOString().split('T')[0] });
    setClientSearch('');
    setIsConfirmingDelete(false);
  };

  const handleDelete = async () => {
    if (!editingId) return;
    try {
      const { error } = await supabase.from('body_metrics').delete().eq('id', editingId);
      if (error) throw error;
      setMetrics(metrics.filter(m => m.id !== editingId));
      handleCancelEdit();
    } catch (error) {
      console.error("Error deleting metric:", error);
      alert("Failed to delete log.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id) {
      alert("Please select a valid client from the dropdown.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        client_id: formData.client_id,
        date: formData.date,
        body_weight: parseFloat(formData.body_weight?.toString() || '0'),
        muscle_mass: parseFloat(formData.muscle_mass?.toString() || '0'),
        fat_mass: parseFloat(formData.fat_mass?.toString() || '0'),
        height: parseFloat(formData.height?.toString() || '0'),
        notes: formData.notes || ''
      };

      if (editingId) {
        const { error } = await supabase.from('body_metrics').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('body_metrics').insert([payload]);
        if (error) throw error;
      }
      
      await fetchData();
      if (!globalClientId) handleCancelEdit();
      else setFormData({ ...formData, body_weight: 0, muscle_mass: 0, fat_mass: 0, notes: '' }); 
      
    } catch (error) {
      console.error("Error saving metric:", error);
      alert("Failed to save metric to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      
      {/* --- 1. TOP VISUALIZATIONS (DYNAMIC GRID) --- */}
      <div style={{ display: 'grid', gridTemplateColumns: globalClientId ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        
        {/* KPI / JOURNEY SECTION */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: globalClientId ? '4px solid #10b981' : '4px solid #8b5cf6' }}>
          
          {globalClientId && clientProgress ? (
            // Individual Client Progress View
            <div>
              <h4 style={{ margin: '0 0 16px 0', color: '#374151', textTransform: 'uppercase', fontSize: '1rem', letterSpacing: '1px', fontWeight: '900' }}>
                JOURNEY: {clientProgress.start.date} TO {clientProgress.current.date}
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                
                {/* STARTING METRICS */}
                <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h5 style={{ margin: '0 0 12px 0', color: '#6b7280', fontSize: '0.85rem' }}>STARTING ({clientProgress.start.date})</h5>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ color: '#4b5563' }}>Height:</span> <strong>{clientProgress.start.height} cm</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ color: '#4b5563' }}>Weight:</span> <strong>{clientProgress.start.body_weight} kg</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ color: '#4b5563' }}>Muscle:</span> <strong>{clientProgress.start.muscle_mass} kg</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#4b5563' }}>Fat:</span> <strong>{clientProgress.start.fat_mass} %</strong></div>
                </div>

                {/* CURRENT METRICS */}
                <div style={{ padding: '20px', background: '#eff6ff', borderRadius: '12px', border: '2px solid #3b82f6', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h5 style={{ margin: '0 0 16px 0', color: '#1d4ed8', fontSize: '1rem', fontWeight: '900' }}>CURRENT ({clientProgress.current.date})</h5>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '1rem' }}><span style={{ color: '#1e3a8a' }}>Height:</span> <strong style={{ color: '#111827' }}>{clientProgress.current.height} cm</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '1.1rem' }}><span style={{ color: '#1e3a8a' }}>Weight:</span> <strong style={{ color: '#111827', fontSize: '1.2rem' }}>{clientProgress.current.body_weight} kg</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '1.1rem' }}><span style={{ color: '#1e3a8a' }}>Muscle:</span> <strong style={{ color: '#111827', fontSize: '1.2rem' }}>{clientProgress.current.muscle_mass} kg</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}><span style={{ color: '#1e3a8a' }}>Fat:</span> <strong style={{ color: '#111827', fontSize: '1.2rem' }}>{clientProgress.current.fat_mass} %</strong></div>
                </div>

                {/* NET CHANGE METRICS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                  <h5 style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '0.85rem' }}>NET CHANGE</h5>
                  <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 'bold' }}>Weight</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: parseFloat(clientProgress.diffs.weight) <= 0 ? '#10b981' : '#ef4444' }}>
                      {parseFloat(clientProgress.diffs.weight) > 0 ? '+' : ''}{clientProgress.diffs.weight} kg
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 'bold' }}>Muscle</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: parseFloat(clientProgress.diffs.muscle) >= 0 ? '#10b981' : '#ef4444' }}>
                      {parseFloat(clientProgress.diffs.muscle) > 0 ? '+' : ''}{clientProgress.diffs.muscle} kg
                    </div>
                  </div>
                  <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 'bold' }}>Fat %</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: parseFloat(clientProgress.diffs.fat) <= 0 ? '#10b981' : '#ef4444' }}>
                      {parseFloat(clientProgress.diffs.fat) > 0 ? '+' : ''}{clientProgress.diffs.fat} %
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            // App-Wide Leaderboard View 
            <div>
              <h4 style={{ margin: '0 0 16px 0', color: '#6b7280', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>
                Gym Member Highlights
              </h4>
              {appWideStats ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                  <div><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Highest Weight:</span><br/><strong style={{ color: '#111827' }}>{appWideStats.highestWeight.name} ({appWideStats.highestWeight.val}kg)</strong></div>
                  <div><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Lowest Weight:</span><br/><strong style={{ color: '#111827' }}>{appWideStats.lowestWeight.name} ({appWideStats.lowestWeight.val}kg)</strong></div>
                  <div><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Most Muscle Mass:</span><br/><strong style={{ color: '#10b981' }}>{appWideStats.mostMuscle.name} ({appWideStats.mostMuscle.val}kg)</strong></div>
                  <div><span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Lowest Fat %:</span><br/><strong style={{ color: '#3b82f6' }}>{appWideStats.leastFat.name} ({appWideStats.leastFat.val}%)</strong></div>
                </div>
              ) : (
                <span style={{ color: '#9ca3af' }}>Not enough data to generate highlights.</span>
              )}
            </div>
          )}
        </div>

        {/* DYNAMIC CHART */}
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>
            {globalClientId ? 'Client Weight Journey' : 'Weight Trend'}
          </h4>
          <div style={{ position: 'relative', height: '180px', width: '100%', marginTop: '10px' }}>
            {globalClientId && clientProgress && clientProgress.logs.length >= 2 ? (
              renderGraphPoints()
            ) : (
               <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: '8px', textAlign: 'center', padding: '10px' }}>
                 {globalClientId ? 'Need at least 2 logs to show graph.' : 'Select a client to view their weight journey.'}
               </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 2. LOG ENTRY FORM --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '24px', borderTop: editingId ? '4px solid #f59e0b' : '4px solid #10b981' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>
          {editingId ? '✏️ Edit Metric Log' : '➕ Log New Metrics'}
        </h3>
        
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
          
          <div style={{ position: 'relative', gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Client Name</label>
            <input 
              type="text" 
              placeholder="Search client..." 
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setFormData({ ...formData, client_id: undefined }); 
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)} 
              style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', backgroundColor: globalClientId ? '#eff6ff' : '#fff' }} 
              required 
            />
            {isDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                {filteredClients.length > 0 ? (
                  filteredClients.map(client => (
                    <div 
                      key={client.id} 
                      onClick={() => handleClientSelect(client.id, client.name)}
                      style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                    >
                      {client.name}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '12px', color: '#6b7280', fontSize: '0.85rem' }}>No clients found.</div>
                )}
              </div>
            )}
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Date</label>
            <input required type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Height (cm)</label>
            <input required type="number" step="0.1" placeholder="170" value={formData.height || ''} onChange={e => setFormData({...formData, height: parseFloat(e.target.value)})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Weight (kg)</label>
            <input required type="number" step="0.1" placeholder="0.0" value={formData.body_weight || ''} onChange={e => setFormData({...formData, body_weight: parseFloat(e.target.value)})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Muscle (kg)</label>
            <input required type="number" step="0.1" placeholder="0.0" value={formData.muscle_mass || ''} onChange={e => setFormData({...formData, muscle_mass: parseFloat(e.target.value)})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Fat Mass (%)</label>
            <input required type="number" step="0.1" placeholder="0.0" value={formData.fat_mass || ''} onChange={e => setFormData({...formData, fat_mass: parseFloat(e.target.value)})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Notes (Optional)</label>
            <input type="text" placeholder='e.g., "Taken before breakfast", "Felt bloated"' value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', marginTop: '8px' }}>
            <div>
              {editingId && (
                isConfirmingDelete ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>Delete log?</span>
                    <button type="button" onClick={handleDelete} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Yes</button>
                    <button type="button" onClick={() => setIsConfirmingDelete(false)} style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setIsConfirmingDelete(true)} style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                    Delete Log
                  </button>
                )
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>
              {editingId && (
                <button type="button" onClick={handleCancelEdit} style={{ padding: '12px 24px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flexGrow: 1 }}>Cancel Edit</button>
              )}
              <button type="submit" disabled={isSubmitting} style={{ padding: '12px 24px', background: editingId ? '#f59e0b' : '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1, flexGrow: 1 }}>
                {isSubmitting ? 'Saving...' : (editingId ? 'Update Log' : 'Save Metric Log')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* --- 3. RECENT LOGS TABLE (Responsive Scroll Wrapper) --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden', width: '100%' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, color: '#111827' }}>{globalClientId ? "Client's Metric Logs" : "Recent Metric Logs"}</h3>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Date</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Client</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Height (cm)</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Weight (kg)</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Muscle (kg)</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Fat (%)</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Notes</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading logs...</td></tr>
              ) : filteredMetrics.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No body metrics logged yet.</td></tr>
              ) : (
                filteredMetrics.map(metric => {
                  const clientName = clientsList.find(c => c.id == metric.client_id)?.name || 'Unknown Client';
                  return (
                    <tr key={metric.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: editingId === metric.id ? '#fef3c7' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#374151' }}>{metric.date}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#2563eb' }}>{clientName}</td>
                      <td style={{ padding: '16px 20px', color: '#111827' }}>{metric.height}</td>
                      <td style={{ padding: '16px 20px', color: '#111827' }}>{metric.body_weight}</td>
                      <td style={{ padding: '16px 20px', color: '#111827' }}>{metric.muscle_mass}</td>
                      <td style={{ padding: '16px 20px', color: '#111827' }}>{metric.fat_mass}%</td>
                      <td style={{ padding: '16px 20px', color: '#6b7280', fontSize: '0.85rem', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {metric.notes || '-'}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button onClick={() => handleEdit(metric)} style={{ padding: '8px 16px', background: '#fef3c7', color: '#d97706', border: '1px solid #fcd34d', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}