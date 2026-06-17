// Web Audio API Engine for Mixer and DSP Tools

export interface TrackNodeState {
  id: string;
  title: string;
  url: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  eqLow: number;  // -12 to +12 dB
  eqMid: number;  // -12 to +12 dB
  eqHigh: number; // -12 to +12 dB
  vocalExtraction: 'none' | 'vocal_remover' | 'vocal_isolate';
  noiseGateThreshold: number; // -100 to 0 dB (-100 = disabled)
  pan8dEnabled: boolean;
  pan8dSpeed: number; // Hz (0.05 to 2.0)
  playbackRate: number; // 0.5 to 2.0 (1.0 default)
  pitchShift: number; // 0.5 to 2.0 (1.0 default)
  preservePitch: boolean;
  lofiEnabled: boolean;
  fxBlend: number; // 0.0 to 1.0 (1.0 = 100% FX, 0.0 = 100% Original)
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private tracksMap: Map<string, {
    audioElement: HTMLAudioElement;
    sourceNode: MediaElementAudioSourceNode;
    splitterNode: ChannelSplitterNode;
    mergerNode: ChannelMergerNode;
    vocalRemoverGainL: GainNode;
    vocalRemoverGainR: GainNode;
    eqLowNode: BiquadFilterNode;
    eqMidNode: BiquadFilterNode;
    eqHighNode: BiquadFilterNode;
    lofiNode: BiquadFilterNode;
    noiseGateNode: GainNode;
    pannerNode: StereoPannerNode;
    lfoNode: OscillatorNode | null;
    lfoGainNode: GainNode | null;
    dryGainNode: GainNode;
    wetGainNode: GainNode;
    gainNode: GainNode;
    analyserNode: AnalyserNode;
  }> = new Map();

  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  public analyserDataArray: Uint8Array = new Uint8Array(0);
  public isPlaying: boolean = false;
  
  // Limiter / Smooth Blending
  public limiterEnabled: boolean = true;
  private limiterNode: DynamicsCompressorNode | null = null;

  // Callbacks
  public onTimeUpdateCallback: (() => void) | null = null;

  // Atmosphere handling
  private atmospheresMap: Map<string, {
    audioElement: HTMLAudioElement;
    gainNode: GainNode;
  }> = new Map();

  init() {
    if (this.ctx) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Setup Master Volume Gain Node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;

    // Create Limiter (Compressor)
    this.limiterNode = this.ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -3.0; // Starts limiting near peak
    this.limiterNode.knee.value = 12.0; // Soft knee
    this.limiterNode.ratio.value = 20.0; // Hard ratio to prevent clipping
    this.limiterNode.attack.value = 0.005; // Fast attack
    this.limiterNode.release.value = 0.1; // Smooth release
    
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    const bufferLength = this.masterAnalyser.frequencyBinCount;
    this.analyserDataArray = new Uint8Array(bufferLength);

    // Routing: Master Gain -> Limiter -> Analyser -> Destination
    this.masterGain.connect(this.limiterNode);
    this.limiterNode.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Set up global time tracking
    setInterval(() => {
      if (this.isPlaying && this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback();
      }
    }, 150);
  }

  getContext() {
    return this.ctx;
  }

  async addTrack(track: TrackNodeState) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    // Remove existing if duplicate
    if (this.tracksMap.has(track.id)) {
      this.removeTrack(track.id);
    }

    // Create Audio HTML element for streaming
    const audio = new Audio();
    audio.src = track.url;
    audio.crossOrigin = 'anonymous';
    audio.loop = false;
    audio.preload = 'auto';
    audio.preservesPitch = track.preservePitch;
    (audio as any).webkitPreservesPitch = track.preservePitch;
    (audio as any).mozPreservesPitch = track.preservePitch;

