import React, { useState, useEffect, useRef } from 'react';

// API base URL - dynamic for local development vs Hugging Face Spaces hosting
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5001'
  : window.location.origin;

export default function App() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Custom upload and request states
  const [isUploading, setIsUploading] = useState(false);
  const [warning, setWarning] = useState(null);
  const [newsletterAgreed, setNewsletterAgreed] = useState(false);

  const messagesEndRef = useRef(null);

  // Fetch document lists
  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/api/documents`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Ingest documents trigger for local pending files
  const handleIngest = async () => {
    setIsIngesting(true);
    try {
      const res = await fetch(`${API_URL}/api/ingest`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Ingestion completed successfully!');
        fetchDocuments();
      } else {
        alert(`Ingestion failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Error during ingestion:', err);
      alert('Network error during ingestion.');
    } finally {
      setIsIngesting(false);
    }
  };

  // Submit query to RAG
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userQuery = query;
    setQuery('');

    // Append user message
    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: userQuery }
    ]);

    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: data.answer,
            sources: data.sources
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: `Error: ${data.error || 'Failed to generate answer.'}`,
            sources: []
          }
        ]);
      }
    } catch (err) {
      console.error('Error sending query:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: 'Network error: Make sure the server is online.',
          sources: []
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle PDF file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Enforce max 5 custom files limit in frontend
    const uploadedDocs = documents.filter(d => d.isUpload);
    if (uploadedDocs.length >= 5) {
      setWarning("Upload Limit Exceeded: You have already uploaded 5 custom documents. Please delete some files or use the request form below to contact the administrator for a higher limit.");
      // Reset input
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('pdf', file);

    setIsUploading(true);

    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.success) {
        fetchDocuments();
      } else {
        // If error matches limits, show warning prompt modal
        setWarning(data.error || 'Failed to upload document.');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setWarning('Network error occurred while uploading file. Make sure the file is under 50MB and valid.');
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  // Handle PDF deletion
  const handleDeleteDocument = async (name) => {
    if (!confirm(`Are you sure you want to delete "${name.replace(/^\d+-/, '')}"?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/documents/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
      } else {
        alert(data.error || 'Failed to delete document.');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      alert('Network error occurred while deleting file.');
    }
  };

  // Handle Gmail request link trigger
  const handleSendRequest = () => {
    if (!newsletterAgreed) return;
    const subject = encodeURIComponent("Request to upload larger PDFs / more files");
    const body = encodeURIComponent("Hello,\n\nI would like to request permission to upload larger files or more files to the Sample RAG. I agree to subscribe to the weekly newsletter.\n\nThank you!");
    window.open(`mailto:kb001202@gmail.com?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="app-container">
      {/* Sidebar: Documents list */}
      <aside className="sidebar" style={{ marginLeft: isSidebarOpen ? '0' : '-300px' }}>
        <div className="sidebar-header">
          <div className="logo-icon">RAG</div>
          <div className="logo-text">
            <h2>Sample RAG</h2>
            <p>PDF Knowledge Base</p>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="section-title">Knowledge Library ({documents.length})</div>
          
          {/* Custom PDF Upload Area */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              borderRadius: '10px',
              border: '2px dashed var(--panel-border)',
              background: 'rgba(255, 255, 255, 0.01)',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
            className="upload-box-hover"
            >
              <input 
                type="file" 
                accept=".pdf" 
                onChange={handleFileUpload} 
                style={{ display: 'none' }} 
                disabled={isUploading}
              />
              {isUploading ? (
                <>
                  <div className="spinner spinner-sm" style={{ marginBottom: '6px' }} />
                  <span>Indexing Page Content...</span>
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '6px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Upload custom PDF (Max 600 pgs)</span>
                </>
              )}
            </label>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
              Custom Uploaded: {documents.filter(d => d.isUpload).length} / 5
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="empty-docs">
              No PDFs found.<br />
              Add documents to:<br />
              <code>backend/documents/</code>
            </div>
          ) : (
            <div className="doc-list">
              {documents.map((doc, idx) => (
                <div key={idx} className="doc-item">
                  {/* PDF Icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  
                  {/* Clean timestamp prefix from uploaded filenames */}
                  <span className="doc-name" title={doc.name}>
                    {doc.isUpload ? doc.name.replace(/^\d+-/, '') : doc.name}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {doc.status === 'error' ? (
                      <div className="status-tooltip-container">
                        <span className="status-badge error" />
                        <div className="status-tooltip-content">
                          <strong>Parsing Error</strong>
                          <p>This PDF contains scanned images/slides only. No selectable text could be extracted.</p>
                        </div>
                      </div>
                    ) : (
                      <span className={`status-badge ${doc.status}`} title={doc.status} />
                    )}

                    {/* Delete button only for uploaded PDFs */}
                    {doc.isUpload && (
                      <button 
                        onClick={() => handleDeleteDocument(doc.name)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px',
                          borderRadius: '4px'
                        }}
                        title="Delete custom upload"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Request Custom Upload card */}
          <div className="request-card-container" style={{
            marginTop: '24px',
            padding: '14px',
            borderRadius: '10px',
            background: 'rgba(6, 182, 212, 0.04)',
            border: '1px solid rgba(6, 182, 212, 0.15)',
          }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-secondary)', marginBottom: '6px' }}>
              Request to upload a bigger or more files
            </h4>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.35 }}>
              Exceeded the limits? Message the administrator to request more documents or higher page counts.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.72rem', cursor: 'pointer', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                checked={newsletterAgreed}
                onChange={(e) => setNewsletterAgreed(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <span style={{ color: '#cbd5e1' }}>I agree to get the weekly newsletter sent to me</span>
            </label>
            <button 
              className="btn-primary" 
              onClick={handleSendRequest}
              disabled={!newsletterAgreed}
              style={{
                padding: '8px 12px',
                fontSize: '0.75rem',
                borderRadius: '6px',
                background: newsletterAgreed ? 'linear-gradient(135deg, var(--accent-secondary), var(--accent-primary))' : '#334155',
                boxShadow: newsletterAgreed ? '0 2px 10px rgba(6, 182, 212, 0.25)' : 'none',
                width: '100%'
              }}
            >
              Send Request via Email
            </button>
          </div>
        </div>

        <div className="sidebar-footer">
          <button 
            className="btn-primary" 
            onClick={handleIngest} 
            disabled={isIngesting || documents.length === 0}
          >
            {isIngesting ? (
              <>
                <div className="spinner spinner-sm" />
                Ingesting...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                Sync Knowledge Base
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="close-btn" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="chat-header-title">
              <h1>AI Document Assistant</h1>
              <p>Powered by Groq Llama 3 & Hugging Face</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span className="status-badge ingested" />
            <span>Ready</span>
          </div>
        </header>

        {/* Message Thread */}
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-icon">💬</div>
              <h3>Ask your PDF Library anything</h3>
              <p>
                This system parses your subject PDFs, extracts information page-by-page, 
                and references the exact files and page numbers it used to form the answer.
              </p>

              <div className="feature-grid">
                <div className="feature-card">
                  <h4>Page Citations</h4>
                  <p>Get answers with clickable source tags showing the exact PDF page reference.</p>
                </div>
                <div className="feature-card">
                  <h4>Semantic Search</h4>
                  <p>Uses Hugging Face online vector embeddings to find the most relevant context.</p>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="message-item-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                <div className={`message ${msg.sender}`}>
                  <div className="avatar">
                    {msg.sender === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="message-bubble">
                    <div>{msg.text}</div>
                  </div>
                </div>
                
                {/* Citations block rendered on the next line below the bubble */}
                {msg.sender === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div className="citations-section">
                    <div className="citations-title">Sources Read:</div>
                    <div className="citations-list">
                      {msg.sources.map((src, sIdx) => (
                        <button 
                          key={sIdx} 
                          className="citation-tag"
                          onClick={() => setActiveSource(src)}
                          title="Click to view extracted page context"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                            <path d="M12 16v-4"/>
                            <path d="M12 8h.01"/>
                          </svg>
                          {src.filename.replace(/^\d+-/, '')} (Pg. {src.page})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="message assistant">
              <div className="avatar">AI</div>
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="input-area">
          <form className="input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask a question about your PDFs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" className="send-btn" disabled={!query.trim() || isLoading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>

        {/* Right Drawer showing source snippet */}
        {activeSource && (
          <div className="source-drawer">
            <div className="drawer-header">
              <div className="drawer-title">
                <h3>Source Citation</h3>
              </div>
              <button className="close-btn" onClick={() => setActiveSource(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="drawer-content">
              <div className="meta-info-card">
                <div className="meta-label">Document Name</div>
                <div className="meta-val">{activeSource.filename.replace(/^\d+-/, '')}</div>
              </div>

              <div className="meta-info-card">
                <div className="meta-label">Page Number</div>
                <div className="meta-val">{activeSource.page}</div>
              </div>

              <div className="meta-label">Parsed Context Snippet</div>
              <div className="source-snippet-card">
                <pre className="source-text">{activeSource.text}</pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Warning Prompt Modal */}
      {warning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 15px rgba(239, 68, 68, 0.1)',
            textAlign: 'center',
            position: 'relative'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#ef4444',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}>
              ⚠️
            </div>
            
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
              Upload Limit Exceeded
            </h3>
            
            <p style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '20px' }}>
              {warning}
            </p>
            
            <button 
              className="btn-primary"
              onClick={() => setWarning(null)}
              style={{
                background: '#ef4444',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)',
                padding: '10px 20px',
                width: 'auto',
                margin: '0 auto'
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
