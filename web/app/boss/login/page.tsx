"use client";
import { useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation";

export default function BossLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleBossLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Strict check for your admin email
    if (email !== "anshag239@gmail.com") {
      alert("Unauthorized: Boss Access Only.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Access Denied: " + error.message);
      setLoading(false);
    } else {
      // Direct jump to the Boss Control Center
      router.push("/boss");
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        
        {/* LOGO AREA */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-black tracking-lighter text-white">Bloomgard.</h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] mt-2">CLIENT</p>
          
        </div>

        <form onSubmit={handleBossLogin} className="bg-[#111] border border-white/10 p-10 rounded-[2.5rem] shadow-2xl space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Admin Identity</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-semibold outline-none focus:border-white/40 transition-all"
              placeholder="boss@bloomgard.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Secure Key</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-semibold outline-none focus:border-white/40 transition-all"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-white text-black font-black py-4 rounded-2xl text-[10px] uppercase tracking-[0.2em] hover:bg-gray-200 transition-all shadow-xl active:scale-95 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Authorize Entry"}
          </button>
        </form>

        <div className="mt-12 text-center">
          <button 
            onClick={() => router.push("/")}
            className="text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-widest transition-colors"
          >
            ← Back to Client Portal
          </button>
        </div>
      </div>
    </div>
  );
}