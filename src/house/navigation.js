/** Grid navigation with line-of-sight reduction; keeps automated passages off furniture. */
export function walkRoute(architecture, start, end) {
  const key=(x,z)=>x+','+z, valid=(x,z)=>architecture.canWalk(x,z)&&architecture.canWalk(x-.12,z-.12)&&architecture.canWalk(x+.12,z+.12)&&architecture.canWalk(x-.12,z+.12)&&architecture.canWalk(x+.12,z-.12);
  const sx=Math.round(start.x),sz=Math.round(start.z),ex=Math.round(end.x),ez=Math.round(end.z);
  const open=[{x:sx,z:sz,g:0,f:0}],visited=new Set(),cost=new Map([[key(sx,sz),0]]),parent=new Map();
  let target;
  while(open.length&&visited.size<6000){
    open.sort((a,b)=>b.f-a.f);const n=open.pop(),id=key(n.x,n.z);if(visited.has(id))continue;visited.add(id);
    if(n.x===ex&&n.z===ez){target=id;break;}
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=n.x+dx,z=n.z+dz,next=key(x,z),g=n.g+1;
      if(!valid(x,z)||g>=(cost.get(next)??Infinity))continue;
      cost.set(next,g);parent.set(next,id);open.push({x,z,g,f:g+Math.abs(ex-x)+Math.abs(ez-z)});
    }
  }
  if(!target)return null;
  const raw=[];while(target!==key(sx,sz)){const [x,z]=target.split(',').map(Number);raw.unshift({x,z});target=parent.get(target);}
  raw.unshift({x:start.x,z:start.z});raw.push({x:end.x,z:end.z});
  const clear=(a,b)=>{const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(d/.05);for(let i=1;i<=steps;i++)if(!valid(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps))return false;return true;};
  const points=[raw[0]];let i=0;
  while(i<raw.length-1){let next=i+1;for(let j=next+1;j<raw.length;j++){if(!clear(raw[i],raw[j]))break;next=j;}points.push(raw[next]);i=next;}
  return points;
}
