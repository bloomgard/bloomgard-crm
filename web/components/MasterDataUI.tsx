"use client";

import React, { useState } from "react";
import { MasterDataEntry, MasterDataValue, useMasterDataFields } from "@/hooks/useMasterDataFields";
import { Wand2, X, Save, Trash2 } from "lucide-react";

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
  
  const [newValues, setNewValues] = useState<Record<string, string>>({});

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
    const value = newValues[entryId];
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
    setNewValues(prev => ({ ...prev, [entryId]: "" }));
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

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Are you sure you want to delete this key and all its data?")) return;
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'deleteMasterKey',
        payload: { id }
      })
    });
    refreshTree();
  };

  const MAX_LEVELS = 10;
  const TOTAL_COLS = MAX_LEVELS * 3;

  const renderGridNodes = (nodes: MasterDataEntry[], depth = 0) => {
    // If depth exceeds our max supported, cap it so it doesn't break table
    const safeDepth = Math.min(depth, MAX_LEVELS - 1);
    const leftSpacers = safeDepth * 3;
    const rightSpacers = TOTAL_COLS - leftSpacers - 3;
    
    return nodes.map(node => (
      <React.Fragment key={node.id}>
        {/* The Action row ABOVE the value */}
        <tr className="bg-white">
          {Array.from({ length: leftSpacers }).map((_, i) => <td key={`left-${node.id}-1-${i}`} className="border border-black bg-gray-50/30"></td>)}
          
          <td className="border-r border-black p-0 h-10 relative">
            <div className="flex h-full items-end justify-end w-full pr-0 pb-0">
               {/* Red delete button on top of key cell */}
               <button 
                 onClick={() => handleDeleteKey(node.id)}
                 className="bg-red-500 text-white w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
                 title="Delete Key"
               >
                 <Trash2 size={16} />
               </button>
            </div>
          </td>
          <td className="p-0 border-r border-black h-10 align-bottom">
            <div className="flex items-end h-full">
              <button 
                onClick={() => handleAddValue(node.id)}
                className="bg-[#436bf9] text-white w-16 h-8 flex items-center justify-center font-bold text-xl hover:bg-blue-600 transition-colors"
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
                className="bg-[#f042d7] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-xl hover:scale-105 transition-transform ml-2 shadow-sm"
                title="AI Settings"
              >
                +
              </button>
            </div>
          </td>
          <td className="border-r border-black h-10"></td>
          {Array.from({ length: rightSpacers }).map((_, i) => <td key={`right-${node.id}-1-${i}`} className="border border-black bg-gray-50/30"></td>)}
        </tr>

        {/* The Key / Value row */}
        <tr className="bg-white">
          {Array.from({ length: leftSpacers }).map((_, i) => <td key={`left-${node.id}-2-${i}`} className="border border-black bg-gray-50/30"></td>)}
          
          <td className="border-r border-t border-b border-black p-4 flex items-center min-h-[50px] w-full">
            <span className="text-[#3b82f6] text-lg font-semibold mr-2 whitespace-nowrap">Key : </span>
            <span className="text-gray-900 text-lg font-medium truncate">{node.key_name}</span>
          </td>
          <td className="border-r border-t border-b border-black p-4 relative min-h-[50px]">
            <div className="flex flex-col">
              <input 
                type="text" 
                placeholder="Value" 
                value={newValues[node.id] || ""}
                onChange={(e) => setNewValues(prev => ({ ...prev, [node.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddValue(node.id);
                }}
                className="text-[#4a4a4a] text-lg font-medium mb-2 bg-transparent border-none outline-none placeholder-gray-400 focus:ring-0 p-0" 
              />
              <div className="flex flex-wrap gap-2">
                {node.values?.map(val => (
                  <span key={val.id} className="bg-gray-200 text-gray-800 px-2 py-1 text-xs font-medium rounded border border-gray-300">
                    {val.value_text}
                  </span>
                ))}
              </div>
            </div>
          </td>
          <td className="border-r border-t border-b border-black p-0 h-full w-[50px]">
             <button 
                onClick={() => openCreateKeyModal(node.id)}
                className="bg-[#436bf9] text-white w-full h-full min-h-[50px] flex items-center justify-center font-bold text-2xl hover:bg-blue-600 transition-colors"
                title="Add Nested Child Key"
              >
                +
              </button>
          </td>
          {Array.from({ length: rightSpacers }).map((_, i) => <td key={`right-${node.id}-2-${i}`} className="border border-black bg-gray-50/30"></td>)}
        </tr>

        {/* The Span Row to add Sibling */}
        <tr className="bg-white">
          {Array.from({ length: leftSpacers }).map((_, i) => <td key={`left-${node.id}-3-${i}`} className="border border-black bg-gray-50/30"></td>)}
          
          <td colSpan={2} className="border-r border-b border-black p-0 h-8">
             <button 
                onClick={() => openCreateKeyModal(node.parent_id)}
                className="bg-[#436bf9] text-white w-full h-full flex items-center justify-center font-bold text-2xl hover:bg-blue-600 transition-colors"
                title="Add Sibling Key"
              >
                +
              </button>
          </td>
          <td className="border-r border-b border-black p-0"></td>
          {Array.from({ length: rightSpacers }).map((_, i) => <td key={`right-${node.id}-3-${i}`} className="border border-black bg-gray-50/30"></td>)}
        </tr>
        
        {/* Recursive Children */}
        {node.children && node.children.length > 0 && renderGridNodes(node.children, safeDepth + 1)}
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
             <table className="border-collapse border-2 border-black table-fixed bg-white">
               <colgroup>
                 {Array.from({ length: 10 }).map((_, i) => (
                   <React.Fragment key={`col-group-${i}`}>
                     <col style={{ width: '250px' }} />
                     <col style={{ width: '350px' }} />
                     <col style={{ width: '50px' }} />
                   </React.Fragment>
                 ))}
               </colgroup>
               <tbody>
                  {masterTree.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="border border-black p-0 h-10">
                         <button 
                            onClick={() => openCreateKeyModal(null)}
                            className="bg-[#436bf9] text-white w-full h-full flex items-center justify-center font-bold text-2xl hover:bg-blue-600 transition-colors"
                          >
                            +
                          </button>
                      </td>
                      <td className="border border-black"></td>
                      {Array.from({ length: 27 }).map((_, i) => <td key={`empty-root-${i}`} className="border border-black bg-gray-50/30"></td>)}
                    </tr>
                  ) : (
                    renderGridNodes(masterTree)
                  )}
                  {/* Empty rows at the bottom for infinite grid aesthetic */}
                  {Array.from({ length: 50 }).map((_, i) => (
                    <tr key={`empty-${i}`}>
                      {Array.from({ length: 30 }).map((_, colIndex) => (
                         <td key={`empty-${i}-${colIndex}`} className="border border-black h-12 bg-gray-50/30"></td>
                      ))}
                    </tr>
                  ))}
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
