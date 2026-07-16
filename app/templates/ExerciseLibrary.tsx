"use client";
import React, { useState, useEffect } from 'react';

// Database bridge imported here!
import { supabase } from '@/lib/supabaseClient';

// --- TYPES ---
interface Exercise {
  id?: number; 
  name: string;
  muscle_group: string;
}

export default function ExerciseLibrary() {
  // --- LIVE DATABASE STATE ---
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Exercise>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Track which row is currently confirming deletion
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // --- LIVE DATABASE FETCH ---
  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      // EXACT FIX: Pointing to 'exercise_library' (singular)
      const { data, error } = await supabase
        .from('exercise_library')
        .select('*')
        .order('name', { ascending: true }); // Alphabetical order
        
      if (!error && data) {
        setExercises(data);
      } else if (error) {
        console.error("Error fetching exercises:", error);
      }
    } catch (error) {
      console.error("Fetch block error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- HANDLERS ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.muscle_group) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        // UPDATE Existing Exercise (EXACT FIX: singular)
        const { error } = await supabase
          .from('exercise_library')
          .update({ name: formData.name, muscle_group: formData.muscle_group })
          .eq('id', editingId);
          
        if (error) throw error;
      } else {
        // INSERT New Exercise (EXACT FIX: singular)
        const { error } = await supabase
          .from('exercise_library')
          .insert([{ name: formData.name, muscle_group: formData.muscle_group }]);
          
        if (error) throw error;
      }
      
      await fetchExercises();
      setEditingId(null);
      setFormData({});
    } catch (error) {
      console.error("Error saving exercise:", error);
      alert("Failed to save exercise to database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (ex: Exercise) => {
    setEditingId(ex.id!);
    setFormData(ex);
    setDeletingId(null); // Close any active delete confirms
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const executeDelete = async (id: number) => {
    try {
      // EXACT FIX: Pointing to 'exercise_library' (singular)
      const { error } = await supabase.from('exercise_library').delete().eq('id', id);
      if (error) throw error;
      
      // Instantly remove from UI
      setExercises(exercises.filter(ex => ex.id !== id));
      setDeletingId(null);
    } catch (error) {
      console.error("Error deleting exercise:", error);
      alert("Failed to delete exercise. It might be used in a workout log.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* --- HEADER --- */}
      <div>
        <h2 style={{ margin: 0, color: '#111827', fontSize: '1.8rem' }}>Exercise Library</h2>
        <p style={{ margin: '4px 0 0 0', color: '#6b7280' }}>Manage the exercises available for workout logs.</p>
      </div>

      {/* --- INPUT SECTION --- */}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderTop: editingId ? '4px solid #f59e0b' : '4px solid #3b82f6' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#374151' }}>{editingId ? '✏️ Edit Exercise' : '➕ Add New Exercise'}</h3>
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Exercise Name</label>
            <input required type="text" placeholder="e.g., Bench Press" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>Muscle Groups (comma separated)</label>
            <input required type="text" placeholder="e.g., Chest, Shoulders, Triceps" value={formData.muscle_group || ''} onChange={e => setFormData({...formData, muscle_group: e.target.value})} style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            {editingId && (
              <button type="button" disabled={isSubmitting} onClick={() => { setEditingId(null); setFormData({}); }} style={{ padding: '10px 24px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
            )}
            <button type="submit" disabled={isSubmitting} style={{ padding: '10px 24px', background: editingId ? '#f59e0b' : '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'Saving...' : (editingId ? 'Update' : 'Add')}
            </button>
          </div>
        </form>
      </div>

      {/* --- EXERCISE TABLE --- */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr style={{ color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Exercise Name</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold' }}>Targeted Muscle Groups</th>
                <th style={{ padding: '16px 20px', fontWeight: 'bold', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading library...</td>
                </tr>
              ) : exercises.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>No exercises found. Add one above!</td>
                </tr>
              ) : (
                exercises.map(ex => (
                  <tr key={ex.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: editingId === ex.id ? '#fef3c7' : 'transparent', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 'bold', color: '#111827' }}>{ex.name}</td>
                    <td style={{ padding: '16px 20px', color: '#4b5563' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {ex.muscle_group.split(',').map((tag, i) => (
                          <span key={i} style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      {deletingId === ex.id ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>Delete?</span>
                          <button onClick={() => executeDelete(ex.id!)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Yes</button>
                          <button onClick={() => setDeletingId(null)} style={{ padding: '4px 10px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>No</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(ex)} style={{ background: 'transparent', color: '#f59e0b', border: '1px solid #fcd34d', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginRight: '8px' }}>Edit</button>
                          <button onClick={() => setDeletingId(ex.id!)} style={{ background: 'transparent', color: '#ef4444', border: 'none', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold' }}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}