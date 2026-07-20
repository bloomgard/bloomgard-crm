"use client";

import React, { useState } from "react";
import { MasterDataEntry, MasterDataValue, useMasterDataFields } from "@/hooks/useMasterDataFields";
import { Plus, Wand2, X, Save } from "lucide-react";

type MasterDataUIProps = {
  tenantId: string;
};

export default function MasterDataUI({ tenantId }: MasterDataUIProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('manual');
  const { masterTree, isLoading, refreshTree } = useMasterDataFields(tenantId, activeTab);

  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [selectedEntryForAi, setSelectedEntryForAi] = useState<MasterDataEntry | null>(null);
  const [aiDescription, setAiDescription] = useState("");

  const handleCreateKey = async (parentId: string | null) => {
    const keyName = prompt("Enter new key name:");
    if (!keyName) return;
    
    await fetch('/api/master-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'createMasterKey',
        payload: {
          tenant_id: tenantId,
          tab_type: activeTab,
          key_name: keyName,
          parent_id: parentId
        }
      })
    });
    refreshTree();
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
        <tr>
          <td className="border-r border-black p-0" style={{ paddingLeft: `${depth * 20}px` }}></td>
          <td className="p-0 border-r border-black">
            <div className="flex">
              <button 
                onClick={() => handleAddValue(node.id)}
                className="bg-[#436bf9] text-white w-24 h-8 flex items-center justify-center font-bold text-xl hover:bg-blue-600 transition-colors"
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
              >
                +
              </button>
            </div>
          </td>
          <td className="border-r border-black"></td>
          <td className="border-r border-black"></td>
        </tr>

        {/* The Key / Value row */}
        <tr>
          <td className="border-r border-t border-b border-black p-3" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
            <span className="text-[#3b82f6] text-2xl font-semibold">Key : </span>
            <span className="text-gray-800 text-xl font-medium">{node.key_name}</span>
          </td>
          <td className="border-r border-t border-b border-black p-3 relative bg-[#fcfcfc]">
            <span className="text-[#4a4a4a] text-2xl font-semibold">Value</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {node.values?.map(val => (
                <span key={val.id} className="bg-gray-200 text-gray-800 px-2 py-1 text-xs rounded border border-gray-300">
                  {val.value_text}
                </span>
              ))}
            </div>
          </td>
          <td className="border-r border-t border-b border-black p-0">
             <button 
                onClick={() => handleCreateKey(node.id)}
                className="bg-[#436bf9] text-white w-12 h-full min-h-[60px] flex items-center justify-center font-bold text-xl hover:bg-blue-600 transition-colors"
              >
                +
              </button>
          </td>
          <td className="border-r border-t border-b border-black p-0"></td>
        </tr>

        {/* The Span Row to add Sibling */}
        <tr>
          <td colSpan={2} className="border-r border-b border-black p-0">
             <button 
                onClick={() => handleCreateKey(node.parent_id)}
                className="bg-[#436bf9] text-white w-full h-8 flex items-center justify-center font-bold text-xl hover:bg-blue-600 transition-colors"
              >
                +
              </button>
          </td>
          <td className="border-r border-b border-black p-0"></td>
          <td className="border-r border-b border-black p-0"></td>
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
          <div className="text-gray-400 text-center mt-20">Loading Grid...</div>
        ) : (
          <div className="inline-block relative">
             <table className="border-collapse border-2 border-black min-w-[800px] table-fixed">
               <tbody>
                  {masterTree.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="border border-black p-0">
                         <button 
                            onClick={() => handleCreateKey(null)}
                            className="bg-[#436bf9] text-white w-full h-8 flex items-center justify-center font-bold text-xl hover:bg-blue-600 transition-colors"
                          >
                            +
                          </button>
                      </td>
                      <td className="border border-black w-32"></td>
                      <td className="border border-black w-64"></td>
                    </tr>
                  ) : (
                    renderGridNodes(masterTree)
                  )}
                  {/* Empty rows at the bottom for grid aesthetic */}
                  <tr><td className="border border-black h-12"></td><td className="border border-black"></td><td className="border border-black w-32"></td><td className="border border-black w-64"></td></tr>
                  <tr><td className="border border-black h-12"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td></tr>
                  <tr><td className="border border-black h-12"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td></tr>
               </tbody>
             </table>
          </div>
        )}

      </div>

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
