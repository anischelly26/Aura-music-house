# AURA 0.4.0 — learn, listen and play

The update adds a guided music coach, a silent living-room console game, and selected furniture/exterior assets from all five uploaded FBX packs. The nine-room music workflow remains connected to the same project and audio engine.

## Delivered behavior

- Learn is available from the house and production toolbars, room map, command palette and the idea-room tablet. Seven lessons cover pulse, melody, chords, bass, arrangement, mixing and export. Local questions are labeled as guided theory answers. Adding a practice phrase creates a separate undoable track; repeated clicks open that track. Reading, quizzes and project checks never modify music. Quiz progress survives reload on this device.
- Chill opens Sundown Rally from the living-room TV/console and navigation controls. Mouse, keyboard and touch move the paddle; Space pauses only the game. Missed balls return without a lives limit. The game stays silent and leaves the music transport running. Closing the dialog cancels its animation.
- The spacious interior supplies the lounge, the Japanese scene supplies the retro TV/books, the loft supplies a recording listening corner, the chair/window set becomes a reading nook, and the villa appears outside plus on the gallery display. Full imported room shells and environment spheres were removed to preserve navigation. Original uploads remain untouched.
- All converted assets together contain 30,188 triangles and 24 shared textures, capped at 1024 pixels. Asset payload is 5,274,942 bytes, versus roughly 255 MB in the supplied ZIPs. Assets are hosted locally and embedded in AURA.html for offline use.
- Screenshot review also repaired a clipped game footer, a window floating away from its wall, a villa above ground, a recording monitor facing away from the visitor, and a lounge too small for its surrounding furniture. The recording camera now frames both the working desk and the imported listening corner.

## Verification actually run

| Check | Result |
| --- | --- |
| Project/audio/learning/game/API tests | 23 passed |
| Loaded supplied model packs | 5/5; no model errors |
| Furniture-aware paths between room viewpoints | 81/81 |
| Actual pointer clicks on TV and coach tablet | Opened the correct dialogs |
| Practice-track reuse and project checks | One track after repeated clicks; existing parts preserved |
| Quiz progress and saved music after reload | Restored |
| Text containing HTML event handlers | Rendered as text; no execution |
| Music while opening, playing and pausing the game | Same live audio graph and origin; nonzero measured RMS |
| Desktop and 390-pixel mobile dialogs | No horizontal overflow; music controls visible |
| Portable local-file HTML | All five models loaded from embedded data; no model errors |
| Uncaught browser errors in final workflows | None |

The cloud browser was also used to open lessons, add a drum practice part, ask for melody guidance, and run the game while project playback was active. That browser lacks WebGL, so model screenshots and spatial input checks used a separate development QA browser with software WebGL. Hardware frame rate, physical controller response and listening through speakers/headphones have not been established by this run. The new game uses no audio graph; no mastering quality claim is made.

## AI connection status

Freeform model-backed chat is not connected in the published static version. Guided lessons and theory answers work now. The local server includes a server-only Responses API endpoint with explicit model configuration, bounded project summaries, request limits, origin checks, response escaping and timeouts. It does not send audio, asset data or project/track names, and it cannot make project edits. The provider boundary was tested with a response fixture, not a live AI provider.

The supported remaining step is to enable OpenAI Developers, obtain/configure an approved server secret, and deploy a Worker backend on this same Site. Sites hosting requires: “When the Site needs `OPENAI_API_KEY`, use the OpenAI Developers plugin's `openai-platform-api-key` skill with user approval and configure the key as a Site secret before deployment.” The key is never accepted in browser UI or committed to source. Static builds disable provider discovery until a hosted backend exists.

## Evidence

- [Workflow measurements](verification.json)
- [Physical interactions and offline verification](interactions-offline.json)
- [Asset hashes and selected meshes](../../assets/models/manifest.json)
- [Furnished living room](living-furnished.jpg)
- [Music coach](music-coach.jpg)
- [Sundown Rally with music playing](sundown-rally.jpg)
- [Mobile game](game-mobile.jpg)