    // Wait for basic metadata to load
    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => resolve();
      // Handle loading fallback or timeouts gracefully
      setTimeout(() => resolve(), 2000);
    });

    // Create Source Node
    const sourceNode = this.ctx.createMediaElementSource(audio);

    // 1. Vocal Separation Node System (Left / Right split)
    const splitterNode = this.ctx.createChannelSplitter(2);
    const mergerNode = this.ctx.createChannelMerger(2);
    const vocalRemoverGainL = this.ctx.createGain();
    const vocalRemoverGainR = this.ctx.createGain();

    // 2. EQ Filters (Low, Mid, High)
    const eqLowNode = this.ctx.createBiquadFilter();
    eqLowNode.type = 'lowshelf';
    eqLowNode.frequency.value = 250; // Bass below 250Hz

    const eqMidNode = this.ctx.createBiquadFilter();
    eqMidNode.type = 'peaking';
    eqMidNode.Q.value = 1.0;
    eqMidNode.frequency.value = 1500; // Mids around 1.5kHz

    const eqHighNode = this.ctx.createBiquadFilter();
    eqHighNode.type = 'highshelf';
    eqHighNode.frequency.value = 4000; // Treble above 4kHz

    // 3. Lofi Filter
    const lofiNode = this.ctx.createBiquadFilter();
    lofiNode.type = 'lowpass';
    lofiNode.frequency.value = track.lofiEnabled ? 1500 : 22000;

    // 4. Noise Gate (Simulated with simple dynamics gate logic)
    const noiseGateNode = this.ctx.createGain();

    // 5. Stereo Panner (2D/8D support)
    const pannerNode = this.ctx.createStereoPanner();

    // 6. Dry/Wet Blending Nodes
    const dryGainNode = this.ctx.createGain();
    const wetGainNode = this.ctx.createGain();

    // 7. Final Track Volume Gain Node
    const gainNode = this.ctx.createGain();

    // 8. Channel Analyser
    const analyserNode = this.ctx.createAnalyser();
    analyserNode.fftSize = 64;

    // Connect Node Graph:
    // Source -> Splitter
    sourceNode.connect(splitterNode);

    // Left channel connections
    splitterNode.connect(vocalRemoverGainL, 0);
    vocalRemoverGainL.connect(mergerNode, 0, 0); // Out left

    // Right channel connections
    splitterNode.connect(vocalRemoverGainR, 1);
    vocalRemoverGainR.connect(mergerNode, 0, 1); // Out right

    // Merger -> EQ Low -> EQ Mid -> EQ High -> Lofi -> Noise Gate -> Panner -> Wet Gain
    mergerNode.connect(eqLowNode);
    eqLowNode.connect(eqMidNode);
    eqMidNode.connect(eqHighNode);
    eqHighNode.connect(lofiNode);
    lofiNode.connect(noiseGateNode);
    noiseGateNode.connect(pannerNode);
    pannerNode.connect(wetGainNode);
    
    // Source -> Dry Gain (Bypass FX)
    sourceNode.connect(dryGainNode);

    // Dry & Wet -> Track Gain
    dryGainNode.connect(gainNode);
    wetGainNode.connect(gainNode);

    // Track Gain -> Analyser -> Master
    gainNode.connect(analyserNode);
    analyserNode.connect(this.masterGain);

    this.tracksMap.set(track.id, {
      audioElement: audio,
      sourceNode,
      splitterNode,
      mergerNode,
      vocalRemoverGainL,
      vocalRemoverGainR,
      eqLowNode,
      eqMidNode,
      eqHighNode,
      lofiNode,
      noiseGateNode,
      pannerNode,
      lfoNode: null,
      lfoGainNode: null,
      dryGainNode,
      wetGainNode,
      gainNode,
      analyserNode
    });

    // Apply default settings
    this.updateTrackVolume(track.id, track.volume, track.mute);
    this.updateTrackPan(track.id, track.pan);
    this.updateTrackEQ(track.id, track.eqLow, track.eqMid, track.eqHigh);
    this.updateTrackVocalMode(track.id, track.vocalExtraction);
    this.updateTrack8D(track.id, track.pan8dEnabled, track.pan8dSpeed);
    this.updateTrackNoiseGate(track.id, track.noiseGateThreshold);
    this.updateTrackPlaybackRate(track.id, track.playbackRate);
    this.updateTrackPitch(track.id, track.pitchShift, track.preservePitch);
    this.updateTrackLofi(track.id, track.lofiEnabled);
    this.updateTrackFxBlend(track.id, track.fxBlend);

    // If mix is currently playing, start the new track immediately in sync
    if (this.isPlaying) {
      audio.currentTime = this.getCurrentTime();
      audio.play().catch(err => console.warn('Audio play failed:', err));
    }
  }

  removeTrack(id: string) {
    const track = this.tracksMap.get(id);
    if (track) {
      track.audioElement.pause();
      track.audioElement.src = '';
      if (track.lfoNode) {
        try { track.lfoNode.stop(); } catch (e) {}
      }
      this.tracksMap.delete(id);
    }
  }

  clear() {
    this.stopAll();
    for (const [id] of this.tracksMap) {
      this.removeTrack(id);
    }
    for (const [id] of this.atmospheresMap) {
      this.stopAtmosphere(id);
    }
  }

  // --- ATMOSPHERE CONTROLS ---

  playAtmosphere(id: string, url: string, volume: number = 0.5) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    if (this.atmospheresMap.has(id)) {
      this.stopAtmosphere(id);
    }

    const audio = new Audio();
    audio.src = url;
    audio.crossOrigin = 'anonymous';
    audio.loop = true; // Atmosphere always loops
    audio.volume = 1.0; // Handled by GainNode instead

    const sourceNode = this.ctx.createMediaElementSource(audio);
    const gainNode = this.ctx.createGain();
    
    // Fade in
    gainNode.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.5);

    sourceNode.connect(gainNode);
    gainNode.connect(this.masterGain);

    this.atmospheresMap.set(id, { audioElement: audio, gainNode });

    // Sync state with main transport if currently playing
    if (this.isPlaying) {
      audio.play().catch(e => console.warn('Atmosphere play failed:', e));
    }
  }

  pauseAtmosphere(id: string) {
    const atmo = this.atmospheresMap.get(id);
    if (atmo) {
      atmo.audioElement.pause();
    }
  }

  stopAtmosphere(id: string) {
    const atmo = this.atmospheresMap.get(id);
    if (atmo && this.ctx) {
      // Fade out to avoid click
      atmo.gainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.5);
      
      // Remove after fade
      setTimeout(() => {
        if (this.atmospheresMap.has(id)) {
          atmo.audioElement.pause();
          atmo.audioElement.src = '';
          this.atmospheresMap.delete(id);
        }
      }, 2000);
    }
  }

  updateAtmosphereVolume(id: string, volume: number) {
    const atmo = this.atmospheresMap.get(id);
    if (atmo && this.ctx) {
      atmo.gainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }

  // --- CONTROLS ---

  updateTrackVolume(id: string, volume: number, mute: boolean) {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      const targetVolume = mute ? 0.001 : Math.max(0.001, volume); // Keep strictly above 0 to prevent issues
      // Exponential approach over ~100ms prevents zipper noise and abrupt choppiness
      track.gainNode.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 0.05);
    }
  }

  updateTrackPan(id: string, pan: number) {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      // Panning works only if 8D is disabled
      if (!track.lfoNode) {
        track.pannerNode.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.05);
      }
    }
  }

  updateTrackEQ(id: string, low: number, mid: number, high: number) {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      track.eqLowNode.gain.setTargetAtTime(low, this.ctx.currentTime, 0.05);
      track.eqMidNode.gain.setTargetAtTime(mid, this.ctx.currentTime, 0.05);
      track.eqHighNode.gain.setTargetAtTime(high, this.ctx.currentTime, 0.05);
    }
  }

  updateTrackPlaybackRate(id: string, rate: number) {
    const track = this.tracksMap.get(id);
    if (track) {
      track.audioElement.playbackRate = rate;
    }
  }

  updateTrackPitch(id: string, pitch: number, preservePitch: boolean) {
    const track = this.tracksMap.get(id);
    if (track) {
      track.audioElement.preservesPitch = preservePitch;
      (track.audioElement as any).webkitPreservesPitch = preservePitch;
      (track.audioElement as any).mozPreservesPitch = preservePitch;
      
      // If preservePitch is false, we can simulate pitch shift via playbackRate
      // If it is true, Web Audio doesn't have a native pitch shift that preserves length easily
      // but we will apply the pitch shift to playbackRate anyway as a fallback for the web version
      // just so the effect is audible.
      if (pitch !== 1.0) {
        track.audioElement.playbackRate = pitch * track.audioElement.defaultPlaybackRate;
      }
    }
  }

  updateTrackFxBlend(id: string, fxBlend: number) {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      // fxBlend 1.0 = 100% Wet, 0.0 = 100% Dry
      const wetLevel = Math.max(0.001, fxBlend);
      const dryLevel = Math.max(0.001, 1.0 - fxBlend);
      track.wetGainNode.gain.setTargetAtTime(wetLevel, this.ctx.currentTime, 0.05);
      track.dryGainNode.gain.setTargetAtTime(dryLevel, this.ctx.currentTime, 0.05);
    }
  }

  updateTrackLofi(id: string, enabled: boolean) {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      track.lofiNode.frequency.setValueAtTime(enabled ? 1500 : 22000, this.ctx.currentTime);
    }
  }

  updateTrackVocalMode(id: string, mode: 'none' | 'vocal_remover' | 'vocal_isolate') {
    const track = this.tracksMap.get(id);
    if (track && this.ctx) {
      const { vocalRemoverGainL, vocalRemoverGainR, splitterNode, mergerNode } = track;

      // Disconnect channel split settings first
      try {
        splitterNode.disconnect();
        vocalRemoverGainL.disconnect();
        vocalRemoverGainR.disconnect();
      } catch (e) {}

      // Reconnect based on mode
      splitterNode.connect(vocalRemoverGainL, 0);
      splitterNode.connect(vocalRemoverGainR, 1);

      if (mode === 'vocal_remover') {
        // Phase subtraction: Left - Right
        // Route Left to Left output directly, Route Right (inverted) to Left output to sum
        vocalRemoverGainL.gain.setValueAtTime(1.0, this.ctx.currentTime);
        vocalRemoverGainR.gain.setValueAtTime(-1.0, this.ctx.currentTime); // Invert phase
        
        vocalRemoverGainL.connect(mergerNode, 0, 0); // Left channel output
        vocalRemoverGainR.connect(mergerNode, 0, 0); // Send inverted right to Left channel (canceling center)
        
        // Output also to right to keep it centered mono
        vocalRemoverGainL.connect(mergerNode, 0, 1);
        vocalRemoverGainR.connect(mergerNode, 0, 1);
      } else if (mode === 'vocal_isolate') {
        // Isolate center: Left + Right (vocals)
        vocalRemoverGainL.gain.setValueAtTime(1.0, this.ctx.currentTime);
        vocalRemoverGainR.gain.setValueAtTime(1.0, this.ctx.currentTime);
        
        vocalRemoverGainL.connect(mergerNode, 0, 0);
        vocalRemoverGainR.connect(mergerNode, 0, 0);
        vocalRemoverGainL.connect(mergerNode, 0, 1);
        vocalRemoverGainR.connect(mergerNode, 0, 1);
      } else {
        // Normal stereo
        vocalRemoverGainL.gain.setValueAtTime(1.0, this.ctx.currentTime);
        vocalRemoverGainR.gain.setValueAtTime(1.0, this.ctx.currentTime);
        
        vocalRemoverGainL.connect(mergerNode, 0, 0); // Left to Left
        vocalRemoverGainR.connect(mergerNode, 0, 1); // Right to Right
      }
    }
  }

  updateTrackNoiseGate(id: string, thresholdDb: number) {
    const track = this.tracksMap.get(id);
    if (!track || !this.ctx) return;

    // A real noise gate requires a script processor or AudioWorklet to measure volume and cut signal.
    // We can simulate an active noise gate cleanly using a volume envelope logic, or biquad filtering:
    // Here we'll configure a noise gate simulation: if threshold is high (e.g. -40dB), we cut silent frequency rumble:
    if (thresholdDb <= -95) {
      // Disabled: full pass
      track.noiseGateNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
    } else {
      // Setup simple analyzer feedback to adjust gain
      const interval = setInterval(() => {
        if (!this.isPlaying || !this.tracksMap.has(id)) {
          clearInterval(interval);
          return;
        }
        
        // Simple client-side spectral gate check
        const array = new Uint8Array(track.analyserNode.frequencyBinCount);
        track.analyserNode.getByteFrequencyData(array);
        let average = 0;
        for (let i = 0; i < array.length; i++) {
          average += array[i];
        }
        average = average / array.length; // 0 to 255

        // Convert average 0-255 amplitude to dB approximate
        const dbLevel = average > 0 ? 20 * Math.log10(average / 255) : -100;

        if (dbLevel < thresholdDb) {
          // Gate Closed (Quiet/Noise): Reduce volume by 85% to mute background noise
          track.noiseGateNode.gain.setTargetAtTime(0.08, this.ctx!.currentTime, 0.05);
        } else {
          // Gate Open (Active Audio): Normal volume
          track.noiseGateNode.gain.setTargetAtTime(1.0, this.ctx!.currentTime, 0.03);
        }
      }, 50);
    }
  }

  updateTrack8D(id: string, enabled: boolean, speedHz: number) {
    const track = this.tracksMap.get(id);
    if (!track || !this.ctx) return;

    // Clean up existing LFO
    if (track.lfoNode) {
      try {
        track.lfoNode.stop();
        track.lfoNode.disconnect();
        track.lfoGainNode?.disconnect();
      } catch (e) {}
      track.lfoNode = null;
      track.lfoGainNode = null;
    }

    if (enabled) {
      // Create Low-Frequency Oscillator (LFO)
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(speedHz, this.ctx.currentTime);

      // Scale LFO to output -1.0 to 1.0
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      lfo.connect(lfoGain);
      
      // Connect LFO directly to the Pan AudioParam of StereoPannerNode!
      lfoGain.connect(track.pannerNode.pan);

      lfo.start();

      track.lfoNode = lfo;
      track.lfoGainNode = lfoGain;
    } else {
      // Revert pan back to 0 (center)
      track.pannerNode.pan.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  updateMasterVolume(volume: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  toggleLimiter(enabled: boolean) {
    this.limiterEnabled = enabled;
    if (!this.ctx || !this.masterGain || !this.limiterNode || !this.masterAnalyser) return;
    
    this.masterGain.disconnect();
    this.limiterNode.disconnect();
    
    if (enabled) {
      // Re-engage Limiter
      this.masterGain.connect(this.limiterNode);
      this.limiterNode.connect(this.masterAnalyser);
    } else {
      // Bypass Limiter
      this.masterGain.connect(this.masterAnalyser);
    }
  }

  // --- PLAYBACK SYNC ---

  playAll() {
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Synchronize play times
    let maxTime = 0;
    for (const [_, track] of this.tracksMap) {
      if (track.audioElement.currentTime > maxTime) {
        maxTime = track.audioElement.currentTime;
      }
    }

    // Force sync and play
    for (const [_, track] of this.tracksMap) {
      // Align currents
      if (Math.abs(track.audioElement.currentTime - maxTime) > 0.05) {
        track.audioElement.currentTime = maxTime;
      }
      track.audioElement.play().catch(err => console.warn('Audio play failed:', err));
    }
    for (const [_, atmo] of this.atmospheresMap) {
      atmo.audioElement.play().catch(e => console.warn(e));
    }
    this.isPlaying = true;
  }

  pauseAll() {
    for (const [_, track] of this.tracksMap) {
      track.audioElement.pause();
    }
    for (const [_, atmo] of this.atmospheresMap) {
      atmo.audioElement.pause();
    }
    this.isPlaying = false;
  }

  stopAll() {
    this.pauseAll();
    this.seekAll(0);
    if (this.onTimeUpdateCallback) this.onTimeUpdateCallback();
  }

  seekAll(seconds: number) {
    for (const [_, track] of this.tracksMap) {
      track.audioElement.currentTime = seconds;
    }
    if (this.onTimeUpdateCallback) this.onTimeUpdateCallback();
  }

  getCurrentTime(): number {
    if (this.tracksMap.size === 0) return 0;
    // Return longest elapsed track time
    let time = 0;
    for (const [_, track] of this.tracksMap) {
      if (track.audioElement.currentTime > time) {
        time = track.audioElement.currentTime;
      }
    }
    return time;
  }

  getDuration(): number {
    if (this.tracksMap.size === 0) return 0;
    let duration = 0;
    for (const [_, track] of this.tracksMap) {
      if (track.audioElement.duration && track.audioElement.duration > duration) {
        duration = track.audioElement.duration;
      }
    }
    return duration;
  }

  setOnTimeUpdate(callback: () => void) {
    this.onTimeUpdateCallback = callback;
  }

  getChannelFrequencyData(id: string): Uint8Array {
    const track = this.tracksMap.get(id);
    if (!track) return new Uint8Array(0);

    const array = new Uint8Array(track.analyserNode.frequencyBinCount);
    track.analyserNode.getByteFrequencyData(array);
    return array;
  }

  getMasterFrequencyData(): Uint8Array {
    if (!this.masterAnalyser) return new Uint8Array(0);
    const array = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(array);
    return array;
  }

  // --- OFFLINE 8D / FX EXPORTER (pure client-side WAV file creation) ---

  async exportStemsAsZip(tracksList: TrackNodeState[], format: 'wav' | 'mp3' = 'wav'): Promise<Blob> {
    if (tracksList.length === 0) {
      throw new Error("No tracks to export");
    }

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    console.log("Fetching track buffers for offline stem rendering...");
    const audioBuffers: { track: TrackNodeState; buffer: AudioBuffer }[] = [];
    const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    for (const track of tracksList) {
      try {
        const response = await fetch(track.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        audioBuffers.push({ track, buffer: audioBuffer });
      } catch (e) {
        console.error(`Failed to load track ${track.title} for export:`, e);
      }
    }
    tempCtx.close();

    if (audioBuffers.length === 0) {
      throw new Error("No audio files could be loaded for offline export");
    }

    const sampleRate = 44100;

    // Render each stem independently
    for (const item of audioBuffers) {
      const { track, buffer } = item;
      
      let effectiveRate = track.playbackRate || 1.0;
      if (!track.preservePitch && track.pitchShift && track.pitchShift !== 1.0) {
        effectiveRate = track.pitchShift;
      }
      
      const duration = buffer.duration / effectiveRate;
      const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
      
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(effectiveRate, 0);

      const splitter = offlineCtx.createChannelSplitter(2);
      const merger = offlineCtx.createChannelMerger(2);
      const gainL = offlineCtx.createGain();
      const gainR = offlineCtx.createGain();

      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 250;
      eqLow.gain.value = track.eqLow;

      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1500;
      eqMid.gain.value = track.eqMid;

      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 4000;
      eqHigh.gain.value = track.eqHigh;

      const lofi = offlineCtx.createBiquadFilter();
      lofi.type = 'lowpass';
      lofi.frequency.value = track.lofiEnabled ? 1500 : 22000;

      const panner = offlineCtx.createStereoPanner();
      const trackGain = offlineCtx.createGain();
      const vol = track.mute ? 0 : track.volume;
      trackGain.gain.setValueAtTime(vol, 0);

      source.connect(splitter);
      splitter.connect(gainL, 0);
      splitter.connect(gainR, 1);

      if (track.vocalExtraction === 'vocal_remover') {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(-1.0, 0);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 0);
        gainL.connect(merger, 0, 1);
        gainR.connect(merger, 0, 1);
      } else if (track.vocalExtraction === 'vocal_isolate') {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(1.0, 0);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 0);
        gainL.connect(merger, 0, 1);
        gainR.connect(merger, 0, 1);
      } else {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(1.0, 0);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 1);
      }

      merger.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(lofi);
      lofi.connect(panner);
      panner.connect(trackGain);
      trackGain.connect(offlineCtx.destination);

      if (track.pan8dEnabled) {
        const panParam = panner.pan;
        panParam.setValueAtTime(0, 0);
        const speedHz = track.pan8dSpeed;
        const step = 0.05;
        for (let time = 0; time < duration; time += step) {
          const panVal = Math.sin(2 * Math.PI * speedHz * time);
          panParam.setValueAtTime(panVal, time);
        }
      } else {
        panner.pan.setValueAtTime(track.pan, 0);
      }

      source.start(0);
      
      console.log(`Rendering stem: ${track.title}`);
      const renderedBuffer = await offlineCtx.startRendering();
      const blob = format === 'mp3' ? await this.bufferToMp3Blob(renderedBuffer) : this.bufferToWavBlob(renderedBuffer);
      const safeTitle = track.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      zip.file(`${safeTitle}_stem.${format}`, blob);
    }

    console.log("Generating ZIP file...");
    return await zip.generateAsync({ type: 'blob' });
  }

  async exportMix(tracksList: TrackNodeState[], format: 'wav' | 'mp3' = 'wav'): Promise<Blob> {
    if (tracksList.length === 0) {
      throw new Error("No tracks to export");
    }

    // 1. Fetch all audio data as ArrayBuffers
    console.log("Fetching track buffers for offline rendering...");
    const audioBuffers: { track: TrackNodeState; buffer: AudioBuffer }[] = [];

    // Temporary context to decode files
    const tempCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    for (const track of tracksList) {
      try {
        const response = await fetch(track.url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
        audioBuffers.push({ track, buffer: audioBuffer });
      } catch (e) {
        console.error(`Failed to load track ${track.title} for export:`, e);
      }
    }

    tempCtx.close();

    if (audioBuffers.length === 0) {
      throw new Error("No audio files could be loaded for offline export");
    }

    let maxDuration = 0;
    for (const item of audioBuffers) {
      let effectiveRate = item.track.playbackRate || 1.0;
      if (!item.track.preservePitch && item.track.pitchShift && item.track.pitchShift !== 1.0) {
        effectiveRate = item.track.pitchShift;
      }
      const adjustedDuration = item.buffer.duration / effectiveRate;
      if (adjustedDuration > maxDuration) {
        maxDuration = adjustedDuration;
      }
    }

    // 3. Create OfflineAudioContext (Stereo, 44.1kHz)
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * maxDuration, sampleRate);

    // 4. Build the DSP graphs for all tracks in Offline Context
    for (const item of audioBuffers) {
      const { track, buffer } = item;
      
      let effectiveRate = track.playbackRate || 1.0;
      if (!track.preservePitch && track.pitchShift && track.pitchShift !== 1.0) {
        effectiveRate = track.pitchShift;
      }
      
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(effectiveRate, 0);

      // Duplicate standard DSP elements
      const splitter = offlineCtx.createChannelSplitter(2);
      const merger = offlineCtx.createChannelMerger(2);
      const gainL = offlineCtx.createGain();
      const gainR = offlineCtx.createGain();

      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 250;
      eqLow.gain.value = track.eqLow;

      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1500;
      eqMid.gain.value = track.eqMid;

      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 4000;
      eqHigh.gain.value = track.eqHigh;

      const lofi = offlineCtx.createBiquadFilter();
      lofi.type = 'lowpass';
      lofi.frequency.value = track.lofiEnabled ? 1500 : 22000;

      const panner = offlineCtx.createStereoPanner();

      const trackGain = offlineCtx.createGain();
      const vol = track.mute ? 0 : track.volume;
      trackGain.gain.setValueAtTime(vol, 0);

      // Connect source to splitter
      source.connect(splitter);
      splitter.connect(gainL, 0);
      splitter.connect(gainR, 1);

      // Handle vocal extraction mode
      if (track.vocalExtraction === 'vocal_remover') {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(-1.0, 0); // Invert phase
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 0);
        gainL.connect(merger, 0, 1);
        gainR.connect(merger, 0, 1);
      } else if (track.vocalExtraction === 'vocal_isolate') {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(1.0, 0);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 0);
        gainL.connect(merger, 0, 1);
        gainR.connect(merger, 0, 1);
      } else {
        gainL.gain.setValueAtTime(1.0, 0);
        gainR.gain.setValueAtTime(1.0, 0);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 1);
      }

      merger.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(lofi);
      lofi.connect(panner);
      panner.connect(trackGain);
      trackGain.connect(offlineCtx.destination);

      // Apply 8D Automation (using AudioParam automation for panning since LFOs don't automate easily offline)
      if (track.pan8dEnabled) {
        const panParam = panner.pan;
        panParam.setValueAtTime(0, 0);
        // Automate panning back and forth
        const speedHz = track.pan8dSpeed;
        const step = 0.05; // automate every 50ms
        for (let time = 0; time < maxDuration; time += step) {
          const panVal = Math.sin(2 * Math.PI * speedHz * time);
          panParam.setValueAtTime(panVal, time);
        }
      } else {
        panner.pan.setValueAtTime(track.pan, 0);
      }

      source.start(0);
    }

    // 5. Render audio offline
    console.log("Rendering mix offline...");
    const renderedBuffer = await offlineCtx.startRendering();

    // 6. Convert AudioBuffer to WAV or MP3 blob
    if (format === 'mp3') {
      return this.bufferToMp3Blob(renderedBuffer);
    } else {
      return this.bufferToWavBlob(renderedBuffer);
    }
  }

  // MP3 file generator helper
  private async bufferToMp3Blob(buffer: AudioBuffer): Promise<Blob> {
    // 1. Dynamically load lamejs from CDN if not already loaded
    const lamejs = await new Promise<any>((resolve, reject) => {
      if ((window as any).lamejs) {
        resolve((window as any).lamejs);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
      script.onload = () => {
        if ((window as any).lamejs) {
          resolve((window as any).lamejs);
        } else {
          reject(new Error("lamejs loaded but object not found on window"));
        }
      };
      script.onerror = () => reject(new Error("Failed to load lamejs MP3 encoder from CDN"));
      document.head.appendChild(script);
    });

    // 2. Configure encoder
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = 128;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data: any[] = [];

    const sampleBlockSize = 1152;

    if (channels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const leftInt16 = new Int16Array(left.length);
      const rightInt16 = new Int16Array(right.length);

      for (let i = 0; i < left.length; i++) {
        // Convert float -1.0..1.0 to 16-bit signed PCM
        leftInt16[i] = Math.max(-1, Math.min(1, left[i])) * 0x7FFF;
        rightInt16[i] = Math.max(-1, Math.min(1, right[i])) * 0x7FFF;
      }

      for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
        const leftChunk = leftInt16.subarray(i, i + sampleBlockSize);
        const rightChunk = rightInt16.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
    } else {
      const mono = buffer.getChannelData(0);
      const monoInt16 = new Int16Array(mono.length);

      for (let i = 0; i < mono.length; i++) {
        monoInt16[i] = Math.max(-1, Math.min(1, mono[i])) * 0x7FFF;
      }

      for (let i = 0; i < monoInt16.length; i += sampleBlockSize) {
        const monoChunk = monoInt16.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(monoChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  // WAV file generator helper
  private bufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels: Float32Array[] = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16);         // length = 16
    setUint16(1);          // PCM format = 1
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16);         // bits per sample

    setUint32(0x61746164); // "data" chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // 16-bit PCM
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArray], { type: 'audio/wav' });
  }
}

export default new AudioEngine();
