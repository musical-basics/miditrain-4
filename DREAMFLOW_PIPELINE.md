# DreamFlow: The Tonal-Agentic Pipeline

DreamFlow is a professional-grade MIDI-to-Sheet-Music engine that uses cognitive musicology and vector physics to transform raw performance data into semantic notation.

---

## 🟢 Phase 1: Harmonic Regime Detection
**Focus**: *Tonal Gravity & Color Mapping*
- **Mechanism**: Maps Every MIDI interval to a 360° circular vector space (Angle = Interval Type, Magnitude = Intensity/Velocity).
- **Anchor Isolation**: Prevents "Centroid Drift" by locking in the core chord of a measure and treating passing notes as "merges" rather than drifts.
- **Output**: Each note is assigned a **Hue** (tonal direction), **Saturation** (harmonic tension), and **Regime_ID**.
- **Script**: `harmonic_regime_detector.py`

## 🟣 Phase 2: Voice Threading
**Focus**: *Horizontal Geometry & Hand Separation*
- **Mechanism**: Heuristic assignment of notes into four primary streams: **Soprano**, **Alto**, **Tenor**, and **Bass**.
- **Logic**: Uses pitch-proximity clusters to determine which notes belong to the Left Hand (Bass Clef) vs. Right Hand (Treble Clef).
- **Output**: A semantic `voice_tag` for every note.
- **Script**: `voice_threader.py`

## 🟡 Phase 3a: Meter & Grid Analysis
**Focus**: *Temporal Reconstruction*
- **Mechanism**: Analyzes the rhythmic pulse of the performance to discover the **BPM** and **Time Signature**.
- **Logic**: Identifies "strong beats" and "downbeats" to establish a repeatable musical grid.
- **Output**: A global grid definition with `ticks_per_measure` and `beats_per_measure`.
- **Script**: `phase3_meter.py`

## 🔵 Phase 3b: Quantization & Enharmonic Spelling
**Focus**: *Grammatical Normalization*
- **Quantization**: Snaps MIDI onsets and durations to the musical grid (16th notes, 32nd-note triplets, etc.).
- **Enharmonic Matrix**: Determines whether a MIDI pitch (e.g., 61) should be spelled as **C#** or **Db** based on local harmonic regimes.
- **Output**: A quantized JSON structure where notes have musical names (e.g., `Ab4`, `F#2`).
- **Script**: `phase3b_quantize.py`

## 🎹 Phase 3c: Notation Mapping & Formatting
**Focus**: *Professional Visual Rendering*
- **Key Signature Engine**: Uses the **Temperley (CBMS)** or **Krumhansl-Schmuckler** algorithms to determine the macro key signature (e.g., Ab Major).
- **Adaptive Layout**: Calculates the "musical width" of every measure individually to expand the staff for high-density 32nd notes and prevent collisions.
- **Redundancy Filtering**: Automatically suppresses redundant clefs and key signatures at the start of every measure for a clean, professional look.
- **Output**: The finalized `IntermediateScore` JSON ready for the VexFlow React engine.
- **Script**: `phase3c_notation.py`

---

> [!TIP]
> **Tension Interaction**: In the final UI, you can hover over any note to see its **Phase 1 Tension Score** and **Phase 2 Voice Assignment** directly on the sheet music.
