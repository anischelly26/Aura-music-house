import { harmonyRule } from "./ai.js";
import {
  ProjectStore,
  newProject,
  makeTrack,
  makeClip,
  presets, drumVoices,
  uid,
  noteName,
  inScale,
  scaleIntervals,
  validateProject,
} from "./project.js";
import {
  AudioEngine,
  projectBeats,
  encodeWav,
  automationValue,
} from "./audio.js";
import {
  saveProject,
  listProjects,
  download,
  portableProject,
  bytesToBase64,
} from "./storage.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const engine = new AudioEngine(),
  store = new ProjectStore(newProject());
let selectedTrack = store.project.tracks[0].id,
  selectedClip = store.project.tracks[0].clips[0].id,
  selectedNote = null,
  tab = "piano",
  zoom = 27,
  snap = true,
  category = "All",
  proposal = null,
  proposalIntensity = 0.65,
  toastTimer,
  saveTimer,
  dirty = false,
  drag = null,
  tapTimes = [];
const p = () => store.project,
  track = () => p().tracks.find((t) => t.id === selectedTrack),
  clip = () => track()?.clips.find((c) => c.id === selectedClip);
const db = (v) => (v <= 0.00001 ? "−∞" : (20 * Math.log10(v)).toFixed(1)),
  quant = (v) => (snap ? Math.round(v * 4) / 4 : v);
