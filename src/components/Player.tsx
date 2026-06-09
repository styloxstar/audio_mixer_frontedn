import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Clock, Sliders, ArrowLeft, Disc, FolderSearch, Volume2, VolumeX, ListMusic } from 'lucide-react';
import { get, set as idbSet } from 'idb-keyval';
import toast from 'react-hot-toast';
import { parseAudioMetadata } from '../utils/musicMetadata';

export interface Track {
  id: string;
  title: string;
  url: string;
  artist?: string;
  albumArt?: string | null;
  file?: File;
  isLocal?: boolean;
}

interface PlayerProps {
  libraryTracks: Track[];
  onMix: (track: Track) => void;
  onBack: () => void;
}

export default function Player({ libraryTracks, onMix, onBack }: PlayerProps) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);

  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);

  // EQ State
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);

  const [scanning, setScanning] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<{ low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Merge library tracks with any previously scanned tracks if we want, 
    // but right now we just initialize with library tracks. Local tracks are added via scan.
    if (libraryTracks.length > 0 && queue.length === 0) {
      setQueue([...libraryTracks]);
    }
  }, [libraryTracks]);

  // Try to load persisted directory handle on mount
  useEffect(() => {
    const restoreLocalFolder = async () => {
      try {
        const handle = await get('musicFolderHandle');
        if (handle) {
          // We must wait for user interaction to request permission in modern browsers,
          // so we don't auto-scan on mount unless we know we have permission.
          // We can check permission:
          const options = { mode: 'read' as const };
          if ((await handle.queryPermission(options)) === 'granted') {
            await processDirectory(handle);
          }
        }
      } catch (err) {
        console.error('Error restoring directory', err);
      }
    };
    const restoreLocalFiles = async () => {
      try {
        const files: File[] = await get('localFiles');
        if (files && files.length > 0) {
          await processFileObjects(files, false);
        }
      } catch (err) {
        console.error('Error restoring local files', err);
      }
    };
    restoreLocalFolder();
    restoreLocalFiles();
  }, []);

  // Audio Context & EQ Setup
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (!(audioRef.current as any)._sourceNodeCreated) {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }

      const ctx = audioCtxRef.current;
      const source = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current = source;
      (audioRef.current as any)._sourceNodeCreated = true;

      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 320;
      
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.5;

      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 3200;

      source.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(ctx.destination);

      filtersRef.current = { low, mid, high };
    }
  }, []);

  // Update EQ
  useEffect(() => {
    if (filtersRef.current) {
      filtersRef.current.low.gain.value = eqLow;
      filtersRef.current.mid.gain.value = eqMid;
      filtersRef.current.high.gain.value = eqHigh;
    }
  }, [eqLow, eqMid, eqHigh]);

  // Handle Play/Pause
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      
      if (isPlaying) {
        if (audioCtxRef.current?.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentIndex, queue, volume, isMuted]);

  // Handle Sleep Timer
  useEffect(() => {
    if (sleepTimer === null) {
      setSleepTimerRemaining(null);
      return;
    }

    setSleepTimerRemaining(sleepTimer * 60);
    
    const interval = setInterval(() => {
      setSleepTimerRemaining(prev => {
        if (prev && prev <= 1) {
          setIsPlaying(false);
          setSleepTimer(null);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimer]);

  const processFileObjects = async (files: File[], persist: boolean = false) => {
    setScanning(true);
    const newTracks: Track[] = [];
    
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['mp3', 'wav', 'ogg', 'aac'].includes(ext || '')) {
        const metadata = await parseAudioMetadata(file);
        newTracks.push({
          id: `local-${file.name}-${Date.now()}`,
          title: metadata.title,
          artist: metadata.artist,
          url: URL.createObjectURL(file), // Generate object URL
          albumArt: metadata.pictureUrl,
          file: file,
          isLocal: true
        });
      }
    }
    
    setQueue(prev => {
      const combined = [...prev, ...newTracks];
      // Remove duplicates
      const unique = combined.filter((v, i, a) => a.findIndex(t => t.title === v.title && t.id === v.id) === i);
      return unique;
    });

    if (persist) {
      try {
        const existingFiles: File[] = await get('localFiles') || [];
        const combinedFiles = [...existingFiles, ...files];
        const uniqueFiles = combinedFiles.filter((v, i, a) => a.findIndex(f => f.name === v.name && f.size === v.size) === i);
        await idbSet('localFiles', uniqueFiles);
      } catch (err) {
        console.error('Failed saving files to IndexedDB', err);
      }
    }
    
    setScanning(false);
  };

  const processDirectory = async (dirHandle: any) => {
    setScanning(true);
    const newTracks: Track[] = [];
    
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (['mp3', 'wav', 'ogg', 'aac'].includes(ext || '')) {
            const metadata = await parseAudioMetadata(file);
            newTracks.push({
              id: `local-${file.name}-${Date.now()}`,
              title: metadata.title,
              artist: metadata.artist,
              url: URL.createObjectURL(file), // Generate object URL
              albumArt: metadata.pictureUrl,
              file: file,
              isLocal: true
            });
          }
        }
      }
      
      setQueue(prev => {
        const combined = [...prev, ...newTracks];
        // Remove duplicates by id or name?
        const unique = combined.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
        return unique;
      });
      
    } catch (err) {
      console.error('Failed reading directory', err);
    }
    setScanning(false);
  };

  const handleScanFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        fileInputRef.current?.click();
        return;
      }
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read'
      });
      await idbSet('musicFolderHandle', dirHandle);
      await processDirectory(dirHandle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Scan folder error:', err);
        fileInputRef.current?.click();
      }
    }
  };

  const handleFallbackFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      await processFileObjects(filesArray, true);
    }
  };

  const togglePlay = () => {
    if (queue.length === 0) {
      toast.error('No audio track available. Please scan a local folder or load from library.');
      return;
    }
    setIsPlaying(!isPlaying);
  };

  const nextTrack = () => {
    if (queue.length === 0) return;
    if (shuffle) {
      setCurrentIndex(Math.floor(Math.random() * queue.length));
    } else {
      setCurrentIndex((prev) => (prev + 1) % queue.length);
    }
  };

  const prevTrack = () => {
    if (queue.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + queue.length) % queue.length);
  };

  const onEnded = () => {
    if (repeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      nextTrack();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentTrack = queue[currentIndex];

  // Removed empty state block

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto 40px auto', padding: '0 16px', position: 'relative' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
        <input 
          type="file" 
          multiple 
          accept="audio/*" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFallbackFileSelect} 
        />
        <button onClick={onBack} className="hover-lift" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={18} /> Dashboard
        </button>
        <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Music Player</h2>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleScanFolder} className="hover-lift" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '8px 16px', color: 'var(--text-primary)' }}>
            <FolderSearch size={16} /> {scanning ? 'Scanning...' : 'Add Folder'}
          </button>
          {currentTrack && !currentTrack.isLocal && (
            <button onClick={() => onMix(currentTrack)} className="glow-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={16} /> Mix Track
            </button>
          )}
        </div>
      </div>

      <div className="player-grid">
        
        {/* Main Player Area */}
        <div className="glass-panel player-main-panel">
          
          {currentTrack?.albumArt ? (
            <img 
              src={currentTrack.albumArt} 
              alt="Album Art"
              className="player-album-art"
              style={{
                objectFit: 'cover',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                marginBottom: '30px',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            />
          ) : (
            <div className="player-album-art" style={{ 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(79, 172, 254, 0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '30px',
              border: '2px solid rgba(0, 242, 254, 0.3)',
              animation: isPlaying ? 'spin 10s linear infinite' : 'none',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}>
              <Disc size={120} color="var(--accent-primary)" />
            </div>
          )}

          <h3 style={{ fontSize: '1.8rem', marginBottom: '8px', textAlign: 'center' }}>
            {currentTrack?.title || 'Unknown Title'}
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '1.1rem' }}>
            {currentTrack?.artist || (currentTrack?.isLocal ? 'Local File' : 'Library Track')}
          </p>

          <audio 
            ref={audioRef} 
            src={currentTrack?.url} 
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            onEnded={onEnded}
            onLoadedMetadata={handleTimeUpdate}
          />

          {/* Progress Bar */}
          <div style={{ width: '100%', marginBottom: '24px', maxWidth: '600px' }}>
            <input 
              type="range" 
              min={0} 
              max={duration || 100} 
              value={currentTime} 
              onChange={handleSeek}
              style={{ width: '100%', accentColor: 'var(--accent-primary)', height: '6px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', fontFamily: 'monospace' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '20px' }}>
            <button onClick={() => setShuffle(!shuffle)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: shuffle ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
              <Shuffle size={24} />
            </button>
            <button onClick={prevTrack} className="hover-lift" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <SkipBack size={36} />
            </button>
            <button 
              onClick={togglePlay} 
              className="glow-btn"
              style={{ width: '72px', height: '72px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isPlaying ? <Pause size={32} color="#000" /> : <Play size={32} color="#000" style={{ marginLeft: '6px' }} />}
            </button>
            <button onClick={nextTrack} className="hover-lift" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <SkipForward size={36} />
            </button>
            <button onClick={() => setRepeat(!repeat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: repeat ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
              <Repeat size={24} />
            </button>
          </div>

          {/* Volume Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '250px', marginTop: '10px' }}>
            <button onClick={() => setIsMuted(!isMuted)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input 
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setIsMuted(false);
                setVolume(parseFloat(e.target.value));
              }}
              style={{ flex: 1, accentColor: 'white', height: '4px' }}
            />
          </div>

        </div>

        {/* Sidebar: Playlist, EQ, Timer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Playlist */}
          <div className="glass-panel" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <ListMusic size={16} color="var(--accent-primary)" /> Up Next ({queue.length})
            </h4>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '8px' }}>
              {queue.map((track, idx) => (
                <div 
                  key={track.id} 
                  onClick={() => {
                    setCurrentIndex(idx);
                    if (!isPlaying) setIsPlaying(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: idx === currentIndex ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                    border: idx === currentIndex ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent'
                  }}
                >
                  {track.albumArt ? (
                    <img src={track.albumArt} style={{ width: '36px', height: '36px', borderRadius: '4px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Disc size={18} color="var(--text-muted)" />
                    </div>
                  )}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.9rem', color: idx === currentIndex ? 'var(--accent-primary)' : 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {track.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {track.artist || (track.isLocal ? 'Local' : 'Cloud')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sleep Timer */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Clock size={16} color="var(--accent-primary)" /> Sleep Timer
            </h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[15, 30, 60].map(mins => (
                <button 
                  key={mins}
                  onClick={() => setSleepTimer(sleepTimer === mins ? null : mins)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: sleepTimer === mins ? '1px solid var(--accent-primary)' : '1px solid var(--card-border)',
                    background: sleepTimer === mins ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
                    color: sleepTimer === mins ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {mins}m
                </button>
              ))}
              {sleepTimerRemaining !== null && (
                <div style={{ width: '100%', marginTop: '10px', color: 'var(--accent-secondary)', fontSize: '0.9rem', textAlign: 'center', fontFamily: 'monospace' }}>
                  Sleeping in {formatTime(sleepTimerRemaining)}
                </div>
              )}
            </div>
          </div>

          {/* Master EQ */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <Sliders size={16} color="var(--accent-secondary)" /> Playback EQ
            </h4>
            
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '180px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>BASS</span>
                <div style={{ width: '20px', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <input type="range" min={-12} max={12} step={1} value={eqLow} onChange={e => setEqLow(parseFloat(e.target.value))} style={{ transform: 'rotate(-90deg)', width: '100px', margin: 0 }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{eqLow > 0 ? `+${eqLow}` : eqLow}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MID</span>
                <div style={{ width: '20px', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <input type="range" min={-12} max={12} step={1} value={eqMid} onChange={e => setEqMid(parseFloat(e.target.value))} style={{ transform: 'rotate(-90deg)', width: '100px', margin: 0 }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{eqMid > 0 ? `+${eqMid}` : eqMid}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TREB</span>
                <div style={{ width: '20px', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <input type="range" min={-12} max={12} step={1} value={eqHigh} onChange={e => setEqHigh(parseFloat(e.target.value))} style={{ transform: 'rotate(-90deg)', width: '100px', margin: 0 }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{eqHigh > 0 ? `+${eqHigh}` : eqHigh}</span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
