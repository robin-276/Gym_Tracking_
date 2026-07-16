"use client";
import React, { useState, useMemo, useEffect } from 'react';

// Database bridge imported here!
import { supabase } from '@/lib/supabaseClient';

// --- TYPES (Supabase Ready) ---
interface ClientSnippet {
  id: number;
  name: string;
}

interface ExerciseSnippet {
  id: number;
  name: string;
  muscle_group: string;
}

interface WorkoutSet {
  weight: number | '';
  reps: number | '';
}

interface WorkoutLog {
  id?: number;
  date: string;
  client_id: number;
  exercise_id: number;
  sets: WorkoutSet[];
  created_at: string; 
}

export default function WorkoutLogs() {
  // --- LIVE DATABASE STATE ---
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [clientsList, setClientsList] = useState<ClientSnippet[]>([]);
  const [exercisesList, setExercisesList] = useState<ExerciseSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); 

  // Form State
  const [formData, setFormData] = useState<{
    date: string;
    client_id: string; // Keep as string for the form input binding
    exercise_id: string;
    sets: WorkoutSet[];
  }>({
    date: new Date().toISOString().split('T')[0],
    client_id: '',
    exercise_id: '',
    sets: [{ weight: '', reps: '' }]
  });

  // Dropdown States
  const [clientSearch, setClientSearch] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [isExerciseDropdownOpen, setIsExerciseDropdownOpen] = useState(false);

  // --- LIVE DATABASE FETCH ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch all three tables simultaneously for maximum speed
      const [clientsRes, exercisesRes, logsRes] = await Promise.all([
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('exercise_library').select('id, name, muscle_group').order('name'),
        supabase.from('workout_logs').select('*').order('created_at', { ascending: false })
      ]);

      if (clientsRes.data) setClientsList(clientsRes.data);
      if (exercisesRes.data) setExercisesList(exercisesRes.data);
      if (logsRes.data) setLogs(logsRes.data);
    } catch (error) {
      console.error("Error fetching workout data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- DERIVED DATA ---
  const filteredClients = useMemo(() => clientsList.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())), [clientSearch, clientsList]);
  const filteredExercises = useMemo(() => exercisesList.filter(e => e.name.toLowerCase().includes(exerciseSearch.toLowerCase())), [exerciseSearch, exercisesList]);

  const totalLogs = logs.length;
  const totalVolume = logs.reduce((acc, log) => {
    return acc + log.sets.reduce((setAcc, set) => setAcc + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0);
  }, 0);

  // --- HANDLERS ---
  const handleClientSelect = (clientId: number, clientName: string) => {
    setFormData({ ...formData, client_id: clientId.toString() });
    setClientSearch(clientName);
    setIsClientDropdownOpen(false);
  };

  const handleExerciseSelect = (exerciseId: number, exerciseName: string) => {
    setFormData({ ...formData, exercise_id: exerciseId.toString() });
    setExerciseSearch(exerciseName);
    setIsExerciseDropdownOpen(false);
  };

  const addSet = () => setFormData({ ...formData, sets: [...formData.sets, { weight: '', reps: '' }] });
  
  const removeSet = (index: number) => {
    if (formData.sets.length > 1) {
      setFormData({ ...formData, sets: formData.sets.filter((_, i) => i !== index) });
    }
  };

  const updateSet = (index: number, field: keyof WorkoutSet, value: string) => {
    const newSets = [...formData.sets];
    newSets[index][field] = value === '' ? '' : Number(value);
    setFormData({ ...formData, sets: newSets });
  };

  // --- EDITING LOGIC ---
  const handleEdit = (log: WorkoutLog) => {
    setEditingId(log.id!);
    
    setFormData({
      date: log.date,
      client_id: log.client_id.toString(),
      exercise_id: log.exercise_id.toString(),
      sets: log.sets.map(set => ({ ...set })) // Deep copy
    });

    const clientName = clientsList.find(c => c.id === log.client_id)?.name || '';
    setClientSearch(clientName);
    const exerciseName = exercisesList.find(e => e.id === log.exercise_id)?.name || '';
    setExerciseSearch(exerciseName);

    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ date: new Date().toISOString().split('T')[0], client_id: '', exercise_id: '', sets: [{ weight: '', reps: '' }] });
    setClientSearch('');
    setExerciseSearch('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id) return alert("Please select a valid Client.");
    if (!formData.exercise_id) return alert("Please select a valid Exercise.");
    if (formData.sets.some(s => s.weight === '' || s.reps === '')) return alert("Please fill out all Weight and Reps fields, or remove empty sets.");

    setIsSubmitting(true);
    try {
      const payload = {
        date: formData.date,
        client_id: parseInt(formData.client_id),
        exercise_id: parseInt(formData.exercise_id),
        sets: formData.sets // Supabase automatically converts this array to JSONB!
      };

      if (editingId) {
        // UPDATE
        const { error } = await supabase
          .from('workout_logs')
          .update(payload)
          .eq('id', editingId);
          
        if (error) throw error;
        
        setEditingId(null);
        setClientSearch('');
        setExerciseSearch('');
        setFormData({ date: new Date().toISOString().split('T')[0], client_id: '', exercise_id: '', sets: [{ weight: '', reps: '' }] });
      } else {
        // INSERT
        const { error } = await supabase
          .from('workout_logs')
          .insert([payload]);
          
        if (error) throw error;
        
        // Reset form but KEEP date and client to make logging multiple exercises faster!
        setFormData({ ...formData, exercise_id: '', sets: [{ weight: '', reps: '' }] });
        setExerciseSearch('');
      }
      
      // Refresh live data
      await fetchData();
    } catch (error) {
      console.error("Error saving log:", error);
      alert("Failed to save workout log to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* --- HEADER --- */}
      <div>
        <h2 style={{ margin: 0, color: '#111827', fontSize: '1.8rem' }}>Workout Logs</h2>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>Track daily sets, reps, and volume progression.</p>
      </div>

      {/* --- 1. TOP VISUALIZATIONS --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #2563eb' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#6b7280' }}>Total Workouts Logged</h4>
          <span style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827' }}>{totalLogs}</span>
        </div>
        
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #8b5cf6' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#6b7280' }}>App-Wide Volume Lifted</h4>
          <span style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827' }}>{totalVolume.toLocaleString()} <span style={{ fontSize: '1rem', color: '#6b7280' }}>kg</span></span>
        </div>

        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>Volume Trend (Mock)</h4>
          <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            {[40, 65, 45, 80, 55, 90, 75].map((h, i) => (
              <div key={i} style={{ flex: 1, background: '#e0e7ff', borderRadius: '4px 4px 0 0', height: `${h}%`, position: 'relative' }}>
                <div style={{ position: 'absolute', bottom: 0, width: '100%', background: '#4f46e5', borderRadius: '4px 4px 0 0', height: `${h * 0.7}%` }}></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- 2. LOG ENTRY FORM --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '24px', borderTop: editingId ? '4px solid #f59e0b' : '4px solid #10b981' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>{editingId ? '✏️ Edit Workout Log' : '➕ Log New Exercise'}</h3>
        
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {/* Date Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Date</label>
              <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
            </div>

            {/* Client Searchable Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Client</label>
              <input 
                type="text" placeholder="Search client..." value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setFormData({ ...formData, client_id: '' }); setIsClientDropdownOpen(true); }}
                onFocus={() => setIsClientDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 200)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} required 
              />
              {isClientDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  {filteredClients.map(client => (
                    <div key={client.id} onClick={() => handleClientSelect(client.id, client.name)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>{client.name}</div>
                  ))}
                  {filteredClients.length === 0 && <div style={{ padding: '10px', color: '#6b7280' }}>No clients found.</div>}
                </div>
              )}
            </div>

            {/* Exercise Searchable Dropdown */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Exercise</label>
              <input 
                type="text" placeholder="Search exercise..." value={exerciseSearch}
                onChange={e => { setExerciseSearch(e.target.value); setFormData({ ...formData, exercise_id: '' }); setIsExerciseDropdownOpen(true); }}
                onFocus={() => setIsExerciseDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsExerciseDropdownOpen(false), 200)}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} required 
              />
              {isExerciseDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  {filteredExercises.map(ex => (
                    <div key={ex.id} onClick={() => handleExerciseSelect(ex.id, ex.name)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ex.name}</span><span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{ex.muscle_group}</span>
                    </div>
                  ))}
                  {filteredExercises.length === 0 && <div style={{ padding: '10px', color: '#6b7280' }}>No exercises found.</div>}
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Sets Area */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '20px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, color: '#374151' }}>Working Sets</h4>
              <button type="button" onClick={addSet} style={{ background: '#e0e7ff', color: '#4338ca', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                ➕ Add Set
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formData.sets.map((set, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                  <span style={{ fontWeight: '900', color: '#9ca3af', width: '60px' }}>SET {i + 1}</span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4b5563' }}>Weight (kg):</label>
                    <input type="number" step="0.5" placeholder="0" value={set.weight} onChange={e => updateSet(i, 'weight', e.target.value)} style={{ width: '80px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4b5563' }}>Reps:</label>
                    <input type="number" placeholder="0" value={set.reps} onChange={e => updateSet(i, 'reps', e.target.value)} style={{ width: '80px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
                  </div>

                  {formData.sets.length > 1 && (
                    <button type="button" onClick={() => removeSet(i)} style={{ marginLeft: 'auto', background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕ Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {editingId && (
              <button type="button" onClick={cancelEdit} style={{ padding: '12px 24px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Cancel Edit
              </button>
            )}
            <button type="submit" disabled={isSubmitting} style={{ padding: '12px 32px', background: editingId ? '#f59e0b' : '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1, boxShadow: '0 4px 6px rgba(16,185,129,0.2)' }}>
              {isSubmitting ? 'Saving...' : (editingId ? '💾 Update Workout Log' : '💾 Save Workout Log')}
            </button>
          </div>
        </form>
      </div>

      {/* --- 3. RECENT LOGS TABLE --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, color: '#111827' }}>Recent Entries</h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '950px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Date</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Client Name</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Exercise</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Detailed Sets</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading workout logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No workouts logged yet.</td></tr>
              ) : (
                logs.map(log => {
                  const clientName = clientsList.find(c => c.id === log.client_id)?.name || 'Unknown';
                  const exerciseName = exercisesList.find(e => e.id === log.exercise_id)?.name || 'Unknown';
                  
                  // --- 24 HOUR CHECK LOGIC ---
                  const now = new Date().getTime();
                  const logTime = new Date(log.created_at).getTime();
                  const isEditable = (now - logTime) <= (24 * 60 * 60 * 1000);

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: editingId === log.id ? '#fef3c7' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#374151' }}>{log.date}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#2563eb' }}>{clientName}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#111827' }}>{exerciseName}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {log.sets.map((set, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1d4ed8', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                              <strong style={{ color: '#93c5fd' }}>S{i+1}:</strong> {set.weight}kg × {set.reps}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        {isEditable ? (
                          <button onClick={() => handleEdit(log)} style={{ padding: '6px 12px', background: 'transparent', color: '#f59e0b', border: '1px solid #fcd34d', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Edit
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'bold', padding: '6px 12px', display: 'inline-block' }}>
                            🔒 Locked
                          </span>
                        )}
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