const commit = (label, fn) => store.commit(label, fn);
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3500);
  $("#footerMessage").textContent = message;
}
function safe(fn) {
  return (...args) => {
    const fail = (e) => {
      console.error(e);
      toast(e.message || "Something went wrong.");
    };
    try {
      return Promise.resolve(fn(...args)).catch(fail);
    } catch (e) {
      fail(e);
    }
  };
}
function validSelection() {
  if (!track()) {
    selectedTrack = p().tracks[0]?.id;
    selectedClip = null;
  }
  if (!clip()) selectedClip = track()?.clips[0]?.id;
  if (selectedNote && !clip()?.notes.some((n) => n.id === selectedNote))
    selectedNote = null;
}
function resizeCanvas(c, w, h) {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  c.width = Math.round(w * ratio);
  c.height = Math.round(h * ratio);
  c.style.width = w + "px";
  c.style.height = h + "px";
  const ctx = c.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
store.addEventListener("change", (e) => {
  dirty = true;
  $("#saveState").textContent = "Saving…";
  validSelection();
  proposal = null;
  render();
  if (
    /^(Change (gain|pan|eq|cutoff|reverb)|Master volume|Toggle compression|Change insert parameter|Bypass insert)/.test(
      e.detail,
    )
  ) {
    engine.p = p();
    engine.updateMix(p());
  } else engine.refresh(p()).catch((e) => toast(e.message));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch(() => {}), 600);
});
let saveQueue = Promise.resolve();
async function persist() {
  const snapshot = structuredClone(p()), revision = store.revision;
  try {
    const save = saveQueue.then(() => saveProject(snapshot));
    saveQueue = save.catch(() => {});
    await save;
    if (p().id === snapshot.id && store.revision === revision) {
      dirty = false;
      $("#saveState").textContent = "Saved locally";
    }
  } catch (e) {
    $("#saveState").textContent = "Not saved";
    toast(
      "Autosave failed. Download your portable project to keep this session.",
    );
    throw e;
  }
}
async function selectProject(project) {
  engine.stop();
  validateProject(project);
  await engine.loadAssets(project);
  store.replace(project);
  selectedTrack = p().tracks[0]?.id;
  selectedClip = track()?.clips[0]?.id;
  selectedNote = null;
  render();
  $("#hub").close();
  toast("Session opened");
}
function select(tid, cid = null) {
  selectedTrack = tid;
  selectedClip = cid || p().tracks.find((t) => t.id === tid)?.clips[0]?.id;
  selectedNote = null;
  proposal = null;
  render();
}
function addInstrument(id) {
  if (p().tracks.length >= 64)
    return toast("This release supports up to 64 tracks.");
  let t;
  commit("Add instrument", (proj) => {
    t = makeTrack(id, proj.tracks.length);
    t.clips.push(makeClip(id === "drums" ? "New groove" : "New phrase", 0, 4));
    proj.tracks.push(t);
  });
  select(t.id, t.clips[0].id);
  tab = id === "drums" ? "drums" : "piano";
  render();
  toast("Added " + t.name);
}
function toggleTrack(id, k) {
  commit(k === "mute" ? "Mute track" : "Solo track", (proj) => {
    const t = proj.tracks.find((t) => t.id === id);
    t[k] = !t[k];
  });
}
function render() {
  validSelection();
  $("#projectName").value = p().name;
  $("#bpm").value = p().bpm;
  $("#root").value = p().root;
  $("#scale").value = p().scale;
  $("#master").value = p().master;
  $("#masterDb").textContent = db(p().master) + " dB";
  $("#trackCount").textContent = p().tracks.length + " TRACKS";
  $("#arrangeDuration").textContent =
    Math.ceil(projectBeats(p()) / 4) + " BARS";
  $("#undo").disabled = !store.undoStack.length;
  $("#redo").disabled = !store.redoStack.length;
  $("#selectionLabel").textContent = track()
    ? track().name + " / " + (clip()?.name || "No clip")
    : "No track selected";
  renderTracks();
  drawTimeline();
  renderEditor();
  renderInspector();
  renderLens();
  updateTransport();
}
function renderLibrary() {
  const query = $("#soundSearch").value.toLowerCase();
  $("#categories").innerHTML = [
    "All",
    "Keys",
    "Synth",
    "Bass",
    "Pads",
    "Drums",
    "Plucks",
  ]
    .map(
      (c) =>
        `<button class="${category === c ? "active" : ""}" data-category="${c}">${c}</button>`,
    )
    .join("");
  $("#presetList").innerHTML =
    presets
      .filter(
        (s) =>
          (category === "All" || s.category === category) &&
          (s.name + " " + s.category + " " + s.tags)
            .toLowerCase()
            .includes(query),
      )
      .map(
        (s) =>
          `<div class="preset" style="--preset:${s.color}"><div class="presetIcon">${s.id === "drums" ? "▦" : s.id === "keys" ? "▥" : "⌁"}</div><button class="presetPreview" data-preview="${s.id}" aria-label="Preview ${s.name}">▶</button><div class="presetText" data-add="${s.id}" title="${s.description}"><strong>${s.name}</strong><small>${s.category} / ${s.tags.split(" ")[0]}</small></div><button class="presetAdd" data-add="${s.id}" aria-label="Add ${s.name}">＋</button></div>`,
      )
      .join("") || '<p class="emptyEditor">No matching sounds.</p>';
  $$("[data-category]").forEach(
    (b) =>
      (b.onclick = () => {
        category = b.dataset.category;
        renderLibrary();
      }),
  );
  $$("[data-add]").forEach(
    (b) => (b.onclick = () => addInstrument(b.dataset.add)),
  );
  $$("[data-preview]").forEach(
    (b) =>
      (b.onclick = safe(() =>
        engine.audition(
          makeTrack(b.dataset.preview),
          b.dataset.preview === "drums"
            ? 36
            : b.dataset.preview === "bass"
              ? 38
              : 62,
        ),
      )),
  );
}
function renderTracks() {
  $("#trackRows").innerHTML = p()
    .tracks.map(
      (t, i) =>
        `<div class="trackRow ${t.id === selectedTrack ? "selected" : ""}" style="--trackColor:${t.color}" data-track="${t.id}"><button class="trackName" data-select="${t.id}">${String(i + 1).padStart(2, "0")} &nbsp; ${esc(t.name)}</button><small>${t.instrument === "audio" ? "Audio sample" : t.instrument === "drums" ? "Drum instrument" : "MIDI instrument"}</small><div class="trackTools"><button data-mute="${t.id}" class="${t.mute ? "active" : ""}" aria-label="Mute ${esc(t.name)}" aria-pressed="${t.mute}">M</button><button data-solo="${t.id}" class="${t.solo ? "active" : ""}" aria-label="Solo ${esc(t.name)}" aria-pressed="${t.solo}">S</button><div class="trackMiniMeter"><i data-mini-meter="${t.id}"></i></div></div></div>`,
    )
    .join("");
  $$("[data-select]").forEach(
    (b) => (b.onclick = () => select(b.dataset.select)),
  );
  $$("[data-mute]").forEach(
    (b) => (b.onclick = () => toggleTrack(b.dataset.mute, "mute")),
  );
  $$("[data-solo]").forEach(
    (b) => (b.onclick = () => toggleTrack(b.dataset.solo, "solo")),
  );
}
function drawTimeline() {
  const c = $("#timeline"),
    vp = $("#timelineViewport"),
    beats = projectBeats(p());
  const w = Math.max(vp.clientWidth, beats * zoom + 45),
    h = Math.max(vp.clientHeight, p().tracks.length * 65 + 70),
    ctx = resizeCanvas(c, w, h);
  ctx.fillStyle = "#13141b";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "9px Segoe UI";
  ctx.textBaseline = "middle";
  for (let b = 0; b <= Math.ceil(w / zoom); b++) {
    const x = b * zoom;
    ctx.strokeStyle =
      b % 4 === 0 ? "#343440" : b % 1 === 0 ? "#23242e" : "#1d1e27";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 24);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    if (b % 4 === 0) {
      ctx.fillStyle = "#84899f";
      ctx.fillText(String(b / 4 + 1).padStart(2, "0"), x + 7, 16);
    }
  }
  const sections = [
    ["INTRO", 0],
    ["MOTION", 8],
    ["OPENING", 16],
    ["RETURN", 24],
  ];
  for (const [name, b] of sections) {
    if (b >= beats) continue;
    ctx.fillStyle = b === 0 ? "#aaa7ff13" : "#1b1c26";
    ctx.fillRect(
      b * zoom,
      26,
      Math.min(8 * zoom, beats * zoom - b * zoom) - 1,
      21,
    );
    ctx.fillStyle = "#6f7189";
    ctx.font = "7px Segoe UI";
    ctx.fillText(name, b * zoom + 8, 37);
  }
  for (let i = 0; i < p().tracks.length; i++) {
    const t = p().tracks[i],
      y = 48 + i * 65;
    ctx.fillStyle =
      t.id === selectedTrack ? "#aaa7ff03" : i % 2 ? "#ffffff01" : "#0000";
    ctx.fillRect(0, y, w, 65);
    ctx.strokeStyle = "#252630";
    ctx.beginPath();
    ctx.moveTo(0, y + 64.5);
    ctx.lineTo(w, y + 64.5);
    ctx.stroke();
    for (const cl of t.clips) {
      const x = cl.start * zoom,
        cw = cl.length * zoom - 3,
        ch = 47,
        cy = y + 9;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 2, cy, cw, ch, 4);
      ctx.clip();
      ctx.fillStyle = t.color + "20";
      ctx.fillRect(x + 2, cy, cw, ch);
      ctx.fillStyle = t.color + "25";
      ctx.fillRect(x + 2, cy, cw, 14);
      ctx.fillStyle = t.color;
      ctx.font = "8px Segoe UI";
      ctx.fillText(cl.name, x + 9, cy + 8, Math.max(1, cw - 20));
      ctx.globalAlpha = t.mute ? 0.3 : 1;
      if (cl.asset) {
        const a = p().assets[cl.asset],
          peaks = a?.peaks || [];
        ctx.strokeStyle = t.color + "a0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let px = 0; px < cw - 10; px += 2) {
          const frac =
              ((cl.offset || 0) + ((px / zoom) * 60) / p().bpm) /
              (a?.duration || 1),
            amp =
              peaks[
                Math.min(peaks.length - 1, Math.floor(frac * peaks.length))
              ] || 0;
          ctx.moveTo(x + 7 + px, cy + 31 - amp * 12);
          ctx.lineTo(x + 7 + px, cy + 31 + amp * 12);
        }
        ctx.stroke();
      } else {
        const notes = cl.notes,
          lo = Math.min(...notes.map((n) => n.pitch), 48),
          hi = Math.max(...notes.map((n) => n.pitch), 84);
        for (const n of notes) {
          if (n.start >= cl.length) continue;
          ctx.fillStyle = t.color + "ae";
          const ny = cy + 20 + ((hi - n.pitch) / (hi - lo || 1)) * 20;
          ctx.fillRect(
            x + 6 + n.start * zoom,
            ny,
            Math.max(2, Math.min(n.duration, cl.length - n.start) * zoom - 2),
            2,
          );
        }
      }
      ctx.restore();
      ctx.strokeStyle =
        cl.id === selectedClip ? t.color + "e0" : t.color + "50";
      ctx.lineWidth = cl.id === selectedClip ? 1.3 : 1;
      ctx.beginPath();
      ctx.roundRect(x + 2, cy, cw, ch, 4);
      ctx.stroke();
      if (cl.id === selectedClip) {
        ctx.fillStyle = t.color + "a0";
        ctx.fillRect(x + cw - 3, cy + 18, 2, 12);
      }
    }
  }
  $("#playhead").style.height = h - 24 + "px";
  updatePlayhead();
}
function timelinePos(e) {
  const r = $("#timeline").getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function timelineHit(x, y) {
  const i = Math.floor((y - 48) / 65),
    t = p().tracks[i];
  if (!t) return {};
  const c = t.clips.find(
    (c) => x >= c.start * zoom + 2 && x <= (c.start + c.length) * zoom - 1,
  );
  return { t, c, i };
}
$("#timeline").onpointerdown = (e) => {
  const { x, y } = timelinePos(e);
  if (y < 48) {
    engine.seek(p(), quant(x / zoom)).catch((e) => toast(e.message));
    return;
  }
  const { t, c } = timelineHit(x, y);
  if (!t) return;
  if (!c) {
    select(t.id);
    return;
  }
  selectedTrack = t.id;
  selectedClip = c.id;
  selectedNote = null;
  proposal = null;
  renderInspector();
  renderLens();
  renderTracks();
  renderEditor();
  drawTimeline();
  drag = {
    kind: "clip",
    id: c.id,
    track: t.id,
    start: c.start,
    length: c.length,
    x,
    resize: x > (c.start + c.length) * zoom - 12,
    original: structuredClone(p()),
  };
  $("#timeline").setPointerCapture(e.pointerId);
};
$("#timeline").onpointermove = (e) => {
  if (!drag || drag.kind !== "clip") return;
  const { x } = timelinePos(e),
    c = clip(),
    delta = (x - drag.x) / zoom;
  if (!c) return;
  if (drag.resize)
    c.length = Math.max(
      0.25,
      Math.min(256 - c.start, quant(drag.length + delta)),
    );
  else
    c.start = Math.max(0, Math.min(256 - c.length, quant(drag.start + delta)));
  drawTimeline();
};
function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.original) {
    const changed = JSON.stringify(d.original) !== JSON.stringify(p());
    if (changed) {
      const after = structuredClone(p());
      store.project = d.original;
      commit(
        d.kind === "clip"
          ? d.resize
            ? "Resize clip"
            : "Move clip"
          : "Edit note",
        () => {
          store.project = after;
        },
      );
    } else render();
  }
}
$("#timeline").onpointerup = endDrag;
$("#timeline").onpointercancel = () => {
  if (drag?.original) {
    store.project = drag.original;
    drag = null;
    render();
  }
};
$("#timeline").ondblclick = (e) => {
  const { x, y } = timelinePos(e),
    { t, c } = timelineHit(x, y);
  if (!t) return;
  if (c) {
    select(t.id, c.id);
    tab = t.instrument === "drums" ? "drums" : "piano";
    renderEditor();
    return;
  }
  if (t.instrument === "audio")
    return toast("Import an audio file to create an audio clip.");
  let cl;
  commit("Create clip", () => {
    cl = makeClip(
      t.instrument === "drums" ? "New groove" : "New phrase",
      Math.max(0, Math.floor(x / zoom / 4) * 4),
      4,
    );
    t.clips.push(cl);
  });
  select(t.id, cl.id);
};
$("#timeline").onwheel = (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoom = Math.min(96, Math.max(12, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    drawTimeline();
  }
};
$("#timelineViewport").onscroll = () => {
  $("#trackRows").style.transform =
    `translateY(-${$("#timelineViewport").scrollTop}px)`;
  $("#addTrackRow").style.transform =
    `translateY(-${$("#timelineViewport").scrollTop}px)`;
};
function duplicateClip() {
  const c = clip();
  if (!c) return;
  const nc = structuredClone(c);
  nc.id = uid();
  nc.start = c.start + c.length;
  nc.notes.forEach((n) => (n.id = uid()));
  if (nc.start + nc.length > 256)
    return toast("Maximum timeline length reached.");
  commit("Duplicate clip", () => track().clips.push(nc));
  select(selectedTrack, nc.id);
}
function splitClip() {
  const c = clip();
  if (!c) return;
  const at = quant(engine.beat) - c.start;
  if (at <= 0 || at >= c.length)
    return toast("Seek inside the selected clip, then split.");
  commit("Split clip", () => {
    const right = {
      ...structuredClone(c),
      id: uid(),
      start: c.start + at,
      length: c.length - at,
      notes: [],
    };
    right.offset = (c.offset || 0) + (at * 60) / p().bpm;
    right.notes = c.notes
      .filter((n) => n.start + n.duration > at)
      .map((n) => ({
        ...n,
        id: uid(),
        start: Math.max(0, n.start - at),
        duration: n.start < at ? n.duration - (at - n.start) : n.duration,
      }));
    c.notes = c.notes
      .filter((n) => n.start < at)
      .map((n) => ({ ...n, duration: Math.min(n.duration, at - n.start) }));
    c.length = at;
    track().clips.push(right);
  });
}
function removeSelection() {
  const c = clip();
  if (!c) return;
  if (selectedNote) {
    commit(
      "Delete note",
      () => (c.notes = c.notes.filter((n) => n.id !== selectedNote)),
    );
    selectedNote = null;
  } else
    commit(
      "Delete clip",
      () => (track().clips = track().clips.filter((x) => x.id !== c.id)),
    );
}
function renderEditor() {
  $$("[data-tab]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab),
  );
  const ed = $("#editor");
  if (tab === "mixer") {
    renderMixer();
    return;
  }
  if (tab === "map") {
    ed.innerHTML =
      '<div class="editorToolbar"><span>MIX MAP / stereo position × MIDI register</span><span>Size = measured RMS during playback</span></div><canvas id="mixMap"></canvas><div class="mapLegend">MIDI register is note metadata, not a spectral measurement. Audio samples sit in the unpitched band.</div>';
    drawMap();
    return;
  }
  if (tab === "automation") {
    renderAutomation();
    return;
  }
  if (tab === "drums") {
    renderDrums();
    return;
  }
  const c = clip(),
    t = track();
  if (!c || !t) {
    ed.innerHTML =
      '<div class="emptyEditor"><strong>A place for your next phrase.</strong>Add an instrument or double-click an empty track lane to create a clip.</div>';
    return;
  }
  if (t.instrument === "audio") {
    ed.innerHTML = `<div class="editorToolbar"><span>AUDIO / ${esc(c.name)}</span><span>Drag in the arrangement to trim or move</span></div><canvas id="audioDetail"></canvas><div class="automationHelp">Original audio remains unchanged. Clip duration and offset control playback.</div>`;
    drawAudioDetail();
    return;
  }
  if (t.instrument === "drums") {
    tab = "drums";
    renderEditor();
    return;
  }
  ed.innerHTML = `<div class="editorToolbar"><span>${esc(c.name)} <small> / ${c.length} BEATS · ${c.notes.length} NOTES</small></span><div><button id="quantizeNotes">Quantize</button><button id="humanizeNotes">Humanize</button><button id="harmonize">✧ Harmony</button></div></div><div class="pianoLayout"><div class="pianoKeys">${Array.from(
    { length: 25 },
    (_, i) => {
      const n = pianoTop() - i;
      return `<button class="key ${[1, 3, 6, 8, 10].includes(n % 12) ? "black" : ""} ${n % 12 === p().root ? "root" : ""}" data-key="${n}" aria-label="Play ${noteName(n)}">${n % 12 === 0 || n % 12 === p().root ? noteName(n) : ""}</button>`;
    },
  ).join(
    "",
  )}</div><div class="pianoScroll"><canvas id="piano" tabindex="0" aria-label="Piano roll. Double-click to draw notes, drag to move, drag right edge to resize, Delete to remove."></canvas></div></div><div class="noteVelocity"><span>VELOCITY</span><input id="velocity" type="range" min=".05" max="1" step=".01" aria-label="Selected note velocity" value="${c.notes.find((n) => n.id === selectedNote)?.velocity || 0.65}" ${selectedNote ? "" : "disabled"}><span id="velocityValue">${selectedNote ? Math.round(c.notes.find((n) => n.id === selectedNote)?.velocity * 100) + "%" : "Select a note"}</span><small>Double-click to draw · Drag to move · Right edge to resize · Right-click to delete</small></div>`;
  drawPiano();
  $$("[data-key]").forEach(
    (b) =>
      (b.onpointerdown = safe(() => engine.audition(t, Number(b.dataset.key)))),
  );
  $("#quantizeNotes").onclick = () =>
    commit("Quantize notes", () =>
      c.notes.forEach((n) => {
        n.start = Math.min(c.length - 0.25, Math.round(n.start * 4) / 4);
        n.duration = Math.max(0.25, Math.round(n.duration * 4) / 4);
      }),
    );
  $("#humanizeNotes").onclick = () =>
    commit("Humanize notes", () =>
      c.notes.forEach((n, i) => {
        n.start = Math.min(
          Math.max(0, c.length - n.duration),
          Math.max(0, n.start + Math.sin(i * 8.13) * 0.025),
        );
        n.velocity = Math.min(
          1,
          Math.max(0.05, n.velocity + Math.cos(i * 3.37) * 0.05),
        );
      }),
    );
  $("#harmonize").onclick = () => suggestHarmony();
  $("#velocity").oninput = (e) => {
    $("#velocityValue").textContent = Math.round(e.target.value * 100) + "%";
  };
  $("#velocity").onchange = (e) =>
    commit("Note velocity", () => {
      const n = c.notes.find((n) => n.id === selectedNote);
      if (n) n.velocity = Number(e.target.value);
    });
  bindPiano();
}
const pianoTop = () => {
  const notes = clip()?.notes || [];
  return Math.max(
    36,
    Math.min(
      120,
      Math.ceil(
        Math.max(
          ...notes.map((n) => n.pitch),
          track()?.instrument === "bass" ? 48 : 72,
        ) / 12,
      ) * 12,
    ),
  );
};
const pianoScale = () => Math.max(44, Math.min(76, zoom * 1.8));
function drawPiano() {
  const cv = $("#piano"),
    c = clip();
  if (!cv || !c) return;
  const z = pianoScale(),
    w = Math.max($(".pianoScroll").clientWidth, c.length * z),
    h = 25 * 15,
    ctx = resizeCanvas(cv, w, h);
  ctx.fillStyle = "#171820";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 25; i++) {
    const n = pianoTop() - i,
      y = i * 15;
    ctx.fillStyle = inScale(n, p()) ? "#aaa7ff07" : "#090a1040";
    ctx.fillRect(0, y, w, 15);
    ctx.strokeStyle = n % 12 === 0 ? "#41414f" : "#2a2c37";
    ctx.beginPath();
    ctx.moveTo(0, y + 14.5);
    ctx.lineTo(w, y + 14.5);
    ctx.stroke();
  }
  for (let b = 0; b <= w / z; b += 0.25) {
    ctx.strokeStyle =
      b % 4 === 0 ? "#42424f" : Number.isInteger(b) ? "#30323e" : "#232530";
    ctx.beginPath();
    ctx.moveTo(b * z + 0.5, 0);
    ctx.lineTo(b * z + 0.5, h);
    ctx.stroke();
  }
  for (const n of c.notes) {
    const x = n.start * z,
      y = (pianoTop() - n.pitch) * 15;
    if (y < 0 || y >= h) continue;
    ctx.fillStyle = track().color + (n.id === selectedNote ? "ff" : "a5");
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 2, Math.max(4, n.duration * z - 2), 11, 2);
    ctx.fill();
    ctx.fillStyle = "#13131c";
    ctx.font = "7px Segoe UI";
    if (n.duration * z > 32) ctx.fillText(noteName(n.pitch), x + 5, y + 10);
    if (n.id === selectedNote) {
      ctx.fillStyle = "#fff9";
      ctx.fillRect(x + n.duration * z - 5, y + 4, 2, 6);
    }
  }
  if (proposal?.kind === "harmony" && proposal.clipId === c.id) {
    ctx.strokeStyle = "#d0c2ffa0";
    ctx.setLineDash([3, 3]);
    for (const n of proposal.notes) {
      const y = (pianoTop() - n.pitch) * 15;
      if (y < 0 || y >= h) continue;
      ctx.fillStyle = "#bcb0ff14";
      ctx.fillRect(n.start * z + 1, y + 2, n.duration * z - 2, 11);
      ctx.strokeRect(n.start * z + 1, y + 2, n.duration * z - 2, 11);
    }
    ctx.setLineDash([]);
  }
}
function bindPiano() {
  const cv = $("#piano");
  const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    hit = (x, y) =>
      clip().notes.find(
        (n) =>
          x >= n.start * pianoScale() &&
          x <= (n.start + n.duration) * pianoScale() &&
          Math.floor(y / 15) === pianoTop() - n.pitch,
      );
  cv.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const { x, y } = pos(e),
      n = hit(x, y);
    selectedNote = n?.id || null;
    if (n) {
      drag = {
        kind: "note",
        id: n.id,
        start: n.start,
        pitch: n.pitch,
        duration: n.duration,
        x,
        y,
        resize: x > (n.start + n.duration) * pianoScale() - 8,
        original: structuredClone(p()),
      };
      cv.setPointerCapture(e.pointerId);
      engine.audition(track(), n.pitch).catch((e) => toast(e.message));
    }
    drawPiano();
    renderInspector();
    const v = $("#velocity");
    v.disabled = !n;
    v.value = n?.velocity || 0.65;
    $("#velocityValue").textContent = n
      ? Math.round(n.velocity * 100) + "%"
      : "Select a note";
  };
  cv.onpointermove = (e) => {
    if (!drag || drag.kind !== "note") return;
    const { x, y } = pos(e),
      n = clip().notes.find((n) => n.id === drag.id);
    if (!n) return;
    if (drag.resize)
      n.duration = Math.max(
        0.25,
        Math.min(
          clip().length - n.start,
          quant(drag.duration + (x - drag.x) / pianoScale()),
        ),
      );
    else {
      n.start = Math.max(
        0,
        Math.min(
          clip().length - n.duration,
          quant(drag.start + (x - drag.x) / pianoScale()),
        ),
      );
      n.pitch = Math.min(
        pianoTop(),
        Math.max(pianoTop() - 24, drag.pitch - Math.round((y - drag.y) / 15)),
      );
    }
    drawPiano();
    drawTimeline();
  };
  cv.onpointerup = endDrag;
  cv.onpointercancel = () => {
    if (drag?.original) {
      store.project = drag.original;
      drag = null;
      render();
    }
  };
  cv.ondblclick = (e) => {
    const { x, y } = pos(e);
    if (hit(x, y)) return;
    const start = Math.max(0, quant(x / pianoScale()));
    if (start >= clip().length) return;
    const n = {
      id: uid(),
      pitch: Math.min(
        pianoTop(),
        Math.max(pianoTop() - 24, pianoTop() - Math.floor(y / 15)),
      ),
      start,
      duration: Math.min(0.5, clip().length - start),
      velocity: 0.65,
    };
    selectedNote = n.id;
    commit("Draw note", () => clip().notes.push(n));
    engine.audition(track(), n.pitch).catch((e) => toast(e.message));
  };
  cv.oncontextmenu = (e) => {
    e.preventDefault();
    const { x, y } = pos(e),
      n = hit(x, y);
    if (n)
      commit(
        "Delete note",
        () => (clip().notes = clip().notes.filter((x) => x.id !== n.id)),
      );
  };
}
function renderDrums() {
  const ed = $("#editor");
  if (track()?.instrument !== "drums") {
    ed.innerHTML =
      '<div class="emptyEditor"><strong>Give your idea a pulse.</strong>Select a drum track, or add Circuit drums.<br><button id="addDrums">＋ Add drum machine</button></div>';
    $("#addDrums").onclick = () => addInstrument("drums");
    return;
  }
  const c = clip();
  if (!c) {
    ed.innerHTML =
      '<div class="emptyEditor">Double-click an empty lane to add a drum clip.</div>';
    return;
  }
  ed.innerHTML = `<div class="editorToolbar"><span>${esc(c.name)} / FIRST 4 BEATS · 16 STEPS</span><button id="fillDrums">Four-on-the-floor</button></div><div class="drumGrid"><div class="drumNumbers"><span></span>${Array.from({ length: 16 }, (_, i) => `<span>${String(i + 1).padStart(2, "0")}</span>`).join("")}</div>${drumVoices
    .map(
      ([name, pitch]) =>
        `<div class="drumRow"><button data-drum-key="${pitch}">${name}</button>${Array.from({ length: 16 }, (_, i) => `<button class="step ${c.notes.some((n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05) ? "on" : ""}" data-step="${i}" data-pitch="${pitch}" aria-label="${name} step ${i + 1}" aria-pressed="${c.notes.some((n) => n.pitch === pitch && Math.abs(n.start - i / 4) < 0.05)}"></button>`).join("")}</div>`,
    )
    .join(
      "",
    )}<div class="swingControl"><span>SWING</span><input id="swing" type="range" min="0" max="1" step=".01" value="${p().swing}" aria-label="Drum swing"><span>${Math.round(p().swing * 100)}%</span><small>Applies to offbeat 16th notes</small></div></div>`;
  $$("[data-step]").forEach(
    (b) =>
      (b.onclick = () => {
        const start = Number(b.dataset.step) / 4,
          pitch = Number(b.dataset.pitch),
          old = c.notes.find(
            (n) => n.pitch === pitch && Math.abs(n.start - start) < 0.05,
          );
        commit("Toggle drum step", () => {
          if (old) c.notes = c.notes.filter((n) => n.id !== old.id);
          else
            c.notes.push({
              id: uid(),
              pitch,
              start,
              duration: 0.15,
              velocity: pitch === 36 ? 0.85 : pitch === 38 ? 0.7 : 0.45,
            });
        });
        if (!old)
          engine.audition(track(), pitch).catch((e) => toast(e.message));
      }),
  );
  $$("[data-drum-key]").forEach(
    (b) =>
      (b.onclick = safe(() =>
        engine.audition(track(), Number(b.dataset.drumKey)),
      )),
  );
  $("#swing").onchange = (e) =>
    commit("Change swing", (proj) => (proj.swing = Number(e.target.value)));
  $("#fillDrums").onclick = () =>
    commit("Fill drum pattern", () => {
      c.notes = c.notes.filter((n) => n.start >= 4);
      for (let i = 0; i < 16; i++) {
        for (const pitch of [36, 38, 42])
          if (
            (pitch === 36 && i % 4 === 0) ||
            (pitch === 38 && (i === 4 || i === 12)) ||
            (pitch === 42 && i % 2 === 0)
          )
            c.notes.push({
              id: uid(),
              pitch,
              start: i / 4,
              duration: 0.15,
              velocity: pitch === 42 ? 0.45 : 0.8,
            });
      }
    });
}
function renderMixer() {
  const ed = $("#editor");
  ed.innerHTML = `<div class="editorToolbar"><span>MIXER / post-fader peak meters</span><span>Channel faders + pan · Select a track for effects</span></div><div class="mixer">${p()
    .tracks.map(
      (t) =>
        `<div class="channel" style="--channel:${t.color}"><button class="channelName" data-channel="${t.id}">${esc(t.name)}</button><span class="channelFx">EQ · ${t.compress ? "COMP" : "BYPASS"}</span><div class="channelPan"><span>L</span><input data-pan="${t.id}" type="range" min="-1" max="1" step=".01" value="${t.pan}" aria-label="Pan ${esc(t.name)}"><span>R</span></div><div class="channelFader"><input data-fader="${t.id}" type="range" min="0" max="1" step=".01" value="${t.gain}" aria-label="Volume ${esc(t.name)}"><div class="channelMeter"><i data-meter="${t.id}"></i></div></div><span class="channelDb" data-db="${t.id}">${db(t.gain)} dB</span><div class="channelButtons"><button data-mute="${t.id}" class="${t.mute ? "active" : ""}" aria-pressed="${t.mute}" aria-label="Mute ${esc(t.name)}">M</button><button data-solo="${t.id}" class="${t.solo ? "active" : ""}" aria-pressed="${t.solo}" aria-label="Solo ${esc(t.name)}">S</button></div></div>`,
    )
    .join(
      "",
    )}<div class="channel master"><span class="channelName">MASTER</span><span class="channelFx">STEREO OUT</span><div class="channelPan"><span>0 dBFS</span></div><div class="channelFader"><input id="mixMaster" type="range" min="0" max="1" step=".01" value="${p().master}" aria-label="Master fader"><div class="channelMeter"><i data-meter="master"></i></div></div><span class="channelDb">${db(p().master)} dB</span><span class="channelFx" id="peakReadout">PEAK −∞ dBFS</span></div></div>`;
  $$("[data-channel]").forEach(
    (b) =>
      (b.onclick = () => {
        selectedTrack = b.dataset.channel;
        selectedClip = track().clips[0]?.id;
        renderInspector();
        renderLens();
        renderTracks();
        drawTimeline();
      }),
  );
  $$("#editor [data-mute]").forEach(
    (b) => (b.onclick = () => toggleTrack(b.dataset.mute, "mute")),
  );
  $$("#editor [data-solo]").forEach(
    (b) => (b.onclick = () => toggleTrack(b.dataset.solo, "solo")),
  );
  for (const [k, selector] of [
    ["gain", "[data-fader]"],
    ["pan", "[data-pan]"],
  ])
    $$(selector).forEach((b) =>
      bindLiveRange(b, b.dataset.fader || b.dataset.pan, k),
    );
  bindMaster($("#mixMaster"));
}
function bindLiveRange(el, id, key) {
  let old;
  el.onpointerdown = () => (old = p().tracks.find((t) => t.id === id)[key]);
  el.onfocus = () => {
    if (old === undefined) old = p().tracks.find((t) => t.id === id)[key];
  };
  el.oninput = () => {
    const t = p().tracks.find((t) => t.id === id);
    if (old === undefined) old = t[key];
    t[key] = Number(el.value);
    engine.updateMix(p());
    const out = $(`[data-db="${id}"]`);
    if (out && key === "gain") out.textContent = db(t.gain) + " dB";
  };
  el.onchange = () => {
    const val = Number(el.value),
      t = p().tracks.find((t) => t.id === id);
    t[key] = old ?? t[key];
    commit("Change " + key, () => (t[key] = val));
    old = undefined;
  };
}
function bindMaster(el) {
  if (!el) return;
  let old;
  el.onpointerdown = () => (old = p().master);
  el.oninput = () => {
    if (old === undefined) old = p().master;
    p().master = Number(el.value);
    engine.updateMix(p());
    $("#masterDb").textContent = db(p().master) + " dB";
  };
  el.onchange = () => {
    const val = Number(el.value);
    p().master = old ?? p().master;
    commit("Master volume", (proj) => (proj.master = val));
    old = undefined;
  };
}
function renderAutomation() {
  const ed = $("#editor");
  if (!track()) {
    ed.innerHTML =
      '<div class="emptyEditor">Select a track to automate its gain.</div>';
    return;
  }
  ed.innerHTML = `<div class="editorToolbar"><span>${esc(track().name)} / GAIN AUTOMATION</span><button id="clearAutomation">Clear points</button></div><div class="automationHelp">Double-click to add a point · Drag a point to move · Right-click to remove. Values multiply the track fader.</div><canvas id="automation" class="autoCanvas" aria-label="Track gain automation"></canvas>`;
  drawAutomation();
  $("#clearAutomation").onclick = () =>
    commit("Clear automation", () => (track().automation = []));
  const cv = $("#automation"),
    pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    point = (x, y) =>
      track().automation.find(
        (a) =>
          Math.hypot(
            28 + (a.beat / projectBeats(p())) * (cv.clientWidth - 46) - x,
            15 + (1 - a.value) * 155 - y,
          ) < 10,
      );
  cv.ondblclick = (e) => {
    const { x, y } = pos(e);
    commit("Add automation point", () => {
      track().automation.push({
        beat: Math.max(
          0,
          Math.min(
            projectBeats(p()),
            quant(((x - 28) / (cv.clientWidth - 46)) * projectBeats(p())),
          ),
        ),
        value: Math.max(0, Math.min(1, 1 - (y - 15) / 155)),
      });
      track().automation.sort((a, b) => a.beat - b.beat);
    });
  };
  let state;
  cv.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const { x, y } = pos(e),
      a = point(x, y);
    if (a) {
      state = { a, original: structuredClone(p()) };
      cv.setPointerCapture(e.pointerId);
    }
  };
  cv.onpointermove = (e) => {
    if (!state) return;
    const { x, y } = pos(e);
    state.a.beat = Math.max(
      0,
      Math.min(
        projectBeats(p()),
        quant(((x - 28) / (cv.clientWidth - 46)) * projectBeats(p())),
      ),
    );
    state.a.value = Math.max(0, Math.min(1, 1 - (y - 15) / 155));
    drawAutomation();
  };
  cv.onpointerup = () => {
    if (!state) return;
    const after = structuredClone(p());
    store.project = state.original;
    state = null;
    commit("Move automation point", () => (store.project = after));
  };
  cv.onpointercancel = () => {
    if (state) {
      store.project = state.original;
      state = null;
      render();
    }
  };
  cv.oncontextmenu = (e) => {
    e.preventDefault();
    const { x, y } = pos(e),
      a = point(x, y);
    if (a)
      commit(
        "Delete automation point",
        () => (track().automation = track().automation.filter((x) => x !== a)),
      );
  };
}
function drawAutomation() {
  const cv = $("#automation");
  if (!cv) return;
  const w = $("#editor").clientWidth,
    h = 195,
    ctx = resizeCanvas(cv, w, h),
    beats = projectBeats(p()),
    pts = track().automation;
  ctx.fillStyle = "#16171f";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "8px Segoe UI";
  for (let i = 0; i <= 4; i++) {
    const y = 15 + i * 38.75;
    ctx.strokeStyle = "#30313e";
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(w - 18, y);
    ctx.stroke();
    ctx.fillStyle = "#797d96";
    ctx.fillText(Math.round((1 - i / 4) * 100) + "%", 3, y + 3);
  }
  for (let b = 0; b <= beats; b += 4) {
    const x = 28 + (b / beats) * (w - 46);
    ctx.strokeStyle = "#292a36";
    ctx.beginPath();
    ctx.moveTo(x, 15);
    ctx.lineTo(x, 170);
    ctx.stroke();
    ctx.fillStyle = "#727790";
    ctx.fillText(String(b / 4 + 1), x + 3, 185);
  }
  ctx.strokeStyle = track().color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 28; x < w - 18; x++) {
    const y =
      15 + (1 - automationValue(pts, ((x - 28) / (w - 46)) * beats)) * 155;
    x === 28 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (const a of pts) {
    ctx.fillStyle = track().color;
    ctx.beginPath();
    ctx.arc(
      28 + (a.beat / beats) * (w - 46),
      15 + (1 - a.value) * 155,
      4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
function drawAudioDetail() {
  const cv = $("#audioDetail"),
    c = clip();
  if (!cv || !c) return;
  const w = $("#editor").clientWidth,
    ctx = resizeCanvas(cv, w, 190),
    a = p().assets[c.asset];
  ctx.fillStyle = "#16171e";
  ctx.fillRect(0, 0, w, 190);
  ctx.strokeStyle = track().color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 12; x < w - 12; x += 2) {
    const frac =
        ((c.offset || 0) + (((x - 12) / (w - 24)) * c.length * 60) / p().bpm) /
        (a.duration || 1),
      amp =
        a.peaks[
          Math.min(a.peaks.length - 1, Math.floor(frac * a.peaks.length))
        ] || 0;
    ctx.moveTo(x, 95 - amp * 68);
    ctx.lineTo(x, 95 + amp * 68);
  }
  ctx.stroke();
}
function drawMap(metrics = engine.metrics()) {
  const cv = $("#mixMap");
  if (!cv) return;
  const w = $("#editor").clientWidth,
    h = Math.max(160, $("#editor").clientHeight - 37),
    ctx = resizeCanvas(cv, w, h);
  ctx.fillStyle = "#15161e";
  ctx.fillRect(0, 0, w, h);
  ctx.font = "8px Segoe UI";
  ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const x = 50 + (i * (w - 100)) / 4;
    ctx.strokeStyle = "#30313e";
    ctx.beginPath();
    ctx.moveTo(x, 25);
    ctx.lineTo(x, h - 35);
    ctx.stroke();
  }
  for (let i = 0; i <= 3; i++) {
    const y = 35 + (i * (h - 80)) / 3;
    ctx.strokeStyle = "#282a36";
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 30, y);
    ctx.stroke();
    ctx.fillStyle = "#6f7389";
    ctx.textAlign = "left";
    ctx.fillText(["HIGH", "MID", "LOW", "AUDIO"][i], 9, y - 5);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#72778e";
  ctx.fillText("LEFT", 50, h - 17);
  ctx.fillText("CENTER", w / 2, h - 17);
  ctx.fillText("RIGHT", w - 50, h - 17);
  p().tracks.forEach((t, i) => {
    const notes = t.clips.flatMap((c) => c.notes),
      avg = notes.length
        ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length
        : 48;
    const x = 50 + ((t.pan + 1) / 2) * (w - 100),
      y =
        t.instrument === "audio"
          ? h - 45
          : 35 + (1 - Math.max(0, Math.min(1, (avg - 30) / 55))) * (h - 95),
      r = engine.playing
        ? 7 + Math.min(1, (metrics.tracks.get(t.id)?.rms || 0) * 7) * 22
        : 12;
    ctx.fillStyle = t.color + "12";
    ctx.beginPath();
    ctx.arc(x, y, r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = t.color + "70";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "8px Segoe UI";
    ctx.fillText(t.name, x, y + r + 13);
  });
}
function renderInspector() {
  const t = track(),
    c = clip(),
    el = $("#inspectorContent");
  if (!t) {
    el.innerHTML = '<div class="emptyEditor">Select a track.</div>';
    return;
  }
  $("#inspectorNumber").textContent = String(
    p().tracks.indexOf(t) + 1,
  ).padStart(2, "0");
  el.innerHTML = `<div class="selectedTrack" style="--selected:${t.color}"><div class="trackTag"></div><span class="eyebrow">${t.instrument === "audio" ? "AUDIO" : "INSTRUMENT"} TRACK</span><h2>${esc(t.name)}</h2><span class="clipName">${esc(c?.name || "No clip selected")} ${c ? `/ ${c.length.toFixed(2)} beats` : ""}</span></div><div class="inspectorSection"><div class="sectionEyebrow">CHANNEL</div>${control("gain", "Volume", 0, 1, 0.01, t.gain, db(t.gain) + " dB")}${control("pan", "Pan", -1, 1, 0.01, t.pan, t.pan === 0 ? "Center" : Math.round(Math.abs(t.pan) * 100) + (t.pan < 0 ? " L" : " R"))}${
    t.instrument !== "audio"
      ? `<div class="control"><label for="trackInstrument">Voice</label><select id="trackInstrument">${presets
          .filter((x) => x.id !== "drums")
          .concat(
            t.instrument === "drums"
              ? [presets.find((x) => x.id === "drums")]
              : [],
          )
          .map(
            (x) =>
              `<option value="${x.id}" ${t.instrument === x.id ? "selected" : ""}>${x.name}</option>`,
          )
          .join("")}</select></div>`
      : ""
  }</div><div class="inspectorSection"><div class="sectionEyebrow">SIGNAL CHAIN / REAL PROCESSING</div><div class="effectSlot"><span class="effectIcon">⌁</span> Parametric EQ <small>300 Hz · Q 0.7</small></div>${control("eq", "Low-mid EQ", -12, 12, 0.1, t.eq, t.eq.toFixed(1) + " dB")}${control("cutoff", "Low-pass cutoff", 100, 16000, 50, t.cutoff, (t.cutoff / 1000).toFixed(1) + " kHz")}<div class="toggleRow"><label for="compressor">Compressor / 3:1 · −20 dB</label><input id="compressor" type="checkbox" ${t.compress ? "checked" : ""}></div></div><div class="inspectorSection"><div class="sectionEyebrow">SPACE</div>${control("reverb", "Reverb send", 0, 1, 0.01, t.reverb, Math.round(t.reverb * 100) + "%")}<div class="effectSlot"><span class="effectIcon">◌</span> Convolution room <small>1.5 s tail</small></div></div>`;
  $$("[data-control]").forEach((input) => {
    const k = input.dataset.control;
    bindLiveRange(input, t.id, k);
    const originalInput = input.oninput;
    input.oninput = (e) => {
      originalInput(e);
      const val = Number(input.value);
      $(`[data-output="${k}"]`).textContent =
        k === "gain"
          ? db(val) + " dB"
          : k === "pan"
            ? val === 0
              ? "Center"
              : Math.round(Math.abs(val) * 100) + (val < 0 ? " L" : " R")
            : k === "cutoff"
              ? (val / 1000).toFixed(1) + " kHz"
              : k === "reverb"
                ? Math.round(val * 100) + "%"
                : val.toFixed(1) + " dB";
    };
  });
  $("#compressor").onchange = (e) =>
    commit("Toggle compression", () => (t.compress = e.target.checked));
  if ($("#trackInstrument"))
    $("#trackInstrument").onchange = (e) =>
      commit("Change instrument", () => (t.instrument = e.target.value));
}
function control(key, label, min, max, step, value, display) {
  return `<div class="control"><label for="ctrl-${key}">${label}<output data-output="${key}">${display}</output></label><input id="ctrl-${key}" data-control="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}
function renderLens() {
  const t = track(),
    c = clip(),
    notes = c?.notes || [],
    outside = notes.filter((n) => !inScale(n.pitch, p()));
  $("#lensContent").innerHTML =
    `<div class="observation"><span class="obLabel">HARMONIC CONTEXT</span><h3>${noteName(p().root + 60).slice(0, -1)} ${esc(p().scale)} · ${notes.length} notes in this clip</h3><p>${outside.length ? outside.length + " note" + (outside.length > 1 ? "s are" : " is") + " outside the selected scale. This can be intentional tension." : "Selected clip notes fit the project scale. Try a harmony below the melody for a different color."}</p>${t && t.instrument !== "audio" && t.instrument !== "drums" ? '<button id="lensHarmony">↗ Suggest editable harmony</button>' : ""}</div><div class="observation"><span class="obLabel">SIGNAL OBSERVATION</span><h3 id="signalTitle">Listen before changing.</h3><p id="signalAdvice">Play the session to measure the master peak and RMS. These are live sample measurements, not LUFS or true peak.</p><button id="gainAdvice" style="display:none">Preview −3 dB master gain</button></div><div class="observation"><span class="obLabel">YOUR CREATIVE CONTROL</span><h3>Make it your own.</h3><p>Suggestions appear as ghost notes. Audition, accept or discard them. Your original phrase stays intact.</p></div><div id="proposal"></div><p class="lensNote">Local analysis + music-theory rules. No model connected. No upload, fabricated diagnosis or automatic edits.</p>`;
  if ($("#lensHarmony")) $("#lensHarmony").onclick = suggestHarmony;
  $("#gainAdvice").onclick = () => {
    proposal = {
      kind: "gain",
      gain: p().master * Math.SQRT1_2,
      preview: false,
    };
    renderProposal();
  };
  renderProposal();
}
function suggestHarmony() {
  const c = clip(),
    t = track();
  if (!c || !c.notes.length)
    return toast("Write a melody first, then ask for harmony.");
  if (t.instrument === "audio" || t.instrument === "drums")
    return toast("Select a melodic instrument clip.");
  proposal = {
    kind: "harmony",
    clipId: c.id,
    trackId: t.id,
    notes: [],
    preview: false,
  };
  buildHarmony();
  renderProposal();
  drawPiano();
  toast("Harmony shown as ghost notes. Original notes are unchanged.");
}
function buildHarmony(variant = 0) {
  if (!proposal || proposal.kind !== "harmony") return;
  const c = clip();
  proposal.notes = harmonyRule(c.notes, p(), proposalIntensity, variant);
}
function proposalProject() {
  const proj = structuredClone(p());
  if (proposal.kind === "harmony") {
    proj.tracks
      .find((t) => t.id === proposal.trackId)
      .clips.find((c) => c.id === proposal.clipId)
      .notes.push(...structuredClone(proposal.notes));
  } else proj.master = proposal.gain;
  return proj;
}
function renderProposal() {
  const el = $("#proposal");
  if (!el) return;
  if (!proposal) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<div class="proposal"><h3>${proposal.kind === "harmony" ? "A softer second voice." : "Leave more headroom."}</h3><p>${proposal.kind === "harmony" ? "A diatonic voice below the selected notes, using the project scale. This is a theory rule, not a model-generated prediction." : "Reduce the master fader by 3 dB. This reduces observed sample peaks; it does not repair already distorted source audio."}</p>${proposal.kind === "harmony" ? `<div class="control"><label>Density <output>${Math.round(proposalIntensity * 100)}%</output></label><input id="suggestionDensity" type="range" min=".15" max="1" step=".05" value="${proposalIntensity}" aria-label="Suggestion density"></div>` : ""}<div class="proposalButtons"><button id="previewProposal">${proposal.preview ? "Stop preview" : "▶ Preview"}</button><button id="acceptProposal" class="primary">Accept</button><button id="rejectProposal">Reject</button>${proposal.kind === "harmony" ? '<button id="regenerateProposal">Variation</button>' : ""}</div></div>`;
  $("#previewProposal").onclick = safe(async () => {
    if (proposal.preview) {
      engine.stop();
      proposal.preview = false;
    } else {
      engine.stop();
      await engine.play(proposalProject(), clip()?.start || 0);
      proposal.preview = true;
    }
    renderProposal();
  });
  $("#acceptProposal").onclick = () => {
    const pr = structuredClone(proposal);
    engine.stop();
    commit("Accept " + pr.kind + " suggestion", (proj) => {
      if (pr.kind === "harmony")
        proj.tracks
          .find((t) => t.id === pr.trackId)
          .clips.find((c) => c.id === pr.clipId)
          .notes.push(...pr.notes);
      else proj.master = pr.gain;
    });
    toast("Suggestion applied. Undo restores the original.");
  };
  $("#rejectProposal").onclick = () => {
    engine.stop();
    proposal = null;
    renderProposal();
    drawPiano();
    toast("Suggestion discarded");
  };
  if ($("#suggestionDensity"))
    $("#suggestionDensity").onchange = (e) => {
      engine.stop();
      proposal.preview = false;
      proposalIntensity = Number(e.target.value);
      buildHarmony();
      renderProposal();
      drawPiano();
    };
  if ($("#regenerateProposal"))
    $("#regenerateProposal").onclick = () => {
      engine.stop();
      proposal.preview = false;
      proposal.variant = !proposal.variant;
      buildHarmony(proposal.variant);
      renderProposal();
      drawPiano();
    };
}
async function importAudio(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024)
    throw Error("Audio import is limited to 20 MB per file.");
  toast("Decoding " + file.name + "…");
  await engine.init();
  const raw = await file.arrayBuffer(),
    buffer = await engine.ctx.decodeAudioData(raw.slice(0));
  if (buffer.duration > 360)
    throw Error("Please import audio shorter than 6 minutes.");
  const id = uid(),
    peaks = [];
  const data = buffer.getChannelData(0);
  for (let i = 0; i < 1000; i++) {
    let max = 0;
    const a = Math.floor((i * data.length) / 1000),
      b = Math.floor(((i + 1) * data.length) / 1000);
    for (let k = a; k < b; k++) max = Math.max(max, Math.abs(data[k]));
    peaks.push(max);
  }
  const t = makeTrack("audio", p().tracks.length),
    c = makeClip(
      file.name.replace(/\.[^.]+$/, ""),
      0,
      Math.max(0.25, Math.min(256, (buffer.duration * p().bpm) / 60)),
    );
  t.name = c.name;
  t.clips = [{ ...c, asset: id, offset: 0 }];
  if (p().tracks.length >= 64) throw Error("Maximum 64 tracks.");
  engine.assets.set(id, buffer);
  commit("Import audio", (proj) => {
    proj.assets[id] = {
      name: file.name,
      data: bytesToBase64(raw),
      duration: buffer.duration,
      peaks,
    };
    proj.tracks.push(t);
    proj.bars = Math.min(64, Math.max(proj.bars, Math.ceil(c.length / 4)));
  });
  select(t.id, c.id);
  tab = "piano";
  render();
  toast("Audio imported. Its waveform comes from the decoded sample.");
}
let exporting = false;
async function exportAudio() {
  if (exporting) return;
  exporting = true;
  $("#exportButton").disabled = true;
  $("#exportButton").textContent = "Rendering…";
  try {
    const snapshot = structuredClone(p());
    toast("Rendering stereo WAV with your mix and effects…");
    await new Promise((r) => setTimeout(r, 50));
    const buffer = await engine.render(snapshot);
    download(
      new Blob([encodeWav(buffer)], { type: "audio/wav" }),
      safeName(snapshot.name) + ".wav",
    );
    let peak = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++)
      for (const x of buffer.getChannelData(ch))
        peak = Math.max(peak, Math.abs(x));
    toast(
      peak > 1
        ? "WAV exported. Mix exceeds 0 dBFS; lower master gain and re-export."
        : "Stereo WAV exported · 44.1 kHz / 16 bit",
    );
  } finally {
    exporting = false;
    $("#exportButton").disabled = false;
    $("#exportButton").innerHTML = "Export WAV <span>↗</span>";
  }
}
const safeName = (s) =>
  (s || "AURA-session").replace(/[^a-zA-Z0-9 _-]/g, "").trim() ||
  "AURA-session";
