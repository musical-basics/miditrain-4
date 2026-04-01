from phase3_meter import MacroMeterEstimator

def test_final(path):
    e = MacroMeterEstimator(path)
    spike_times = sorted([r["start_time"] for r in e.regimes if r["state"] == "TRANSITION SPIKE!"])
    if e.regimes[0]["start_time"] not in spike_times: spike_times.insert(0, e.regimes[0]["start_time"])
    max_time = max(n["onset"] + n["duration"] for n in e.notes)
    BIN_MS = 50
    n_bins = max(2, int(max_time / BIN_MS) + 2)
    density = [0.0] * n_bins
    for t in spike_times:
        idx = int(t / BIN_MS)
        if 0 <= idx < n_bins:
            weight = 1.0 
            for n in e.notes:
                if abs(n["onset"] - t) <= 50:
                    dur_factor = max(0.5, min(n["duration"] / 1000.0, 2.0))
                    mass = (n["velocity"] / 127.0) * dur_factor
                    if n["voice_tag"] == "Voice 4": weight += mass * 3.0
                    elif n["voice_tag"] == "Voice 1": weight += mass * 1.5
                    else: weight += mass * 0.5
            
            # Squaring the weight effectively completes the Coherent Merge
            # by severely punishing bins that don't have heavy structural bass/melody.
            density[idx] += weight ** 2 

    tactus_ms = e._estimate_tactus([n["onset"] for n in e.notes])[1]
    
    # Optional constraint: require a musical measure to be at least 400ms (to skip 250ms sub-periods)
    # min_lag_bins = max(1, int(400 / BIN_MS)) 
    min_lag_bins = max(1, int(tactus_ms / BIN_MS))
    max_lag_bins = min(n_bins // 2, int(8000 / BIN_MS))
    n = len(density)

    autocorr = []
    for lag in range(min_lag_bins, max_lag_bins + 1):
        pairs = n - lag 
        if pairs <= 0: break
        raw = sum(density[i] * density[i + lag] for i in range(pairs))
        score = raw / pairs
        autocorr.append((lag * BIN_MS, score))

    scores = [s for _, s in autocorr]
    max_score = max(scores) if scores else 0
    NOISE_FLOOR = max_score * 0.25
    peaks = []
    for i in range(1, len(scores) - 1):
        if scores[i] > scores[i - 1] and scores[i] > scores[i + 1] and scores[i] > NOISE_FLOOR:
            peaks.append((autocorr[i][0], scores[i]))
            
    # Increased threshold to 0.75 so 250ms (which usually sits around 60-70%) is discarded
    significant = [(lag, s) for lag, s in peaks if s >= max_score * 0.75]
    if significant:
        best_lag_ms = min(significant, key=lambda x: x[0])[0]
    else:
        best_lag_ms = min(peaks, key=lambda x: x[0])[0]
        
    print(f"[{path.split('/')[-1]}] => BEST: {best_lag_ms}")
    for lag, s in autocorr:
        if lag in [250,500,1000,2000,2500]: print(f"  lag={lag} => {s/max_score*100:.1f}%")

test_final('visualizer/public/etme_chunk1_dissonance_hybrid_0.5.json')
test_final('visualizer/public/etme_pathetique_test_chunk2_dissonance_hybrid_0.5.json')
