import { useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Save, Download, Volume2, ArrowLeft, Settings, Music, RefreshCw } from 'lucide-react';
import audioEngine from '../utils/audioEngine';
import type { TrackNodeState } from '../utils/audioEngine';
import API_BASE_URL from '../utils/api';
import FXProcessor from './FXProcessor';

interface Session {
  _id: string;
  name: string;
  masterVolume: number;
  tracks: any[];
}

interface MixerProps {
  session: Session;
  tracksToLoad: { id: string; title: string; url: string }[];
  libraryTracks: { id: string; title: string; url: string }[];
  token: string | null;
  onBack: () => void;
  tracksListState: TrackNodeState[];
  setTracksListState: React.Dispatch<React.SetStateAction<TrackNodeState[]>>;
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
}

export default function Mixer({
  session,
  tracksToLoad,
  libraryTracks,
  token,
  onBack,
  tracksListState,
  setTracksListState,
  masterVolume,
  setMasterVolume
}: MixerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingTracks, setLoadingTracks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);

  // References for drawing real-time VU visualizers
  const canvasRefs = useRef<{ [key: string]: HTMLCanvasElement | null }>({});
  const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const tracksListRef = useRef<TrackNodeState[]>(tracksListState);
  useEffect(() => {
    tracksListRef.current = tracksListState;
  }, [tracksListState]);

  // Initialize audio tracks on mount
  useEffect(() => {
    const loadAudio = async () => {
      setLoadingTracks(true);
      audioEngine.clear();

      let initialTracks = [...tracksListState];
      if (initialTracks.length === 0) {
        initialTracks = tracksToLoad.map(t => ({
          id: t.id,
          title: t.title,
          url: t.url,
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
        }));
        setTracksListState(initialTracks);
      }

      // Add each track to audioEngine
      for (const trackState of initialTracks) {
        try {
          await audioEngine.addTrack(trackState);
        } catch (e) {
          console.error(`Failed to add track: ${trackState.title}`, e);
        }
      }

      audioEngine.updateMasterVolume(masterVolume);
      setDuration(audioEngine.getDuration());
      setLoadingTracks(false);
    };

    loadAudio();

    audioEngine.setOnTimeUpdate(() => {
      setCurrentTime(audioEngine.getCurrentTime());
      // Re-read duration in case files finished downloading metadata
      setDuration(audioEngine.getDuration());
    });

    // Start drawing canvas animations
    startVisualizers();

    return () => {
      audioEngine.pauseAll();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [tracksToLoad]);

  // Sync master volume
  useEffect(() => {
    audioEngine.updateMasterVolume(masterVolume);
  }, [masterVolume]);

  const handlePlayToggle = () => {
    if (isPlaying) {
      audioEngine.pauseAll();
      setIsPlaying(false);
    } else {
      audioEngine.playAll();
      setIsPlaying(true);
      setDuration(audioEngine.getDuration());
    }
  };

  const handleStop = () => {
    audioEngine.stopAll();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    audioEngine.seekAll(time);
    setCurrentTime(time);
  };

  // Adjust volume, pan, mute, solo
  const handleVolumeChange = (id: string, vol: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === id) {
        audioEngine.updateTrackVolume(id, vol, t.mute);
        return { ...t, volume: vol };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handlePanChange = (id: string, pan: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === id) {
        audioEngine.updateTrackPan(id, pan);
        return { ...t, pan };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleMuteToggle = (id: string) => {
    const updated = tracksListState.map(t => {
      if (t.id === id) {
        const nextMute = !t.mute;
        audioEngine.updateTrackVolume(id, t.volume, nextMute);
        return { ...t, mute: nextMute };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleSoloToggle = (id: string) => {
    // Solo logic: If active, mute all OTHER channels except solo ones
    const isAnySolo = tracksListState.some(t => t.id === id ? !t.solo : t.solo);
    
    const updated = tracksListState.map(t => {
      const isSolo = t.id === id ? !t.solo : t.solo;
      return { ...t, solo: isSolo };
    });

    setTracksListState(updated);

    // Update actual audio engine volumes based on solo overlay
    updated.forEach(t => {
      const shouldMute = t.mute || (isAnySolo && !t.solo);
      audioEngine.updateTrackVolume(t.id, t.volume, shouldMute);
    });
  };

  const handleToggleTrackInMix = async (libTrack: { id: string; title: string; url: string }) => {
    const isAlreadyInMix = tracksListState.some(t => t.id === libTrack.id);
    if (isAlreadyInMix) {
      audioEngine.removeTrack(libTrack.id);
      const updated = tracksListState.filter(t => t.id !== libTrack.id);
      setTracksListState(updated);
    } else {
      const newTrackState: TrackNodeState = {
        id: libTrack.id,
        title: libTrack.title,
        url: libTrack.url,
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
      };

      setLoadingTracks(true);
      try {
        await audioEngine.addTrack(newTrackState);
        setTracksListState(prev => [...prev, newTrackState]);
      } catch (err) {
        console.error(err);
        alert('Failed to load track into mixer');
      } finally {
        setLoadingTracks(false);
      }
    }
  };

  // Render visualizers using canvas API
  const startVisualizers = () => {
    const draw = () => {
      // 1. Draw individual track visualizers
      tracksListRef.current.forEach(track => {
        const canvas = canvasRefs.current[track.id];
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const data = audioEngine.getChannelFrequencyData(track.id);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw green/yellow/red equalizer bars
        const barWidth = canvas.width / 16;
        const spacing = 2;
        
        for (let i = 0; i < 16; i++) {
          const val = data[i] || 0; // 0 to 255
          const percent = val / 255;
          const barHeight = canvas.height * percent;
          
          // Gradient fill
          const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, 'var(--vu-green)');
          grad.addColorStop(0.7, 'var(--vu-yellow)');
          grad.addColorStop(1, 'var(--vu-red)');
          
          ctx.fillStyle = grad;
          ctx.fillRect(
            i * (barWidth + spacing),
            canvas.height - barHeight,
            barWidth,
            barHeight
          );
        }
      });

      // 2. Draw master visualizer
      const masterCanvas = masterCanvasRef.current;
      if (masterCanvas) {
        const ctx = masterCanvas.getContext('2d');
        if (ctx) {
          const data = audioEngine.getMasterFrequencyData();
          ctx.clearRect(0, 0, masterCanvas.width, masterCanvas.height);
          
          ctx.beginPath();
          ctx.strokeStyle = 'var(--accent-primary)';
          ctx.lineWidth = 2;
          
          const sliceWidth = masterCanvas.width / data.length;
          let x = 0;
          
          for (let i = 0; i < data.length; i++) {
            const val = data[i] || 0;
            const percent = val / 255;
            const y = masterCanvas.height - (masterCanvas.height * percent * 0.9);
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const handleSaveSession = async () => {
    setSaving(true);
    const sessionData = {
      id: session._id || undefined,
      name: session.name,
      masterVolume,
      tracks: tracksListState.map(t => ({
        trackId: t.id,
        title: t.title,
        volume: t.volume,
        pan: t.pan,
        mute: t.mute,
        solo: t.solo,
        eqLow: t.eqLow,
        eqMid: t.eqMid,
        eqHigh: t.eqHigh,
        vocalExtraction: t.vocalExtraction,
        noiseGateThreshold: t.noiseGateThreshold,
        pan8dEnabled: t.pan8dEnabled,
        pan8dSpeed: t.pan8dSpeed,
        playbackRate: t.playbackRate,
        lofiEnabled: t.lofiEnabled
      }))
    };

    if (!token) {
      // Guest local save
      const guestSessionsJson = localStorage.getItem('guest_sessions');
      let currentSessions: any[] = [];
      if (guestSessionsJson) {
        try {
          currentSessions = JSON.parse(guestSessionsJson);
        } catch (e) {}
      }

      const existingIdx = session._id 
        ? currentSessions.findIndex((s: any) => s._id === session._id)
        : -1;

      if (existingIdx !== -1) {
        currentSessions[existingIdx] = {
          ...currentSessions[existingIdx],
          ...sessionData,
          updatedAt: new Date().toISOString()
        };
      } else {
        const newId = 'guest-session-' + Date.now();
        currentSessions.push({
          _id: newId,
          ...sessionData,
          updatedAt: new Date().toISOString()
        });
        session._id = newId; // Update session object
      }

      localStorage.setItem('guest_sessions', JSON.stringify(currentSessions));
      alert('Session saved locally!');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sessionData)
      });
      if (response.ok) {
        const data = await response.json();
        session._id = data.session._id; // Update state reference
        alert('Session saved to cloud!');
      } else {
        alert('Failed to save session');
      }
    } catch (err) {
      console.error(err);
      alert('Connection error saving session.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportMix = async (format: 'wav' | 'mp3' = 'wav') => {
    if (tracksListState.length === 0) return;
    setExporting(true);
    try {
      const blob = await audioEngine.exportMix(tracksListState, format);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${session.name.replace(/\s+/g, '_')}_Mix.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error: any) {
      console.error(error);
      alert(`Export failed: ${error.message || error}`);
    } finally {
      setExporting(false);
    }
  };

  const formatTime = (timeSec: number) => {
    if (isNaN(timeSec)) return '0:00';
    const mins = Math.floor(timeSec / 60);
    const secs = Math.floor(timeSec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto 40px auto', padding: '0 24px' }}>
      
      {/* Header controls bar */}
      <div className="glass-panel" style={{
        padding: '20px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        marginBottom: '24px'
      }}>
        
        {/* Back Button and Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={onBack}
            className="hover-lift"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            <ArrowLeft size={16} />
            Library
          </button>
          
          <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--card-border)' }}></div>
          
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>{session.name}</h2>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Studio Console • {tracksListState.length} Active Channels
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={handlePlayToggle} 
            className="glow-btn"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isPlaying ? '0 0 15px rgba(57, 255, 20, 0.4)' : 'var(--glow-shadow)',
              background: isPlaying ? 'var(--accent-green)' : 'var(--accent-gradient)'
            }}
          >
            {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: '2px' }} />}
          </button>
          
          <button 
            onClick={handleStop}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '1px solid var(--card-border)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="hover-lift"
          >
            <Square size={16} fill="var(--text-primary)" />
          </button>

          {/* Time scrubber */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-secondary)', width: '40px', textAlign: 'right' }}>
              {formatTime(currentTime)}
            </span>
            <input 
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              style={{ width: '160px' }}
            />
            <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)', width: '40px' }}>
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Project Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleSaveSession}
            disabled={saving}
            className="hover-lift"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--card-border)',
              borderRadius: '8px',
              padding: '10px 16px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button 
            onClick={() => handleExportMix('wav')}
            disabled={exporting}
            className="hover-lift"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--card-border)',
              borderRadius: '8px',
              padding: '10px 16px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {exporting ? (
              <>
                <RefreshCw size={16} className="spin-slow" />
                Rendering...
              </>
            ) : (
              <>
                <Download size={16} />
                Export WAV
              </>
            )}
          </button>

          <button 
            onClick={() => handleExportMix('mp3')}
            disabled={exporting}
            className="glow-btn"
            style={{
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {exporting ? (
              <>
                <RefreshCw size={16} className="spin-slow" />
                Rendering...
              </>
            ) : (
              <>
                <Download size={16} />
                Export MP3
              </>
            )}
          </button>
        </div>

      </div>

      {/* Main Mixer Rack */}
      {loadingTracks ? (
        <div className="glass-panel" style={{ padding: '80px 0', textAlign: 'center' }}>
          <RefreshCw size={36} className="spin-slow" style={{ color: 'var(--accent-primary)', marginBottom: '16px' }} />
          <h4 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Initializing Audio Buffers</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Configuring real-time routing graph nodes...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Master Output Fader Card */}
          <div className="glass-panel" style={{
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderLeft: '4px solid var(--accent-primary)',
            background: 'linear-gradient(90deg, rgba(0, 242, 254, 0.03) 0%, transparent 100%)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--accent-primary)', display: 'flex' }} className="pulse-glow">
                <Volume2 size={24} />
              </div>
              <div>
                <span style={{ fontSize: '1rem', fontWeight: 700 }}>Master Output Console</span>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Summed Stereo Mix Output</div>
              </div>
            </div>

            {/* Master Master Volume control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, maxWidth: '480px', margin: '0 40px' }}>
              <input 
                type="range"
                min={0}
                max={1.5}
                step={0.01}
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', width: '36px', color: 'var(--accent-primary)', fontWeight: 700 }}>
                {Math.round(masterVolume * 100)}%
              </span>
            </div>

            {/* Master Analyzer Oscilloscope */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <canvas 
                ref={masterCanvasRef}
                width={160}
                height={40}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px'
                }}
              />
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase' }}>
                Oscilloscope
              </span>
            </div>
          </div>

          {/* Audio Input Patchbay / Routing */}
          <div className="glass-panel" style={{ padding: '20px 24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', marginBottom: '14px' }}>
              <Music size={18} style={{ color: 'var(--accent-primary)' }} />
              Audio Input Patchbay
              <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '6px' }}>
                (Select tracks from your library to route them into the mixing board)
              </span>
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {libraryTracks.map(libTrack => {
                const isActive = tracksListState.some(t => t.id === libTrack.id);
                return (
                  <button
                    key={libTrack.id}
                    onClick={() => handleToggleTrackInMix(libTrack)}
                    className="hover-lift"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      borderRadius: '20px',
                      border: '1px solid var(--card-border)',
                      backgroundColor: isActive ? 'rgba(0, 242, 254, 0.12)' : 'var(--bg-secondary)',
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      borderColor: isActive ? 'var(--accent-primary)' : 'var(--card-border)',
                      boxShadow: isActive ? '0 0 10px rgba(0, 242, 254, 0.2)' : 'none',
                    }}
                  >
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isActive ? 'var(--vu-green)' : 'var(--text-muted)',
                      boxShadow: isActive ? '0 0 8px var(--vu-green)' : 'none',
                    }}></span>
                    {libTrack.title}
                    {isActive ? (
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>[Active]</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>+ Add</span>
                    )}
                  </button>
                );
              })}
              {libraryTracks.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px 0' }}>
                  No tracks available in your library. Upload some in the Library dashboard first!
                </div>
              )}
            </div>
          </div>

          {/* Individual Channel Strips Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tracksListState.map((track) => {
              const isDSPExpanded = expandedTrackId === track.id;
              return (
                <div key={track.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="glass-panel" style={{
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '20px',
                    background: track.mute ? 'rgba(0,0,0,0.1)' : 'var(--card-bg)'
                  }}>
                    
                    {/* 1. Channel Name and Icon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '220px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: track.mute ? 'var(--card-border)' : 'rgba(127, 0, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: track.mute ? 'var(--text-muted)' : 'var(--accent-secondary)'
                      }}>
                        <Music size={18} />
                      </div>
                      <div>
                        <h4 style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: track.mute ? 'var(--text-secondary)' : 'var(--text-primary)',
                          textDecoration: track.mute ? 'line-through' : 'none'
                        }}>
                          {track.title}
                        </h4>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Mono/Stereo Fader
                        </span>
                      </div>
                    </div>

                    {/* 2. VU Meter visualizer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <canvas 
                        ref={el => { canvasRefs.current[track.id] = el; }}
                        width={90}
                        height={40}
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--card-border)',
                          borderRadius: '6px'
                        }}
                      />
                    </div>

                    {/* 3. Volume Fader */}
                    <div style={{ display: 'flex', flexDirection: 'column', width: '220px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>Volume</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {Math.round(track.volume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.01}
                        value={track.volume}
                        onChange={(e) => handleVolumeChange(track.id, parseFloat(e.target.value))}
                        disabled={track.mute}
                      />
                    </div>

                    {/* 4. Panning Dial */}
                    <div style={{ display: 'flex', flexDirection: 'column', width: '140px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>Pan</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {track.pan8dEnabled ? '8D AUTO' : (track.pan === 0 ? 'C' : (track.pan < 0 ? `L${Math.round(Math.abs(track.pan)*100)}` : `R${Math.round(track.pan*100)}`))}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-1.0}
                        max={1.0}
                        step={0.05}
                        value={track.pan}
                        onChange={(e) => handlePanChange(track.id, parseFloat(e.target.value))}
                        disabled={track.mute || track.pan8dEnabled}
                      />
                    </div>

                    {/* 5. Solo / Mute Toggles */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleMuteToggle(track.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--card-border)',
                          backgroundColor: track.mute ? 'rgba(255, 0, 127, 0.2)' : 'var(--bg-secondary)',
                          color: track.mute ? 'var(--accent-pink)' : 'var(--text-secondary)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          borderColor: track.mute ? 'var(--accent-pink)' : 'var(--card-border)'
                        }}
                        className="hover-lift"
                      >
                        MUTE
                      </button>
                      
                      <button
                        onClick={() => handleSoloToggle(track.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--card-border)',
                          backgroundColor: track.solo ? 'rgba(255, 255, 0, 0.15)' : 'var(--bg-secondary)',
                          color: track.solo ? 'yellow' : 'var(--text-secondary)',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          borderColor: track.solo ? 'yellow' : 'var(--card-border)'
                        }}
                        className="hover-lift"
                      >
                        SOLO
                      </button>
                    </div>

                    {/* 6. FX settings Board Button */}
                    <button
                      onClick={() => setExpandedTrackId(isDSPExpanded ? null : track.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: isDSPExpanded ? '1px solid var(--accent-primary)' : '1px solid var(--card-border)',
                        backgroundColor: isDSPExpanded ? 'rgba(0, 242, 254, 0.12)' : 'var(--bg-secondary)',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 600
                      }}
                      className="hover-lift"
                    >
                      <Settings size={14} />
                      {isDSPExpanded ? 'Close DSP' : 'DSP Board'}
                    </button>

                  </div>

                  {isDSPExpanded && (
                    <div style={{ marginTop: '8px', marginBottom: '16px' }}>
                      <FXProcessor
                        trackId={track.id}
                        tracksListState={tracksListState}
                        setTracksListState={setTracksListState}
                        inline={true}
                      />
                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}
