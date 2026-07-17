"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';

// --- TYPES ---
interface Client {
  id?: number; 
  name: string;
  age: string | number; 
  phone: string;
  timing: string;
  goal: string;
  total_sessions: number; 
  sessions_remaining: number;
  renewal_status: string;
  notes: string;
  image_url?: string;
  // Temporary fields for onboarding only
  height?: number;
  body_weight?: number;
  muscle_mass?: number;
  fat_mass?: number;
}

export default function Clients({ globalClientId }: { globalClientId?: number | string | null }) {
  // --- STATE MANAGEMENT ---
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});
  
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Dynamic Dropdown States
  const [goalOptions, setGoalOptions] = useState(['Fat loss', 'Hypertrophy', 'Conditioning', 'Rehab', 'Other']);
  const [timingOptions, setTimingOptions] = useState(['Morning (6-8 AM)', 'Afternoon (12-3 PM)', 'Evening (5-8 PM)', 'Night (8-10 PM)']);
  const [statusOptions, setStatusOptions] = useState(['Up to Date', 'Pending Payment', 'Needs Renewal']);

  // --- LIVE DATABASE FETCH ---
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('id', { ascending: false }); 
      
    if (!error && data) {
      setClients(data);
    } else if (error) {
      console.error("Error fetching clients:", error);
    }
    setIsLoading(false);
  };

  // --- DERIVED DATA & CALCULATIONS ---
  const filteredClients = useMemo(() => {
    if (globalClientId) return clients.filter(c => c.id == globalClientId);
    return clients;
  }, [clients, globalClientId]);

  const totalClients = clients.length; // Always show total gym roster
  
  const timingCounts = clients.reduce((acc, client) => {
    const time = client.timing || 'Unassigned';
    acc[time] = (acc[time] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const goalCounts = clients.reduce((acc, client) => {
    const goal = client.goal || 'Other';
    acc[goal] = (acc[goal] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // --- HANDLERS ---
  const handleOpenNew = () => {
    setEditingClient(null);
    setFormData({ total_sessions: 12, sessions_remaining: 12, renewal_status: 'Up to Date' });
    setIsConfirmingDelete(false); 
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData(client);
    setIsConfirmingDelete(false); 
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!editingClient?.id) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', editingClient.id);
      if (error) throw error;
      setClients(clients.filter(c => c.id !== editingClient.id));
      setIsModalOpen(false);
      setIsConfirmingDelete(false);
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Failed to delete client.");
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const tempUrl = URL.createObjectURL(file);
      setFormData({ ...formData, image_url: tempUrl });
    }
  };

  const handleAddCustomOption = (category: 'goal' | 'timing' | 'status') => {
    const newValue = prompt(`Enter new custom ${category}:`);
    if (!newValue || newValue.trim() === '') return;
    
    if (category === 'goal') {
      setGoalOptions([...goalOptions, newValue.trim()]);
      setFormData({ ...formData, goal: newValue.trim() }); 
    } else if (category === 'timing') {
      setTimingOptions([...timingOptions, newValue.trim()]);
      setFormData({ ...formData, timing: newValue.trim() });
    } else if (category === 'status') {
      setStatusOptions([...statusOptions, newValue.trim()]);
      setFormData({ ...formData, renewal_status: newValue.trim() });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const rawPhone = formData.phone || '';
    const justNumbers = rawPhone.replace(/\D/g, '');
    if (justNumbers.length < 10) {
      alert("⚠️ Please enter a valid phone number with at least 10 digits.");
      return; 
    }

    setIsSubmitting(true);

    try {
      // Separate metrics from client data to avoid DB schema errors
      const { height, body_weight, muscle_mass, fat_mass, ...clientPayload } = formData;

      const payload = {
        ...clientPayload,
        age: clientPayload.age ? parseInt(clientPayload.age.toString(), 10) : null,
        total_sessions: clientPayload.total_sessions || 0,
        sessions_remaining: clientPayload.sessions_remaining || 0,
      };

      if (editingClient && editingClient.id) {
        // UPDATE EXISTING CLIENT
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        // INSERT NEW CLIENT
        delete payload.id;
        // .select() returns the newly created row so we can get its generated ID
        const { data: newClientData, error: clientError } = await supabase.from('clients').insert([payload]).select();
        if (clientError) throw clientError;

        // INSERT STARTING METRICS (If provided)
        if (newClientData && newClientData.length > 0) {
          const newClientId = newClientData[0].id;
          if (height || body_weight || muscle_mass || fat_mass) {
            const metricsPayload = {
              client_id: newClientId,
              date: new Date().toISOString().split('T')[0],
              height: height ? parseFloat(height.toString()) : 0,
              body_weight: body_weight ? parseFloat(body_weight.toString()) : 0,
              muscle_mass: muscle_mass ? parseFloat(muscle_mass.toString()) : 0,
              fat_mass: fat_mass ? parseFloat(fat_mass.toString()) : 0,
              notes: 'Initial metrics taken on sign-up'
            };
            const { error: metricsError } = await supabase.from('body_metrics').insert([metricsPayload]);
            if (metricsError) console.error("Metrics failed to save:", metricsError);
          }
        }
      }
      
      await fetchClients();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Failed to save client to the database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status?.toLowerCase().includes('renewal') || status?.toLowerCase().includes('expired')) {
      return { bg: '#fee2e2', text: '#991b1b' }; 
    }
    if (status?.toLowerCase().includes('pending')) {
      return { bg: '#fef3c7', text: '#92400e' };
    }
    return { bg: '#dcfce7', text: '#166534' }; 
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      
      {/* --- HEADER --- */}
      {!globalClientId && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '1.8rem' }}>Client Management</h2>
            <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>Overview and roster details</p>
          </div>
          <button onClick={handleOpenNew} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            + Add New Client
          </button>
        </div>
      )}

      {/* --- VISUALIZATIONS & PROFILES --- */}
      {globalClientId && filteredClients.length > 0 ? (
        // SELECTED CLIENT PROFILE
        <div style={{ background: '#eff6ff', padding: '24px', borderRadius: '12px', border: '2px solid #3b82f6', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {filteredClients[0].image_url ? (
               <img src={filteredClients[0].image_url} alt={filteredClients[0].name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
            ) : (
               <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: '2rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                 {filteredClients[0].name?.charAt(0) || '?'}
               </div>
            )}
            <div>
              <h2 style={{ margin: '0 0 4px 0', color: '#111827', fontSize: '1.8rem' }}>{filteredClients[0].name}</h2>
              <div style={{ color: '#4b5563', fontSize: '1rem', fontWeight: 'bold' }}>Goal: <span style={{ color: '#2563eb' }}>{filteredClients[0].goal}</span></div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ background: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>Timing</div>
              <div style={{ fontSize: '1.1rem', color: '#111827', fontWeight: '900' }}>{filteredClients[0].timing}</div>
            </div>
            <div style={{ background: 'white', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 'bold' }}>Sessions Remaining</div>
              <div style={{ fontSize: '1.1rem', color: filteredClients[0].sessions_remaining < 3 ? '#ef4444' : '#10b981', fontWeight: '900' }}>
                {filteredClients[0].sessions_remaining} / {filteredClients[0].total_sessions}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // GYM-WIDE STATS
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #2563eb', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#6b7280' }}>Total Active Roster</h4>
            <span style={{ fontSize: '3rem', fontWeight: '900', color: '#111827' }}>{totalClients}</span>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>Client Goals Breakdown</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(goalCounts).map(([goal, count]) => (
                <div key={goal}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 'bold' }}>
                    <span>{goal}</span>
                    <span style={{ color: '#6b7280' }}>{count} clients</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f3f4f6', borderRadius: '4px' }}>
                    <div style={{ width: `${(count / totalClients) * 100}%`, height: '100%', background: '#10b981', borderRadius: '4px' }}></div>
                  </div>
                </div>
              ))}
              {Object.keys(goalCounts).length === 0 && <span style={{fontSize: '0.85rem', color: '#9ca3af'}}>No data yet</span>}
            </div>
          </div>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>Popular Timings</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(timingCounts).map(([time, count]) => (
                <div key={time}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 'bold' }}>
                    <span>{time}</span>
                    <span style={{ color: '#6b7280' }}>{count} clients</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f3f4f6', borderRadius: '4px' }}>
                    <div style={{ width: `${(count / totalClients) * 100}%`, height: '100%', background: '#8b5cf6', borderRadius: '4px' }}></div>
                  </div>
                </div>
              ))}
              {Object.keys(timingCounts).length === 0 && <span style={{fontSize: '0.85rem', color: '#9ca3af'}}>No data yet</span>}
            </div>
          </div>
        </div>
      )}

      {/* --- CLIENT LIST TABLE --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden', width: '100%' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: globalClientId ? 'flex' : 'none', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#111827' }}>Client Details</h3>
          <button onClick={() => handleOpenEdit(filteredClients[0])} style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Edit Profile
          </button>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Client Profile</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Details</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Sessions</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Renewal Status</th>
                {!globalClientId && <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading clients from database...</td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No clients found. Click "Add New Client" to get started!</td></tr>
              ) : (
                filteredClients.map(client => {
                  const badge = getStatusBadge(client.renewal_status);
                  return (
                    <tr key={client.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {client.image_url ? (
                          <img src={client.image_url} alt={client.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#6b7280' }}>
                            {client.name?.charAt(0) || '?'}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#111827' }}>{client.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Age: {client.age || 'N/A'} | {client.phone}</div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: '#4b5563', fontSize: '0.85rem' }}>
                        <div style={{ fontWeight: 'bold' }}>{client.goal}</div>
                        <div>{client.timing}</div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 'bold', color: '#111827' }}>{client.sessions_remaining} <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>/ {client.total_sessions}</span></div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ background: badge.bg, color: badge.text, padding: '6px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {client.renewal_status}
                        </span>
                      </td>
                      {!globalClientId && (
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button onClick={() => handleOpenEdit(client)} style={{ padding: '6px 16px', background: 'transparent', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ADD / EDIT MODAL --- */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '700px', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#111827' }}>{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
            
            <form onSubmit={handleSave} style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
                 {formData.image_url ? (
                    <img src={formData.image_url} alt="Preview" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                 ) : (
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>No Image</div>
                 )}
                 <div>
                   <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Profile Photo (Local Preview Only)</label>
                   <input type="file" accept="image/*" onChange={handleImageChange} style={{ fontSize: '0.85rem' }} />
                 </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Full Name</label>
                <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Age</label>
                <input type="number" value={formData.age || ''} onChange={e => setFormData({...formData, age: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Phone Number</label>
                <input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Primary Goal</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select required value={formData.goal || ''} onChange={e => setFormData({...formData, goal: e.target.value})} style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}>
                    <option value="">Select Goal...</option>
                    {goalOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button type="button" onClick={() => handleAddCustomOption('goal')} style={{ padding: '0 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>+ New</button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Preferred Timing</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select required value={formData.timing || ''} onChange={e => setFormData({...formData, timing: e.target.value})} style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}>
                    <option value="">Select Timing...</option>
                    {timingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button type="button" onClick={() => handleAddCustomOption('timing')} style={{ padding: '0 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>+ New</button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Total Sessions</label>
                <input required type="number" value={formData.total_sessions || ''} onChange={e => setFormData({...formData, total_sessions: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Sessions Remaining</label>
                <input required type="number" value={formData.sessions_remaining || ''} onChange={e => setFormData({...formData, sessions_remaining: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Renewal Status</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select required value={formData.renewal_status || ''} onChange={e => setFormData({...formData, renewal_status: e.target.value})} style={{ flex: 1, padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}>
                    {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button type="button" onClick={() => handleAddCustomOption('status')} style={{ padding: '0 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>+ New</button>
                </div>
              </div>

              {/* NEW: INITIAL METRICS (Only show when creating a brand new client) */}
              {!editingClient && (
                <div style={{ gridColumn: '1 / -1', background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', marginTop: '12px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#4b5563', fontSize: '0.9rem' }}>Initial Body Metrics (Optional)</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#6b7280' }}>Height (cm)</label>
                      <input type="number" step="0.1" placeholder="170" value={formData.height || ''} onChange={e => setFormData({...formData, height: parseFloat(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#6b7280' }}>Weight (kg)</label>
                      <input type="number" step="0.1" placeholder="0.0" value={formData.body_weight || ''} onChange={e => setFormData({...formData, body_weight: parseFloat(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#6b7280' }}>Muscle (kg)</label>
                      <input type="number" step="0.1" placeholder="0.0" value={formData.muscle_mass || ''} onChange={e => setFormData({...formData, muscle_mass: parseFloat(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', color: '#6b7280' }}>Fat Mass (%)</label>
                      <input type="number" step="0.1" placeholder="0.0" value={formData.fat_mass || ''} onChange={e => setFormData({...formData, fat_mass: parseFloat(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Coach Notes</label>
                <textarea rows={3} placeholder="Add any specific requirements, injuries, or notes here..." value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              <div style={{ gridColumn: '1 / -1', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                <div>
                  {editingClient && (
                    isConfirmingDelete ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 'bold' }}>Are you sure?</span>
                        <button type="button" onClick={handleDelete} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Yes, Delete</button>
                        <button type="button" onClick={() => setIsConfirmingDelete(false)} style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setIsConfirmingDelete(true)} style={{ padding: '8px 16px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Delete Client</button>
                    )
                  )}
                </div>

                <div style={{ display: 'flex', gap: '12px', flexGrow: 1, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={isSubmitting} style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1 }}>
                    {isSubmitting ? 'Saving...' : 'Save Client'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}