async function openHub() {
  await persist();
  const sessions = await listProjects();
  $("#recentProjects").innerHTML = sessions.length
    ? sessions
        .slice(0, 12)
        .map(
          (s) =>
            `<button class="recentProject" data-session="${esc(s.id)}"><strong>${esc(s.name)}</strong><small>${s.bpm} BPM · ${s.tracks.length} tracks · ${new Date(s.savedAt).toLocaleDateString()}</small></button>`,
        )
        .join("")
    : '<p class="emptyEditor">Your saved sessions will appear here.</p>';
  $$("[data-session]").forEach(
    (b) =>
      (b.onclick = safe(() =>
        selectProject(sessions.find((s) => s.id === b.dataset.session)),
      )),
  );
  $("#hub").showModal();
}
const commands = [
  ["Play / pause", "Space", () => togglePlay()],
  ["Stop", "Shift Space", () => engine.stop()],
  ["Add soft keys", "", () => addInstrument("keys")],
  ["Add bass", "", () => addInstrument("bass")],
  ["Add pad", "", () => addInstrument("pad")],
  ["Add pluck", "", () => addInstrument("pluck")],
  ["Add drum machine", "", () => addInstrument("drums")],
  ["Import audio", "", () => $("#audioFile").click()],
  ["Duplicate clip", "Ctrl D", duplicateClip],
  ["Split clip at playhead", "", splitClip],
  [
    "Open piano roll",
    "",
    () => {
      tab = "piano";
      renderEditor();
    },
  ],
  [
    "Open drum sequencer",
    "",
    () => {
      tab = "drums";
      renderEditor();
    },
  ],
  [
    "Open mixer",
    "",
    () => {
      tab = "mixer";
      renderEditor();
    },
  ],
  [
    "Edit gain automation",
    "",
    () => {
      tab = "automation";
      renderEditor();
    },
  ],
  [
    "Open mix map",
    "",
    () => {
      tab = "map";
      renderEditor();
    },
  ],
  ["Suggest harmony (local theory rule)", "", suggestHarmony],
  ["Save project", "Ctrl S", persist],
  [
    "Download portable project",
    "",
    () => download(portableProject(p()), safeName(p().name) + ".aura"),
  ],
  ["Export stereo WAV", "", exportAudio],
  ["Project hub", "", openHub],
  ["Undo", "Ctrl Z", () => store.undo()],
  ["Redo", "Ctrl Shift Z", () => store.redo()],
];
function renderCommands() {
  const q = $("#commandSearch").value.toLowerCase();
  $("#commandResults").innerHTML =
    commands
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c[0].toLowerCase().includes(q))
      .map(
        ({ c, i }) =>
          `<button data-command="${i}">${c[0]}<kbd>${c[1] || "↵"}</kbd></button>`,
      )
      .join("") || '<div class="emptyEditor">No matching commands.</div>';
  $$("[data-command]").forEach(
    (b) =>
      (b.onclick = safe(() => {
        $("#command").close();
        return commands[Number(b.dataset.command)][2]();
      })),
  );
}
function openCommand() {
  for(const dialog of $$("dialog[open]"))dialog.close();
  $("#commandSearch").value = "";
  renderCommands();
  $("#command").showModal();
  $("#commandSearch").focus();
}
async function togglePlay() {
  if (engine.playing) {
    engine.pause();
    if (proposal) proposal.preview = false;
  } else await engine.play(p());
  updateTransport();
}
function updateTransport() {
  $("#play").classList.toggle("playing", engine.playing);
  $("#play").setAttribute("aria-label", engine.playing ? "Pause" : "Play");
  $("#audioState").textContent = engine.playing
    ? "ENGINE RUNNING"
    : engine.ctx && engine.ctx.state !== "running" ? "TAP PLAY FOR SOUND" : "ENGINE READY";
  if (engine.ctx) {
    $("#audioInfo").textContent =
      (engine.ctx.sampleRate / 1000).toFixed(1) + "K · LOCAL ENGINE";
    $("#footerAudio").textContent =
      engine.ctx.baseLatency !== undefined
        ? Math.round(engine.ctx.baseLatency * 1000) +
          " ms reported output base latency"
        : "Web Audio engine";
  }
}
function updatePlayhead() {
  const beat = engine.beat;
  $("#playhead").style.left = beat * zoom + "px";
  $("#playhead").style.display = engine.playing || beat > 0 ? "block" : "none";
  const bar = Math.floor(beat / 4) + 1,
    bt = Math.floor(beat % 4) + 1,
    tick = Math.floor((beat % 1) * 100);
  $("#position").textContent = [bar, bt, tick]
    .map((n) => String(n).padStart(2, "0"))
    .join(" : ");
}
let lastFrame = 0,
  observedPeak = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (now - lastFrame < 40) return;
  lastFrame = now;
  updatePlayhead();
  if (document.body.classList.contains("houseMode")) return;
  const m = engine.metrics();
  observedPeak = Math.max(observedPeak, m.peak);
  $$("[data-mini-meter]").forEach(
    (el) =>
      (el.style.width =
        Math.min(100, (m.tracks.get(el.dataset.miniMeter)?.peak || 0) * 100) +
        "%"),
  );
  $$("[data-meter]").forEach((el) => {
    const peak =
      el.dataset.meter === "master"
        ? m.peak
        : m.tracks.get(el.dataset.meter)?.peak || 0;
    el.style.height =
      Math.min(
        100,
        Math.max(0, ((20 * Math.log10(peak || 0.0001) + 60) / 60) * 100),
      ) + "%";
  });
  if ($("#peakReadout"))
    $("#peakReadout").textContent = "PEAK " + db(m.peak) + " dBFS";
  const cv = $("#spectrum"),
    ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const bins = m.spectrum;
  for (let i = 0; i < 40; i++) {
    const idx = Math.floor(
        2 ** ((i / 39) * Math.log2(Math.max(2, bins.length - 1))),
      ),
      v = bins[idx] || 0;
    ctx.fillStyle = i < 20 ? "#9d9bff70" : "#69d6be70";
    ctx.fillRect(i * 3.7, 40 - (v / 255) * 36, 2, Math.max(1, (v / 255) * 36));
  }
  if (tab === "map") drawMap(m);
  if (engine.playing && $("#signalTitle")) {
    $("#signalTitle").textContent =
      "Peak " + db(m.peak) + " dBFS · RMS " + db(m.rms) + " dBFS";
    $("#signalAdvice").textContent =
      observedPeak > 1
        ? "Master sample peaks exceeded 0 dBFS in this playback. Reduce gain to add headroom."
        : "Live master samples are below 0 dBFS in the measured windows. This is not a full-song clipping guarantee.";
    $("#gainAdvice").style.display = observedPeak > 1 ? "block" : "none";
  }
}
engine.addEventListener("transport", updateTransport);
engine.addEventListener("audiostate", updateTransport);
engine.addEventListener("error", (e) => toast(e.detail.message));
$("#play").onclick = safe(togglePlay);
$("#stop").onclick = () => {
  engine.stop();
  observedPeak = 0;
  if (proposal) proposal.preview = false;
  renderProposal();
};
$("#loop").onclick = () => {
  engine.loop = !engine.loop;
  $("#loop").classList.toggle("active", engine.loop);
  $("#loop").setAttribute("aria-pressed", String(engine.loop));
};
$("#metronome").onclick = () => {
  engine.metronome = !engine.metronome;
  $("#metronome").classList.toggle("active", engine.metronome);
  $("#metronome").setAttribute("aria-pressed", String(engine.metronome));
};
$("#bpm").onchange = (e) => {
  const val = Math.max(40, Math.min(240, Number(e.target.value) || 112));
  commit("Change tempo", (proj) => (proj.bpm = val));
};
$("#projectName").onchange = (e) =>
  commit(
    "Rename project",
    (proj) =>
      (proj.name = e.target.value.trim().slice(0, 80) || "Untitled session"),
  );
