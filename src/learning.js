import { makeTrack, makeClip, uid, scaleIntervals, noteName, inScale } from './project.js';

export const lessons = [
  {id:'pulse',title:'Find the pulse',time:'2 min',room:'rhythm',idea:'The beat is the steady pulse you count. Tempo is its speed in beats per minute (BPM). In 4/4, a bar contains four beats.',task:'Listen to a kick on beats 1, 2, 3 and 4. Then put a snare on beats 2 and 4. Count aloud while the loop plays.',question:'At 120 BPM, how long does one beat last?',choices:['Half a second','Two seconds','Four seconds'],answer:0,why:'120 beats fit in 60 seconds, so each beat lasts 60 ÷ 120 = 0.5 seconds.'},
  {id:'melody',title:'Make a small melody',time:'3 min',room:'instrument',idea:'A melody is a sequence of notes. Pitch tells you how high a note is; rhythm tells you when it happens. A scale gives you a useful set of notes, but it is a starting point, not a rule.',task:'Try four notes from your project’s scale. Repeat the first idea, change the last note, and leave a little silence.',question:'What usually makes a short melody easier to remember?',choices:['A repeated idea with a small change','Playing every note as fast as possible','Using the maximum volume'],answer:0,why:'Repetition gives the listener something familiar. A small change keeps it interesting.'},
  {id:'chords',title:'Build your first chord',time:'3 min',room:'instrument',idea:'A chord sounds several notes together. A triad uses the first, third and fifth notes of a scale. The distance between those notes gives it its character.',task:'Hear a triad in your project’s scale. In the piano roll, shorten one note or move it up an octave and listen to how the voicing changes.',question:'What is a triad?',choices:['A chord with three different notes','A drum fill with three hits','A song with three tracks'],answer:0,why:'A triad has three notes. Moving one up an octave changes its voicing without changing its pitch class.'},
  {id:'bass',title:'Give the loop a foundation',time:'3 min',room:'instrument',idea:'Bass connects harmony to rhythm. Start with the chord’s root, one or two octaves below the melody. Short notes often leave more room for the kick.',task:'Try the root on beats 1 and 3. Leave a gap before the next note. Listen to the kick and bass together, then reduce their levels if they crowd each other.',question:'Which is a useful first bass note under a chord?',choices:['The chord’s root','Always the highest melody note','A random note on every beat'],answer:0,why:'The root makes the harmony clear. Other chord tones and passing notes can add movement later.'},
  {id:'arrange',title:'Turn a loop into a journey',time:'4 min',room:'arrange',idea:'An arrangement changes which parts play over time. Contrast can come from adding drums, removing bass, changing a phrase, or simply leaving space.',task:'Make a quieter opening, a fuller middle and a short ending. Move or resize clips in the timeline. Listen for whether each change feels intentional.',question:'How can you create contrast without adding a new sound?',choices:['Remove a part for a few bars','Turn everything louder','Keep every part identical throughout'],answer:0,why:'Taking a part away creates space and makes its return feel more significant.'},
  {id:'mix',title:'Balance before effects',time:'4 min',room:'living',idea:'Mixing starts with level and space. Bring the important sound forward, lower competing parts, and use pan to place them. A peak meter shows level; it cannot tell you whether a mix sounds good.',task:'Lower all track faders, then bring up drums, bass and melody one at a time. Keep the master peak below 0 dBFS. Check in mono before adding more effects.',question:'What should you try first when a melody is buried?',choices:['Lower a competing part','Add effects to every track','Push the master beyond 0 dBFS'],answer:0,why:'Changing the balance is often the clearest fix. Louder master output cannot resolve competition between parts.'},
  {id:'export',title:'Finish a first sketch',time:'2 min',room:'terrace',idea:'Export renders your arrangement into an audio file. Saving an AURA project also keeps the editable tracks and notes. A WAV file alone cannot restore that editing session.',task:'Save the editable project, listen from start to finish, then export a WAV from Deliverables. Reimport it or play it elsewhere to check the result.',question:'Which file keeps AURA’s editable tracks and notes?',choices:['An AURA project file','Only the exported WAV','A screenshot of the mixer'],answer:0,why:'The project file preserves the session. WAV is the rendered sound, useful for listening and sharing.'},
];

/** Bounded musical context: no audio, asset contents, file names, or full project blobs. */
export function learningContext(p) {
  return {bpm:p.bpm,scale:p.scale,root:noteName(60+p.root).replace(/\d+$/,''),bars:p.bars,tracks:p.tracks.slice(0,32).map(t=>({instrument:t.instrument,gain:t.gain,pan:t.pan,mute:t.mute,clips:t.clips.length,notes:t.clips.reduce((n,c)=>n+c.notes.length,0),outOfScale:t.instrument==='audio'||t.instrument==='drums'?0:t.clips.reduce((n,c)=>n+c.notes.filter(v=>!inScale(v.pitch,p)).length,0)}))};
}

