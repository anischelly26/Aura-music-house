import { lessons, practiceTrack, assessLesson, localGuidance, learningContext } from './learning.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openActivity(dialog,house) {
  document.exitPointerLock?.();house?.keys.clear();
  if(house){house.journey=null;house.walkTarget=null;house.velocity.set(0,0);}
  for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
  if(!dialog.open)dialog.showModal();
}

export class MusicCoach {
  constructor(studio,house) {
    this.s=studio;this.house=house;this.lesson='pulse';this.messages=[];this.modelAvailable=false;this.busy=false;
    try{this.progress=JSON.parse(localStorage.getItem('aura-learning-v1')||'{}');if(!this.progress||typeof this.progress!=='object'||Array.isArray(this.progress))this.progress={};}catch{this.progress={};}
    this.dialog=document.createElement('dialog');this.dialog.id='musicCoach';this.dialog.className='activityDialog musicCoach';
    this.dialog.innerHTML='<header class="activityHeader"><div><small>AURA / MUSIC COACH</small><h2>Make your first idea.</h2></div><button data-coach-close aria-label="Close music coach">×</button></header><div class="coachLayout"><nav class="coachLessons" aria-label="Music lessons"></nav><section class="coachLesson"></section><aside class="coachConversation"><div class="coachMode">Guided coach · works offline</div><div class="coachMessages" role="log" aria-label="Conversation" aria-live="polite"></div><form id="coachQuestionForm"><label for="coachQuestion">What would you like to learn?</label><textarea id="coachQuestion" rows="2" maxlength="1000" placeholder="How do I start a drum beat?"></textarea><label class="coachAiChoice" hidden><input type="checkbox" id="coachUseAi"> Use connected AI · sends a note-count and mixer summary, no audio</label><button class="activityPrimary" id="coachAsk">Ask coach</button></form><p class="coachConnection">AI chat is not connected. Guided answers and exercises are available.</p></aside></div><footer class="activityFooter"><span id="coachStatus" role="status">Exercises add a separate practice track. Your existing parts stay in place.</span><button id="coachUndo">Undo edit</button><button id="coachListen">Listen to project</button></footer>';
    document.body.append(this.dialog);this.dialog.querySelector('[data-coach-close]').onclick=()=>this.dialog.close();
    this.dialog.addEventListener('close',()=>{this.request?.abort();this.request=null;this.busy=false;this.dialog.querySelector('#coachAsk').disabled=false;});
    this.dialog.querySelector('#coachUndo').onclick=()=>{studio.store.undo();this.status('Undid the latest project edit.');};
    this.dialog.querySelector('#coachListen').onclick=()=>this.safe(async()=>{if(studio.engine.playing)studio.engine.pause();else await studio.engine.play(studio.getProject());this.updateListen();});
    studio.engine.addEventListener('transport',()=>this.updateListen());
    this.dialog.querySelector('#coachQuestionForm').onsubmit=e=>{e.preventDefault();this.ask();};
    this.addMessage('coach','Start with a short lesson. Hear a practice part, change it in the real editor, and check your understanding. You can also ask about beats, notes, chords, bass, arranging, mixing or export.','Guided coach');
    for(const parent of [document.querySelector('.houseTopRight'),document.querySelector('#productionRoomLabel')]){const b=document.createElement('button');b.textContent='Learn';b.setAttribute('aria-label','Learn music with the coach');b.onclick=()=>this.open();parent.append(b);}
    const map=document.querySelector('#roomMap');const b=document.createElement('button');b.textContent='Learn music · guided lessons';b.className='housePrimary';b.onclick=()=>this.open();map.append(b);
    studio.registerCommands([['Learn music with the coach','',()=>this.open()],...lessons.map(l=>['Lesson: '+l.title,'',()=>this.open(l.id)])]);
    // A missing provider never prevents local lessons or demands credentials in the browser.
    if(location.protocol!=='file:'&&(typeof __AURA_COACH_SERVER__==='undefined'||__AURA_COACH_SERVER__))fetch('/api/coach',{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).then(v=>{this.modelAvailable=v?.available===true;this.dialog.querySelector('.coachAiChoice').hidden=!this.modelAvailable;this.dialog.querySelector('.coachConnection').textContent=this.modelAvailable?'AI is connected. Choose it above to send your question and a small project summary.':'AI chat is not connected. Guided answers and exercises are available.';}).catch(()=>{});
  }
  status(s){this.dialog.querySelector('#coachStatus').textContent=s;}
  async safe(fn){try{await fn();}catch(e){this.status(e.message);this.s.toast(e.message);}}
  updateListen(){this.dialog.querySelector('#coachListen').textContent=this.s.engine.playing?'Pause project':'Listen to project';}
  open(id=this.lesson){this.lesson=lessons.some(l=>l.id===id)?id:'pulse';this.render();openActivity(this.dialog,this.house);this.dialog.scrollTop=0;this.updateListen();}
  render(){
    const focusId=this.dialog.contains(document.activeElement)?document.activeElement.id:null,focusLesson=document.activeElement?.dataset?.lesson;
    const l=lessons.find(l=>l.id===this.lesson),p=this.s.getProject(),context=learningContext(p);
    this.dialog.querySelector('.coachLessons').innerHTML=lessons.map((v,i)=>`<button data-lesson="${v.id}" ${v.id===l.id?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span><span>${esc(v.title)}<small>${v.time}${this.progress[v.id]?' · Question answered':''}</small></span></button>`).join('');
    this.dialog.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>{this.lesson=b.dataset.lesson;this.render();});
    this.dialog.querySelector('.coachLesson').innerHTML=`<small class="lessonEyebrow">${esc(context.root+' '+context.scale)} / ${p.bpm} BPM / ${p.tracks.length} TRACKS</small><h3>${esc(l.title)}</h3><p>${esc(l.idea)}</p><div class="lessonTask"><small>TRY IT IN YOUR PROJECT</small><p>${esc(l.task)}</p></div><div class="lessonActions">${['pulse','melody','chords','bass'].includes(l.id)?'<button id="coachPractice" class="activityPrimary">Add or open practice track</button>':''}<button id="coachEditor">Open ${l.room==='rhythm'?'drum editor':l.room==='living'?'mixer':l.room==='terrace'?'Deliverables':'music editor'}</button><button id="coachCheck">Check my project</button></div><p id="coachAssessment" class="lessonFeedback" role="status"></p><fieldset class="lessonQuiz"><legend>${esc(l.question)}</legend>${l.choices.map((v,i)=>`<button data-answer="${i}">${esc(v)}</button>`).join('')}<p id="coachQuizFeedback" role="status">${this.progress[l.id]?'You answered this question. Try the idea in your own music.':''}</p></fieldset>`;
    const practice=this.dialog.querySelector('#coachPractice');if(practice)practice.onclick=()=>this.safe(()=>{
      const project=this.s.getProject(),name='Practice · '+l.title;let t=project.tracks.find(t=>t.name===name);
      if(!t){if(project.tracks.length>=64)throw Error('The project has 64 tracks. Remove a track before adding a practice part.');t=practiceTrack(l.id,project);this.s.commit('Add '+l.title+' practice',()=>project.tracks.push(t));}
      this.s.select(t.id,t.clips[0]?.id);this.status('Practice track selected. Listen, then open the editor to make it your own.');this.render();
    });
    this.dialog.querySelector('#coachEditor').onclick=()=>{this.dialog.close();if(l.id==='export')window.aura.workbench.open('export');else this.house?.production(l.room);};
    this.dialog.querySelector('#coachCheck').onclick=()=>{this.dialog.querySelector('#coachAssessment').textContent=assessLesson(l.id,this.s.getProject());};
    this.dialog.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{const correct=Number(b.dataset.answer)===l.answer;this.dialog.querySelector('#coachQuizFeedback').textContent=(correct?'That’s right. ':'Try again. ')+l.why;if(correct){this.progress[l.id]=true;try{localStorage.setItem('aura-learning-v1',JSON.stringify(this.progress));}catch{}b.setAttribute('aria-pressed','true');this.status('Question answered. Listening and experimenting are the next step.');}});
    const focused=focusId?this.dialog.querySelector('#'+CSS.escape(focusId)):focusLesson?this.dialog.querySelector('[data-lesson="'+focusLesson+'"]'):null;focused?.focus({preventScroll:true});
  }
  addMessage(role,text,kind){this.messages.push({role,text,kind});this.messages=this.messages.slice(-20);const log=this.dialog.querySelector('.coachMessages');log.innerHTML=this.messages.map(m=>`<article class="coachMessage ${m.role}"><small>${esc(m.role==='user'?'You':m.kind||'Coach')}</small><p>${esc(m.text)}</p></article>`).join('');log.scrollTop=log.scrollHeight;}
  async ask(){
    if(this.busy)return;const input=this.dialog.querySelector('#coachQuestion'),q=input.value.trim();if(!q)return;
    this.addMessage('user',q);input.value='';const useAi=this.modelAvailable&&this.dialog.querySelector('#coachUseAi').checked;
    if(!useAi){const reply=localGuidance(q,this.s.getProject(),this.lesson);this.addMessage('coach',reply.text,reply.kind);return;}
    const request=new AbortController();this.request=request;this.busy=true;this.dialog.querySelector('#coachAsk').disabled=true;this.status('Coach is thinking…');const timeout=setTimeout(()=>request.abort(),25000);
    try{const response=await fetch('/api/coach',{method:'POST',headers:{'Content-Type':'application/json'},signal:request.signal,body:JSON.stringify({question:q,context:learningContext(this.s.getProject()),history:this.messages.slice(-7,-1).map(({role,text})=>({role:role==='coach'?'assistant':'user',text:text.slice(0,1800)}))})});if(!response.ok)throw Error(response.status===503?'AI connection is unavailable.':'AI could not answer this request.');const value=await response.json();if(typeof value.answer!=='string'||!value.answer.trim())throw Error('The AI returned an empty answer.');if(this.dialog.open)this.addMessage('coach',value.answer.slice(0,8000),'Connected AI · project summary only');this.status('Suggestions do not change your project. Use the practice buttons to make edits.');}
    catch(e){if(this.dialog.open&&this.request===request){const local=localGuidance(q,this.s.getProject(),this.lesson);this.addMessage('coach',(e.name==='AbortError'?'The AI request timed out.':e.message)+'\n\n'+local.text,local.kind);this.status('Guided help remains available.');}}
    finally{clearTimeout(timeout);if(this.request===request){this.request=null;this.busy=false;this.dialog.querySelector('#coachAsk').disabled=false;}}
  }
}
