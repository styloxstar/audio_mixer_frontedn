import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Mixer from './components/Mixer';
import Player from './components/Player';
import { Toaster } from 'react-hot-toast';
import type { TrackNodeState } from './utils/audioEngine';

type View = 'auth' | 'dashboard' | 'mixer' | 'player';

interface User {
  email: string;
}

interface Session {
  _id: string;
  name: string;
  masterVolume: number;
  tracks: any[];
}

export default function App() {
  const [view, setView] = useState<View>('auth');
  const [darkMode, setDarkMode] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Mixer specific session state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [tracksToLoad, setTracksToLoad] = useState<{ id: string; title: string; url: string }[]>([]);
  const [libraryTracks, setLibraryTracks] = useState<{ id: string; title: string; url: string }[]>([]);
  const [tracksListState, setTracksListState] = useState<TrackNodeState[]>([]);
  const [masterVolume, setMasterVolume] = useState(1.0);
  
  // Realtime play state indicator for navbar wave micro-animation
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Load auth state from localStorage on init
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setView('player');
    }
  }, []);

  // Sync dark/light mode classes
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.remove('light');
    } else {
      root.classList.add('light');
    }
  }, [darkMode]);

  // Handle playing state updates
  useEffect(() => {
    const checkPlaying = () => {
      // Small interval to check if audio engine is playing
      // We import audioEngine dynamically or read state
      import('./utils/audioEngine').then((engine) => {
        const context = engine.default.getContext();
        const playing = context && context.state === 'running' && (engine.default as any).isPlaying;
        setIsAudioPlaying(!!playing);
      });
    };
    const timer = setInterval(checkPlaying, 500);
    return () => clearInterval(timer);
  }, []);

  const handleAuthSuccess = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newToken ? newUser : null);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setView('player');
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setView('auth');
  };

  const handleContinueAsGuest = () => {
    setToken(null);
    setUser(null);
    setView('player');
  };

  const handleOpenSession = (
    session: Session | null,
    tracks: { id: string; title: string; url: string }[],
    libTracks: { id: string; title: string; url: string }[] = []
  ) => {
    setActiveSession(session);
    setTracksToLoad(tracks);
    setLibraryTracks(libTracks);
    
    if (session) {
      setMasterVolume(session.masterVolume);
      
      // If loading a saved session, populate track states
      if (session.tracks && session.tracks.length > 0) {
        const loadedStates: TrackNodeState[] = session.tracks.map((t: any) => ({
          id: t.trackId,
          title: t.title || 'Studio Track',
          url: tracks.find(p => p.id === t.trackId)?.url || '',
          volume: t.volume !== undefined ? t.volume : 0.8,
          pan: t.pan !== undefined ? t.pan : 0.0,
          mute: t.mute !== undefined ? t.mute : false,
          solo: t.solo !== undefined ? t.solo : false,
          eqLow: t.eqLow !== undefined ? t.eqLow : 0,
          eqMid: t.eqMid !== undefined ? t.eqMid : 0,
          eqHigh: t.eqHigh !== undefined ? t.eqHigh : 0,
          vocalExtraction: t.vocalExtraction !== undefined ? t.vocalExtraction : 'none',
          noiseGateThreshold: t.noiseGateThreshold !== undefined ? t.noiseGateThreshold : -100,
          pan8dEnabled: t.pan8dEnabled !== undefined ? t.pan8dEnabled : false,
          pan8dSpeed: t.pan8dSpeed !== undefined ? t.pan8dSpeed : 0.1,
          playbackRate: t.playbackRate !== undefined ? t.playbackRate : 1.0,
          lofiEnabled: t.lofiEnabled !== undefined ? t.lofiEnabled : false
        }));
        setTracksListState(loadedStates);
      } else {
        setTracksListState([]);
      }
    } else {
      setMasterVolume(1.0);
      setTracksListState([]);
    }
    
    setView('mixer');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--card-border)',
            borderRadius: '20px',
          },
          error: {
            style: {
              background: 'rgba(255, 0, 127, 0.15)',
              color: 'var(--accent-pink)',
              border: '1px solid rgba(255, 0, 127, 0.4)',
              backdropFilter: 'blur(10px)',
            },
            iconTheme: {
              primary: 'var(--accent-pink)',
              secondary: '#fff',
            },
          }
        }} 
      />
      
      {/* Universal navigation header */}
      <Navbar 
        darkMode={darkMode} 
        setDarkMode={setDarkMode} 
        user={user} 
        onLogout={handleLogout}
        isPlaying={isAudioPlaying}
      />

      <div style={{ flex: 1 }}>
        {view === 'auth' && (
          <Auth 
            onAuthSuccess={handleAuthSuccess} 
            onContinueAsGuest={handleContinueAsGuest} 
          />
        )}

        {view === 'dashboard' && (
          <Dashboard 
            token={token} 
            onOpenSession={handleOpenSession} 
            onOpenPlayer={(tracks) => {
              setLibraryTracks(tracks);
              setView('player');
            }}
          />
        )}

        {view === 'mixer' && activeSession && (
          <Mixer
            session={activeSession}
            tracksToLoad={tracksToLoad}
            libraryTracks={libraryTracks}
            token={token}
            onBack={() => setView('dashboard')}
            tracksListState={tracksListState}
            setTracksListState={setTracksListState}
            masterVolume={masterVolume}
            setMasterVolume={setMasterVolume}
          />
        )}

        {view === 'player' && (
          <Player
            libraryTracks={libraryTracks}
            onMix={(track) => {
              // Create a temporary session to mix this track
              const tempSession = {
                _id: 'temp-mix-' + Date.now(),
                name: 'Mixing: ' + track.title,
                masterVolume: 1.0,
                tracks: [{ trackId: track.id, title: track.title, volume: 1.0, pan: 0.0, mute: false, solo: false }]
              };
              handleOpenSession(tempSession, [track], libraryTracks);
            }}
            onBack={() => setView('dashboard')}
          />
        )}

      </div>

      {/* Footer Branding */}
      <footer style={{
        textAlign: 'center',
        padding: '30px',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--card-border)',
        marginTop: 'auto'
      }}>
        SonicWaveMix Audio Studio &copy; {new Date().getFullYear()} • Built for high fidelity spatial DSP
      </footer>

    </div>
  );
}
