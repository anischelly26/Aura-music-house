export function measureBuffer(buffer) {
  const l=buffer.getChannelData(0),r=buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1));
  let peak=0,sum=0,lr=0,ll=0,rr=0;
  for(let i=0;i<l.length;i++) {peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i]));sum+=l[i]*l[i]+r[i]*r[i];lr+=l[i]*r[i];ll+=l[i]*l[i];rr+=r[i]*r[i];}
  const rms=Math.sqrt(sum/(l.length*2));
  return {peak,rms,crest:rms?20*Math.log10(peak/rms):0,correlation:ll*rr?lr/Math.sqrt(ll*rr):0,duration:buffer.duration};
}
export const dbfs=x=>x>0?(20*Math.log10(x)).toFixed(1):'−∞';

/** Cosine similarity of measured power spectra, not a masking diagnosis. */
export function spectralOverlap(a,b) {
  if(!a?.length||!b?.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=1;i<Math.min(a.length,b.length);i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return aa*bb?dot/Math.sqrt(aa*bb):0;
}
