import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, Upload, Trash2, Sliders, Music, FileAudio, Check, AlertCircle, RefreshCw, CloudOff } from 'lucide-react';
import API_BASE_URL from '../utils/api';
import { get, set } from 'idb-keyval';

interface Track {
  _id: string;
  title: string;
  filename: string;
  filepath: string;
  size: number;
  mimeType: string;
}

interface Session {
  _id: string;
  name: string;
  masterVolume: number;
  tracks: any[];
  updatedAt: string;
}

interface DashboardProps {
  token: string | null;
  onOpenSession: (
    session: Session | null,
    tracksToLoad: { id: string; title: string; url: string }[],
    libraryTracks: { id: string; title: string; url: string }[]
  ) => void;
  onOpenPlayer: (tracks: { id: string; title: string; url: string }[]) => void;
}

export default function Dashboard({ token, onOpenSession }: DashboardProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [, setPendingUploads] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preloaded stems for instant mixing/testing
  const preloadedStems = [
    {
      _id: 'pre-drums',
      id: 'pre-drums',
      title: 'Synthwave Drums (Stem)',
      filename: 'drums.mp3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      isPreloaded: true
    },
    {
      _id: 'pre-melody',
      id: 'pre-melody',
      title: 'Acoustic Guitar (Stem)',
      filename: 'guitar.mp3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      isPreloaded: true
    },
    {
      _id: 'pre-piano',
      id: 'pre-piano',
      title: 'Ambient Piano (Stem)',
      filename: 'piano.mp3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      isPreloaded: true
    }
  ];

  const API_URL = `${API_BASE_URL}/api`;

  useEffect(() => {
    fetchTracks();
    fetchSessions();
  }, [token]);

  const fetchTracks = async () => {
    if (!token) {
      const guestTracksJson = localStorage.getItem('guest_tracks');
      if (guestTracksJson) {
        try {
          setTracks(JSON.parse(guestTracksJson).map((t: any) => ({ ...t, id: t._id })));
        } catch (e) {
          setTracks([]);
        }
      }
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tracks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        
        const pending = await get('pending_uploads') || [];
        setPendingUploads(pending);
        
        const pendingTracks = pending.map((file: File) => ({
          _id: 'pending-' + file.name + '-' + file.size,
          id: 'pending-' + file.name + '-' + file.size,
          title: file.name.replace(/\.[^/.]+$/, ""),
          filename: file.name,
          filepath: URL.createObjectURL(file),
          size: file.size,
          mimeType: file.type,
          isGuestUrl: true,
          isPendingSync: true
        }));
        
        setTracks([...pendingTracks, ...data.map((t: any) => ({ ...t, id: t._id }))]);
      }
    } catch (err) {
      console.error('Error fetching tracks:', err);
    }
  };

  const fetchSessions = async () => {
    if (!token) {
      const guestSessionsJson = localStorage.getItem('guest_sessions');
      if (guestSessionsJson) {
        try {
          setSessions(JSON.parse(guestSessionsJson));
        } catch (e) {
          setSessions([]);
        }
      }
      return;
    }

    try {
      const response = await fetch(`${API_URL}/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploading(true);
    setError('');
    setSuccess('');

    if (!token) {
      const objectUrl = URL.createObjectURL(file);
      const newGuestTrack = {
        _id: 'guest-' + Date.now(),
        id: 'guest-' + Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ""),
        filename: file.name,
        filepath: objectUrl,
        size: file.size,
        mimeType: file.type,
        isGuestUrl: true
      };

      const updated = [newGuestTrack, ...tracks];
      setTracks(updated);
      localStorage.setItem('guest_tracks', JSON.stringify(updated));
      setSuccess(`"${file.name}" loaded locally!`);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ""));

    try {
      const response = await fetch(`${API_URL}/tracks/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to upload');

      setSuccess('Audio track uploaded successfully!');
      fetchTracks();
    } catch (err: any) {
      const currentPending = await get('pending_uploads') || [];
      if (!currentPending.find((f: File) => f.name === file.name && f.size === file.size)) {
        currentPending.push(file);
        await set('pending_uploads', currentPending);
      }
      setError(`Upload failed. Saved "${file.name}" locally!`);
      fetchTracks();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSyncPending = async () => {
    setUploading(true);
    let pending = await get('pending_uploads') || [];
    let successCount = 0;
    let newPending: File[] = [];
    
    for (const file of pending) {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ""));
      
      try {
        const response = await fetch(`${API_URL}/tracks/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (response.ok) {
          successCount++;
        } else {
          newPending.push(file);
        }
      } catch (err) {
        newPending.push(file);
      }
    }
    
    await set('pending_uploads', newPending);
    fetchTracks();
    setUploading(false);
    
    if (successCount > 0) {
      setSuccess(`Successfully synced ${successCount} track(s)!`);
      setError('');
    }
    if (newPending.length > 0) {
      setError(`Failed to sync ${newPending.length} track(s).`);
    }
  };

  const deleteTrack = async (trackId: string) => {
    const track = tracks.find(t => t._id === trackId);
    if (!track) return;

    if ((track as any).isPendingSync) {
      let pending = await get('pending_uploads') || [];
      pending = pending.filter((f: File) => 'pending-' + f.name + '-' + f.size !== trackId);
      await set('pending_uploads', pending);
      setSuccess('Pending track removed.');
      fetchTracks();
      return;
    }

    if (!token || (track as any).isGuestUrl) {
      const updated = tracks.filter(t => t._id !== trackId);
      setTracks(updated);
      localStorage.setItem('guest_tracks', JSON.stringify(updated));
      setSuccess('Track removed.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tracks/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuccess('Track deleted.');
        fetchTracks();
      }
    } catch (err) {
      setError('Error deleting track.');
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!token) {
      const updated = sessions.filter(s => s._id !== sessionId);
      setSessions(updated);
      localStorage.setItem('guest_sessions', JSON.stringify(updated));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSession = () => {
    if (!sessionName.trim()) {
      setError('Please provide a session name.');
      return;
    }

    const newSession: Session = {
      _id: '',
      name: sessionName.trim(),
      masterVolume: 1.0,
      tracks: [],
      updatedAt: new Date().toISOString()
    };

    const library = [
      ...preloadedStems.map(s => ({ id: s.id, title: s.title, url: s.url })),
      ...tracks.map(track => ({
        id: track._id || (track as any).id,
        title: track.title,
        url: (track as any).isGuestUrl ? track.filepath : `${API_URL}/tracks/${track._id || (track as any).id}/file`
      }))
    ];

    onOpenSession(newSession, [], library);
  };

  const handleQuickMix = (trackItem: any) => {
    const newSession: Session = {
      _id: '',
      name: `Mix: ${trackItem.title}`,
      masterVolume: 1.0,
      tracks: [
        {
          trackId: trackItem.id || trackItem._id,
          title: trackItem.title,
          volume: 0.8,
          pan: 0.0,
          mute: false,
          solo: false,
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
          vocalExtraction: 'none',
          noiseGateThreshold: -100,
          pan8dEnabled: false,
          pan8dSpeed: 0.1,
          playbackRate: 1.0,
          pitchShift: 1.0,
          preservePitch: true,
          lofiEnabled: false,
          fxBlend: 1.0
        }
      ],
      updatedAt: new Date().toISOString()
    };

    const matchedUrl = trackItem.isPreloaded 
      ? trackItem.url 
      : trackItem.isGuestUrl 
        ? trackItem.filepath 
        : `${API_URL}/tracks/${trackItem.id || trackItem._id}/file`;

    const tracksToLoad = [
      {
        id: trackItem.id || trackItem._id,
        title: trackItem.title,
        url: matchedUrl
      }
    ];

    const libraryTracks = [
      ...preloadedStems.map(s => ({ id: s.id || s._id, title: s.title, url: s.url })),
      ...tracks.map(t => ({
        id: t._id || (t as any).id,
        title: t.title,
        url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id || (t as any).id}/file`
      }))
    ];

    onOpenSession(newSession, tracksToLoad, libraryTracks);
  };

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto 40px auto', padding: '0 16px' }}>
      
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(255, 0, 127, 0.1)', border: '1px solid rgba(255, 0, 127, 0.2)', color: 'var(--accent-pink)', marginBottom: '20px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(57, 255, 20, 0.1)', border: '1px solid rgba(57, 255, 20, 0.2)', color: 'var(--accent-green)', marginBottom: '20px' }}>
          <Check size={16} />
          <span>{success}</span>
        </div>
      )}

      <div className="dashboard-grid">
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem', marginBottom: '16px' }}>
              <FolderPlus size={18} style={{ color: 'var(--accent-primary)' }} />
              New Mixing Session
            </h3>
            <div className="new-session-row">
              <input
                type="text"
                placeholder="e.g. Synthwave Mix #1"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  minWidth: 0
                }}
              />
              <button onClick={handleCreateSession} className="glow-btn" style={{ flexShrink: 0 }}>
                Create
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px', flex: 1 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem', marginBottom: '16px' }}>
              <Sliders size={18} style={{ color: 'var(--accent-secondary)' }} />
              Saved Mix Sessions ({sessions.length})
            </h3>
            
            {sessions.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No saved sessions found.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                {sessions.map(session => (
                  <div 
                    key={session._id} 
                    className="glass-card"
                    onClick={() => {
                      const library = [
                        ...preloadedStems.map(s => ({ id: s.id || s._id, title: s.title, url: s.url })),
                        ...tracks.map(t => ({
                          id: t._id || (t as any).id,
                          title: t.title,
                          url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id || (t as any).id}/file`
                        }))
                      ];
                      
                      const tracksToLoad = tracks
                        .filter(t => session.tracks?.some((st: any) => st.trackId === t._id))
                        .map(t => ({
                          id: t._id || (t as any).id,
                          title: t.title,
                          url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id || (t as any).id}/file`
                        }));

                      onOpenSession(session, tracksToLoad, library);
                    }}
                    style={{ padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(0, 210, 211, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-primary)'
                      }}>
                        <Music size={24} />
                      </div>
                      <div style={{ 
                        padding: '4px 8px', 
                        backgroundColor: 'var(--bg-primary)', 
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        color: 'var(--text-secondary)'
                      }}>
                        {session.tracks?.length || 0} tracks
                      </div>
                    </div>
                    
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{session.name}</h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : ''}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteSession(session._id); }}
                        className="hover-lift"
                        style={{ background: 'none', border: 'none', color: 'var(--accent-pink)', cursor: 'pointer', padding: '8px' }}
                      >
                        <Trash2 size={18} />
                      </button>
                      <div 
                        className="glow-btn"
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                        }}
                      >
                        Open Mix
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '28px' }}>
          <div className="library-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
              <Music size={18} style={{ color: 'var(--accent-primary)' }} />
              Audio Library
            </h3>

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="audio/*" 
              style={{ display: 'none' }} 
            />
            
            <div style={{ display: 'flex', gap: '8px' }}>
              {tracks.some(t => (t as any).isPendingSync) && (
                <button 
                  onClick={handleSyncPending} 
                  className="glow-btn"
                  disabled={uploading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', fontSize: '0.82rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--accent-pink)' }}
                >
                  <RefreshCw size={15} style={{ color: 'var(--accent-pink)' }} className={uploading ? "spin-animation" : ""} />
                  {uploading ? 'Syncing...' : 'Retry Sync'}
                </button>
              )}
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="glow-btn"
                disabled={uploading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', fontSize: '0.82rem' }}
              >
                <Upload size={15} />
                {uploading ? 'Processing...' : 'Upload Track'}
              </button>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Mix your own custom files, or use the preloaded stems below. Supported formats: MP3, WAV, OGG, AAC.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* 1. Preloaded stems section */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                Preloaded Studio Loop Stems
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {preloadedStems.map(stem => (
                  <div 
                    key={stem.id} 
                    className="track-item-row hover-lift glass-card" 
                    onClick={() => handleQuickMix(stem)}
                    style={{
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      border: '1px solid rgba(0, 210, 211, 0.15)',
                      backgroundColor: 'rgba(0, 210, 211, 0.05)',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{ color: 'var(--accent-secondary)', flexShrink: 0 }}>
                        <FileAudio size={20} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stem.title}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Demo Loop Stem</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.65rem', backgroundColor: 'var(--accent-secondary)', color: 'white', padding: '3px 8px', borderRadius: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Preloaded
                      </span>
                      <div 
                        className="glow-btn"
                        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '8px' }}
                      >
                        <Sliders size={12} />
                        Mix
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. User Uploaded Files */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                Your Custom Uploads ({tracks.length})
              </div>
              
              {tracks.length === 0 ? (
                <div style={{
                  border: '2px dashed var(--card-border)',
                  borderRadius: '10px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                  <span>Drag & drop or click to upload audio files</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
                  {tracks.map(track => (
                    <div 
                      key={track._id} 
                      className="track-item-row hover-lift glass-card"
                      onClick={() => handleQuickMix(track)}
                      style={{
                        padding: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        marginBottom: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                          <FileAudio size={20} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {(track.size / (1024 * 1024)).toFixed(1)} MB • {track.filename.split('.').pop()?.toUpperCase()}
                            {(track as any).isPendingSync && (
                              <span style={{ color: 'var(--accent-pink)', display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '6px' }}>
                                <CloudOff size={10} /> Pending Upload
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <div 
                          className="glow-btn"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '8px' }}
                        >
                          <Sliders size={12} />
                          Mix
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteTrack(track._id); }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', flexShrink: 0 }}
                          className="hover-lift"
                        >
                          <Trash2 size={16} style={{ color: 'var(--accent-pink)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