export function practiceTrack(id,p) {
  const intervals=scaleIntervals[p.scale]||scaleIntervals.Minor,root=60+p.root;
  const instrument=id==='pulse'?'drums':id==='bass'?'bass':'keys';
  const t=makeTrack(instrument,p.tracks.length);t.name='Practice · '+(lessons.find(l=>l.id===id)?.title||'Music');t.gain=.42;
  const c=makeClip('Two-bar practice',0,8);const add=(pitch,start,duration,velocity=.6)=>c.notes.push({id:uid(),pitch,start,duration,velocity});
  if(id==='pulse'){for(let i=0;i<8;i++)add(36,i,.18,.7);for(const i of [1,3,5,7])add(38,i,.16,.55);}
  else if(id==='chords'){for(const start of [0,4])for(const i of [0,2,4])add(root+intervals[i],start,3.5,.45);}
  else if(id==='bass'){for(const start of [0,2,4,6])add(root-24,start,.8,.65);}
  else{[0,2,4,2,0,2,4,0].forEach((i,start)=>add(root+intervals[i],start,.65,start%4===0?.65:.5));}
  t.clips.push(c);return t;
}

export function assessLesson(id,p) {
  const notes=t=>t.clips.flatMap(c=>c.notes.map(n=>({...n,start:n.start+c.start})));
  if(id==='pulse'){const d=p.tracks.filter(t=>t.instrument==='drums').flatMap(notes);return d.some(n=>n.pitch===36)&&d.some(n=>n.pitch===38)?'Your project has kick and snare notes. Play them and count four beats per bar. Does the snare land where you intended?':'Add a drum track with a kick and snare. Try the practice pattern, then change one hit.';}
  if(id==='melody'){const n=p.tracks.filter(t=>!['audio','drums','bass'].includes(t.instrument)).flatMap(notes);return new Set(n.map(x=>x.pitch)).size>=3?'You have at least three different pitched notes. Listen for a repeated idea and a little breathing space.':'Try three or four different notes in the piano roll. Leave a gap between phrases.';}
  if(id==='chords'){const chord=p.tracks.filter(t=>!['audio','drums'].includes(t.instrument)).some(t=>{const groups=new Map();for(const n of notes(t)){const k=Math.round(n.start*20);if(!groups.has(k))groups.set(k,new Set());groups.get(k).add(n.pitch%12);}return [...groups.values()].some(g=>g.size>=3);});return chord?'Your project has a group of at least three pitch classes starting together. Listen to it on its own, then in the full loop.':'Place three different notes at the same start time. Try scale notes 1, 3 and 5.';}
  if(id==='bass')return p.tracks.some(t=>t.instrument==='bass'&&notes(t).length)?'There is a bass part. Listen with the drums: does it support the pulse and leave room for the kick?':'Add a bass part and try the root on beats 1 and 3.';
  if(id==='arrange')return p.tracks.some(t=>t.clips.some(c=>c.start>0))?'Some clips begin later in the timeline. Listen to the transitions; a later clip alone does not guarantee a finished arrangement.':'Move a clip later in the timeline so a part enters after the opening.';
  if(id==='mix')return 'The project has '+p.tracks.length+' tracks. Use the live meters while listening. Clip layout alone cannot prove the balance or headroom is right.';
  return 'Save the editable project and export from Deliverables. After exporting, check the actual WAV; this coach does not infer a successful export from your clip layout.';
}

export function localGuidance(question,p,current='pulse') {
  const q=question.toLowerCase();let id=current;
  for(const [topic,terms]of [['pulse',/beat|tempo|bpm|drum|rhythm|snare|kick/],['chords',/chord|triad|harmon|major|minor/],['bass',/bass|low end/],['melody',/melod|scale|pitch|note|piano/],['arrange',/arrang|song|structure|intro|loop/],['mix',/mix|volume|loud|eq|effect|pan|compress|reverb/],['export',/save|export|wav|finish/]])if(terms.test(q)){id=topic;break;}
  const l=lessons.find(l=>l.id===id)||lessons[0],c=learningContext(p);
  return {lesson:id,text:l.idea+'\n\nIn your project: '+c.bpm+' BPM, '+c.root+' '+c.scale.toLowerCase()+', '+c.tracks.length+' tracks. '+l.task+'\n\n'+assessLesson(id,p),kind:'Guided answer · local music theory'};
}
