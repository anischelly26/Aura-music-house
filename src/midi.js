const text=s=>Array.from(new TextEncoder().encode(s));
const be=(n,bytes)=>Array.from({length:bytes},(_,i)=>(n>>((bytes-i-1)*8))&255);
const vlq=n=>{let bytes=[n&127];while((n>>=7)>0)bytes.unshift((n&127)|128);return bytes;};
const chunk=(name,data)=>[...text(name),...be(data.length,4),...data];
/** Standard MIDI file, format 1, 480 PPQ; preserves clip placement and velocity. */
export function encodeMidi(project) {
  const tempo=Math.round(60000000/project.bpm);
  const conductor=[0,255,81,3,...be(tempo,3),0,255,88,4,4,2,24,8,0,255,47,0];
  const tracks=project.tracks.filter(t=>t.instrument!=='audio');
  const chunks=[chunk('MTrk',conductor)];
  tracks.forEach((track,index)=>{
    const channel=track.instrument==='drums'?9:(index%15>=9?index%15+1:index%15);
    const events=[];
    for(const c of track.clips)for(const n of c.notes){if(n.start>=c.length)continue;
      const start=Math.round((c.start+n.start)*480),end=Math.round((c.start+n.start+Math.min(n.duration,c.length-n.start))*480);
      events.push({at:start,order:1,data:[144|channel,n.pitch,Math.max(1,Math.round(n.velocity*127))]},{at:Math.max(start+1,end),order:0,data:[128|channel,n.pitch,0]});
    }
    events.sort((a,b)=>a.at-b.at||a.order-b.order);
    const name=text(track.name),data=[0,255,3,...vlq(name.length),...name];let last=0;
    for(const e of events){data.push(...vlq(e.at-last),...e.data);last=e.at;}
    data.push(0,255,47,0);chunks.push(chunk('MTrk',data));
  });
  return new Uint8Array([...chunk('MThd',[0,1,...be(chunks.length,2),1,224]),...chunks.flat()]);
}