$("#root").innerHTML = Array.from(
  { length: 12 },
  (_, i) => `<option value="${i}">${noteName(i + 60).slice(0, -1)}</option>`,
).join("");
$("#scale").innerHTML = Object.keys(scaleIntervals)
  .map((s) => `<option>${s}</option>`)
  .join("");
$("#root").onchange = (e) =>
  commit("Change key", (proj) => (proj.root = Number(e.target.value)));
$("#scale").onchange = (e) =>
  commit("Change scale", (proj) => (proj.scale = e.target.value));
bindMaster($("#master"));
$("#tap").onclick = () => {
  const now = performance.now();
  if (tapTimes.length && now - tapTimes.at(-1) > 2000) tapTimes = [];
  tapTimes.push(now);
  tapTimes = tapTimes.slice(-6);
  if (tapTimes.length > 1) {
    const bpm = Math.round(
      60000 / ((tapTimes.at(-1) - tapTimes[0]) / (tapTimes.length - 1)),
    );
    commit(
      "Tap tempo",
      (proj) => (proj.bpm = Math.min(240, Math.max(40, bpm))),
    );
  }
};
$("#undo").onclick = () => store.undo();
$("#redo").onclick = () => store.redo();
$("#saveButton").onclick = safe(async () => {
  await persist();
  toast("Session saved on this device");
});
$("#hubButton").onclick = safe(openHub);
$("#fileButton").onclick = safe(openHub);
$("#newBlank").onclick = safe(() => selectProject(newProject(true)));
$("#newDemo").onclick = safe(() => selectProject(newProject()));
$("#openProject").onclick = () => $("#projectFile").click();
$("#projectFile").onchange = safe(async (e) => {
  const f = e.target.files[0];
  if (f) {
    if (f.size > 60 * 1024 * 1024) throw Error("Project file exceeds 60 MB.");
    await persist();
    const obj = JSON.parse(await f.text());
    validateProject(obj);
    if (Object.keys(obj.assets || {}).length > 64)
      throw Error("Too many audio assets.");
    await selectProject(obj);
  }
  e.target.value = "";
});
$("#importAudio").onclick = () => $("#audioFile").click();
$("#audioFile").onchange = safe(async (e) => {
  await importAudio(e.target.files[0]);
  e.target.value = "";
});
$("#timelineViewport").ondragover = (e) => {
  e.preventDefault();
};
$("#timelineViewport").ondrop = safe(async (e) => {
  e.preventDefault();
  await importAudio(e.dataTransfer.files[0]);
});
$("#exportButton").onclick = safe(exportAudio);
$("#duplicate").onclick = duplicateClip;
$("#split").onclick = splitClip;
$("#deleteClip").onclick = removeSelection;
$("#snap").onclick = () => {
  snap = !snap;
  $("#snap").textContent = snap ? "Snap ¼" : "Snap off";
  $("#snap").classList.toggle("active", snap);
  $("#snap").setAttribute("aria-pressed", String(snap));
};
$("#zoomIn").onclick = () => {
  zoom = Math.min(96, zoom + 6);
  drawTimeline();
};
$("#zoomOut").onclick = () => {
  zoom = Math.max(12, zoom - 6);
  drawTimeline();
};
const addViaPalette = () => {
  openCommand();
  $("#commandSearch").value = "Add";
  renderCommands();
};
$("#addTrack").onclick = addViaPalette;
$("#addTrackRow").onclick = addViaPalette;
$$("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      renderEditor();
    }),
);
$$("[data-work]").forEach(
  (b) =>
    (b.onclick = () => {
      const room=b.dataset.work==='arrange'?'arrange':b.dataset.work==='mix'?'living':track()?.instrument==='drums'?'rhythm':'instrument';
      if(window.aura?.house)window.aura.house.production(room);
      else document.body.dataset.room=room;
      $$("[data-work]").forEach((x) => x.classList.toggle("active", x === b));
      tab = b.dataset.work === "mix" ? "mixer" : room==='rhythm'?'drums':'piano';
      renderEditor();
      if (b.dataset.work === "compose")
        document.documentElement.style.setProperty("--editor", "390px");
      else
        document.documentElement.style.setProperty(
          "--editor",
          b.dataset.work === "mix" ? "320px" : "314px",
        );
    }),
);
$("#soundSearch").oninput = renderLibrary;
$("#commandButton").onclick = openCommand;
$("#commandSearch").oninput = renderCommands;
$("#commandSearch").onkeydown = (e) => {
  if (e.key === "Enter") $("#commandResults button")?.click();
};
$("#settingsButton").onclick = () => {
  $("#introSetting").checked = localStorage.getItem("aura-intro") !== "off";
  $("#oledSetting").checked = document.body.classList.contains("oled");
  $("#barsSetting").value = p().bars;
  $("#settings").showModal();
};
$("#introSetting").onchange = (e) =>
  localStorage.setItem("aura-intro", e.target.checked ? "on" : "off");
