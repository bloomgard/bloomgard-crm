const fs = require('fs');

let content = fs.readFileSync('app/dashboard/ClientDashboard.tsx', 'utf-8');

// 1. Add import statement at the top
if (!content.includes('lucide-react')) {
  content = content.replace("import React, {", "import { AlertTriangle, Check, Menu, LayoutDashboard, Rocket, Inbox, Bell, Magnet, FileText, Settings, Bot, Zap, Download, Upload, Sparkles, Pen, Scroll, Database, Users, Wrench, Mail, Palette, X, ClipboardList, Monitor, Search, Star, Trash, Paperclip, Brain, Laptop, File } from 'lucide-react';\nimport React, {");
}

// 2. Replace plain text emojis with Lucide components or remove them from strings
content = content.replace(/alert\(`✅ /g, "alert(`");
content = content.replace(/alert\("✅ /g, 'alert("');
content = content.replace(/<span className="text-2xl">⚠️<\/span>/g, '<AlertTriangle className="w-6 h-6 text-amber-500" />');
content = content.replace(/<span className="text-amber-500">⚡<\/span>/g, '<Zap className="w-4 h-4 text-amber-500" />');
content = content.replace(/<span className="text-indigo-500">📥<\/span>/g, '<Download className="w-4 h-4 text-indigo-500" />');
content = content.replace(/<span className="text-blue-500">📤<\/span>/g, '<Upload className="w-4 h-4 text-blue-500" />');
content = content.replace(/<span className="text-4xl mb-4 block opacity-50">✨<\/span>/g, '<Sparkles className="w-10 h-10 mb-4 block opacity-50" />');
content = content.replace(/<span className="text-4xl mb-4 block opacity-50">📜<\/span>/g, '<Scroll className="w-10 h-10 mb-4 block opacity-50" />');
content = content.replace(/<span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">✨ AI Suggested Reply<\/span>/g, '<span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3 h-3" /> AI Suggested Reply</span>');

content = content.replace(/<span className="text-xl">🗄️<\/span>/g, '<Database className="w-5 h-5 text-blue-600" />');
content = content.replace(/<span className="text-xl">👥<\/span>/g, '<Users className="w-5 h-5 text-indigo-600" />');
content = content.replace(/<span className="text-xl">🏗️<\/span>/g, '<Wrench className="w-5 h-5 text-gray-200" />');
content = content.replace(/<span className="text-xl">✉️<\/span>/g, '<Mail className="w-5 h-5 text-emerald-600" />');
content = content.replace(/<span className="text-xl">✨<\/span>/g, '<Sparkles className="w-5 h-5 text-pink-600" />');
content = content.replace(/<span className="text-xl">🤖<\/span>/g, '<Bot className="w-5 h-5 text-amber-600" />');
content = content.replace(/<span className="text-xl">🎨<\/span>/g, '<Palette className="w-5 h-5 text-red-600" />');

content = content.replace(/<span className="text-2xl">✉️<\/span>/g, '<Mail className="w-6 h-6" />');
content = content.replace(/<span className="text-2xl">✨<\/span>/g, '<Sparkles className="w-6 h-6" />');
content = content.replace(/<span className="text-2xl">🤖<\/span>/g, '<Bot className="w-6 h-6" />');
content = content.replace(/<span className="text-2xl">🎨<\/span>/g, '<Palette className="w-6 h-6" />');
content = content.replace(/<span className="text-2xl">📝<\/span>/g, '<ClipboardList className="w-6 h-6" />');

content = content.replace(/<span className="text-5xl mb-4">🖥️<\/span>/g, '<Monitor className="w-12 h-12 mb-4" />');

content = content.replace(/<h2 className="text-3xl font-bold text-gray-900">🤖 Agent Fleet<\/h2>/g, '<h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3"><Bot className="w-8 h-8" /> Agent Fleet</h2>');
content = content.replace(/<span className="text-4xl mb-4 block opacity-50">🤖<\/span>/g, '<Bot className="w-10 h-10 mb-4 block opacity-50" />');
content = content.replace(/<span className="absolute left-3 top-1\/2 -translate-y-1\/2 text-gray-400">🔍<\/span>/g, '<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />');

content = content.replace(/{selectedInboxEmail\.is_starred \? '⭐' : '☆'}/g, '{selectedInboxEmail.is_starred ? <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> : <Star className="w-4 h-4 text-gray-400" />}');
content = content.replace(/{log\.is_starred \? '★' : '☆'}/g, '{log.is_starred ? <Star className="w-4 h-4 fill-amber-400 text-amber-400" /> : <Star className="w-4 h-4 text-gray-400" />}');

content = content.replace(/🗑️/g, '<Trash className="w-4 h-4" />');
content = content.replace(/>🗑</g, '><Trash className="w-4 h-4" /><');
content = content.replace(/>📎</g, '><Paperclip className="w-4 h-4" /><');

content = content.replace(/<span>🤖<\/span> Bloomgard AI Analysis/g, '<div className="flex items-center gap-2"><Bot className="w-4 h-4 text-indigo-600" /> <span className="font-bold text-indigo-600">Bloomgard AI Analysis</span></div>');
content = content.replace(/<span className="text-4xl">📥<\/span>/g, '<Download className="w-10 h-10 text-gray-400" />');

content = content.replace(/>✓ File Attached</g, '><Check className="w-3 h-3 inline mr-1" /> File Attached<');
content = content.replace(/>✓ File Secured</g, '><Check className="w-3 h-3 inline mr-1" /> File Secured<');
content = content.replace(/>✕</g, '><X className="w-4 h-4" /><');
content = content.replace(/>☰</g, '><Menu className="w-5 h-5" /><');

content = content.replace(/<div className="text-5xl mb-4">🧠<\/div>/g, '<div className="mb-4 flex justify-center"><Brain className="w-12 h-12 text-gray-400" /></div>');
content = content.replace(/>✎</g, '><Pen className="w-4 h-4" /><');
content = content.replace(/>✎ Edit</g, '><div className="flex items-center gap-1"><Pen className="w-3 h-3" /> Edit</div><');
content = content.replace(/🤖 Approve Agent/g, '<div className="flex items-center gap-2"><Bot className="w-4 h-4" /> Approve Agent</div>');

content = content.replace(/⚡ Convert to Quote/g, '<Zap className="w-4 h-4 inline mr-2" /> Convert to Quote');

content = content.replace(/📬 Original Lead Email/g, '<Mail className="w-4 h-4 inline mr-2 align-text-bottom" /> Original Lead Email');
content = content.replace(/🤖 AI Extracted Items/g, '<Bot className="w-4 h-4 inline mr-2 align-text-bottom" /> AI Extracted Items');

content = content.replace(/✨"}/g, '<Sparkles className="w-4 h-4 inline" />"}');
content = content.replace(/<span>💻<\/span> Upload from Device/g, '<div className="flex items-center justify-center gap-2"><Laptop className="w-4 h-4" /> Upload from Device</div>');
content = content.replace(/📄 Select CRM Document\.\.\./g, 'Select CRM Document...');


content = content.replace(/\['dashboard', '📊 Dashboard'\],/g, "['dashboard', <div key='dashboard' className='flex items-center gap-2'><LayoutDashboard className='w-4 h-4' /> Dashboard</div>],");
content = content.replace(/\['pipeline', '🚀 Quotes'\],/g, "['pipeline', <div key='pipeline' className='flex items-center gap-2'><Rocket className='w-4 h-4' /> Quotes</div>],");
content = content.replace(/\['inbox', '📬 Inbox'\],/g, "['inbox', <div key='inbox' className='flex items-center gap-2'><Inbox className='w-4 h-4' /> Inbox</div>],");
content = content.replace(/\['alerts', '🚨 Action Need'\],/g, "['alerts', <div key='alerts' className='flex items-center gap-2'><Bell className='w-4 h-4' /> Follow ups</div>],");
content = content.replace(/\['leadgen', '🧲 Lead Gen'\],/g, "['leadgen', <div key='leadgen' className='flex items-center gap-2'><Magnet className='w-4 h-4' /> Lead Gen</div>],");
content = content.replace(/\['docs', '📄 Docs'\],/g, "['docs', <div key='docs' className='flex items-center gap-2'><FileText className='w-4 h-4' /> Docs</div>],");
content = content.replace(/\['settings', '⚙️ Settings'\]/g, "['settings', <div key='settings' className='flex items-center gap-2'><Settings className='w-4 h-4' /> Settings</div>]");

content = content.replace(/>🤖 Bloomgard AI</g, '><Bot className="w-4 h-4 inline mr-2" /> Bloomgard AI<');
content = content.replace(/Action Needed/g, 'Follow ups');
content = content.replace(/Action Need/g, 'Follow ups');
content = content.replace(/🚨/g, '');

fs.writeFileSync('app/dashboard/ClientDashboard.tsx', content, 'utf-8');
console.log("Replaced emojis in ClientDashboard.tsx");
