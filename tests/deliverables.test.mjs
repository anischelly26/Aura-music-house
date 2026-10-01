import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMidi } from '../src/midi.js';
import { encodeWav } from '../src/audio.js';
import { zipFiles } from '../src/zip.js';
import { transformPhrase } from '../src/workbench.js';
import { newProject, validateProject } from '../src/project.js';
import { makeEffect } from '../src/effects.js';

test('24-bit WAV preserves full-scale signed samples and exact header lengths',()=>{
  const samples=new Float32Array([-1,-.5,0,.5,1]);
  const buffer={length:5,numberOfChannels:1,sampleRate:48000,getChannelData:()=>samples};
  const bytes=new Uint8Array(encodeWav(buffer,24)),v=new DataView(bytes.buffer);
  assert.equal(v.getUint16(34,true),24);assert.equal(v.getUint32(28,true),144000);assert.equal(v.getUint32(40,true),15);
  const signed=i=>{const x=bytes[44+i*3]|bytes[45+i*3]<<8|bytes[46+i*3]<<16;return x&0x800000?x-0x1000000:x;};
  assert.equal(signed(0),-8388608);assert.equal(signed(1),-4194304);assert.equal(signed(2),0);assert.equal(signed(4),8388607);
});
test('standard MIDI has a conductor and separate tracks, with tempo and end markers',()=>{
  const p=newProject(),bytes=encodeMidi(p),v=new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MThd');assert.equal(v.getUint16(8),1);assert.equal(v.getUint16(10),6);assert.equal(v.getUint16(12),480);
  let offset=14,count=0;while(offset<bytes.length){assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+4)),'MTrk');const len=v.getUint32(offset+4);assert.deepEqual(Array.from(bytes.slice(offset+8+len-4,offset+8+len)),[0,255,47,0]);offset+=8+len;count++;}assert.equal(count,6);
});
test('ZIP central directory points to intact named payloads',async()=>{
  const blob=zipFiles([{name:'piano.wav',data:new Uint8Array([1,2,3,4])},{name:'session.mid',data:new Uint8Array([7,8])}]);
  const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer),end=bytes.length-22;
  assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);
  let at=v.getUint32(end+16,true);for(const expected of ['piano.wav','session.mid']){assert.equal(v.getUint32(at,true),0x02014b50);const nameLength=v.getUint16(at+28,true),local=v.getUint32(at+42,true);assert.equal(v.getUint32(local,true),0x04034b50);assert.equal(new TextDecoder().decode(bytes.slice(at+46,at+46+nameLength)),expected);at+=46+nameLength;}
});
test('phrase operations preserve bounds and turn held harmony into real steps',()=>{
  const notes=[{id:'a',pitch:60,start:0,duration:4,velocity:.7},{id:'b',pitch:64,start:0,duration:4,velocity:.6},{id:'c',pitch:67,start:0,duration:4,velocity:.5}];
  const arp=transformPhrase(notes,'arp',4);assert.equal(arp.length,16);assert.deepEqual(arp.slice(0,3).map(n=>n.pitch),[60,64,67]);assert.ok(arp.every(n=>n.start+n.duration<=4));
  const chopped=transformPhrase(notes,'chop',4);assert.equal(chopped.length,48);assert.ok(chopped.every(n=>n.duration<=.2));assert.equal(notes.length,3);
});
test('projects round-trip actual effect chains, synthesis and audio clip processing',()=>{
  const p=newProject();p.tracks[0].inserts=[makeEffect('delay'),makeEffect('eq')];p.tracks[0].synth={attack:.1,release:1.2,brightness:3000};
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).tracks[0].inserts.length,2);
  p.tracks[0].inserts[0].wet=2;assert.throws(()=>validateProject(p),/effect chain/);
});
