import { openActivity } from './coach.js';

/** Time-based, silent paddle game. It never touches the musical transport. */
export class RallyState {
  constructor(){this.restart();}
  restart(){this.paddle=.5;this.target=.5;this.ball={x:.5,y:.73,vx:.17,vy:-.26};this.blocks=Array.from({length:24},(_,i)=>({x:.075+(i%8)*.109,y:.15+Math.floor(i/8)*.065,alive:true}));this.score=0;this.round=1;this.returns=0;}
  serve(){this.ball={x:this.paddle,y:.74,vx:(this.returns%2?-.17:.17),vy:-.26};}
  step(dt,direction=0){
    dt=Math.max(0,Math.min(.032,dt));this.target=Math.max(.09,Math.min(.91,this.target+direction*dt*.65));this.paddle+=(this.target-this.paddle)*(1-Math.exp(-18*dt));const b=this.ball;
    b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<.016){b.x=.016;b.vx=Math.abs(b.vx);}if(b.x>.984){b.x=.984;b.vx=-Math.abs(b.vx);}if(b.y<.025){b.y=.025;b.vy=Math.abs(b.vy);}
    if(b.vy>0&&b.y>.817&&b.y<.858&&Math.abs(b.x-this.paddle)<.105){b.y=.817;b.vy=-Math.abs(b.vy);b.vx=(b.x-this.paddle)*2.2;}
    for(const block of this.blocks){if(!block.alive)continue;if(b.x>block.x-.012&&b.x<block.x+.098&&b.y>block.y-.018&&b.y<block.y+.044){block.alive=false;b.vy=-b.vy;this.score+=10;break;}}
    if(b.y>1.04){this.returns++;this.serve();}
    if(this.blocks.every(b=>!b.alive)){this.round++;this.blocks.forEach(b=>b.alive=true);this.serve();}
  }
}

