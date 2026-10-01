import { inScale, uid } from "./project.js";
/** Pure, deterministic theory assistance. It never implies model inference. */
export function harmonyRule(notes, project, density = 0.65, variation = 0) {
  const stride = Math.max(1, Math.round(1 / Math.max(0.15, density)));
  return notes
    .filter((_, i) => i % stride === 0)
    .map((n) => {
      let pitch = Math.max(0, n.pitch - (variation ? 7 : 4));
      while (pitch > 0 && !inScale(pitch, project)) pitch--;
      return {
        ...n,
        id: uid(),
        pitch,
        velocity: Math.max(0.01, n.velocity * 0.65),
      };
    });
}
/**
 * Future model-provider boundary. Implementations must send a bounded, explicit
 * project context to a trusted backend; never embed API keys in the browser.
 * Responses must contain evidence, confidence, limitations and structured edits.
 * Calling propose must not mutate project state; accepted edits use ProjectStore.
 */
export class AIProvider {
  get capabilities() {
    return { available: false, midi: false, mixAnalysis: false };
  }
  async propose(_request, _context, _signal) {
    throw new Error(
      "No model provider is connected. Local theory suggestions remain available.",
    );
  }
}
