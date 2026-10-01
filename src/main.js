import { Workbench } from "./workbench.js";
import { studio } from "./app.js";
import { MusicHouse } from "./house/house.js";
import { RecordingSession } from "./recording.js";
import { MusicCoach } from "./coach.js";
import { ChillGame } from "./chill-game.js";
const recording = new RecordingSession(studio.engine, (file) =>
  studio.importAudio(file),
);
let house;
try {
  house = new MusicHouse(studio, recording);
  window.aura.house = house;
  window.aura.recording = recording;
} catch (error) {
  console.error(error);
  document.body.classList.remove("houseMode");
  document.body.classList.add("productionMode");
  document.querySelector("#arrival").hidden = true;
  document.querySelector("#houseFallback").hidden = false;
  studio.toast(
    "3D is unavailable on this device. The production tools remain available.",
  );
}

window.aura.workbench = new Workbench(studio, house);
window.aura.coach = new MusicCoach(studio, house);
window.aura.game = new ChillGame(studio, house);
