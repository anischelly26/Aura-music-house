# AURA ruthless review — 1 October 2026

**Verdict: AURA is a functioning browser music prototype. It does not yet feel like a world-class music product.** Its clearest strengths are the playable instrument and rhythm concepts, reversible musical edits, and actual offline audio delivery. The house's scale, repeated procedural objects, flat materials, sparse composition, and abrupt change into a conventional editor undermine the premium promise. Operational trust defects were more serious than the visual defects.

This review froze feature expansion. Repairs target reproduced failures, movement, camera framing, readability, navigation, and audio/persistence correctness. A prettier screenshot does not establish professional sound, accessibility compliance, or hardware performance.

## What was actually exercised

- Opened the application in the cloud browser, clicked the editors and workbench, added EQ, changed parameters with keyboard input, played the starter and a local harmony preview, rejected the preview, and inspected screenshots and console output.
- Rendered the actual Three.js house in a separate Chromium 153 / SwiftShader QA browser. Captured and inspected all nine rooms, arrival, desktop editors, and 390 px layouts. Walked with real keyboard input and looked with real pointer drag; deterministic simulation also tested speed, smoothing, transitions, furniture and all 81 room routes.
- Used the real AudioContext and OfflineAudioContext. Measured all 16 voices, stereo cancellation, stop transitions, effect bypasses, reference headroom, and exported PCM. Played and captured held keyboard notes. Added all eight processors and saved/loaded their chain.
- Forced a browser-storage failure; saved and reloaded the musical project; drew MIDI with the pointer and undid it; used the command palette; recorded and decoded a browser fake microphone; downloaded project, MIDI, master WAV and stems. Independently parsed the downloads and checked ZIP CRCs.
- Exercised the existing “AI” interface: it produced a local diatonic harmony proposal, played its preview, and discarded it without adding notes. **No model provider is connected.** No native plugin host is present; the tested processors are Web Audio inserts.

The hosted private site required owner sign-in in this browser. The source app was exercised through the supported preview instead; access protection was preserved. The cloud browser disables WebGL, so spatial evidence comes from the isolated renderer. SwiftShader cold start was about nine seconds and baseline living-room median frame time was 1,750 ms; these are software-renderer observations, **not GPU or user-device benchmarks**. The first baseline “arrival” timing included a screenshot and is not an intro-duration measurement. Authored default arrival changed from 8.2 to 3.2 seconds; its real-time smoothness on hardware remains unverified.

No human listening panel, physical microphone, MIDI keyboard, trackpad, controller, headphones, speakers, or mobile hardware was available. Playback, waveform and numerical checks do not establish timbre, mix quality, mastering quality, room acoustics or motion comfort. A security regression check is not a penetration test. A 390 px desktop-browser viewport is not an iPhone/Android test.

## Walkthrough health

| Step | Outcome | Remaining barrier |
| --- | --- | --- |
| First 30 seconds / entry | Repaired startup failure; shorter default arrival and immediate skip | Weak loading feedback and a restrained but insufficiently distinctive introduction; hardware animation not established |
| Whole house | All nine rooms captured and inspected; concrete support, signage, shadow and framing defects repaired | Procedural asset quality, overscale rooms and weak composition |
| Movement | Equal straight/diagonal speed; smoothed look; added main-furniture collisions; 81 routes pass | Automated trips still turn at grid corners; physical trackpad/controller and comfort testing pending |
| Camera transitions | Removed hard final room-turn snap; piano and listening destinations reframed | No seated/docked immersive camera states for piano, synth, EQ, mixer or mastering |
| Navigation | Purpose-rich commands; room map; immersive travel plus Shift instant jumps; direct editor tabs | Two UI systems and incomplete discoverability; 3D object labels require proximity |
| Music / inserts / assistance | Real playback, all voices and eight processors, MIDI edits/capture and local harmony exercised | Synthesizer realism, advanced MIDI workflow, native plugins and model-backed AI remain absent |
| Storage / recovery | Failed edit rollback and honest save failures; save/reload equality verified | Large sessions still embed audio in project snapshots; prior recovery checks were not all repeated in this pass |
| Export / listening | Downloaded and independently validated project, MIDI, stereo PCM24 master and two aligned stems | No LUFS, true-peak, limiter or dither pipeline; no subjective mastering assessment |
| Performance / accessibility / security | Background world rendering removed; focus/native Tab repaired; imported identifiers bounded | Hardware load/latency, canvas keyboard editing, screen-reader equivalence and comprehensive security remain open |

