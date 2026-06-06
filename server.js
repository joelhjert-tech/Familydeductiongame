const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const qs   = require('querystring');
const crypto = require('crypto');

// Load .env
try { fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^([^#=\s]+)\s*=\s*(.*)$/);if(m)process.env[m[1].trim()]=m[2].trim();}); } catch{}

const PORT=3000;
const ASSETS_DIR=path.join(__dirname,'assets');
if(!fs.existsSync(ASSETS_DIR))fs.mkdirSync(ASSETS_DIR);

const NAME_TO_ID={
  'writing.png':'0b0894bf-79e7-4e2a-a460-95b185da2830','drawing.png':'92ada771-4a30-4db2-9e17-81b869d8fbe1',
  'deliberation.png':'d82d17c4-0847-4083-bd9c-0a2f8ca73e62','opinion.png':'472101dd-f4b6-427b-baca-63982eb896bc',
  'bioscanner.png':'398450fc-1cda-4850-aacf-87a07a005b3e','crisis.png':'12a1826b-eb0b-4e47-8257-2ac1e68a17dc',
  'checksum.png':'fbcb0f40-76b7-4163-9d30-dc9e5ab57eeb','quarantine.png':'555b43d6-2c55-4794-a1c9-c95be10a55fa',
  'blackbox.png':'4e55d4f0-c694-4446-870c-f97b06ba3338','pushbutton.png':'fcaeeaef-328d-422f-bf87-faa93b3efbe4',
};
const CHAR_URLS={
  'knight.png':'https://backblaze.pixellab.ai/file/pixellab-characters/b3b53404-3d3a-4268-9eb3-f71905c50f2e/74d5e44a-35a0-46cd-acfa-a7a7d53cb285/rotations/south.png',
  'impostor.png':'https://backblaze.pixellab.ai/file/pixellab-characters/b3b53404-3d3a-4268-9eb3-f71905c50f2e/73678f99-1104-47b5-8deb-5a974c3f86a5/rotations/south.png',
};

const PLAYER_COLORS=['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c','#e67e22','#bdc3c7','#e91e63','#cddc39'];
const isAlivePlayer=name=>G.players.some(p=>p.name===name&&p.alive);
const aliveNames=()=>G.players.filter(p=>p.alive).map(p=>p.name);
const voterNames=()=>G.players.filter(p=>p.alive&&p.connected).map(p=>p.name);
const newToken=()=>crypto.randomBytes(16).toString('hex');
const cleanName=name=>String(name||'').trim().replace(/[<>"'`\\]/g,'').slice(0,14);

// ═══════════════════════════════ ROOMS ═══════════════════════════════
const ROOMS={
  writing:{id:'writing',name:'Writing Chamber',icon:'writing',testeeRange:[2,4],timerSeconds:30,
    prompts:[
      {human:'Name one thing you would grab during a castle fire alarm.',alien:'Name one thing you would grab during a surprise feast.'},
      {human:'Write the first excuse a guilty courtier would make.',alien:'Write the first excuse a tired courtier would make.'},
      {human:'Describe a trustworthy steward in five words or fewer.',alien:'Describe a popular steward in five words or fewer.'},
      {human:'What object would you hide if royal inspectors entered your chamber?',alien:'What object would you display if royal inspectors entered your chamber?'},
    ]},
  drawing:{id:'drawing',name:'Drawing Quarters',icon:'drawing',testeeRange:[2,4],timerSeconds:35,
    prompts:[
      {human:'Draw a guard protecting treasure.',alien:'Draw a thief stealing treasure.'},
      {human:'Draw a wizard casting a healing spell.',alien:'Draw a wizard casting an attack spell.'},
      {human:'Draw a castle escaping danger.',alien:'Draw a castle under attack.'},
      {human:'Draw the hidden postern gate symbol.',alien:'Draw the main gate symbol.'},
    ]},
  deliberation:{id:'deliberation',name:'Council Chamber',icon:'deliberation',testeeRange:[2,4],timerSeconds:20,
    prompts:[
      {human:'Smoke is filling the sleeping quarters. The mason is 20 minutes away.',alien:'Water is flooding the storage cellar. The mason is 20 minutes away.',choices:['Seal the room now','Send two guards inside','Ignore until help arrives']},
      {human:'A raven may be from survivors beyond the wall, but answering costs six hours.',alien:'A raven may be a trap beyond the wall, but answering costs six hours.',choices:['Answer immediately','Send a messenger and continue','Investigate from a distance']},
      {human:'The lord is missing during a furnace alarm.',alien:'The lord is asleep during a furnace alarm.',choices:['Wake or search for the lord first','Let the blacksmith decide','Call a full court vote']},
    ]},
  opinion:{id:'opinion',name:'Opinion Hall',icon:'opinion',testeeRange:[2,4],timerSeconds:15,
    prompts:[
      {human:'A suspicious friend deserves one more chance before being accused.',alien:'A useful friend deserves one more chance before being accused.'},
      {human:'The lord should sacrifice one person to save the whole court.',alien:'The lord should risk one person to save the whole court.'},
      {human:'In an emergency, speed matters more than being fair.',alien:'In an emergency, secrecy matters more than being fair.'},
      {human:'Someone who panics is more suspicious than someone who stays quiet.',alien:'Someone who stays quiet is more suspicious than someone who panics.'},
    ]},
  bioscanner:{id:'bioscanner',name:'Oath Mirror',icon:'bioscanner',testeeRange:[2,2],timerSeconds:40,hackImmune:true,
    prompts:[
      {captain:'Both players must report the three royal seals in order.',items:['CROWN','KEY','SUN','MOON','ROSE','BELL','RING','TREE']},
      {captain:'Both players must report the three life signs in order.',items:['HEART','EYE','HAND','STAR','WAVE','FLAME','STONE','LEAF']},
    ]},
  crisis:{id:'crisis',name:'Crisis Council',icon:'crisis',testeeRange:[2,4],timerSeconds:35,
    prompts:[
      {human:'Smoke is spreading while raiders gather at the gate. Rank first to last:',alien:'The gate chain is failing while raiders gather outside. Rank first to last:',items:['Secure the gate','Fix the main problem','Wake the healer','Send a raven']},
      {human:'A fire alarm sounds near sleeping servants. Rank first to last:',alien:'A theft alarm sounds near sleeping servants. Rank first to last:',items:['Sound general alarm','Seal the doors','Send one scout','Evacuate section']},
      {human:'Food stores are spoiled before a siege. Rank first to last:',alien:'Medical stores are spoiled before a siege. Rank first to last:',items:['Isolate supplies','Check servant symptoms','Call nearby abbey','Ration remaining stock']},
    ]},
  checksum:{id:'checksum',name:'Cipher Relay',icon:'checksum',testeeRange:[2,2],timerSeconds:35,
    prompts:[
      {captain:'Memorize and report three gate codes in order.',items:['A1','B2','C3','D4','E5','F6','G7','H8','J9','K0']},
      {captain:'Memorize and report three banner colors in order.',items:['RED','BLUE','GOLD','GREEN','WHITE','BLACK','SILVER','VIOLET','AMBER','CYAN']},
      {captain:'Memorize and report three treasury stamps in order.',items:['WAX','IRON','SALT','GLASS','BONE','SILK','WOOD','COAL','PEARL','CLAY']},
    ]},
  quarantine:{id:'quarantine',name:'Apothecary Ward',icon:'quarantine',testeeRange:[2,4],timerSeconds:35,
    prompts:[
      {human:{a:'SAFE TO TOUCH',b:'NEEDS GLOVES'},alien:{a:'VALUABLE',b:'WORTHLESS'},items:['Cracked visor','Silver wrench','Moss sample','Sealed bread','Damp glove','Royal goblet']},
      {human:{a:'KEEP ABOARD',b:'THROW OVERBOARD'},alien:{a:'PROOF OF GUILT',b:'HARMLESS CLUTTER'},items:['Bloody towel','Empty vial','Captain note','Broken lantern','Fresh apple','Locked box']},
      {human:{a:'CLEAN',b:'CONTAMINATED'},alien:{a:'MAGICAL',b:'ORDINARY'},items:['Blue crystal','Rusty chain','Wet boots','Glowing coin','Medic bag','Old map']},
    ]},
  'dungeon-trial':{id:'dungeon-trial',name:'The Dungeon Trial',icon:'deliberation',testeeRange:[2,4],timerSeconds:30,
    questions:[
      {question:'Which weapon would a knight most likely use in a joust?',options:['Lance','Dagger','Sling','Fishing spear'],correctIndex:0},
      {question:'What was a blacksmith most known for making?',options:['Bread','Metal tools','Wine','Books'],correctIndex:1},
      {question:'Which building would most likely have a dungeon?',options:['Castle','Windmill','Bakery','Barn'],correctIndex:0},
      {question:'What does a shield mainly protect against?',options:['Rain','Attacks','Taxes','Hunger'],correctIndex:1},
      {question:'What would a royal messenger most likely carry?',options:['A sealed letter','A fishing net','A loaf of bread','A shovel'],correctIndex:0},
      {question:'Which person would most likely work in a castle kitchen?',options:['Cook','Knight','Jester','Guard captain'],correctIndex:0},
      {question:'What is a moat used for?',options:['Defense','Cooking','Writing','Trading'],correctIndex:0},
      {question:'Which item would a wizard most likely use?',options:['Spellbook','Hammer','Fishing rod','Saddle'],correctIndex:0},
    ],
    prompts:[{dummy:true}]},
  'royal-whisper':{id:'royal-whisper',name:'The Royal Whisper',icon:'writing',testeeRange:[2,4],timerSeconds:45,
    wordPairs:[
      {trueWord:'dragon',cursedWord:'lizard'},{trueWord:'castle',cursedWord:'tower'},
      {trueWord:'knight',cursedWord:'guard'},{trueWord:'wizard',cursedWord:'scholar'},
      {trueWord:'sword',cursedWord:'dagger'},{trueWord:'crown',cursedWord:'helmet'},
      {trueWord:'goblin',cursedWord:'orc'},{trueWord:'treasure',cursedWord:'gold'},
      {trueWord:'dungeon',cursedWord:'prison'},{trueWord:'horse',cursedWord:'donkey'},
      {trueWord:'king',cursedWord:'lord'},{trueWord:'witch',cursedWord:'healer'},
      {trueWord:'vampire',cursedWord:'bat'},{trueWord:'shield',cursedWord:'armor'},
      {trueWord:'potion',cursedWord:'soup'},{trueWord:'blacksmith',cursedWord:'carpenter'},
      {trueWord:'princess',cursedWord:'queen'},{trueWord:'jester',cursedWord:'bard'},
      {trueWord:'tavern',cursedWord:'inn'},{trueWord:'spellbook',cursedWord:'diary'},
    ],
    prompts:[{dummy:true}]},
  'herald-chain':{id:'herald-chain',name:"The Herald's Chain",icon:'writing',testeeRange:[2,4],timerSeconds:35,
    wordPairs:[
      {seed:'fire',alienSeed:'flood'},{seed:'crown',alienSeed:'chain'},
      {seed:'dragon',alienSeed:'worm'},{seed:'feast',alienSeed:'famine'},
      {seed:'shield',alienSeed:'target'},{seed:'gold',alienSeed:'rust'},
      {seed:'sword',alienSeed:'quill'},{seed:'castle',alienSeed:'ruin'},
      {seed:'knight',alienSeed:'thief'},{seed:'victory',alienSeed:'defeat'},
      {seed:'moon',alienSeed:'shadow'},{seed:'river',alienSeed:'swamp'},
    ],
    prompts:[{dummy:true}]},
  'throne-vote':{id:'throne-vote',name:'The Throne Room',icon:'deliberation',testeeRange:[2,4],timerSeconds:20,
    statements:[
      {human:'A strong king must sometimes break the rules.',alien:'Rules only exist to protect the powerful.'},
      {human:'The castle walls keep us safe from danger.',alien:'The castle walls trap those who live inside.'},
      {human:'A loyal knight always follows the king\'s orders.',alien:'A loyal knight always questions the king\'s orders.'},
      {human:'Gold is the foundation of a kingdom\'s strength.',alien:'Gold is the root of a kingdom\'s corruption.'},
      {human:'The dungeon is a necessary place of justice.',alien:'The dungeon is a place of cruelty, not justice.'},
      {human:'All knights are equal before the king.',alien:'Some knights are always more equal than others.'},
      {human:'Magic should be shared freely with the kingdom.',alien:'Magic is a weapon — it must be kept secret.'},
      {human:'A fair trial protects the innocent.',alien:'A fair trial is just a show for the crowd.'},
    ],
    prompts:[{dummy:true}]},
  blackbox:{id:'blackbox',name:'Royal Archive Recall',icon:'blackbox',testeeRange:[2,3],timerSeconds:30,latePool:true,
    prompts:[
      {snapshot:{header:'Gate Log 22B',Courier:'Nereid',Destination:'East Tower','Seal color':'Amber','Guards posted':'3'},alien_diff:{Route:'East Tower',Destination:'West Tower'},question:'What location was listed as the destination?',options:['East Tower','West Tower','North Gate','South Hall']},
      {snapshot:{header:'Pantry Ledger 7C',Crate:'Unit 44',Contents:'Medical herbs','Storage place':'Cold cellar','Seal intact':'Yes'},alien_diff:{Contents:'Royal herbs','Storage place':'Dry pantry'},question:'Where were the herbs stored?',options:['Cold cellar','Dry pantry','Wine vault','Stable loft']},
      {snapshot:{header:'Guard Report 9A',Suspect:'None','Missing item':'Brass key','Last room':'Armory'},alien_diff:{'Missing item':'Silver key'},question:'Which item was missing?',options:['Brass key','Silver key','Gold coin','Iron ring']},
    ]},
};

// ═══════════════════════════════ SSE ═══════════════════════════════
const clients=new Map(); let cid=0;
function sse(res,ev,data){try{res.write(`event:${ev}\ndata:${JSON.stringify(data)}\n\n`);}catch{}}
function toAll(ev,d){for(const[,c]of clients)sse(c.res,ev,d);}
function toHost(ev,d){for(const[,c]of clients)if(c.type==='host')sse(c.res,ev,d);}
function toPlayer(name,ev,d){for(const[,c]of clients)if(c.type==='player'&&c.name===name)sse(c.res,ev,d);}

// ═══════════════════════════════ GAME STATE ═══════════════════════════════
function fresh(){
  return{phase:'lobby',players:[],round:0,captainIdx:0,selectedRoom:null,selectedTestees:[],
    answers:{},probeHistory:[],shipTimerMax:0,shipTimerLeft:0,
    activeHacks:{},usedHacks:{},buttonPushersUsed:new Set(),
    extraction:{pusher:null,suspects:[],votes:{}},roomTesteeIdx:0,
    royalWhisperPair:null,royalWhisperSecrets:{},
    dungeon:null,heraldPair:null,throneVote:null,testMode:false};
}
let G=fresh(),shipInt=null,roomInt=null,roomLeft=0;

const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const alive=()=>G.players.filter(p=>p.alive);
const captain=()=>{const a=alive();return a[G.captainIdx%Math.max(a.length,1)];};

function pubState(){
  const c=captain();
  return{
    phase:G.phase,round:G.round,captainName:c?.name,captainColor:c?.color,
    selectedRoom:G.selectedRoom,selectedRoomName:G.selectedRoom?ROOMS[G.selectedRoom]?.name:null,
    selectedTestees:G.selectedTestees,roomTesteeIdx:G.roomTesteeIdx,
    currentTestee:G.selectedTestees[G.roomTesteeIdx],
    shipTimerLeft:G.shipTimerLeft,shipTimerMax:G.shipTimerMax,roomTimerLeft:roomLeft,
    extraction:G.extraction,probeHistory:G.probeHistory,
    buttonPushersUsed:[...G.buttonPushersUsed],
    requiredVotes:G.phase==='extraction'?voterNames().length:0,
    players:G.players.map(p=>({name:p.name,color:p.color,alive:p.alive,connected:p.connected,
      isTestee:G.selectedTestees.includes(p.name),isBot:!!p.isBot})),
    answers:['reveal','gameover'].includes(G.phase)?G.answers:{},
    gameOverReason:G.gameOverReason,gameOverData:G.gameOverData,
    testMode:G.testMode,
    throneVote:G.throneVote?{
      answerCount:Object.keys(G.throneVote.answers||{}).length,
      statement:G.throneVote.statement.human,
      answers:['reveal','gameover'].includes(G.phase)?G.throneVote.answers:null,
    }:null,
    alienNames:G.phase==='gameover'?G.players.filter(p=>p.role==='alien').map(p=>p.name):null,
    dungeon:G.dungeon?{
      question:G.dungeon.question,
      options:G.dungeon.options,
      answerCount:Object.keys(G.dungeon.answers||{}).length,
      wrongPlayers:['dungeon-goblet','dungeon-reveal'].includes(G.phase)?G.dungeon.wrongPlayers:null,
      gobletChoices:G.phase==='dungeon-reveal'?G.dungeon.gobletChoices:null,
      gobletPoisoned:G.phase==='dungeon-reveal'?G.dungeon.gobletPoisoned:null,
      cursedThisRound:G.phase==='dungeon-reveal'?G.dungeon.cursedThisRound:null,
    }:null,
  };
}

function push(){
  const pub=pubState();
  toHost('state',pub);
  for(const p of G.players){
    const aliensLeft=p.role==='alien'?G.players.filter(x=>x.role==='alien'&&x.alive).length:null;
    toPlayer(p.name,'state',{...pub,
      myRole:p.role,myColor:p.color,myHacked:p.hacked,
      myToken:p.token,
      amCaptain:captain()?.name===p.name,
      amTestee:G.selectedTestees.includes(p.name),
      isMyTurn:G.selectedTestees[G.roomTesteeIdx]===p.name,
      canPushButton:['captain-hub','reveal','dungeon-reveal'].includes(G.phase)&&p.alive&&!p.cursed&&!G.buttonPushersUsed.has(p.name),
      canMarkSuspects:G.phase==='extraction'&&G.extraction.pusher===p.name,
      usedHacks:G.usedHacks[p.name]||0,
      alienNames:p.role==='alien'?G.players.filter(x=>x.role==='alien').map(x=>x.name):null,
      activeHacks:p.role==='alien'?G.activeHacks:null,
      myTesteeIdx:G.selectedTestees.indexOf(p.name),
      roleNames:G.phase==='gameover'?G.players.map(x=>({name:x.name,role:x.role,alive:x.alive})):null,
      isCursedSpirit:!!p.cursed,
      amInDungeon:G.selectedRoom==='dungeon-trial'&&G.selectedTestees.includes(p.name),
      myDungeonAnswer:G.dungeon?.answers?.[p.name]??null,
      myGobletChoice:G.dungeon?.gobletChoices?.[p.name]??null,
      myCorrectDungeon:G.phase==='dungeon-reveal'?(G.dungeon?.answers?.[p.name]===G.dungeon?.correctIndex):null,
      myThroneAnswer:G.throneVote?.answers?.[p.name]??null,
    });
  }
}

// ═══════════════════════════════ TIMERS ═══════════════════════════════
function startShip(){
  clearInterval(shipInt);
  shipInt=setInterval(()=>{
    G.shipTimerLeft=Math.max(0,G.shipTimerLeft-1);
    toAll('tick',{ship:G.shipTimerLeft,shipMax:G.shipTimerMax});
    if(G.shipTimerLeft<=0){clearInterval(shipInt);endGame('timer');}
  },1000);
}
function stopShip(){clearInterval(shipInt);}
function startRoom(secs,onExpire){
  roomLeft=secs;clearInterval(roomInt);
  roomInt=setInterval(()=>{
    roomLeft=Math.max(0,roomLeft-1);
    toAll('tick',{room:roomLeft});
    if(roomLeft<=0){clearInterval(roomInt);onExpire();}
  },1000);
}
function stopRoom(){clearInterval(roomInt);roomLeft=0;}

// ═══════════════════════════════ GAME FLOW ═══════════════════════════════
function sendPrompt(playerName){
  const player=G.players.find(p=>p.name===playerName);
  const room=ROOMS[G.selectedRoom];
  if(!player||!room)return;
  const isHacked=!room.hackImmune&&!!G.activeHacks[playerName];
  const isAlien=player.role==='alien';
  const showAlien=isHacked?!isAlien:isAlien;
  const pidx=(G.round-1)%room.prompts.length;
  const p=room.prompts[pidx];
  let payload={roomId:room.id,roomName:room.name,timerSeconds:room.timerSeconds};

  if(room.id==='deliberation'){
    payload.choices=p.choices;
    payload.text=showAlien?p.alien:p.human;
  } else if(room.id==='bioscanner'||room.id==='checksum'){
    payload.text=p.captain;
    let items=[...p.items];if(showAlien)items=items.slice(1).concat(items[0]);
    payload.items=items;
  } else if(room.id==='blackbox'){
    const snap=showAlien?{...p.snapshot,...p.alien_diff}:p.snapshot;
    payload.snapshot=snap;payload.question=p.question;payload.options=p.options;
    payload.text='Study the castle record carefully.';
  } else if(room.id==='quarantine'){
    const lbl=showAlien?p.alien:p.human;
    payload.labels=lbl;payload.items=[...p.items];shuffle(payload.items);
    payload.text=`Sort items: ${lbl.a} vs ${lbl.b}`;
  } else if(room.id==='crisis'){
    payload.text=showAlien?p.alien:p.human;
    payload.items=[...p.items];shuffle(payload.items);
  } else {
    payload.text=showAlien?(p.alien||p.human):p.human;
  }

  if(room.id==='herald-chain'){
    const pair=G.heraldPair||room.wordPairs[0];
    const testeeIdx=G.selectedTestees.indexOf(playerName);
    let chainWord;
    if(testeeIdx===0){
      chainWord=showAlien?pair.alienSeed:pair.seed;
    } else {
      const prevName=G.selectedTestees[testeeIdx-1];
      chainWord=G.answers[prevName]||(showAlien?pair.alienSeed:pair.seed);
    }
    payload.chainWord=chainWord;
    payload.testeeIdx=testeeIdx;
    payload.isFirst=(testeeIdx===0);
    payload.text='';
  }
  if(room.id==='royal-whisper'){
    const pair=G.royalWhisperPair||room.wordPairs[0];
    const secretWord=showAlien?pair.cursedWord:pair.trueWord;
    G.royalWhisperSecrets=G.royalWhisperSecrets||{};
    G.royalWhisperSecrets[playerName]=secretWord;
    payload.secretWord=secretWord;
    payload.isLoyal=!showAlien;
    payload.text='';
  }

  if(isHacked){delete G.activeHacks[playerName];player.hacked=false;}
  toPlayer(playerName,'prompt',payload);
  if(player.isBot)scheduleBotForRoom(playerName,room.id);
  G.phase='room-active';push();
  startRoom(room.timerSeconds,()=>{
    if(G.selectedTestees[G.roomTesteeIdx]===playerName){
      if(!G.answers[playerName])G.answers[playerName]='(timed out)';
      nextTestee();
    }
  });
}

function nextTestee(){
  stopRoom();
  G.roomTesteeIdx++;
  if(G.roomTesteeIdx<G.selectedTestees.length){
    G.phase='room-waiting';push();
    sendPrompt(G.selectedTestees[G.roomTesteeIdx]);
  } else {
    // Build probe entry
    const room=ROOMS[G.selectedRoom],pidx=(G.round-1)%room.prompts.length,p=room.prompts[pidx];
    let hp='';
    if(room.id==='deliberation')hp=p.human;
    else if(['opinion','writing','crisis'].includes(room.id))hp=p.human;
    else if(room.id==='quarantine')hp=`${p.human.a} / ${p.human.b}`;
    else if(room.id==='blackbox')hp=p.question;
    else if(room.id==='royal-whisper')hp='Who gave testimony true to the royal word?';
    else if(room.id==='herald-chain')hp=`Chain started with: "${G.heraldPair?.seed||'?'}" — did anyone\'s words drift?`;
    else hp=p.captain||'';
    G.probeHistory.push({round:G.round,room:G.selectedRoom,humanPrompt:hp,
      entries:G.selectedTestees.map(n=>({player:n,answer:G.answers[n]||'—'}))});
    G.phase='reveal';push();
  }
}

function resolveDungeonQuestion(){
  const d=G.dungeon;if(!d)return;
  stopRoom();
  // Fill in timed-out players
  G.selectedTestees.forEach(n=>{if(d.answers[n]==null)d.answers[n]=-1;});
  const wrongPlayers=G.selectedTestees.filter(n=>d.answers[n]!==d.correctIndex);
  d.wrongPlayers=wrongPlayers;
  if(!wrongPlayers.length){
    buildDungeonProbe();
    G.phase='dungeon-reveal';push();
    setTimeout(()=>{if(G.phase==='dungeon-reveal'){G.phase='reveal';push();}},6000);
    return;
  }
  // Start goblet phase
  d.gobletChoices={};
  // Assign two goblets; one is poisoned
  d.gobletPoisoned=Math.floor(Math.random()*2);
  G.phase='dungeon-goblet';push();
  // Bots auto-choose goblet
  wrongPlayers.filter(n=>G.players.find(p=>p.name===n)?.isBot).forEach(n=>scheduleBotGoblet(n));
  // Auto-assign random goblet after 20s for non-choosers
  startRoom(20,()=>{
    wrongPlayers.forEach(n=>{if(d.gobletChoices[n]==null)d.gobletChoices[n]=Math.floor(Math.random()*2);});
    resolveGoblet();
  });
}

function resolveGoblet(){
  stopRoom();
  const d=G.dungeon;if(!d)return;
  d.cursedThisRound=[];
  d.wrongPlayers.forEach(n=>{
    if(d.gobletChoices[n]===d.gobletPoisoned){
      const p=G.players.find(x=>x.name===n);
      if(p){p.cursed=true;}
      d.cursedThisRound.push(n);
    }
  });
  buildDungeonProbe();
  G.phase='dungeon-reveal';push();
  setTimeout(()=>{if(G.phase==='dungeon-reveal'){G.phase='reveal';push();}},8000);
}

function buildDungeonProbe(){
  const d=G.dungeon;if(!d)return;
  G.probeHistory.push({round:G.round,room:'dungeon-trial',humanPrompt:d.question,
    entries:G.selectedTestees.map(n=>{
      const ans=d.answers[n];
      const correct=ans===d.correctIndex;
      const label=ans===-1||ans==null?'(timed out)':(d.options[ans]||`option ${ans}`);
      return{player:n,answer:correct?`✓ ${label}`:`✗ ${label}`};
    })
  });
}

// ═══════════════════════════════ TEST-MODE BOTS ═══════════════════════════════
const BOT_NAMES=['Sir Test','Dame Test','Lord Test'];
function scheduleBotForRoom(botName,roomId){
  const bot=G.players.find(p=>p.name===botName&&p.isBot);
  if(!bot)return;
  const delay=1400+Math.random()*2200;
  setTimeout(()=>{
    if(G.selectedRoom!==roomId)return;
    if(roomId==='dungeon-trial'){
      if(G.phase!=='room-active')return;
      action('submit-answer',{answerIndex:Math.floor(Math.random()*4)},botName,bot.token);
    } else if(G.phase!=='room-active')return;
    else if(roomId==='royal-whisper'){
      const words=['brave','ancient','mighty','fierce','cursed','loyal','swift','dark'];
      action('submit-answer',{answer:words[Math.floor(Math.random()*words.length)]},botName,bot.token);
    } else if(roomId==='deliberation'){
      const room=ROOMS[G.selectedRoom];
      const pidx=(G.round-1)%room.prompts.length;
      const choices=room.prompts[pidx]?.choices||['Agree'];
      action('submit-answer',{answer:choices[Math.floor(Math.random()*choices.length)]},botName,bot.token);
    } else if(roomId==='herald-chain'){
      const words=['shadow','blade','feast','raven','ember','stone','vale','thorn','mist','iron'];
      action('submit-answer',{answer:words[Math.floor(Math.random()*words.length)]},botName,bot.token);
    } else if(roomId==='throne-vote'){
      action('submit-answer',{rating:Math.floor(Math.random()*5)+1},botName,bot.token);
    } else if(roomId==='opinion'){
      action('submit-answer',{answer:String(Math.floor(Math.random()*5))},botName,bot.token);
    } else if(roomId==='blackbox'){
      const room=ROOMS[G.selectedRoom];const pidx=(G.round-1)%room.prompts.length;
      const opts=room.prompts[pidx]?.options||['option A'];
      action('submit-answer',{answer:`${opts[Math.floor(Math.random()*opts.length)]} (medium confidence)`},botName,bot.token);
    } else {
      action('submit-answer',{answer:'(bot test answer)'},botName,bot.token);
    }
  },delay);
}
function scheduleBotGoblet(botName){
  const bot=G.players.find(p=>p.name===botName&&p.isBot);
  if(!bot)return;
  setTimeout(()=>{
    if(G.phase!=='dungeon-goblet')return;
    action('choose-goblet',{gobletIndex:Math.floor(Math.random()*2)},botName,bot.token);
  },1200+Math.random()*1800);
}

function resolveThroneVote(){
  stopRoom();
  const t=G.throneVote;if(!t)return;
  G.probeHistory.push({round:G.round,room:'throne-vote',humanPrompt:t.statement.human,
    entries:G.selectedTestees.map(n=>{
      const r=t.answers[n];
      const stars='★'.repeat(r||0)+'☆'.repeat(5-(r||0));
      return{player:n,answer:r!=null?`${stars} (${r}/5)`:'(no answer)'};
    })
  });
  G.phase='reveal';push();
}

function nextRound(){
  G.round++;G.selectedRoom=null;G.selectedTestees=[];G.answers={};G.roomTesteeIdx=0;
  G.dungeon=null;G.heraldPair=null;G.throneVote=null;
  G.extraction={pusher:null,suspects:[],votes:{}};
  const a=alive();
  if(!a.length){endGame('no-players');return;}
  G.captainIdx=G.captainIdx%a.length;
  G.phase='captain-hub';push();
}

function endGame(reason,data=null){
  stopShip();stopRoom();
  G.phase='gameover';G.gameOverReason=reason;G.gameOverData=data;push();
}

function resetSamePlayers(){
  stopShip();stopRoom();
  const players=G.players.map((p,i)=>({
    name:p.name,
    color:p.color||PLAYER_COLORS[i%PLAYER_COLORS.length],
    role:null,
    alive:true,
    hacked:false,
    connected:p.connected,
    token:p.token||newToken(),
  }));
  G=fresh();
  G.players=players;
  push();
}

// ═══════════════════════════════ ACTION HANDLER ═══════════════════════════════
function action(type,data,fromPlayer,token=''){
  // test-mode is lobby-only and harmless — skip token check
  if(type==='test-mode'){
    console.log('[action] test-mode from',JSON.stringify(fromPlayer),'token len',token.length,'phase',G.phase);
    if(G.phase!=='lobby'){console.log('[action] test-mode rejected: phase='+G.phase);return;}
    // fall through to switch
  } else if(fromPlayer!=='__host__'){
    const actor=G.players.find(p=>p.name===fromPlayer);
    if(!actor||actor.token!==token){
      console.log('[action] token fail:',type,'from',fromPlayer,'expected',actor?.token?.slice(0,6),'got',token.slice(0,6));
      return;
    }
  }
  const cap=captain();
  const isCap=cap?.name===fromPlayer;
  switch(type){
    case 'room-select':
      if(!isCap||G.phase!=='captain-hub')return;
      if(!ROOMS[data.roomId])return;
      if(ROOMS[data.roomId]?.latePool&&G.round<3&&!G.testMode)return;
      G.selectedRoom=data.roomId;G.selectedTestees=[];push();break;
    case 'testee-toggle':{
      if(!isCap||G.phase!=='captain-hub')return;
      const r=ROOMS[G.selectedRoom];if(!r)return;
      if(!isAlivePlayer(data.name)||data.name===fromPlayer)return;
      const mx=r.testeeRange[1];
      const i=G.selectedTestees.indexOf(data.name);
      if(i>-1)G.selectedTestees.splice(i,1);
      else if(G.selectedTestees.length<mx)G.selectedTestees.push(data.name);
      push();break;}
    case 'test-mode':{
      G.testMode=true;
      const realPlayers=G.players.filter(p=>!p.isBot);
      const needed=Math.max(0,4-realPlayers.length);
      G.players=[...realPlayers];
      for(let i=0;i<needed;i++){
        const bname=BOT_NAMES[i];
        const color=PLAYER_COLORS[(realPlayers.length+i)%PLAYER_COLORS.length];
        G.players.push({name:bname,color,role:null,alive:true,hacked:false,connected:true,isBot:true,token:newToken(),cursed:false});
      }
      const tn=G.players.length;
      G.players.forEach(p=>p.role='human');
      G.players[tn-1].role='alien'; // last bot is alien
      G.players.forEach(p=>{p.alive=true;p.hacked=false;p.cursed=false;});
      G.captainIdx=0;
      G.shipTimerMax=0;G.shipTimerLeft=0;
      G.round=1; // start at round 1 so captain hub shows immediately
      G.phase='captain-hub';
      console.log('[test-mode] ready — players:', G.players.map(p=>p.name+'('+p.role+(p.isBot?',bot':'')+')').join(', '));
      push();break;}
    case 'launch-room':{
      if(!isCap||G.phase!=='captain-hub')return;
      const r=ROOMS[G.selectedRoom];if(!r)return;
      if(G.selectedTestees.length<r.testeeRange[0])return;
      G.roomTesteeIdx=0;G.answers={};
      if(r.id==='royal-whisper'){
        const pairs=r.wordPairs;
        G.royalWhisperPair=pairs[Math.floor(Math.random()*pairs.length)];
        G.royalWhisperSecrets={};
      }
      if(r.id==='herald-chain'){
        G.heraldPair=r.wordPairs[Math.floor(Math.random()*r.wordPairs.length)];
      }
      if(r.id==='throne-vote'){
        const stmt=r.statements[Math.floor(Math.random()*r.statements.length)];
        G.throneVote={statement:stmt,answers:{}};
        G.phase='room-active';push();
        G.selectedTestees.forEach(name=>{
          const player=G.players.find(p=>p.name===name);if(!player)return;
          const isAlien=player.role==='alien';
          const isHacked=!!G.activeHacks[name];
          const showAlien=isHacked?!isAlien:isAlien;
          if(isHacked){delete G.activeHacks[name];player.hacked=false;}
          toPlayer(name,'prompt',{roomId:'throne-vote',roomName:r.name,timerSeconds:r.timerSeconds,
            statement:showAlien?stmt.alien:stmt.human,isAlien:showAlien});
          if(player.isBot)scheduleBotForRoom(name,'throne-vote');
        });
        startRoom(r.timerSeconds,()=>resolveThroneVote());
        break;
      }
      if(r.id==='dungeon-trial'){
        const q=r.questions[Math.floor(Math.random()*r.questions.length)];
        G.dungeon={question:q.question,options:q.options,correctIndex:q.correctIndex,answers:{},wrongPlayers:null,gobletChoices:null,gobletPoisoned:null,cursedThisRound:null};
        G.phase='room-active';push();
        // Send question prompt to ALL testees simultaneously
        G.selectedTestees.forEach(name=>{
          const player=G.players.find(p=>p.name===name);if(!player)return;
          const isAlien=player.role==='alien';
          const isHacked=!!G.activeHacks[name];
          const showAlien=isHacked?!isAlien:isAlien;
          if(isHacked){delete G.activeHacks[name];player.hacked=false;}
          toPlayer(name,'prompt',{roomId:'dungeon-trial',roomName:r.name,timerSeconds:r.timerSeconds,
            question:q.question,options:q.options,isAlien:showAlien});
          if(player.isBot)scheduleBotForRoom(name,'dungeon-trial');
        });
        startRoom(r.timerSeconds,()=>resolveDungeonQuestion());
        break;
      }
      G.phase='room-waiting';push();
      sendPrompt(G.selectedTestees[0]);break;}
    case 'submit-answer':
      if(G.selectedRoom==='throne-vote'){
        if(!G.throneVote||G.phase!=='room-active')return;
        if(!G.selectedTestees.includes(fromPlayer))return;
        if(G.throneVote.answers[fromPlayer]!=null)return;
        const rating=parseInt(data.rating,10);
        if(isNaN(rating)||rating<1||rating>5)return;
        G.throneVote.answers[fromPlayer]=rating;
        if(G.selectedTestees.every(n=>G.throneVote.answers[n]!=null)){
          resolveThroneVote();
        } else {push();}
        break;
      }
      if(G.selectedRoom==='dungeon-trial'){
        if(!G.dungeon||G.phase!=='room-active')return;
        if(!G.selectedTestees.includes(fromPlayer))return;
        if(G.dungeon.answers[fromPlayer]!=null)return; // already answered
        const idx=parseInt(data.answerIndex,10);
        if(isNaN(idx)||idx<0||idx>3)return;
        G.dungeon.answers[fromPlayer]=idx;
        // If all testees answered, resolve early
        if(G.selectedTestees.every(n=>G.dungeon.answers[n]!=null)){
          resolveDungeonQuestion();
        } else {
          push(); // Update answer count for everyone
        }
        break;
      }
      if(G.selectedTestees[G.roomTesteeIdx]!==fromPlayer)return;
      if(G.selectedRoom==='royal-whisper'){
        const clue=(data.answer||'').trim();
        if(!clue||clue.length>30)return;
        const secret=(G.royalWhisperSecrets||{})[fromPlayer]||'';
        if(secret&&clue.toLowerCase()===secret.toLowerCase())return;
        stopRoom();G.answers[fromPlayer]=clue;nextTestee();
      } else {
        stopRoom();G.answers[fromPlayer]=data.answer||'(no answer)';nextTestee();
      }
      break;
    case 'choose-goblet':{
      if(G.phase!=='dungeon-goblet'||!G.dungeon)return;
      if(!G.dungeon.wrongPlayers.includes(fromPlayer))return;
      if(G.dungeon.gobletChoices[fromPlayer]!=null)return;
      const gi=parseInt(data.gobletIndex,10);
      if(isNaN(gi)||gi<0||gi>1)return;
      G.dungeon.gobletChoices[fromPlayer]=gi;
      // If all wrong players chose, resolve immediately
      if(G.dungeon.wrongPlayers.every(n=>G.dungeon.gobletChoices[n]!=null)){
        resolveGoblet();
      } else {
        push();
      }
      break;}
    case 'push-button':
      if(!['captain-hub','reveal','dungeon-reveal'].includes(G.phase))return;
      if(!isAlivePlayer(fromPlayer)||G.buttonPushersUsed.has(fromPlayer))return;
      G.buttonPushersUsed.add(fromPlayer);
      G.extraction={pusher:fromPlayer,suspects:[],votes:{}};
      G.phase='extraction';stopShip();stopRoom();push();break;
    case 'mark-suspect':{
      if(G.phase!=='extraction')return;
      if(fromPlayer!==G.extraction.pusher)return;
      if(!isAlivePlayer(data.name))return;
      const i=G.extraction.suspects.indexOf(data.name);
      if(i>-1)G.extraction.suspects.splice(i,1);else G.extraction.suspects.push(data.name);
      G.extraction.votes={};
      push();break;}
    case 'vote-eject':
      if(G.phase!=='extraction')return;
      if(!isAlivePlayer(fromPlayer)||!G.extraction.suspects.length)return;
      G.extraction.votes[fromPlayer]=!!data.approve;push();break;
    case 'confirm-eject':{
      if(G.phase!=='extraction')return;
      const suspects=G.extraction.suspects;if(!suspects.length)return;
      const voters=voterNames();
      const votes=G.extraction.votes||{};
      if(!voters.length)return;
      if(voters.some(n=>votes[n]!==true))return;
      const humanEjected=suspects.some(n=>G.players.find(p=>p.name===n)?.role==='human');
      if(humanEjected){endGame('humanEjected',suspects);return;}
      suspects.forEach(n=>{const p=G.players.find(x=>x.name===n);if(p)p.alive=false;});
      const aliensLeft=G.players.filter(p=>p.role==='alien'&&p.alive);
      if(!aliensLeft.length){endGame('humansWin',suspects);return;}
      G.captainIdx=(G.captainIdx+1)%Math.max(alive().length,1);
      startShip();nextRound();break;}
    case 'vote-fail':
      if(G.phase!=='extraction')return;
      if(!isAlivePlayer(fromPlayer)&&fromPlayer!=='__host__')return;
      G.phase=Object.keys(G.answers).length?'reveal':'captain-hub';
      G.captainIdx=(G.captainIdx+1)%Math.max(alive().length,1);
      startShip();push();break;
    case 'continue':
      if(!['reveal','dungeon-reveal'].includes(G.phase))return;
      G.captainIdx=(G.captainIdx+1)%Math.max(alive().length,1);
      nextRound();break;
    case 'apply-hack':{
      const hacker=G.players.find(p=>p.name===fromPlayer);
      if(!hacker||hacker.role!=='alien')return;
      if(!['captain-hub','reveal'].includes(G.phase))return;
      if(data.target===fromPlayer||!isAlivePlayer(data.target))return;
      if(G.activeHacks[data.target])return;
      if((G.usedHacks[fromPlayer]||0)>=2)return;
      G.activeHacks[data.target]=fromPlayer;
      G.usedHacks[fromPlayer]=(G.usedHacks[fromPlayer]||0)+1;
      const tp=G.players.find(p=>p.name===data.target);if(tp)tp.hacked=true;
      push();break;}
    case 'start-game':{
      if(G.phase!=='lobby'||G.players.length<4)return;
      const n=G.players.length;
      const alienCount=n<=4?1:n<=7?2:3;
      const alienIdx=shuffle([...Array(n).keys()]).slice(0,alienCount);
      G.players.forEach((p,i)=>{p.role=alienIdx.includes(i)?'alien':'human';p.alive=true;p.hacked=false;});
      G.shipTimerMax=(12+Math.floor((n-4)*8/6))*60;
      G.shipTimerLeft=G.shipTimerMax;
      G.phase='role-reveal';
      G.players.forEach(p=>toPlayer(p.name,'role',{role:p.role,alienNames:p.role==='alien'?G.players.filter(x=>x.role==='alien').map(x=>x.name):null}));
      startShip();push();break;}
    case 'role-seen':
      // Just acknowledge; host clicks "All roles seen" to advance
      break;
    case 'roles-done':
      if(G.phase!=='role-reveal')return;
      nextRound();break;
    case 'new-game':
      resetSamePlayers();break;
    case 'full-reset':
      stopShip();stopRoom();
      G=fresh();
      // Tell every connected player to go back to the join screen
      toAll('reset',{});
      push();break;
  }
}

// ═══════════════════════════════ ASSET HELPERS ═══════════════════════════════
function fetchBin(u,hdrs={}){
  return new Promise((res,rej)=>{
    const lib=u.startsWith('https')?https:http;
    lib.get(u,{headers:hdrs},r=>{
      if(r.statusCode===301||r.statusCode===302)return fetchBin(r.headers.location,hdrs).then(res).catch(rej);
      if(r.statusCode!==200){r.resume();return rej(new Error(`HTTP ${r.statusCode}`));}
      const c=[];r.on('data',x=>c.push(x));r.on('end',()=>res(Buffer.concat(c)));
    }).on('error',rej);
  });
}
async function downloadAll(key){
  for(const[n,u]of Object.entries(CHAR_URLS)){const d=path.join(ASSETS_DIR,n);if(!fs.existsSync(d)){try{fs.writeFileSync(d,await fetchBin(u));}catch(e){console.error(n,e.message);}}}
  for(const[n,id]of Object.entries(NAME_TO_ID)){const d=path.join(ASSETS_DIR,n);if(!fs.existsSync(d)){try{fs.writeFileSync(d,await fetchBin(`https://api.pixellab.ai/mcp/map-objects/${id}/download`,{Authorization:`Bearer ${key}`}));}catch(e){console.error(n,e.message);}}}
}
const assetsReady=()=>Object.keys(NAME_TO_ID).every(f=>fs.existsSync(path.join(ASSETS_DIR,f)));

// ═══════════════════════════════ HTTP SERVER ═══════════════════════════════
function getIP(){for(const v of Object.values(os.networkInterfaces()))for(const i of v)if(i.family==='IPv4'&&!i.internal)return i.address;return'localhost';}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x');
  const p=u.pathname;

  // ── SSE ──────────────────────────────────
  if(p==='/events'){
    const type=u.searchParams.get('type')||'player';
    const name=cleanName(u.searchParams.get('name')||'');
    const token=u.searchParams.get('token')||'';
    const joinMode=u.searchParams.get('join')||'join';
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    res.write(':ok\n\n');
    const id=cid++;
    clients.set(id,{res,type,name});

    // Mark player connected
    if(type==='player'&&name){
      let pl=G.players.find(p=>p.name===name);
      if(joinMode==='check'){
        const canRejoin=!!pl&&pl.token===token&&G.phase!=='lobby';
        toPlayer(name,'join-check',{canRejoin,phase:G.phase});
      } else if(!pl&&G.phase==='lobby'&&G.players.length<10){
        const color=PLAYER_COLORS[G.players.length%PLAYER_COLORS.length];
        G.players.push({name,color,role:null,alive:true,hacked:false,connected:true,token:newToken()});
        push();
      } else if(pl&&(!pl.token||pl.token===token)){
        if(!pl.token)pl.token=newToken();
        pl.connected=true;push();
      }
      // Send current state immediately
      const pl2=G.players.find(x=>x.name===name);
      if(pl2){
        toPlayer(name,'state',{...pubState(),myRole:pl2.role,myColor:pl2.color,myHacked:pl2.hacked,myToken:pl2.token,
          amCaptain:captain()?.name===name,amTestee:G.selectedTestees.includes(name),
          isMyTurn:G.selectedTestees[G.roomTesteeIdx]===name,
          canPushButton:['captain-hub','reveal','dungeon-reveal'].includes(G.phase)&&pl2.alive&&!pl2.cursed&&!G.buttonPushersUsed.has(name),
          canMarkSuspects:G.phase==='extraction'&&G.extraction.pusher===name,
          usedHacks:G.usedHacks[name]||0,
          alienNames:pl2.role==='alien'?G.players.filter(x=>x.role==='alien').map(x=>x.name):null,
          activeHacks:pl2.role==='alien'?G.activeHacks:null,
          myTesteeIdx:G.selectedTestees.indexOf(name),
          roleNames:G.phase==='gameover'?G.players.map(x=>({name:x.name,role:x.role,alive:x.alive})):null,
          isCursedSpirit:!!pl2.cursed,
          amInDungeon:G.selectedRoom==='dungeon-trial'&&G.selectedTestees.includes(name),
          myDungeonAnswer:G.dungeon?.answers?.[name]??null,
          myGobletChoice:G.dungeon?.gobletChoices?.[name]??null,
        });
      }
    }
    if(type==='host') toHost('state',pubState());

    req.on('close',()=>{
      clients.delete(id);
      const pl=G.players.find(x=>x.name===name);
      const stillConnected=[...clients.values()].some(c=>c.type==='player'&&c.name===name);
      if(pl&&!stillConnected){pl.connected=false;push();}
    });
    return;
  }

  // ── Actions ──────────────────────────────
  if(p==='/action'&&req.method==='POST'){
    let body='';
    req.on('data',c=>body+=c);
    req.on('end',()=>{
      try{
        const d=JSON.parse(body);
        action(d.type,d.data||{},cleanName(d.player||''),d.token||'');
      }catch(e){console.error('action err',e.message);}
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
    });
    return;
  }

  // ── LAN info ──────────────────────────────
  if(p==='/api/info'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-cache'});
    res.end(JSON.stringify({lanUrl:`http://${getIP()}:${PORT}`}));
    return;
  }

  // ── Setup page ────────────────────────────
  if(p==='/setup'){
    if(req.method==='POST'){
      let body='';req.on('data',c=>body+=c);
      req.on('end',async()=>{
        const key=new URLSearchParams(body).get('key')?.trim();
        if(key){fs.writeFileSync(path.join(__dirname,'.env'),`PIXELLAB_API_KEY=${key}\n`);process.env.PIXELLAB_API_KEY=key;}
        res.writeHead(302,{Location:'/setup'});res.end();
        if(key)downloadAll(key).then(()=>console.log('✅ Assets cached.')).catch(console.error);
      });return;
    }
    const missing=Object.keys(NAME_TO_ID).filter(f=>!fs.existsSync(path.join(ASSETS_DIR,f)));
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Setup</title>
<style>body{font-family:monospace;background:#0a0806;color:#e8d9b8;display:flex;align-items:center;justify-content:center;min-height:100vh}
.b{background:#1a1208;border:2px solid #c9a84c;border-radius:6px;padding:28px;max-width:420px;width:100%}
h1{color:#c9a84c;margin-bottom:12px}p,li{font-size:.85rem;line-height:1.8;color:#7a6445}a{color:#c9a84c}
input{width:100%;background:#0a0806;border:2px solid #3d2910;border-radius:4px;color:#e8d9b8;font-family:monospace;font-size:.85rem;padding:10px;margin:10px 0;box-sizing:border-box}
input:focus{border-color:#c9a84c;outline:none}
button{background:linear-gradient(180deg,#c9a84c,#7a5c1e);color:#1a0d00;border:none;border-radius:4px;font-family:monospace;font-size:.85rem;padding:10px 20px;cursor:pointer;width:100%}</style></head>
<body><div class="b">
<h1>⚔ Push The Button — Setup</h1>
${!missing.length?'<p style="color:#2ecc71">✅ All pixel art cached! <a href="/host">Open host screen →</a> or <a href="/">Player screen →</a></p>'
:`<p>${missing.length} pixel art icons need caching. Enter your <a href="https://pixellab.ai" target="_blank">PixelLab</a> API key.</p>
<p style="color:#e67e22">Missing: ${missing.join(', ')}</p>
<form method="POST"><input type="password" name="key" placeholder="Enter PixelLab API key…" required>
<button type="submit">⬇ Cache Assets</button></form>
<p>Find key at <a href="https://pixellab.ai" target="_blank">pixellab.ai</a> → Settings → API Keys</p>`}
<p style="margin-top:16px"><a href="/host">Host screen</a> · <a href="/">Player screen</a></p>
</div></body></html>`);return;
  }

  // ── Host screen ───────────────────────────
  if(p==='/host'){
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(fs.readFileSync(path.join(__dirname,'host.html')));return;
  }

  // ── Assets ────────────────────────────────
  if(p.startsWith('/assets/')){
    const fname=p.slice(8);
    const fpath=path.join(ASSETS_DIR,fname);
    if(fs.existsSync(fpath)){
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public,max-age=86400'});
      return res.end(fs.readFileSync(fpath));
    }
    // Proxy fallback
    const key=process.env.PIXELLAB_API_KEY;const id=NAME_TO_ID[fname];
    if(id&&key){
      try{const buf=await fetchBin(`https://api.pixellab.ai/mcp/map-objects/${id}/download`,{Authorization:`Bearer ${key}`});
        fs.writeFileSync(fpath,buf);
        res.writeHead(200,{'Content-Type':'image/png'});return res.end(buf);}catch{}
    }
    // Character CDN fallback
    const cdnUrl=CHAR_URLS[fname];
    if(cdnUrl){try{const buf=await fetchBin(cdnUrl);res.writeHead(200,{'Content-Type':'image/png'});return res.end(buf);}catch{}}
    res.writeHead(404);return res.end('Not found');
  }

  // ── Shutdown ──────────────────────────────
  if(p==='/api/shutdown'&&req.method==='POST'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true}));
    // Notify all clients before closing
    toAll('shutdown',{});
    setTimeout(()=>{ server.close(()=>process.exit(0)); },400);
    return;
  }

  // ── Player screen (default) ───────────────
  if(p==='/'||p==='/index.html'){
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(fs.readFileSync(path.join(__dirname,'index.html')));return;
  }

  res.writeHead(404);res.end('Not found');
});

server.listen(PORT,'0.0.0.0',()=>{
  const ip=getIP();
  console.log(`\n⚔️  Push The Button — Medieval Edition\n`);
  console.log(`  Host screen : http://localhost:${PORT}/host`);
  console.log(`  Players join: http://${ip}:${PORT}`);
  if(!assetsReady())console.log(`\n  ⚠  Visit http://localhost:${PORT}/setup to cache pixel art.\n`);
  else console.log(`  ✅ All assets ready!\n`);
});
