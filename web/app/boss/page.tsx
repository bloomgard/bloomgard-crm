"use client";
// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

// <Flame className="w-5 h-5 inline text-orange-500" /> REFINED SCHEMA: Master Status and Attachments are now native components
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
  const [activeTab, setActiveTab] = useState<"users" | "billing">("users");
  const [currentTenantObj, setCurrentTenantObj] = useState<any>(null);

  const [schemaConfig, setSchemaConfig] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false); 
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  
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

  const handleCreateWorkspace = async (e: any) => {
    e.preventDefault();
    if (!newWorkspaceName || !newAdminEmail || !newAdminPassword) return alert("Fill all fields");

    const newId = crypto.randomUUID();
    const { error } = await supabase.from("tenants").insert([{ id: newId, company_name: newWorkspaceName, ai_enabled: false }]);
    if (!error) {
      await supabase.from("tenant_schemas").insert([{ 
        tenant_id: newId, 
        company_name: newWorkspaceName, 
        schema_config: DEFAULT_SCHEMA, 
        html_template: "" 
      }]);
      
      // Create admin user
      try {
        const res = await fetch('/api/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: newAdminEmail,
            password: newAdminPassword,
            role: 'admin',
            tenantId: newId
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to create user");
        }
        alert("Workspace & Admin User Created!");
        setShowCreateModal(false);
        setNewWorkspaceName("");
        setNewAdminEmail("");
        setNewAdminPassword("");
      } catch (err: any) {
        alert("Failed to create admin user: " + err.message);
      }

      await fetchTenants();
      loadTenantData(newId);
    } else {
      alert("Failed to create tenant: " + error.message);
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
    
    if (tenant) { 
      setCompanyName(tenant.company_name || ""); 
      setAiEnabled(!!tenant.ai_enabled); 
      
      // Fetch Live Usage Metrics
      const [quotesRes, emailsRes, tokensRes] = await Promise.all([
        supabase.from('quotations').select('*', { count: 'exact', head: true }).eq('tenant_id', tId),
        supabase.from('sent_emails').select('*', { count: 'exact', head: true }).eq('tenant_id', tId),
        supabase.from('tenant_token_usage').select('total_tokens').eq('tenant_id', tId)
      ]);

      const quotesCount = quotesRes.count || 0;
      const emailsCount = emailsRes.count || 0;
      const tokensSum = tokensRes.data?.reduce((acc, curr) => acc + (Number(curr.total_tokens) || 0), 0) || 0;

      setCurrentTenantObj({
        ...tenant,
        quotes_generated: quotesCount,
        emails_sent: emailsCount,
        ai_tokens_used: tokensSum,
        feature_flags: tenant.feature_flags || {
          ai_email: { enabled: false, billable: false },
          analytics: { enabled: false, billable: false },
          custom_branding: { enabled: false, billable: false },
        },
        billing_formula: tenant.billing_formula || "(quotes * 0.5) + (tokens * 0.001) + (emails * 0.1) + 50"
      });
    }
    if (schema) { setSchemaConfig(schema.schema_config || []); }
    const { data: users } = await supabase.from("profiles").select("*").eq("tenant_id", tId);
    setTenantUsers(users || []);
  }

  const handleAuth = async () => {
    if (!onboardEmail || !onboardPassword) return alert("Credentials required.");
    try {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: onboardEmail,
          password: onboardPassword,
          role: onboardRole,
          tenantId: selectedTenantId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create user");
      }
      
      setPasswordCache(prev => ({ ...prev, [onboardEmail]: onboardPassword }));
      alert(`<Check className="w-4 h-4 inline text-green-500" /> Success!\nEmail: ${onboardEmail}`);
      loadTenantData(selectedTenantId!);
      setOnboardEmail("");
      setOnboardPassword("");
    } catch (err: any) { alert("Auth Error: " + err.message); }
  };
  
  const syncMaster = async () => {
    if (!selectedTenantId) return;
    const { error: sErr } = await supabase.from("tenant_schemas").update({ schema_config: schemaConfig, company_name: companyName }).eq("tenant_id", selectedTenantId);
    
    const tenantUpdatePayload: any = { 
      company_name: companyName, 
      ai_enabled: aiEnabled 
    };
    if (currentTenantObj) {
      tenantUpdatePayload.feature_flags = currentTenantObj.feature_flags;
      tenantUpdatePayload.billing_formula = currentTenantObj.billing_formula;
    }
    
    const { error: tErr } = await supabase.from("tenants").update(tenantUpdatePayload).eq("id", selectedTenantId);
    
    if (sErr) alert("Schema Sync Error: " + sErr.message);
    if (tErr) alert("Tenant Sync Error: " + tErr.message);
    if (!sErr && !tErr) alert("Master System Synced.");
    
    await fetchTenants();
  };

  const updateFeatureFlag = (featureKey: string, flagType: 'enabled' | 'billable', value: boolean) => {
    if (!currentTenantObj) return;
    setCurrentTenantObj((prev: any) => ({
      ...prev,
      feature_flags: {
        ...prev.feature_flags,
        [featureKey]: {
          ...prev.feature_flags[featureKey],
          [flagType]: value
        }
      }
    }));
  };

  const calculateBill = () => {
    if (!currentTenantObj) return "Err";
    try {
      const formula = currentTenantObj.billing_formula || "0";
      const quotes = currentTenantObj.quotes_generated || 0;
      const tokens = currentTenantObj.ai_tokens_used || 0;
      const emails = currentTenantObj.emails_sent || 0;
      const base_fee = 0;

      const evalFunc = new Function("quotes", "tokens", "emails", "base_fee", `return ${formula};`);
      const result = evalFunc(quotes, tokens, emails, base_fee);
      
      if (isNaN(result)) return "Err";
      return `$${Number(result).toFixed(2)}`;
    } catch (e) {
      return "Err";
    }
  };

  if (loading) return <div className="p-20 text-center font-bold text-gray-400 animate-pulse uppercase tracking-widest">Booting Boss OS...</div>;

  return (
    <div className="flex min-h-screen bg-[#FBFBFB] font-sans text-black">
      <aside className="w-80 border-r bg-white fixed h-full z-50 flex flex-col shadow-sm">
        <div className="p-8 pb-4"><h1 className="text-4xl font-bold tracking-tighter">Bloomgard.</h1><p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-1">Boss Command</p></div>
        <div className="p-6 space-y-4">
          <button onClick={() => setShowCreateModal(true)} className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm shadow-md hover:scale-[1.02] transition-transform">+ New Workspace</button>
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

            <div className="flex gap-2 mb-10 bg-white p-1 rounded-xl border border-gray-100 w-fit shadow-sm overflow-x-auto">
              {["users", "billing"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-8 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab ? 'bg-black text-white shadow-md' : 'text-gray-400 hover:text-black'}`}>{tab === 'billing' ? 'BILLING & USAGE' : tab.toUpperCase()}</button>
              ))}
            </div>


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
            {activeTab === "billing" && currentTenantObj && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 p-8 rounded-3xl shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-gray-900 text-xl">Usage Metrics</h3>
                    <div className="text-2xl font-black text-indigo-600 bg-indigo-50 px-6 py-2 rounded-xl border border-indigo-100">
                      Bill: {calculateBill()}
                      <span className="text-[10px] text-gray-400 uppercase block text-right mt-1 font-semibold tracking-widest">/ Month</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quotes Generated</p>
                      <p className="text-3xl font-black text-gray-900">{currentTenantObj.quotes_generated || 0}</p>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Tokens Used</p>
                      <p className="text-3xl font-black text-gray-900">{currentTenantObj.ai_tokens_used || 0}</p>
                    </div>
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Emails Sent</p>
                      <p className="text-3xl font-black text-gray-900">{currentTenantObj.emails_sent || 0}</p>
                    </div>
                  </div>

                  <div className="mb-10">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">Feature Toggles</h3>
                    <div className="space-y-3">
                      {Object.keys(currentTenantObj.feature_flags || {}).map((featKey) => (
                        <div key={featKey} className="flex items-center gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100 w-fit">
                          <span className="w-32 uppercase font-bold text-xs tracking-wider">{featKey.replace("_", " ")}</span>
                          
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="accent-black w-4 h-4 cursor-pointer"
                              checked={currentTenantObj.feature_flags[featKey]?.enabled || false}
                              onChange={(e) => updateFeatureFlag(featKey, "enabled", e.target.checked)}
                            />
                            <span className="text-xs font-semibold text-gray-500 uppercase">Enable</span>
                          </label>
                          
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="accent-indigo-600 w-4 h-4 cursor-pointer"
                              checked={currentTenantObj.feature_flags[featKey]?.billable || false}
                              onChange={(e) => updateFeatureFlag(featKey, "billable", e.target.checked)}
                            />
                            <span className="text-xs font-semibold text-gray-500 uppercase">Billable</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-4">Dynamic Billing Formula</h3>
                    <div className="bg-gray-900 p-6 rounded-2xl shadow-inner">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Math Expression String</p>
                      <input
                        type="text"
                        className="w-full bg-transparent border-b border-gray-700 pb-2 text-sm font-mono text-indigo-400 outline-none focus:border-indigo-400 transition-colors"
                        value={currentTenantObj.billing_formula || ""}
                        onChange={(e) => setCurrentTenantObj({...currentTenantObj, billing_formula: e.target.value})}
                        placeholder="(quotes * 0.5) + (tokens * 0.001) + base_fee"
                      />
                      <p className="text-[10px] text-gray-500 font-mono mt-3">Available Variables: quotes, tokens, emails, base_fee</p>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        ) : <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-[3rem] bg-white/50 text-center p-10"><span className="text-4xl mb-4"><Building2 className="w-4 h-4 inline" /></span><p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Select a Workspace Engine from the sidebar to begin Administration.</p></div>}
      </main>

      {/* Modal for Creating Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-black"><X className="w-4 h-4" /></button>
            <h2 className="text-2xl font-bold mb-2">New Workspace</h2>
            <p className="text-sm text-gray-500 mb-8">Provision a new tenant environment and admin.</p>
            
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Workspace Name</label>
                <input required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" value={newWorkspaceName} onChange={e => setNewWorkspaceName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admin Email</label>
                <input required type="email" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="admin@acme.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admin Password</label>
                <input required type="password" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="••••••••" />
              </div>
              
              <button type="submit" className="w-full bg-black text-white font-bold py-4 rounded-xl mt-4 hover:bg-gray-800 transition-colors">
                Provision Environment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}