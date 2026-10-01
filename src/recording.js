/** Microphone capture is only requested by an explicit user action. Monitoring defaults off. */
export class RecordingSession extends EventTarget {
  constructor(engine, onTake) {
    super();
    this.engine = engine;
    this.onTake = onTake;
    this.active = false;
    this.seconds = 0;
    this.wave = new Float32Array(512);
    this.deviceId = "";
    this.inputGain = 1;
    this.monitor = false;
  }
  async start() {
    if (this.active || this.saving) return;
    if (typeof MediaRecorder === "undefined")
      throw Error("This browser does not support microphone recording.");
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Microphone capture requires localhost or an HTTPS page.");
    await this.engine.init();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.stream = stream;
    try {
      const ctx = this.engine.ctx;
      this.source = ctx.createMediaStreamSource(stream);
      this.gain = ctx.createGain();
      this.gain.gain.value = this.inputGain;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.destination = ctx.createMediaStreamDestination();
      this.source
        .connect(this.gain)
        .connect(this.analyser)
        .connect(this.destination);
      if (this.monitor) this.gain.connect(ctx.destination);
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((x) => MediaRecorder.isTypeSupported(x));
      this.recorder = new MediaRecorder(
        this.destination.stream,
        mime ? { mimeType: mime } : undefined,
      );
      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.onerror = (e) =>
        this.dispatchEvent(new CustomEvent("error", { detail: e.error }));
      this.started = performance.now();
      this.seconds = 0;
      this.active = true;
      this.recorder.start(250);
      this.timer = setInterval(() => {
        this.seconds = Math.floor((performance.now() - this.started) / 1000);
        this.analyser.getFloatTimeDomainData(this.wave);
        this.dispatchEvent(new Event("meter"));
        if (this.seconds >= 360) this.stop();
      }, 50);
      this.dispatchEvent(new Event("change"));
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }
  async stop() {
    if (!this.active || this.saving) return;
    this.active = false;
    this.saving = true;
    clearInterval(this.timer);
    this.dispatchEvent(new Event("change"));
    try {
      const recorder = this.recorder;
      await new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = (e) => reject(e.error);
        recorder.stop();
      });
      const mime = recorder.mimeType,
        blob = new Blob(this.chunks, { type: mime }),
        ext = mime.includes("mp4")
          ? "m4a"
          : mime.includes("ogg")
            ? "ogg"
            : "webm";
      this.cleanup();
      if (blob.size > 0)
        await this.onTake(
          new File(
            [blob],
            "Take-" +
              new Date().toISOString().slice(11, 19).replaceAll(":", "-") +
              "." +
              ext,
            { type: mime },
          ),
        );
    } finally {
      this.cleanup();
      this.saving = false;
      this.dispatchEvent(new Event("change"));
    }
  }

  setGain(value) {
    this.inputGain = value;
    if (this.gain)
      this.gain.gain.setTargetAtTime(value, this.engine.ctx.currentTime, 0.01);
  }
  setMonitor(value) {
    this.monitor = value;
    if (this.gain) {
      try {
        this.gain.disconnect(this.engine.ctx.destination);
      } catch {}
      if (value) this.gain.connect(this.engine.ctx.destination);
    }
  }
  cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    for (const n of [this.source, this.gain, this.analyser, this.destination])
      n?.disconnect();
    this.stream = null;
    this.source = null;
    this.gain = null;
    this.analyser = null;
    this.destination = null;
  }
  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (x) => x.kind === "audioinput",
    );
  }
}
