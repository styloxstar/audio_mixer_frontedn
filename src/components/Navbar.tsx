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
      padding: '10px 16px',
      margin: '12px auto',
      maxWidth: '1200px',
      width: 'calc(100% - 24px)',
      position: 'sticky',
      top: '12px',
      zIndex: 100
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div className="glow-btn" style={{
          padding: '7px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Music size={18} className={isPlaying ? "spin-slow" : ""} />
        </div>
        <div style={{ minWidth: 0 }}>
          <span className="brand-title" style={{ fontSize: '1.1rem', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
            Sonic<span style={{ color: 'var(--accent-primary)' }}>Wave</span>
          </span>
          <div className="brand-subtitle" style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Multi-Track Studio & DSP
          </div>
        </div>

        {isPlaying && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px', marginLeft: '8px', flexShrink: 0 }}>
            <div style={{ width: '2px', height: '100%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.5s ease infinite alternate' }}></div>
            <div style={{ width: '2px', height: '60%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.4s ease infinite alternate 0.1s' }}></div>
            <div style={{ width: '2px', height: '80%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.6s ease infinite alternate 0.2s' }}></div>
            <div style={{ width: '2px', height: '40%', background: 'var(--accent-primary)', animation: 'pulseGlow 0.3s ease infinite alternate 0.3s' }}></div>
          </div>
        )}
      </div>

      {/* Right side actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Theme Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '7px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--card-border)'
          }}
          className="hover-lift"
          title="Toggle Light/Dark Theme"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* User / Guest */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                Account
              </span>
              {/* Email hidden on mobile via CSS */}
              <span className="navbar-user-email" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </span>
            </div>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: 'var(--card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              flexShrink: 0
            }}>
              <User size={14} />
            </div>
            <button
              onClick={onLogout}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-pink)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}
              className="hover-lift"
            >
              <LogOut size={14} />
              <span style={{ display: 'var(--logout-text-display, inline)' }}>Sign Out</span>
            </button>
          </div>
        ) : (
          <div style={{
            padding: '4px 10px',
            borderRadius: '12px',
            backgroundColor: 'var(--card-border)',
            fontSize: '0.65rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap'
          }}>
            Guest Mode
          </div>
        )}
      </div>
    </nav>
  );
}
