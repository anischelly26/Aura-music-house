import { uid } from "./id.js";
export async function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("aura-sessions", 2);
    r.onupgradeneeded = () => {
      if(!r.result.objectStoreNames.contains("sessions"))r.result.createObjectStore("sessions",{keyPath:"id"});
      if(!r.result.objectStoreNames.contains("recovery"))r.result.createObjectStore("recovery",{keyPath:"id"});
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveProject(p) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["sessions","recovery"], "readwrite"),sessions=tx.objectStore("sessions"),recovery=tx.objectStore("recovery"),now=Date.now();
      const read=sessions.get(p.id);
      read.onsuccess=()=>{
        const previous=read.result,shouldKeep=previous && now-(previous.recoveryAt||0)>=60000;
        if(shouldKeep){
          recovery.put({id:p.id+":"+now,projectId:p.id,savedAt:now,name:previous.name,project:previous});
          const all=recovery.getAll();all.onsuccess=()=>{const old=all.result.filter(x=>x.projectId===p.id).sort((a,b)=>b.savedAt-a.savedAt).slice(5);for(const record of old)recovery.delete(record.id);};
        }
        sessions.put({...structuredClone(p),savedAt:now,recoveryAt:shouldKeep?now:previous?.recoveryAt||now});
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    localStorage.setItem("aura-last", p.id);
  } finally {
    db.close();
  }
}
export async function listProjects() {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () =>
        resolve(r.result.sort((a, b) => b.savedAt - a.savedAt));
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export function download(blob, name) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function portableProject(p) {
  return new Blob([JSON.stringify(p)], { type: "application/json" });
}
export const bytesToBase64 = (b) => {
  let s = "";
  const a = new Uint8Array(b);
  for (let i = 0; i < a.length; i += 32768)
    s += String.fromCharCode(...a.subarray(i, i + 32768));
  return btoa(s);
};
export const base64ToBytes = (s) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

// Checkpoints live outside the project payload so snapshots never nest recursively.
export async function checkpoint(project, name) {
  const db = await memoryDatabase();
  try {
    const record = {
      id: uid(),
      projectId: project.id,
      name: name || "Version " + new Date().toLocaleTimeString(),
      savedAt: Date.now(),
      project: structuredClone(project),
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction("memories", "readwrite");
      tx.objectStore("memories").put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return record;
  } finally {
    db.close();
  }
}
export async function listMemories(projectId) {
  const db = await memoryDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("memories").objectStore("memories").getAll();
      r.onsuccess = () =>
        resolve(
          r.result
            .filter((x) => x.projectId === projectId)
            .sort((a, b) => b.savedAt - a.savedAt),
        );
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function memoryDatabase() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("aura-musical-memory", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("memories", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listRecovery(projectId) {
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const r=db.transaction("recovery").objectStore("recovery").getAll();r.onsuccess=()=>resolve(r.result.filter(x=>x.projectId===projectId).sort((a,b)=>b.savedAt-a.savedAt));r.onerror=()=>reject(r.error);});}finally{db.close();}
}
