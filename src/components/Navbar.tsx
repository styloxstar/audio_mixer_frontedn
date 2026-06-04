import { Sun, Moon, LogOut, Music, User } from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  user: { email: string } | null;
  onLogout: () => void;
  isPlaying: boolean;
}

export default function Navbar({ darkMode, setDarkMode, user, onLogout, isPlaying }: NavbarProps) {
  return (
    <nav className="glass-panel" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 24px',
      margin: '16px auto',
      maxWidth: '1200px',
      width: 'calc(100% - 32px)',
      position: 'sticky',
      top: '16px',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="glow-btn" style={{
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Music size={20} className={isPlaying ? "spin-slow" : ""} />
        </div>
        <div>
          <span className="brand-title" style={{ fontSize: '1.25rem', letterSpacing: '0.5px' }}>
            Sonic<span style={{ color: 'var(--accent-primary)' }}>Wave</span>
          </span>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Multi-Track Studio & DSP
          </div>
        </div>

        {isPlaying && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px', marginLeft: '12px' }}>
            <div style={{ width: '2px', height: '100%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.5s ease infinite alternate' }}></div>
            <div style={{ width: '2px', height: '60%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.4s ease infinite alternate 0.1s' }}></div>
            <div style={{ width: '2px', height: '80%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.6s ease infinite alternate 0.2s' }}></div>
            <div style={{ width: '2px', height: '40%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.3s ease infinite alternate 0.3s' }}></div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Theme Toggle Button */}
        <button 
          onClick={() => setDarkMode(!darkMode)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--card-border)'
          }}
          className="hover-lift"
          title="Toggle Light/Dark Theme"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User Profile / Guest Section */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Account
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {user.email}
              </span>
            </div>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'var(--card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)'
            }}>
              <User size={16} />
            </div>
            <button 
              onClick={onLogout}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-pink)',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
              className="hover-lift"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              padding: '4px 10px',
              borderRadius: '12px',
              backgroundColor: 'var(--card-border)',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--text-secondary)'
            }}>
              Studio Guest Mode
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
