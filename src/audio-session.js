/** Select music output on iOS without preventing an explicit microphone take. */
export function setAudioSession(type) {
  const session = globalThis.navigator?.audioSession;
  if (!session) return false;
  try {
    session.type = type;
    return session.type === type;
  } catch {
    // Audio Session is optional; normal Web Audio still works without it.
    return false;
  }
}
