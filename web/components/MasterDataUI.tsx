"use client";

import React, { useState } from "react";
import { MasterDataEntry, MasterDataValue, useMasterDataFields } from "@/hooks/useMasterDataFields";
import { Wand2, X, Save } from "lucide-react";

type MasterDataUIProps = {
  tenantId: string;
  schemaFields: string[];
};

export default function MasterDataUI({ tenantId, schemaFields }: MasterDataUIProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('manual');
  const { masterTree, isLoading, refreshTree } = useMasterDataFields(tenantId, activeTab);

  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [selectedEntryForAi, setSelectedEntryForAi] = useState<MasterDataEntry | null>(null);
  const [aiDescription, setAiDescription] = useState("");

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false);
  const [createKeyParentId, setCreateKeyParentId] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");

  const handleCreateKey = async () => {
    if (!newKeyName) return;
    
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createMasterKey',
        payload: {
          tenant_id: tenantId,
          tab_type: activeTab,
          key_name: newKeyName,
          parent_id: createKeyParentId
        }
      })
    });
    setCreateKeyModalOpen(false);
    setNewKeyName("");
    refreshTree();
  };

  const openCreateKeyModal = (parentId: string | null) => {
    setCreateKeyParentId(parentId);
    setNewKeyName(schemaFields.length > 0 ? schemaFields[0] : "");
    setCreateKeyModalOpen(true);
  };

  const handleAddValue = async (entryId: string) => {
    const value = prompt("Enter new value option:");
    if (!value || !value.trim()) return;
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'addValueOption',
        payload: {
          entry_id: entryId,
          value_text: value
        }
      })
    });
    refreshTree();
  };

  const handleSaveAiDescription = async () => {
    if (!selectedEntryForAi) return;
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateAIDescription',
        payload: {
          id: selectedEntryForAi.id,
          ai_description: aiDescription
        }
      })
    });
    setAiDrawerOpen(false);
    refreshTree();
  };

  const renderGridNodes = (nodes: MasterDataEntry[], depth = 0) => {
    return nodes.map(node => (
      <React.Fragment key={node.id}>
        {/* The Action row ABOVE the value */}
        <tr className="bg-white">
          <td className="border-r-2 border-black p-0" style={{ minWidth: `${depth * 40 + 150}px` }}>
            {/* Empty space above Key */}
          </td>
          <td className="p-0 border-r-2 border-black">
            <div className="flex items-end">
              <button 
                onClick={() => handleAddValue(node.id)}
                className="bg-[#436bf9] text-white w-24 h-10 flex items-center justify-center font-bold text-3xl hover:bg-blue-600 transition-colors"
                title="Add Value Option"
              >
                +
              </button>
              <button 
                onClick={() => {
                  setSelectedEntryForAi(node);
                  setAiDescription(node.ai_description || "");
                  setAiDrawerOpen(true);
                }}
                className="bg-[#f042d7] text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-3xl hover:scale-105 transition-transform ml-2 mb-1 shadow-sm"
                title="AI Settings"
              >
                +
              </button>
            </div>
          </td>
          <td className="border-r-2 border-black"></td>
          <td className="border-r-2 border-black"></td>
        </tr>

        {/* The Key / Value row */}
        <tr className="bg-white">
          <td className="border-r-2 border-t-2 border-b-2 border-black p-4 flex items-center h-full min-h-[64px]" style={{ paddingLeft: `${depth * 40 + 16}px` }}>
            <span className="text-[#3b82f6] text-2xl font-semibold mr-2">Key : </span>
            <span className="text-gray-900 text-2xl font-medium">{node.key_name}</span>
          </td>
          <td className="border-r-2 border-t-2 border-b-2 border-black p-4 relative min-h-[64px]">
            <div className="flex flex-col">
              <span className="text-[#4a4a4a] text-2xl font-medium mb-3">Value</span>
              <div className="flex flex-wrap gap-2">
                {node.values?.map(val => (
                  <span key={val.id} className="bg-gray-200 text-gray-800 px-3 py-1.5 text-sm font-medium rounded border border-gray-300">
                    {val.value_text}
                  </span>
                ))}
              </div>
            </div>
          </td>
          <td className="border-r-2 border-t-2 border-b-2 border-black p-0">
             <button 
                onClick={() => openCreateKeyModal(node.id)}
                className="bg-[#436bf9] text-white w-12 h-[calc(100%+4px)] min-h-[64px] flex items-center justify-center font-bold text-3xl hover:bg-blue-600 transition-colors"
                title="Add Nested Child Key"
                style={{ marginTop: "-2px", marginBottom: "-2px" }}
              >
                +
              </button>
          </td>
          <td className="border-r-2 border-t-2 border-b-2 border-black p-0 min-w-[200px]"></td>
        </tr>

        {/* The Span Row to add Sibling */}
        <tr className="bg-white">
          <td colSpan={2} className="border-r-2 border-b-2 border-black p-0 h-10">
             <button 
                onClick={() => openCreateKeyModal(node.parent_id)}
                className="bg-[#436bf9] text-white w-full h-full flex items-center justify-center font-bold text-3xl hover:bg-blue-600 transition-colors"
                title="Add Sibling Key"
              >
                +
              </button>
          </td>
          <td className="border-r-2 border-b-2 border-black p-0"></td>
          <td className="border-r-2 border-b-2 border-black p-0"></td>
        </tr>
        
        {/* Recursive Children */}
        {node.children && node.children.length > 0 && renderGridNodes(node.children, depth + 1)}
      </React.Fragment>
    ));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[700px] animate-in fade-in zoom-in-95 duration-500">
      
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 pt-3">
        <button 
          onClick={() => setActiveTab('manual')}
          className={`px-6 py-2.5 text-sm font-semibold border-b-2 rounded-t-lg transition-colors ${activeTab === 'manual' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          Manual Data
        </button>
        <button 
          onClick={() => setActiveTab('auto')}
          className={`px-6 py-2.5 text-sm font-semibold border-b-2 rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'auto' ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          <Wand2 size={14} className={activeTab === 'auto' ? 'text-indigo-600' : 'text-gray-400'}/>
          Auto-Captured Data
        </button>
      </div>

      <div className="p-8 flex-1 overflow-auto bg-white">
        
        {isLoading ? (
          <div className="text-gray-400 text-center mt-20 font-medium">Loading Excel Grid...</div>
        ) : (
          <div className="inline-block relative">
             <table className="border-collapse border-4 border-black min-w-[800px] table-fixed bg-white">
               <tbody>
                  {masterTree.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="border-2 border-black p-0 h-12">
                         <button 
                            onClick={() => openCreateKeyModal(null)}
                            className="bg-[#436bf9] text-white w-full h-full flex items-center justify-center font-bold text-3xl hover:bg-blue-600 transition-colors"
                          >
                            +
                          </button>
                      </td>
                      <td className="border-2 border-black w-16"></td>
                      <td className="border-2 border-black min-w-[200px]"></td>
                    </tr>
                  ) : (
                    renderGridNodes(masterTree)
                  )}
                  {/* Empty rows at the bottom for strict grid aesthetic */}
                  <tr><td className="border-2 border-black h-16 w-64"></td><td className="border-2 border-black min-w-[300px]"></td><td className="border-2 border-black w-16"></td><td className="border-2 border-black min-w-[200px]"></td></tr>
                  <tr><td className="border-2 border-black h-16"></td><td className="border-2 border-black"></td><td className="border-2 border-black"></td><td className="border-2 border-black"></td></tr>
                  <tr><td className="border-2 border-black h-16"></td><td className="border-2 border-black"></td><td className="border-2 border-black"></td><td className="border-2 border-black"></td></tr>
               </tbody>
             </table>
          </div>
        )}

      </div>

      {/* Create Key Modal (Schema Dropdown) */}
      {createKeyModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-xl text-gray-900">Add New Key</h3>
              <button onClick={() => setCreateKeyModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Select Schema Field</label>
              {schemaFields.length === 0 ? (
                <div className="p-4 bg-orange-50 text-orange-700 text-sm rounded-xl border border-orange-200 mb-4">
                  No schema fields found. Please configure your Quote blueprint first to populate available fields.
                </div>
              ) : (
                <select 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-[#436bf9] cursor-pointer mb-6"
                >
                  <option value="" disabled>Select a field...</option>
                  {schemaFields.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}
              
              <div className="flex justify-end gap-3 mt-4">
                <button 
                  onClick={() => setCreateKeyModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateKey}
                  disabled={!newKeyName}
                  className="bg-[#436bf9] text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Drawer */}
      {aiDrawerOpen && selectedEntryForAi && (
        <div className="absolute inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Wand2 size={16} className="text-[#f042d7]" />
              AI Knowledge Configuration
            </h3>
            <button onClick={() => setAiDrawerOpen(false)} className="text-gray-400 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <p className="text-sm text-gray-600 mb-4">
              Configure how the AI agent should understand and use the key <strong className="text-gray-900">"{selectedEntryForAi.key_name}"</strong>.
            </p>
            <textarea
              className="w-full flex-1 border border-gray-200 rounded-xl p-4 text-sm focus:outline-none focus:border-[#f042d7] resize-none bg-gray-50 focus:bg-white transition-colors"
              placeholder="e.g. 'Use this key to classify...'"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
            />
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
            <button onClick={() => setAiDrawerOpen(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleSaveAiDescription} className="px-4 py-2 text-sm font-semibold text-white bg-[#f042d7] hover:bg-pink-600 rounded-lg shadow-sm flex items-center gap-2">
              <Save size={14} />
              Save AI Config
            </button>
          </div>
        </div>
      )}
      
      {aiDrawerOpen && (
        <div className="absolute inset-0 bg-black/10 z-10" onClick={() => setAiDrawerOpen(false)}></div>
      )}

    </div>
  );
}
