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
                              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                <textarea 
                                  value={quoteReplyTexts[r.id] || ''}
                                  onChange={(e) => setQuoteReplyTexts(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  placeholder="Type a manual reply to the client..."
                                  className="w-full p-4 text-sm focus:outline-none resize-y min-h-[80px] bg-transparent"
                                />
                                <div className="bg-gray-50 p-2 border-t border-gray-200 flex justify-end items-center">
                                  <button 
                                    onClick={() => handleQuoteReply(r)}
                                    disabled={isSendingQuoteReply === r.id || !(quoteReplyTexts[r.id] || '').trim()}
                                    className="px-4 py-1.5 bg-indigo-600 text-white font-bold text-[10px] rounded-lg hover:bg-indigo-700 transition-all uppercase tracking-wider disabled:opacity-50 shadow-sm"
                                  >
                                    {isSendingQuoteReply === r.id ? 'Sending...' : 'Send Reply'}
                                  </button>
                                </div>
                              </div>