$("#oledSetting").onchange = (e) => {
  document.body.classList.toggle("oled", e.target.checked);
  localStorage.setItem("aura-oled", String(e.target.checked));
};
$("#barsSetting").onchange = (e) =>
  commit(
    "Change arrangement length",
    (proj) =>
      (proj.bars = Math.max(
        1,
        Math.min(64, Math.round(Number(e.target.value) || 8)),
      )),
  );
$("#downloadProject").onclick = () => {
  download(portableProject(p()), safeName(p().name) + ".aura");
  toast("Portable project downloaded, including imported audio.");
};
$$("[data-close]").forEach(
  (b) => (b.onclick = () => $("#" + b.dataset.close).close()),
);
$$("dialog").forEach(
  (d) =>
    (d.onclick = (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
);
$("#lensButton").onclick = () => {
  if (window.innerWidth <= 1000) document.body.classList.toggle("lensMobile");
  else $(".lens").scrollIntoView({ behavior: "smooth" });
};
function panelResize(handle, prop, min, max, vertical = false) {
  handle.onpointerdown = (e) => {
    const initial = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(prop),
      ),
      start = vertical ? e.clientY : e.clientX;
    handle.setPointerCapture(e.pointerId);
    handle.onpointermove = (e) => {
      const delta = (vertical ? e.clientY : e.clientX) - start,
        val = initial + (vertical || prop === "--inspector" ? -delta : delta);
      document.documentElement.style.setProperty(
        prop,
        Math.min(max, Math.max(min, val)) + "px",
      );
      drawTimeline();
      renderEditor();
    };
    handle.onpointerup = () => (handle.onpointermove = null);
  };
}
panelResize($("#browserHandle"), "--browser", 170, 310);
panelResize($("#inspectorHandle"), "--inspector", 220, 360);
panelResize($("#editorHandle"), "--editor", 160, 500, true);
document.addEventListener(
  "keydown",
  safe(async (e) => {
    const editing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommand();
      return;
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      await persist();
      toast("Session saved");
      return;
    }
    if (editing || $$("dialog").some((d) => d.open)) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (e.shiftKey) engine.stop();
      else await togglePlay();
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateClip();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelection();
    }
  }),
);
window.addEventListener("resize", () => {
  drawTimeline();
  renderEditor();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && engine.playing) {
    engine.pause();
    toast("Playback paused while the studio is in the background.");
  }
});
$("#skipIntro").onclick = () => $("#intro").classList.add("hidden");
if (
  localStorage.getItem("aura-intro") === "off" ||
  matchMedia("(prefers-reduced-motion: reduce)").matches
)
  $("#intro").classList.add("hidden");
