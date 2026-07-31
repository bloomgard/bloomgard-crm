  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxReplyText, setInboxReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const handleInboxAction = async (emailId, action, value) => {
    try {
      const updates = { [action]: value };
      const res = await fetch(getApiUrl('/api/inbox/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, updates, tenantId: user?.tenant_id || tenantId })
      });
      if (res.ok) {
        setInboxLogs(prev => prev.map(e => e.id === emailId ? { ...e, ...updates } : e));
        if (selectedInboxEmail?.id === emailId) {
          setSelectedInboxEmail(prev => ({ ...prev, ...updates }));
        }
      }
    } catch (e) {
      console.error("Inbox Action Error:", e);
    }
  };

  const handleInboxReply = async () => {
    if (!selectedInboxEmail || !inboxReplyText.trim()) return;
    setIsSendingReply(true);
    try {
      const res = await fetch(getApiUrl('/api/inbox/reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user?.tenant_id || tenantId,
          emailId: selectedInboxEmail.id,
          to: selectedInboxEmail.sender_email,
          subject: selectedInboxEmail.subject.startsWith('Re:') ? selectedInboxEmail.subject : `Re: ${selectedInboxEmail.subject}`,
          htmlBody: inboxReplyText.replace(/\n/g, '<br/>'),
          parsedTenantId: user?.tenant_id || tenantId
        })
      });
      if (res.ok) {
        setInboxReplyText('');
        alert("Reply sent successfully!");
      } else {
        alert("Failed to send reply");
      }
    } catch (e) {
      console.error(e);
      alert("Error sending reply");
    } finally {
      setIsSendingReply(false);
    }
  };
