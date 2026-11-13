import React, { useState, useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';

export const GmailHubModal = ({ isOpen, onClose }) => {
  const { db, sendCustomEmail } = useContext(DatabaseContext);
  
  const [activeTab, setActiveTab] = useState('logs'); // 'logs' or 'compose'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDirection, setFilterDirection] = useState('ALL');

  // Compose State
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeIssueId, setComposeIssueId] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendError, setSendError] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const gmailAddress = db.gmailAddress || 'Not configured';
  const logs = db.gmailLogs || [];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.recipient || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.sender || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.issueId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.body || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterDirection === 'OUTBOUND') return matchesSearch && log.direction === 'OUTBOUND';
    if (filterDirection === 'INBOUND') return matchesSearch && log.direction === 'INBOUND';
    return matchesSearch;
  });

  const handleSendEmail = async event => {
    event.preventDefault();
    if (isSending || !composeTo || !composeSubject || !composeBody) return;
    setIsSending(true); setSendError(''); setSendSuccess('');
    try {
      const result = await sendCustomEmail({ to: composeTo, subject: composeSubject, content: composeBody, issueId: composeIssueId || null });
      setSendSuccess(result.delivered ? 'Message accepted by the mail server.' : result.record?.deliveryReason || 'Message logged; delivery not confirmed.');
    } catch (error) { setSendError(error.message); }
    finally { setIsSending(false); }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#ea4335',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '1.25rem',
              fontWeight: 'bold'
            }}>
              M
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Gmail Integration & Response Hub
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>System Account:</span>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#60a5fa',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  padding: '0.1rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid rgba(96, 165, 250, 0.3)'
                }}>
                  {gmailAddress}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  color: db.imapStatus?.active ? '#4ade80' : '#60a5fa',
                  backgroundColor: db.imapStatus?.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '12px',
                  border: db.imapStatus?.active ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(96, 165, 250, 0.3)'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: db.imapStatus?.active ? '#4ade80' : '#60a5fa' }}></span>
                  {db.imapStatus?.active ? 'Real IMAP Listener Active (imap.gmail.com:993)' : 'Inbox listener inactive'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          padding: '0 1.5rem'
        }}>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '0.85rem 1.25rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'logs' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'logs' ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            📧 Email Activity Stream ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('compose')}
            style={{
              padding: '0.85rem 1.25rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'compose' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'compose' ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            ✏️ Compose Email
          </button>

        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {/* TAB 1: LOGS */}
          {activeTab === 'logs' && (
            <div>
              {/* Filter Controls */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <input
                  type="text"
                  placeholder="Search by subject, recipient, issue ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '220px',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
                  {['ALL', 'OUTBOUND', 'INBOUND'].map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setFilterDirection(dir)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        backgroundColor: filterDirection === dir ? '#ffffff' : 'transparent',
                        color: filterDirection === dir ? '#1e293b' : '#64748b',
                        boxShadow: filterDirection === dir ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>

              {/* Log List */}
              {filteredLogs.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '3rem 1rem',
                  color: '#94a3b8',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                  <p style={{ margin: 0, fontWeight: 500 }}>No Gmail transactions match your search filter.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {filteredLogs.map((log, index) => {
                    const isOutbound = log.direction === 'OUTBOUND';
                    return (
                      <div
                        key={log.id || index}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '1rem 1.25rem',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.725rem',
                              fontWeight: 700,
                              letterSpacing: '0.5px',
                              backgroundColor: isOutbound ? '#e0f2fe' : '#dcfce7',
                              color: isOutbound ? '#0369a1' : '#15803d'
                            }}>
                              {isOutbound ? '📤 OUTBOUND' : '📥 INBOUND'}
                            </span>

                            {log.issueId && (
                              <span style={{
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}>
                                #{log.issueId}
                              </span>
                            )}

                            <span style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              fontWeight: 500
                            }}>
                              {log.eventType || 'NOTIFICATION'}
                            </span>
                          </div>

                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'Just now'}
                          </span>
                        </div>

                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0f172a' }}>
                          {log.subject}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.825rem', color: '#475569' }}>
                          <div><strong>From:</strong> {log.sender}</div>
                          <div><strong>To:</strong> {log.recipient || 'Recipient unavailable'}</div>
                          <div><strong>Status:</strong> {log.status}</div>
                        </div>

                        <div style={{
                          backgroundColor: '#f8fafc',
                          padding: '0.6rem 0.85rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          color: '#334155',
                          borderLeft: isOutbound ? '3px solid #0284c7' : '3px solid #16a34a',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '100px',
                          overflowY: 'auto'
                        }}>
                          {log.body}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPOSE */}
          {activeTab === 'compose' && (
            <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {sendError && <p role="alert" style={{ color: '#b91c1c' }}>{sendError}</p>}
              {sendSuccess && (
                <div style={{
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                  padding: '0.85rem 1rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}>
                  ✅ Email dispatched successfully through {gmailAddress}!
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Recipient Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. recipient@nitte.edu.in"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Related Issue ID (Optional)
                  </label>
                  <select
                    value={composeIssueId}
                    onChange={(e) => setComposeIssueId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">None / General</option>
                    {(db.issues || []).map(iss => (
                      <option key={iss.id} value={iss.id}>{iss.id} - {iss.studentName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                    Email Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Official Update regarding your Mentorship ticket"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Email Body Content *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="Type your official response or message..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('logs')}
                  style={{
                    padding: '0.65rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  style={{
                    padding: '0.65rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#ea4335',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(234, 67, 53, 0.3)'
                  }}
                >
                  📤 Dispatch via {gmailAddress}
                </button>
              </div>
            </form>
          )}


        </div>
      </div>
    </div>
  );
};
