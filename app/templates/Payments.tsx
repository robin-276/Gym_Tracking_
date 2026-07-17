"use client";
import React, { useState, useMemo, useEffect } from 'react';

// Database bridge imported here!
import { supabase } from '@/lib/supabaseClient';

// --- TYPES (Supabase Ready) ---
interface ClientSnippet {
  id: number | string; // Handled as string/number safely
  name: string;
  renewal_status?: string; 
  date?: string; // Join date
  created_at?: string; // Fallback join date
  amount?: number; // Monthly fee
}

interface Payment {
  id?: string | number; 
  client_id: number | string; 
  date: string;
  amount: number;
  payment_method: string;
}

// Added globalClientId prop from Dashboard
export default function Payments({ globalClientId }: { globalClientId?: number | string | null }) {
  // --- LIVE DATABASE STATE ---
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clientsList, setClientsList] = useState<ClientSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeFilter, setTimeFilter] = useState('total'); // Filter state

  // Form State
  const [formData, setFormData] = useState<Partial<Payment>>({ 
    date: new Date().toISOString().split('T')[0],
    payment_method: ''
  });
  
  // Searchable Dropdown State
  const [clientSearch, setClientSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- LIVE DATABASE FETCH ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetching all columns (*) to prevent crash if column names differ slightly
      const [clientsRes, paymentsRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('payments').select('*').order('date', { ascending: false })
      ]);

      if (clientsRes.data) setClientsList(clientsRes.data);
      if (paymentsRes.data) setPayments(paymentsRes.data);
    } catch (error) {
      console.error("Error fetching financial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- AUTO-SELECT CLIENT LOGIC ---
  useEffect(() => {
    if (globalClientId && clientsList.length > 0) {
      // Using == instead of === to prevent String/Int mismatch bugs
      const selectedClient = clientsList.find(c => c.id == globalClientId);
      if (selectedClient) {
        setFormData(prev => ({ ...prev, client_id: selectedClient.id }));
        setClientSearch(selectedClient.name);
      }
    } else if (!globalClientId) {
      setFormData(prev => ({ ...prev, client_id: undefined }));
      setClientSearch('');
    }
  }, [globalClientId, clientsList]);

  // --- DERIVED DATA & CALCULATIONS ---
  const filteredClients = useMemo(() => {
    return clientsList.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));
  }, [clientSearch, clientsList]);

  // 1. Calculate Balances & Due Dates for EVERY client
  const clientBalances = useMemo(() => {
    const now = new Date();
    
    return clientsList.map(client => {
      // Safely get the join date (fallback to created_at or today if missing)
      const joinDateStr = client.date || client.created_at || now.toISOString();
      const joinDate = new Date(joinDateStr);
      const joinDay = joinDate.getDate();
      
      // Calculate how many months have passed (New cycle begins on the 1st of every month)
      const monthsPassed = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
      const cyclesOwed = monthsPassed + 1; // +1 for the month they joined
      
      const monthlyFee = client.amount && client.amount > 0 ? client.amount : 1000; // Fallback to 1000 if not set
      const totalOwed = cyclesOwed * monthlyFee;
      
      // Sum all their payments (Using == for safe matching)
      const clientPayments = payments.filter(p => p.client_id == client.id);
      const totalPaid = clientPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      const balance = totalPaid - totalOwed;
      
      // Due logic
      const isOverdue = balance < 0 && now.getDate() > joinDay;

      return {
        ...client,
        joinDay,
        totalOwed,
        totalPaid,
        balance,
        isOverdue
      };
    });
  }, [clientsList, payments]);

  // Combined Date and Global Client Filtering Logic
  const filteredPayments = useMemo(() => {
    const now = new Date();
    
    let basePayments = payments;
    if (globalClientId) {
      basePayments = basePayments.filter(p => p.client_id == globalClientId);
    }

    return basePayments.filter(payment => {
      const pDate = new Date(payment.date);
      if (timeFilter === 'today') return pDate.toDateString() === now.toDateString();
      if (timeFilter === 'week') return (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24) <= 7;
      if (timeFilter === 'month') return (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24) <= 30;
      if (timeFilter === 'year') return (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24) <= 365;
      return true; // 'total'
    });
  }, [payments, timeFilter, globalClientId]);

  // KPIs
  const totalRevenue = filteredPayments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  
  const displayBalances = globalClientId ? clientBalances.filter(c => c.id == globalClientId) : clientBalances;
  const totalPending = displayBalances.filter(c => c.balance < 0).reduce((sum, c) => sum + Math.abs(c.balance), 0);
  const totalAdvance = displayBalances.filter(c => c.balance > 0).reduce((sum, c) => sum + c.balance, 0);
  const dueClients = displayBalances.filter(c => c.balance < 0);

  // Payment Method Distribution
  const methodCounts = filteredPayments.reduce((acc, payment) => {
    acc[payment.payment_method] = (acc[payment.payment_method] || 0) + payment.amount;
    return acc;
  }, {} as Record<string, number>);

  // --- HANDLERS ---
  const handleClientSelect = (clientId: number | string, clientName: string) => {
    setFormData({ ...formData, client_id: clientId });
    setClientSearch(clientName);
    setIsDropdownOpen(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_id) {
      alert("Please select a valid client from the dropdown.");
      return;
    }

    const isConfirmed = window.confirm(
      "⚠️ SECURITY WARNING: Are you sure you want to save this payment record?\n\nOnce saved, financial records CANNOT be edited or deleted for auditing purposes. Please verify the amount and client name."
    );
    
    if (!isConfirmed) return;

    setIsSubmitting(true);
    try {
      const payload = {
        client_id: formData.client_id,
        date: formData.date,
        amount: parseFloat(formData.amount?.toString() || '0'),
        payment_method: formData.payment_method
      };

      const { error } = await supabase
        .from('payments')
        .insert([payload]);
        
      if (error) throw error;
      
      await fetchData();
      
      if (globalClientId) {
        const selectedClient = clientsList.find(c => c.id == globalClientId);
        setFormData({ date: new Date().toISOString().split('T')[0], payment_method: '', client_id: selectedClient?.id });
        setClientSearch(selectedClient ? selectedClient.name : '');
      } else {
        setFormData({ date: new Date().toISOString().split('T')[0], payment_method: '' });
        setClientSearch('');
      }
      
      alert("✅ Payment secured and recorded successfully.");
    } catch (error) {
      console.error("Error saving payment:", error);
      alert("Failed to save payment to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadStatement = () => {
    const headers = ["Date", "Client Name", "Payment Method", "Amount (INR)"];
    const rows = filteredPayments.map(p => {
      const clientName = clientsList.find(c => c.id == p.client_id)?.name || "Unknown";
      return [p.date, `"${clientName}"`, p.payment_method, p.amount].join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payment_statement_${timeFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* --- TIME FILTER --- */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <select 
          value={timeFilter} 
          onChange={(e) => setTimeFilter(e.target.value)}
          style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: '#fff' }}
        >
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="year">This Year</option>
          <option value="total">All Time (Total)</option>
        </select>
      </div>

      {/* --- 1. TOP VISUALIZATIONS --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        
        {/* KPI: Total Revenue */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '4px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#6b7280' }}>
            {globalClientId ? `Client Revenue (${timeFilter})` : `Total Revenue (${timeFilter})`}
          </h4>
          <span style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827' }}>₹{totalRevenue.toLocaleString()}</span>
        </div>

        {/* KPI: Ledger Status */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: globalClientId && displayBalances[0]?.balance >= 0 ? '4px solid #10b981' : '4px solid #ef4444', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#6b7280' }}>
            {globalClientId ? 'Client Net Balance' : 'Overall Ledger Status'}
          </h4>
          
          {globalClientId && displayBalances.length > 0 ? (
            // Single Client View
            <div>
              {displayBalances[0].balance < 0 && <span style={{ fontSize: '2rem', fontWeight: '900', color: '#ef4444' }}>Pen {displayBalances[0].balance}</span>}
              {displayBalances[0].balance > 0 && <span style={{ fontSize: '2rem', fontWeight: '900', color: '#10b981' }}>Adv +{displayBalances[0].balance}</span>}
              {displayBalances[0].balance === 0 && <span style={{ fontSize: '2rem', fontWeight: '900', color: '#6b7280' }}>Settled ₹0</span>}
              
              {displayBalances[0].balance < 0 && (
                <div style={{ marginTop: '8px', fontSize: '0.85rem', fontWeight: 'bold', color: displayBalances[0].isOverdue ? '#ef4444' : '#f59e0b' }}>
                  {displayBalances[0].isOverdue ? `⚠️ OVERDUE since the ${displayBalances[0].joinDay}th` : `Due on the ${displayBalances[0].joinDay}th`}
                </div>
              )}
            </div>
          ) : (
            // All Clients View
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#ef4444' }}>Total Pending</span>
                <span style={{ fontWeight: '900', color: '#ef4444', fontSize: '1.2rem' }}>-{totalPending.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#10b981' }}>Total Advance</span>
                <span style={{ fontWeight: '900', color: '#10b981', fontSize: '1.2rem' }}>+{totalAdvance.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Due Users Custom List (Only shows when no global user is selected) */}
        {!globalClientId && (
          <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxHeight: '200px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>Due Clients</h4>
            {dueClients.length === 0 ? (
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>✅ No dues found.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dueClients.map(client => (
                  <div key={client.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', color: '#374151', fontSize: '0.9rem' }}>{client.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#ef4444', fontWeight: '900', fontSize: '0.9rem' }}>Pen {client.balance}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: client.isOverdue ? '#ef4444' : '#f59e0b' }}>
                        {client.isOverdue ? 'Overdue' : `Due ${client.joinDay}th`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- 2. LOG ENTRY FORM --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '24px', borderTop: '4px solid #3b82f6' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#111827' }}>Secure Payment Entry</h3>
        
        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          
          {/* Custom Searchable Dropdown */}
          <div style={{ position: 'relative', gridColumn: 'span 1' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>
              {globalClientId ? 'Client Name (Auto-Selected)' : 'Client Name'}
            </label>
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
              style={{ 
                width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box',
                backgroundColor: globalClientId ? '#eff6ff' : '#ffffff' 
              }} 
              required 
            />
            {isDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                {filteredClients.length > 0 ? (
                  filteredClients.map(client => {
                    const cb = clientBalances.find(c => c.id == client.id);
                    return (
                      <div 
                        key={client.id} 
                        onClick={() => handleClientSelect(client.id, client.name)}
                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                      >
                        <span>{client.name}</span>
                        {cb && cb.balance < 0 && <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>Pen {cb.balance}</span>}
                      </div>
                    )
                  })
                ) : (
                  <div style={{ padding: '10px', color: '#6b7280', fontSize: '0.85rem' }}>No clients found.</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Date of Payment</label>
            <input required type="date" value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Amount Paid (₹)</label>
            <input required type="number" step="1" placeholder="0" value={formData.amount || ''} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Payment Method</label>
            <select required value={formData.payment_method || ''} onChange={e => setFormData({...formData, payment_method: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }}>
              <option value="">Select Method...</option>
              <option value="UPI">UPI (GPay, PhonePe, etc.)</option>
              <option value="Cash">Cash</option>
              <option value="Card">Credit/Debit Card</option>
              <option value="Month">Monthly Auto-Debit</option>
            </select>
          </div>

          {/* 🔒 IN-UI SECURITY WARNING */}
          <div style={{ gridColumn: '1 / -1', marginTop: '8px', padding: '12px', background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#991b1b', fontWeight: 'bold' }}>
              Security Notice: Once saved, payment records are locked and cannot be edited or deleted. Please double-check amounts before submitting.
            </p>
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="submit" disabled={isSubmitting} style={{ padding: '12px 32px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(37,99,235,0.2)' }}>
              {isSubmitting ? 'Processing...' : '🔒 Save Permanent Record'}
            </button>
          </div>
        </form>
      </div>

      {/* --- 3. RECENT LOGS TABLE (READ ONLY) --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        
        {/* Table Header & Download Button */}
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#111827' }}>
            {globalClientId ? `Client's Ledger History (${timeFilter})` : `Ledger History (${timeFilter})`}
          </h3>
          <button 
            onClick={downloadStatement}
            style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⬇️ Download Statement (.csv)
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Date</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Client Name</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Method</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'right' }}>Amount Paid</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                    Loading financial records...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                    No payments found for this period.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(payment => {
                  // Using == instead of === fixes the Unknown Client bug completely
                  const clientName = clientsList.find(c => c.id == payment.client_id)?.name || 'Unknown Client';
                  return (
                    <tr key={payment.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#374151' }}>{payment.date}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#2563eb' }}>{clientName}</td>
                      <td style={{ padding: '16px 20px', color: '#4b5563' }}>
                        <span style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold' }}>{payment.payment_method}</span>
                      </td>
                      <td style={{ padding: '16px 20px', color: '#111827', fontWeight: '900', fontSize: '1.1rem', textAlign: 'right' }}>
                        ₹{payment.amount.toLocaleString()}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                        <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>🔒 Verified</span>
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