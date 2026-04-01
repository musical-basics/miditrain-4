import json
import math
import os

def detect_key(pitch_classes, algorithm='krumhansl'):
    if algorithm == 'krumhansl':
        major_profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
        minor_profile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    elif algorithm == 'temperley':
        # Temperley (1999) "Simple" profiles (aka CBMS)
        major_profile = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0]
        minor_profile = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0]
    else:
        return 'C', 0

    total = sum(pitch_classes)
    if total == 0: return 'C', 0
    pc = [p/total for p in pitch_classes]
    
    def pearson(x, y):
        mean_x = sum(x) / len(x)
        mean_y = sum(y) / len(y)
        num = sum((a - mean_x) * (b - mean_y) for a, b in zip(x, y))
        den = math.sqrt(sum((a - mean_x)**2 for a in x) * sum((b - mean_y)**2 for b in y))
        return num / den if den != 0 else 0

    max_corr = -1
    best_key = 'C'
    
    major_names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    
    for i in range(12):
        maj_p = major_profile[-i:] + major_profile[:-i]
        min_p = minor_profile[-i:] + minor_profile[:-i]
        
        corr_maj = pearson(pc, maj_p)
        corr_min = pearson(pc, min_p)
        
        if corr_maj > max_corr:
            max_corr = corr_maj
            best_key = major_names[i]
        if corr_min > max_corr:
            max_corr = corr_min
            best_key = major_names[(i+3)%12] # Simplified to relative major name for this test
            
    return best_key, max_corr

def test():
    p3b_path = '/Users/lionelyu/Documents/New Version/miditrain-3/visualizer/public/phase3b_quantized_chunk2_dissonance_hybrid_0.5.json'
    with open(p3b_path, 'r') as f:
        data = json.load(f)
    notes = [n for n in data.get('notes', []) if 'quantized' in n]
    pitch_classes = [0.0] * 12
    for n in notes:
        vel = n.get('velocity', 64) / 127.0
        dur = n.get('quantized', {}).get('duration_ticks', 1)
        pitch_classes[n['pitch'] % 12] += (vel * dur)

    k_key, k_corr = detect_key(pitch_classes, 'krumhansl')
    t_key, t_corr = detect_key(pitch_classes, 'temperley')
    
    print(f"Krumhansl-Schmuckler: {k_key} ({k_corr:.4f})")
    print(f"Temperley: {t_key} ({t_corr:.4f})")

if __name__ == "__main__":
    test()
