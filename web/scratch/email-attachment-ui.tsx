                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={() => document.getElementById('email-file-upload').click()}
                      className="flex-1 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold text-xs py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <span>💻</span> Upload from Device
                    </button>
                    
                    <div className="flex-1 relative">
                      <select 
                        className="w-full bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold text-xs py-2.5 px-3 rounded-xl shadow-sm transition-colors appearance-none cursor-pointer outline-none focus:border-indigo-400"
                        onChange={async (e) => {
                          const id = e.target.value;
                          if (!id) return;
                          const quote = docsRecords.find(r => String(r.id) === String(id));
                          if (quote) {
                            const html = await getRenderedHTML(quote);
                            const encodedHtml = btoa(unescape(encodeURIComponent(html)));
                            const filename = `${quote.qn_number} - ${getManifestTitle(quote)}.html`;
                            setEmailDraft(prev => ({
                              ...prev,
                              attachments: [...(prev.attachments || []), { filename, base64: encodedHtml }]
                            }));
                          }
                          e.target.value = ""; // reset
                        }}
                      >
                        <option value="">📄 Select CRM Document...</option>
                        {docsRecords.map(r => (
                          <option key={r.id} value={r.id}>{r.qn_number} - {getManifestTitle(r)}</option>
                        ))}
                      </select>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-gray-500">▼</span>
                    </div>
                  </div>

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
                            attachments: [...(prev.attachments || []), { filename: file.name, base64: ev.target.result }]
                          }));
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                </div>
