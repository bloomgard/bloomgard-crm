"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BloomgardLanding() {
  const router = useRouter();
  const [showPortal, setShowPortal] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Modal State for Contact Sales
  const [showContactModal, setShowContactModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // 👇 THIS IS THE MOBILE APP DETECTOR 👇
  useEffect(() => {
    const isMobileApp = typeof window !== 'undefined' && 
      (window.location.href.includes('localhost') || window.origin.includes('capacitor'));
    
    if (isMobileApp) {
      router.replace("/login"); // Instantly forces mobile app to jump to login
    }
  }, [router]);
  // 👆 END OF MOBILE APP DETECTOR 👆

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

  // Pre-written email template encoded for the URL
  const preWrittenBody = "Hello%20Bloomgard%20Team%2C%0A%0AI%20am%20interested%20in%20upgrading%20my%20operational%20infrastructure.%20Please%20reach%20out%20to%20discuss%20implementation%20and%20details.%0A%0AThank%20you%2C%0A%5BYour%20Name%5D";

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white scroll-smooth overflow-x-hidden">
      
      {/* --- NAV --- */}
      <nav className={`fixed top-0 w-full z-[100] px-10 py-5 flex justify-between items-center transition-all duration-500 ${scrolled ? "bg-white/80 backdrop-blur-xl border-b border-gray-100 py-4" : "bg-transparent"}`}>
        <h1 className="text-4xl font-bold tracking-tighter">Bloomgard.</h1>
        <div className="hidden md:flex gap-12 items-center">
          <a href="#engine" className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-black transition-colors">Engine</a>
          <a href="#specs" className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-black transition-colors">Specs</a>
          <a href="#pricing" className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-black transition-colors">Pricing</a>
          <button 
            onClick={() => setShowPortal(true)}
            className="bg-black text-white px-8 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-2xl"
          >
            Log in
          </button>
        </div>
      </nav>

      {/* --- HERO --- */}
      <section className="relative h-screen flex flex-col items-center justify-center text-center px-6">
        <div className="animate-in fade-in zoom-in duration-1000">
          <h2 className="text-[14vw] md:text-[9rem] font-bold tracking-tighter leading-[0.8] mb-10">
            Engineered <br /> for Impact.
          </h2>
          <p className="max-w-2xl mx-auto text-gray-400 font-medium text-xl md:text-2xl mb-12">
            The next-generation CRM infrastructure. Modular blueprints. <br className="hidden md:block" /> 
            Accelerated by <span className="text-black font-bold">Bloomgard AI.</span>
          </p>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <button onClick={() => setShowPortal(true)} className="bg-black text-white px-12 py-5 rounded-2xl font-bold text-lg shadow-2xl hover:bg-gray-800 transition-all">Log In</button>
            <a href="#pricing" className="text-sm font-bold border-b-2 border-black pb-1 hover:opacity-50 transition-all">Compare Systems →</a>
          </div>
        </div>
      </section>

      {/* --- BENTO SPECS --- */}
      <section id="specs" className="py-32 px-10 max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h3 className="text-5xl font-bold tracking-tighter uppercase">Technical Specifications.</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <BentoCard title="Modular Schemas" desc="Architect custom blueprints. Adaptable to every industrial niche from logistics to porcelain." icon="📐" />
          <BentoCard title="Fleet Visibility" desc="Real-time telemetry of agent performance. Track volume and conversion at 60fps." icon="👑" />
          <BentoCard title="Neural Pipeline" desc="AI-driven analysis. Bloomgard AI identifies patterns in your quotes that humans miss." icon="🧠" color="text-indigo-600" />
          <BentoCard title="Hardened Core" desc="Isolated tenant infrastructure. Your enterprise vault is encrypted and air-gapped." icon="🛡️" />
        </div>
      </section>

      {/* --- PRICING COMPARISON --- */}
      <section id="pricing" className="py-32 px-10 bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h3 className="text-5xl font-bold tracking-tighter">System Comparison.</h3>
            <p className="text-gray-400 font-medium mt-4">Choose your level of operational intensity.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* STANDARD PLAN */}
            <div className="bg-white p-12 rounded-[3rem] border border-gray-200 shadow-sm flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Mechanical Baseline</span>
              <p className="text-5xl font-bold mt-4 mb-8">Standard</p>
              
              <ul className="flex-1 space-y-5 text-sm font-semibold text-gray-600 border-t border-gray-50 pt-8">
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Unlimited PDF Manifest Generation</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Global Pipeline Tracking</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Custom Schema Blueprints</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Multi-Agent Telemetry Dashboards</li>
                <li className="flex items-center gap-3 text-gray-300 line-through"><div className="w-1.5 h-1.5 bg-gray-200 rounded-full"></div>Bloomgard AI Data Copilot</li>
              </ul>
              <button onClick={() => setShowContactModal(true)} className="mt-12 w-full py-4 rounded-2xl bg-gray-100 text-black font-bold uppercase tracking-widest text-[10px] hover:bg-black hover:text-white transition-all">Contact Sales</button>
            </div>

            {/* BLOOMGARD AI PLAN */}
            <div className="bg-white p-12 rounded-[3rem] border-2 border-black shadow-2xl flex flex-col relative scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">Maximum Performance</div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Cognitive Enhancement</span>
              <p className="text-5xl font-bold tracking-tighter mt-4 mb-8">Bloomgard AI</p>
              
              <ul className="flex-1 space-y-5 text-sm font-bold text-gray-900 border-t border-gray-50 pt-8">
                <li className="flex items-center gap-3"><div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>Integrated Bloomgard AI Copilot</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Predictive Pipeline Analytics</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Full-Page Data Intelligence Studio</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Natural Language Query Support</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Priority Server Routing</li>
                <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 bg-black rounded-full"></div>Includes all Standard features</li>
              </ul>
              <button onClick={() => setShowContactModal(true)} className="mt-12 w-full py-4 rounded-2xl bg-black text-white font-bold uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-xl">Contact Sales</button>
            </div>
          </div>
        </div>
      </section>

      {/* --- PORTAL MODAL --- */}
      {showPortal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-white/95 backdrop-blur-3xl animate-in fade-in duration-300">
          <button onClick={() => setShowPortal(false)} className="absolute top-10 right-10 text-3xl font-light hover:rotate-90 transition-all">✕</button>
          
          <div className="w-full max-w-lg space-y-6 animate-in zoom-in-95 duration-500">
            <div 
              onClick={() => router.push("/login")}
              className="group bg-white border border-gray-100 p-12 rounded-[3.5rem] shadow-2xl hover:scale-[1.02] transition-all cursor-pointer text-center"
            >
               <span className="text-4xl mb-6 block"></span>
               <h3 className="text-4xl font-bold tracking-tighter mb-4">Client Portal</h3>
               <p className="text-gray-500 font-medium mb-8">Launch your operational dashboard.</p>
               <button className="w-full bg-black text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest">Authenticate Session →</button>
            </div>

            <div 
              onClick={() => router.push("/boss/login")}
              className="group bg-gray-200 border border-gray-100 p-6 rounded-[2rem] hover:bg-black hover:text-white transition-all cursor-pointer text-center"
            >
               <h3 className="text-xl font-bold tracking-tight mb-1">Bloomgard Suite</h3>
               <p className="text-[9px] font-bold text-gray-400 group-hover:text-gray-500 transition-colors uppercase">Admin Identity Required</p>
            </div>
          </div>
        </div>
      )}

      {/* --- CONTACT MODAL --- */}
      {showContactModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-white/95 backdrop-blur-3xl animate-in fade-in duration-300">
          <button onClick={() => setShowContactModal(false)} className="absolute top-10 right-10 text-3xl font-light hover:rotate-90 transition-all">✕</button>
          
          <div className="w-full max-w-md bg-white border border-gray-100 p-10 rounded-[3rem] shadow-2xl text-center animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-6 shadow-inner">✉️</div>
            <h3 className="text-3xl font-bold tracking-tighter mb-2">Contact Sales</h3>
            <p className="text-gray-500 font-medium mb-8 text-sm">Copy our email address below or open your web client directly.</p>

            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 mb-8">
              <p className="text-sm font-bold text-gray-900">bloomgarderp@gmail.com</p>
              
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleCopyEmail} 
                className="w-full bg-black text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl"
              >
                {copied ? "✓ Copied to Clipboard" : "Copy Email Address"}
              </button>
              <a 
                href={`https://mail.google.com/mail/?view=cm&fs=1&to=bloomgarderp@gmail.com&cc=anshag239@gmail.com&su=Bloomgard%20Enterprise%20Inquiry&body=${preWrittenBody}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full bg-gray-100 text-black py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all block text-center"
              >
                Open in Gmail Web
              </a>
            </div>
          </div>
        </div>
      )}

      <footer className="py-12 border-t border-gray-50 text-center">
        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.5em]">BLOOMGARD © 2026</p>
      </footer>
    </div>
  );
}

function BentoCard({ title, desc, icon, color = "text-black" }: any) {
  return (
    <div className="bg-white border border-gray-100 p-10 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group">
      <div className={`text-4xl mb-6 group-hover:scale-110 transition-transform inline-block ${color}`}>{icon}</div>
      <h4 className={`text-xl font-bold mb-3 ${color} tracking-tight`}>{title}</h4>
      <p className="text-gray-500 text-sm leading-relaxed font-medium">{desc}</p>
    </div>
  );
}