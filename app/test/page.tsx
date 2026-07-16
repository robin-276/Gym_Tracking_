'use client';

import { supabase } from '@/lib/supabaseClient'; 

export default function DatabaseTest() {
  
  const runDatabaseTest = async () => {
    console.log("🚀 1. Testing CREATE...");
    
    // 1. CREATE a fake client
    const { data: newClient, error: createError } = await supabase
      .from('clients')
      .insert([{ name: 'Test Biju', age: 30 }])
      .select();
    
    if (createError) {
      console.error("❌ Create Failed:", createError);
      return;
    }
    console.log("✅ Created:", newClient);

    const testId = newClient[0].id;

    // 2. READ the data back
    console.log("🚀 2. Testing READ...");
    const { data: readClient, error: readError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', testId);
    
    if (readError) console.error("❌ Read Failed:", readError);
    else console.log("✅ Read:", readClient);

    // 3. UPDATE the age
    console.log("🚀 3. Testing UPDATE...");
    const { data: updatedClient, error: updateError } = await supabase
      .from('clients')
      .update({ age: 31 })
      .eq('id', testId)
      .select();
      
    if (updateError) console.error("❌ Update Failed:", updateError);
    else console.log("✅ Updated:", updatedClient);

    // 4. DELETE the fake client
    console.log("🚀 4. Testing DELETE...");
    const { error: deleteError } = await supabase
      .from('clients')
      .delete()
      .eq('id', testId);
    
    if (deleteError) {
      console.error("❌ Delete Failed:", deleteError);
    } else {
      console.log("✅ Deleted successfully! All backend tests passed! 🎉");
    }
  };

  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Database Connection Test</h1>
      <button 
        onClick={runDatabaseTest}
        className="px-8 py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
      >
        Run Database Test
      </button>
      <p className="mt-4 text-gray-500">Open your browser console (F12) before clicking!</p>
    </div>
  );
}