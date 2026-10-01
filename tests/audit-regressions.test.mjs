import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore,newProject,validateProject,cloneProject,uid,inScale} from '../src/project.js';
import {makeEffect} from '../src/effects.js';

test('a partially mutating failed edit rolls back without consuming undo or redo',()=>{
  const s=new ProjectStore(newProject());s.commit('Tempo',p=>p.bpm=140);s.undo();
  const before=cloneProject(s.project),undo=s.undoStack.length,redo=s.redoStack.length;
  assert.throws(()=>s.commit('Failed edit',p=>{p.name='Corrupted';p.tracks[0].clips.splice(0,1);throw Error('Failure');}));
  assert.deepEqual(s.project,before);assert.equal(s.undoStack.length,undo);assert.equal(s.redoStack.length,redo);
  s.redo();assert.equal(s.project.bpm,140);
});
test('invalid mutations and unbounded imported voice parameters are rejected',()=>{
  const s=new ProjectStore(newProject());assert.throws(()=>s.commit('Invalid tempo',p=>p.bpm=NaN));assert.equal(s.project.bpm,112);
  for(const synth of [{release:16000},{attack:0},{brightness:199},{unknown:.2},[]]){
    const p=newProject();p.tracks[0].synth=synth;assert.throws(()=>validateProject(p),/voice parameters/);
  }
});
test('project identifiers cannot inject markup into persisted recovery controls',()=>{
  for(const key of ['id','asset','track','clip']){
    const p=newProject(),bad='x" onclick="window.pwned=true';
    if(key==='id')p.id=bad;
    if(key==='track')p.tracks[0].id=bad;
    if(key==='clip')p.tracks[0].clips[0].id=bad;
    if(key==='asset')p.assets[bad]={data:'AAAA',duration:1,peaks:[0]};
    assert.throws(()=>validateProject(p));
  }
});
test('UUID fallback supports projects and effects without randomUUID',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});
  try{
    const ids=new Set(Array.from({length:100},uid));assert.equal(ids.size,100);
    for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(makeEffect('eq').id);assert.doesNotThrow(()=>validateProject(newProject()));
  }finally{if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;}
});
test('audio snapshot metadata is independent and the starter chord belongs to D minor',()=>{
  const p=newProject();p.assets.probe={data:'AAAA',duration:1,peaks:[.5],tags:'piano'};
  validateProject(p);const snapshot=cloneProject(p);p.assets.probe.peaks[0]=.1;p.assets.probe.tags='edited';p.assets.probe.data='AQAA';
  assert.equal(snapshot.assets.probe.data,'AAAA');assert.deepEqual(snapshot.assets.probe.peaks,[.5]);assert.equal(snapshot.assets.probe.tags,'piano');
  assert.ok(p.tracks[0].clips[0].notes.every(n=>inScale(n.pitch,p)));
});