## Reproduced defects and repairs

Severity reflects user harm, not how dramatic a screenshot looks. “Fixed” applies to the described reproduction and its retest, not every conceivable case.

| ID | Severity | Failure / consequence | Repair and evidence |
| --- | --- | --- | --- |
| T01 | Critical | `crypto.randomUUID()` was unavailable in the HTTP preview. Startup failed while visible controls remained inert; the same dependency broke processor/checkpoint IDs. | Shared UUID helper uses browser entropy when randomUUID is absent. Startup and Add EQ work in the cloud browser; schema/ID regression passes. |
| T02 | Critical | An edit could mutate the project, throw, and leave corrupted state with no undo entry. | Atomic rollback restores the snapshot and preserves undo/redo. Forced partial mutation and invalid parameter commits now roll back. |
| T03 | High | Imported voice parameters accepted a 16,000-second release. It could make rendering unusable. | Validate attack, release and brightness against the actual UI limits; reject unknown/invalid synth fields. |
| T04 | High | Imported identifiers could enter generated UI attributes; recovery IDs were not escaped. | Bound project/track/clip/asset identifiers and escape recovery attributes. Malicious identifier fixtures are rejected. This is a targeted injection repair. |
| T05 | High | Producer Lens told the starter's D-minor chord that its notes were outside D minor. It passed note objects rather than pitches into the scale check. | Inspect `note.pitch`; baseline notes now correctly report as fitting the scale. Verified in the actual browser. |
| T06 | High | Track meters and the spectrum summed stereo into mono. Opposite-polarity stereo appeared silent although the master output was active. | Analyze L/R energy independently and combine powers. A ±0.2, 1 kHz stereo probe now measures nonzero track RMS and a 1 kHz centroid while retaining correlation −1. |
| T07 | High | Stop could cut a nonzero signal abruptly. Early cleanup tied to wall time could precede an audio fade. | Explicit 12 ms gain fade, scheduled source stops, and graph disposal on the audio clock. Captured constant-signal maximum adjacent step fell from about 0.234 to 0.000442. This probe demonstrates the tested transition, not universal click-free playback. |
| T11 | High | Looping stopped and rebuilt playback with a fresh lead-in. The actual one-second loop probe measured about 59 ms and 2,623 silent boundary samples. | Schedule the next pass ahead on the existing graph, including automation and metronome. Retest: no scheduled restart gap and three near-zero samples in the same 7,056-sample boundary window. Heavy-load and musical-loop listening remain necessary. |
| T08 | High | Changing/closing reference views could leave B playing behind unrelated UI. | Return to A when leaving reference tools and on close; release preview/capture resources. Actual source and project-output gate checks pass. |
| T09 | High | Full-session RMS matching could boost a sparse high-peak reference beyond full scale. | Cap the reference trim by sample peak as well as the +12 dB limit; explain when exact RMS matching is constrained. Matched test reference remains ≤0.99 peak. This is sample-peak protection, not true-peak safety. |
| T10 | High | Save failures were swallowed; older writes could mark newer edits saved. | Serialize snapshot writes, compare project identity/revision, expose “Not saved,” and reject failed explicit saves. Forced quota failure and musical-data reload equality pass. Storage metadata timestamps are intentionally excluded from equality. |
| U01 | High | Workbench rerenders removed the focused slider after every edit. Keyboard users lost their position. | Restore corresponding focus and scroll after rerender; explicitly label controls. Actual change/Tab moves from Release to Brightness; delay-time focus also survives. |
| U02 | High | Global Tab switched views instead of traversing controls. | Native Tab is preserved; Ctrl/Cmd+Enter switches views. Canvas-focused Tab remains a spatial shortcut. |
| U03 | High | Arrange could retain the previous room's layout, hiding the arrangement. | Direct editor commands select the correct production room/layout. Timeline remains visible on desktop and at 390 px. |
| U04 | Medium | Switching tools could select a different track/clip or create an unwanted instrument. | Keep a compatible selected track/clip; use an existing fallback only when needed. |
| U05 | Medium | Command palette could stack on another modal; movement could continue behind editors. | Close the earlier modal; cancel travel and clear movement when opening tools. Verified one open command dialog from Workbench. |
| U06 | Medium | A physical console channel had an interaction label but no implemented handler. | Its action selects the actual channel in the precision mixer. It still does not provide a draggable 3D fader. |
| M01 | High | W+A traveled 41.4% faster than W alone. | Normalize combined directional/controller input. One-second deterministic distances now agree to numerical tolerance. |
| M02 | High | Mouse drag immediately changed camera orientation. Arrival at an instrument could impose a one-frame turn of about 108°. | Smooth look targets and blend into the destination pose before completing travel. Tested journey maximum turn is about 7.2° per 1/60-second simulation step. This is not a comfort rating. |
| M03 | High | Main benches, desks and seats could be walked through. | Add clearance bounds for seven primary furniture areas. Piano bench and recording desk reject occupancy; 81 destination paths pass intermediate samples. Smaller decorative props remain nonblocking. |
| M04 | Medium | Room trips retained velocity; a tool could resume travel unexpectedly after dismissal. | Reset motion at navigation and tool entry. Add explicit Shift+room instant travel alongside immersive journeys. |
| M05 | Medium | Listening-room chair blocked much of the default view. The revised pose initially rounded into blocked pathfinding space. | Reframe in front of the chair with enough grid clearance; all room destinations are reachable after the route retest. |
| V01 | Medium | Desks had unsupported slab silhouettes; a listening-room object floated without a support. | Add desk legs and a physical stem/base. Current room captures show grounded supports. |
| V02 | Medium | Large motto/voice signs collided with other labels/screens; double-sided signage appeared backwards through rooms; long lines clipped. | Move/remove overlapping signs, attach a smaller piano nameplate, use front-facing signs and fit text to its canvas. |
| V03 | Medium | Default piano framing hid useful keyboard context. | Bring the room pose closer to the actual keys. Precision tools still open instantly. |
| P01 | High | Production view kept rendering a hidden/blurred world; room screens/art also updated behind dialogs. | Suspend world rendering/updates when editors or dialogs obscure it; hide the world in production mode. Direct renderer-call probe verifies zero background world renders in production. |
| P02 | Medium | Nine room point lights were always active; balanced mode had no contact shadows. | Use the nearest three room lights, lower ambient fill, and cache a 1,024-pixel balanced shadow map. Full/performance choices remain. No FPS improvement is claimed without hardware measurement. |
| A01 | Medium | Spatial HUD and mobile editor tabs used very small labels/targets and weak contrast against the scene. | Increase selected HUD/control text and target sizes, strengthen HUD backing, and let mobile editor tabs scroll. Canvas notes and dense legacy controls still need redesign. |
| F01 | Medium | The default 8.2-second arrival delayed repeat use. | Make the 3.2-second arrival the default; preserve full, reduced and skip settings. No unnecessary soundtrack autoplay was added. |

