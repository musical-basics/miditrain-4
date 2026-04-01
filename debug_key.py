import json
import math
import os

def krumhansl_schmuckler_debug(pitch_classes):
    major_profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    minor_profile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    
    total = sum(pitch_classes)
    if total == 0: return []
    pc = [p/total for p in pitch_classes]
    
    def pearson(x, y):
        mean_x = sum(x) / len(x)
        mean_y = sum(y) / len(y)
        num = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
        den = math.sqrt(sum((a - mean_x)**2 for a in x) * sum((b - mean_y)**2 for b in y))
        return num / den if den != 0 else 0

    results = []
    major_names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    
    for i in range(12):
        maj_p = major_profile[-i:] + major_profile[:-i]
        min_p = minor_profile[-i:] + minor_profile[:-i]
        
        corr_maj = pearson(pc, maj_p)
        corr_min = pearson(pc, min_p)
        
        results.append((major_names[i], corr_maj, "Major"))
        results.append((major_names[(i + 3) % 12] + "m", corr_min, "Minor"))
        
    results.sort(key=lambda x: x[1], reverse=True)
    return results

def debug():
    p3b_path = '/Users/lionelyu/Documents/New Version/miditrain-3/visualizer/public/phase3b_quantized_chunk2_dissonance_hybrid_0.5.json'
    if not os.path.exists(p3b_path):
        print(f"Error: {p3b_path} not found.")
        return

    with open(p3b_path, 'r') as f:
        data = json.load(f)
        
    notes = [n for n in data.get('notes', []) if 'quantized' in n]
    pitch_classes = [0.0] * 12
    for n in notes:
        vel = n.get('velocity', 64) / 127.0
        dur = n.get('quantized', {}).get('duration_ticks', 1)
        pitch_classes[n['pitch'] % 12] += (vel * dur)

    print("--- Pitch Class Histogram (Weighted) ---")
    note_names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    for i, val in enumerate(pitch_classes):
        print(f"{note_names[i]}: {val:.2f}")
    
    results = krumhansl_schmuckler_debug(pitch_classes)
    print("\n--- Correlation Results (Top 10) ---")
    for name, corr, type_ in results[:10]:
        print(f"{name} ({type_}): {corr:.4f}")

if __name__ == "__main__":
    debug()
