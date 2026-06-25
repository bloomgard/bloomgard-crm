// @ts-nocheck
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

// 🔥 REFINED SCHEMA: Master Status and Attachments are now native components
const DEFAULT_SCHEMA = [
  {
    title: "Client Information",
    allow_multiple: false,
    fields: [
      { label: "Client Name", name: "client_name", type: "text" },
      { label: "Contact Person", name: "contact_person", type: "text" },
      { label: "Email Address", name: "email_id", type: "text" },
      { label: "Phone Number", name: "phone_number", type: "text" },
      { label: "Billing Address", name: "billing_address", type: "text" },
      { label: "Created By", name: "created_by_email", type: "logged_in" }
    ]
  },
  {
    title: "Quote Details",
    allow_multiple: false,
    fields: [
      { label: "Pipeline Status", name: "status", type: "master_status", options: "Inquiry, Quotation Given, Approved, Lost" },
      { label: "Payment Terms", name: "payment_terms", type: "text" },
      { label: "Delivery Terms", name: "delivery_terms", type: "text" },
      { label: "Subtotal", name: "subtotal", type: "number" }
    ]
  },
  {
    title: "Products",
    allow_multiple: true,
    fields: [
      { label: "Item Name", name: "item_name", type: "text" },
      { label: "Item Code", name: "item_code", type: "text" },
      { label: "Quantity", name: "quantity", type: "number" },
      { label: "UOM", name: "uom", type: "dropdown", options: "SQM, KG, PCS, MTR" },
      { label: "Rate", name: "item_rate", type: "number" },
      { label: "Total", name: "item_br", type: "calculated", options: "{{quantity}} * {{item_rate}}" }
    ]
  },
  {
    title: "Official Documents",
    allow_multiple: true,
    fields: [
      { label: "File Name", name: "file_name", type: "text" },
      { label: "Upload Document", name: "file_path", type: "attachment" }
    ]
  }
];

