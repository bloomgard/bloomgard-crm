"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BloomgardLanding() {
  const router = useRouter();
  const [showPortal, setShowPortal] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const isMobileApp = typeof window !== 'undefined' && 
      (window.location.href.includes('localhost') || window.origin.includes('capacitor'));
    if (isMobileApp) {
      router.replace("/login"); 
    }
  }, [router]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("bloomgarderp@gmail.com");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const preWrittenBody = "Hello%20Bloomgard%20Team%2C%0A%0AI%20am%20interested%20in%20upgrading%20my%20operational%20infrastructure.%20Please%20reach%20out%20to%20discuss%20implementation%20and%20details.%0A%0AThank%20you%2C%0A%5BYour%20Name%5D";

  return (
    <div className="min-h-screen text-white font-sans selection:bg-white selection:text-black scroll-smooth overflow-x-hidden relative">
      
      {/* --- FIXED LIQUID GLASS BACKGROUND --- */}
      <div className="fixed inset-0 z-[-2] bg-cover bg-center" style={{ backgroundImage: `url('/wallpapers/login_bg.png')` }}></div>
      {/* Dark tint to ensure text readability */}
      <div className="fixed inset-0 z-[-1] bg-black/40 backdrop-blur-md transition-opacity duration-700"></div>

      {/* --- NAV --- */}
      <nav className={`fixed top-0 w-full z-[100] px-10 py-5 flex justify-between items-center transition-all duration-500 ${scrolled ? "bg-black/50 backdrop-blur-2xl border-b border-white/10 py-4" : "bg-transparent"}`}>
        {/* LOGO KEPT EXACTLY AS IT WAS */}
        <h1 className="text-4xl font-bold tracking-tighter text-white">Bloomgard.</h1>
        
        <div className="hidden md:flex gap-12 items-center">
          <a href="#engine" className="text-[11px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">Engine</a>
          <a href="#specs" className="text-[11px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">Specs</a>
          <a href="#pricing" className="text-[11px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors">Pricing</a>
          <button 
            onClick={() => setShowPortal(true)}
            className="bg-white/10 border border-white/20 backdrop-blur-md text-white px-8 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all shadow-2xl"
          >
            Log in
          </button>
        </div>
      </nav>

      {/* --- HERO --- */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20">
        <div className="animate-in fade-in zoom-in duration-1000 max-w-7xl mx-auto">
          {/* BIG BOLD MINIMAL TITLE */}
          <h2 className="text-[14vw] md:text-[11rem] font-bold tracking-tighter leading-[0.8] mb-12 text-white drop-shadow-2xl">
            Engineered <br /> for Impact.
          </h2>
          <p className="max-w-3xl mx-auto text-white/80 font-medium text-xl md:text-3xl mb-16 leading-relaxed">
            The next-generation CRM infrastructure. Minimalist design. <br className="hidden md:block" /> 
            Powered by <span className="text-white font-bold">Bloomgard AI.</span>
          </p>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <button onClick={() => setShowPortal(true)} className="bg-white text-black px-14 py-6 rounded-3xl font-bold text-lg shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 transition-all">Launch Workspace</button>
            <a href="#specs" className="text-sm font-bold text-white/70 hover:text-white border-b-2 border-white/30 hover:border-white pb-1 transition-all">Explore Features →</a>
          </div>
        </div>
      </section>

      {/* --- NEW FEATURES (GLASS BENTO) --- */}
      <section id="specs" className="py-32 px-6 md:px-10 max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h3 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6">Technical Architecture.</h3>
          <p className="text-xl text-white/60">A pristine environment built for speed and automation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <BentoCard 
            title="Auto Follow-Up" 
            desc="Set your pipeline on autopilot. Intelligent, timed email follow-ups ensure no lead goes cold without manual intervention." 
            icon="⚡" 
          />
          <BentoCard 
            title="AI Agent Fleet" 
            desc="Deploy your autonomous agents. Real-time telemetry, predictive pipeline analytics, and deep email parsing running 24/7." 
            icon="🤖" 
          />
          <BentoCard 
            title="Liquid Glass UI" 
            desc="Experience the new Liquid Glass aesthetic. A distraction-free, hyper-optimized environment that looks as good as it performs." 
            icon="✨" 
          />
        </div>
      </section>

      {/* --- PRICING COMPARISON --- */}
      <section id="pricing" className="py-32 px-10 relative">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xl border-y border-white/10 -z-10"></div>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-24">
            <h3 className="text-5xl md:text-7xl font-bold tracking-tighter">System Comparison.</h3>
            <p className="text-white/60 font-medium mt-6 text-xl">Choose your level of operational intensity.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* STANDARD PLAN */}
            <div className="bg-white/5 backdrop-blur-2xl p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col hover:bg-white/10 transition-colors">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Mechanical Baseline</span>
              <p className="text-5xl font-bold mt-4 mb-8">Standard</p>
              
              <ul className="flex-1 space-y-6 text-base font-semibold text-white/80 border-t border-white/10 pt-8">
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white/50 rounded-full"></div>Unlimited PDF Manifests</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white/50 rounded-full"></div>Global Pipeline Tracking</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white/50 rounded-full"></div>New Liquid Glass UI</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white/50 rounded-full"></div>Multi-Agent Dashboards</li>
                <li className="flex items-center gap-4 text-white/30 line-through"><div className="w-2 h-2 bg-white/20 rounded-full"></div>Bloomgard AI Copilot</li>
              </ul>
              <button onClick={() => setShowContactModal(true)} className="mt-12 w-full py-5 rounded-2xl bg-white/10 border border-white/20 text-white font-bold uppercase tracking-widest text-xs hover:bg-white hover:text-black transition-all">Contact Sales</button>
            </div>

            {/* BLOOMGARD AI PLAN */}
            <div className="bg-white/10 backdrop-blur-3xl p-12 rounded-[3rem] border border-white/30 shadow-[0_0_50px_rgba(255,255,255,0.1)] flex flex-col relative scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">Maximum Performance</div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Cognitive Enhancement</span>
              <p className="text-5xl font-bold tracking-tighter mt-4 mb-8">Bloomgard AI</p>
              
              <ul className="flex-1 space-y-6 text-base font-bold text-white border-t border-white/10 pt-8">
                <li className="flex items-center gap-4"><div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(129,140,248,0.8)]"></div>Auto Follow-Up Engine</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white rounded-full"></div>Integrated Bloomgard AI Copilot</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white rounded-full"></div>Predictive Pipeline Analytics</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white rounded-full"></div>Natural Language Query Support</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white rounded-full"></div>Priority Server Routing</li>
                <li className="flex items-center gap-4"><div className="w-2 h-2 bg-white rounded-full"></div>Includes all Standard features</li>
              </ul>
              <button onClick={() => setShowContactModal(true)} className="mt-12 w-full py-5 rounded-2xl bg-white text-black font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl">Contact Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* --- PORTAL MODAL --- */}
      {showPortal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-3xl animate-in fade-in duration-300">
          <button onClick={() => setShowPortal(false)} className="absolute top-10 right-10 text-4xl text-white font-light hover:rotate-90 transition-all">✕</button>
          
          <div className="w-full max-w-lg space-y-6 animate-in zoom-in-95 duration-500">
            <div 
              onClick={() => router.push("/login")}
              className="group bg-white/10 border border-white/20 backdrop-blur-2xl p-12 rounded-[3.5rem] shadow-2xl hover:scale-[1.02] hover:bg-white/20 transition-all cursor-pointer text-center"
            >
               <h3 className="text-4xl font-bold tracking-tighter mb-4 text-white">Client Portal</h3>
               <p className="text-white/60 font-medium mb-8">Launch your operational dashboard.</p>
               <button className="w-full bg-white text-black py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-xl group-hover:scale-105 transition-all">Authenticate Session →</button>
            </div>

            <div 
              onClick={() => router.push("/boss/login")}
              className="group bg-black/40 border border-white/10 p-6 rounded-[2rem] hover:bg-black transition-all cursor-pointer text-center"
            >
               <h3 className="text-xl font-bold tracking-tight mb-1 text-white">Bloomgard Suite</h3>
               <p className="text-[9px] font-bold text-white/40 group-hover:text-white/60 transition-colors uppercase">Admin Identity Required</p>
            </div>
          </div>
        </div>
      )}

      {/* --- CONTACT MODAL --- */}
      {showContactModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/60 backdrop-blur-3xl animate-in fade-in duration-300">
          <button onClick={() => setShowContactModal(false)} className="absolute top-10 right-10 text-4xl text-white font-light hover:rotate-90 transition-all">✕</button>
          
          <div className="w-full max-w-md bg-white/10 border border-white/20 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl text-center animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6 shadow-inner border border-white/10">✉️</div>
            <h3 className="text-3xl font-bold tracking-tighter mb-2 text-white">Contact Sales</h3>
            <p className="text-white/60 font-medium mb-8 text-sm">Copy our email address below or open your web client directly.</p>

            <div className="bg-black/40 p-5 rounded-2xl border border-white/10 mb-8">
              <p className="text-sm font-bold text-white tracking-wider">bloomgarderp@gmail.com</p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleCopyEmail} 
                className="w-full bg-white text-black py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
              >
                {copied ? "✓ Copied to Clipboard" : "Copy Email Address"}
              </button>
              <a 
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=bloomgarderp@gmail.com&cc=anshag239@gmail.com&su=Bloomgard%20Enterprise%20Inquiry&body=${preWrittenBody}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-white/10 text-white border border-white/20 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all block text-center"
              >
                Open in Gmail Web
              </a>
            </div>
          </div>
        </div>
      )}

      <footer className="py-12 border-t border-white/10 text-center relative">
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em]">BLOOMGARD © 2026</p>
      </footer>
    </div>
  );
}

function BentoCard({ title, desc, icon }: any) {
  return (
    <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-10 rounded-[3rem] shadow-xl hover:shadow-2xl hover:bg-white/10 hover:scale-[1.02] transition-all duration-300 group flex flex-col h-full">
      <div className={`text-5xl mb-8 group-hover:scale-110 transition-transform origin-left inline-block drop-shadow-2xl`}>{icon}</div>
      <h4 className={`text-2xl font-bold mb-4 text-white tracking-tight`}>{title}</h4>
      <p className="text-white/60 text-base leading-relaxed font-medium">{desc}</p>
    </div>
  );
}