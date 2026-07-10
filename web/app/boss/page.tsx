// @ts-nocheck
"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function BossDashboard() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]);

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    // Fetch tenants with their tracking metrics and feature flags
    const { data } = await supabase.from("tenants").select("*").order("company_name", { ascending: true });
    if (data) {
      setTenants(
        data.map((t) => ({
          ...t,
          feature_flags: t.feature_flags || {
            ai_email: { enabled: false, billable: false },
            analytics: { enabled: false, billable: false },
            custom_branding: { enabled: false, billable: false },
          },
          billing_formula: t.billing_formula || "(quotes * 0.5) + (tokens * 0.001) + (emails * 0.1) + 50",
        }))
      );
    }
    setLoading(false);
  }

  const updateTenantField = async (id: string, field: string, value: any) => {
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
    await supabase.from("tenants").update({ [field]: value }).eq("id", id);
  };

  const updateFeatureFlag = async (id: string, featureKey: string, flagType: 'enabled' | 'billable', value: boolean) => {
    const tenant = tenants.find((t) => t.id === id);
    if (!tenant) return;

    const newFlags = {
      ...tenant.feature_flags,
      [featureKey]: {
        ...tenant.feature_flags[featureKey],
        [flagType]: value,
      },
    };

    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, feature_flags: newFlags } : t)));
    await supabase.from("tenants").update({ feature_flags: newFlags }).eq("id", id);
  };

  const handleCreateWorkspace = async () => {
    const newId = crypto.randomUUID();
    const { error } = await supabase.from("tenants").insert([
      {
        id: newId,
        company_name: "New Workspace",
        ai_enabled: false,
        quotes_generated: 0,
        ai_tokens_used: 0,
        emails_sent: 0,
        feature_flags: {
          ai_email: { enabled: false, billable: false },
          analytics: { enabled: false, billable: false },
          custom_branding: { enabled: false, billable: false },
        },
      },
    ]);
    if (!error) {
      await fetchTenants();
    } else {
      alert("Error creating workspace: " + error.message);
    }
  };

  const handleTerminateClient = async (id: string, name: string) => {
    const check = prompt(`Type "TERMINATE" to permanently wipe ${name}:`);
    if (check === "TERMINATE") {
      const { error } = await supabase.rpc("decommission_client_full", { target_tenant: id });
      if (error) return alert("Termination Failed: " + error.message);
      await fetchTenants();
      alert("Client Eradicated.");
    }
  };

  const calculateBill = (tenant: any) => {
    try {
      const formula = tenant.billing_formula || "0";
      const quotes = tenant.quotes_generated || 0;
      const tokens = tenant.ai_tokens_used || 0;
      const emails = tenant.emails_sent || 0;
      const base_fee = 0; // Default base fee if used in formula

      // Safely evaluate math expression
      const evalFunc = new Function("quotes", "tokens", "emails", "base_fee", `return ${formula};`);
      const result = evalFunc(quotes, tokens, emails, base_fee);
      
      if (isNaN(result)) return "Err";
      return `$${Number(result).toFixed(2)}`;
    } catch (e) {
      return "Err";
    }
  };

  if (loading) {
    return <div className="p-8 font-mono text-sm">Loading Boss Command...</div>;
  }

  return (
    <div className="min-h-screen bg-white font-mono text-xs text-gray-800 p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider text-black">Boss Command</h1>
          <p className="text-gray-500 mt-1">Super Admin & Billing Portal</p>
        </div>
        <button
          onClick={handleCreateWorkspace}
          className="bg-black text-white px-4 py-2 font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          + Add Workspace
        </button>
      </div>

      <div className="border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-semibold">Tenant Name</th>
              <th className="px-4 py-3 font-semibold border-l border-gray-200">Usage Metrics</th>
              <th className="px-4 py-3 font-semibold border-l border-gray-200">Feature Toggles</th>
              <th className="px-4 py-3 font-semibold border-l border-gray-200">Dynamic Billing Formula</th>
              <th className="px-4 py-3 font-semibold border-l border-gray-200 text-right">Current Bill</th>
              <th className="px-4 py-3 font-semibold border-l border-gray-200 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-gray-50/50 transition-colors">
                
                {/* Tenant Name */}
                <td className="px-4 py-4 align-top">
                  <input
                    type="text"
                    className="font-bold text-sm bg-transparent border-b border-transparent focus:border-black outline-none w-48 transition-colors"
                    value={tenant.company_name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, company_name: val } : t)));
                    }}
                    onBlur={(e) => updateTenantField(tenant.id, "company_name", e.target.value)}
                  />
                  <div className="text-[10px] text-gray-400 mt-1 font-mono">{tenant.id.split("-")[0]}...</div>
                </td>

                {/* Usage Metrics */}
                <td className="px-4 py-4 align-top border-l border-gray-200">
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between w-40">
                      <span className="text-gray-500">Quotes:</span>
                      <span className="font-bold">{tenant.quotes_generated || 0}</span>
                    </div>
                    <div className="flex justify-between w-40">
                      <span className="text-gray-500">AI Tokens:</span>
                      <span className="font-bold">{tenant.ai_tokens_used || 0}</span>
                    </div>
                    <div className="flex justify-between w-40">
                      <span className="text-gray-500">Emails:</span>
                      <span className="font-bold">{tenant.emails_sent || 0}</span>
                    </div>
                  </div>
                </td>

                {/* Feature Toggles */}
                <td className="px-4 py-4 align-top border-l border-gray-200">
                  <div className="space-y-3">
                    {Object.keys(tenant.feature_flags).map((featKey) => (
                      <div key={featKey} className="flex items-center gap-4 bg-gray-50 p-2 rounded border border-gray-100">
                        <span className="w-24 uppercase font-bold text-[10px]">{featKey.replace("_", " ")}</span>
                        
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-black w-3 h-3 cursor-pointer"
                            checked={tenant.feature_flags[featKey]?.enabled || false}
                            onChange={(e) => updateFeatureFlag(tenant.id, featKey, "enabled", e.target.checked)}
                          />
                          <span className="text-[10px] text-gray-500 uppercase">Enable</span>
                        </label>
                        
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-black w-3 h-3 cursor-pointer"
                            checked={tenant.feature_flags[featKey]?.billable || false}
                            onChange={(e) => updateFeatureFlag(tenant.id, featKey, "billable", e.target.checked)}
                          />
                          <span className="text-[10px] text-gray-500 uppercase">Billable</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </td>

                {/* Dynamic Billing Formula */}
                <td className="px-4 py-4 align-top border-l border-gray-200">
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest">Formula String</p>
                    <input
                      type="text"
                      className="w-64 bg-gray-50 border border-gray-200 p-2 text-xs font-mono outline-none focus:border-black transition-colors"
                      value={tenant.billing_formula || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, billing_formula: val } : t)));
                      }}
                      onBlur={(e) => updateTenantField(tenant.id, "billing_formula", e.target.value)}
                      placeholder="(quotes * 0.5) + (tokens * 0.001) + base_fee"
                    />
                    <p className="text-[9px] text-gray-400 mt-2">Vars: quotes, tokens, emails, base_fee</p>
                  </div>
                </td>

                {/* Current Bill */}
                <td className="px-4 py-4 align-top border-l border-gray-200 text-right">
                  <span className="text-lg font-bold text-black">{calculateBill(tenant)}</span>
                  <p className="text-[10px] text-gray-400 uppercase mt-1">/ mo</p>
                </td>

                {/* Actions */}
                <td className="px-4 py-4 align-top border-l border-gray-200 text-center">
                  <button
                    onClick={() => handleTerminateClient(tenant.id, tenant.company_name)}
                    className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                  >
                    Terminate
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}