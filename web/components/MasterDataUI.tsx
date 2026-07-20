"use client";

import React, { useState } from "react";
import { MasterDataEntry, MasterDataValue, useMasterDataFields } from "@/hooks/useMasterDataFields";
import { Wand2, X, Save, Trash2, Plus } from "lucide-react";

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
  const [editingValueId, setEditingValueId] = useState<string | null>(null);
  const [editingValueText, setEditingValueText] = useState("");

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

  const handleEditValue = async (valueId: string) => {
    if (!editingValueText.trim()) return;
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'editValueOption',
        payload: { id: valueId, value_text: editingValueText }
      })
    });
    setEditingValueId(null);
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
    if (!confirm("Are you sure you want to delete this key and all its nested children?")) return;
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

  const renderNode = (node: MasterDataEntry) => (
    <div key={node.id} className="flex flex-col mb-8 relative">
       <div className="flex items-start">
          
          {/* Core Block */}
          <div className="relative group flex-shrink-0">
             
             {/* Top Actions */}
             <div className="absolute -top-3.5 left-0 right-0 flex justify-between px-3 z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                <button 
                   onClick={() => handleDeleteKey(node.id)} 
                   className="w-7 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center hover:scale-110 hover:bg-red-600 transition-all shadow-md"
                   title="Delete Key"
                >
                   <Trash2 size={14} />
                </button>
                <div className="flex gap-2">
                   <button 
                      onClick={() => handleAddValue(node.id)} 
                      className="w-7 h-7 rounded-lg bg-[#436bf9] text-white flex items-center justify-center font-bold text-lg hover:scale-110 transition-all shadow-md" 
                      title="Add Value"
                   >
                      +
                   </button>
                   <button 
                      onClick={() => {
                        setSelectedEntryForAi(node);
                        setAiDescription(node.ai_description || "");
                        setAiDrawerOpen(true);
                      }} 
                      className="w-7 h-7 rounded-lg bg-[#f042d7] text-white flex items-center justify-center font-bold text-lg hover:scale-110 transition-all shadow-md" 
                      title="AI Settings"
                   >
                      +
                   </button>
                </div>
             </div>
  
             {/* The Data Card */}
             <div className="w-[280px] border border-gray-200 bg-white rounded-xl shadow-sm flex flex-col pt-5 overflow-visible relative z-0">
                <div className="px-5 pb-3 border-b border-gray-100 flex items-center bg-white rounded-t-xl">
                   <span className="text-[#436bf9] font-bold text-sm mr-2 uppercase tracking-wide">Key:</span>
                   <span className="text-gray-900 font-semibold text-sm truncate">{node.key_name}</span>
                </div>
                <div className="p-5 bg-gray-50/50 flex flex-col min-h-[100px] rounded-b-xl">
                   <input 
                     type="text" 
                     className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#436bf9]/20 focus:border-[#436bf9] mb-4 text-gray-800 placeholder-gray-400 shadow-sm transition-all" 
                     placeholder="Type value & hit Enter..."
                     value={newValues[node.id] || ""}
                     onChange={(e) => setNewValues({...newValues, [node.id]: e.target.value})}
                     onKeyDown={(e) => { if (e.key === 'Enter') handleAddValue(node.id); }}
                   />
                   <div className="flex flex-wrap gap-2">
                     {node.values?.map(val => (
                       editingValueId === val.id ? (
                         <input 
                           key={val.id}
                           autoFocus
                           className="bg-white text-gray-900 px-2 py-1 text-xs font-semibold rounded-md border border-[#436bf9] shadow-sm outline-none w-24"
                           value={editingValueText}
                           onChange={e => setEditingValueText(e.target.value)}
                           onBlur={() => handleEditValue(val.id)}
                           onKeyDown={e => { if (e.key === 'Enter') handleEditValue(val.id); if (e.key === 'Escape') setEditingValueId(null); }}
                         />
                       ) : (
                         <span 
                           key={val.id} 
                           onClick={() => { setEditingValueId(val.id); setEditingValueText(val.value_text); }}
                           className="bg-white text-gray-700 px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-200 shadow-sm flex items-center gap-1 cursor-pointer hover:border-gray-400 transition-colors"
                           title="Click to edit"
                         >
                           {val.value_text}
                         </span>
                       )
                     ))}
                   </div>
                </div>
             </div>
  
             {/* Bottom Action (Sibling) */}
             <div className="absolute -bottom-3.5 left-0 right-0 flex justify-center z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                <button 
                   onClick={() => openCreateKeyModal(node.parent_id)}
                   className="h-7 px-8 rounded-full bg-[#436bf9] text-white flex items-center justify-center font-bold hover:scale-105 hover:bg-blue-600 transition-all shadow-md text-xl leading-none pb-1"
                   title="Add Sibling Row"
                >
                   +
                </button>
             </div>
          </div>
  
          {/* Right Action (Nested Child) */}
          <div className="flex items-center self-stretch ml-[-14px] z-20 group">
             <button 
                onClick={() => openCreateKeyModal(node.id)}
                className="w-7 h-16 rounded-full bg-[#436bf9] text-white flex items-center justify-center font-bold hover:scale-110 hover:bg-blue-600 transition-all shadow-md text-xl opacity-90 group-hover:opacity-100"
                title="Add Nested Child"
             >
                +
             </button>
          </div>
  
          {/* Children Rendered Horizontally to the Right */}
          {node.children && node.children.length > 0 && (
             <div className="flex flex-col ml-8 border-l-2 border-gray-200 pl-10 pt-2 gap-4 relative">
                {/* Connecting line helper */}
                <div className="absolute top-10 -left-0.5 w-10 h-0 border-t-2 border-gray-200"></div>
                {node.children.map(renderNode)}
             </div>
          )}
       </div>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[800px] animate-in fade-in zoom-in-95 duration-500">
      
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 pt-3">
        <button 
          onClick={() => setActiveTab('manual')}
          className={`px-6 py-2.5 text-sm font-semibold border-b-2 rounded-t-lg transition-colors ${activeTab === 'manual' ? 'border-[#436bf9] text-[#436bf9] bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          Manual Data
        </button>
        <button 
          onClick={() => setActiveTab('auto')}
          className={`px-6 py-2.5 text-sm font-semibold border-b-2 rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'auto' ? 'border-[#436bf9] text-[#436bf9] bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
        >
          <Wand2 size={14} className={activeTab === 'auto' ? 'text-[#436bf9]' : 'text-gray-400'}/>
          Auto-Captured Data
        </button>
      </div>

      <div className="p-10 flex-1 overflow-auto bg-[#fafafa]">
        
        {isLoading ? (
          <div className="text-gray-400 text-center mt-20 font-medium">Loading Master Data...</div>
        ) : (
          <div className="inline-flex flex-col min-w-max pb-32">
            {masterTree.length === 0 ? (
               <div className="flex items-center justify-center h-40 w-[280px] border-2 border-dashed border-gray-300 rounded-xl bg-white">
                 <button 
                    onClick={() => openCreateKeyModal(null)}
                    className="flex flex-col items-center text-gray-500 hover:text-[#436bf9] transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-[#436bf9] flex items-center justify-center font-bold text-2xl mb-2">
                       +
                    </div>
                    <span className="font-semibold text-sm">Add First Key</span>
                  </button>
               </div>
            ) : (
               masterTree.map(renderNode)
            )}
          </div>
        )}

      </div>

      {/* Create Key Modal (Schema Dropdown) */}
      {createKeyModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <h3 className="font-bold text-xl text-gray-900">Add New Key</h3>
              <button onClick={() => setCreateKeyModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 bg-gray-50">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 block mb-2">Select Schema Field</label>
              {schemaFields.length === 0 ? (
                <div className="p-4 bg-orange-50 text-orange-700 text-sm rounded-xl border border-orange-200 mb-4">
                  No schema fields found. Please configure your Quote blueprint first to populate available fields.
                </div>
              ) : (
                <select 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full bg-white border border-gray-200 px-4 py-3.5 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-[#436bf9]/20 focus:border-[#436bf9] shadow-sm cursor-pointer mb-6 transition-all"
                >
                  <option value="" disabled>Select a field...</option>
                  {schemaFields.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              )}
              
              <div className="flex justify-end gap-3 mt-2">
                <button 
                  onClick={() => setCreateKeyModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateKey}
                  disabled={!newKeyName}
                  className="bg-[#436bf9] text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="absolute inset-y-0 right-0 w-[400px] bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
              <div className="w-8 h-8 rounded-full bg-pink-50 text-[#f042d7] flex items-center justify-center">
                 <Wand2 size={16} />
              </div>
              AI Knowledge
            </h3>
            <button onClick={() => setAiDrawerOpen(false)} className="text-gray-400 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 flex-1 flex flex-col bg-gray-50">
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Configure how the AI agent should understand and use the key <strong className="text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm">"{selectedEntryForAi.key_name}"</strong>.
            </p>
            <textarea
              className="w-full flex-1 border border-gray-200 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#f042d7]/20 focus:border-[#f042d7] resize-none bg-white shadow-sm transition-all"
              placeholder="e.g. 'Use this key to classify...'"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
            />
          </div>
          <div className="p-5 border-t border-gray-100 bg-white flex justify-end gap-3">
            <button onClick={() => setAiDrawerOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSaveAiDescription} className="px-6 py-2.5 text-sm font-bold text-white bg-[#f042d7] hover:bg-pink-600 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2">
              <Save size={16} />
              Save AI Config
            </button>
          </div>
        </div>
      )}
      
      {aiDrawerOpen && (
        <div className="absolute inset-0 bg-gray-900/20 backdrop-blur-[1px] z-10" onClick={() => setAiDrawerOpen(false)}></div>
      )}

    </div>
  );
}
