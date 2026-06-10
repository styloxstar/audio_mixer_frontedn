import React, { useState, useEffect, useRef } from 'react';
import { Play, FolderPlus, Upload, Trash2, Sliders, Music, FileAudio, Check, AlertCircle, RefreshCw, CloudOff } from 'lucide-react';
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

export default function Dashboard({ token, onOpenSession, onOpenPlayer }: DashboardProps) {
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
      title: 'Synthwave Drums (Stem)',
      filename: 'drums.mp3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Backup long track
      isPreloaded: true
    },
    {
      _id: 'pre-melody',
      title: 'Acoustic Guitar (Stem)',
      filename: 'guitar.mp3',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      isPreloaded: true
    },
    {
      _id: 'pre-piano',
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
      // Guest Mode: load uploaded tracks from localStorage references (if any) or stick to preloaded
      const guestTracksJson = localStorage.getItem('guest_tracks');
      if (guestTracksJson) {
        try {
          setTracks(JSON.parse(guestTracksJson));
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
        
        // Load offline pending uploads
        const pending = await get('pending_uploads') || [];
        setPendingUploads(pending);
        
        const pendingTracks = pending.map((file: File) => ({
          _id: 'pending-' + file.name + '-' + file.size,
          title: file.name.replace(/\.[^/.]+$/, ""),
          filename: file.name,
          filepath: URL.createObjectURL(file), // temporary local URL for offline playback
          size: file.size,
          mimeType: file.type,
          isGuestUrl: true,
          isPendingSync: true
        }));
        
        setTracks([...pendingTracks, ...data]);
      }
    } catch (err) {
      console.error('Error fetching tracks:', err);
    }
  };

  const fetchSessions = async () => {
    if (!token) {
      // Guest Mode: fetch sessions from localStorage
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
      // Guest Mode: Generate client-side Object URL
      const objectUrl = URL.createObjectURL(file);
      
      const newGuestTrack = {
        _id: 'guest-' + Date.now(),
        title: file.name.replace(/\.[^/.]+$/, ""), // remove extension
        filename: file.name,
        filepath: objectUrl, // Use blob url directly
        size: file.size,
        mimeType: file.type,
        isGuestUrl: true
      };

      const updated = [newGuestTrack, ...tracks];
      setTracks(updated);
      localStorage.setItem('guest_tracks', JSON.stringify(updated));
      setSuccess(`"${file.name}" loaded locally for guest mixing!`);
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Authenticated Mode: Upload to backend
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
      // Offline Fallback for large files (Vercel 413) or network errors
      console.warn("Upload failed, falling back to local database", err);
      const currentPending = await get('pending_uploads') || [];
      if (!currentPending.find((f: File) => f.name === file.name && f.size === file.size)) {
        currentPending.push(file);
        await set('pending_uploads', currentPending);
      }
      setError(`Cloud upload failed (${err.message || 'Limit Exceeded'}). Saved "${file.name}" locally for offline mixing!`);
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
      setError(`Failed to sync ${newPending.length} track(s). Vercel 4.5MB limit likely exceeded.`);
    }
  };

  const handleDeleteTrack = async (trackId: string, isGuestUrl?: boolean, isPendingSync?: boolean) => {
    if (isPendingSync) {
      // Remove from IndexedDB pending list
      let pending = await get('pending_uploads') || [];
      // we match by name since our ID was generated as 'pending-' + name + '-' + size
      pending = pending.filter((f: File) => 'pending-' + f.name + '-' + f.size !== trackId);
      await set('pending_uploads', pending);
      setSuccess('Pending track removed locally.');
      fetchTracks();
      return;
    }

    if (!token || isGuestUrl) {
      // Guest delete
      const updated = tracks.filter(t => t._id !== trackId);
      setTracks(updated);
      localStorage.setItem('guest_tracks', JSON.stringify(updated));
      setSuccess('Track removed locally.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tracks/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuccess('Track deleted successfully.');
        fetchTracks();
      } else {
        setError('Failed to delete track.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error deleting track.');
    }
  };

  const handleCreateSession = () => {
    if (!sessionName.trim()) {
      setError('Please provide a session name.');
      return;
    }

    // Create an empty session structure
    const newSession: Session = {
      _id: '',
      name: sessionName.trim(),
      masterVolume: 1.0,
      tracks: [],
      updatedAt: new Date().toISOString()
    };

    const libraryTracks = [
      ...preloadedStems.map(s => ({ id: s._id, title: s.title, url: s.url })),
      ...tracks.map(t => ({
        id: t._id,
        title: t.title,
        url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id}/file`
      }))
    ];

    onOpenSession(newSession, [], libraryTracks);
  };

  const handleQuickMix = (trackItem: any) => {
    const newSession: Session = {
      _id: '',
      name: `Mix: ${trackItem.title}`,
      masterVolume: 1.0,
      tracks: [
        {
          trackId: trackItem._id,
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
          lofiEnabled: false
        }
      ],
      updatedAt: new Date().toISOString()
    };

    const matchedUrl = trackItem.isPreloaded 
      ? trackItem.url 
      : trackItem.isGuestUrl 
        ? trackItem.filepath 
        : `${API_URL}/tracks/${trackItem._id}/file`;

    const tracksToLoad = [
      {
        id: trackItem._id,
        title: trackItem.title,
        url: matchedUrl
      }
    ];

    const libraryTracks = [
      ...preloadedStems.map(s => ({ id: s._id, title: s.title, url: s.url })),
      ...tracks.map(t => ({
        id: t._id,
        title: t.title,
        url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id}/file`
      }))
    ];

    onOpenSession(newSession, tracksToLoad, libraryTracks);
  };

  const handleOpenExistingSession = (session: Session) => {
    // Map tracks in session to URLs
    const tracksToLoad = session.tracks.map((t: any) => {
      // Find track URL from loaded libraries
      let url = '';
      const matchedPre = preloadedStems.find(p => p._id === t.trackId);
      if (matchedPre) {
        url = matchedPre.url;
      } else {
        const matchedLib = tracks.find(l => l._id === t.trackId);
        if (matchedLib) {
          // If guest URL it is stored directly in filepath, else backend URL
          url = (matchedLib as any).isGuestUrl 
            ? matchedLib.filepath 
            : `${API_URL}/tracks/${matchedLib._id}/file`;
        }
      }

      return {
        id: t.trackId,
        title: t.title || 'Studio Track',
        url: url
      };
    }).filter(t => t.url !== '');

    const libraryTracks = [
      ...preloadedStems.map(s => ({ id: s._id, title: s.title, url: s.url })),
      ...tracks.map(t => ({
        id: t._id,
        title: t.title,
        url: (t as any).isGuestUrl ? t.filepath : `${API_URL}/tracks/${t._id}/file`
      }))
    ];

    onOpenSession(session, tracksToLoad, libraryTracks);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!token) {
      // Guest delete
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

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto 40px auto', padding: '0 16px' }}>
      
      {/* Messages */}
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
        
        {/* Left Column: Create & Load Projects */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* New Session Panel */}
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
            
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.15rem', marginBottom: '16px' }}>
                <Music size={18} style={{ color: 'var(--accent-primary)' }} />
                Music Player
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Listen to your library, manage playlists, and mix directly from the player.
              </p>
              <button 
                onClick={() => {
                  const combined = [...preloadedStems, ...tracks].map(t => ({
                    id: t._id,
                    title: t.title,
                    url: (t as any).filepath || (t as any).url || ''
                  }));
                  onOpenPlayer(combined);
                }} 
                className="glow-btn" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
              >
                <Play size={16} /> Open Music Player
              </button>
            </div>
          </div>

          {/* Project Sessions List */}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '380px', overflowY: 'auto' }}>
                {sessions.map((session) => (
                  <div key={session._id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--card-border)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{session.name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Tracks: {session.tracks?.length || 0} • {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleOpenExistingSession(session)}
                        className="glow-btn"
                        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Play size={12} fill="white" />
                        Open
                      </button>
                      <button 
                        onClick={() => handleDeleteSession(session._id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '6px'
                        }}
                        className="hover-lift"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Audio Library */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          
          <div className="library-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
              <Music size={18} style={{ color: 'var(--accent-primary)' }} />
              Audio Library
            </h3>

            {/* Hidden upload input */}
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
                  <div key={stem._id} className="track-item-row" style={{
                    backgroundColor: 'rgba(127, 0, 255, 0.05)',
                    border: '1px solid rgba(127, 0, 255, 0.15)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ color: 'var(--accent-secondary)', flexShrink: 0 }}>
                        <FileAudio size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stem.title}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Demo Loop Stem</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.65rem', backgroundColor: 'var(--accent-secondary)', color: 'white', padding: '2px 7px', borderRadius: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Preloaded
                      </span>
                      <button 
                        onClick={() => handleQuickMix(stem)}
                        className="glow-btn"
                        style={{ padding: '5px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}
                      >
                        <Sliders size={11} />
                        Mix
                      </button>
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
                    <div key={track._id} className="track-item-row" style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--card-border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                          <FileAudio size={18} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                        <button 
                          onClick={() => handleQuickMix(track)}
                          className="glow-btn"
                          style={{ padding: '5px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '5px', borderRadius: '6px' }}
                        >
                          <Sliders size={11} />
                          Mix
                        </button>
                        <button 
                          onClick={() => handleDeleteTrack(track._id, (track as any).isGuestUrl, (track as any).isPendingSync)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', flexShrink: 0 }}
                          className="hover-lift"
                        >
                          <Trash2 size={15} style={{ color: 'var(--accent-pink)' }} />
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

