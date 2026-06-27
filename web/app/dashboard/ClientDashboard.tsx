
// @ts-nocheck
"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/utils/supabaseClient";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LineChart, Line, AreaChart, Area, CartesianGrid } from "recharts";
import Handlebars from "handlebars";

// BULLETPROOF FORMATTER
const formatValue = (val, isMoney = false) => {
  if (val == null || val === "") return val;
  if (isMoney && !isNaN(parseFloat(val))) return parseFloat(val).toFixed(2);
  let strVal = String(val);
  if (/\.\d{3,}/.test(strVal)) {
    if (!isNaN(parseFloat(strVal))) return parseFloat(strVal).toFixed(2);
    return strVal.replace(/(\d+\.\d{2})\d{3,}/g, '$1');
  }
  return val;
};

const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  client_name: ['company_name', 'client', 'customer_name'],
  contact_person: ['contact', 'person'],
  email_id: ['email', 'client_email', 'email_address'],
  phone_number: ['phone', 'client_phone', 'contact_number', 'mobile'],
  billing_address: ['address', 'client_address', 'shipping_address'],
  subtotal: ['total_value', 'ta', 'total_amount', 'total'],
  freight: ['delivery_terms', 'freight_terms'],
  source_ref: ['reference', 'source', 'lead_source'], 
  item_name: ['name', 'product_name', 'product', 'description'],
  item_code: ['code', 'hsn'],
  quantity: ['qty'],
  item_rate: ['rate', 'price'],
  item_br: ['total', 'basic_rate', 'amount', 'line_total'],
  file_name: ['filename', 'name', 'title'],
  file_path: ['filepath', 'url', 'link', 'attachment']
};

