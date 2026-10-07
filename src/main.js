import { Workbench } from "./workbench.js";
import { studio } from "./app.js";
import { MusicHouse } from "./house/house.js";
import { RecordingSession } from "./recording.js";
import { MusicCoach } from "./coach.js";
import { ChillGame } from "./chill-game.js";
import { Playback } from "./system/playback.js";
import { install } from "./world/install.js";

const faces = ['800 64px "Bricolage Grotesque"', 'italic 400 32px "Instrument Serif"', '500 16px "DM Mono"', '400 16px "DM Mono"'];

async function boot() {
  // Lettering in the world is drawn into textures, so the typefaces should exist first — but never wait long for them.
  try {
    await Promise.race([Promise.all(faces.map((face) => document.fonts.load(face))), new Promise((resolve) => setTimeout(resolve, 1800))]);
    window.auraFontsEarly = faces.every((face) => document.fonts.check(face));
  } catch {}
  const recording = new RecordingSession(studio.engine, (file) => studio.importAudio(file));
  const playback = new Playback(studio);
  window.aura.playback = playback;
  let house;
  try {
    house = new MusicHouse(studio, recording);
    house.playback = playback;
    window.aura.house = house;
    window.aura.recording = recording;
  } catch (error) {
    console.error(error);
    document.body.classList.remove("houseMode", "booting");
    document.body.classList.add("productionMode");
    document.querySelector("#gate").hidden = true;
    document.querySelector("#houseFallback").hidden = false;
    studio.toast("3D is unavailable on this device. The production tools remain available.");
  }
  window.aura.workbench = new Workbench(studio, house);
  window.aura.coach = new MusicCoach(studio, house);
  window.aura.game = new ChillGame(studio, house);
  if (house?.renderer) install(house);
  document.body.classList.remove("booting");
}
boot();
