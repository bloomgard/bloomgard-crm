"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useRouter } from "next/navigation"; 

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true); // Start loading to prevent flash of login screen
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter(); 

  useEffect(() => {
    // 🔍 Check for an existing, valid session on load
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // If a session exists (even a stored refresh token), bypass login!
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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Check your email for the confirmation link!");
        setLoading(false);
      } else {
        // Supabase automatically handles storing the session for persistence
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
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
    <div className="min-h-screen flex items-center justify-center p-4 glass-mode relative z-10 transition-all duration-500">
      <div className="fixed inset-0 z-[-1] bg-cover bg-center" style={{ backgroundImage: "url('/wallpapers/login_bg.png')" }}></div>
      
      <div className="w-full max-w-md bg-white rounded-[2rem] p-10 border border-white/40 relative overflow-hidden">
        
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tighter text-gray-900 mb-2">Bloomgard.</h1>
          <p className="text-sm text-gray-500">
            {isSignUp ? "Create a new workspace for your company." : "Log in to your workspace."}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Work Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/40 backdrop-blur-sm border border-white/40 rounded-xl px-4 py-3 text-sm focus:bg-white/70 focus:border-gray-300 focus:ring-0 outline-none transition-all placeholder-gray-500"
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
                className="w-full bg-white/40 backdrop-blur-sm border border-white/40 rounded-xl px-4 py-3 text-sm focus:bg-white/70 focus:border-gray-300 focus:ring-0 outline-none transition-all pr-16 placeholder-gray-500"
                placeholder="••••••••"
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
            {isSignUp ? "Create Workspace" : "Sign In"}
          </button>
        </form>

        <div className="mt-8 text-center">
           {/* Add a toggle if you want users to be able to sign up vs log in */}
        </div>

      </div>
    </div>
  );
}