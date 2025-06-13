import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../auth/supabaseClient';
import { useAuth } from '../auth/AuthContext';
// @ts-ignore
import FileSaver from 'file-saver';

// --- Dark mode hook ---
const useDarkMode = () => {
  const [dark, setDark] = useState(() =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
};

interface ScreenRecorderProps {
  recordedVideoUrl?: string | null;
}

function formatDateForFilename(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}-at-${hours}-${pad(minutes)}-${pad(seconds)}${ampm}`;
}

const ScreenRecorder: React.FC<ScreenRecorderProps> = ({ recordedVideoUrl }) => {
  const darkMode = useDarkMode();
  const palette = darkMode
    ? {
        bg: '#181a20',
        card: '#23262f',
        border: '#33384a',
        text: '#e6e6e6',
        textSecondary: '#b0b0b0',
        accent: '#1976d2',
        accent2: '#28a745',
        accent3: '#e53935',
        accent4: '#d81b60',
        accent5: '#2d3a4a',
        accent6: '#3a2d4a',
        tableBg: '#23262f',
        tableBorder: '#33384a',
        inputBg: '#23262f',
        inputText: '#e6e6e6',
        inputBorder: '#33384a',
        shadow: '0 2px 12px #0008',
        modalBg: '#23262f',
        modalText: '#e6e6e6',
        modalBorder: '#33384a',
        modalShadow: '0 4px 24px #000a'
      }
    : {
        bg: '#f7faff',
        card: '#fff',
        border: '#eee',
        text: '#222',
        textSecondary: '#888',
        accent: '#1976d2',
        accent2: '#28a745',
        accent3: '#e53935',
        accent4: '#d81b60',
        accent5: '#e3f2fd',
        accent6: '#fce4ec',
        tableBg: '#fff',
        tableBorder: '#ccc',
        inputBg: '#fff',
        inputText: '#222',
        inputBorder: '#ccc',
        shadow: '0 2px 8px #0001',
        modalBg: '#fff',
        modalText: '#222',
        modalBorder: '#eee',
        modalShadow: '0 4px 24px #0002'
      };

  const { user } = useAuth();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<any | null>(null);
  const [recording, setRecording] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTranscript, setModalTranscript] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [modalFilename, setModalFilename] = useState('');

  useEffect(() => {
    const fetchRecordings = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { setRecordings([]); setLoading(false); return; }
      let query = supabase
        .from('recordings')
        .select('id, user_id, video_url, created_at, client_id, clients:client_id (name, email, first_name, last_name), profiles:user_id (display_name, email), transcript')
        .order('created_at', { ascending: false })
        .eq('user_id', userId);
      const { data, error } = await query;
      if (error) {
        setLoading(false);
      } else setRecordings(data || []);
      setLoading(false);
      if (data && data.length > 0 && recordedVideoUrl) {
        const found = data.find(r => r.video_url === recordedVideoUrl);
        if (found) setSelectedRecording(found);
      }
    };
    fetchRecordings();
  }, [user, recordedVideoUrl]);

  useEffect(() => {
    const handler = (e: any) => {
      const url = e.detail;
      if (!url) return;
      const found = recordings.find(r => r.video_url === url);
      if (found) setSelectedRecording(found);
    };
    window.addEventListener('sparky-auto-select-recording', handler);
    return () => window.removeEventListener('sparky-auto-select-recording', handler);
  }, [recordings]);

  useEffect(() => {
    if (recordedVideoUrl && recordings.length > 0) {
      const found = recordings.find(r => r.video_url === recordedVideoUrl);
      if (found) setSelectedRecording(found);
    }
  }, [recordedVideoUrl, recordings]);

  useEffect(() => {
    if (!recordedVideoUrl) return;
    const fetchAndSelect = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { setRecordings([]); setLoading(false); return; }
      let query = supabase
        .from('recordings')
        .select('id, user_id, video_url, created_at, client_id, clients:client_id (name, email, first_name, last_name), profiles:user_id (display_name, email), transcript')
        .order('created_at', { ascending: false })
        .eq('user_id', userId);
      const { data, error } = await query;
      if (!error && data) {
        setRecordings(data);
        const found = data.find(r => r.video_url === recordedVideoUrl);
        if (found) setSelectedRecording(found);
      }
      setLoading(false);
    };
    fetchAndSelect();
  }, [recordedVideoUrl]);

  // PiP logic removed

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (selectedRecording && previewVideoRef.current) {
      previewVideoRef.current.currentTime = 0;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [selectedRecording]);

  const filteredRecordings = recordings.filter(rec => {
    if (!search) return true;
    let clientArr: any[] = [];
    if (Array.isArray(rec.clients)) {
      clientArr = rec.clients;
    } else if (rec.clients) {
      clientArr = [rec.clients];
    }
    const clientNames = clientArr.flatMap((clientObj: any) => {
      if (!clientObj) return [];
      const names: string[] = [];
      if (clientObj.first_name && clientObj.last_name) {
        names.push(`${clientObj.first_name} ${clientObj.last_name}`);
        names.push(clientObj.first_name);
        names.push(clientObj.last_name);
        names.push(...`${clientObj.first_name} ${clientObj.last_name}`.split(' '));
      }
      if (clientObj.name) {
        names.push(clientObj.name);
        names.push(...clientObj.name.split(' '));
      }
      if (clientObj.email) names.push(clientObj.email);
      return names;
    });
    const displayName = rec.profiles?.display_name || '';
    const displayEmail = rec.profiles?.email || '';
    const fields = [...clientNames, displayName, displayEmail].map(f => (f || '').toLowerCase());
    const searchLower = search.toLowerCase();
    return fields.some(f => f.includes(searchLower));
  });

  // --- Styles ---
  const cardStyle: React.CSSProperties = {
    width: 480,
    background: palette.card,
    borderRadius: 10,
    boxShadow: palette.shadow,
    padding: 24,
    margin: '0 auto',
    marginBottom: 32,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: palette.text,
    border: `1px solid ${palette.border}`,
    transition: 'background 0.2s, color 0.2s'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    border: `1px solid ${palette.inputBorder}`,
    fontSize: 16,
    background: palette.inputBg,
    color: palette.inputText,
    marginBottom: 0,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'background 0.2s, color 0.2s, border 0.2s'
  };

  const previewPlaceholderStyle: React.CSSProperties = {
    width: '100%',
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: palette.textSecondary,
    background: darkMode ? '#23262f' : '#f5f5f5',
    borderRadius: 8
  };

  const recordingCardStyle = (selected: boolean): React.CSSProperties => ({
    width: 240,
    background: selected ? palette.accent5 : palette.card,
    borderRadius: 10,
    boxShadow: selected ? '0 4px 16px #1976d233' : palette.shadow,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    border: selected ? `2px solid ${palette.accent}` : '2px solid transparent',
    color: palette.text,
    transition: 'background 0.2s, color 0.2s, border 0.2s'
  });

  const transcriptBoxStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 54,
    maxHeight: 54,
    resize: 'none',
    fontSize: 13,
    color: palette.text,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 6,
    border: `1px solid ${palette.inputBorder}`,
    background: palette.inputBg,
    overflow: 'hidden',
    lineHeight: '1.2',
    boxSizing: 'border-box',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    whiteSpace: 'pre-line'
  };

  return (
    <div style={{ background: palette.bg, minHeight: '100vh', paddingBottom: 32 }}>
      <div style={{ width: 480, margin: '0 auto', marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <input
          type="text"
          placeholder="Search by member name, email, or recorder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={cardStyle}>
        <h3 style={{ color: palette.text }}>Recording Preview</h3>
        {selectedRecording && selectedRecording.video_url ? (
          <video
            key={selectedRecording.video_url}
            ref={previewVideoRef}
            src={selectedRecording.video_url}
            controls
            autoPlay
            style={{ width: '100%', borderRadius: 8, background: '#000' }}
          />
        ) : (
          <div style={previewPlaceholderStyle}>
            Select a recording below to preview
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {selectedRecording && (
            <button
              onClick={() => setSelectedRecording(null)}
              style={{
                background: palette.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 16px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clear Preview
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 24, justifyContent: 'center' }}>
        {filteredRecordings.length === 0 && !loading ? (
          <div style={{ color: palette.textSecondary, fontSize: 16, textAlign: 'center', margin: '32px 0' }}>No recordings to display yet.</div>
        ) : (
          filteredRecordings
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map(rec => {
              let clientArr: any[] = [];
              if (Array.isArray(rec.clients)) {
                clientArr = rec.clients;
              } else if (rec.clients) {
                clientArr = [rec.clients];
              }
              const clientDisplayNames = clientArr.map((clientObj: any) => {
                if (!clientObj) return '';
                if (clientObj.first_name && clientObj.last_name) return `${clientObj.first_name} ${clientObj.last_name}`;
                if (clientObj.name) return clientObj.name;
                if (clientObj.email) return clientObj.email;
                return '';
              }).filter(Boolean);
              const displayName = rec.profiles?.display_name || '-';
              const createdAt = rec.created_at ? new Date(rec.created_at).toLocaleString() : '-';
              const transcript = rec.transcript || '';
              const maxChars = 180;
              const isTruncated = transcript.length > maxChars;
              const truncatedTranscript = isTruncated
                ? transcript.slice(0, maxChars).replace(/\n/g, ' ') + '...'
                : transcript;
              const cardTitle = `${clientDisplayNames.length > 0 ? clientDisplayNames.join(',') : 'Recording'}-by-${displayName.replace(/\s+/g, '')}-${formatDateForFilename(rec.created_at)}`;
              return (
                <div
                  key={rec.id}
                  style={recordingCardStyle(selectedRecording && selectedRecording.id === rec.id)}
                  onClick={() => setSelectedRecording(rec)}
                >
                  {rec.video_url ? (
                    <video 
                      src={rec.video_url} 
                      style={{ width: '100%', borderRadius: 8, marginBottom: 10, background: '#000', cursor: 'pointer' }} 
                      controls={false}
                      onClick={e => { e.stopPropagation(); setSelectedRecording(rec); }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: 135, background: palette.inputBg, borderRadius: 8, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.textSecondary }}>No Video</div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2, color: palette.text }}>
                    {clientDisplayNames.length > 0 ? clientDisplayNames.join(', ') : ''}
                  </div>
                  <div style={{ color: palette.textSecondary, fontSize: 14, marginBottom: 2 }}>By: {displayName}</div>
                  <div style={{ color: palette.textSecondary, fontSize: 13, marginBottom: 8 }}>{createdAt}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
                    <button
                      title="Play"
                      onClick={e => { e.stopPropagation(); setSelectedRecording(rec); }}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: palette.accent, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px #1976d222', cursor: 'pointer', padding: 0 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
                        <polygon points="6,4 16,10 6,16" fill="#fff" />
                      </svg>
                    </button>
                    <button
                      title="Download"
                      onClick={async e => {
                        e.stopPropagation();
                        if (rec.video_url) {
                          try {
                            const response = await fetch(rec.video_url);
                            const blob = await response.blob();
                            const filename = `recording-${rec.id}.webm`;
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                          } catch (err) { alert('Failed to download video.'); }
                        }
                      }}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: palette.accent2, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px #28a74522', cursor: 'pointer', padding: 0 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
                        <path d="M10 3v10M10 13l-4-4M10 13l4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <rect x="4" y="16" width="12" height="2" rx="1" fill="#fff" />
                      </svg>
                    </button>
                    <button
                      title="Copy URL"
                      onClick={e => {
                        e.stopPropagation();
                        if (rec.video_url) {
                          navigator.clipboard.writeText(rec.video_url);
                          alert('Video URL copied to clipboard!');
                        }
                      }}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: '#ff9800', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px #ff980022', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
                    >
                      URL
                    </button>
                  </div>
                  <div style={transcriptBoxStyle}>
                    {transcript
                      ? truncatedTranscript
                      : <span style={{ color: palette.textSecondary }}>No transcript</span>
                    }
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, width: '100%', justifyContent: 'flex-end' }}>
                    <button
                      style={{
                        background: 'none',
                        color: palette.accent,
                        border: 'none',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        setModalTranscript(transcript || 'No transcript');
                        setModalTitle(cardTitle);
                        setModalFilename(`${cardTitle}.txt`);
                        setModalOpen(true);
                      }}
                    >
                      Read More
                    </button>
                    <button
                      style={{
                        background: 'none',
                        color: palette.accent2,
                        border: 'none',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        const text = transcript || 'No transcript';
                        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                        FileSaver.saveAs(blob, `${cardTitle}.txt`);
                      }}
                    >
                      Download Text
                    </button>
                  </div>
                </div>
              );
            })
        )}
      </div>
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: darkMode ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.32)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: palette.modalBg,
            color: palette.modalText,
            borderRadius: 10,
            maxWidth: 480,
            width: '90%',
            padding: 32,
            boxShadow: palette.modalShadow,
            position: 'relative',
            border: `1px solid ${palette.modalBorder}`
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: palette.modalText }}>{modalTitle}</h3>
            <div style={{
              maxHeight: 340,
              overflowY: 'auto',
              whiteSpace: 'pre-line',
              fontSize: 15,
              color: palette.modalText,
              marginBottom: 24
            }}>
              {modalTranscript}
            </div>
            <button
              onClick={() => {
                const text = modalTranscript || 'No transcript';
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                FileSaver.saveAs(blob, modalFilename || 'transcript.txt');
              }}
              style={{
                background: 'none',
                color: palette.accent2,
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
                marginRight: 16,
                position: 'absolute',
                left: 32,
                bottom: 24
              }}
            >
              Download Text
            </button>
            <button
              onClick={() => setModalOpen(false)}
              style={{
                background: palette.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 28px',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                position: 'absolute',
                right: 24,
                bottom: 24
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {(recording) ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'center' }}>
          <button
            onClick={() => {
              setRecording(false);
            }}
            style={{ background: palette.accent3, color: '#fff', border: 'none', borderRadius: 6, padding: '12px 28px', fontSize: 18, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px #dc354522' }}
          >
            Stop Recording
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ScreenRecorder;