export default function BossDashboard() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"blueprint" | "users" | "html">("blueprint");

  const [schemaConfig, setSchemaConfig] = useState<any[]>([]);
  const [htmlTemplate, setHtmlTemplate] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false); 
  
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardPassword, setOnboardPassword] = useState("");
  const [onboardRole, setOnboardRole] = useState("agent");
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [passwordCache, setPasswordCache] = useState<Record<string, string>>({});

  const [draggedSectionIdx, setDraggedSectionIdx] = useState<number | null>(null);
  const [draggedFieldInfo, setDraggedFieldInfo] = useState<{sIdx: number, fIdx: number} | null>(null);

  useEffect(() => { fetchTenants(); }, []);

  async function fetchTenants() {
    const { data } = await supabase.from("tenants").select("id, company_name");
    if (data) setTenants(data);
    setLoading(false);
  }

  const handleCreateWorkspace = async () => {
    const newId = crypto.randomUUID();
    const { error } = await supabase.from("tenants").insert([{ id: newId, company_name: "New Workspace", ai_enabled: false }]);
    if (!error) {
      await supabase.from("tenant_schemas").insert([{ 
        tenant_id: newId, 
        company_name: "New Workspace", 
        schema_config: DEFAULT_SCHEMA, 
        html_template: "" 
      }]);
      await fetchTenants();
      loadTenantData(newId);
    }
  };

  const handleTerminateClient = async () => {
    if (!selectedTenantId) return;
    const check = prompt(`Type "TERMINATE" to permanently wipe ${companyName}:`);
    if (check === "TERMINATE") {
      const { error } = await supabase.rpc('decommission_client_full', { target_tenant: selectedTenantId });
      if (error) return alert("Termination Failed: " + error.message);
      setSelectedTenantId(null);
      await fetchTenants();
      alert("Client Eradicated.");
    }
  };

  async function loadTenantData(tId: string) {
    setSelectedTenantId(tId);
    const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tId).maybeSingle();
    const { data: schema } = await supabase.from("tenant_schemas").select("*").eq("tenant_id", tId).maybeSingle();
    
    if (tenant) { setCompanyName(tenant.company_name || ""); setAiEnabled(!!tenant.ai_enabled); }
    if (schema) { setSchemaConfig(schema.schema_config || []); setHtmlTemplate(schema.html_template || ""); }
    const { data: users } = await supabase.from("profiles").select("*").eq("tenant_id", tId);
    setTenantUsers(users || []);
  }

  const handleAuth = async () => {
    if (!onboardEmail || !onboardPassword) return alert("Credentials required.");
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: onboardEmail, password: onboardPassword });
      if (authError && authError.message !== "User already registered") throw authError;
      
      const userId = authData?.user?.id;
      if (!userId) throw new Error("Could not retrieve User ID.");

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ email: onboardEmail, tenant_id: selectedTenantId, role: onboardRole })
        .eq("id", userId);
      
      if (pErr) throw pErr;
      
      setPasswordCache(prev => ({ ...prev, [onboardEmail]: onboardPassword }));
      alert(`✅ Success!\nEmail: ${onboardEmail}`);
      loadTenantData(selectedTenantId!);
      setOnboardEmail("");
      setOnboardPassword("");
    } catch (err: any) { alert("Auth Error: " + err.message); }
  };
  
  const syncMaster = async () => {
    if (!selectedTenantId) return;
    const { error: sErr } = await supabase.from("tenant_schemas").update({ schema_config: schemaConfig, html_template: htmlTemplate, company_name: companyName }).eq("tenant_id", selectedTenantId);
    const { error: tErr } = await supabase.from("tenants").update({ company_name: companyName, ai_enabled: aiEnabled }).eq("id", selectedTenantId);
    if (!sErr && !tErr) alert("✅ Master System Synced.");
    await fetchTenants();
  };

  if (loading) return <div className="p-20 text-center font-bold text-gray-400 animate-pulse uppercase tracking-widest">Booting Boss OS...</div>;

  return (
    <div className="flex min-h-screen bg-[#FBFBFB] font-sans text-black">
      <aside className="w-80 border-r bg-white fixed h-full z-50 flex flex-col shadow-sm">
        <div className="p-8 pb-4"><h1 className="text-4xl font-bold tracking-tighter">Bloomgard.</h1><p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-1">Boss Command</p></div>
        <div className="p-6 space-y-4">
          <button onClick={handleCreateWorkspace} className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md hover:scale-[1.02] transition-transform">+ New Workspace</button>
          <input placeholder="Search records..." className="w-full bg-gray-50 border border-transparent focus:border-gray-200 px-4 py-3 rounded-xl text-sm outline-none" onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <nav className="flex-1 overflow-y-auto px-4 space-y-2">
          {tenants.filter(t => (t.company_name || "").toLowerCase().includes(searchTerm.toLowerCase())).map(t => (
            <div key={t.id} onClick={() => loadTenantData(t.id)} className={`p-4 rounded-xl cursor-pointer transition-all ${selectedTenantId === t.id ? 'bg-black text-white shadow-lg' : 'hover:bg-gray-50 text-gray-500'}`}>
              <p className="text-sm font-bold truncate">{t.company_name}</p>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 ml-80 p-12">
        {selectedTenantId ? (
          <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
              <div className="flex-1 mr-8">
                <input className="text-4xl font-bold outline-none bg-transparent border-b-2 border-transparent focus:border-gray-100 w-full pb-2 transition-all" value={companyName} onChange={e => setCompanyName(e.target.value)} />
                <div className="flex items-center gap-4 mt-4">
                  <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-200 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                    <input type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)} className="accent-indigo-600" />
                    <span className={aiEnabled ? "text-indigo-600" : "text-gray-400"}>AI Premium {aiEnabled ? "Active" : "Disabled"}</span>
                  </label>
                  <button onClick={handleTerminateClient} className="text-red-400 font-bold text-[10px] uppercase tracking-widest hover:text-red-600 transition-colors">Terminate Workspace</button>
                </div>
              </div>
              <button onClick={syncMaster} className="bg-black text-white px-10 py-4 rounded-2xl font-bold shadow-2xl hover:bg-gray-800 transition-all">Sync Master</button>
            </header>

            <div className="flex gap-2 mb-10 bg-white p-1 rounded-xl border border-gray-100 w-fit shadow-sm">
              {["blueprint", "users", "html"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-8 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-black text-white shadow-md' : 'text-gray-400 hover:text-black'}`}>{tab.toUpperCase()}</button>
              ))}
            </div>

            {activeTab === "blueprint" && (
              <div className="space-y-6">
                {schemaConfig.map((section, sIdx) => (
                  <div key={`s-${sIdx}`} draggable onDragStart={() => setDraggedSectionIdx(sIdx)} onDragOver={e => e.preventDefault()} onDrop={() => {
                    const nc = [...schemaConfig]; const [m] = nc.splice(draggedSectionIdx!, 1); nc.splice(sIdx, 0, m); setSchemaConfig(nc); setDraggedSectionIdx(null);
                  }} className={`bg-white border border-gray-200 p-8 rounded-3xl relative shadow-sm group transition-all ${draggedSectionIdx === sIdx ? 'opacity-50 border-dashed' : ''}`}>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab text-gray-300 hover:text-black text-2xl transition-all">≡</div>
                    <div className="flex justify-between items-center mb-6">
                      <input className="text-xl font-bold outline-none bg-transparent w-1/2 border-b border-transparent focus:border-gray-200 pb-1" value={section.title} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].title = e.target.value; setSchemaConfig(nc); }} />
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer">
                          <input type="checkbox" checked={section.allow_multiple} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].allow_multiple = e.target.checked; setSchemaConfig(nc); }} className="accent-black w-3.5 h-3.5" />
                          Allow Multiple Rows
                        </label>
                        <button onClick={() => { const nc = [...schemaConfig]; nc.splice(sIdx, 1); setSchemaConfig(nc); }} className="text-red-400 hover:text-red-600 font-bold text-xs transition-colors">Delete</button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {section.fields?.map((f: any, fIdx: number) => (
                        <div key={`f-${fIdx}`} draggable onDragStart={(e) => { e.stopPropagation(); setDraggedFieldInfo({sIdx, fIdx}); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (!draggedFieldInfo || draggedFieldInfo.sIdx !== sIdx) return;
                            const nc = [...schemaConfig]; const [m] = nc[sIdx].fields.splice(draggedFieldInfo.fIdx, 1); nc[sIdx].fields.splice(fIdx, 0, m); setSchemaConfig(nc); setDraggedFieldInfo(null);
                          }} className="grid grid-cols-12 gap-4 bg-gray-50 p-4 rounded-2xl items-center border border-transparent hover:border-gray-200 transition-colors">
                          <div className="col-span-1 text-gray-300 hover:text-black cursor-grab text-center text-lg">≡</div>
                          <input placeholder="Label" className="col-span-3 bg-transparent font-bold text-sm outline-none" value={f.label} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].fields[fIdx].label = e.target.value; setSchemaConfig(nc); }} />
                          <input placeholder="db_key" className="col-span-2 font-mono text-xs outline-none bg-transparent text-blue-600" value={f.name} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].fields[fIdx].name = e.target.value; setSchemaConfig(nc); }} />
                          
                          <select className="col-span-2 text-xs font-bold bg-white border border-gray-200 rounded-lg p-2 outline-none" value={f.type} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].fields[fIdx].type = e.target.value; setSchemaConfig(nc); }}>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="dropdown">Dropdown</option>
                            <option value="master_status">Master Status</option>
                            <option value="attachment">Attachment</option>
                            <option value="calculated">Formula</option>
                            <option value="logged_in">Logged In User</option>
                          </select>
                          
                          <input placeholder={f.type === 'calculated' ? "e.g. SUM[Products.item_br]" : f.type === 'master_status' ? "Inquiry, Approved..." : "Options..."} className="col-span-3 bg-white border border-gray-200 text-xs p-2 rounded-lg outline-none disabled:opacity-50" value={f.options || ""} onChange={e => { const nc = [...schemaConfig]; nc[sIdx].fields[fIdx].options = e.target.value; setSchemaConfig(nc); }} disabled={f.type !== "dropdown" && f.type !== "calculated" && f.type !== "master_status"} />
                          
                          <button onClick={() => { const nc = [...schemaConfig]; nc[sIdx].fields.splice(fIdx, 1); setSchemaConfig(nc); }} className="col-span-1 text-red-300 hover:text-red-500 font-bold text-right pr-2">✕</button>
                        </div>
                      ))}
                      <button onClick={() => { const nc = [...schemaConfig]; nc[sIdx].fields.push({ label: "", name: "", type: "text" }); setSchemaConfig(nc); }} className="text-[10px] font-black uppercase text-blue-600 tracking-widest mt-4 ml-4 hover:text-blue-800">+ Add Field</button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setSchemaConfig([...schemaConfig, { title: "New Section", fields: [], allow_multiple: false }])} className="w-full py-8 border-2 border-dashed border-gray-200 rounded-3xl text-gray-300 font-bold uppercase tracking-widest text-xs hover:border-black hover:text-black transition-all">+ Create New Module</button>
              </div>
            )}

            {activeTab === "users" && (
              <div className="bg-white border border-gray-200 p-10 rounded-3xl shadow-sm">
                <div className="flex flex-col md:flex-row gap-4 mb-10 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <input placeholder="Email" className="flex-1 bg-white border border-gray-200 p-3.5 rounded-xl text-sm outline-none" value={onboardEmail} onChange={e => setOnboardEmail(e.target.value)} />
                  <input placeholder="Password" type="text" className="flex-1 bg-white border border-gray-200 p-3.5 rounded-xl text-sm outline-none" value={onboardPassword} onChange={e => setOnboardPassword(e.target.value)} />
                  <select className="bg-white border border-gray-200 px-4 py-3.5 rounded-xl font-bold text-xs uppercase" value={onboardRole} onChange={e => setOnboardRole(e.target.value)}>
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleAuth} className="bg-black text-white px-8 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-800 transition-colors">Authorize</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tenantUsers.map(u => (
                    <div key={u.id} className="p-6 border border-gray-100 bg-gray-50/50 rounded-2xl flex justify-between items-center group hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all">
                      <div>
                        <p className="font-bold text-sm text-gray-800">{u.email}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-400'}`}>{u.role}</span>
                          <button onClick={() => { 
                             const p = passwordCache[u.email]; 
                             if(p) { navigator.clipboard.writeText(p); alert("Copied!"); } 
                             else alert("Not in session. Reset user to change pass.");
                           }} className="text-[10px] font-bold text-blue-600 hover:underline">Copy Password</button>
                        </div>
                      </div>
                      <button onClick={async () => { if(confirm("Revoke Access?")) { await supabase.rpc('decommission_employee', { target_email: u.email }); loadTenantData(selectedTenantId!); } }} className="text-red-400 hover:text-red-600 font-bold text-xs transition-colors">Revoke</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "html" && (
              <div className="space-y-6">
                <div className="flex justify-between items-center bg-white p-6 border border-gray-200 rounded-3xl shadow-sm">
                  <div><h3 className="font-bold text-gray-900">Live Document Engine</h3><p className="text-[10px] uppercase tracking-widest text-gray-400 mt-1">Paste your pure HTML template below.</p></div>
                  <button onClick={syncMaster} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-indigo-500 transition-colors">Lock & Sync</button>
                </div>
                <div className="flex flex-col lg:flex-row gap-6 h-[800px]">
                  <div className="flex-1 bg-gray-900 rounded-3xl overflow-hidden flex flex-col shadow-inner">
                    <div className="bg-gray-950 px-6 py-4 border-b border-gray-800 flex justify-between items-center"><span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Source Code</span><span className="text-[10px] font-black text-indigo-400">{'{{db_key}}'} Supported</span></div>
                    <textarea className="w-full flex-1 bg-transparent text-gray-300 font-mono text-[11px] p-6 outline-none resize-none leading-relaxed" value={htmlTemplate} onChange={e => setHtmlTemplate(e.target.value)} spellCheck={false} placeholder="" />
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-3xl border-4 border-dashed border-gray-200 flex flex-col items-center p-8 overflow-y-auto">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6">A4 Live Preview</span>
                    {htmlTemplate ? (
                      <div className="shadow-2xl bg-white shrink-0 overflow-hidden origin-top" style={{ width: '794px', height: '1123px', transform: 'scale(0.7)', marginBottom: '-300px' }}><iframe srcDoc={htmlTemplate} className="w-full h-full border-none pointer-events-none" title="Live Preview"/></div>
                    ) : (<div className="flex flex-col items-center justify-center text-gray-400 mt-40"><span className="text-5xl mb-4">🖥️</span><p className="font-bold uppercase tracking-widest text-xs text-center max-w-xs">Write or paste your code on the left to see the live rendering here.</p></div>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-[3rem] bg-white/50 text-center p-10"><span className="text-4xl mb-4">🏢</span><p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Select a Workspace Engine from the sidebar to begin Administration.</p></div>}
      </main>
    </div>
  );
}