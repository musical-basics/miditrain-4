# DreamFlow MIDI Integration Guide

This folder contains a self-contained, drop-in rendering pipeline for generating high-quality sheet music from MIDI data.

## 📦 What's Included?
1.  **`VexFlowRenderer.tsx`**: The main React component for SVG rendering.
2.  **`VexFlowHelpers.ts`**: Formatting logic (tuplets, grace notes, stemming).
3.  **`IntermediateScore.ts`**: The data contract (JSON schema).
4.  **`midiMatcher.ts`**: Utility for Pitch-to-Sheet conversion.
5.  **`types.ts`**: Shared TypeScript definitions.
6.  **`DREAMFLOW_MIDI_FORMAT.md`**: Detailed technical documentation of the data flow.

## 🚀 Setup Instructions

### 1. Requirements
Ensure your project has the following dependencies installed:
```bash
pnpm add dreamflow lucide-react
```
*(Note: `dreamflow` should be your custom fork of VexFlow v5)*

### 2. Implementation
1.  **Drop the folder**: Move this entire `DreamFlow_MIDI_Format_Guide` directory into your project's components or lib folder.
2.  **Generate Data**: Write your MIDI processing logic to output a JSON object that satisfies the `IntermediateScore` interface (from `IntermediateScore.ts`).
3.  **Render**: Import and use the component:

```tsx
import { VexFlowRenderer } from './DreamFlow_MIDI_Format_Guide/VexFlowRenderer';

// In your component:
<VexFlowRenderer 
  score={myIntermediateScore} 
  musicFont="Bravura" 
  darkMode={true} 
/>
```

## 🛠 Troubleshooting
- **Module not found**: All imports within this folder are **relative** (`./`). As long as the files stay together in this folder, they will resolve correctly regardless of your project's internal alias configuration (`@/`).
- **Font Rendering**: If notes look small or displaced, ensure you have correctly linked the `dreamflow` library, as it handles the Bravura font preloading internally via `VexFlow.loadFonts`.

---

*This guide ensures parity with the rendering engine used in Ultimate Pianist v1.*
