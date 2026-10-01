// ZIP method 0: offline packaging without a network dependency.
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=data=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zipFiles(files) {
  const encoder=new TextEncoder(),local=[],central=[];let offset=0;
  const header=(length)=>{const bytes=new Uint8Array(length);return [bytes,new DataView(bytes.buffer)];};
  for(const file of files){
    const name=encoder.encode(file.name),data=new Uint8Array(file.data),crc=crc32(data);
    const [lh,l]=header(30);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);
    local.push(lh,name,data);
    const [ch,c]=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    central.push(ch,name);offset+=30+name.length+data.length;
  }
  const centralLength=central.reduce((n,b)=>n+b.length,0),[end,e]=header(22);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralLength,true);e.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
