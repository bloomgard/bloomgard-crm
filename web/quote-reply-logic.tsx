  const [quoteReplyTexts, setQuoteReplyTexts] = useState({});
  const [isSendingQuoteReply, setIsSendingQuoteReply] = useState(false);

  const handleQuoteReply = async (quote) => {
    const text = quoteReplyTexts[quote.id];
    if (!text || !text.trim()) return;
    setIsSendingQuoteReply(quote.id);
    try {
      const res = await fetch(getApiUrl('/api/inbox/reply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user?.tenant_id || tenantId,
          emailId: null,
          to: quote.client_email || quote.custom_metadata?.client_email,
          subject: `Re: Following up on Quote ${quote.qn_number}`,
          htmlBody: text.replace(/\n/g, '<br/>'),
          parsedTenantId: user?.tenant_id || tenantId
        })
      });
      if (res.ok) {
        setQuoteReplyTexts(prev => ({ ...prev, [quote.id]: '' }));
        alert("Reply sent successfully!");
        fetchData();
      } else {
        alert("Failed to send reply");
      }
    } catch (e) {
      console.error(e);
      alert("Error sending reply");
    } finally {
      setIsSendingQuoteReply(false);
    }
  };
