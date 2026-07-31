        {currentView === "inbox" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-140px)] flex gap-6">
            <div className="w-1/3 bg-white/80 dark:bg-black/60 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
              <header className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-wider">Inbox</h3>
                  <button onClick={() => fetchInboxLogs()} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-all uppercase tracking-wider shadow-sm">Refresh</button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={inboxSearch}
                    onChange={(e) => setInboxSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </header>
              <div className="flex-1 overflow-y-auto">
                {inboxLogs
                  .filter(log => !log.is_deleted)
                  .filter(log => log.subject?.toLowerCase().includes(inboxSearch.toLowerCase()) || log.sender_email?.toLowerCase().includes(inboxSearch.toLowerCase()))
                  .map((log) => (
                  <div key={log.id} onClick={() => { setSelectedInboxEmail(log); if(!log.is_read) handleInboxAction(log.id, 'is_read', true); }} className={`p-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${selectedInboxEmail?.id === log.id ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50 border-l-4 border-l-transparent'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-sm ${log.is_read ? 'font-semibold text-gray-700' : 'font-black text-gray-900'} dark:text-white truncate pr-2`}>{log.sender_email}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className={`text-xs ${log.is_read ? 'font-medium text-gray-600' : 'font-bold text-gray-800'} dark:text-gray-300 truncate mb-1`}>{log.subject || 'No Subject'}</div>
                    <div className="text-xs text-gray-500 truncate flex items-center justify-between">
                      <span className="truncate pr-4">{log.body_text?.substring(0, 50)}...</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleInboxAction(log.id, 'is_starred', !log.is_starred); }}
                        className={`text-lg transition-colors ${log.is_starred ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-gray-400'}`}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                ))}
                {inboxLogs.filter(log => !log.is_deleted).length === 0 && (
                  <div className="p-8 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">No Emails Yet</div>
                )}
              </div>
            </div>
            
            <div className="w-2/3 bg-white/80 dark:bg-black/60 backdrop-blur-xl rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden relative">
              {selectedInboxEmail ? (
                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                  <div className="mb-6 pb-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{selectedInboxEmail.subject}</h2>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedInboxEmail.sender_email}</span>
                        <span>•</span>
                        <span>{new Date(selectedInboxEmail.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleInboxAction(selectedInboxEmail.id, 'is_starred', !selectedInboxEmail.is_starred)} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors" title="Star">
                         {selectedInboxEmail.is_starred ? '⭐' : '☆'}
                      </button>
                      <button onClick={() => { handleInboxAction(selectedInboxEmail.id, 'is_deleted', true); setSelectedInboxEmail(null); }} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors" title="Delete">
                         🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-800 dark:text-gray-300 whitespace-pre-wrap mb-8 bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-100 dark:border-gray-800 flex-1">
                    {selectedInboxEmail.body_text || selectedInboxEmail.body_html || "No Content"}
                  </div>

                  {/* Inline Reply Box */}
                  <div className="mb-8 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white">
                    <textarea 
                      value={inboxReplyText}
                      onChange={(e) => setInboxReplyText(e.target.value)}
                      placeholder="Type your reply here..."
                      className="w-full p-4 text-sm focus:outline-none resize-y min-h-[120px] bg-transparent"
                    />
                    <div className="bg-gray-50 p-3 border-t border-gray-200 flex justify-between items-center">
                      <div className="flex gap-2">
                        <button className="text-gray-400 hover:text-indigo-600 text-lg px-2" title="Attach File">📎</button>
                      </div>
                      <button 
                        onClick={handleInboxReply}
                        disabled={isSendingReply || !inboxReplyText.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 transition-all uppercase tracking-wider disabled:opacity-50"
                      >
                        {isSendingReply ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-400 flex items-center gap-2">
                        <span>🤖</span> Bloomgard AI Analysis
                      </h3>
                      {!emailAiAnalysis[selectedInboxEmail.id] && (
                        <button onClick={() => handleAnalyzeEmail(selectedInboxEmail)} disabled={isAnalyzingEmail} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all uppercase tracking-wider shadow-md disabled:opacity-50">
                          {isAnalyzingEmail ? "Analyzing..." : "Generate AI Actions"}
                        </button>
                      )}
                    </div>

                    {emailAiAnalysis[selectedInboxEmail.id] && (
                      <div className="grid grid-cols-1 gap-4">
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Summary</h4>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{emailAiAnalysis[selectedInboxEmail.id].summary}</p>
                          <button onClick={() => alert("Summary marked as reviewed!")} className="px-3 py-1.5 bg-white text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-lg hover:bg-indigo-50 transition-all uppercase tracking-wider">Approve Summary</button>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Lead Gen Quote Extracted</h4>
                          <pre className="text-[10px] text-gray-600 dark:text-gray-400 mb-4 max-h-32 overflow-y-auto bg-white/50 p-2 rounded">
                            {JSON.stringify(emailAiAnalysis[selectedInboxEmail.id].lead_gen_quote, null, 2)}
                          </pre>
                          <button onClick={() => {
                            setEditingId("new");
                            setQn("");
                            setDynamicData(emailAiAnalysis[selectedInboxEmail.id].lead_gen_quote);
                            setCurrentView("new_entry");
                          }} className="px-3 py-1.5 bg-emerald-600 text-white border border-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition-all uppercase tracking-wider">Approve & Open Quote</button>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">Drafted Auto-Reply</h4>
                          <div className="text-sm text-gray-700 dark:text-gray-300 mb-4 whitespace-pre-wrap bg-white/50 p-3 rounded">{emailAiAnalysis[selectedInboxEmail.id].auto_reply}</div>
                          <button onClick={() => {
                            setEmailDraft({
                              to: selectedInboxEmail.sender_email,
                              subject: "Re: " + selectedInboxEmail.subject,
                              message: emailAiAnalysis[selectedInboxEmail.id].auto_reply,
                              attachments: [], filename: ""
                            });
                            setShowEmailModal(true);
                          }} className="px-3 py-1.5 bg-blue-600 text-white border border-blue-700 text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-all uppercase tracking-wider">Approve & Open Draft</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 font-medium text-sm flex-col gap-3">
                  <span className="text-4xl">📥</span>
                  <p>Select an email to view contents</p>
                </div>
              )}
            </div>
          </div>
        )}