All 19 unit tests pass. The unit suite includes five new regression tests for failed-edit safety, synth bounds, imported identifiers, UUID fallback and snapshot metadata independence. Existing functional tests remain in place. The added QA scripts preserve current measurements and reproducible browser workflows.

## Room assessment — no artificial scores

![Actual rooms after the focused repairs](rooms-reviewed.jpg)

| Room | Observed identity and function | What prevents a premium result | Highest priority |
| --- | --- | --- | --- |
| Entry gallery | A recognizable start, project art and saved-session concept | Large empty architectural volume, repetitive framing, procedural surfaces, limited practical first-use direction | Make the first composition legible at human scale; prioritize one obvious first musical action and genuine project history |
| Idea room | Desk, wall art, capture and recipe entry | One of the weakest rooms: excessive empty floor, slogan-led identity, minimal expressive or functional detail | Reduce wasted space; make capture and the last idea visibly central; replace decorative repetition with useful music artifacts |
| Instrument gallery | One of the clearest areas: visible piano, mapped keys, instrument tools | Grand-piano silhouette and materials remain simplified; not a convincing acoustic instrument or bespoke atelier | Faithful instrument/furniture proportions, richer material variation and a seated performance composition |
| Rhythm room | Circular pads communicate pattern and pulse | Physical installation handles only kick/snare/hat while precision tools expose eleven voices; oversized geometry and unclear step reading at distance | Stronger pattern hierarchy and tighter physical-to-editor consistency |
| Recording room | Booth, microphone, recording desk and take dialog | One of the weakest rooms: empty volume, thin glass/booth treatment, generic equipment and no visual account of practical recording/acoustic design | Redesign the functional recording arrangement and material treatment; expose take state without leaving the room |
| Arrangement hall | Song data actually appears on the large wall | Monumental board and bench dominate a sparse room; useful editing shifts to a different UI language | Bring the composition to a practical viewing distance and reduce decorative scale |
| Living / mixing room | Track sculptures map actual pan/send/energy; console opens real controls | Abstract rings and floating signal shapes compete with the mixer; not a fast professional mixing surface | Make the console the focal point; explain measured mappings and create clearer channel selection/state |
| Listening room | Speakers and actual signal/reference analysis provide a clear purpose | Original chair occlusion repaired, but speakers/materials remain simplistic; title promises exceed available mastering tools | Better listening composition and calibrated signal displays; honest naming and monitoring-state continuity |
| Export terrace | A recognizable destination and real export | Empty static horizon and sparse placement; environment overwhelms the deliverable task | Compose a human-scale export station with explicit completion and output state |