export default function ClientDashboard() {
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const [authState, setAuthState] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [blueprint, setBlueprint] = useState([]);
  const [agents, setAgents] = useState([]);
  const [editingAgent, setEditingAgent] = useState(null);
  const [isSavingAgent, setIsSavingAgent] = useState(false);
  const [isRunningCoordinator, setIsRunningCoordinator] = useState(false);
  const [records, setRecords] = useState([]);
  const [currentView, setCurrentView] = useState("alerts"); // Default to Alerts for testing
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [customSender, setCustomSender] = useState("");
  const [aiSettings, setAiSettings] = useState({ tone: 'Professional', englishLevel: 'Native', desperation: 'Low' });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null); // Track AI Agent dispatch
  
  const [emailDraft, setEmailDraft] = useState({ to: "", subject: "", message: "", attachmentBase64: "", filename: "" });
  const [chatHistory, setChatHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [dashCommand, setDashCommand] = useState("");
  const [isBuildingDash, setIsBuildingDash] = useState(false);
  const [dynamicInsights, setDynamicInsights] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const [qn, setQn] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dynamicData, setDynamicData] = useState({});
  const [statusFilter, setStatusFilter] = useState("");
  const [editedSnippets, setEditedSnippets] = useState({});
  const [userPreferences, setUserPreferences] = useState({ theme: 'light', wallpaper: 'legacy' });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [agentQuoteSearch, setAgentQuoteSearch] = useState("");
  const [selectedAgentView, setSelectedAgentView] = useState(null);
  const [agentViewTab, setAgentViewTab] = useState('due');
  const [triageTab, setTriageTab] = useState('due');
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  const getApiUrl = (endpoint) => endpoint;

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isThinking]);

  useEffect(() => {
    async function initSystem() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setAuthState('unauthed'); setLoading(false); window.location.replace("/"); return; }

        const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        if (profileErr || !profile) { setAuthState('unauthed'); setLoading(false); window.location.replace("/"); return; }

        const fullUser = { ...profile, email: session.user.email };
        setUser(fullUser);
        setAuthState('authed');
        
        let prefs = { theme: 'light', wallpaper: 'legacy' };
        if (profile.custom_metadata?.preferences) {
           prefs = profile.custom_metadata.preferences;
        } else {
           const localPrefs = localStorage.getItem('userPrefs_' + profile.id);
           if (localPrefs) {
             try { prefs = JSON.parse(localPrefs); } catch(e) {}
           }
        }
        setUserPreferences(prefs);

        if (profile.tenant_id) {
          setTenantId(profile.tenant_id);

          const { data: tenantData } = await supabase.from("tenants").select("company_name, ai_enabled, custom_email_sender").eq("id", profile.tenant_id).maybeSingle();
          if (tenantData) {
            if (tenantData.company_name) setCompanyName(tenantData.company_name);
            if (tenantData.ai_enabled === false) setAiEnabled(false);
            if (tenantData.custom_email_sender) setCustomSender(tenantData.custom_email_sender);
          }

          const { data: schema } = await supabase.from("tenant_schemas").select("schema_config").eq("tenant_id", profile.tenant_id).maybeSingle();
          if (schema?.schema_config) {
            const agentConfig = schema.schema_config.find(s => s.is_agent_config);
            if (agentConfig) setAgents(agentConfig.agents || []);
            const aiSettingsConfig = schema.schema_config.find(s => s.is_ai_settings);
            if (aiSettingsConfig) setAiSettings({ tone: aiSettingsConfig.tone || 'Professional', englishLevel: aiSettingsConfig.englishLevel || 'Native', desperation: aiSettingsConfig.desperation || 'Low' });
            const actualBlueprint = schema.schema_config.filter(s => !s.is_agent_config && !s.is_ai_settings);
            setBlueprint(actualBlueprint);
            const init = {};
            actualBlueprint.forEach(s => { init[s.title] = s.allow_multiple ? [{}] : {}; });
            setDynamicData(init);
          }
          await fetchRecords(profile.tenant_id);
        }
      } catch (err) {
        console.error("Boot Error:", err);
        setAuthState('authed'); 
      } finally {
        setLoading(false);
      }
    }
    initSystem();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("ai_insights").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setDynamicInsights(data); });
  }, [tenantId]);

  useEffect(() => {
    if (!blueprint.length) return;
    let updated = false;
    const newData = JSON.parse(JSON.stringify(dynamicData));
    blueprint.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'logged_in') {
          if (section.allow_multiple && newData[section.title]) {
            newData[section.title].forEach((row, rIdx) => {
              if (row[field.name] !== user?.email) { newData[section.title][rIdx][field.name] = user?.email; updated = true; }
            });
          } else if (newData[section.title]) {
            if (newData[section.title][field.name] !== user?.email) { newData[section.title][field.name] = user?.email; updated = true; }
          }
        }
        if (field.type === 'calculated' && field.options) {
          const processCross = (f) => {
            const ms = f.match(/SUM\[(.*?)\.(.*?)\]/g);
            if (ms) ms.forEach(m => { 
              const p = m.match(/SUM\[(.*?)\.(.*?)\]/); 
              if (p) { 
                const s = (newData[p[1]]||[]).reduce((a,r)=>a+(Number(r[p[2]])||0),0); 
                f=f.replace(m, String(s.toFixed(2))); 
              } 
            });
            return f;
          };
          if (section.allow_multiple && newData[section.title]) {
            newData[section.title].forEach((row,rIdx)=>{
              let f=processCross(field.options);
              section.fields.forEach(sf=>{f=f.replace(new RegExp(`{{${sf.name}}}`,'g'),Number(row[sf.name])||0);});
              try{
                let r=new Function('return '+f)();
                if (typeof r === 'number') r = parseFloat(r.toFixed(2));
                if(row[field.name]!==r){newData[section.title][rIdx][field.name]=r;updated=true;}
              }catch(e){}
            });
          } else if (newData[section.title]) {
            let f=processCross(field.options);
            section.fields.forEach(sf=>{f=f.replace(new RegExp(`{{${sf.name}}}`,'g'),Number(newData[section.title][sf.name])||0);});
            try{
              let r=new Function('return '+f)();
              if (typeof r === 'number') r = parseFloat(r.toFixed(2)); 
              if(newData[section.title][field.name]!==r){newData[section.title][field.name]=r;updated=true;}
            }catch(e){}
          }
        }
      });
    });
    if (updated) setDynamicData(newData);
  }, [dynamicData, blueprint, user]);

  async function fetchRecords(tId) {
    try {
      const { data, error } = await supabase
        .from("quotations")
        .select(`*, clients (*), quotation_items (*), quotation_attachments (*), status_logs (*)`)
        .eq("tenant_id", tId)
        .order("qn_number", { ascending: false });

      if (!error && data) {
        const parsed = data.map(r => {
          let m = r.custom_metadata;
          if (typeof m === 'string') { try { m = JSON.parse(m); } catch(e) { m = {}; } }
          return { ...r, custom_metadata: m };
        });
        setRecords(parsed);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }
  }

  const isManager = user?.role?.toLowerCase() === 'manager' || user?.role?.toLowerCase() === 'admin';
  const visibleRecords = isManager ? records : records.filter(r => r.created_by_email === user?.email);
  const docsRecords = visibleRecords.filter(r => r.status === 'Approved' || r.custom_metadata?.has_pdf_generated === true);

  // DERIVED STATE: AI Alerts Triage
  const pendingAlerts = visibleRecords.filter(r => {
    // Flag quotes that haven't been dispatched yet
    if (r.follow_up_status === 'Agent Dispatched' || r.custom_metadata?.follow_up_status === 'Agent Dispatched') return false;
    // Don't flag quotes that are already Approved or Lost
    if (r.status === 'Approved' || r.status === 'Lost') return false;

    const dueDate = r.follow_up_due_date || r.custom_metadata?.follow_up_due_date;
    if (!dueDate) {
      const createdDate = new Date(r.created_at || r.date || Date.now());
      const daysOld = (new Date() - createdDate) / (1000 * 60 * 60 * 24);
      return daysOld >= 3;
    }

    // Check if the due date is today or in the past
    return new Date(dueDate) <= new Date();
  });

  const historyAlerts = visibleRecords.filter(r => {
    return r.follow_up_status != null || r.custom_metadata?.follow_up_status != null;
  });

  const extractMasterStatuses = () => {
    let options = new Set();
    blueprint.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'master_status' && field.options) {
          field.options.split(',').forEach(opt => options.add(opt.trim()));
        }
      });
    });
    records.forEach(r => { if (r.status) options.add(r.status); });
    if (options.size === 0) { options.add("Inquiry"); options.add("Approved"); options.add("Lost"); }
    return Array.from(options);
  };
  
  const allStatuses = extractMasterStatuses();

  useEffect(() => {
    if (!statusFilter && allStatuses.length > 0) {
      setStatusFilter(allStatuses[0]);
    }
  }, [allStatuses, statusFilter]);

  const tableColumns = [
    { label: "Client Name", name: "client_name" },
    { label: "Contact Person", name: "contact_person" },
    { label: "Amount", name: "subtotal",sectionTitle: "Quote Details" }
  ];

  const extractValue = (record, fieldName, sectionTitle) => {
    if (!record || !fieldName) return "";
    const targetKeys = [fieldName, ...(ALIASES[fieldName] || [])].map(normalize);
    const check = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) { if (!obj.length) return null; obj = obj[0]; }
      for (const [k, v] of Object.entries(obj)) {
        if (v == null || v === "" || v === 0) continue; 
        if (targetKeys.includes(normalize(k))) return v;
      }
      return null;
    };
    let val = null;
    if (record.custom_metadata) {
      if (sectionTitle) {
        const sk = Object.keys(record.custom_metadata).find(k => normalize(k).includes(normalize(sectionTitle)) || normalize(sectionTitle).includes(normalize(k)));
        if (sk) val = check(record.custom_metadata[sk]);
      }
      if (!val) {
        for (const section of Object.values(record.custom_metadata)) {
          val = check(section);
          if (val) break;
        }
      }
      if (!val) val = check(record.custom_metadata); 
    }
    if (!val) val = check(record);
    if (!val) val = check(record.clients);
    return val || "";
  };

  const extractArray = (record, sectionTitle) => {
    if (!record || !sectionTitle) return [];
    const t = normalize(sectionTitle);
    if ((t.includes('status') || t.includes('log')) && record.status_logs?.length) {
      return record.status_logs;
    }
    if ((t.includes('product') || t.includes('item')) && record.quotation_items?.length) return record.quotation_items;
    if ((t.includes('attachment') || t.includes('file')) && record.quotation_attachments?.length) return record.quotation_attachments;
    if (record.custom_metadata) { 
      const sk = Object.keys(record.custom_metadata).find(k => normalize(k) === t || normalize(k).includes(t)); 
      if (sk && Array.isArray(record.custom_metadata[sk])) return record.custom_metadata[sk]; 
    }
    return [];
  };

  const getFieldValue = (record, col) => { 
    const v = extractValue(record, col.name, col.sectionTitle); 
    if (v === "" || v == null) return "-";
    const isMoney = ['subtotal', 'total', 'amount', 'price', 'rate'].some(key => String(col.name).toLowerCase().includes(key));
    return formatValue(v, isMoney);
  };
  
  const getManifestTitle = (record = selectedRecord) => {
    if (!record) return "CLIENT MANIFEST";
    const nested = extractValue(record, 'client_name', 'Client Information');
    if (nested) return String(formatValue(nested));
    if (record.client_name) return String(formatValue(record.client_name));
    if (record.clients?.company_name) return String(formatValue(record.clients.company_name));
    return "CLIENT MANIFEST";
  };

  const safeUUID = () => (typeof window !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString() + Math.random();

  const handleSave = async () => {
    if (!tenantId) return alert("No workspace connected. Contact your administrator.");
    const generatedQn = qn || `QN-${new Date().getFullYear()}-${(records.length+1).toString().padStart(3,'0')}`;
    if (!editingId) setQn(generatedQn);
    let finalQn = generatedQn;
    if (editingId) {
      const cur = records.find(r => r.id === editingId);
      if (cur && cur.qn_number === generatedQn) { const m = generatedQn.match(/-Rev-(\d+)$/i); finalQn = m ? generatedQn.replace(/-Rev-\d+$/i, `-Rev-${parseInt(m[1])+1}`) : `${generatedQn}-Rev-1`; }
    }

    // Auto-calculate a follow up date 3 days from now if this is a brand new quote
    let computedFollowUpDate = null;
    if (!editingId) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      computedFollowUpDate = d.toISOString().split('T')[0];
    }

    const creator = editingId ? records.find(r=>r.id===editingId)?.created_by_email : (user?.email || "system@bloomgard.com");
    const clientName = extractValue({custom_metadata:dynamicData},'client_name','Client Information') || "Unknown Client";
    let clientId = null;
    try {
      const cp = { 
        tenant_id:tenantId, 
        company_name:clientName, 
        contact_person:extractValue({custom_metadata:dynamicData},'contact_person','Client Information')||"", 
        email_id:extractValue({custom_metadata:dynamicData},'email_id','Client Information')||"", 
        phone_number:extractValue({custom_metadata:dynamicData},'phone_number','Client Information')||"", 
        billing_address:extractValue({custom_metadata:dynamicData},'billing_address','Client Information')||"",
        source_ref:extractValue({custom_metadata:dynamicData},'source_ref','Client Information')||""
      };
      const { data: ec } = await supabase.from('clients').select('id').eq('tenant_id',tenantId).eq('company_name',clientName).maybeSingle();
      if (ec) { clientId = ec.id; await supabase.from('clients').update(cp).eq('id',clientId); }
      else { const { data: nc } = await supabase.from('clients').insert([cp]).select('id').single(); if (nc) clientId = nc.id; }
    } catch(e) {}
    
    let masterStatusValue = allStatuses[0] || "Inquiry";
    if (editingId) {
       const existingQuote = records.find(r => r.id === editingId);
       if (existingQuote && existingQuote.status) masterStatusValue = existingQuote.status;
    }
    blueprint.forEach(sec => {
      sec.fields.forEach(f => {
        if (f.type === 'master_status') {
           if (!sec.allow_multiple && dynamicData[sec.title] && dynamicData[sec.title][f.name]) {
             masterStatusValue = dynamicData[sec.title][f.name];
           }
        }
      });
    });

    const quoteId = editingId || safeUUID();
    
    // Construct upsert payload
    const upsertPayload = { 
      id:quoteId, 
      tenant_id:tenantId, 
      client_id:clientId, 
      qn_number:finalQn, 
      date, 
      status: masterStatusValue, 
      custom_metadata:dynamicData, 
      created_by_email:creator 
    };

    // Attach follow-up date only if it's new
    if (computedFollowUpDate) {
      upsertPayload.follow_up_due_date = computedFollowUpDate;
    }

    try {
      const { error } = await supabase.from("quotations").upsert([upsertPayload], { onConflict:'id' });
      if (error) throw error;

      const items=[], atts=[];
      blueprint.filter(b=>b.allow_multiple).forEach(sec=>{
        const rows=dynamicData[sec.title]||[], lt=sec.title.toLowerCase();
        rows.forEach((row,i)=>{
          if (lt.includes('product')||lt.includes('item')) items.push({quotation_id:quoteId,display_order:i,item_name:row.item_name||`Item ${i+1}`,item_code:row.item_code||"",quantity:Number(row.quantity||0),uom:row.uom||"",item_rate:Number(row.item_rate||0),item_br:Number(row.item_br||0),custom_metadata:row});
          else if (lt.includes('attachment')||lt.includes('file')||lt.includes('document')) atts.push({quotation_id:quoteId,file_name:row.file_name||row.att_name||`File ${i+1}`,file_path:row.file_path||row.att||""});
        });
      });
      if (editingId) {
        await supabase.from('quotation_items').delete().eq('quotation_id',editingId);
        await supabase.from('quotation_attachments').delete().eq('quotation_id',editingId);
      }
      if (items.length) await supabase.from('quotation_items').insert(items);
      if (atts.length) await supabase.from('quotation_attachments').insert(atts);
      
      setEditingId(null); 
      setCurrentView("pipeline"); 
      await fetchRecords(tenantId);
    } catch (err) { alert("Deployment Error: " + err.message); }
  };

  const handleTriggerAgent = async (quote) => {
    setDispatchingId(quote.id);
    const defaultSnippet = `Hi ${extractValue(quote, 'contact_person', 'Client Information') || 'there'}, just following up on our recent quote (${quote.qn_number || quote.qn}). Let me know if you have any questions or need further clarification.`;
    const finalMessage = editedSnippets[quote.id] !== undefined ? editedSnippets[quote.id] : defaultSnippet;

    try {
      const res = await fetch(getApiUrl('/api/trigger-agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.id,
          tenantId: tenantId,
          agentEmail: user?.email,
          customMessage: finalMessage
        })
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to trigger AI agent.");
      }
      
      alert(`AI Agent successfully dispatched for Quote ${quote.qn_number}`);
      await fetchRecords(tenantId); // Refresh to update the 'Agent Dispatched' status
    } catch(e) {
      alert("Error Dispatching Agent: " + e.message);
    } finally {
      setDispatchingId(null);
    }
  };

  const handleRunCoordinator = async () => {
    if (!tenantId) return;
    setIsRunningCoordinator(true);
    try {
      const res = await fetch(getApiUrl('/api/agent-coordinator'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Coordinator failed.");
      alert(data.message);
      await fetchRecords(tenantId);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setIsRunningCoordinator(false);
    }
  };

  const handleSaveAgent = async (agentData) => {
    if (!tenantId) return alert("No workspace connected.");
    setIsSavingAgent(true);
    try {
      agentData.email = customSender || "";
      const isNew = !agentData.id;
      if (isNew) agentData.id = safeUUID();
      const updatedAgents = isNew ? [...agents, agentData] : agents.map(a => a.id === agentData.id ? agentData : a);
      
      const newSchemaConfig = [
        ...blueprint,
        { is_agent_config: true, agents: updatedAgents, title: "system_agents" },
        { ...aiSettings, is_ai_settings: true, title: "ai_settings" }
      ];
      
      const { error } = await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId);
      if (error) throw error;

      if (agentData.assigned_quote_ids) {
        for (const quoteId of agentData.assigned_quote_ids) {
          const q = records.find(r => r.id === quoteId);
          if (q) {
            let meta = q.custom_metadata;
            if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
            if (!meta) meta = {};
            meta.agent_id = agentData.id;
            await supabase.from('quotations').update({ custom_metadata: meta }).eq('id', quoteId);
          }
        }
        await fetchRecords(tenantId);
      }
      
      setAgents(updatedAgents);
      setEditingAgent(null);
    } catch (e) {
      alert("Error saving agent: " + e.message);
    } finally {
      setIsSavingAgent(false);
    }
  };

  const handleDeleteAgent = async (id) => {
    if (!confirm("Delete this agent?")) return;
    const updatedAgents = agents.filter(a => a.id !== id);
    const newSchemaConfig = [
      ...blueprint,
      { is_agent_config: true, agents: updatedAgents, title: "system_agents" },
      { ...aiSettings, is_ai_settings: true, title: "ai_settings" }
    ];
    await supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId);
    setAgents(updatedAgents);
  };

  const handleDelete = async (id) => {
    if (!confirm("Permanently delete this manifest?")) return;
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) return alert("Deletion Error: " + error.message);
    setSelectedRecord(null); await fetchRecords(tenantId);
  };

  const updateStatus = async (id, newStatus) => {
    const targetRec = records.find(r => r.id === id) || selectedRecord;
    const oldStatus = targetRec?.status || "Inquiry";
    const { error } = await supabase.from("quotations").update({ status: newStatus }).eq("id", id);
    if (error) return alert("Status Error: " + error.message);
    const { data: newLog } = await supabase.from("status_logs").insert([{
        quotation_id: id,
        old_status: oldStatus,
        new_status: newStatus,
        comments: `Status updated by ${user?.email}`
    }]).select().single();
    let updatedMetadata = { ...(targetRec.custom_metadata || {}) };
    blueprint.forEach(sec => {
      sec.fields.forEach(f => {
        if (f.type === 'master_status' && updatedMetadata[sec.title]) {
           updatedMetadata[sec.title][f.name] = newStatus;
        }
      });
    });
    setSelectedRecord(p => ({ 
      ...p, 
      status: newStatus, 
      custom_metadata: updatedMetadata,
      status_logs: p.status_logs ? [...p.status_logs, newLog] : [newLog]
    })); 
    await fetchRecords(tenantId);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.replace("/"); };

  const handleExportData = (format) => {
    if (!visibleRecords.length) return alert("No data to export.");
    if (format === 'json') { const b=new Blob([JSON.stringify(visibleRecords,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const l=document.createElement("a"); l.href=u; l.download=`Bloomgard_${new Date().toISOString().split('T')[0]}.json`; l.click(); }
    else { const h=['Ref ID','Date','Status','Agent',...tableColumns.map(c=>c.label)]; const rows=visibleRecords.map(r=>[r.qn_number,r.date,r.status,r.created_by_email,...tableColumns.map(c=>`"${String(getFieldValue(r,c)).replace(/"/g,'""')}"`),].join(',')); const b=new Blob([[h.join(','),...rows].join('\n')],{type:"text/csv;charset=utf-8;"}); const u=URL.createObjectURL(b); const l=document.createElement("a"); l.href=u; l.download=`Bloomgard_${new Date().toISOString().split('T')[0]}.csv`; l.click(); }
  };

  const handleImportData = async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try { const d=JSON.parse(e.target?.result); const s=d.map(r=>({...r,id:safeUUID(),tenant_id:tenantId,created_by_email:user?.email})); const {error}=await supabase.from("quotations").insert(s); if(error) throw error; alert(`Imported ${s.length} records.`); await fetchRecords(tenantId); }
      catch(err){ alert("Import Failed: "+err.message); }
      if(fileInputRef.current) fileInputRef.current.value="";
    };
    reader.readAsText(file);
  };

  const COLORS = ["#1F2937","#4F46E5","#10B981","#F59E0B","#EF4444"];
  const perfData = Object.entries(visibleRecords.reduce((acc,curr)=>{ const n=(curr.created_by_email||"").includes('@')?curr.created_by_email.split('@')[0]:"Agent"; acc[n]=(acc[n]||0)+1; return acc; },{})).map(([name,value])=>({name,value:Number(value)}));
  const sortedRecords = [...visibleRecords]
    .filter(r=>JSON.stringify(r).toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a,b)=>{
      const av=a[sortConfig.key]||extractValue(a,sortConfig.key)||"";
      const bv=b[sortConfig.key]||extractValue(b,sortConfig.key)||"";
      return sortConfig.direction==='asc'?(av>bv?1:-1):(av<bv?1:-1);
    });

  const handleSendChatAI = async (overrideMsg = null) => {
    const msg = typeof overrideMsg === 'string' ? overrideMsg : currentInput;
    if (!msg.trim() || !tenantId) return;
    setCurrentInput("");
    setChatHistory(p=>[...p,{role:'user',content:msg}]); setIsThinking(true);
    const lightweightData = visibleRecords.map(r => {
      const rawItems = extractArray(r, 'Quotation Items') || extractArray(r, 'Products') || [];
      const cleanProducts = rawItems.map(item => ({
        name: item.item_name || item.name || "Unknown Item",
        qty: Number(item.quantity || item.qty || 0),
        price: Number(item.item_rate || item.price || 0),
        total: Number(item.item_br || 0),
        gsm: item.gsm || "Unknown",
        gst: item.gst || "Unknown",
        application: item.application || "Unknown"
      }));
      return {
        id: r.qn_number || r.qn,
        date: r.date,
        status: r.status,
        client: extractValue(r, 'client_name', 'Client Information') || "Unknown",
        source: extractValue(r, 'source_ref', 'Client Information') || "Unknown", 
        agent: r.created_by_email,
        products: cleanProducts
      };
    });

    try {
      const res = await fetch(getApiUrl('/api/ask-ai'), { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ query: msg, data: lightweightData }) 
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      setChatHistory(p=>[...p,{role:'ai',content:result.answer||"No response received."}]);
    } catch(e) {
      setChatHistory(p=>[...p,{role:'ai',content:`Network error: ${e.message}.`}]);
    } finally { setIsThinking(false); }
  };

  const handleGenerateDashInsights = async () => {
    if (!dashCommand.trim() || !tenantId) return; setIsBuildingDash(true);
    const instruction = `CRITICAL: Return ONLY a valid JSON array. Format: [{"type":"metric"|"bar_chart"|"pie_chart"|"line_chart"|"list","title":"Title","value":"Summary","data":[{"name":"x","value":1}]}].
RULES:
1. Perform robust aggregations (e.g., sum up 'value' instead of counting rows if appropriate).
2. For charts, SORT the data (e.g., highest value first for bar charts, chronological for line charts).
3. Keep 'name' labels concise (MAX 15 chars), truncate with '...' if needed.
4. Limit to top 7-10 data points per chart to prevent clutter.
5. Do not return markdown, only the raw JSON array.
Command: ${dashCommand}`;

    const lightweightData = visibleRecords.map(r => {
      const valStr = getFieldValue(r, {name: 'subtotal'}) || getFieldValue(r, {name: 'total'}) || "0";
      const numVal = parseFloat(String(valStr).replace(/[^0-9.]/g, '')) || 0;
      return {
        id: r.qn_number || r.qn,
        status: r.status,
        date: r.date,
        value: numVal,
        agent: r.created_by_email,
        client: (extractValue(r, 'client_name', 'Client Information') || "Unknown").slice(0, 20),
        source: extractValue(r, 'source_ref', 'Client Information') || "Unknown" 
      };
    });
    try {
      const res = await fetch(getApiUrl('/api/ask-ai'), { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        body:JSON.stringify({ query: instruction, data: lightweightData }) 
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      let raw=result.answer||""; const si=raw.indexOf('['); const ei=raw.lastIndexOf(']'); const oi=raw.indexOf('{'); const oei=raw.lastIndexOf('}');
      let parsed=[];
      if(si!==-1&&ei>si) parsed=JSON.parse(raw.substring(si,ei+1));
      else if(oi!==-1&&oei>oi) parsed=[JSON.parse(raw.substring(oi,oei+1))];
      else throw new Error("No JSON found in AI response");
      if(!Array.isArray(parsed)) parsed=[parsed];
      for(const insight of parsed){
        let sd=Array.isArray(insight.data)?insight.data.map(d=>({name:String(d.name||d.key||'Unknown'),value:Number(d.value||d.count||0)})):[];
        if(insight.type?.includes('chart')&&!sd.length) sd=[{name:"No Data",value:1}];
        const {data:saved}=await supabase.from("ai_insights").insert([{tenant_id:tenantId,title:insight.title||"Insight",value:String(insight.value||""),type:insight.type||"metric",data:sd}]).select().single();
        if(saved) setDynamicInsights(p=>[saved,...p]);
      }
      setDashCommand("");
    } catch(e){ console.error(e); alert("AI error: "+e.message); }
    finally{ setIsBuildingDash(false); }
  };

  const removeInsightCard = async (id) => { const {error}=await supabase.from("ai_insights").delete().eq("id",id); if(!error) setDynamicInsights(p=>p.filter(i=>i.id!==id)); };
  const formatAIText = (text) => {
    if(!text) return null;
    return <div className="space-y-2">{text.split('\n').map((line,i)=><p key={i} className="last:mb-0">{line.split(/(\*\*.*?\*\*)/g).map((part,j)=>part.startsWith('**')?<strong key={j} className="font-bold text-gray-900">{part.slice(2,-2)}</strong>:<span key={j}>{part}</span>)}</p>)}</div>;
  };

  const downloadDirectPDF = async (html, name) => {
    try {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      document.head.appendChild(script);

      script.onload = () => {
        const printHtml = `
          <style>
            body, html { margin: 0 !important; padding: 0 !important; background: #ffffff; }
            .pdf-content { width: 800px; padding: 20px; box-sizing: border-box; text-align: left; }
          </style>
          <div class="pdf-content">${html}</div>
        `;

        const opt = {
          margin: [0.5, 0, 0.5, 0], 
          filename: `${name}.pdf`,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { scale: 2, useCORS: true, windowWidth: 800, scrollY: 0, x: 0, y: 0 },
          jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        window.html2pdf().set(opt).from(printHtml).save();
      };
    } catch (err) {
      alert('PDF Error: ' + err.message);
    }
  };

  const getRenderedHTML = async (record) => {
    const { data: schema } = await supabase.from("tenant_schemas").select("html_template").eq("tenant_id", tenantId).single();
    let html = schema?.html_template || "";
    let templateData = {};

    Object.entries(record).forEach(([k, v]) => {
      if (typeof v !== 'object') {
        templateData[k] = v;
      }
    });

    blueprint.forEach(section => {
      if (!section.allow_multiple) {
        section.fields.forEach(f => {
          templateData[f.name] = extractValue(record, f.name, section.title) ?? "";
        });
      } else {
        const rawItems = extractArray(record, section.title);
        const normalizedItems = rawItems.map(item => {
          let flat = { ...item };
          let meta = item.custom_metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
          }
          if (meta && typeof meta === 'object') {
            const lowerMeta = {};
            Object.entries(meta).forEach(([k, v]) => { lowerMeta[k.toLowerCase()] = v; });
            Object.entries(lowerMeta).forEach(([k, v]) => {
              if (flat[k] == null || flat[k] === '' || flat[k] === 0) flat[k] = v;
            });
            flat = { ...lowerMeta, ...flat };
          }
          const rootLower = {};
          Object.entries(flat).forEach(([k, v]) => { rootLower[k.toLowerCase()] = v; });
          flat = { ...rootLower, ...flat };
          if (flat.gst != null && flat.gst !== '') {
            flat.gst = String(flat.gst).replace(/%/g, '').trim();
            if (flat.gst === '0' || flat.gst === '') flat.gst = null;
          }
          return flat;
        });
        templateData['quotation_items'] = normalizedItems;
        templateData[section.title] = normalizedItems;
      }
    });

    templateData['subtotal'] = formatValue(record.subtotal || extractValue(record, 'subtotal', 'Quote Details') || "0", true);

    try {
      if (!Handlebars.helpers['math']) {
        Handlebars.registerHelper('math', (a, op, b) => {
          a = parseFloat(a); b = parseFloat(b);
          let result = a;
          if (op === '+') result = a + b;
          if (op === '-') result = a - b;
          if (op === '*') result = a * b;
          if (op === '/') result = b !== 0 ? a / b : 0;
          return Number(result).toFixed(2);
        });
      }
      const compiler = Handlebars.compile(html);
      return compiler(templateData);
    } catch (e) {
      console.error("Handlebars Error:", e);
      return html;
    }
  };

  const handleGeneratePDF = async (r) => { 
    const newMetadata = { ...r.custom_metadata, has_pdf_generated: true };
    await supabase.from("quotations").update({ custom_metadata: newMetadata }).eq('id', r.id);
    fetchRecords(tenantId);
    downloadDirectPDF(await getRenderedHTML(r),`${r.qn_number} - ${getManifestTitle(r)}`); 
  };
  
  const handleViewDocument = async (r) => { setViewingDoc({html:await getRenderedHTML(r),title:`${r.qn_number} - ${getManifestTitle(r)}`}); };
  
  const handleOpenEmailComposer = async (r) => {
    const name = `${r.qn_number} - ${getManifestTitle(r)}`;
    
    setEmailDraft({
      to: "",
      subject: `Document: ${name}`,
      message: `Hello,\n\nPlease find the attached official document.\n\nBest regards,\n${user?.email}`,
      attachmentBase64: "", // Clear this since we removed the heavy PDF generator logic
      filename: `${name}.pdf`
    });
    setShowEmailModal(true);
  };

  const sendDraftedEmail = async () => {
    setIsSending(true);
    try { 
      const url = getApiUrl('/api/send-quote');
      const payload = { 
        to: emailDraft.to,
        subject: emailDraft.subject,
        message: emailDraft.message,
        attachments: emailDraft.attachments || [], 
        agentEmail: user?.email,              
        companyName: companyName || "",
        customSender: customSender || ""
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }); 
        
      const responseText = await res.text();
      let r;
      try { 
        r = JSON.parse(responseText); 
      } catch (parseError) { 
        throw new Error(`Parse Error: ${responseText.slice(0, 40)}...`); 
      }
        
      if (r.success) {
        setShowEmailModal(false);
        alert("Email sent successfully!");
      } else {
        throw new Error(r.error || "Server failed to send."); 
      }
      
    } catch(e) { 
      alert("Delivery Failed: " + e.message); 
    } finally { 
      setIsSending(false); 
    }
  };
  
  const loadRecordForEditing = (rec) => {
    setEditingId(rec.id); 
    setQn(rec.qn_number); 
    setDate(rec.date || new Date().toISOString().split('T')[0]); 
    let d = { ...(rec.custom_metadata || {}) };
    
    blueprint.forEach(sec => { 
      if (sec.allow_multiple) {
        d[sec.title] = extractArray(rec, sec.title).map(item => {
           let meta = item.custom_metadata;
           if (typeof meta === 'string') {
               try { meta = JSON.parse(meta); } catch(e) { meta = {}; }
           }
           const rowState = { ...(meta || {}), ...item };
           sec.fields.forEach(f => {
               const val = formatValue(extractValue({ ...item, custom_metadata: meta }, f.name, sec.title));
               if (val !== "" && val != null) { rowState[f.name] = val; }
           });
           return rowState;
        });
      } else { 
        if (!d[sec.title]) d[sec.title] = {}; 
        sec.fields.forEach(f => {
          const val = formatValue(extractValue(rec, f.name, sec.title));
          if (val !== "" && val != null) { d[sec.title][f.name] = val; } 
          else if (d[sec.title][f.name] == null) { d[sec.title][f.name] = ""; }
        }); 
      } 
    });
    setDynamicData(d); 
    setSelectedRecord(null); 
    setCurrentView("new_entry");
  };

  if (authState === 'checking' || loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <p className="font-semibold text-[12px] tracking-widest text-gray-500 uppercase animate-pulse">Initializing Workspace...</p>
    </div>
  );
  
  if (authState === 'unauthed') return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <p className="font-semibold text-[12px] tracking-widest text-gray-500 uppercase animate-pulse">Redirecting...</p>
    </div>
  );

  const isGlass = userPreferences.wallpaper !== 'legacy';
  const isDark = userPreferences.theme === 'dark';

  return (
    <div className={`flex min-h-screen font-sans transition-colors duration-500 ${isDark ? 'dark text-gray-100' : 'text-gray-800'} ${isGlass ? 'glass-mode !bg-transparent' : 'bg-gray-50 dark:bg-[#030712]'}`}>
      {!isMobileMenuOpen && !selectedRecord && !viewingDoc && !showEmailModal && (
        <button onClick={()=>setIsMobileMenuOpen(true)} className="md:hidden fixed top-4 left-4 z-40 p-3 bg-gray-900 text-white rounded-lg shadow-md active:scale-95 transition-transform">☰</button>
      )}
      {isMobileMenuOpen && <div onClick={()=>setIsMobileMenuOpen(false)} className="md:hidden fixed inset-0 bg-black/50 z-[90] backdrop-blur-sm transition-opacity"></div>}

      <aside className={`fixed z-[100] w-64 flex flex-col shadow-2xl md:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 ease-in-out 
        ${isMobileMenuOpen ? 'inset-y-0 left-0 translate-x-0 rounded-none border-r' : 'top-4 bottom-4 left-4 -translate-x-[120%] md:translate-x-0 rounded-3xl'} 
        ${isGlass ? 'glass-sidebar bg-white/80 dark:bg-black/60 backdrop-blur-3xl border border-white/50 dark:border-white/10' : (isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200')}`}>
        <div className="p-8 pb-4">
          <h1 className="text-4xl font-bold tracking-tighter text-gray-900">Bloomgard.</h1>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">{companyName || "Workspace"}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            ['dashboard','📊 Intelligence'],
            ['alerts','⚡ Action Needed'],
            ['agents','🤖 Agent Fleet'],
            ['pipeline','🚀 Quotes'],
            ['docs','📄 Docs'],
            ['settings','⚙️ Settings']
          ].map(([v,label])=>(
            <div key={v} onClick={()=>{setCurrentView(v);setIsMobileMenuOpen(false);}} className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all font-medium text-sm ${currentView===v?'bg-gray-900 text-white shadow-md':'text-gray-500 hover:bg-gray-50'}`}>
              <span>{label}</span>
              {v === 'alerts' && pendingAlerts.length > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">{pendingAlerts.length}</span>
              )}
            </div>
          ))}
          <div className="pt-4 pb-2"><div className="border-t border-gray-100"></div></div>
          <div onClick={()=>{setCurrentView('copilot');setIsMobileMenuOpen(false);}} className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all font-medium text-sm ${currentView==='copilot'?'bg-indigo-600 text-white shadow-md':'text-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/50'}`}>🤖 Bloomgard AI</div>
        </nav>
        <div className={`p-6 border-t space-y-4 ${isGlass ? 'bg-white/60 dark:bg-black/40 border-white/30' : 'bg-gray-50/50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-700 text-xs font-bold uppercase border border-gray-300">{user?.email?.charAt(0)||'O'}</div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-semibold truncate text-gray-900 dark:text-gray-100">{user?.email||'Operator'}</p>
              <p className="text-[9px] text-gray-500 uppercase font-medium tracking-widest mt-0.5">{user?.role||"Operator"}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full py-2.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-wider border border-red-200 hover:bg-red-100 transition-all shadow-sm active:scale-95">Sign Out</button>
        </div>
      </aside>

      <main className={`flex-1 w-full px-3 py-4 pt-24 md:ml-[17.5rem] md:px-8 md:pt-8 lg:px-12 min-h-screen relative z-10 transition-all duration-500 ${isGlass ? '!bg-transparent' : ''}`} 
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 6rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {isGlass && (
          <>
            <div className="fixed inset-0 z-[-2] bg-cover bg-center transition-all duration-700" style={{ backgroundImage: `url('/wallpapers/${userPreferences.wallpaper}.jpg')` }}></div>
            {isDark && <div className="fixed inset-0 z-[-1] bg-black/60 transition-opacity duration-700"></div>}
            {!isDark && <div className="fixed inset-0 z-[-1] bg-white/20 transition-opacity duration-700"></div>}
          </>
        )}

        {!tenantId && (
          <div className="max-w-6xl mx-auto bg-amber-50 border-l-4 border-amber-500 p-4 md:p-6 rounded-xl mb-8 flex items-start gap-4">
             <span className="text-2xl">⚠️</span>
             <div>
                <h3 className="text-sm font-bold text-amber-900">Workspace Connection Missing</h3>
                <p className="text-xs text-amber-800 mt-1">This client account does not have a <code>tenant_id</code> assigned in the database. Quotes and AI features cannot load until this is fixed. Please update their profile in Supabase.</p>
             </div>
          </div>
        )}

        {currentView === "alerts" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <header className="mb-10">
              <h2 className="text-3xl font-bold text-gray-900">Action Needed</h2>
              <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mt-1">AI Follow-Up Triage</p>
            </header>

            <div className="relative rounded-[2rem] p-6 md:p-10 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
              {/* Glassmorphism Background Elements */}
              <div className="absolute inset-0 bg-white/40 backdrop-blur-xl z-0 pointer-events-none"></div>
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl z-0 pointer-events-none"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl z-0 pointer-events-none"></div>

              <div className="relative z-10">
                <div className="flex gap-4 border-b border-indigo-100/50 mb-8">
                  <button onClick={() => setTriageTab('due')} className={`pb-3 text-sm font-bold flex items-center gap-2 transition-all ${triageTab === 'due' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <span className="text-amber-500">⚡</span> Pending Follow-ups <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full">{pendingAlerts.length}</span>
                  </button>
                  <button onClick={() => setTriageTab('history')} className={`pb-3 text-sm font-bold flex items-center gap-2 transition-all ${triageTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <span className="text-indigo-500">📜</span> Follow-up History <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">{historyAlerts.length}</span>
                  </button>
                </div>

                {triageTab === 'due' && (
                  <>
                    {pendingAlerts.length === 0 ? (
                      <div className="text-center py-16">
                        <span className="text-4xl mb-4 block opacity-50">✨</span>
                        <p className="text-gray-500 font-medium text-sm">You are all caught up!</p>
                        <p className="text-gray-400 text-xs mt-1">Quotes needing a follow-up will automatically appear here 3 days after creation.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pendingAlerts.map(r => {
                          const defaultSnippet = `Hi ${extractValue(r, 'contact_person', 'Client Information') || 'there'}, just following up on our recent quote (${r.qn_number || r.qn}). Let me know if you have any questions or need further clarification.`;
                          const currentVal = editedSnippets[r.id] !== undefined ? editedSnippets[r.id] : defaultSnippet;
                          
                          return (
                          <div key={r.id} className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white/60 p-5 rounded-2xl border border-white/50 shadow-sm hover:shadow-md hover:bg-white/80 transition-all gap-4">
                            <div className="flex-1 w-full md:w-auto">
                              <p className="text-xs font-bold text-gray-900 mb-1">{r.qn_number || r.qn} - {getManifestTitle(r)}</p>
                              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-3">Due: {r.follow_up_due_date || r.custom_metadata?.follow_up_due_date ? new Date(r.follow_up_due_date || r.custom_metadata?.follow_up_due_date).toLocaleDateString() : 'Overdue (> 3 days)'}</p>
                              <div className="bg-white p-3 rounded-lg border border-indigo-100/50 shadow-sm relative group focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                                <textarea
                                  value={currentVal}
                                  onChange={(e) => setEditedSnippets({...editedSnippets, [r.id]: e.target.value})}
                                  className="w-full text-xs text-gray-600 italic bg-transparent outline-none resize-none min-h-[48px]"
                                />
                                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mt-2 flex justify-between items-center">
                                  <span>Suggested Email Snippet • Waiting for Approval</span>
                                  <span className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">✎ Edit</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 w-full md:w-auto">
                              <div className="hidden md:block text-right pr-4 border-r border-indigo-100/50">
                                 <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Amount</p>
                                 <p className="text-xs font-bold text-gray-700">₹{getFieldValue(r, {name: 'subtotal'})}</p>
                              </div>
                              <button
                                onClick={() => handleTriggerAgent(r)}
                                disabled={dispatchingId === r.id}
                                className={`w-full md:w-auto px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 ${dispatchingId === r.id ? 'bg-indigo-100/50 text-indigo-400 cursor-not-allowed border border-indigo-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-500 hover:shadow-lg hover:shadow-indigo-200'}`}
                              >
                                {dispatchingId === r.id ? (
                                  <><div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div> Dispatching...</>
                                ) : (
                                  <>🤖 Approve Agent</>
                                )}
                              </button>
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </>
                )}

                {triageTab === 'history' && (
                  <>
                    {historyAlerts.length === 0 ? (
                      <div className="text-center py-16">
                        <span className="text-4xl mb-4 block opacity-50">📜</span>
                        <p className="text-gray-500 font-medium text-sm">No follow-up history yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {historyAlerts.map(r => (
                          <div 
                            key={`hist-${r.id}`} 
                            onClick={() => setExpandedHistoryId(expandedHistoryId === r.id ? null : r.id)}
                            className="bg-white/60 p-5 rounded-2xl border border-white/50 shadow-sm transition-all hover:bg-white/80 hover:shadow-md cursor-pointer"
                          >
                             <div className="flex justify-between items-center">
                               <div>
                                 <p className="text-xs font-bold text-gray-900 mb-1">{r.qn_number || r.qn} - {getManifestTitle(r)}</p>
                                 <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status: {r.follow_up_status || r.custom_metadata?.follow_up_status}</p>
                               </div>
                               <span className="text-indigo-400 text-xs font-bold bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100/50">
                                 {expandedHistoryId === r.id ? 'Close ▲' : 'View Log ▼'}
                               </span>
                             </div>
                             
                             {expandedHistoryId === r.id && (
                               <div className="mt-6 pt-6 border-t border-indigo-100/50 cursor-default" onClick={e => e.stopPropagation()}>
                                 {r.custom_metadata?.agent_summary && (
                                   <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-4">
                                     <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">AI Conclusion Summary</p>
                                     <p className="text-sm text-indigo-900 font-medium leading-relaxed">{r.custom_metadata.agent_summary}</p>
                                   </div>
                                 )}

                                 {r.custom_metadata?.agent_conversations && r.custom_metadata.agent_conversations.length > 0 && (
                                   <div className="space-y-4 bg-white/80 p-6 rounded-2xl border border-gray-200 max-h-[300px] overflow-y-auto">
                                     {r.custom_metadata.agent_conversations.map((msg: any, idx: number) => (
                                       <div key={idx} className={`flex flex-col ${msg.role === 'client' ? 'items-start' : 'items-end'}`}>
                                         <div className="flex items-center gap-2 mb-1 px-1">
                                           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{msg.role === 'client' ? 'Client' : 'Agent'}</span>
                                           <span className="text-[9px] font-medium text-gray-300">{new Date(msg.timestamp).toLocaleString()}</span>
                                         </div>
                                         <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap ${msg.role === 'client' ? 'bg-gray-100 text-gray-800 rounded-tl-sm' : 'bg-indigo-600 text-white rounded-tr-sm shadow-md'}`}>
                                           {msg.content}
                                         </div>
                                       </div>
                                     ))}
                                   </div>
                                 )}
                               </div>
                             )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {currentView === "settings" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto space-y-8">
            <header className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900">Workspace Settings</h2>
            </header>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
              
              <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                <span className="text-2xl">✨</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">UI & Personalization</h3>
                </div>
              </div>

              <div className="space-y-6 max-w-2xl mb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Theme Mode</label>
                    <div className="flex bg-gray-100/50 p-1 rounded-xl w-full border border-gray-200/50">
                      <button onClick={() => setUserPreferences({...userPreferences, theme: 'light'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${userPreferences.theme === 'light' ? 'bg-white shadow-sm text-gray-900 border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'}`}>Light Mode</button>
                      <button onClick={() => setUserPreferences({...userPreferences, theme: 'dark'})} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${userPreferences.theme === 'dark' ? 'bg-gray-900 shadow-sm text-white' : 'text-gray-500 hover:text-gray-700'}`}>Dark Mode</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Workspace Wallpaper</label>
                    <select 
                      value={userPreferences.wallpaper} 
                      onChange={e => setUserPreferences({...userPreferences, wallpaper: e.target.value})} 
                      className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 transition-colors cursor-pointer"
                    >
                      <option value="legacy">Legacy UI (Solid Background)</option>
                      <option value="wp1">Glassmorphism - Wallpaper 1</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    setIsSavingPrefs(true);
                    localStorage.setItem('userPrefs_' + user?.id, JSON.stringify(userPreferences));
                    if (user?.id) {
                       await supabase.from('profiles').update({ custom_metadata: { ...user.custom_metadata, preferences: userPreferences } }).eq('id', user.id);
                    }
                    setIsSavingPrefs(false);
                    alert("Personalization settings saved successfully!");
                  }}
                  disabled={isSavingPrefs}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-sm hover:bg-indigo-700 active:scale-95 transition-transform disabled:bg-indigo-400"
                >
                  {isSavingPrefs ? "Saving..." : "Save UI Preferences"}
                </button>
              </div>

              <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                <span className="text-2xl">✉️</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Email Configuration</h3>
                  
                </div>
              </div>
              
              <div className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Custom Sender Email</label>
                  <input 
                    type="email" 
                    value={customSender} 
                    onChange={e => setCustomSender(e.target.value)} 
                    placeholder="quotes@yourdomain.com"
                    className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 transition-colors"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 ml-1 leading-relaxed">
                    This email must belong to the domain you verified in GoDaddy/Resend.
                  </p>
                </div>

                <button 
                  onClick={async () => {
                    if (!tenantId) return;
                    setIsSavingSettings(true);
                    
                    const newSchemaConfig = [
                      ...blueprint,
                      { is_agent_config: true, agents, title: "system_agents" },
                      { ...aiSettings, is_ai_settings: true, title: "ai_settings" }
                    ];

                    const [res1, res2] = await Promise.all([
                      supabase.from('tenants').update({ custom_email_sender: customSender }).eq('id', tenantId),
                      supabase.from('tenant_schemas').update({ schema_config: newSchemaConfig }).eq('tenant_id', tenantId)
                    ]);
                    
                    setIsSavingSettings(false);
                    if (res1.error || res2.error) alert("Failed to save: " + (res1.error?.message || res2.error?.message));
                    else alert("Settings updated successfully!");
                  }}
                  disabled={isSavingSettings}
                  className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-sm hover:bg-gray-800 active:scale-95 transition-transform disabled:bg-gray-400"
                >
                  {isSavingSettings ? "Saving..." : "Save Configuration"}
                </button>
              </div>

              <div className="flex items-center gap-3 mt-10 mb-6 border-b border-gray-100 pb-4">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">AI Personality Settings</h3>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mb-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Tone</label>
                  <select value={aiSettings.tone} onChange={e=>setAiSettings({...aiSettings, tone: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                    <option>Professional</option>
                    <option>Casual</option>
                    <option>Friendly</option>
                    <option>Aggressive</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">English Level</label>
                  <select value={aiSettings.englishLevel} onChange={e=>setAiSettings({...aiSettings, englishLevel: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                    <option>Native</option>
                    <option>Simple / Basic</option>
                    <option>Corporate Jargon</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Desperation Level</label>
                  <select value={aiSettings.desperation} onChange={e=>setAiSettings({...aiSettings, desperation: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-indigo-400 mt-1 cursor-pointer">
                    <option>Low (Confident)</option>
                    <option>Medium (Eager)</option>
                    <option>High (Need the deal)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === "agents" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto space-y-8">
            <header className="mb-8 flex justify-between items-end border-b border-gray-200 pb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">🤖 Agent Fleet</h2>
                <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mt-1">Manage Autonomous Follow-up Agents</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleRunCoordinator} disabled={isRunningCoordinator || agents.length === 0} className="bg-white text-gray-900 border border-gray-200 px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-transform disabled:opacity-50">
                  {isRunningCoordinator ? "Syncing..." : "▶ Run Daily Sync"}
                </button>
                <button onClick={() => setEditingAgent({ name: '', email: customSender || '', importance: 5, frequency: 'Immediate', auto_send: true, task: '', instructions: '' })} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 active:scale-95 transition-transform">
                  + Create Agent
                </button>
              </div>
            </header>

            {editingAgent ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-2xl mx-auto">
                <h3 className="text-lg font-bold text-gray-900 mb-6">{editingAgent.id ? "Edit Agent Profile" : "New Agent Profile"}</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Agent Name</label>
                      <input type="text" value={editingAgent.name} onChange={e=>setEditingAgent({...editingAgent, name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="e.g. Sarah from Sales" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Agent Email</label>
                      <div className="w-full bg-gray-100/80 border border-gray-200 px-4 py-2.5 rounded-xl text-sm text-gray-500 flex items-center justify-between cursor-not-allowed">
                        <span className="truncate">{customSender || "Configure in Workspace Settings"}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">Global</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Importance Level</label>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">{editingAgent.importance || 5}</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={editingAgent.importance || 5} 
                      onChange={e=>setEditingAgent({...editingAgent, importance: parseInt(e.target.value)})} 
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                    />
                    <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-2 px-1">
                      <span>Low Priority</span>
                      <span>Critical</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Follow-up Frequency</label>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded shadow-sm">
                          {editingAgent.frequency === 0 || editingAgent.frequency === 'Immediate' ? 'Immediate' : `${editingAgent.frequency} Days`}
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="14" 
                        value={typeof editingAgent.frequency === 'number' ? editingAgent.frequency : (editingAgent.frequency === 'Immediate' ? 0 : (editingAgent.frequency === 'Daily' ? 1 : (editingAgent.frequency === '3 Days' ? 3 : (editingAgent.frequency === 'Weekly' ? 7 : 0))))} 
                        onChange={e => setEditingAgent({...editingAgent, frequency: parseInt(e.target.value)})}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-2 px-1">
                        <span>Immediate</span>
                        <span>14 Days</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Action Control</label>
                      <div className="flex p-1 bg-gray-100 rounded-xl border border-gray-200">
                        <button 
                          type="button"
                          onClick={() => setEditingAgent({...editingAgent, auto_send: true})}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${editingAgent.auto_send !== false ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Auto-Send
                        </button>
                        <button 
                          type="button"
                          onClick={() => setEditingAgent({...editingAgent, auto_send: false})}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${editingAgent.auto_send === false ? 'bg-white text-amber-600 shadow-sm border border-amber-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Manual Review
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Specific Task</label>
                    <input type="text" value={editingAgent.task} onChange={e=>setEditingAgent({...editingAgent, task: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-400" placeholder="e.g. Negotiate a 10% discount to close the deal" />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" onClick={() => setEditingAgent({...editingAgent, task: 'Follow up on the quote and ask if they have any questions'})} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Follow Up</button>
                      <button type="button" onClick={() => setEditingAgent({...editingAgent, task: 'Negotiate a deal within a 10% discount margin'})} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Negotiate Deal</button>
                      <button type="button" onClick={() => setEditingAgent({...editingAgent, task: 'Act as a chatbot and answer their questions about the product'})} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold hover:bg-indigo-100 transition-colors">Answer Questions</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Core Instructions (Product, Policy, Tone)</label>
                    <textarea value={editingAgent.instructions} onChange={e=>setEditingAgent({...editingAgent, instructions: e.target.value})} className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-400 h-32 resize-none" placeholder="Enter specific instructions regarding products, company policies, and negotiation tactics..."></textarea>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 mb-2 block">Assign Quotes to Agent</label>
                    <input 
                      type="text" 
                      value={agentQuoteSearch} 
                      onChange={e=>setAgentQuoteSearch(e.target.value)} 
                      className="w-full mb-3 bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs outline-none focus:border-indigo-400 shadow-sm" 
                      placeholder="Search by QN Number or Client Name..." 
                    />
                    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl max-h-48 overflow-y-auto p-2 space-y-1">
                      {records.filter(r => {
                          const qnStr = (r.qn_number || r.qn || r.id || "").toLowerCase();
                          const clientStr = (r.clients?.company_name || r.custom_metadata?.client_name || 'Client').toLowerCase();
                          const searchStr = agentQuoteSearch.toLowerCase();
                          return qnStr.includes(searchStr) || clientStr.includes(searchStr);
                      }).map(r => (
                        <label key={r.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200">
                          <input 
                            type="checkbox" 
                            checked={(editingAgent.assigned_quote_ids || []).includes(r.id)}
                            onChange={(e) => {
                              const currentIds = editingAgent.assigned_quote_ids || [];
                              if (e.target.checked) {
                                setEditingAgent({...editingAgent, assigned_quote_ids: [...currentIds, r.id]});
                              } else {
                                setEditingAgent({...editingAgent, assigned_quote_ids: currentIds.filter(id => id !== r.id)});
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900">{r.qn_number}</span>
                            <span className="text-xs text-gray-500">{r.clients?.company_name || r.custom_metadata?.client_name || 'Client'}</span>
                          </div>
                        </label>
                      ))}
                      {records.length === 0 && (
                        <div className="p-4 text-center text-xs text-gray-500">No quotes available to assign.</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <button onClick={() => setEditingAgent(null)} className="px-6 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors">Cancel</button>
                  <button onClick={() => handleSaveAgent(editingAgent)} disabled={isSavingAgent} className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 active:scale-95 transition-transform disabled:opacity-50">
                    {isSavingAgent ? "Saving..." : "Save Agent"}
                  </button>
                </div>
              </div>
            ) : selectedAgentView ? (
              <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                  <div>
                    <button onClick={() => setSelectedAgentView(null)} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 flex items-center gap-1 mb-4">
                      ← Back to Fleet
                    </button>
                    <h3 className="text-2xl font-bold text-gray-900">{selectedAgentView.name}</h3>
                    <p className="text-sm font-medium text-gray-500 mt-1">{selectedAgentView.email}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Rank {selectedAgentView.importance}</span>
                      <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-3 py-1 rounded-full">{selectedAgentView.task}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => {
                      const assigned = records.filter(r => {
                        let m = r.custom_metadata;
                        if(typeof m==='string') { try { m = JSON.parse(m); } catch(e){ m={}; } }
                        return m?.agent_id === selectedAgentView.id;
                      }).map(r => r.id);
                      setEditingAgent({...selectedAgentView, assigned_quote_ids: assigned});
                      setSelectedAgentView(null);
                    }} className="px-6 py-2 bg-gray-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors border border-gray-200 shadow-sm">
                      Edit Agent
                    </button>
                    <button onClick={() => {
                      handleDeleteAgent(selectedAgentView.id);
                      setSelectedAgentView(null);
                    }} className="px-6 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors border border-red-100 shadow-sm">
                      Delete Agent
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4 border-b border-gray-100">
                    <button onClick={() => setAgentViewTab('due')} className={`pb-3 text-xs font-bold uppercase tracking-widest ${agentViewTab === 'due' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>Action Needed (Due)</button>
                    <button onClick={() => setAgentViewTab('history')} className={`pb-3 text-xs font-bold uppercase tracking-widest ${agentViewTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>Follow-up History</button>
                  </div>

                  {(() => {
                    const assignedQuotes = records.filter(r => {
                      let m = r.custom_metadata;
                      if(typeof m==='string') { try { m = JSON.parse(m); } catch(e){ m={}; } }
                      return m?.agent_id === selectedAgentView.id;
                    });

                    // Filter based on tab
                    const displayedQuotes = assignedQuotes.filter(q => {
                      const isHistory = q.follow_up_status != null;
                      if (agentViewTab === 'history') return isHistory;
                      
                      // For 'due' tab:
                      if (isHistory) return false;
                      
                      const freq = selectedAgentView.frequency;
                      if (freq === 0 || freq === 'Immediate') return true;
                      
                      const targetDate = new Date(q.created_at);
                      if (typeof freq === 'number') {
                        targetDate.setDate(targetDate.getDate() + freq);
                      } else {
                        if (freq === 'Daily') targetDate.setDate(targetDate.getDate() + 1);
                        if (freq === '3 Days') targetDate.setDate(targetDate.getDate() + 3);
                        if (freq === 'Weekly') targetDate.setDate(targetDate.getDate() + 7);
                      }
                      
                      return new Date() >= targetDate;
                    });

                    if (displayedQuotes.length === 0) {
                      return (
                        <div className="text-center py-16 bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl">
                          <p className="text-sm text-gray-500 font-medium">No quotes found in this section.</p>
                        </div>
                      );
                    }

                    return displayedQuotes.map((q) => {
                      let meta = q.custom_metadata;
                      if(typeof meta==='string') { try { meta = JSON.parse(meta); } catch(e){ meta={}; } }
                      
                      return (
                        <div key={q.id} className="bg-gray-50/50 border border-gray-200 rounded-2xl p-6 shadow-sm">
                          <div className="flex justify-between items-center mb-6">
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{q.qn_number}</p>
                              <p className="text-lg font-bold text-gray-900">{q.clients?.company_name || meta?.client_name || 'Client'}</p>
                            </div>
                            
                            {agentViewTab === 'due' ? (
                              <button 
                                onClick={async () => {
                                  // Dispatch Agent Manually
                                  try {
                                    const res = await fetch('/api/trigger-agent', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        quoteId: q.id,
                                        tenantId: q.tenant_id,
                                        agentEmail: selectedAgentView.email
                                      })
                                    });
                                    const data = await res.json();
                                    if(data.success) {
                                      alert("Agent Dispatched successfully!");
                                      await fetchRecords(tenantId);
                                    } else {
                                      alert("Failed to dispatch: " + data.error);
                                    }
                                  } catch (e) {
                                    alert("Error: " + e.message);
                                  }
                                }}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                              >
                                Dispatch Agent Manually
                              </button>
                            ) : (
                              <button 
                                onClick={async () => {
                                  const msg = prompt("Enter a simulated client reply:");
                                  if (!msg) return;
                                  const res = await fetch('/api/inbound-email', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      quoteId: q.id,
                                      tenantId: q.tenant_id,
                                      clientMessage: msg,
                                      agentEmail: selectedAgentView.email
                                    })
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    alert("Simulated reply processed!");
                                    await fetchRecords(tenantId);
                                  } else {
                                    alert("Failed: " + data.error);
                                  }
                                }} 
                                className="px-4 py-2 bg-white text-indigo-600 border border-gray-200 rounded-lg text-[10px] font-bold shadow-sm hover:border-indigo-300 transition-colors"
                              >
                                Simulate Client Reply
                              </button>
                            )}
                          </div>

                          {agentViewTab === 'history' && (
                            <>
                              {meta?.agent_summary && (
                                <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl mb-6">
                                  <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">AI Conclusion Summary</p>
                                  <p className="text-sm text-indigo-900 font-medium leading-relaxed">{meta.agent_summary}</p>
                                </div>
                              )}

                              {meta?.agent_conversations && meta.agent_conversations.length > 0 ? (
                                <div className="space-y-4 bg-white p-6 rounded-2xl border border-gray-200 max-h-[400px] overflow-y-auto">
                                  {meta.agent_conversations.map((msg: any, idx: number) => (
                                    <div key={idx} className={`flex flex-col ${msg.role === 'client' ? 'items-start' : 'items-end'}`}>
                                      <div className="flex items-center gap-2 mb-1 px-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{msg.role === 'client' ? 'Client' : 'Agent'}</span>
                                        <span className="text-[9px] font-medium text-gray-300">{new Date(msg.timestamp).toLocaleString()}</span>
                                      </div>
                                      <div className={`p-4 rounded-2xl text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap ${msg.role === 'client' ? 'bg-gray-100 text-gray-800 rounded-tl-sm' : 'bg-indigo-600 text-white rounded-tr-sm shadow-md'}`}>
                                        {msg.content}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 bg-white border border-dashed border-gray-200 rounded-2xl">
                                  <p className="text-xs text-gray-400 font-medium">No conversation history yet.</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.length === 0 ? (
                  <div className="col-span-full text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl">
                    <span className="text-4xl mb-4 block opacity-50">🤖</span>
                    <p className="text-gray-500 font-medium text-sm">No Agents Created Yet</p>
                    <p className="text-gray-400 text-xs mt-1">Create an agent to automate your follow-ups and negotiations.</p>
                  </div>
                ) : (
                  agents.map(a => (
                    <div key={a.id} onClick={() => setSelectedAgentView(a)} className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-indigo-300 group flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{a.name}</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{a.email}</p>
                          </div>
                          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">Rank {a.importance}</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-4 line-clamp-2">{a.task}</p>
                      </div>
                      <div className="flex justify-end pt-4 border-t border-gray-50">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 group-hover:text-indigo-600 transition-colors">View Details & Logs →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {currentView === "dashboard" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto space-y-12">
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 border-b border-gray-200 pb-8">
              <div><h2 className="text-4xl font-bold tracking-tight text-gray-900">Intelligence</h2><p className="text-sm font-medium text-gray-500 mt-2"></p></div>
              <div className="relative w-full lg:w-[26rem]">
                <input value={dashCommand} onChange={e=>setDashCommand(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleGenerateDashInsights()} placeholder="e.g. 'Pie chart of quote statuses'" className="w-full bg-white border border-gray-300 pl-4 pr-12 py-3.5 rounded-xl text-sm font-medium shadow-sm focus:border-indigo-500 outline-none placeholder:text-gray-400"/>
                <button onClick={handleGenerateDashInsights} disabled={isBuildingDash || !tenantId} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black text-white w-9 h-9 rounded-lg flex items-center justify-center hover:bg-gray-800 disabled:bg-gray-300 active:scale-95 transition-transform">{isBuildingDash?<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>:"↑"}</button>
              </div>
            </header>

            {dynamicInsights.length > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-4 md:p-8 mb-12">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-900">AI Generated Insights</h3>
                  </div>
                  <button onClick={()=>setDynamicInsights([])} className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 hover:text-red-500">Clear All</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dynamicInsights.map((insight,idx)=>{
                    let cd=[]; try{ let r=insight.data; if(typeof r==='string') r=JSON.parse(r); if(Array.isArray(r)) cd=r; else if(typeof r==='object'&&r) cd=Object.entries(r).map(([k,v])=>({name:k,value:v})); }catch(e){} cd=cd.map(d=>({name:String(d.name||d.key||'Unknown'),value:Number(d.value||d.count||0)}));
                    return (
                      <div key={insight.id||idx} className={`relative bg-white border border-gray-200 p-6 rounded-2xl shadow-sm group hover:shadow-md transition-all ${insight.type?.includes('chart')?'lg:col-span-2':''}`}>
                        <button onClick={()=>removeInsightCard(insight.id)} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-white font-bold text-xs z-10 active:scale-95 transition-transform">✕</button>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 pr-6">{insight.title}</p>
                        {insight.type==='metric'&&<p className="text-5xl font-bold tracking-tighter text-gray-900">{insight.value}</p>}
                        {insight.type?.includes('chart')&&cd.length>0&&(
                          <div className="h-64 w-full pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              {insight.type==='pie_chart' ? (
                                <PieChart>
                                  <Pie data={cd} nameKey="name" dataKey="value" innerRadius={60} outerRadius={85} paddingAngle={5} stroke="none">
                                    {cd.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                                  </Pie>
                                  <Tooltip contentStyle={{borderRadius:'12px',border:'none',boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.1)',fontWeight:600}}/>
                                </PieChart>
                              ) : insight.type==='line_chart' ? (
                                <AreaChart data={cd} margin={{top:10,right:10,left:-20,bottom:20}}>
                                  <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} dy={10} angle={-35} textAnchor="end" height={50} />
                                  <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val)=>val>=1000?`${(val/1000).toFixed(1)}k`:val} />
                                  <Tooltip cursor={{fill:'#F3F4F6'}} contentStyle={{borderRadius:'12px',border:'none',boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}/>
                                  <Area type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                                </AreaChart>
                              ) : (
                                <BarChart data={cd} margin={{top:10,right:10,left:-20,bottom:20}}>
                                  <defs>
                                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#111827" stopOpacity={1}/>
                                      <stop offset="100%" stopColor="#374151" stopOpacity={0.8}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} dy={10} angle={-35} textAnchor="end" height={50} />
                                  <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val)=>val>=1000?`${(val/1000).toFixed(1)}k`:val} />
                                  <Tooltip cursor={{fill:'#F3F4F6'}} contentStyle={{borderRadius:'12px',border:'none',boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}/>
                                  <Bar dataKey="value" fill="url(#barGradient)" radius={[6,6,0,0]} barSize={32} />
                                </BarChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        )}
                        {insight.type==='list'&&<div className="space-y-3">{cd.map((d,i)=><div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0"><span className="text-xs font-bold text-gray-700 truncate pr-4">{d.name}</span><span className="text-xs font-black bg-gray-100 px-2.5 py-1 rounded-md shrink-0">{d.value}</span></div>)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Total Quotes</p>
                <p className="text-4xl font-bold text-gray-900">{visibleRecords.length}</p>
              </div>
              <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1">Active Filter</p>
                  <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-[10px] font-semibold outline-none cursor-pointer uppercase tracking-wider text-gray-600">
                    {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-4xl font-bold text-gray-900">{visibleRecords.filter(r=>r.status===statusFilter).length}</p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">Filtered Records</p>
                </div>
              </div>
              <div className="bg-white border border-gray-200 p-6 rounded-2xl shadow-sm">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">My Contribution</p>
                <p className="text-4xl font-bold text-indigo-600">{visibleRecords.filter(r=>r.created_by_email===user?.email).length}</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm mb-10">
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Recent Quotes Activity</h3>
                <button onClick={() => setCurrentView('pipeline')} className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800">View All →</button>
              </div>
              <div className="space-y-3">
                {sortedRecords.slice(0, 3).map((r, i) => (
                  <div key={r.id || i} onClick={() => setSelectedRecord(r)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 px-5 py-4 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 hover:border-gray-200 transition-colors gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-gray-900 mb-1">{r.qn_number || r.qn} - {getManifestTitle(r)}</span>
                      <span className="text-[10px] font-semibold text-gray-500">{r.date} • Created by <span className="text-gray-700">{r.created_by_email}</span></span>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                      <span className="text-xs font-bold text-gray-900">{getFieldValue(r, {name: 'subtotal'}) !== '-' ? `₹${getFieldValue(r, {name: 'subtotal'})}` : ''}</span>
                      <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide border shadow-sm ${r.status==='Approved'?'bg-green-50 text-green-700 border-green-200':r.status==='Lost'?'bg-red-50 text-red-700 border-red-200':'bg-white text-gray-700 border-gray-200'}`}>{r.status||"Inquiry"}</span>
                    </div>
                  </div>
                ))}
                {sortedRecords.length === 0 && <p className="text-xs text-gray-500 italic py-4 text-center border border-dashed border-gray-200 rounded-xl">No quotes found.</p>}
              </div>
            </div>

            {isManager && perfData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-6 border-b border-gray-100 pb-3">Other contributions</h3>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={perfData} innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                          {perfData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius:'8px',border:'1px solid #e5e7eb',fontSize:'12px'}}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="flex flex-col justify-center space-y-4">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-2">Split Breakdown</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {perfData.map((d,i)=>(
                      <div key={i} className="flex justify-between items-center bg-gray-50 px-4 py-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:COLORS[i%COLORS.length]}}></div>
                          <span className="text-xs font-semibold text-gray-700">{d.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-900 bg-white border border-gray-200 px-2.5 py-1 rounded-md shadow-sm">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === "pipeline" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 max-w-6xl mx-auto">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center justify-start gap-6">
                <h2 className="text-3xl font-bold text-gray-900">Quotes</h2>
                <button 
                  onClick={()=>{
                    setEditingId(null);
                    setQn("");
                    setDynamicData(blueprint.reduce((acc,s)=>({...acc,[s.title]:s.allow_multiple?[{}]:{}}),{}));
                    setCurrentView('new_entry');
                  }} 
                  className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-sm hover:bg-gray-800 active:scale-95 transition-transform"
                >
                  + New Entry
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <input placeholder="Search quotes..." className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-400" onChange={e=>setSearchTerm(e.target.value)}/>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2"><svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></div>
                </div>
                <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <select value={sortConfig.key} onChange={e=>setSortConfig({...sortConfig,key:e.target.value})} className="px-3 py-2.5 text-xs font-semibold text-gray-600 outline-none cursor-pointer border-r border-gray-100 bg-transparent">
                    <option value="qn_number">Ref ID</option>
                    <option value="date">Date</option>
                    <option value="status">Status</option>
                    {tableColumns.map((c,i)=><option key={i} value={c.name}>{c.label}</option>)}
                  </select>
                  <button onClick={()=>setSortConfig({...sortConfig,direction:sortConfig.direction==='asc'?'desc':'asc'})} className="px-3 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">{sortConfig.direction==='asc'?'↑':'↓'}</button>
                </div>
                <select onChange={e=>{if(e.target.value){handleExportData(e.target.value);e.target.value='';}}} className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2.5 rounded-xl text-xs font-semibold outline-none cursor-pointer shadow-sm">
                  <option value="">Export...</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
                <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportData}/>
                <button onClick={()=>fileInputRef.current?.click()} className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2.5 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform">Import</button>
              </div>
            </div>
            
            {records.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6 flex items-start gap-4">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-sm font-bold text-amber-900">No quotes loaded</p>
                  <p className="text-xs text-amber-700 mt-1">This could mean: (1) Your Supabase <code>quotations</code> table is empty. (2) Your profile's <code>tenant_id</code> doesn't match the records. (3) The <code>qn_number</code> column doesn't exist.</p>
                </div>
              </div>
            )}
            
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto w-full">
                <table className="min-w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-2 whitespace-nowrap">Ref ID</th>
                      {tableColumns.map((c,i)=><th key={i} className={`px-3 py-2 whitespace-nowrap ${c.name === 'client_name' ? 'w-full min-w-[200px]' : ''}`}>{c.label}</th>)}
                      <th className="px-3 py-2 whitespace-nowrap w-[1%]">Created By</th>
                      <th className="px-3 py-2 whitespace-nowrap w-[1%] text-center">Status</th>
                      <th className="px-3 py-2 whitespace-nowrap w-[1%] text-center">Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedRecords.length > 0 ? sortedRecords.map((r,i)=>(
                      <tr key={r.id||i} onClick={()=>setSelectedRecord(r)} className="hover:bg-indigo-50/40 transition-colors cursor-pointer">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="text-xs font-semibold text-gray-900">{r.qn_number||r.qn||r.id?.slice(0,8)}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{r.date||r.quote_date}</p>
                        </td>
                        {tableColumns.map((c,j)=><td key={j} className={`px-3 py-2 whitespace-nowrap text-[11px] text-gray-600 truncate ${c.name === 'client_name' ? 'w-full max-w-[200px]' : 'max-w-[150px]'}`}>{getFieldValue(r,c)}</td>)}
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-600 truncate max-w-[150px] w-[1%]">{r.created_by_email}</td>
                        <td className="px-3 py-2 whitespace-nowrap w-[1%] text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wide border shadow-sm ${r.status==='Approved'?'bg-green-50 text-green-700 border-green-200':r.status==='Lost'?'bg-red-50 text-red-700 border-red-200':'bg-gray-50 text-gray-700 border-gray-200'}`}>
                            {r.status||"Inquiry"}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap w-[1%] text-center">
                           <button onClick={(e) => { e.stopPropagation(); handleViewDocument(r); }} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-[9px] font-bold uppercase hover:bg-gray-50 active:scale-95 transition-transform text-indigo-600 shadow-sm">View</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={tableColumns.length+4} className="py-8 text-center"><p className="text-gray-400 font-medium text-[11px] tracking-wider">No Records Found.</p></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === "docs" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
            <header className="mb-10"><h2 className="text-3xl font-bold text-gray-900">Document Library</h2></header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {docsRecords.length > 0 ? docsRecords.map((r,i)=>(
                <div key={r.id||i} className="relative bg-white border border-gray-200 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group flex flex-col">
                  <button onClick={e=>{e.stopPropagation();handleDelete(r.id);}} className="absolute top-4 right-4 w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all z-10 active:scale-95">🗑</button>
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-10 h-10 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center font-bold text-[10px] border border-gray-200 group-hover:bg-gray-900 group-hover:text-white transition-colors">PDF</div>
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100">{r.date||r.quote_date}</span>
                  </div>
                  <div className="flex-1"><h4 className="font-bold text-lg mb-1 text-gray-900">{r.qn_number||r.qn}</h4><p className="text-[11px] text-gray-500 mb-6 truncate font-medium">{getManifestTitle(r)}</p></div>
                  <div className="flex gap-2">
                    <button onClick={(e)=>{ e.stopPropagation(); handleViewDocument(r); }} className="flex-1 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded text-[9px] font-bold uppercase tracking-wider active:scale-95 transition-transform">View</button>
                    <button onClick={(e)=>{ e.stopPropagation(); handleGeneratePDF(r); }} className="flex-1 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded text-[9px] font-bold uppercase tracking-wider active:scale-95 transition-transform">Export</button>
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-20 text-center text-gray-400 font-medium text-xs tracking-wider border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50">Generate a PDF to add it to the Library.</div>
              )}
            </div>
          </div>
        )}

        {currentView === "new_entry" && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <h2 className="text-3xl font-bold text-gray-900">{editingId ? "Revise Entry" : "Create Entry"}</h2>
              <div className="flex items-center gap-3">
                <button onClick={()=>{setEditingId(null);setCurrentView('pipeline');setSelectedRecord(null);}} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 active:scale-95 transition-transform">Discard</button>
                <button onClick={handleSave} className="bg-white text-white px-6 py-2.5 rounded-xl font-semibold text-xs shadow-sm hover:bg-gray-800 active:scale-95 transition-transform" style={{ backgroundColor: '#111827' }}>Save</button>
              </div>
            </div>
            
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 mb-8 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Ref ID</label><input readOnly className="w-full bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 outline-none cursor-not-allowed italic" value={qn || "Auto-generated on save"}/></div>
              <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Date</label><input type="date" className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400" value={date} onChange={e=>setDate(e.target.value)}/></div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">Assign Agent</label>
                <select className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400" value={dynamicData.agent_id || ""} onChange={e => setDynamicData({ ...dynamicData, agent_id: e.target.value })}>
                  <option value="">None (Manual Follow-up)</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} - Rank {a.importance}</option>)}
                </select>
              </div>
            </div>
            
            <div className="space-y-8 pb-20">
              {blueprint.filter(s => s.title.toLowerCase() !== "status logs").map((section, sIdx) => (
                <div key={sIdx} className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-3"><span className="w-2 h-2 bg-gray-300 rounded-full"></span>{section.title}</h3>
                    {section.allow_multiple && (
                      <button onClick={()=>{const nd={...dynamicData}; nd[section.title]=[...(nd[section.title]||[]),{}]; setDynamicData(nd);}} className="text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg uppercase tracking-wider active:scale-95 transition-transform">+ Add Row</button>
                    )}
                  </div>
                  
                  {section.allow_multiple ? (
                    <div className="space-y-4">
                      {(dynamicData[section.title]||[]).map((row,rIdx) => (
                        <div key={rIdx} className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
                          {section.fields.map((f,fIdx) => (
                            <div key={fIdx} className="space-y-1.5">
                              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">{f.label}</label>
                              {f.type === "dropdown" || f.type === "master_status" ? (
                                <select 
                                  value={row[f.name]||""} 
                                  onChange={e=>{const nd={...dynamicData};nd[section.title][rIdx][f.name]=e.target.value;setDynamicData(nd);}} 
                                  className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 shadow-sm"
                                >
                                  <option value="">Select...</option>
                                  {f.options && String(f.options).split(",").map((o,i)=><option key={i} value={o.trim()}>{o.trim()}</option>)}
                                </select>
                              ) : f.type === "logged_in" ? (
                                <input type="text" readOnly value={user?.email||""} className="w-full bg-gray-100 border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none shadow-sm cursor-not-allowed text-gray-500" />
                              ) : f.type === "file" || f.type === "attachment" ? (
                                <div className="flex flex-col gap-1">
                                  <input type="file" onChange={e=>{const file=e.target.files[0];if(file){const reader=new FileReader();reader.onload=(ev)=>{const nd={...dynamicData};nd[section.title][rIdx][f.name]=ev.target.result;setDynamicData(nd);};reader.readAsDataURL(file);}}} className="w-full bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs font-medium outline-none shadow-sm focus:border-gray-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                                  {(row[f.name]) && <span className="text-[9px] text-green-600 font-bold ml-1">✓ File Attached</span>}
                                </div>
                              ) : (
                                <input 
                                  type={f.type==="number"?"number":f.type==="date"?"date":"text"} 
                                  value={f.type === "calculated" && row[f.name] != null && row[f.name] !== "" ? Number(row[f.name]).toFixed(2) : (row[f.name]||"")} 
                                  readOnly={f.type==="calculated"} 
                                  onChange={e=>{const nd={...dynamicData};nd[section.title][rIdx][f.name]=e.target.value;setDynamicData(nd);}} 
                                  className={`w-full bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-medium outline-none focus:border-gray-400 shadow-sm ${f.type==='calculated'?'bg-gray-100 cursor-not-allowed text-indigo-700 font-bold':''}`} 
                                  placeholder="..."
                                />
                              )}
                            </div>
                          ))}
                          <button onClick={()=>{const nd={...dynamicData};nd[section.title].splice(rIdx,1);setDynamicData(nd);}} className="absolute -top-3 -right-3 bg-white text-red-500 hover:text-white hover:bg-red-500 w-7 h-7 rounded-full border border-gray-200 shadow-sm flex items-center justify-center text-xs transition-colors active:scale-95">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {section.fields.map((f,fIdx) => (
                        <div key={fIdx} className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1">{f.label}</label>
                          {f.type === "dropdown" || f.type === "master_status" ? (
                            <select 
                              value={dynamicData[section.title]?.[f.name]||""} 
                              onChange={e=>{const nd={...dynamicData};nd[section.title][f.name]=e.target.value;setDynamicData(nd);}} 
                              className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400"
                            >
                              <option value="">Select...</option>
                              {f.options && String(f.options).split(",").map((o,i)=><option key={i} value={o.trim()}>{o.trim()}</option>)}
                            </select>
                          ) : f.type === "logged_in" ? (
                            <input type="text" readOnly value={user?.email||""} className="w-full bg-gray-100 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none cursor-not-allowed text-gray-500" />
                          ) : f.type === "file" || f.type === "attachment" ? (
                            <div className="flex flex-col gap-1">
                              <input type="file" onChange={e=>{const file=e.target.files[0];if(file){const reader=new FileReader();reader.onload=(ev)=>{const nd={...dynamicData};nd[section.title][f.name]=ev.target.result;setDynamicData(nd);};reader.readAsDataURL(file);}}} className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-medium outline-none focus:border-gray-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" />
                              {(dynamicData[section.title]?.[f.name]) && <span className="text-[9px] text-green-600 font-bold ml-1">✓ File Attached</span>}
                            </div>
                          ) : (
                            <input 
                              type={f.type==="number"?"number":f.type==="date"?"date":"text"} 
                              value={f.type === "calculated" && dynamicData[section.title]?.[f.name] != null && dynamicData[section.title]?.[f.name] !== "" ? Number(dynamicData[section.title][f.name]).toFixed(2) : (dynamicData[section.title]?.[f.name]||"")} 
                              readOnly={f.type==="calculated"} 
                              onChange={e=>{const nd={...dynamicData};nd[section.title][f.name]=e.target.value;setDynamicData(nd);}} 
                              className={`w-full border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium outline-none focus:border-gray-400 ${f.type==='calculated'?'bg-indigo-50 text-indigo-700 font-bold cursor-not-allowed':'bg-gray-50 hover:bg-white focus:bg-white'}`} 
                              placeholder="..."
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === "copilot" && (
          <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
            <header className="mb-6"><h2 className="text-3xl font-bold text-gray-900">Bloomgard AI</h2><p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mt-1">Deep Data Analysis</p></header>
            <div className="flex-1 bg-white border border-gray-200 rounded-[2rem] shadow-sm flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-gray-50/30">
                {chatHistory.length===0?(
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-50 px-4"><div className="text-5xl mb-4">🧠</div><p className="text-sm font-bold text-gray-700">How can I help you analyze your pipeline today?</p><p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mt-2">I can read your manifest data in real-time.</p></div>
                ) : chatHistory.map((msg,i) => (
                  <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[85%] md:max-w-[80%] rounded-2xl p-5 shadow-sm text-sm leading-relaxed ${msg.role==='user'?'bg-gray-900 text-white rounded-br-none':'bg-white border border-gray-200 text-gray-700 rounded-bl-none'}`}>{msg.role==='ai'?formatAIText(msg.content):msg.content}</div></div>
                ))}
                {isThinking && <div className="flex justify-start"><div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none p-5 shadow-sm flex items-center gap-3"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div><span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Analyzing...</span></div></div>}
                <div ref={chatEndRef}/>
              </div>
              <div className="p-4 md:p-6 bg-white border-t border-gray-100">
                <div className="relative max-w-4xl mx-auto flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={()=>handleSendChatAI("What are my most sold products?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">What are my most sold products?</button>
                    <button onClick={()=>handleSendChatAI("What is my most referred lead source?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">What is my most referred source?</button>
                    <button onClick={()=>handleSendChatAI("What is the most used application?")} className="bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-[10px] font-semibold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 shadow-sm transition-colors active:scale-95">What is the most used application?</button>
                  </div>
                  <div className="relative">
                    <input value={currentInput} onChange={e=>setCurrentInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSendChatAI()} placeholder="Ask a question about your pipeline data..." className="w-full bg-gray-50 border border-gray-200 pl-4 md:pl-6 pr-14 py-4 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-indigo-400 shadow-inner"/>
                    <button onClick={()=>handleSendChatAI()} disabled={isThinking||!currentInput.trim() || !tenantId} className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white w-9 h-9 rounded-lg flex items-center justify-center hover:bg-indigo-700 disabled:bg-gray-300 shadow-sm active:scale-95 transition-transform">↑</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedRecord && (
          <div className="fixed inset-0 z-[150] flex justify-end bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl h-full bg-white shadow-2xl p-6 md:p-10 overflow-y-auto animate-in slide-in-from-right duration-300 border-l border-gray-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 break-words pr-4">{getManifestTitle()}</h3>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1">Ref ID: {selectedRecord.qn_number||selectedRecord.qn||selectedRecord.id?.slice(0,8).toUpperCase()}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>loadRecordForEditing(selectedRecord)} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600 active:scale-95 transition-transform" title="Edit">✎</button>
                  <button onClick={()=>handleDelete(selectedRecord.id)} className="w-10 h-10 bg-red-50 border border-red-100 text-red-500 rounded-lg flex items-center justify-center hover:bg-red-100 active:scale-95 transition-transform" title="Delete">🗑</button>
                  <button onClick={()=>setSelectedRecord(null)} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-transform">✕</button>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-8 p-5 bg-gray-50 border border-gray-200 rounded-2xl items-center shadow-sm">
                <div className="min-w-[120px]">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Status</p>
                  <p className="text-sm font-bold text-gray-900">{selectedRecord.status}</p>
                </div>
                <div className="flex-1 overflow-x-auto pb-1 scrollbar-hide w-full">
                  <div className="flex gap-2 w-max">
                    {allStatuses.map(s => (
                      <button 
                        key={s} 
                        onClick={() => updateStatus(selectedRecord.id, s)} 
                        disabled={selectedRecord.status === s} 
                        className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm active:scale-95 transition-all whitespace-nowrap ${selectedRecord.status === s ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-8">
                 <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-2">Manifest Audit Log</h4>
                 <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Date & Time</th>
                            <th className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Agent</th>
                            <th className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Transition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {(() => {
                             const logs = selectedRecord?.status_logs || extractArray(selectedRecord, "status_logs") || extractArray(selectedRecord, "status logs");
                             
                             if (!logs || logs.length === 0) {
                                return <tr><td colSpan={3} className="px-4 py-4 text-[10px] text-gray-400 text-center font-medium">No status history found.</td></tr>;
                             }

                             return [...logs].reverse().map((log, lIdx) => {
                               let agent = "-"; 
                               let comment = log.comments || ""; 
                               
                               if (comment.includes("by ")) { 
                                  const parts = comment.split("by "); 
                                  agent = parts[1]; 
                               } else if (log.created_by) {
                                  agent = log.created_by;
                               }

                               return (
                                 <tr key={lIdx} className="hover:bg-gray-50/50 transition-colors">
                                   <td className="px-4 py-3 text-[10px] text-gray-600 whitespace-nowrap">
                                     {log.created_at ? new Date(log.created_at).toLocaleString() : new Date().toLocaleString()}
                                   </td>
                                   <td className="px-4 py-3 text-[10px] font-bold text-gray-900 whitespace-nowrap">
                                     {agent}
                                   </td>
                                   <td className="px-4 py-3 text-[10px] text-gray-600 whitespace-nowrap">
                                     <span className="text-gray-400 strike-through line-through mr-1">{log.old_status || 'Start'}</span> 
                                     → 
                                     <span className="font-bold text-indigo-600 ml-1">{log.new_status}</span>
                                   </td>
                                 </tr>
                               );
                             });
                          })()}
                        </tbody>
                      </table>
                    </div>
                 </div>
              </div>

              <div className="space-y-8">
                {blueprint.filter(s => s.title.toLowerCase() !== "status logs").map((section, sIdx) => {
                  return (
                    <div key={sIdx} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4 border-b border-gray-100 pb-2">{section.title}</h4>
                      {section.allow_multiple ? (
                        <div className="space-y-4">
                          {(() => {
                            const items = extractArray(selectedRecord, section.title);
                            if (!items || !items.length) return <p className="text-xs text-gray-400 font-medium">No records attached.</p>;
                            return items.map((row, rIdx) => (
                              <div key={rIdx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                {section.fields.filter(f => f.type !== 'master_status').map((f, fIdx) => {
                                  const v = extractValue(row, f.name);
                                  return (
                                    <div key={fIdx} className="flex flex-col">
                                      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                                      <p className="text-sm font-medium text-gray-900 break-words">
                                        {f.type === 'file' || f.type === 'attachment' ? (v ? <span className="text-green-600 text-[10px] font-bold">✓ File Secured</span> : '—') : (v !== '' && v != null ? String(v) : '—')}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                          {section.fields.filter(f => f.type !== 'master_status').map((f, fIdx) => {
                            const v = extractValue(selectedRecord, f.name, section.title);
                            return (
                              <div key={fIdx} className="flex flex-col border-b border-gray-50 pb-2">
                                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                                <p className="text-sm font-medium text-gray-900 break-words">
                                  {f.type === 'file' || f.type === 'attachment' ? (v ? <span className="text-green-600 text-[10px] font-bold">✓ File Secured</span> : '—') : (v != null && v !== '' ? String(v) : '—')}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-12 pt-8 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4 pb-8">
                <button onClick={() => handleViewDocument(selectedRecord)} className="bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-xs hover:bg-gray-50 shadow-sm active:scale-95 transition-transform">Preview PDF</button>
                <button onClick={() => handleGeneratePDF(selectedRecord)} className="bg-white border border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold text-xs hover:bg-gray-50 shadow-sm active:scale-95 transition-transform">Download PDF</button>
                <button onClick={() => handleOpenEmailComposer(selectedRecord)} className="bg-gray-900 text-white py-3.5 rounded-xl font-semibold text-xs shadow-md hover:bg-gray-800 active:scale-95 transition-transform">Mail</button>
              </div>
            </div>
          </div>
        )}

        {viewingDoc && (
          <div className="fixed inset-0 z-[200] bg-gray-900/60 backdrop-blur-sm flex justify-center items-center p-4 lg:p-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-[10px] uppercase shadow-sm">DOC</div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{viewingDoc.title}</h3>
                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mt-0.5">Rendered Preview</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => downloadDirectPDF(viewingDoc.html, viewingDoc.title)} className="bg-white border border-gray-200 hover:border-gray-400 text-gray-700 px-4 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider shadow-sm hidden sm:block active:scale-95 transition-transform">Export PDF</button>
                  <button onClick={() => setViewingDoc(null)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-red-500 hover:text-white rounded-lg font-bold transition-colors active:scale-95 transition-transform">✕</button>
                </div>
              </div>
              <div className="flex-1 bg-gray-100 p-2 md:p-6 flex justify-center overflow-hidden">
                <div className="w-full max-w-4xl h-full bg-white shadow-xl overflow-y-auto border border-gray-300">
                  <iframe srcDoc={viewingDoc.html} className="w-full h-full border-none" title="Document Render"/>
                </div>
              </div>
            </div>
          </div>
        )}

        {showEmailModal && (
          <div className="fixed inset-0 z-[300] bg-gray-900/60 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 max-h-[90vh]">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">Deploy Email</h3>
                <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-red-500 font-bold w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform">✕</button>
              </div>
              <div className="p-6 space-y-5 flex-1 overflow-y-auto">
                <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Recipient</label><input type="email" value={emailDraft.to} onChange={e=>setEmailDraft({...emailDraft,to:e.target.value})} className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-lg text-sm font-medium outline-none focus:border-gray-400" placeholder="client@company.com"/></div>
                <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Subject</label><input value={emailDraft.subject} onChange={e=>setEmailDraft({...emailDraft,subject:e.target.value})} className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-lg text-sm font-medium outline-none focus:border-gray-400"/></div>
                <div className="space-y-1.5"><label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Message</label><textarea rows={5} value={emailDraft.message} onChange={e=>setEmailDraft({...emailDraft,message:e.target.value})} className="w-full bg-white border border-gray-200 px-4 py-2.5 rounded-lg text-sm outline-none focus:border-gray-400 resize-none"/></div>
                
                <div className="space-y-1.5 pt-2">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Attachments</label>
                  
                  <div 
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { 
                      e.preventDefault(); e.stopPropagation();
                      const files = Array.from(e.dataTransfer.files);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setEmailDraft(prev => ({ 
                            ...prev, 
                            attachments: [...(prev.attachments||[]), { filename: file.name, base64: ev.target.result }] 
                          }));
                        };
                        reader.readAsDataURL(file);
                      });
                    }}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('email-file-upload').click()}
                  >
                    <div className="text-2xl mb-2 opacity-80">📁</div>
                    <p className="text-xs font-bold text-gray-700">Click or drag files here</p>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium tracking-wide">Attach PDFs, Images, or Documents</p>
                    <input 
                      id="email-file-upload" 
                      type="file" 
                      multiple 
                      className="hidden" 
                      onChange={(e) => {
                        const files = Array.from(e.target.files);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setEmailDraft(prev => ({ 
                              ...prev, 
                              attachments: [...(prev.attachments||[]), { filename: file.name, base64: ev.target.result }] 
                            }));
                          };
                          reader.readAsDataURL(file);
                        });
                        e.target.value = ''; 
                      }} 
                    />
                  </div>

                  {emailDraft.attachments && emailDraft.attachments.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                      {emailDraft.attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 border border-gray-200 p-2.5 rounded-xl shadow-sm">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-7 h-7 bg-white rounded flex items-center justify-center text-xs shadow-sm border border-gray-100 shrink-0">📎</div>
                            <p className="text-[11px] font-semibold text-gray-800 truncate">{att.filename}</p>
                          </div>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setEmailDraft(p => ({ 
                                ...p, 
                                attachments: p.attachments.filter((_, i) => i !== idx) 
                              })); 
                            }} 
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform shrink-0 border border-red-100"
                          >
                            ✕ Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 items-center">
                <button onClick={() => setShowEmailModal(false)} className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 px-3 py-2 active:scale-95 transition-transform">Cancel</button>
                <button onClick={sendDraftedEmail} disabled={isSending} className={`px-5 py-2.5 rounded-lg text-xs font-semibold text-white shadow-sm active:scale-95 transition-transform ${isSending?'bg-gray-400 cursor-not-allowed':'bg-gray-900 hover:bg-gray-800'}`}>{isSending?'Sending...':'Send Email'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
