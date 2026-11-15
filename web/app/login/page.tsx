"use client";
import { useState, useEffect } from "react";
import { Search } from 'lucide-react';
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation"; 
import BrandLockup from '@/components/BrandLockup';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true); // Start loading to prevent flash of login screen
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");

  // /signup and the landing page's "Create account" open this page in sign-up mode
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") setIsSignUp(true);
  }, []);
  const router = useRouter(); 

  useEffect(() => {
    // <Search className="w-5 h-5 inline text-gray-500" /> Check for an existing, valid session on load
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // If a session exists, check role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
          
        router.replace("/dashboard");
      } else {
        // Only stop loading if there is truly no session
        setLoading(false);
      }
    };
    
    checkSession();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // A new workspace, with the person signing up as its admin; then sign them straight in.
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, fullName, email, password }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || "Could not create the account.");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
      } else {
        // Supabase automatically handles storing the session for persistence
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .single();
          
        router.replace("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // If we are checking the session, show a clean loading state instead of the form
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <p className="font-semibold text-xs tracking-widest text-gray-500 uppercase animate-pulse">Checking Session...</p>
      </div>
    );
  }

  return (
    <div className="jaali min-h-screen flex items-center justify-center p-4 relative z-10 transition-all duration-500">
      
      <div className="w-full max-w-md bg-white rounded-[2rem] p-10 border border-white/40 relative overflow-hidden">
        
        <div className="text-center mb-10">
          <h1 className="text-gray-900 mb-3 flex justify-center"><BrandLockup height={30} tone="onLight" /></h1>
          <p className="text-sm text-gray-500">
            {isSignUp ? "Create your company's workspace." : "Log in to your workspace."}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-6">
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Company name</label>
                <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Steel Pvt. Ltd."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-indigo-400 focus:ring-0 outline-none transition-all placeholder-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Your name</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya Sharma" autoComplete="name"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-indigo-400 focus:ring-0 outline-none transition-all placeholder-gray-500" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Work Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-indigo-400 focus:ring-0 outline-none transition-all placeholder-gray-500"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
            <div className="relative w-full">
              <input 
                type={showPassword ? "text" : "password"} 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-indigo-400 focus:ring-0 outline-none transition-all pr-16 placeholder-gray-500"
                placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
                minLength={isSignUp ? 8 : undefined}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
              >
                {showPassword ? (
                  <span className="text-[10px] font-black uppercase tracking-tighter">Hide</span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-tighter">Show</span>
                )}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gray-900 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-black transition-all hover:shadow-lg disabled:bg-gray-400 active:scale-95 mt-4"
          >
            {isSignUp ? "Create account" : "Sign In"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(null); }} className="text-sm text-gray-600 hover:text-gray-900">
            {isSignUp ? <>Already have an account? <b className="underline">Log in</b></> : <>New to Bloomgard? <b className="underline">Create an account</b></>}
          </button>
          {isSignUp && <p className="text-xs text-gray-500 mt-3">You will be the admin of your new workspace. Add your team and shape your quote form later, or just ask Bloomgard AI.</p>}
        </div>

      </div>
    </div>
  );
}