'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import NotationView from './NotationView';

// ===== CONSTANTS =====
const PITCH_MIN = 21;
const PITCH_MAX = 108;
const MAX_CANVAS_PX = 16000;
const RULER_HEIGHT = 24;
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_KEYS = [1,3,6,8,10];
const NOTE_NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function midiNoteName(pitch) {
  const name = NOTE_NAMES_FLAT[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

// Format ms to "M:SS.s" timestamp
function formatTime(ms) {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(1).padStart(4, '0')}` : `${sec.toFixed(1)}s`;
}

// ===== COLOR HELPERS =====
function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function idScoreToColor(score) {
  const t = Math.min(score / 120, 1);
  const h = 240 - t * 240;
  const s = 70 + t * 20;
  const l = 45 + t * 15;
  return hsl(h, s, l);
}

// Voice thread colors: distinct hues for each voice wire
const VOICE_COLORS = {
  'Voice 1': { h: 330, s: 85, l: 60, label: '🎵 Soprano (V1)' },   // Hot Pink
  'Voice 2': { h: 200, s: 80, l: 55, label: '🎶 Alto (V2)' },      // Cyan-Blue
  'Voice 3': { h: 45,  s: 85, l: 50, label: '🎶 Tenor (V3)' },     // Gold
  'Voice 4': { h: 140, s: 70, l: 45, label: '🎵 Bass (V4)' },      // Green
  'Overflow (Chord)': { h: 0, s: 0, l: 50, label: '⚠️ Overflow' }, // Gray
};

function voiceColor(voiceTag, alpha = 0.85) {
  const vc = VOICE_COLORS[voiceTag] || VOICE_COLORS['Overflow (Chord)'];
  return hsl(vc.h, vc.s, vc.l, alpha);
}

function regimeBlockColor(regime) {
  const h = regime.hue || 0;
  const s = regime.saturation || 0;
  if (regime.state === 'Silence') return { bg: 'rgba(30,30,40,0.3)', border: 'rgba(80,80,100,0.2)', label: 'Silence' };
  if (regime.state === 'Undefined / Gray Void') return { bg: 'rgba(60,60,80,0.1)', border: 'rgba(100,100,130,0.15)', label: 'Void' };
  if (regime.state === 'TRANSITION SPIKE!') return { bg: `hsla(${h},90%,50%,0.06)`, border: `hsla(${h},90%,60%,0.35)`, label: '⚡ Spike' };
  if (regime.state === 'Regime Locked') return { bg: `hsla(${h},${Math.min(s,80)}%,40%,0.08)`, border: `hsla(${h},${Math.min(s,80)}%,55%,0.3)`, label: '🔒 Locked' };
  return { bg: `hsla(${h},${Math.min(s,70)}%,45%,0.04)`, border: `hsla(${h},${Math.min(s,70)}%,55%,0.15)`, label: 'Stable' };
}

// ===== MAIN COMPONENT =====
export default function ETMEVisualizer() {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const keyboardRef = useRef(null);

  const [data, setData] = useState(null);
  const [gridData, setGridData] = useState(null);
  const [currentView, setCurrentView] = useState('raw');
  const [midiFile, setMidiFile] = useState('chunk2');
  const [angleMap, setAngleMap] = useState('dissonance');
  const [breakModel, setBreakModel] = useState('hybrid');
  const [jaccardThreshold, setJaccardThreshold] = useState(0.5);
  const [hZoom, setHZoom] = useState(10);
  const [vZoom, setVZoom] = useState(10);
  const [tooltip, setTooltip] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [layoutMode, setLayoutMode] = useState('horizontal');
  const [keyAlgorithm, setKeyAlgorithm] = useState('temperley');

  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [isEngineDone, setIsEngineDone] = useState(false);
  const [engineLogs, setEngineLogs] = useState([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [midiOptions, setMidiOptions] = useState([
    { label: 'Chunk 1 (Mm. 1-4)', value: 'chunk1' },
    { label: 'Chunk 2 (Mm. 5-8)', value: 'chunk2' },
    { label: 'Chunk 3 (Mm. 9-12)', value: 'chunk3' }
  ]);
  const [phase3bData, setPhase3bData] = useState(null);
  const [phase3cData, setPhase3cData] = useState(null);

  const fileInputRef = useRef(null);
  const effectiveScaleRef = useRef(0.05);
  const logsEndRef = useRef(null);

  const getBaseKey = useCallback(() => {
    if (midiFile && midiFile.startsWith('midis/')) return midiFile.split('/').pop().replace('.mid', '');
    return midiFile;
  }, [midiFile]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView();
  }, [engineLogs]);

  const runEngine = useCallback(async () => {
    setIsEngineRunning(true);
    setEngineLogs([`🚀 Starting ETME Engine Pipeline for ${midiFile} (${angleMap}, ${breakModel}, ${jaccardThreshold})...`]);

    const runScript = async (script, args) => {
      const resp = await fetch('/api/run-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, args })
      });
      if (!resp.body) return false;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // keep remainder
          for (const part of parts) {
            const dataMatch = part.match(/data: (.*)/);
            const eventMatch = part.match(/event: (.*)/);
            
            if (dataMatch) {
              const msg = JSON.parse(dataMatch[1]);
              const eventPattern = eventMatch ? eventMatch[1].trim() : '';

              if (eventPattern === 'done') {
                return msg.code === 0;
              }

              if (msg.text) {
                setEngineLogs(prev => [...prev, msg.text.trim()]);
              } else if (msg.type === 'error' || eventPattern === 'error') {
                setEngineLogs(prev => [...prev, '❌ ERROR: ' + (msg.text || JSON.stringify(msg))]);
              }
            }
          }
        }
      }
      return false; // if stream ends without 'done' event, assume failure
    };

    setEngineLogs(prev => [...prev, '\n[1/4] Running Phase 1 & 2 (export_etme_data.py)...']);
    const s1 = await runScript('export_etme_data.py', [
      '--midi_key', midiFile,
      '--angle_map', angleMap,
      '--break_method', breakModel,
      '--jaccard', jaccardThreshold.toString()
    ]);
    if (!s1) {
      setEngineLogs(prev => [...prev, '\n❌ Pipeline aborted. Please check the logs above.']);
      setIsEngineDone(true);
      return;
    }

    const baseKey = getBaseKey();
    setEngineLogs(prev => [...prev, '\n[2/4] Running Phase 3A (phase3_meter.py)...']);
    const jsonTarget = (breakModel === 'hybrid' || breakModel === 'hybrid_split')
      ? `visualizer/public/etme_${baseKey}_${angleMap}_${breakModel}_${jaccardThreshold}.json`
      : `visualizer/public/etme_${baseKey}_${angleMap}_${breakModel}.json`;
    const s2 = await runScript('phase3_meter.py', [jsonTarget, '--json']);
    if (!s2) {
      setEngineLogs(prev => [...prev, '\n❌ Pipeline aborted. Please check the logs above.']);
      setIsEngineDone(true);
      return;
    }

    setEngineLogs(prev => [...prev, '\n[3/4] Running Phase 3B (phase3b_quantize.py)...']);
    const gridTarget = `visualizer/public/phase3_grid_${baseKey}.json`;
    const s3 = await runScript('phase3b_quantize.py', [jsonTarget, gridTarget]);
    if (!s3) {
      setEngineLogs(prev => [...prev, '\n❌ Pipeline aborted. Please check the logs above.']);
      setIsEngineDone(true);
      return;
    }

    setEngineLogs(prev => [...prev, '\n[4/4] Running Phase 3C (phase3c_notation.py)...']);
    const p3cTarget = (breakModel === 'hybrid' || breakModel === 'hybrid_split')
      ? `visualizer/public/phase3b_quantized_${baseKey}_${angleMap}_${breakModel}_${jaccardThreshold}.json`
      : `visualizer/public/phase3b_quantized_${baseKey}_${angleMap}_${breakModel}.json`;
    const s4 = await runScript('phase3c_notation.py', [p3cTarget, gridTarget, '--algo', keyAlgorithm]);
    if (!s4) {
      setEngineLogs(prev => [...prev, '\n❌ Pipeline aborted. Please check the logs above.']);
      setIsEngineDone(true);
      return;
    }

    setEngineLogs(prev => [...prev, '\n✅ Pipeline Complete! You can now dismiss this window.']);
    setRefreshTrigger(prev => prev + 1);
    setIsEngineDone(true);
  }, [midiFile, angleMap, breakModel, jaccardThreshold, getBaseKey]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload-midi', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.filepath) {
        setMidiFile(data.filepath);
        setRefreshTrigger(prev => prev + 1);
      }
    } catch(err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  // Load midi options
  useEffect(() => {
    fetch('/api/list-midis')
      .then(r => r.json())
      .then(d => { if (d.midis) setMidiOptions(d.midis); })
      .catch(console.error);
  }, [refreshTrigger]);

  // Load data when any selector changes
  useEffect(() => {
    const baseKey = getBaseKey();
    const etmeFile = (breakModel === 'hybrid' || breakModel === 'hybrid_split')
      ? `etme_${baseKey}_${angleMap}_${breakModel}_${jaccardThreshold}.json`
      : `etme_${baseKey}_${angleMap}_${breakModel}.json`;
      
    fetch(`/${etmeFile}?t=${Date.now()}_${refreshTrigger}`)
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(setData)
      .catch(() => setData(null));

    const p3bFile = (breakModel === 'hybrid' || breakModel === 'hybrid_split')
      ? `phase3b_quantized_${baseKey}_${angleMap}_${breakModel}_${jaccardThreshold}.json`
      : `phase3b_quantized_${baseKey}_${angleMap}_${breakModel}.json`;

    fetch(`/${p3bFile}?t=${Date.now()}_${refreshTrigger}`)
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(setPhase3bData)
      .catch(() => setPhase3bData(null));

    const p3cFile = (breakModel === 'hybrid' || breakModel === 'hybrid_split')
      ? `phase3c_osmd_ready_${baseKey}_${angleMap}_${breakModel}_${jaccardThreshold}.json`
      : `phase3c_osmd_ready_${baseKey}_${angleMap}_${breakModel}.json`;

    fetch(`/${p3cFile}?t=${Date.now()}_${refreshTrigger}`)
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(setPhase3cData)
      .catch(() => setPhase3cData(null));

  }, [midiFile, angleMap, breakModel, jaccardThreshold, refreshTrigger, getBaseKey]);

  // Load Phase 3A grid whenever the chunk changes
  useEffect(() => {
    const baseKey = getBaseKey();
    const gridFile = `phase3_grid_${baseKey}.json`;
    fetch(`/${gridFile}?t=${Date.now()}_${refreshTrigger}`)
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(setGridData)
      .catch(() => setGridData(null));
  }, [midiFile, refreshTrigger, getBaseKey]);

  // Sync scroll between keyboard and canvas
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const keyboard = keyboardRef.current;
    if (!wrapper || !keyboard) return;
    const onScroll = () => { keyboard.scrollTop = wrapper.scrollTop; };
    wrapper.addEventListener('scroll', onScroll);
    return () => wrapper.removeEventListener('scroll', onScroll);
  }, []);

  // Rendering
  const noteHeight = vZoom;
  const msPxInput = 0.005 * hZoom;

  const render = useCallback(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const notes = data.notes;
    const regimes = data.regimes;
    const pitchRange = PITCH_MAX - PITCH_MIN + 1;

    const maxTime = Math.max(...notes.map(n => n.onset + n.duration)) + 500;
    const effectiveScale = msPxInput;
    effectiveScaleRef.current = effectiveScale;
    const canvasW = Math.min(Math.max(maxTime * effectiveScale, 1200), MAX_CANVAS_PX);
    const rollH = pitchRange * noteHeight;
    const canvasH = rollH + RULER_HEIGHT;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Grid rows
    for (let p = PITCH_MIN; p <= PITCH_MAX; p++) {
      const y = (PITCH_MAX - p) * noteHeight;
      const pc = p % 12;
      const isBlack = BLACK_KEYS.includes(pc);
      ctx.fillStyle = isBlack ? 'transparent' : 'rgba(255,255,255,0.015)';
      ctx.fillRect(0, y, canvasW, noteHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
    }

    // Beat grid + timestamp ruler
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, rollH, canvasW, RULER_HEIGHT);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, rollH); ctx.lineTo(canvasW, rollH); ctx.stroke();

    for (let t = 0; t < maxTime; t += 100) {
      const x = t * effectiveScale;
      // Vertical grid lines: fine (100ms), semi-major (500ms), major (1000ms)
      if (t % 1000 === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
      } else if (t % 500 === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 0.75;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rollH); ctx.stroke();

      // Ruler tick marks
      const isMajor = t % 1000 === 0;
      const isMid = t % 500 === 0;
      if (isMajor || isMid) {
        const tickH = isMajor ? 8 : 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, rollH); ctx.lineTo(x, rollH + tickH); ctx.stroke();
      }
      // Labels every 1s
      if (isMajor) {
        ctx.font = '9px Inter';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(t), x, rollH + 18);
        ctx.textAlign = 'start';
      }
    }

    // Phase 1: Regime blocks — paint background using the TRUE average chord hue from notes
    if (currentView === 'phase1' || currentView === 'phase3a') {
      const regimeAlpha = currentView === 'phase3a' ? 0.45 : 1.0; // reduced opacity in phase3a so barlines dominate

      for (const r of regimes) {
        const x = r.start_time * effectiveScale;
        const w = Math.max((r.end_time - r.start_time) * effectiveScale, 1);

        const avgHue = r.hue || 0;
        const avgSat = r.saturation || 0;

        // Background fill — scaled by regimeAlpha so it steps back in phase3a
        if (r.state === 'Silence' || r.state === 'Undefined / Gray Void') {
          ctx.fillStyle = `rgba(30,30,40,${0.15 * regimeAlpha})`;
        } else {
          ctx.fillStyle = `hsla(${avgHue}, ${Math.min(avgSat, 80)}%, 45%, ${0.06 * regimeAlpha})`;
        }
        ctx.fillRect(x, 0, w, rollH);

        // Vertical separator
        ctx.strokeStyle = `hsla(${avgHue}, ${Math.min(avgSat, 70)}%, 55%, ${0.15 * regimeAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rollH); ctx.stroke();

        // State indicator bar at top
        let stateColor, stateLabel;
        if (r.state === 'TRANSITION SPIKE!') {
          stateColor = `hsla(60, 95%, 60%, ${0.8 * regimeAlpha})`;
          stateLabel = '⚡ Spike';
        } else if (r.state === 'Regime Locked') {
          stateColor = `hsla(120, 80%, 50%, ${0.8 * regimeAlpha})`;
          stateLabel = '🔒 Locked';
        } else if (r.state === 'Silence' || r.state === 'Undefined / Gray Void') {
          stateColor = `rgba(80, 80, 100, ${0.4 * regimeAlpha})`;
          stateLabel = r.state === 'Silence' ? 'Silence' : 'Void';
        } else {
          stateColor = `hsla(${avgHue}, 70%, 55%, ${0.6 * regimeAlpha})`;
          stateLabel = 'Stable';
        }
        ctx.fillStyle = stateColor;
        ctx.fillRect(x, 0, w, 3);

        // Label (only in phase1 full view — too cluttered in phase3a with barlines)
        if (w > 30 && currentView === 'phase1') {
          ctx.font = '9px Inter';
          ctx.fillStyle = stateColor;
          ctx.fillText(stateLabel, x + 4, 14);
        }
      }

    }

    // Draw notes
    const activeData = (currentView === 'phase3b' && phase3bData) ? phase3bData.notes : notes;

    for (const n of activeData) {
      let x, w, y;
      
      // If Phase 3B is active, and we have valid quantization, render elastically snapped geometry
      if (currentView === 'phase3b' && n.quantized) {
        // Find the absolute ms time corresponding to abs_tick_start and abs_tick_end
        // We can precisely map this back using the barlines array or just show them on the rigid grid layout
        // Let's use an idealized rigid grid for phase 3B to prove they are quantized.
        // Or better yet, we can draw them horizontally using an idealized grid layout where each tick is e.g. 100px uniformly!
        // The PRD mentions bridging the gap between analog continuous and discrete grammar. 
        // Let's render Phase 3B over the true time to see where they snapped relative to raw coords.
        
        // Let's construct a tick -> ms map from barlines just for rendering
        const barlines = gridData?.barlines || [];
        const measure_ms = gridData?.measure_ms || 1000;
        const ticks_per_measure = (gridData?.beats_per_measure || 4) * (gridData?.subdivision || 4);
        
        const getMsForTick = (absTick) => {
          if (!barlines.length) return absTick * (measure_ms / ticks_per_measure);
          const first_measure = barlines[0].measure;
          const target_measure = first_measure + Math.floor(absTick / ticks_per_measure);
          const remainder = absTick % ticks_per_measure;
          
          let m_start_ms;
          const matched_b = barlines.find(b => b.measure === target_measure);
          if (matched_b) {
            m_start_ms = matched_b.time_ms;
          } else {
            // Extrapolate
            m_start_ms = barlines[0].time_ms + (target_measure - first_measure) * measure_ms;
          }
          const tick_ms = m_start_ms + (remainder * (measure_ms / ticks_per_measure));
          return tick_ms;
        };

        const snapped_onset = getMsForTick(n.quantized.abs_tick_start);
        const snapped_offset = getMsForTick(n.quantized.abs_tick_end);
        
        x = snapped_onset * effectiveScale;
        w = Math.max((snapped_offset - snapped_onset) * effectiveScale, 3);
        y = (PITCH_MAX - n.pitch) * noteHeight;
      } else {
        x = n.onset * effectiveScale;
        w = Math.max(n.duration * effectiveScale, 2);
        y = (PITCH_MAX - n.pitch) * noteHeight;
      }

      let fillColor, strokeColor;

      if (currentView === 'raw') {
        const velAlpha = 0.4 + (n.velocity / 127) * 0.6;
        fillColor = hsl(220, 70, 60, velAlpha);
        strokeColor = hsl(220, 80, 70, 0.7);
      } else if (currentView === 'phase1') {
        // 4D chord color: Hue from vector angle, Sat from magnitude, Lightness from octave
        const h = n.hue || 0;
        const s = Math.min(n.sat || 30, 100);
        // Remap lightness to a wider visual range (20-80) for better contrast
        const rawL = n.lightness || 50;
        const l = 20 + (rawL / 100) * 60;

        if (n.regime_state === 'TRANSITION SPIKE!') {
          fillColor = `hsla(${h}, ${Math.max(s, 70)}%, ${l}%, 0.95)`;
          strokeColor = `hsla(${h}, 95%, ${Math.min(l + 15, 85)}%, 1)`;
          ctx.shadowColor = `hsla(${h}, 90%, 50%, 0.4)`;
          ctx.shadowBlur = 4;
        } else if (n.regime_state === 'Regime Locked') {
          fillColor = `hsla(${h}, ${s}%, ${l}%, 0.9)`;
          strokeColor = `hsla(${h}, ${s}%, ${Math.min(l + 10, 80)}%, 0.95)`;
        } else if (n.regime_state === 'Silence' || n.regime_state === 'Undefined / Gray Void') {
          fillColor = `rgba(80, 80, 100, 0.4)`;
          strokeColor = `rgba(100, 100, 130, 0.6)`;
        } else {
          fillColor = `hsla(${h}, ${s}%, ${l}%, 0.8)`;
          strokeColor = `hsla(${h}, ${s}%, ${Math.min(l + 10, 80)}%, 0.9)`;
        }
      } else if (currentView === 'phase2' || currentView === 'phase3a' || currentView === 'phase3b') {
        const vc = VOICE_COLORS[n.voice_tag] || VOICE_COLORS['Overflow (Chord)'];
        // Reduce alpha slightly for 3B just to differentiate
        const alpha = currentView === 'phase3a' ? 0.5 : (currentView === 'phase3b' ? 0.95 : 0.85);
        fillColor = hsl(vc.h, vc.s, currentView === 'phase3b' ? vc.l + 10 : vc.l, alpha);
        strokeColor = hsl(vc.h, vc.s, Math.min(vc.l + 25, 80), alpha + 0.1);
        if ((currentView === 'phase2' || currentView === 'phase3b') && (n.voice_tag === 'Voice 1' || n.voice_tag === 'Voice 4')) {
          ctx.shadowColor = hsl(vc.h, 90, 50, currentView === 'phase3b' ? 0.7 : 0.4);
          ctx.shadowBlur = currentView === 'phase3b' ? 8 : 5;
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }
      }


      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.roundRect(x, y + 1, w, noteHeight - 2, 2);
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Debug labels on Phase 1 — show per-note contribution with actual note names
      if (currentView === 'phase1' && n.debug && n.debug.particles) {
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        const parts = n.debug.particles;
        // Show note name + interval + mass
        const noteName = midiNoteName(n.pitch);
        const label = parts.map(p => {
          const oct = p.o || p.octave || '?';
          const iv = p.int || p.interval;
          return `${iv}:${(p.m ?? p.mass)?.toFixed(2)}`;
        }).join(' ');
        const diffLabel = `Δ${n.debug.diff}° pm=${n.debug.pmass?.toFixed(2)} rm=${n.debug.rmass?.toFixed(2)} th=${n.debug.threshold?.toFixed(2)}`;
        // Note name in cyan, then interval data
        ctx.fillStyle = 'rgba(100,220,255,0.9)';
        ctx.fillText(noteName, x + 2, y - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(label, x + 2 + ctx.measureText(noteName + ' ').width, y - 2);
        ctx.fillStyle = 'rgba(255,200,100,0.6)';
        ctx.fillText(diffLabel, x + 2, y - 10);
      }
    }
      // Phase 3A & 3B: Barline Grid overlay (drawn on top of all other views)
    if ((currentView === 'phase3a' || currentView === 'phase3b') && gridData) {
      const barlines = gridData.barlines || [];
      const timeSig = gridData.time_signature || '?/?';
      const bpm = gridData.bpm_tactus || '?';
      const tactusMs = gridData.tactus_ms || 500;
      const subdivision = gridData.subdivision || 1;
      const subTactusMs = gridData.sub_tactus_ms || tactusMs;

      // Draw beat tick lines (tactus pulses) between barlines
      const measureMs = gridData.measure_ms || 1000;
      const beatsPerMeasure = gridData.beats_per_measure || 2;
      const beatMs = measureMs / beatsPerMeasure;

      for (let t = 0; t < maxTime; t += beatMs) {
        const x = t * effectiveScale;
        const isMeasureBound = barlines.some(b => Math.abs(b.time_ms - t) < beatMs * 0.2);
        if (!isMeasureBound) {
          ctx.strokeStyle = 'rgba(255, 210, 60, 0.15)';
          ctx.lineWidth = 0.75;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, rollH); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw sub-tactus tick marks in ruler if subdivision > 1
      if (subdivision > 1) {
        for (let t = 0; t < maxTime; t += subTactusMs) {
          const x = t * effectiveScale;
          ctx.strokeStyle = 'rgba(255,210,60,0.06)';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(x, rollH + RULER_HEIGHT * 0.55); ctx.lineTo(x, rollH); ctx.stroke();
        }
      }

      // Draw barlines
      for (const b of barlines) {
        const x = b.time_ms * effectiveScale;
        const isSnapped = b.snapped;

        // Main barline
        ctx.strokeStyle = isSnapped
          ? 'rgba(255, 210, 60, 0.5)'
          : 'rgba(255, 210, 60, 0.2)';
        ctx.lineWidth = isSnapped ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rollH); ctx.stroke();

        // Ruler tick
        ctx.strokeStyle = isSnapped ? 'rgba(255,210,60,0.9)' : 'rgba(255,210,60,0.4)';
        ctx.lineWidth = isSnapped ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(x, rollH); ctx.lineTo(x, rollH + 10); ctx.stroke();

        // Measure number label (Bottom)
        ctx.font = `bold ${isSnapped ? 10 : 9}px Inter`;
        ctx.fillStyle = isSnapped ? 'rgba(255, 220, 80, 0.95)' : 'rgba(255, 210, 60, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(`M${b.measure}`, x, rollH + 21);
        
        // Measure number label (Top)
        if (currentView === 'phase3b' || currentView === 'phase3a') {
          ctx.fillStyle = 'rgba(255, 220, 80, 0.7)';
          ctx.fillText(`M${b.measure}`, x + 12, 16);
        }
        ctx.textAlign = 'start';

        // Drift annotation
        if (isSnapped && b.drift_ms !== 0) {
          ctx.font = '7px Inter';
          ctx.fillStyle = 'rgba(255,180,60,0.6)';
          ctx.textAlign = 'center';
          ctx.fillText(`${b.drift_ms > 0 ? '+' : ''}${b.drift_ms}ms`, x, rollH - 4);
          ctx.textAlign = 'start';
        }

        // Spike indicator dot at top
        if (isSnapped) {
          ctx.fillStyle = 'rgba(255, 220, 80, 0.8)';
          ctx.beginPath();
          ctx.arc(x, 8, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Spike Density Envelope ─────────────────────────────────────
      // Draw a bar chart of spike activity (50ms bins) as a waveform
      // strip at the very bottom of the piano roll (above the ruler).
      const DENSITY_H = 28; // px tall strip
      const density = gridData.spike_density || [];
      if (density.length > 0) {
        const maxCount = Math.max(...density.map(d => d.count), 1);
        // faint background for density lane
        ctx.fillStyle = 'rgba(255, 140, 20, 0.05)';
        ctx.fillRect(0, rollH - DENSITY_H, canvasW, DENSITY_H);
        // draw bars
        for (const { t_ms, count } of density) {
          const x = t_ms * effectiveScale;
          const barH = (count / maxCount) * (DENSITY_H - 4);
          const alpha = 0.3 + (count / maxCount) * 0.5;
          ctx.fillStyle = `rgba(255, 150, 40, ${alpha})`;
          ctx.fillRect(x - 1, rollH - barH - 2, Math.max(2, effectiveScale * 50 - 1), barH);
        }
        // label
        ctx.font = '8px Inter';
        ctx.fillStyle = 'rgba(255,150,40,0.5)';
        ctx.fillText('spike density', 4, rollH - DENSITY_H + 9);
      }

      // ── Autocorrelation Curve (in ruler) ──────────────────────────
      // Draw the ACF as a curve inside the ruler, normalized to 0→ruler top.
      const autocorr = gridData.autocorr || [];
      if (autocorr.length > 0) {
        const acfH = RULER_HEIGHT - 12; // leave room for labels at bottom
        const acfTop = rollH + 2;

        // Background tint
        ctx.fillStyle = 'rgba(255,140,20,0.04)';
        ctx.fillRect(0, acfTop, canvasW, acfH);

        // Draw curve
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 165, 40, 0.6)';
        ctx.lineWidth = 1;
        let first = true;
        for (const { lag_ms, score } of autocorr) {
          const x = lag_ms * effectiveScale;
          const y = acfTop + acfH - score * acfH;
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Mark the autocorr peak (= detected measure_ms)
        const peakMs = gridData.autocorr_peak_ms;
        const peakEntry = autocorr.find(a => a.lag_ms === peakMs);
        if (peakEntry) {
          const px = peakMs * effectiveScale;
          const py = acfTop + acfH - peakEntry.score * acfH;
          ctx.fillStyle = 'rgba(255, 220, 60, 0.95)';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '7px Inter';
          ctx.fillStyle = 'rgba(255,220,60,0.8)';
          ctx.textAlign = 'center';
          ctx.fillText(`${peakMs}ms`, px, acfTop - 1);
          ctx.textAlign = 'start';
        }
        // label
        ctx.font = '8px Inter';
        ctx.fillStyle = 'rgba(255,165,40,0.5)';
        ctx.fillText('acf', 4, acfTop + 8);
      }
    }

    }, [data, gridData, currentView, msPxInput, noteHeight]);


  useEffect(() => { render(); }, [render]);

  // Tooltip handler
  const handleMouseMove = useCallback((e) => {
    if (!data) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const timeMs = mx / effectiveScaleRef.current;
    const pitch = PITCH_MAX - Math.floor(my / noteHeight);

    const hit = data.notes.find(n =>
      pitch === n.pitch && timeMs >= n.onset && timeMs <= n.onset + n.duration
    );

    if (hit) {
      const noteName = NOTE_NAMES[hit.pitch % 12] + (Math.floor(hit.pitch / 12) - 1);
      setTooltip({
        x: e.clientX + 14,
        y: e.clientY + 14,
        noteName, pitch: hit.pitch, velocity: hit.velocity,
        onset: hit.onset, duration: hit.duration,
        id_score: hit.id_score, voice_tag: hit.voice_tag,
        hue: hit.hue, sat: hit.sat, lightness: hit.lightness, tonal_distance: hit.tonal_distance
      });
    } else {
      setTooltip(null);
    }
  }, [data, noteHeight]);

  // Notation Interaction
  const handleNoteHover = useCallback((noteId, e) => {
    if (!noteId || !data) {
      setTooltip(null);
      return;
    }

    // noteId format: "n-pitch-tick"
    const parts = noteId.split('-');
    const pitch = parseInt(parts[1]);
    const tick = parseInt(parts[2]);

    // Match back to original data.notes
    // We search for a note with the same pitch and whose onset_ms matches the tick.
    // Tick conversion in phase3b: quantized_onset = int(onset_ms / tick_duration_ms)
    // Here we'll just find a note that is active at the approximate pitch/time.
    const hit = data.notes.find(n => n.pitch === pitch && Math.abs(n.onset - (tick * 60000 / (120 * 4))) < 50); 
    // Note: 120 bpm and 4 subdivision are defaults. 
    // A more robust way is to just find the note that overlaps this pitch/tick in time.
    
    // Better: Since we have the ID, let's just use it to find the note in data.notes if we tagged them.
    // If not tagged, we'll use a loose temporal match.
    const finalHit = hit || data.notes.find(n => n.pitch === pitch && Math.abs(n.onset - (tick * 125)) < 250);

    if (finalHit) {
      const noteName = NOTE_NAMES[finalHit.pitch % 12] + (Math.floor(finalHit.pitch / 12) - 1);
      setTooltip({
        x: e.clientX + 14,
        y: e.clientY + 14,
        noteName, pitch: finalHit.pitch, velocity: finalHit.velocity,
        onset: finalHit.onset, duration: finalHit.duration,
        id_score: finalHit.id_score, voice_tag: finalHit.voice_tag,
        hue: finalHit.hue, sat: finalHit.sat, lightness: finalHit.lightness, tonal_distance: finalHit.tonal_distance
      });
    }
  }, [data]);

  // Keyboard
  const keyboardKeys = [];
  for (let p = PITCH_MAX; p >= PITCH_MIN; p--) {
    const pc = p % 12;
    const octave = Math.floor(p / 12) - 1;
    const isBlack = BLACK_KEYS.includes(pc);
    const isC = pc === 0;
    keyboardKeys.push(
      <div
        key={p}
        className={`key ${isBlack ? 'black' : 'white'} ${isC ? 'c-note' : ''}`}
        style={{ height: noteHeight }}
      >
        {isC ? `C${octave}` : ''}
      </div>
    );
  }

  // Legend
  const legendContent = () => {
    if (currentView === 'raw') return (
      <>
        <h3>Piano Roll</h3>
        <div className="legend-item"><div className="legend-swatch" style={{ background: hsl(220,70,60,0.5) }} />Quiet Note</div>
        <div className="legend-item"><div className="legend-swatch" style={{ background: hsl(220,70,60,1) }} />Loud Note</div>
      </>
    );
    if (currentView === 'phase1') return (
      <>
        <h3>Phase 1 — Harmonic Regimes</h3>
        <div className="legend-item"><div className="legend-swatch" style={{ background: 'hsla(0,70%,45%,0.6)' }} />Stable (by hue)</div>
        <div className="legend-item"><div className="legend-swatch" style={{ background: 'hsla(120,80%,50%,0.75)' }} />🔒 Locked</div>
        <div className="legend-item"><div className="legend-swatch" style={{ background: 'hsla(60,95%,60%,0.9)', boxShadow: '0 0 6px hsla(60,90%,50%,0.5)' }} />⚡ Spike</div>
        <div className="legend-item"><div className="legend-swatch" style={{ background: 'rgba(80,80,100,0.4)' }} />Silence / Void</div>
      </>
    );
    if (currentView === 'phase3a') return (
      <>
        <h3>Phase 3A — Macro-Meter</h3>
        {gridData ? (
          <>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: 'rgba(255,210,60,0.8)', boxShadow: '0 0 4px rgba(255,210,60,0.4)' }} />
              Barline (Spike-Snapped)
            </div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: 'rgba(255,210,60,0.3)', border: '1px solid rgba(255,210,60,0.5)' }} />
              Barline (Dead-Reckoned)
            </div>
            <div className="legend-item" style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
              <span style={{ color: '#ffd640', fontWeight: 600 }}>{gridData.time_signature}</span>
              &nbsp;Time Signature
            </div>
            <div className="legend-item">
              <span style={{ color: '#ffd640', fontWeight: 600 }}>{gridData.bpm_tactus} BPM</span>
              &nbsp;Tactus (♩)
            </div>
            {gridData.subdivision > 1 && (
              <div className="legend-item">
                <span style={{ color: '#ffaa30', fontWeight: 600 }}>{gridData.subdivision}×</span>
                &nbsp;subdivision ({gridData.sub_tactus_ms}ms → {gridData.tactus_ms}ms)
              </div>
            )}
            <div className="legend-item" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }}>
              {gridData.barlines?.filter(b => b.snapped).length}/{gridData.barlines?.length} barlines snapped
            </div>
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
              <div className="legend-item">
                <div className="legend-swatch" style={{ background: 'rgba(255,150,40,0.7)', borderRadius: 1 }} />
                Spike Density (bottom strip)
              </div>
              <div className="legend-item">
                <div className="legend-swatch" style={{ background: 'transparent', border: '1px solid rgba(255,165,40,0.6)' }} />
                ACF curve (ruler)
              </div>
              {gridData.autocorr_peak_ms && (
                <div className="legend-item" style={{ color: 'rgba(255,220,60,0.9)', fontSize: 10, marginTop: 4 }}>
                  ◎ ACF peak: <strong>{gridData.autocorr_peak_ms}ms</strong>
                  &nbsp;= {gridData.beats_per_measure} beats × {gridData.tactus_ms}ms
                </div>
              )}
            </div>

          </>
        ) : <div style={{ color: 'rgba(255,255,255,0.4)' }}>No grid data loaded</div>}
      </>
    );
    return (
      <>
        <h3>Phase 2 — Voice Threading</h3>
        {Object.entries(VOICE_COLORS).map(([key, vc]) => (
          <div key={key} className="legend-item">
            <div className="legend-swatch" style={{ background: hsl(vc.h, vc.s, vc.l) }} />
            {vc.label}
          </div>
        ))}
      </>
    );
  };

  const views = [
    { id: 'raw', label: 'Piano Roll', color: 'var(--accent-blue)' },
    { id: 'phase1', label: 'Phase 1 — Harmonic Regimes', color: 'var(--accent-green)' },
    { id: 'phase2', label: 'Phase 2 — Voice Threading', color: 'var(--accent-pink)' }
  ];

  const phase3Views = [
    { id: 'phase3a', label: '3A — Macro-Meter', color: '#ffd640' },
    { id: 'phase3b', label: '3B — Micro-Quantize', color: '#8e24aa' },
    { id: 'phase3c', label: '3C — Notation Map', color: '#4caf50' }
  ];

  return (
    <>
      {/* HEADER */}
      <div className="header">
        <h1><span>ETME</span> Visualizer</h1>
        <div className="stats">
          <div>Notes<span className="stat-value">{data?.stats?.total_notes ?? '—'}</span></div>
          <div>Regimes<span className="stat-value">{data?.stats?.total_regimes ?? '—'}</span></div>
          {data?.stats?.voice_counts && Object.entries(data.stats.voice_counts).sort().map(([tag, count]) => (
            <div key={tag}>{tag}<span className="stat-value">{count}</span></div>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div className="view-tabs">
        {views.map(v => (
          <button
            key={v.id}
            className={`view-tab ${currentView === v.id ? 'active' : ''}`}
            onClick={() => setCurrentView(v.id)}
          >
            <span className="dot" style={{ background: v.color }} />
            {v.label}
          </button>
        ))}

        <select
          value={currentView.startsWith('phase3') ? currentView : 'phase3_placeholder'}
          onChange={e => {
            if (e.target.value !== 'phase3_placeholder') {
              setCurrentView(e.target.value);
            }
          }}
          className={`view-tab ${currentView.startsWith('phase3') ? 'active' : ''}`}
          style={{
            marginLeft: '8px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold',
            backgroundColor: currentView.startsWith('phase3') ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
            color: currentView.startsWith('phase3') ? '#fff' : '#a0a0b0',
            border: currentView.startsWith('phase3') ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', cursor: 'pointer', outline: 'none', appearance: 'none',
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '12px',
            paddingRight: '24px'
          }}
        >
          <option value="phase3_placeholder" disabled>PHASE 3 OPTIONS...</option>
          {phase3Views.map(v => (
            <option key={v.id} value={v.id} style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={keyAlgorithm}
          onChange={e => setKeyAlgorithm(e.target.value)}
          style={{
            marginLeft: 'auto', marginRight: '6px', padding: '4px 8px', fontSize: '11px',
            background: isDarkMode ? '#1a1a2e' : '#fff',
            color: isDarkMode ? '#e0e0e0' : '#000',
            border: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
          }}
          title="Key Detection Algorithm"
        >
          <option value="krumhansl">Krumhansl-Schmuckler</option>
          <option value="temperley">Temperley (CBMS)</option>
        </select>
        <button 
          onClick={runEngine} 
          style={{
            marginRight: '6px', padding: '4px 12px', fontSize: '11px',
            background: isDarkMode ? '#2e7d32' : '#43a047', color: '#fff', border: `1px solid ${isDarkMode ? '#1b5e20' : '#2e7d32'}`,
            borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}
        >
          ▶ Run Engine
        </button>
        <button 
          onClick={() => setLayoutMode(layoutMode === 'horizontal' ? 'paged' : 'horizontal')}
          style={{
            marginRight: '12px', padding: '4px 8px', fontSize: '11px',
            background: isDarkMode ? '#1a1a2e' : '#fff',
            color: isDarkMode ? '#fff' : '#000',
            border: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px', cursor: 'pointer',
            fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
          }}
          title="Toggle Layout (Horizontal / Paged)"
        >
          {layoutMode === 'horizontal' ? '↔️' : '📑'} {layoutMode === 'horizontal' ? 'Horizontal' : 'Paged'}
        </button>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{
            marginRight: '12px', padding: '4px 8px',
            background: isDarkMode ? '#1a1a2e' : '#fff',
            color: isDarkMode ? '#fff' : '#000',
            border: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
            borderRadius: '4px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{
              marginRight: '16px', padding: '4px 12px', fontSize: '11px',
              background: '#0277bd', color: '#fff', border: '1px solid #01579b',
              borderRadius: '4px', cursor: isUploading ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}
            disabled={isUploading}
          >
            {isUploading ? '📤 Uploading...' : '📥 Import MIDI'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".mid,.midi" 
            style={{ display: 'none' }} 
          />
        </div>
        <select
          value={midiFile}
          onChange={e => setMidiFile(e.target.value)}
          style={{
            padding: '4px 8px', fontSize: '11px', maxWidth: '160px',
            background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #333',
            borderRadius: '4px', cursor: 'pointer'
          }}
        >
          {midiOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={angleMap}
          onChange={e => setAngleMap(e.target.value)}
          style={{
            padding: '4px 8px', fontSize: '11px',
            background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #333',
            borderRadius: '4px', cursor: 'pointer'
          }}
        >
          <option value="dissonance">Dissonance Map</option>
          <option value="fifths">Circle of 5ths</option>
        </select>
        <select
          value={breakModel}
          onChange={e => setBreakModel(e.target.value)}
          style={{
            padding: '4px 8px', fontSize: '11px',
            background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #333',
            borderRadius: '4px', cursor: 'pointer'
          }}
        >
          <option value="centroid">Centroid (Angle)</option>
          <option value="histogram">Histogram (Cosine)</option>
          <option value="hybrid">Hybrid (Angle+Jaccard)</option>
          <option value="hybrid_split">Hybrid-Split (Queue Split)</option>
        </select>
        {(breakModel === 'hybrid' || breakModel === 'hybrid_split') && (
          <select
            value={jaccardThreshold}
            onChange={e => setJaccardThreshold(+e.target.value)}
            style={{
              padding: '4px 8px', fontSize: '11px',
              background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #333',
              borderRadius: '4px', cursor: 'pointer'
            }}
          >
            <option value={0.3}>Jaccard: 0.3 (Tolerant)</option>
            <option value={0.5}>Jaccard: 0.5 (Normal)</option>
            <option value={0.7}>Jaccard: 0.7 (Strict)</option>
          </select>
        )}
      </div>

      {/* ZOOM */}
      <div className="zoom-bar">
        <div className="zoom-group">
          <label>H-Zoom</label>
          <input type="range" min="1" max="100" value={hZoom} onChange={e => setHZoom(+e.target.value)} />
          <span className="zoom-value">{hZoom}</span>
        </div>
        <div className="zoom-group">
          <label>V-Zoom</label>
          <input type="range" min="4" max="30" value={vZoom} onChange={e => setVZoom(+e.target.value)} />
          <span className="zoom-value">{vZoom}</span>
        </div>
      </div>

      {/* PIANO ROLL */}
      <div className="roll-container" style={{ position: 'relative' }}>
        <div className="keyboard" ref={keyboardRef}>{keyboardKeys}</div>
        <div className="canvas-wrapper" ref={wrapperRef}>
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />
          {currentView === 'phase3c' && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: isDarkMode ? '#0d0d12' : '#f8f9fa', zIndex: 10 }}>
              <NotationView 
                phase3cData={phase3cData} 
                gridData={gridData} 
                darkMode={isDarkMode} 
                layoutMode={layoutMode}
                onNoteHover={handleNoteHover}
              />
            </div>
          )}
        </div>
      </div>

      {/* LEGEND */}
      <div className="legend">{legendContent()}</div>

      {/* TOOLTIP */}
      {tooltip && (
        <div className="tooltip" style={{ display: 'block', left: tooltip.x, top: tooltip.y }}>
          <div className="tt-label">{tooltip.noteName} (MIDI {tooltip.pitch})</div>
          <div className="tt-detail">
            Velocity: {tooltip.velocity}<br />
            Onset: {tooltip.onset}ms<br />
            Duration: {tooltip.duration}ms<br />
            {currentView === 'phase3b' && tooltip.quantized && (
              <span style={{ color: '#ffb300' }}>
                <br /><strong>Micro-Quantized:</strong><br />
                M{tooltip.quantized.measure}.B{tooltip.quantized.beat} (Sub {tooltip.quantized.sub_tick})<br />
                Abs Ticks: {tooltip.quantized.abs_tick_start} → {tooltip.quantized.abs_tick_end} (Dur: {tooltip.quantized.duration_ticks})<br />
              </span>
            )}
            <br />
            <strong>4D Chord Color:</strong><br />
            H: {tooltip.hue}° | S: {tooltip.sat}% | L: {tooltip.lightness}%<br />
            Tension: {tooltip.tonal_distance}°<br />
            <br />
            I<sub>d</sub> Score: {tooltip.id_score}<br />
            Tag: {tooltip.voice_tag}
          </div>
        </div>
      )}

      {/* ENGINE MODAL */}
      {isEngineRunning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#0d0d12', width: '800px', height: '600px',
            border: '1px solid #333', borderRadius: '8px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ padding: '12px 16px', background: '#111118', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#e0e0e0', fontSize: '14px' }}>ETME Engine Output</h3>
              {!isEngineDone ? (
                <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #4caf50', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              ) : (
                <button 
                  onClick={() => setIsEngineRunning(false)}
                  style={{
                    background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '4px',
                    padding: '6px 16px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  Dismiss / Close
                </button>
              )}
            </div>
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '12px', color: '#a0a0b0', whiteSpace: 'pre-wrap' }}>
              {engineLogs.map((log, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}} />
        </div>
      )}
    </>
  );
}
