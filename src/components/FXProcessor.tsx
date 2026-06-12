import { ArrowLeft, Sliders, ToggleLeft, ToggleRight, MicOff, VolumeX, RotateCw } from 'lucide-react';
import audioEngine from '../utils/audioEngine';
import type { TrackNodeState } from '../utils/audioEngine';

interface FXProcessorProps {
  trackId: string;
  tracksListState: TrackNodeState[];
  setTracksListState: React.Dispatch<React.SetStateAction<TrackNodeState[]>>;
  selectedTrackIds?: string[];
  onBack?: () => void;
  inline?: boolean;
}

export default function FXProcessor({
  trackId,
  tracksListState,
  setTracksListState,
  selectedTrackIds = [],
  onBack,
  inline = false
}: FXProcessorProps) {
  const track = tracksListState.find(t => t.id === trackId);

  if (!track) {
    return (
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
        <p>Track not found.</p>
        <button onClick={onBack} className="glow-btn" style={{ marginTop: '16px' }}>Back</button>
      </div>
    );
  }

  const handleEQChange = (band: 'eqLow' | 'eqMid' | 'eqHigh', value: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        const nextState = { ...t, [band]: value };
        audioEngine.updateTrackEQ(trackId, nextState.eqLow, nextState.eqMid, nextState.eqHigh);
        return nextState;
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleVocalModeChange = (mode: 'none' | 'vocal_remover' | 'vocal_isolate') => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackVocalMode(trackId, mode);
        return { ...t, vocalExtraction: mode };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleNoiseGateChange = (val: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackNoiseGate(trackId, val);
        return { ...t, noiseGateThreshold: val };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handle8DToggle = () => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        const nextEnabled = !t.pan8dEnabled;
        audioEngine.updateTrack8D(trackId, nextEnabled, t.pan8dSpeed);
        return { ...t, pan8dEnabled: nextEnabled };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handle8DSpeedChange = (speed: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrack8D(trackId, t.pan8dEnabled, speed);
        return { ...t, pan8dSpeed: speed };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackPlaybackRate(trackId, rate);
        return { ...t, playbackRate: rate };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handlePitchChange = (pitch: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackPitch(trackId, pitch, t.preservePitch);
        return { ...t, pitchShift: pitch };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handlePreservePitchToggle = (val: boolean) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackPitch(trackId, t.pitchShift, val);
        return { ...t, preservePitch: val };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handlePresetApply = (speed: number, pitch: number) => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        audioEngine.updateTrackPlaybackRate(trackId, speed);
        audioEngine.updateTrackPitch(trackId, pitch, false);
        return { ...t, playbackRate: speed, pitchShift: pitch, preservePitch: false };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleLofiToggle = () => {
    const updated = tracksListState.map(t => {
      if (t.id === trackId) {
        const nextEnabled = !t.lofiEnabled;
        audioEngine.updateTrackLofi(trackId, nextEnabled);
        return { ...t, lofiEnabled: nextEnabled };
      }
      return t;
    });
    setTracksListState(updated);
  };

  const handleApplyToAll = () => {
    if (!track) return;
    const hasSelection = selectedTrackIds.length > 0;
    
    const updated = tracksListState.map(t => {
      if (t.id === trackId) return t;
      if (hasSelection && !selectedTrackIds.includes(t.id)) return t;
      
      // Apply engine updates
      audioEngine.updateTrackEQ(t.id, track.eqLow, track.eqMid, track.eqHigh);
      audioEngine.updateTrackVocalMode(t.id, track.vocalExtraction);
      audioEngine.updateTrackNoiseGate(t.id, track.noiseGateThreshold);
      audioEngine.updateTrack8D(t.id, track.pan8dEnabled, track.pan8dSpeed);
      audioEngine.updateTrackPlaybackRate(t.id, track.playbackRate);
      audioEngine.updateTrackPitch(t.id, track.pitchShift, track.preservePitch);
      audioEngine.updateTrackLofi(t.id, track.lofiEnabled);

      return {
        ...t,
        eqLow: track.eqLow,
        eqMid: track.eqMid,
        eqHigh: track.eqHigh,
        vocalExtraction: track.vocalExtraction,
        noiseGateThreshold: track.noiseGateThreshold,
        pan8dEnabled: track.pan8dEnabled,
        pan8dSpeed: track.pan8dSpeed,
        playbackRate: track.playbackRate,
        pitchShift: track.pitchShift,
        preservePitch: track.preservePitch,
        lofiEnabled: track.lofiEnabled
      };
    });
    setTracksListState(updated);
    alert(hasSelection ? 'Applied these FX settings to SELECTED tracks!' : 'Applied these FX settings to ALL tracks!');
  };

  return (
    <div style={inline ? { width: '100%' } : { maxWidth: '1000px', margin: '0 auto 40px auto', padding: '0 24px' }}>
      
      {/* Header */}
      {!inline && onBack ? (
        <div className="glass-panel" style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
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
            Back to Mixer
          </button>

          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={handleApplyToAll}
              className="hover-lift"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--accent-primary)',
                background: 'rgba(0, 242, 254, 0.1)',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              {selectedTrackIds.length > 0 ? 'Bulk Apply FX to SELECTED' : 'Bulk Apply FX to ALL'}
            </button>
            <div>
              <h2 style={{ fontSize: '1.2rem' }}>{track.title}</h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                DSP EFFECTS CONTROL BOARD
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button 
            onClick={handleApplyToAll}
            className="hover-lift"
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--accent-primary)',
              background: 'rgba(0, 242, 254, 0.1)',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600
            }}
          >
            {selectedTrackIds.length > 0 ? 'Bulk Apply FX to SELECTED' : 'Bulk Apply FX to ALL'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Module 1: 3-Band Parametric Equalizer */}
        <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '24px' }}>
            <Sliders size={18} style={{ color: 'var(--accent-primary)' }} />
            Parametric Equalizer (EQ)
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1, padding: '10px 0' }}>
            
            {/* Bass Dial (Low) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>BASS</span>
              <div style={{ height: '140px', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={track.eqLow}
                  onChange={(e) => handleEQChange('eqLow', parseFloat(e.target.value))}
                  style={{
                    transform: 'rotate(-90deg)',
                    width: '120px',
                    height: '6px'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {track.eqLow > 0 ? `+${track.eqLow}` : track.eqLow} dB
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>&lt; 250 Hz</span>
            </div>

            {/* Midrange Dial */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>MID</span>
              <div style={{ height: '140px', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={track.eqMid}
                  onChange={(e) => handleEQChange('eqMid', parseFloat(e.target.value))}
                  style={{
                    transform: 'rotate(-90deg)',
                    width: '120px',
                    height: '6px'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {track.eqMid > 0 ? `+${track.eqMid}` : track.eqMid} dB
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>1.5 kHz</span>
            </div>

            {/* Treble Dial (High) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>TREBLE</span>
              <div style={{ height: '140px', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={track.eqHigh}
                  onChange={(e) => handleEQChange('eqHigh', parseFloat(e.target.value))}
                  style={{
                    transform: 'rotate(-90deg)',
                    width: '120px',
                    height: '6px'
                  }}
                />
              </div>
              <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {track.eqHigh > 0 ? `+${track.eqHigh}` : track.eqHigh} dB
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>&gt; 4.0 kHz</span>
            </div>

          </div>
        </div>

        {/* Module 2: Vocal Extractor & 8D & Noise Gate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Vocal / Instrument Separator */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '16px' }}>
              <MicOff size={18} style={{ color: 'var(--accent-pink)' }} />
              Vocal / Stereo Manipulator
            </h3>
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Isolate or remove centered vocals using phase-inverted stereo cancellation.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <button
                onClick={() => handleVocalModeChange('none')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                  backgroundColor: track.vocalExtraction === 'none' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: track.vocalExtraction === 'none' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Stereo Bypass
              </button>

              <button
                onClick={() => handleVocalModeChange('vocal_remover')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                  backgroundColor: track.vocalExtraction === 'vocal_remover' ? 'var(--accent-pink)' : 'var(--bg-secondary)',
                  color: track.vocalExtraction === 'vocal_remover' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Remove Vocals
              </button>

              <button
                onClick={() => handleVocalModeChange('vocal_isolate')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--card-border)',
                  backgroundColor: track.vocalExtraction === 'vocal_isolate' ? 'var(--accent-secondary)' : 'var(--bg-secondary)',
                  color: track.vocalExtraction === 'vocal_isolate' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Isolate Vocals
              </button>
            </div>
          </div>

          {/* Background Noise Gate */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '12px' }}>
              <VolumeX size={18} style={{ color: 'var(--accent-green)' }} />
              Adaptive Noise Gate
            </h3>
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Attenuates low-level ambient hum, air hiss, or background room noise.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Gate Threshold Sensitivity</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-green)', fontWeight: 700 }}>
                  {track.noiseGateThreshold <= -95 ? 'OFF' : `${track.noiseGateThreshold} dB`}
                </span>
              </div>
              
              <input
                type="range"
                min={-95}
                max={-30}
                step={1}
                value={track.noiseGateThreshold}
                onChange={(e) => handleNoiseGateChange(parseInt(e.target.value))}
              />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                <span>Closed (Sensitive -95dB)</span>
                <span>Open (Aggressive -30dB)</span>
              </div>
            </div>
          </div>

          {/* 2D to 8D Audio Binaural Spatializer */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <RotateCw size={18} style={{ color: 'var(--accent-primary)' }} />
                8D Binaural Auto-Pan Orbit
              </h3>
              
              <button 
                onClick={handle8DToggle}
                style={{
                  background: 'none',
                  border: 'none',
                  color: track.pan8dEnabled ? 'var(--accent-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                {track.pan8dEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Modulates stereo positioning automatically over time using an LFO to create a 360° rotation effect.
            </p>

            {track.pan8dEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Rotation Orbit Speed</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--accent-primary)', fontWeight: 700 }}>
                    {track.pan8dSpeed} Hz ({Math.round(1 / track.pan8dSpeed)}s per loop)
                  </span>
                </div>
                
                <input
                  type="range"
                  min={0.05}
                  max={1.5}
                  step={0.05}
                  value={track.pan8dSpeed}
                  onChange={(e) => handle8DSpeedChange(parseFloat(e.target.value))}
                />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  <span>Slow Orbit (0.05Hz)</span>
                  <span>Hyper Spin (1.5Hz)</span>
                </div>
              </div>
            )}
          </div>

          {/* Voice Modulations (Presets) */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '12px' }}>
              <RotateCw size={18} style={{ color: 'var(--accent-primary)' }} />
              Voice Modulations (Presets)
            </h3>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
              {[
                { label: 'Normal', speed: 1.0, pitch: 1.0 },
                { label: 'Deep', speed: 1.0, pitch: 0.7 },
                { label: 'Husky', speed: 1.0, pitch: 0.85 },
                { label: 'Slow Deep', speed: 0.6, pitch: 0.6 },
                { label: 'Slowmo-High', speed: 0.6, pitch: 1.6 },
                { label: 'Chipmunk', speed: 1.5, pitch: 2.0 },
              ].map(preset => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetApply(preset.speed, preset.pitch)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid var(--accent-primary)',
                    backgroundColor: 'rgba(0, 242, 254, 0.15)',
                    color: 'white',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Playback Speed Control */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '12px' }}>
              <RotateCw size={18} style={{ color: 'var(--accent-secondary)' }} />
              Playback Speed
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Speed multiplier</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-secondary)', fontWeight: 700 }}>
                  {track.playbackRate}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={track.playbackRate || 1.0}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Smooth Slow-Mo (Disable Pitch Lock)</span>
              <button 
                onClick={() => handlePreservePitchToggle(!track.preservePitch)}
                style={{ background: 'none', border: 'none', color: !track.preservePitch ? 'var(--accent-primary)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                {!track.preservePitch ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
              </button>
            </div>
          </div>

          {/* Voice Pitch Modulation */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', marginBottom: '12px' }}>
              <RotateCw size={18} style={{ color: 'var(--accent-pink)' }} />
              Voice Pitch Modulation
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Pitch Shift</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-pink)', fontWeight: 700 }}>
                  {track.pitchShift}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={track.pitchShift || 1.0}
                onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                <span>Deep (0.5x)</span>
                <span>High (2.0x)</span>
              </div>
            </div>
          </div>

          {/* Lofi Warm Lowpass Filter */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <Sliders size={18} style={{ color: 'var(--accent-pink)' }} />
                Lofi Analog Aesthetics
              </h3>
              
              <button 
                onClick={handleLofiToggle}
                style={{
                  background: 'none',
                  border: 'none',
                  color: track.lofiEnabled ? 'var(--accent-pink)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex'
                }}
              >
                {track.lofiEnabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0px' }}>
              Applies a warm lowpass filter (1.5kHz cutoff) to simulate a dusty, retro vinyl-like and cozy lofi tone.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
