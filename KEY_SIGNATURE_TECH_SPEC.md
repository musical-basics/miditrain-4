# Technical Specification: Automatic Key Signature & Enharmonic Spelling

This document outlines the current status of the ETME Engine's notation pipeline regarding key signatures and provides context for implementing an automated detection system.

## Current State

As of the DreamFlow MIDI upgrade, the notation pipeline is functional but uses a **Fixed Key (C Major)** model. 

### 1. Backend: `phase3c_notation.py`
The Python script responsible for generating the `IntermediateScore` JSON currently has the following limitations:
- **Hardcoded Key**: The `keySignature` field in the first measure is hardcoded to `"C"`.
- **Naive Pitch Spelling**: The `midi_to_vex()` function uses a fixed array of notes `['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']`. It always prefers sharps for black keys, regardless of the musical context.

### 2. Frontend: `VexFlowRenderer.tsx`
The rendering engine is ready to support key signatures. It accepts a string (e.g., `"Ab"`, `"Fm"`) and:
- Draws the correct sharps/flats at the start of the staff.
- Manages the internal "accidental state" of the measure.
- **Problem**: Because the backend provides explicit accidentals for every note (e.g., `d#` even if the key is Ab), VexFlow renders exactly what it's told, leading to unreadable "accidental-heavy" scores.

## The Objective

We need to replace the static logic with a **Weighted Key Signature Detector**.

### Input Data
The system has access to the full list of MIDI notes in the current chunk before the score is built:
- **Pitch distribution**: Count occurrences of all 12 chromatic pitches.
- **Harmonic Regimes**: Phase 1 data provides "hues" that correspond to harmonic centers, which can be mapped back to likely keys.

### Desired Logic
1.  **Analyze**: Iterate through all notes in the chunk/measure.
2.  **Detect Key**: Determine the most likely key signature (e.g., Ab Major / 4 flats).
3.  **Enharmonic Spelling**: 
    - If the key is Ab Major, a MIDI pitch of `68` should be spelled as `Ab`, not `G#`.
    - MIDI pitch `61` should be `Db`, not `C#`.
4.  **Redundancy Filter**: Only output an accidental in the JSON if the note deviates from the detected key signature.

## Reference Schema

The `IntermediateScore` schema expects:

```json
{
  "measures": [
    {
      "measureNumber": 1,
      "keySignature": "Ab", 
      "staves": [
        {
          "voices": [
            {
              "notes": [
                {
                  "keys": ["ab/4"], 
                  "accidentals": [null], // No accidental drawn because it's in the key
                  ...
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Relevant Files for Reference
- `phase3c_notation.py`: The logic to be upgraded.
- `visualizer/app/components/dreamflow/IntermediateScore.ts`: The data contract.
- `visualizer/app/components/NotationView.js`: The frontend wrapper.