There is no evidence of excessive bloom or a random-neon aesthetic in these captures. Floating track sculptures and kinetic art are intentional; their competing hierarchy is the concern, not automatically a mesh bug. The room “acoustics” are not physically simulated, and no capture establishes actual acoustic quality. Lighting remains approximate despite shadow repairs. The strongest conceptual areas are instruments and rhythm. Idea capture and recording have the greatest mismatch between room area and useful identity.

![Piano and listening framing before and after](camera-comparison.png)

## Open issues that still block the product promise

| Priority | Issue | Evidence and next necessary work |
| --- | --- | --- |
| High | The house is visually a procedural prototype | Current room screenshots show repeated primitives, uniform roughness, sparse environments and oversized rooms. Needs a coherent asset/material/lighting/composition pass, followed by hardware captures; small geometry repairs cannot supply that. |
| High | Professional audio transport is incomplete | Structural edits rebuild playback at the current beat. Seeking, live editing, natural nonloop end and effect-tail behavior need sample-boundary tests under realistic load. No hardware latency/underrun budget has been established. |
| High | “Mastering” is presently analysis and export | Sample peak/RMS/correlation are real. LUFS, true peak, limiter, dither and calibrated loudness delivery are absent. No mastering quality conclusion follows from unclipped starter samples. |
| High | The editor is not yet accessible as a musical workspace | Canvas notes, clip selection and automation lack equivalent keyboard/screen-reader operations. Small 7–11 px canvas/legacy labels remain. Workbench focus fixes do not constitute WCAG conformance. |
| High | Large-session cost is unresolved | Audio is embedded in the project. History saves whole snapshots; undo optimization shares immutable encoded strings but checkpoint/storage copies remain. A 64-track ceiling is not a tested capacity guarantee. Need realistic sample-heavy load, memory and save-time profiling. |
| High | Instrument labels outpace realism | Voices render distinct finite audio, but are short oscillator/filter recipes. There are no acoustic piano/string/wind libraries or expressive articulations. Listening evaluation and calibrated gain/envelope work are required. |
| Medium | Immersive/professional transition lacks continuity | Room travel eases; opening an instrument, EQ or mixer changes straight to conventional panels. No true docked/seated camera states. Keep instant actions while designing short interruptible immersive framing. |
| Medium | Movement remains mechanically limited | Grid routes turn corners; furniture uses axis-aligned bounds, which can overblock diagonal/curved objects. No stairs exist in this house. Gamepad code is present but no controller was tested. Field of view and motion response need real-user comfort testing. |
| Medium | Light changes can still be perceptible | Room lighting selects nearby lights at room-state changes; no continuous exposure/light blend is established. Balanced shadows stay static for kinetic geometry; project edits now invalidate the shadow cache. Continuous animated shadows require full mode and hardware cost measurement. |
| Medium | Navigation uses two vocabularies | Room names, physical object labels, workbench tabs and precision editor tabs split attention. Purpose-rich search improves access but does not replace a first-use study. No sound-guidance system is present. |
| Medium | Local assistance has narrow capability | Local harmony and text recipes work within explicit rules. Arbitrary musical prompts, generative sound or mix interpretation are unavailable. Keep capability copy explicit; do not present recipes as intelligence. |
| Medium | Recording is not an overdub engine | Browser MediaRecorder capture inserts a take at beat zero, often from compressed audio. Fake-device capture verifies resource/decode flow; synchronized monitoring, latency compensation and real inputs were not established. |
| Medium | Insert UX remains elementary | Generic raw parameter names and sliders offer little producer context or metering. Reorder/add/remove can restart playback. These processors are not a native plugin system. |
| Medium | Small-screen precision is cramped | Arrange is visible and tabs are usable, but canvas precision, tiny note labels and scrolling across regions are still awkward. Hardware touch and orientation tests remain necessary. |
| Medium | Async operation lifecycle needs more stress | Export/reference measurements can finish after changing screens; new stale-result guards cover reference identity/revision, not every asynchronous operation. Test cancellation, rapid switching, quota exhaustion and long exports. |
| Medium | Security coverage is narrow | Identifier injection and parameter bounds are repaired. Corrupt/oversized encoded audio, prototype-like keys, local-storage preset corruption and all import paths deserve adversarial tests. No server or account penetration assessment was performed. |

