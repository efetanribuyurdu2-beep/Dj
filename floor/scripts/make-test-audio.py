"""Writes synthetic test tracks (click + bass tone) for the deck e2e test."""
import math, struct, sys, wave
def track(path, bpm, seconds=40, sr=44100, freq=55.0):
    beat = 60 / bpm
    n = int(sr * seconds)
    data = bytearray()
    for i in range(n):
        t = i / sr
        ph = t % beat
        kick = 0.7 * math.sin(2 * math.pi * 60 * ph) * math.exp(-ph / 0.03)
        hat = 0.08 * math.sin(2 * math.pi * 7000 * t) * math.exp(-((t + beat / 2) % beat) / 0.004)
        tone = 0.15 * math.sin(2 * math.pi * freq * t) + 0.08 * math.sin(2 * math.pi * freq * 2.4 * t)
        v = max(-1, min(1, kick + hat + tone))
        s = int(v * 30000)
        data += struct.pack('<hh', s, s)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(bytes(data))
out = sys.argv[1]
track(f"{out}/club-124.wav", 124)
track(f"{out}/warmup-120.wav", 120, freq=65.4)
