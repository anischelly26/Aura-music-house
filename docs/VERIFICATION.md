# AURA 0.3 verification

Verified on 1 October 2026 in Chromium 153 / SwiftShader. Software graphics validate behavior and layout; they do not establish hardware frame-rate or latency guarantees.

| Check | Result |
| --- | --- |
| Node schema, history, recipe, routing, phrase, WAV16/24, MIDI and ZIP checks | 14 passed |
| Actual offline audio routing, encoding and delay-tail checks | 10 passed |
| Live cinematic reaches the actual interactive gallery | Passed |
| Each of the 16 synthesis voices renders nonzero, finite audio | Passed |
| Insert addition, live parameter editing and audible shared playback graph | Passed |
| Chord insertion, arpeggiation and undo | Passed |
| 48 kHz / 24-bit stereo WAV and standard MIDI file downloads | Passed |
| Workbench at 390 px | Passed and visually inspected |
| All 81 new furniture-aware room routes | Passed with intermediate collision sampling |
| Physical piano note mapping | 88 individually interactive keys |

Screenshots are actual browser captures. Synthesized voices are not acoustic sample libraries. No connected generative model, native plugins, LUFS or true-peak measurement is claimed. Physical microphone/MIDI/controller devices and large-session scaling remain unverified.

| Additional completed check | Result |
| --- | --- |
| All eight inserts: finite audio, bypass equivalent to dry, measured saturation/high-pass behavior | Passed |
| Polyphonic held note and four-beat MIDI count-in capture | Passed |
| Decoded reference, full-render RMS trim and actual A/B audio gates | Passed |
| Audio import, real waveform, favorite, gain and reverse | Passed |
| Downloaded stem ZIP independently checked with Python zipfile | Valid CRCs; two stereo 24-bit WAVs with identical lengths plus MIDI |
| Previous-save recovery and restoration through UI | Passed |
| Monitor-only phone filter absent from offline render | Passed within 1e-7 RMS tolerance |
| Existing full edit / record / checkpoint / export journey | Passed; zero browser exceptions |
| Microphone decode, embedded take and input-resource release | Passed using browser fake microphone |
| Portable file playback, save/reload, synchronized house and graphics fallback | Passed; zero HTTP requests or browser exceptions |

Final desktop and 390 px layout check: workbench footer fully visible, Play & capture reaches the keyboard, zero browser exceptions.


## 0.3.1 ruthless review patch

The [current audit](audit-2026-10-01/AUDIT.md) supersedes broad quality interpretations of the earlier verification. Original 0.3 checks above remain historical results. This patch was verified in the actual cloud preview, a separate Chromium 153 renderer, real AudioContext/OfflineAudioContext probes and fake-device capture.

| Current check | Result |
| --- | --- |
| Unit regression suite | 19 passed |
| Atomic failed-edit rollback, synth bounds, identifier safety and UUID fallback | Passed |
| Focus after voice/effect parameter change and native Tab | Passed |
| Straight/diagonal movement ratio | 1.0000 |
| All 81 paths with revised furniture and destination poses | Passed; intermediate collision samples |
| Real keyboard walk and pointer look | Passed |
| Production background world renders | 0 in a 60-frame probe |
| Stereo cancellation metering | Active stereo correctly measures nonzero; correlation −1 |
| Stop transition PCM probe | Maximum adjacent step about 0.000442 vs 0.234 before |
| One-second loop PCM/clock probe | No scheduled restart gap; 3 near-zero samples vs 2,623 before |
| Sixteen voices and starter offline render | Finite nonzero audio; starter has 0 clipped samples |
| All eight inserts and bypass equivalence | Passed |
| Held notes and count-in MIDI capture | Passed |
| Reference headroom and dismiss-to-A gates | Passed |
| Forced quota failure and saved musical-data reload equality | Passed |
| Actual piano-roll draw/undo, command dialog and mobile Arrange | Passed |
| Microphone decode and insertion | Passed with browser fake device |
| Project/MIDI/master/two aligned stem downloads | Parsed independently; valid ZIP CRCs |
| Actual nine-room captures | Inspected; procedural art limitations remain |

No hardware FPS, physical-device latency, listening-panel sound-quality judgment, WCAG conformance, native plugin support, model-backed AI or professional mastering capability is established by these checks.
