// src/components/CommandPanel.jsx
import React, { useState } from 'react';  // ← FIXED: Added React explicitly

export default function CommandPanel() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setResponse('');

    try {
      const token = localStorage.getItem('token');
      const authHeaders = {
        'Content-Type': 'application/json',
        'X-App-Token': 'smart-home-client-v1',
        'Authorization': `Bearer ${token}`
      };

      // STEP 1: Text → LLM → JSON Intent
      const llmRes = await fetch('/api/llm/parse', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ text: input.trim() })
      });

      const llmData = await llmRes.json();

      if (llmData.intent) {
        setIntent(llmData.intent);

        // STEP 2: JSON Intent → AGENT via /api/command
        const agentRes = await fetch('/api/command', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ intent: llmData.intent })
        });

        const agentData = await agentRes.json();
        setResponse(`✅ ${agentData.message || 'Success!'}`);
      } else {
        setResponse(`❌ Parse error: ${llmData.error || 'No intent found'}`);
      }

      setInput('');
    } catch (err) {
      setResponse('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h3>Voice Commands</h3>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Turn on kitchen lights..."
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? '...' : 'Send'}
        </button>
      </form>

      {intent && (
        <details>
          <summary>Parsed Intent</summary>
          <pre>{JSON.stringify(intent, null, 2)}</pre>
        </details>
      )}

      {response && <p>{response}</p>}
    </div>
  );
}