else setTimeout(() => $("#intro").classList.add("hidden"), 3300);
document.body.classList.toggle(
  "oled",
  localStorage.getItem("aura-oled") === "true",
);
renderLibrary();
render();
requestAnimationFrame(animate);
(async () => {
  try {
    const sessions = await listProjects(),
      last = localStorage.getItem("aura-last"),
      saved = sessions.find((s) => s.id === last);
    if (saved) {
      validateProject(saved);
      if (Object.keys(saved.assets || {}).length)
        await engine.loadAssets(saved);
      store.replace(saved);
      selectedTrack = saved.tracks[0]?.id;
      selectedClip = track()?.clips[0]?.id;
      render();
      $("#saveState").textContent = "Restored locally";
      toast("Your last session has been restored.");
    } else await persist();
  } catch (e) {
    toast(
      "Could not restore the last session. The starter session is available.",
    );
  }
})();
// Deliberate, narrow test hooks: project snapshots and real engine, no alternate production behavior.
window.aura = {
  store,
  engine,
  get selection() {
    return { trackId: selectedTrack, clipId: selectedClip };
  },
  exportAudio,
  selectProject,
  addInstrument,
  suggestHarmony,
  get proposal() {
    return proposal;
  },
};

// Presentation adapter: spatial navigation shares this state and these real tools.
export const studio = {
  registerCommands(items) {
    commands.push(...items);
  },
  engine,
  store,
  getProject: p,
  getTrack: track,
  getClip: clip,
  select,
  addInstrument,
  render,
  persist,
  openHub,
  openCommand,
  exportAudio,
  importAudio,
  selectProject,
  suggestHarmony,
  toast,
  commit,
  activate(room) {
    if (room === "instrument") {
      const current=track();
      const t = current && !["audio","drums"].includes(current.instrument)?current:p().tracks.find(
        (t) => !["audio", "drums"].includes(t.instrument),
      );
      if (t) {if(t.id!==selectedTrack)select(t.id,t.clips[0]?.id);}
      else addInstrument("keys");
      tab = "piano";
    } else if (room === "rhythm") {
      const t = track()?.instrument==='drums'?track():p().tracks.find((t) => t.instrument === "drums");
      if (t) {if(t.id!==selectedTrack)select(t.id,t.clips[0]?.id);}
      else addInstrument("drums");
      tab = "drums";
    } else if (room === "living" || room === "master") tab = "mixer";
    else if (room === "arrange") tab = "piano";
    render();
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  },
  setInstrument(id) {
    const t = p().tracks.find((t) => t.instrument === id);
    if (t) select(t.id, t.clips[0]?.id);
    else addInstrument(id);
    tab = id === "drums" ? "drums" : "piano";
    render();
  },
  toggleStep(step, pitch) {
    let t = p().tracks.find((t) => t.instrument === "drums");
    if (!t) {
      addInstrument("drums");
      t = track();
    }
    const c = t.clips[0];
    if (!c) return;
    const n = c.notes.find(
      (n) => n.pitch === pitch && Math.abs(n.start - step / 4) < 0.05,
    );
    commit("Toggle architectural drum step", () => {
      if (n) c.notes = c.notes.filter((x) => x.id !== n.id);
      else
        c.notes.push({
          id: uid(),
          pitch,
          start: step / 4,
          duration: 0.15,
          velocity: pitch === 42 ? 0.45 : 0.8,
        });
    });
    if (!n) engine.audition(t, pitch).catch((e) => toast(e.message));
  },
};