## Measurements and deliverables

| Probe | Before | After |
| --- | --- | --- |
| W+A / W distance ratio over 60 × 1/60-second steps | 1.4142 | 1.0000 |
| Largest turn in tested gallery → instrument journey | 108.3° in one step | 7.2° in one step |
| Focus after voice/effect slider change | Lost to document | Corresponding replacement control |
| Partially mutating failed edit | “CORRUPTED,” no undo | Original project restored; undo/redo retained |
| Opposite-polarity stereo track | RMS 0, empty spectrum despite active stereo master | RMS ≈0.092; centroid ≈1,000 Hz; correlation −1 |
| Constant-signal stop maximum adjacent step | ≈0.234 | ≈0.000442 |
| One-second loop boundary | ≈59 ms restart gap; 2,623 near-zero samples | No scheduled gap; three near-zero samples |
| Main furniture route reachability | New collisions changed routes; initial listening destination failed | All 81 room pairs pass sampled collision checks |

Starter offline render: stereo 44.1 kHz, 19.843 seconds including tails, peak about −6.05 dBFS, RMS about −20.88 dBFS, crest 14.83 dB, correlation 0.995, zero samples at or above full scale. Its largest adjacent sample step is about 0.209; drum transients make that **insufficient evidence of a click**. No integrated loudness or true peak was measured.

The built 0.3.1 release passed the complete workflow with zero uncaught browser exceptions. The self-contained file also rendered audio, saved/reloaded, and made zero HTTP requests. The exercised workflow produced a valid six-track `.aura` project with one embedded recorded asset; a format-1 MIDI file; a 44.1 kHz, stereo, 24-bit master; and two stereo 24-bit stems with equal duration and valid ZIP CRCs. Download integrity does not prove musical correctness of every export setting.

Raw evidence: [baseline](before-measurements.json), [retest](after-measurements.json), [DSP and workflow](workflow-measurements.json), [download validation](export-validation.json), [keyboard/pointer/render verification](house-input-verification.json), [loop boundary](loop-measurements.json), and [portable release](portable-smoke.json). Actual browser captures and downloaded synthetic QA files are in this folder. The baseline source is commit `1a9ae64646204ae32b8805d891218bbd7c6f6666`.

## Repeating the checks

`npm test` runs the schema/history/encoding/routing regressions; `npm run build` builds the hosted static and portable releases. The optional browser scripts use Playwright from `CODEX_PRIMARY_RUNTIME_NODE_MODULES` and an existing browser selected by `AURA_CHROMIUM_PATH`. Run a localhost server in the same execution environment and execute `tools/ruthless-audit.cjs`, `tools/audit-dsp-workflow.cjs`, `tools/audit-house-verification.cjs`, and `tools/audit-loop.cjs`. `AURA_AUDIT_RUN=after AURA_AUDIT_SHORT=1` runs the movement/project/audio/workbench retest without repeating expensive software-GPU screenshots. The loop harness can enforce its repaired boundary with `AURA_ASSERT_LOOP=1`.

The right next phase is concentrated engineering and art refinement, with real musicians and hardware measurement. Adding more nominal rooms, voice names or decorative motion would leave the principal weaknesses intact.
