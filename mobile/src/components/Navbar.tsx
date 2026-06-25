"use client";
import Link from "next/link";

export default function Navbar({ type }: { type: "BOSS" | "CLIENT" }) {
  return (
    <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center border-b border-[#111] bg-black/50 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xl font-black tracking-tighter hover:text-cyan-400 transition-colors">
          BLOOMGARD<span className="text-cyan-500">.</span>
        </Link>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-gray-800 text-gray-500 uppercase tracking-widest">
          {type}
        </span>
      </div>
      
      <div className="flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] text-gray-500">
        <Link href={type === "BOSS" ? "/boss" : "/"} className="hover:text-white transition-colors">DASHBOARD</Link>
        <Link href="#" className="hover:text-white transition-colors">REPORTS</Link>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-800 to-gray-600 border border-gray-700 cursor-pointer" />
      </div>
    </nav>
  );
}