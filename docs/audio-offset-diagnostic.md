# Measuring the H3 audio offset from existing files

Goal: measure objectively how far audio and picture are apart in an existing H3 result, with **no new generation, no GPU, no change to the 400 ms advance**.
Everything below runs locally on files you download from Studio (Original and Corrected buttons, short-lived signed links).

## 0. What the correction does (from the workflow)

`shift_audio` advances the audio by `audio_shift_s` (default 0.4 s, range 0 to 0.6) and drops the first `audio_shift_s` seconds of the audio track.
Original is kept untouched. One reference run validated 0.4 s. That is one scene, not a proof for every scene.

## 1. Check the correction itself (Original vs Corrected)

Needs only the two files of one run. Expected result: the Corrected audio is the Original audio moved earlier by about the configured value.

```powershell
ffprobe -v error -show_entries stream=codec_type,start_time,duration -of csv=p=0 original.mp4
ffprobe -v error -show_entries stream=codec_type,start_time,duration -of csv=p=0 corrected.mp4
ffmpeg -y -i original.mp4  -vn -ac 1 -ar 16000 original.wav
ffmpeg -y -i corrected.mp4 -vn -ac 1 -ar 16000 corrected.wav
```

```python
import numpy as np, scipy.io.wavfile as w, scipy.signal as s
(r, a), (_, b) = w.read("original.wav"), w.read("corrected.wav")
a, b = a.astype(float), b.astype(float)
n = min(len(a), len(b), 16000 * 8)
corr = s.correlate(a[:n], b[:n], mode="full", method="fft")
lag = (np.argmax(corr) - (n - 1)) / r          # seconds; positive: Corrected is earlier
print(f"Corrected audio starts {lag:.3f} s earlier than Original")
```

A value near 0.400 confirms the file was shifted as configured. It says nothing about whether picture and sound now match.

## 2. Measure picture/sound offset on one file (needs a visible and audible event)

Pick a moment with a sharp event that is both seen and heard (a clap, a door, a footstep, a cut to an impact). Speech is harder, see section 3.

1. Audio onset time: peak of the short-time energy.
   ```python
   import numpy as np, scipy.io.wavfile as w
   r, x = w.read("original.wav"); x = x.astype(float)
   hop = r // 100                                   # 10 ms
   e = np.array([np.sum(x[i:i+hop]**2) for i in range(0, len(x) - hop, hop)])
   onset = int(np.argmax(np.diff(np.log1p(e)))) * 0.01
   print("audio onset (s):", onset)
   ```
2. Visual event time: frame with the largest change.
   ```powershell
   ffmpeg -i original.mp4 -vf "select='gt(scene,0.2)',showinfo" -an -f null - 2>&1 | Select-String pts_time
   ```
3. Offset = audio onset minus visual event time. Repeat on 3 to 5 events and on both Original and Corrected. Report the median and the spread.

Limits: needs a clear event; generated videos often have none. Precision is about 20 to 40 ms (frame duration is 41.7 ms at 24 fps).

## 3. Speech (lip sync)

Use an open source lip-sync scorer (SyncNet family) locally on CPU. It returns an offset in frames and a confidence value. A low confidence means "no reliable measurement", not "no offset". This needs a new local tool and is not part of the repository.

## 4. How to read the results

- Offset measured on Original, then the same measure on Corrected: the difference should equal the configured advance. The remaining offset on Corrected is what the correction did not fix.
- Do it on several scenes (speech, impact, ambience). One scene only validates one scene.
- Only after several measurements should the default advance be reconsidered. This is a separate decision and a separate change.
