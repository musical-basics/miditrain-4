# ETME Bug Fix Log

## Bug: Polyphonic Voice Stealing and Cascading Overflows
**Date:** March 27, 2026
**Component:** `voice_threader.py` (Phase 2)

### The Issue
During complex piano textures (e.g., Beethoven's Pathetique Sonata), Voice 3 was incorrectly "stealing" repeating inner notes from Voice 4, causing notes to physically jump colors on the visualizer. Additionally, rolling 5-note arpeggiated chords were causing massive overflow spikes (up to 337 dropped notes in a 500-note chunk) because threads were rigidly locking each other out.

### Failed Fix Attempts
1. **Combinatorial Subset Selection (`itertools.combinations`)**
   - *Hypothesis*: By mathematically testing all combinations of chords into available threads, the lowest cost subset would naturally leave Voice 4 open for the true bass line.
   - *Why it failed*: Rigid `p.onset < thread.last_end_time` logic caused Pauli Exclusion to violently trigger `float('inf')` for any arpeggiated chords that overlapped with sustained pedal notes, creating a bottleneck that dumped 60%+ of the notes into Overflow.
2. **Top-Down Array-Mapping with Hardcoded Middle-C (`< 60` threshold)**
   - *Hypothesis*: Explicitly bounding the highest note to V1 and the lowest note to V4 (if `< 60`) would bypass Pauli Exclusion entirely.
   - *Why it failed*: While it successfully dropped the overflows from 337 back to 65, the user rejected the rigid "Middle-C" rule because it breaks on transposed pieces, and it still allowed V4 to incorrectly snatch low tenor notes before the true bass### 5. Final Paradox: The Active Boundary Yield (Tenor Sniping at 2.25s)
After securing the top envelope, a paradox emerged:
- **Chunk 2 Bug**: Soprano (`V1`) drops from `65` to `58`. Alto (`V2`) is oscillating on `58`. If Alto is granted *Unison Immunity* (because it didn't move), the Alto string mathematically steals the Melody from the Soprano!
- **Chunk 3 Bug**: Bass (`V4`) rests for 8th note. Tenor (`V3`) is oscillating on `58`. If Tenor's *Unison Immunity* is revoked, the Bass string jumps 7 semitones to violently steal the Tenor line! 

Both geometric chunks are topologically 100% identical. The resolution lied in parsing the absolute intent behind Classical limits via an **Asymmetric Legato-Aware Yield Threshold**:
1. **Outer Ring Gravity (`W_REGISTER = 0.5`)**: Outer bounds now experience soft Register Gravity (Inner strings experience `0.75`). They are free to span wide distances, but they mathematically prefer not to completely abandon their anchor zones if an inner wire is capable of taking the chord root.
2. **True Activity Mapping (`outer_is_active`)**: Rather than punishing inner boundaries unconditionally, the engine now mathematically senses if the Outer String's preceding note has *explicitly* yielded. If the Soprano's preceding note is still vibrating (i.e. tied into the onset), the Soprano is "Active", Unison Immunity is unequivocally revoked, and the Alto string must swallow a `+20.0` topological invasion penalty. If the Bass string ended its note cleanly completely prior to the chord downbeat, the Bass string is "Resting", the Tenor's Unison Immunity is intrinsically honored, and the Bass leaves the Tenor entirely undisturbed.
3. **Asymmetric String Punishment**: To solve a `27.0` vs `27.0` mathematically absolute dead-heat tied cost, the Bottom-Invasion revocation penalty was softened to `+15.0` vs the Top-Invasion's `+20.0`. This mathematically quantifies the fact that the human ear tolerates inner Tenors carrying rested Bass lines significantly more than it tolerates inner Altos carrying rested Soprano lines.g loops with a robust Thermodynamic Auction powered by "Soft Pauli Exclusion."
- **How it Works**: 
  - Instead of blocking overlapping notes with `float('inf')`, pedal overlaps now pay a soft `cost_collision` penalty. This allows V1, V2, and V3 to comfortably absorb rolling arpeggios even while the sustain pedal is down, without falsely locking out threads.
  - Using `math.log1p(gap_s)` (Logarithmic Cooling) rather than linear cooling prevents long rests from becoming infinitely expensive, allowing resting voices to wake up properly rather than forcing active voices to stretch 20 semitones.
  - A permanent "Register Gravity" was added (`abs(p.pitch - thread.ideal_pitch) * self.W_REGISTER`), constantly pulling Voice 4 back down to the Bass clef if it strays.
- **Result**: The repeating tenor notes visually stabilized, and chunk Overflows plummeted from 337 to 20, gracefully preserving physics-based threading without brittle boolean rules.

## Bug: Structural Boundaries Dropping Outer-Voices and Inverting Topologies
**Date:** March 28, 2026
**Component:** `voice_threader.py` (Phase 2 & Topology Matrix)

### The Issue
Even after introducing Thermodynamic Greedy Auctions, several localized "whack-a-mole" visual fragmentation anomalies emerged across specific piano chunks in the Pathétique Sonata:
1. **Outer Voice Swallowing:** The `Soprano` line was inexplicably absorbing massive 5-note inner-arpeggio block chords, leaving the `Tenor` track fully empty. 
2. **Topological Inversion:** The `Soprano` line dropped *underneath* the `Alto` line, visually scrambling the color coding during Mid-Register melody lines.
3. **Inner Sniping:** The `Bass` wire randomly jumped up to "help" the `Tenor` wire carry dense chords, fragmenting the LH accompaniment into 3 separate visual colors.

### Failed Fix Attempts
1. **Strict 1-Note-Per-Thread `Infinity` Constraints:** 
   - *Hypothesis*: To prevent strings from swallowing thick chords, a hard infinity wall blocked notes sharing the same onset (Block Chords) from sharing strings.
   - *Why it failed*: Music frequently hits the 4-track engine limit (e.g. 5 active notes simultaneously). By mathematically banning string-sharing, the 5th overflow note was mechanically shoved into unrelated upper strings because the relevant local string was artificially locked.
2. **Global Treble Maxim Registration:**
   - *Hypothesis*: Calculating the absolute `p_max` for a 10-second chunk and assigning Voice 1's `ideal_pitch` to that exact note would keep the Soprano track "high" up.
   - *Why it failed*: Melodies dynamically shift into middle registers. When the Top Note dropped to Bb3, the global maxim mathematically punished Voice 1 with a massive 15-point penalty for descending. Voice 1 refused to play the melody, allowing the Alto to steal it.

### The Final Solution: Symmetrical Repulsion and Topological Walls
   - Instead of explicit "if/else" behavior parsing, the engine physics were recalibrated to strictly define the functional existence of boundaries:
   
   1. **Topological Inversion Walls** (`cost_topology`): Upper strings are now strictly mathematically penalized (`+60.0`) if they attempt a coordinate dive beneath the *actively vibrating frequency* of a lower string. This perfectly clumps heavy Bass block chords into their native Tenor/Bass tracks because upper resting strings are mechanically terrified of diving into the Bass Clef to "help."
   2. **Infinite Outer Bounds**: The `Soprano` and `Bass` boundaries were entirely stripped of internal `ideal_pitch` gravity rails. Because they represent the literal infinite envelope of the music, they span all ranges natively without penalty. This fixed the Chunk 2 Top-Note Melody steal because Voice 1 was successfully able to drop to `Bb3` without sustaining a 15-point `W_REGISTER` pseudo-penalty. Unison Immunity (`last_pitch != p.pitch`) was explicitly restored to ensure `Tenor` strings operating in the `is_bottom` register don't randomly trigger Bass string infiltration.
   3. **Soft Pauli Exclusion vs String Inertia**: To organically prompt empty tracks to "wake up" to take inner notes, the mathematical inertia of starting an empty string was dropped to `25.0`, and the Pauli block-chord overlap penalty was calibrated to a Goldilocks `35.0`. This ensures empty inner strings natively wake up to handle thick arpeggios, but correctly offload 5-note overflows into adjacent active tracks rather than shattering the outer structure.

## Bug: VexFlow Notation Squeezing / Z-Axis Stacking (Phase 3C)
**Date:** March 28, 2026
**Component:** `NotationView.js` (Phase 3C)

### The Issue
When rendering the Phase 3C Notation Map, all notes in a measure were visually squashed together at `X = 0`, perfectly superimposed on top of each other without stems or flags. Subsequently, the measure expanded only slightly, leaving the remainder of the VexFlow `Stave` completely blank. VexFlow's Formatter was failing to justify the measure to the expected width.

### Failed Fix Attempts
1. **Upstream LinearFormatter Hack**
   - *Hypothesis*: The standard VexFlow softmax proportional spacing algorithm was assumed incapable of rigid grid alignments, so a custom `LinearFormatter` was built into the `dreamflow` library to force X-coordinates to `measure_start_tick * pixelsPerTick`.
   - *Why it failed*: The upstream override violated VexFlow's internal rendering assumptions and still required extreme manual padding maintenance. More importantly, it did not solve the root cause of why the standard `Formatter` was refusing to justify the notes natively.

### The Final Solution: Dotted Note Parsing and Dynamic Tick Scaling
The issue was actually a combination of two distinct bugs disrupting VexFlow's structural assumptions:

1. **Invalid Duration `ticks=0` Crash**: The raw duration conversion helper (`getVexDuration`) was passing strings like `"q."` for dotted notes directly to the `StaveNote` constructor. VexFlow's modern constructor strictly expects base durations (`"q"`) and fails silently on dotted strings, assigning the note `0` ticks. Because all internal notes advanced the voice by 0 ticks, the Formatter mathematically superimposed them all at Tick 0. 
   - *Fix*: The parser was rewritten to output a proper struct (`{ duration: 'q', dots: 1 }`). By explicitly assigning the `dots` config to the `StaveNote` and binding the visual `new Dot()` modifier, notes regained their correct temporal footprint.
2. **Sub-Minimum Stave Width Squeezing**: The DAW-style layout calculates the physical Stave width via `ticks_per_measure * pixelsPerTick`. The `ticks_per_measure` was natively resolving to `16` (1 tick = 1 sixteenth note). With `pixelsPerTick` hardcoded to `2.0`, the entire measure's physical canvas width evaluated to a microscopic `32` pixels. VexFlow's Formatter literally had no room to spread the notes, so it grouped them into a cluster and hid stems to avoid collisions.
   - *Fix*: The structural scaling was anchored to a constant `80 pixels per quarter note` density by evaluating `pixelsPerTick = 80 / (ticksPerWholeNote / 4)`. This guarantees that regardless of the sub-tick resolution (`16` or `320`), a 4/4 measure always yields a ~`320px` bounding box, allowing the native VexFlow `Formatter` to comfortably justify the notes across the timeline.