export class ChillGame {
  constructor(studio,house){
    this.s=studio;this.house=house;this.state=new RallyState();this.running=false;this.keys=new Set();this.last=0;this.high=0;this.lastHud=0;
    try{this.high=Math.max(0,Math.min(999999,Number(localStorage.getItem('aura-rally-best'))||0));}catch{}
    this.dialog=document.createElement('dialog');this.dialog.id='chillGame';this.dialog.className='activityDialog chillGame';
    this.dialog.innerHTML='<header class="activityHeader"><div><small>AURA / LIVING ROOM CONSOLE</small><h2>Sundown Rally.</h2></div><button id="gameClose" aria-label="Close living-room game">×</button></header><div class="gameScore"><span>Score <b id="gameScore">0</b></span><span>Round <b id="gameRound">1</b></span><span>Best <b id="gameBest">0</b></span></div><canvas id="rallyCanvas" width="960" height="540" tabindex="0" aria-label="Sundown Rally. Move the paddle with the left and right arrow keys, mouse, touch, or a connected gamepad. Space pauses. No lives limit."></canvas><div class="gameControls"><button id="gameStart" class="activityPrimary">Play game</button><button id="gameRestart">New game</button><p>Mouse, touch or ← → to move. Space to pause. Miss a ball? Keep going.</p></div><footer class="activityFooter"><div><b id="gameProject"></b><span id="gameMusicState" role="status"></span></div><button id="gameMusic">Listen to project</button></footer>';
    document.body.append(this.dialog);this.canvas=this.dialog.querySelector('#rallyCanvas');this.ctx=this.canvas.getContext('2d');
    this.dialog.querySelector('#gameClose').onclick=()=>this.dialog.close();this.dialog.querySelector('#gameStart').onclick=()=>this.toggle();
    this.dialog.querySelector('#gameRestart').onclick=()=>{this.state.restart();this.updateHud();this.draw();};
    this.dialog.querySelector('#gameMusic').onclick=async()=>{try{if(studio.engine.playing)studio.engine.pause();else await studio.engine.play(studio.getProject());this.updateHud();}catch(e){studio.toast(e.message);}};
    const move=e=>{const box=this.canvas.getBoundingClientRect();this.state.target=Math.max(.09,Math.min(.91,(e.clientX-box.left)/box.width));};
    this.canvas.addEventListener('pointermove',move);this.canvas.addEventListener('pointerdown',e=>{move(e);this.canvas.setPointerCapture(e.pointerId);this.canvas.focus();});
    this.dialog.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(['ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();e.stopPropagation();if(e.code==='Space'&&!e.repeat)this.toggle();else this.keys.add(e.code);}});
    this.dialog.addEventListener('keyup',e=>{this.keys.delete(e.code);});
    this.dialog.addEventListener('close',()=>this.pause());window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    studio.engine.addEventListener('transport',()=>{if(this.dialog.open)this.updateHud();});
    studio.registerCommands([['Chill in the living room · Sundown Rally','',()=>this.open()]]);
    for(const parent of [document.querySelector('.houseTopRight'),document.querySelector('#productionRoomLabel')]){const b=document.createElement('button');b.textContent='Chill';b.setAttribute('aria-label','Open the living-room game');b.onclick=()=>this.open();parent.append(b);}
    const b=document.createElement('button');b.textContent='Living-room console · play & listen';b.className='housePrimary';b.onclick=()=>this.open();document.querySelector('#roomMap').append(b);
    this.draw();
    if(house?.architecture.gameTexture){house.architecture.gameTexture.image=this.canvas;house.architecture.gameTexture.needsUpdate=true;}
  }
  open(){openActivity(this.dialog,this.house);this.dialog.scrollTop=0;this.updateHud();this.draw();this.canvas.focus({preventScroll:true});}
  toggle(){if(this.running)return this.pause();this.running=true;this.last=performance.now();this.dialog.querySelector('#gameStart').textContent='Pause game';this.canvas.focus();this.raf=requestAnimationFrame(t=>this.frame(t));}
  pause(){this.running=false;this.keys.clear();cancelAnimationFrame(this.raf);this.dialog.querySelector('#gameStart').textContent=this.state.score?'Resume game':'Play game';this.draw();}
  /** The same game, shown on the living-room wall instead of in a sheet. */
  enterWorld(){this.inWorld=true;this.draw();}
  leaveWorld(){this.inWorld=false;this.pause();}
  frame(t){if(!this.running||!(this.dialog.open||this.inWorld))return;const dt=(t-this.last)/1000;this.last=t;let direction=Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft'));
    // Gamepad input belongs only to the focused game, never to the house camera.
    for(const g of navigator.getGamepads?.()||[]){if(g?.connected){const x=g.axes[0]||0;if(Math.abs(x)>.15)direction=x;direction+=(g.buttons[15]?.pressed?1:0)-(g.buttons[14]?.pressed?1:0);break;}}
    this.state.step(dt,Math.max(-1,Math.min(1,direction)));this.draw();if(t-this.lastHud>150){this.lastHud=t;this.updateHud();}this.raf=requestAnimationFrame(v=>this.frame(v));
  }
  updateHud(){const q=s=>this.dialog.querySelector(s);q('#gameScore').textContent=this.state.score;q('#gameRound').textContent=this.state.round;
    if(this.state.score>this.high){this.high=this.state.score;try{localStorage.setItem('aura-rally-best',String(this.high));}catch{}}
    q('#gameBest').textContent=this.high;q('#gameProject').textContent=this.s.getProject().name;q('#gameMusicState').textContent=this.s.engine.playing?'Your project is playing. Game audio is silent.':'Project paused. The game is silent.';q('#gameMusic').textContent=this.s.engine.playing?'Pause music':'Listen to project';
  }
  draw(){const c=this.ctx,w=this.canvas.width,h=this.canvas.height,s=this.state;c.fillStyle='#122522';c.fillRect(0,0,w,h);const glow=c.createRadialGradient(w*.5,h*.6,10,w*.5,h*.6,w*.65);glow.addColorStop(0,'#294c43');glow.addColorStop(1,'#122522');c.fillStyle=glow;c.fillRect(0,0,w,h);
    c.strokeStyle='#759b8519';c.lineWidth=1;for(let x=40;x<w;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=40;y<h;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    for(const [i,b]of s.blocks.entries()){if(!b.alive)continue;c.fillStyle=['#d7bc86','#b7cba6','#809f96'][Math.floor(i/8)];c.beginPath();c.roundRect(b.x*w,b.y*h,w*.086,h*.038,5);c.fill();}
    c.fillStyle='#f4e6c8';c.beginPath();c.roundRect((s.paddle-.09)*w,h*.85,w*.18,9,4);c.fill();c.beginPath();c.arc(s.ball.x*w,s.ball.y*h,7,0,Math.PI*2);c.fill();
    c.fillStyle='#b6c2ac';c.font='14px system-ui';c.textAlign='center';c.fillText('S U N D O W N   R A L L Y',w/2,h*.068);
    if(!this.running){c.fillStyle='#10221ccc';c.fillRect(w*.18,h*.42,w*.64,h*.21);c.fillStyle='#f4e6c8';c.font='26px system-ui';c.fillText(this.state.score?'Take your time.':'A little play. Your own soundtrack.',w/2,h*.51);c.font='16px system-ui';c.fillText('Press Play game or Space',w/2,h*.58);}
    if(this.house?.architecture.gameTexture)this.house.architecture.gameTexture.needsUpdate=true;
  }
}
