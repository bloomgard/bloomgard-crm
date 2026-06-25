"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTeam() {
      try {
        // 1. Get current user session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not logged in");

        // 2. Get current user's profile to find their workspace (tenant_id)
        const { data: myProfile, error: profileError } = await supabase
          .from("profiles")
          .select("tenant_id, role")
          .eq("id", session.user.id)
          .single();

        if (profileError) throw profileError;
        if (!myProfile?.tenant_id) throw new Error("No workspace assigned to your account.");

        // 3. Fetch all users in the same workspace
        const { data: teamData, error: teamError } = await supabase
          .from("profiles")
          .select("*")
          .eq("tenant_id", myProfile.tenant_id)
          .order("created_at", { ascending: true });

        if (teamError) throw teamError;
        setUsers(teamData || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchTeam();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <p className="font-semibold text-xs tracking-widest text-gray-500 uppercase animate-pulse">Loading Team...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Team Management</h1>
          <p className="text-gray-500 mt-1 text-sm">View and manage roles for your workspace.</p>
        </div>
        <button className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors active:scale-95">
          + Invite User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8F9FA] border-b border-gray-100 text-xs text-gray-500 uppercase tracking-widest">
              <th className="p-4 font-bold">Email</th>
              <th className="p-4 font-bold">Role</th>
              <th className="p-4 font-bold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 text-gray-900 text-sm font-medium">
                  {user.email || 'Unknown'}
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest
                    ${user.role === 'admin' ? 'bg-black text-white' : 
                      user.role === 'manager' ? 'bg-gray-200 text-gray-800' : 
                      'bg-gray-100 text-gray-500'}`}>
                    {user.role || 'Agent'}
                  </span>
                </td>
                <td className="p-4 text-gray-500 text-sm">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {users.length === 0 && (
          <div className="p-12 text-center text-gray-500 text-sm">
            No team members found in this workspace.
          </div>
        )}
      </div>
    </div>
  );
}