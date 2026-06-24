import React, { useState, useEffect, useRef } from 'react';

const T = 14, W = 56, H = 42;
const FLOOR = 0, WALL = 1, DOOR = 2, VAULT = 3, PIT = 4, CLOSET = 5;
const COL = { [FLOOR]:'#2a2a2a', [WALL]:'#1a1a1a', [DOOR]:'#4a3a2a', [VAULT]:'#3a3a4a', [PIT]:'#3c3228', [CLOSET]:'#2a3a2a' };

const CAMS = [
  // EXIT cam - watches pit exit area (x=25-33)
  { id:'EXIT', x:25, y:13, a:0, fov:Math.PI/2, r:8, label:'Exit' },
  // CORR cam - east wall between server and vault, watching corridor
  { id:'CORR', x:54, y:20, a:Math.PI, fov:Math.PI/2, r:12, label:'Corridor' },
  // VAULT cam - south wall, watching vault interior toward door
  { id:'VAULT', x:44, y:40, a:-Math.PI/2, fov:Math.PI/2, r:14, label:'Vault' },
];

const makeMap = () => {
  const m = Array(H).fill(0).map(() => Array(W).fill(FLOOR));
  for (let x=0; x<W; x++) { m[0][x]=WALL; m[H-1][x]=WALL; }
  for (let y=0; y<H; y++) { m[y][0]=WALL; m[y][W-1]=WALL; }
  // Spectator entrance (north wall, between pit and server)
  m[0][31]=DOOR; 
  // Pit walls
  for (let y=4; y<24; y++) m[y][24]=WALL;
  for (let x=1; x<24; x++) m[24][x]=WALL;
  m[14][24]=DOOR; // Pit door
  for (let y=9; y<19; y++) for (let x=7; x<19; x++) m[y][x]=PIT;
  // Server room walls
  for (let y=1; y<12; y++) m[y][38]=WALL;
  for (let x=38; x<W-1; x++) m[12][x]=WALL;
  m[7][38]=DOOR; // Server door
  // Vault room outer walls
  for (let y=26; y<H-1; y++) m[y][35]=WALL;
  for (let x=35; x<W-1; x++) m[26][x]=WALL;
  m[26][42]=DOOR; // Vault room door
  // Interior vault wall (separates vault room from vault)
  for (let x=36; x<W-1; x++) m[35][x]=WALL;
  m[35][45]=DOOR; // Vault door (Maya hacks this)
  // Vault room floor (y=27-34)
  for (let y=27; y<35; y++) for (let x=36; x<W-1; x++) m[y][x]=VAULT;
  // Inner vault floor (y=36-40) 
  for (let y=36; y<H-1; y++) for (let x=36; x<W-1; x++) m[y][x]=VAULT;
  // Hallway wall (connects to pit wall, extended right)
  for (let x=25; x<39; x++) m[17][x]=WALL;
  m[17][30]=DOOR; // Hall door
  
  // Closet room (far left bottom zone, 5 tiles wide)
  // Walls: x=6 from y=36-40, y=36 from x=1-6
  for (let y=36; y<=40; y++) m[y][6]=WALL;
  for (let x=1; x<=6; x++) m[36][x]=WALL;
  m[36][3]=DOOR; // Closet door (north side, entering from main area)
  // Closet floor
  for (let y=37; y<=40; y++) for (let x=1; x<=5; x++) m[y][x]=CLOSET;
  
  // Back door (bottom wall, between closet and vault)
  m[H-1][20]=DOOR; // Back exit door
  
  return m;
};

const path = (sx,sy,ex,ey,map) => {
  const s={x:Math.floor(sx),y:Math.floor(sy)}, e={x:Math.floor(ex),y:Math.floor(ey)};
  if (e.x<0||e.x>=W||e.y<0||e.y>=H||map[e.y][e.x]===WALL) return null;
  const open=[{...s,g:0,f:0}], closed=new Set(), came=new Map();
  while (open.length) {
    open.sort((a,b)=>a.f-b.f);
    const c=open.shift(), k=`${c.x},${c.y}`;
    if (c.x===e.x && c.y===e.y) {
      const p=[c]; let cur=c;
      while (came.has(`${cur.x},${cur.y}`)) { cur=came.get(`${cur.x},${cur.y}`); p.unshift(cur); }
      return p;
    }
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx=c.x+dx, ny=c.y+dy;
      if (nx<0||nx>=W||ny<0||ny>=H||map[ny][nx]===WALL||closed.has(`${nx},${ny}`)) continue;
      const g=c.g+1, h=Math.abs(nx-e.x)+Math.abs(ny-e.y);
      came.set(`${nx},${ny}`, c);
      if (!open.find(n=>n.x===nx&&n.y===ny)) open.push({x:nx,y:ny,g,f:g+h});
    }
  }
  return null;
};

// Crew/Spectator pathfinding - avoids fight ring (PIT tiles)
const civilianPath = (sx,sy,ex,ey,map) => {
  const s={x:Math.floor(sx),y:Math.floor(sy)}, e={x:Math.floor(ex),y:Math.floor(ey)};
  if (e.x<0||e.x>=W||e.y<0||e.y>=H||map[e.y][e.x]===WALL||map[e.y][e.x]===PIT) return null;
  const open=[{...s,g:0,f:0}], closed=new Set(), came=new Map();
  while (open.length) {
    open.sort((a,b)=>a.f-b.f);
    const c=open.shift(), k=`${c.x},${c.y}`;
    if (c.x===e.x && c.y===e.y) {
      const p=[c]; let cur=c;
      while (came.has(`${cur.x},${cur.y}`)) { cur=came.get(`${cur.x},${cur.y}`); p.unshift(cur); }
      return p;
    }
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx=c.x+dx, ny=c.y+dy;
      // Block WALL and PIT tiles
      if (nx<0||nx>=W||ny<0||ny>=H||map[ny][nx]===WALL||map[ny][nx]===PIT||closed.has(`${nx},${ny}`)) continue;
      const g=c.g+1, h=Math.abs(nx-e.x)+Math.abs(ny-e.y);
      came.set(`${nx},${ny}`, c);
      if (!open.find(n=>n.x===nx&&n.y===ny)) open.push({x:nx,y:ny,g,f:g+h});
    }
  }
  return null;
};

// Guard pathfinding - avoids restricted zones (pit, server, vault)
const guardNoGo = [{x1:1,x2:23,y1:1,y2:23},{x1:37,x2:55,y1:1,y2:12},{x1:36,x2:55,y1:27,y2:41},{x1:1,x2:5,y1:37,y2:40}];
const guardPath = (sx,sy,ex,ey,map) => {
  const s={x:Math.floor(sx),y:Math.floor(sy)}, e={x:Math.floor(ex),y:Math.floor(ey)};
  if (e.x<0||e.x>=W||e.y<0||e.y>=H||map[e.y][e.x]===WALL) return null;
  // Check if destination is in restricted zone
  if (guardNoGo.some(z => e.x >= z.x1 && e.x <= z.x2 && e.y >= z.y1 && e.y <= z.y2)) return null;
  const open=[{...s,g:0,f:0}], closed=new Set(), came=new Map();
  while (open.length) {
    open.sort((a,b)=>a.f-b.f);
    const c=open.shift(), k=`${c.x},${c.y}`;
    if (c.x===e.x && c.y===e.y) {
      const p=[c]; let cur=c;
      while (came.has(`${cur.x},${cur.y}`)) { cur=came.get(`${cur.x},${cur.y}`); p.unshift(cur); }
      return p;
    }
    if (closed.has(k)) continue;
    closed.add(k);
    for (const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nx=c.x+dx, ny=c.y+dy;
      if (nx<0||nx>=W||ny<0||ny>=H||map[ny][nx]===WALL||map[ny][nx]===CLOSET||closed.has(`${nx},${ny}`)) continue;
      // Guards avoid restricted zones
      if (guardNoGo.some(z => nx >= z.x1 && nx <= z.x2 && ny >= z.y1 && ny <= z.y2)) continue;
      const g=c.g+1, h=Math.abs(nx-e.x)+Math.abs(ny-e.y);
      came.set(`${nx},${ny}`, c);
      if (!open.find(n=>n.x===nx&&n.y===ny)) open.push({x:nx,y:ny,g,f:g+h});
    }
  }
  return null;
};

// Vision cone with line-of-sight blocking
const inCone = (ox,oy,dir,fov,range,px,py,map) => {
  const dx=px-ox, dy=py-oy, d=Math.sqrt(dx*dx+dy*dy);
  if (d>range || d<0.1) return false;
  let a=Math.atan2(dy,dx)-dir;
  while (a>Math.PI) a-=Math.PI*2;
  while (a<-Math.PI) a+=Math.PI*2;
  if (Math.abs(a)>fov/2) return false;
  if (map) {
    const steps = Math.ceil(d * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor(ox + dx * t);
      const cy = Math.floor(oy + dy * t);
      if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
        const tile = map[cy][cx];
        if (tile === WALL || tile === DOOR) return false;
      }
    }
  }
  return true;
};

export default function M3Demo() {
  const [map] = useState(makeMap);
  const canvasRef = useRef();
  const frameRef = useRef();
  
  const initState = () => {
    // Create initial spectators in pit room (surrounding fight ring)
    const initialSpectators = [];
    const pitRoomBounds = {x1: 2, x2: 22, y1: 2, y2: 22};
    const fightRing = {x1: 7, x2: 18, y1: 9, y2: 18}; // PIT tiles - don't enter
    
    for (let i = 0; i < 12; i++) {
      let x, y;
      do {
        x = Math.floor(Math.random() * (pitRoomBounds.x2 - pitRoomBounds.x1)) + pitRoomBounds.x1;
        y = Math.floor(Math.random() * (pitRoomBounds.y2 - pitRoomBounds.y1)) + pitRoomBounds.y1;
      } while (x >= fightRing.x1 && x <= fightRing.x2 && 
               y >= fightRing.y1 && y <= fightRing.y2);
      
      initialSpectators.push({
        x, y,
        id: i,
        state: 'WANDER',
        path: null,
        pi: 0,
        target: null,
        leaveTimer: 12600, // 210 seconds
        moveTimer: 0
      });
    }
    
    // Crew spawns in viewing area (not in fight ring)
    // Generate random 6-digit vault code
    const vaultCode = [];
    for (let i = 0; i < 6; i++) {
      vaultCode.push(Math.floor(Math.random() * 10));
    }
    
    return {
    crew: [
      {x:4,y:12,name:'SAM',color:'#ffaa4a',phase:0,state:'IDLE',wait:0,path:null,pi:0,action:'Initializing',
       memory:{guardHistory:{},patterns:{},lastAnalysis:0},escaped:false},
      {x:4,y:14,name:'MAYA',color:'#4a9eff',phase:0,state:'IDLE',wait:0,path:null,pi:0,action:'Standing by',
       sig:null,waitSig:false,threat:0,frozen:false,lastSafePos:null,
       hacking:false,hackGuesses:[],hackPossible:null,hackComplete:false,hasLoot:false,escaped:false,lootTimer:0},
      {x:4,y:16,name:'RICO',color:'#4aff7a',phase:0,state:'IDLE',wait:0,path:null,pi:0,action:'On hold',
       sig:null,threat:0,frozen:false,routeType:null,routeScore:0,replanTimer:0,chargeTimer:0,hasLoot:false,escaped:false,lootTimer:0},
    ],
    movementLog: [],  // Records crew movements for debugging
    vaultCode: vaultCode,
    vaultDoorOpen: false,
    guards: [
      {x:25,y:1,name:'G1',state:'IDLE',wait:0,path:null,pi:0,facing:Math.PI/2,fov:Math.PI/2,range:8,
       zone:'LOOP',patrolIdx:0,loopIdx:0,scanPhase:0,roamTarget:null,investigatingAlarm:false},
      {x:30,y:8,name:'G2',state:'IDLE',wait:0,path:null,pi:0,facing:0,fov:Math.PI/2,range:8,
       zone:'TOP',patrolIdx:0,scanPhase:0,roamTarget:null,investigatingAlarm:false},
      {x:30,y:32,name:'G3',state:'IDLE',wait:0,path:null,pi:0,facing:0,fov:Math.PI/2,range:8,
       zone:'BOTTOM',patrolIdx:0,scanPhase:0,roamTarget:null,investigatingAlarm:false},
    ],
    spectators: initialSpectators,
    nextSpectatorId: 12,
    cams: CAMS.map(c=>({...c,on:true,off:0})),
    vault:true, alarm:false, reason:'', success:false, ricoUsed:false, frame:0,
    chargePlanted: false,
    chargeExploded: false,
    backDoorOpen: false,
    alarmTriggered: false,
    failLog: [],
    runNumber: 1,
    autoRun: true,
    runHistory: []
  };
  };
  
  const S = useRef(initState());
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  const noPatrol = [{x1:1,x2:23,y1:1,y2:23},{x1:37,x2:55,y1:1,y2:12},{x1:36,x2:55,y1:27,y2:41}];
  const safeZone = {x1:1,x2:23,y1:1,y2:23};
  
  // G1 patrol loop (y,x format converted to {x,y})
  const G1_PATROL_LOOP = [
    {x:25, y:1},   // top
    {x:25, y:16},
    {x:30, y:16},
    {x:30, y:18},
    {x:25, y:18},
    {x:25, y:25},
    {x:1, y:25},
    {x:1, y:40},
    {x:34, y:40},
    {x:34, y:25},
    {x:54, y:25},
    {x:54, y:13},
    {x:36, y:13},
    {x:36, y:1},
  ];
  
  // Patrol zones (vertical split at y=21)
  const ZONE_SPLIT = 21;
  const zoneTop = {y1: 1, y2: ZONE_SPLIT - 1, color: 'rgba(100, 150, 255, 0.15)'};  // Blue
  const zoneBottom = {y1: ZONE_SPLIT, y2: H - 2, color: 'rgba(255, 150, 100, 0.15)'};  // Orange
  
  // ========== MASTERMIND VAULT CRACKER (6-digit) ==========
  const CODE_LENGTH = 6;
  
  // Returns {bulls, cows} for a guess against the code
  const getMastermindFeedback = (guess, code) => {
    let bulls = 0, cows = 0;
    const codeUsed = new Array(CODE_LENGTH).fill(false);
    const guessUsed = new Array(CODE_LENGTH).fill(false);
    
    // First pass: find bulls (right digit, right position)
    for (let i = 0; i < CODE_LENGTH; i++) {
      if (guess[i] === code[i]) {
        bulls++;
        codeUsed[i] = true;
        guessUsed[i] = true;
      }
    }
    
    // Second pass: find cows (right digit, wrong position)
    for (let i = 0; i < CODE_LENGTH; i++) {
      if (guessUsed[i]) continue;
      for (let j = 0; j < CODE_LENGTH; j++) {
        if (codeUsed[j]) continue;
        if (guess[i] === code[j]) {
          cows++;
          codeUsed[j] = true;
          break;
        }
      }
    }
    return { bulls, cows };
  };
  
  // Generate ALL possible 6-digit codes (1 million total)
  const generateAllCodes = () => {
    const codes = [];
    for (let i = 0; i < 1000000; i++) {
      codes.push([
        Math.floor(i / 100000) % 10,
        Math.floor(i / 10000) % 10,
        Math.floor(i / 1000) % 10,
        Math.floor(i / 100) % 10,
        Math.floor(i / 10) % 10,
        i % 10
      ]);
    }
    return codes;
  };
  
  // Filter possible codes based on a guess and its feedback
  const filterPossibleCodes = (possible, guess, feedback) => {
    return possible.filter(code => {
      const fb = getMastermindFeedback(guess, code);
      return fb.bulls === feedback.bulls && fb.cows === feedback.cows;
    });
  };
  
  // Pick next guess
  const pickNextGuess = (possible) => {
    if (possible && possible.length > 0) {
      return possible[0];
    }
    return [0, 0, 0, 0, 0, 0];
  };
  
  // Get random patrol point within zone (minimum 25 tiles away for predictable patterns)
  const MIN_PATROL_DIST = 25;
  const getRandomPatrolPoint = (zone, map, fromX, fromY) => {
    const attempts = 50;
    for (let i = 0; i < attempts; i++) {
      let y, x;
      if (zone === 'TOP') {
        y = Math.floor(Math.random() * (zoneTop.y2 - zoneTop.y1 - 2)) + zoneTop.y1 + 1;
      } else if (zone === 'BOTTOM') {
        y = Math.floor(Math.random() * (zoneBottom.y2 - zoneBottom.y1 - 2)) + zoneBottom.y1 + 1;
      } else { // BOTH
        y = Math.floor(Math.random() * (H - 4)) + 2;
      }
      x = Math.floor(Math.random() * (W - 4)) + 2;
      
      // Check if valid patrol area
      if (map[y][x] === FLOOR) {
        const inNoPatrol = noPatrol.some(z => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2);
        if (!inNoPatrol) {
          // Enforce minimum distance for predictable patrol patterns
          const dist = Math.sqrt((x - fromX)**2 + (y - fromY)**2);
          if (dist >= MIN_PATROL_DIST) {
            return {x, y};
          }
        }
      }
    }
    return null;
  };

  const reset = () => { 
    const s = S.current;
    const newState = initState();
    newState.runNumber = s.runNumber + 1;
    newState.autoRun = s.autoRun;
    newState.runHistory = s.runHistory;
    S.current = newState; 
    setTick(t=>t+1); 
  };

  useEffect(() => {
    if (paused) return;
    
    const loop = () => {
      const s = S.current;
      
      // Handle end of run - log and restart
      if (s.alarm || s.success) {
        if (!s.runLogged) {
          // Log this run
          s.runLogged = true;
          s.runHistory.push({
            run: s.runNumber,
            result: s.success ? 'SUCCESS' : 'FAIL',
            reason: s.success ? 'Objective secured' : s.reason,
            frame: s.frame,
            timeSeconds: (s.frame / 60).toFixed(1),
            ricoUsed: s.ricoUsed
          });
          
          // Auto restart after delay
          if (s.autoRun) {
            setTimeout(() => {
              reset();
            }, 1500);
          }
        }
        setTick(t=>t+1); 
        return; 
      }

      const {crew, guards, cams} = s;
      const [sam, maya, rico] = crew;

      // ========== UTILITY FUNCTIONS ==========
      
      const move = (a, tx, ty) => {
        const p = civilianPath(a.x, a.y, tx, ty, map);
        if (p && p.length > 1) { a.path=p; a.pi=1; a.state='MOVING'; return true; }
        return false;
      };
      
      // Guard move - uses restricted pathfinding (avoids pit, server, vault)
      const guardMove = (g, tx, ty) => {
        const p = guardPath(g.x, g.y, tx, ty, map);
        if (p && p.length > 1) { g.path=p; g.pi=1; g.state='MOVING'; return true; }
        return false;
      };
      
      // Score a path based on guard proximity, direction, AND camera coverage (higher = safer)
      const scorePath = (pathPoints, checkCameras = false) => {
        if (!pathPoints || pathPoints.length === 0) return -Infinity;
        let minDist = Infinity;
        let totalDist = 0;
        let checks = 0;
        let directionPenalty = 0;
        let cameraPenalty = 0;
        let southBonus = 0;
        
        // Sample points along path
        for (let i = 0; i < pathPoints.length; i += 2) {
          const pt = pathPoints[i];
          guards.forEach(g => {
            const d = Math.sqrt((g.x - pt.x)**2 + (g.y - pt.y)**2);
            if (d < minDist) minDist = d;
            totalDist += d;
            checks++;
            
            // Check if guard is moving TOWARD this path point
            if (g.path && g.pi < g.path.length) {
              const guardDest = g.path[g.path.length - 1];
              const guardToPt = Math.sqrt((guardDest.x - pt.x)**2 + (guardDest.y - pt.y)**2);
              const guardToSelf = Math.sqrt((guardDest.x - g.x)**2 + (guardDest.y - g.y)**2);
              // Guard heading toward path point
              if (guardToPt < guardToSelf && d < g.range + 4) {
                directionPenalty += 30;
              }
            }
          });
          
          // Check if path point is in active camera cone
          if (checkCameras) {
            cams.forEach(cam => {
              if (cam.on && inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, pt.x, pt.y, map)) {
                cameraPenalty += 100; // Heavy penalty for camera exposure
              }
            });
          }
          
          // Bonus for south zone (y=30-37) - the patient/safe route
          if (pt.y >= 30 && pt.y <= 37) {
            southBonus += 3;
          }
        }
        
        // Score: heavily weight minimum distance, add average, subtract penalties, add south bonus
        return minDist * 10 + (checks > 0 ? totalDist / checks : 0) - directionPenalty - cameraPenalty + southBonus;
      };
      
      // Smart move: evaluate multiple routes and pick safest
      // checkCameras: true for SAM (must avoid cameras), false for Maya (SAM disables for her)
      // Uses hysteresis: only switch routes if new one is significantly better (+15 points)
      const ROUTE_HYSTERESIS = 15;
      
      const smartMove = (a, tx, ty, checkCameras = false) => {
        const directPath = civilianPath(a.x, a.y, tx, ty, map);
        if (!directPath) return false;
        
        // Generate candidate waypoints (corners, alternate routes)
        const candidates = [];
        const midY = (a.y + ty) / 2;
        const midX = (a.x + tx) / 2;
        
        // Direct route
        candidates.push({ name: 'DIRECT', waypoints: null, path: directPath });
        
        // Route via top corridor (good for avoiding cameras)
        const topWP = { x: midX, y: Math.max(2, Math.min(a.y, ty) - 5) };
        if (map[Math.floor(topWP.y)] && map[Math.floor(topWP.y)][Math.floor(topWP.x)] === FLOOR) {
          const p1 = civilianPath(a.x, a.y, topWP.x, topWP.y, map);
          const p2 = civilianPath(topWP.x, topWP.y, tx, ty, map);
          if (p1 && p2) candidates.push({ name: 'TOP', waypoints: [topWP], path: [...p1, ...p2.slice(1)] });
        }
        
        // Route via bottom corridor  
        const botWP = { x: midX, y: Math.min(H - 3, Math.max(a.y, ty) + 5) };
        if (map[Math.floor(botWP.y)] && map[Math.floor(botWP.y)][Math.floor(botWP.x)] === FLOOR) {
          const p1 = civilianPath(a.x, a.y, botWP.x, botWP.y, map);
          const p2 = civilianPath(botWP.x, botWP.y, tx, ty, map);
          if (p1 && p2) candidates.push({ name: 'BOT', waypoints: [botWP], path: [...p1, ...p2.slice(1)] });
        }
        
        // Route via left side
        const leftWP = { x: Math.max(25, Math.min(a.x, tx) - 3), y: midY };
        if (map[Math.floor(leftWP.y)] && map[Math.floor(leftWP.y)][Math.floor(leftWP.x)] === FLOOR) {
          const p1 = civilianPath(a.x, a.y, leftWP.x, leftWP.y, map);
          const p2 = civilianPath(leftWP.x, leftWP.y, tx, ty, map);
          if (p1 && p2) candidates.push({ name: 'LEFT', waypoints: [leftWP], path: [...p1, ...p2.slice(1)] });
        }
        
        // Route via right side
        const rightWP = { x: Math.min(W - 3, Math.max(a.x, tx) + 3), y: midY };
        if (map[Math.floor(rightWP.y)] && map[Math.floor(rightWP.y)][Math.floor(rightWP.x)] === FLOOR) {
          const p1 = civilianPath(a.x, a.y, rightWP.x, rightWP.y, map);
          const p2 = civilianPath(rightWP.x, rightWP.y, tx, ty, map);
          if (p1 && p2) candidates.push({ name: 'RIGHT', waypoints: [rightWP], path: [...p1, ...p2.slice(1)] });
        }
        
        // Score each candidate
        candidates.forEach(c => {
          c.score = scorePath(c.path, checkCameras);
        });
        
        // Find best route
        let best = candidates.reduce((a, b) => a.score > b.score ? a : b, candidates[0]);
        
        // HYSTERESIS: If agent has a current route, only switch if new best is significantly better
        if (a.routeType && a.path && a.pi < a.path.length) {
          const currentRoute = candidates.find(c => c.name === a.routeType);
          if (currentRoute && currentRoute.path) {
            // Re-score current route from current position
            const currentScore = currentRoute.score;
            
            // Only switch if best is significantly better than current
            if (best.score < currentScore + ROUTE_HYSTERESIS) {
              // Stick with current route - but update path from current position
              best = currentRoute;
            }
          }
        }
        
        // Always pick best route, even if score is negative - keep moving
        if (best && best.path && best.path.length > 1) {
          // Only reset path/pi if changing routes or no current path
          const keepingRoute = a.routeType === best.name && a.path && a.pi < a.path.length;
          if (!keepingRoute) {
            a.path = best.path;
            a.pi = 1;
          }
          a.state = 'MOVING';
          a.routeScore = best.score.toFixed(0);
          a.routeType = best.name;
          a.routeOptions = candidates.map(c => `${c.name}:${c.score.toFixed(0)}`).join(' ');
          // Store all candidates for debug rendering
          a.debugRoutes = candidates.map(c => ({
            name: c.name,
            path: c.path,
            score: c.score,
            chosen: c === best
          }));
          return true;
        }
        
        // No valid path found - store empty debug
        a.debugRoutes = [];
        return false;
      };
      
      // Calculate threat level at position
      const getThreat = (x, y, excludeCams = false) => {
        let threat = 0;
        guards.forEach(g => {
          const dist = Math.sqrt((g.x - x)**2 + (g.y - y)**2);
          // Direct vision = critical threat
          if (inCone(g.x, g.y, g.facing, g.fov, g.range, x, y, map)) {
            threat += 100;
          }
          // Close proximity = danger
          else if (dist < g.range + 2) {
            threat += 40 - dist * 5;
            // Extra danger if scanning
            if (g.state === 'WAITING' && g.scanPhase > 0) threat += 25;
          }
          // Guard walking toward position
          if (g.path && g.pi < g.path.length) {
            const dest = g.path[g.path.length - 1];
            const destDist = Math.sqrt((dest.x - x)**2 + (dest.y - y)**2);
            if (destDist < g.range) threat += 20;
          }
        });
        if (!excludeCams) {
          cams.forEach(c => {
            if (c.on && inCone(c.x, c.y, c.a, c.fov, c.r, x, y, map)) threat += 100;
          });
        }
        return threat;
      };
      
      // Predict guard position in N frames
      // Find best position to draw guards away from target
      const findDistractPoint = (awayFromX, awayFromY) => {
        let best = null, bestScore = -Infinity;
        
        // Check positions that are visible to guards but away from target
        for (let y = 2; y < H-2; y++) {
          for (let x = 26; x < W-2; x++) {
            if (map[y][x] === WALL || map[y][x] === VAULT) continue;
            
            const distFromTarget = Math.sqrt((x - awayFromX)**2 + (y - awayFromY)**2);
            let guardsCanSee = 0;
            let totalGuardDist = 0;
            
            guards.forEach(g => {
              const gDist = Math.sqrt((g.x - x)**2 + (g.y - y)**2);
              if (gDist < g.range + 2) {
                guardsCanSee++;
                totalGuardDist += gDist;
              }
            });
            
            // Score: draws guards, away from target, not too far from pit
            const score = guardsCanSee * 30 + distFromTarget * 2 - Math.abs(x - 26) * 0.5;
            
            if (score > bestScore && guardsCanSee > 0) {
              bestScore = score;
              best = { x, y };
            }
          }
        }
        return best || { x: 31, y: 14 };
      };

      // ========== EARLY CAMERA CONTROL (runs BEFORE detection) ==========
      // This ensures cameras are disabled BEFORE we check if Maya is spotted
      // Run camera control until SAM is escaping (phase 6)
      if (sam.phase >= 3 && sam.phase < 6 && (maya.phase >= 2 || rico.phase >= 2)) {
        const exitCam = cams.find(c => c.id === 'EXIT');
        const corrCam = cams.find(c => c.id === 'CORR');
        const vaultCam = cams.find(c => c.id === 'VAULT');
        
        // Check if Maya OR Rico is IN a camera cone RIGHT NOW
        const inCamNow = (cam) => {
          if (!cam) return false;
          // Maya phases 2-4 (approach/hack) and phase 5 (loot grab)
          if (((maya.phase >= 2 && maya.phase < 4) || maya.phase === 5) && inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, maya.x, maya.y, map)) return true;
          // Rico phases 2-6 (approach through loot grab)
          if (rico.phase >= 2 && rico.phase <= 6 && inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, rico.x, rico.y, map)) return true;
          return false;
        };
        
        // IMMEDIATE threats - must handle before detection runs
        if (inCamNow(exitCam) && exitCam.on) {
          // Turn off EXIT, turn on others if needed
          const otherOff = [corrCam, vaultCam].find(c => c && !c.on);
          if (otherOff) otherOff.on = true;
          exitCam.on = false;
        } else if (inCamNow(corrCam) && corrCam.on) {
          const otherOff = [exitCam, vaultCam].find(c => c && !c.on);
          if (otherOff) otherOff.on = true;
          corrCam.on = false;
        } else if (inCamNow(vaultCam) && vaultCam.on) {
          const otherOff = [exitCam, corrCam].find(c => c && !c.on);
          if (otherOff) otherOff.on = true;
          vaultCam.on = false;
        }
      }

      // ========== DETECTION & ALARMS ==========
      
      // Camera detection
      const camsOff = cams.filter(c => !c.on).length;
      if (camsOff > 1 && !s.alarm) {
        s.alarm = true; s.reason = 'Multiple cams offline!';
        s.failLog.push({
          frame: s.frame,
          event: 'ALARM: Multiple cameras offline',
          camsOff: cams.filter(c => !c.on).map(c => c.id),
          samPhase: sam.phase,
          samAction: sam.action,
          mayaPhase: maya.phase,
          mayaAction: maya.action
        });
      }
      
      crew.forEach(c => {
        // Skip if crew member escaped
        if (c.escaped) return;
        // Skip if in safe zone (pit room)
        if (c.x >= safeZone.x1 && c.x <= safeZone.x2 && c.y >= safeZone.y1 && c.y <= safeZone.y2) return;
        // Skip if in closet (hidden)
        if (c.x >= 1 && c.x <= 5 && c.y >= 37 && c.y <= 40) return;
        cams.forEach(cam => {
          if (cam.on && inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, c.x, c.y, map) && !s.alarm) {
            s.alarm = true; s.reason = `Camera: ${c.name}`;
            s.failLog.push({
              frame: s.frame,
              event: `ALARM: ${c.name} spotted by camera ${cam.id}`,
              crewPos: {x: c.x.toFixed(1), y: c.y.toFixed(1)},
              crewPhase: c.phase,
              crewAction: c.action,
              camPos: {x: cam.x, y: cam.y},
              camOn: cam.on,
              samPhase: sam.phase,
              samAction: sam.action,
              mayaPhase: maya.phase,
              mayaAction: maya.action
            });
          }
        });
      });

      // Guard detection
      guards.forEach(g => {
        crew.forEach(c => {
          // Skip if crew member escaped
          if (c.escaped) return;
          // Skip if in safe zone (pit room)
          if (c.x >= safeZone.x1 && c.x <= safeZone.x2 && c.y >= safeZone.y1 && c.y <= safeZone.y2) return;
          // Skip if in closet (hidden)
          if (c.x >= 1 && c.x <= 5 && c.y >= 37 && c.y <= 40) return;
          // Skip detection if guards are investigating alarm (distracted)
          if (s.alarmTriggered && g.investigatingAlarm) return;
          if (inCone(g.x, g.y, g.facing, g.fov, g.range, c.x, c.y, map)) {
            if (!s.alarm) {
              s.alarm = true; s.reason = `${g.name}: ${c.name}`;
              s.failLog.push({
                frame: s.frame,
                event: `ALARM: ${c.name} spotted by guard ${g.name}`,
                // Caught crew member details
                crewPos: {x: c.x.toFixed(1), y: c.y.toFixed(1)},
                crewPhase: c.phase,
                crewAction: c.action,
                crewFrozen: c.frozen || false,
                crewRouteType: c.routeType || 'none',
                crewRouteScore: c.routeScore || 'N/A',
                crewRouteOptions: c.routeOptions || 'N/A',
                crewPathLength: c.path ? c.path.length - c.pi : 0,
                // Guard that caught them
                guardPos: {x: g.x.toFixed(1), y: g.y.toFixed(1)},
                guardFacing: (g.facing * 180 / Math.PI).toFixed(0) + '°',
                guardState: g.state,
                guardDest: g.path && g.path.length > 0 ? {x: g.path[g.path.length-1].x.toFixed(0), y: g.path[g.path.length-1].y.toFixed(0)} : 'none',
                distance: Math.sqrt((g.x-c.x)**2 + (g.y-c.y)**2).toFixed(1),
                // SAM status
                samPhase: sam.phase,
                samAction: sam.action,
                // Maya status
                mayaPhase: maya.phase,
                mayaAction: maya.action,
                mayaPos: {x: maya.x.toFixed(1), y: maya.y.toFixed(1)},
                mayaFrozen: maya.frozen || false,
                // Rico status
                ricoPhase: rico.phase,
                ricoAction: rico.action,
                ricoPos: {x: rico.x.toFixed(1), y: rico.y.toFixed(1)},
                ricoFrozen: rico.frozen || false,
                // Camera status
                cameras: cams.map(cam => ({id: cam.id, on: cam.on})),
                // All guards
                guards: guards.map(gg => ({
                  name: gg.name,
                  pos: {x: gg.x.toFixed(1), y: gg.y.toFixed(1)},
                  facing: (gg.facing * 180 / Math.PI).toFixed(0) + '°',
                  state: gg.state,
                  dest: gg.path && gg.path.length > 0 ? {x: gg.path[gg.path.length-1].x.toFixed(0), y: gg.path[gg.path.length-1].y.toFixed(0)} : 'none'
                }))
              });
            }
          }
        });
      });

      // ========== MOVEMENT ==========
      
      const moveAgent = (a, spd, isGuard) => {
        if (a.state === 'WAITING') { 
          if (--a.wait <= 0) a.state = 'IDLE'; 
          return; 
        }
        if ((a.state === 'MOVING' || a.state === 'INVEST') && a.path) {
          if (a.frozen) return; // Maya can freeze
          
          const t = a.path[a.pi];
          const dx = t.x - a.x, dy = t.y - a.y, d = Math.sqrt(dx*dx + dy*dy);
          if (isGuard && d > 0.01) a.facing = Math.atan2(dy, dx);
          if (d < spd) {
            a.x = t.x; a.y = t.y;
            if (++a.pi >= a.path.length) { a.path = null; a.state = 'IDLE'; }
          } else {
            a.x += dx/d*spd; a.y += dy/d*spd;
          }
        }
      };

      // Move all agents
      crew.forEach(c => {
        moveAgent(c, 0.04, false);
      });
      guards.forEach(g => moveAgent(g, 0.017, true));  // 15% slower total

      // ========== GUARD BEHAVIOR ==========
      
      guards.forEach(g => {
        if (g.state === 'INVEST') {
          // Investigating - reached target?
          if (!g.path && g.target) {
            const dx = g.x - g.target.x, dy = g.y - g.target.y;
            if (Math.sqrt(dx*dx + dy*dy) < 2) {
              g.state = 'WAITING';
              g.wait = 90;
              g.scanPhase = 1;
              g.target = null;
            }
          }
        }
        else if (g.state === 'IDLE') {
          // ALARM TRIGGERED - all guards rush to back door
          if (s.alarmTriggered && !g.investigatingAlarm) {
            g.investigatingAlarm = true;
            const backDoor = {x: 20, y: 35}; // Near back door
            guardMove(g, backDoor.x + Math.random()*6 - 3, backDoor.y);
          }
          // Normal patrol when no alarm
          else if (!s.alarmTriggered) {
            // Zone-based patrol
            let target;
            if (g.zone === 'LOOP') {
              // G1 follows fixed loop
              target = G1_PATROL_LOOP[g.loopIdx];
              // Check if we're at current waypoint
              const dist = Math.sqrt((target.x - g.x)**2 + (target.y - g.y)**2);
              if (dist < 1.5) {
                // Move to next waypoint in loop
                g.loopIdx = (g.loopIdx + 1) % G1_PATROL_LOOP.length;
                target = G1_PATROL_LOOP[g.loopIdx];
              }
            } else {
              // Random roaming for other guards
              target = getRandomPatrolPoint(g.zone, map, g.x, g.y);
            }
            if (target) {
              const dist = Math.sqrt((target.x - g.x)**2 + (target.y - g.y)**2);
              if (dist >= 1) {
                g.roamTarget = target;
                guardMove(g, target.x, target.y);
              }
            }
          }
        }
        
        if (g.state === 'IDLE' && !g.path) {
          // Scan sequence at waypoint
          if (!g.scanPhase) g.scanPhase = 0;
          if (g.scanPhase === 0) {
            g.wait = 50 + Math.random()*30|0;
            g.state = 'WAITING';
            g.scanPhase = 1;
          } else if (g.scanPhase === 1) {
            g.facing -= Math.PI/2;
            g.wait = 40 + Math.random()*20|0;
            g.state = 'WAITING';
            g.scanPhase = 2;
          } else if (g.scanPhase === 2) {
            g.facing += Math.PI;
            g.wait = 40 + Math.random()*20|0;
            g.state = 'WAITING';
            g.scanPhase = 3;
          } else {
            g.facing -= Math.PI/2;
            g.scanPhase = 0;
          }
        }
      });

      // ========== SAM - INTELLIGENT COORDINATOR ==========
      
      // Initialize pattern tracking
      if (!sam.patterns) {
        sam.patterns = {};
        guards.forEach(g => {
          sam.patterns[g.name] = {
            cycleFrames: [],      // How long each cycle takes
            waypointTimes: [],    // When guard reaches each waypoint
            lastWaypoint: -1,
            cycleStart: 0,
            cyclesObserved: 0,
            avgCycleTime: 0,
            currentCycleStart: s.frame
          };
        });
      }
      
      // Track guard positions (for random roaming guards)
      guards.forEach(g => {
        const p = sam.patterns[g.name];
        // Track position history
        if (!p.posHistory) p.posHistory = [];
        if (s.frame % 30 === 0) {
          p.posHistory.push({x: g.x, y: g.y, frame: s.frame});
          if (p.posHistory.length > 20) p.posHistory.shift();
          p.cyclesObserved = Math.min(3, Math.floor(p.posHistory.length / 5));
        }
      });
      
      // With random roaming, we can't predict exact paths
      // Instead just check current positions
      const minCycles = Math.min(...guards.map(g => sam.patterns[g.name].cyclesObserved || 0));
      
      // For random guards, just return current position (can't predict)
      const predictGuardPos = (g, framesAhead) => {
        // Simple prediction: assume guard continues toward roamTarget
        if (g.roamTarget && g.path) {
          const progress = Math.min(framesAhead * 0.02, 
            Math.sqrt((g.roamTarget.x - g.x)**2 + (g.roamTarget.y - g.y)**2));
          const dx = g.roamTarget.x - g.x;
          const dy = g.roamTarget.y - g.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d > 0.1) {
            return { x: g.x + (dx/d) * progress, y: g.y + (dy/d) * progress };
          }
        }
        return { x: g.x, y: g.y };
      };
      
      // Find window: time when all guards are far from path
      const findSafeWindow = (x1, y1, x2, y2, lookAheadFrames = 600) => {
        const pathPoints = [];
        for (let t = 0; t <= 1; t += 0.1) {
          pathPoints.push({ x: x1 + (x2-x1)*t, y: y1 + (y2-y1)*t });
        }
        pathPoints.push({ x: x2, y: y2 }); // Destination
        
        const travelFrames = Math.sqrt((x2-x1)**2 + (y2-y1)**2) / 0.04;
        
        // Look for window starting in next N frames
        for (let startFrame = 0; startFrame < lookAheadFrames; startFrame += 10) {
          let windowSafe = true;
          
          // Check if path is safe from startFrame through startFrame + travelFrames
          for (let t = 0; t <= 1 && windowSafe; t += 0.2) {
            const checkFrame = startFrame + t * travelFrames;
            const px = x1 + (x2-x1)*t, py = y1 + (y2-y1)*t;
            
            for (const g of guards) {
              const futurePos = predictGuardPos(g, checkFrame);
              const dist = Math.sqrt((futurePos.x - px)**2 + (futurePos.y - py)**2);
              
              if (dist < g.range + 1.5) {
                windowSafe = false;
                break;
              }
            }
          }
          
          // Also check destination has clearance for the hold time
          if (windowSafe) {
            for (let holdFrame = 0; holdFrame < 60; holdFrame += 20) {
              const checkFrame = startFrame + travelFrames + holdFrame;
              for (const g of guards) {
                const futurePos = predictGuardPos(g, checkFrame);
                const dist = Math.sqrt((futurePos.x - x2)**2 + (futurePos.y - y2)**2);
                if (dist < g.range + 2) {
                  windowSafe = false;
                  break;
                }
              }
            }
          }
          
          if (windowSafe) {
            return { found: true, startsIn: startFrame };
          }
        }
        
        return { found: false };
      };
      
      // Check if NOW is safe (for immediate GO) - look 60 frames ahead (~1 sec)
      // checkCameras: true for SAM (must avoid cameras), false for Maya (SAM disables for her)
      const isNowSafe = (x1, y1, x2, y2, checkCameras = false) => {
        // Check current positions of all guards
        for (const g of guards) {
          // Check start point
          const distStart = Math.sqrt((g.x - x1)**2 + (g.y - y1)**2);
          if (distStart < g.range + 2) return false;
          
          // Check end point
          const distEnd = Math.sqrt((g.x - x2)**2 + (g.y - y2)**2);
          if (distEnd < g.range + 2) return false;
          
          // Check midpoint
          const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
          const distMid = Math.sqrt((g.x - midX)**2 + (g.y - midY)**2);
          if (distMid < g.range + 2) return false;
        }
        
        // Check camera coverage
        if (checkCameras) {
          const checkPoints = [
            {x: x1, y: y1},
            {x: (x1 + x2) / 2, y: (y1 + y2) / 2},
            {x: x2, y: y2}
          ];
          for (const pt of checkPoints) {
            for (const cam of cams) {
              if (cam.on && inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, pt.x, pt.y, map)) {
                return false; // Path goes through camera
              }
            }
          }
        }
        
        const window = findSafeWindow(x1, y1, x2, y2, 60);
        return window.found && window.startsIn < 20;
      };
      
      if (sam.state === 'IDLE') {
        if (sam.phase === 0) {
          // Stay in pit and observe guard movements
          if (minCycles < 3) {
            const cycleInfo = guards.map(g => `${g.name}:${sam.patterns[g.name].cyclesObserved || 0}`).join(' ');
            sam.action = `Observing guards [${cycleInfo}]`;
          } else {
            sam.action = 'Guards tracked. Moving to staging.';
            sam.phase = 1;
            sam.windowFrames = 0;
          }
        }
        else if (sam.phase === 1) {
          // First: move to staging inside pit room (north side, near exit)
          const atStaging = sam.x >= 18 && sam.y <= 5;
          
          if (!atStaging) {
            if (!sam.path) move(sam, 20, 3);
            sam.action = 'Moving to staging (north pit)';
          } else {
            // At staging - now wait for server window (will use spectator corridor)
            const window = findSafeWindow(sam.x, sam.y, 40, 7);
            if (window.found && window.startsIn < 20) {
              sam.windowFrames++;
              sam.action = `Server window open ${Math.floor(sam.windowFrames/30*100)}%`;
              if (sam.windowFrames >= 30 && isNowSafe(sam.x, sam.y, 40, 7, true)) {  // true = check cameras
                if (smartMove(sam, 40, 7, true)) {  // true = check cameras
                  sam.action = `To server via ${sam.routeType} (${sam.routeScore})`;
                  sam.phase = 2;
                }
                sam.windowFrames = 0;
              }
            } else if (window.found) {
              sam.windowFrames = 0;
              sam.action = `Server window in ${(window.startsIn/60).toFixed(1)}s`;
            } else {
              sam.windowFrames = 0;
              sam.action = 'At staging - waiting for window...';
            }
          }
        }
        else if (sam.phase === 2 && !sam.path) {
          sam.action = 'Accessing security systems...';
          sam.wait = 60; sam.state = 'WAITING'; sam.phase = 3;
        }
        else if (sam.phase === 3) {
          // SAM now has access to security systems - real-time guard tracking
          const exitCam = cams.find(c => c.id === 'EXIT');
          const corrCam = cams.find(c => c.id === 'CORR');
          const vaultCam = cams.find(c => c.id === 'VAULT');
          
          // Phase 3a: Maya at pit exit - find initial window before she leaves safety
          if (maya.phase === 1 && maya.x >= 22 && maya.y >= 14) {
            // Check if path to vault room is currently clear
            const window = findSafeWindow(22, 14, 45, 34);
            if (window.found && window.startsIn < 30) {
              sam.windowFrames = (sam.windowFrames || 0) + 1;
              sam.action = `Window opening ${Math.floor(sam.windowFrames/45*100)}%`;
              
              if (sam.windowFrames >= 45 && isNowSafe(22, 14, 35, 22)) {
                sam.action = '🟢 GO MAYA - Window open';
                maya.sig = 'GO';
                sam.windowFrames = 0;
              }
            } else if (window.found) {
              sam.windowFrames = 0;
              sam.action = `Window in ${(window.startsIn/60).toFixed(1)}s - hold`;
            } else {
              sam.windowFrames = 0;
              const guardInfo = guards.map(g => `${g.name}@${Math.floor(g.x)},${Math.floor(g.y)}`).join(' ');
              sam.action = `Finding window... [${guardInfo}]`;
            }
          }
          // Phase 3a-2: Rico at pit exit - find window for him
          else if (rico.phase === 1 && rico.x >= 22 && rico.y >= 14) {
            const window = findSafeWindow(22, 14, 45, 34);
            if (window.found && window.startsIn < 30) {
              sam.ricoWindowFrames = (sam.ricoWindowFrames || 0) + 1;
              sam.action = `Rico window ${Math.floor(sam.ricoWindowFrames/45*100)}%`;
              
              if (sam.ricoWindowFrames >= 45 && isNowSafe(22, 14, 35, 22)) {
                sam.action = '🟢 GO RICO - Window open';
                rico.sig = 'GO_RICO';
                sam.ricoWindowFrames = 0;
              }
            } else if (window.found) {
              sam.ricoWindowFrames = 0;
              sam.action = `Rico window in ${(window.startsIn/60).toFixed(1)}s`;
            } else {
              sam.ricoWindowFrames = 0;
              sam.action = `Finding Rico window...`;
            }
          }
          // Phase 3b: Maya and/or Rico moving - dynamic camera control
          else if (maya.phase >= 2 || rico.phase >= 2) {
            // Check if EITHER crew member is IN or ABOUT TO ENTER each camera's cone
            const inConeNowAny = (cam) => {
              if (!cam) return false;
              // Check Maya (if moving/hacking OR grabbing loot)
              if ((maya.phase >= 2 && maya.phase < 4) || maya.phase === 5) {
                if (inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, maya.x, maya.y, map)) return true;
              }
              // Check Rico (if moving, planting, or grabbing loot)
              if (rico.phase >= 2 && rico.phase <= 6) {
                if (inCone(cam.x, cam.y, cam.a, cam.fov, cam.r, rico.x, rico.y, map)) return true;
              }
              return false;
            };
            
            // APPROACHING threat - will either enter cone very soon?
            const nearConeAny = (cam) => {
              if (!cam) return false;
              if ((maya.phase >= 2 && maya.phase < 4) || maya.phase === 5) {
                if (inCone(cam.x, cam.y, cam.a, cam.fov + 0.3, cam.r + 2, maya.x, maya.y, map)) return true;
              }
              if (rico.phase >= 2 && rico.phase <= 6) {
                if (inCone(cam.x, cam.y, cam.a, cam.fov + 0.3, cam.r + 2, rico.x, rico.y, map)) return true;
              }
              return false;
            };
            
            // Check current/near status for each camera
            const exitInNow = inConeNowAny(exitCam);
            const corrInNow = inConeNowAny(corrCam);
            const vaultInNow = inConeNowAny(vaultCam);
            
            const exitNear = nearConeAny(exitCam);
            const corrNear = nearConeAny(corrCam);
            const vaultNear = nearConeAny(vaultCam);
            
            // IMMEDIATE DANGER - crew member is IN a cone that's ON
            // This takes absolute priority - must fix NOW
            let immediateThreat = null;
            if (exitInNow && exitCam?.on) immediateThreat = {cam: exitCam, name: 'EXIT'};
            else if (corrInNow && corrCam?.on) immediateThreat = {cam: corrCam, name: 'CORR'};
            else if (vaultInNow && vaultCam?.on) immediateThreat = {cam: vaultCam, name: 'VAULT'};
            
            // APPROACHING DANGER - about to enter a cone that's ON
            let approachingThreat = null;
            if (!immediateThreat) {
              if (exitNear && exitCam?.on) approachingThreat = {cam: exitCam, name: 'EXIT'};
              else if (corrNear && corrCam?.on) approachingThreat = {cam: corrCam, name: 'CORR'};
              else if (vaultNear && vaultCam?.on) approachingThreat = {cam: vaultCam, name: 'VAULT'};
            }
            
            // PATH LOOKAHEAD - check both Maya and Rico paths
            const findFirstCamOnPath = () => {
              // Check Maya's path (phases 2-4 for initial approach, phase 5 for loot grab)
              if (maya.path && maya.pi < maya.path.length && ((maya.phase >= 2 && maya.phase < 4) || maya.phase === 5)) {
                for (let i = maya.pi; i < Math.min(maya.pi + 30, maya.path.length); i++) {
                  const pt = maya.path[i];
                  if (exitCam && exitCam.on && inCone(exitCam.x, exitCam.y, exitCam.a, exitCam.fov, exitCam.r, pt.x, pt.y, map)) {
                    return {cam: exitCam, name: 'EXIT', dist: i - maya.pi, who: 'M'};
                  }
                  if (corrCam && corrCam.on && inCone(corrCam.x, corrCam.y, corrCam.a, corrCam.fov, corrCam.r, pt.x, pt.y, map)) {
                    return {cam: corrCam, name: 'CORR', dist: i - maya.pi, who: 'M'};
                  }
                  if (vaultCam && vaultCam.on && inCone(vaultCam.x, vaultCam.y, vaultCam.a, vaultCam.fov, vaultCam.r, pt.x, pt.y, map)) {
                    return {cam: vaultCam, name: 'VAULT', dist: i - maya.pi, who: 'M'};
                  }
                }
              }
              // Check Rico's path (phases 2-6 cover approach through loot grab)
              if (rico.path && rico.pi < rico.path.length && rico.phase >= 2 && rico.phase <= 6) {
                for (let i = rico.pi; i < Math.min(rico.pi + 30, rico.path.length); i++) {
                  const pt = rico.path[i];
                  if (exitCam && exitCam.on && inCone(exitCam.x, exitCam.y, exitCam.a, exitCam.fov, exitCam.r, pt.x, pt.y, map)) {
                    return {cam: exitCam, name: 'EXIT', dist: i - rico.pi, who: 'R'};
                  }
                  if (corrCam && corrCam.on && inCone(corrCam.x, corrCam.y, corrCam.a, corrCam.fov, corrCam.r, pt.x, pt.y, map)) {
                    return {cam: corrCam, name: 'CORR', dist: i - rico.pi, who: 'R'};
                  }
                  if (vaultCam && vaultCam.on && inCone(vaultCam.x, vaultCam.y, vaultCam.a, vaultCam.fov, vaultCam.r, pt.x, pt.y, map)) {
                    return {cam: vaultCam, name: 'VAULT', dist: i - rico.pi, who: 'R'};
                  }
                }
              }
              return null;
            };
            
            const allCams = [exitCam, corrCam, vaultCam].filter(c => c);
            const offCam = allCams.find(c => !c.on);
            const camsOffNow = allCams.filter(c => !c.on).length;
            
            // CAMERA CONTROL LOGIC - strict priority order
            if (immediateThreat) {
              // CRITICAL: Maya is IN a cone that's ON - must disable immediately!
              if (offCam && offCam !== immediateThreat.cam) {
                // Wrong camera is off - SWAP
                offCam.on = true;
                immediateThreat.cam.on = false;
                sam.action = `⚠️ SWAP → ${immediateThreat.name} (IN CONE!)`;
              } else if (!offCam) {
                // No camera off - disable this one
                immediateThreat.cam.on = false;
                sam.action = `⚠️ ${immediateThreat.name} disabled (IN CONE!)`;
              } else {
                sam.action = `📷 ${immediateThreat.name} disabled`;
              }
            }
            else if (approachingThreat) {
              // Maya is approaching a cone - disable it
              if (offCam && offCam !== approachingThreat.cam) {
                offCam.on = true;
                approachingThreat.cam.on = false;
                sam.action = `📷 SWAP → ${approachingThreat.name} (approaching)`;
              } else if (!offCam) {
                approachingThreat.cam.on = false;
                sam.action = `📷 ${approachingThreat.name} disabled (approaching)`;
              } else {
                sam.action = `📷 ${approachingThreat.name} disabled`;
              }
            }
            else {
              // No immediate/approaching threat - use path lookahead
              const pathCam = findFirstCamOnPath();
              
              // Re-enable cameras Maya has passed (not needed anymore)
              if (offCam && !exitInNow && !exitNear && offCam === exitCam) {
                const pathNeedsExit = pathCam && pathCam.cam === exitCam;
                if (!pathNeedsExit) exitCam.on = true;
              }
              if (offCam && !corrInNow && !corrNear && offCam === corrCam) {
                const pathNeedsCorr = pathCam && pathCam.cam === corrCam;
                if (!pathNeedsCorr) corrCam.on = true;
              }
              if (offCam && !vaultInNow && !vaultNear && offCam === vaultCam) {
                const pathNeedsVault = pathCam && pathCam.cam === vaultCam;
                if (!pathNeedsVault) vaultCam.on = true;
              }
              
              // Proactively disable camera on path (if within 20 tiles)
              const stillOff = allCams.find(c => !c.on);
              if (pathCam && pathCam.dist < 20) {
                if (stillOff && stillOff !== pathCam.cam) {
                  stillOff.on = true;
                  pathCam.cam.on = false;
                  sam.action = `📷 ${pathCam.name} (${pathCam.dist} ahead)`;
                } else if (!stillOff) {
                  pathCam.cam.on = false;
                  sam.action = `📷 ${pathCam.name} (${pathCam.dist} ahead)`;
                } else {
                  sam.action = `📷 ${pathCam.name} disabled`;
                }
              } else {
                // No camera threats - show guard positions
                const guardInfo = guards.map(g => `${g.name}@${Math.floor(g.x)},${Math.floor(g.y)}`).join(' ');
                sam.action = `👁 ${guardInfo}`;
              }
            }
            
            // Show hack progress when Maya is hacking
            if (maya.phase === 3 && maya.hacking && !maya.hackComplete) {
              const guesses = maya.hackGuesses.length;
              const remaining = maya.hackPossible ? maya.hackPossible.length : '?';
              sam.action = `🔐 Maya hacking (${guesses} tries, ${remaining} left)`;
            }
            
            // Show Rico status when he's moving
            if (rico.phase === 2 && rico.path) {
              const tilesLeft = rico.path.length - rico.pi;
              sam.action = `📍 Rico en route [${tilesLeft}]`;
            }
            // Show Rico planting
            if (rico.phase === 4 && rico.state === 'PLANTING') {
              const progress = Math.min(100, Math.floor(((rico.chargeTimer || 0) / 300) * 100));
              sam.action = `💣 Rico planting... ${progress}%`;
            }
            // Show explosion wait
            if (rico.phase === 5 && s.chargePlanted && !s.chargeExploded) {
              sam.action = `⏳ Charge set - waiting for clear`;
            }
            // Show loot grab
            if (rico.phase === 6 || maya.phase === 5) {
              sam.action = `💰 Grabbing loot...`;
            }
            // Show retreat to closet
            if (rico.phase === 7 || maya.phase === 6) {
              sam.action = `🏃 Retreating to closet...`;
            }
          }
          
          // Phase 3c: Check for transition to phase 4 (both in closet)
          const mayaInCloset = maya.x >= 1 && maya.x <= 5 && maya.y >= 37 && maya.y <= 40;
          const ricoInCloset = rico.x >= 1 && rico.x <= 5 && rico.y >= 37 && rico.y <= 40;
          
          if (maya.phase >= 7 && rico.phase >= 8 && mayaInCloset && ricoInCloset) {
            sam.phase = 4;
            sam.action = '🚪 Both in closet - finding escape window';
          }
        }
        // Phase 4: Both in closet - wait for escape window, then unlock back door
        else if (sam.phase === 4) {
          // Find window when guards are far from back door
          const backDoorPos = {x: 20, y: 40};
          const guardsNearBackDoor = guards.some(g => {
            const dist = Math.sqrt((g.x - backDoorPos.x)**2 + (g.y - backDoorPos.y)**2);
            return dist < 20;
          });
          
          if (!guardsNearBackDoor) {
            sam.escapeWindowFrames = (sam.escapeWindowFrames || 0) + 1;
            sam.action = `Escape window ${Math.floor(sam.escapeWindowFrames/30*100)}%`;
            
            if (sam.escapeWindowFrames >= 30) {
              // UNLOCK BACK DOOR - triggers alarm!
              s.backDoorOpen = true;
              s.alarmTriggered = true;
              sam.phase = 5;
              sam.action = '🚨 BACK DOOR UNLOCKED - ALARM TRIGGERED!';
              
              // Guards rush to investigate back door
              guards.forEach(g => {
                g.investigating = true;
                g.investigateTarget = {x: backDoorPos.x, y: backDoorPos.y - 5}; // Near back door
              });
            }
          } else {
            sam.escapeWindowFrames = 0;
            sam.action = `⏳ Guards too close to exit...`;
          }
        }
        // Phase 5: Alarm triggered - wait for Maya and Rico to escape
        else if (sam.phase === 5) {
          if (maya.escaped && rico.escaped) {
            sam.phase = 6;
            move(sam, 31, 0); // Front door (spectator entrance)
            sam.action = '🏃 Maya & Rico out - heading to front!';
          } else {
            const whoOut = [];
            if (maya.escaped) whoOut.push('Maya');
            if (rico.escaped) whoOut.push('Rico');
            sam.action = `🚨 ${whoOut.length > 0 ? whoOut.join('+') + ' out' : 'Waiting for escape'}...`;
          }
        }
        // Phase 6: Exit through front door
        else if (sam.phase === 6) {
          if (sam.y <= 1) {
            sam.escaped = true;
            sam.action = '✓ ESCAPED';
            // Check for full success
            if (maya.escaped && rico.escaped && sam.escaped && !s.alarm) {
              s.success = true;
            }
          } else if (!sam.path) {
            move(sam, 31, 0);
          } else {
            const tilesLeft = sam.path.length - sam.pi;
            sam.action = `🏃 To front exit [${tilesLeft}]`;
          }
        }
      }

      // ========== MAYA - DYNAMIC PATHFINDING ==========
      // Maya's goal: reach vault room, hack vault door
      // Vault door at (45, 35), Maya hacks from (45, 34)
      const VAULT_ROOM_TARGET = {x: 45, y: 34};  // In front of vault door
      const VAULT_DOOR = {x: 45, y: 35};
      const inVaultRoom = maya.x >= 36 && maya.x <= 54 && maya.y >= 27 && maya.y <= 34;
      
      // Update Maya's threat awareness
      maya.threat = getThreat(maya.x, maya.y, true);
      
      if (maya.state === 'IDLE' || maya.state === 'MOVING' || maya.state === 'HACKING') {
        // Phase 0: Wait for SAM to reach server
        if (maya.phase === 0) {
          if (sam.phase >= 3) {
            maya.phase = 1;
            maya.action = 'SAM online - beginning infiltration';
          } else {
            maya.action = 'Awaiting SAM server access';
          }
        }
        // Phase 1: Move to pit exit AND WAIT for SAM's GO signal
        else if (maya.phase === 1) {
          if (maya.x < 22 || maya.y < 14) {
            if (!maya.path) move(maya, 22, 14);
            maya.action = 'Moving to pit exit';
          } else {
            // At pit exit - wait for SAM's GO signal
            if (maya.sig === 'GO') {
              maya.sig = null;
              maya.phase = 2;
              maya.replanTimer = 0;
              maya.action = 'GO received - dynamic navigation';
            } else {
              maya.action = 'At pit exit - awaiting window';
            }
          }
        }
        // Phase 2: Dynamic navigation to vault room
        else if (maya.phase === 2) {
          maya.replanTimer = (maya.replanTimer || 0) + 1;
          
          // Check if we've reached the vault door position
          const distToTarget = Math.sqrt((maya.x - VAULT_ROOM_TARGET.x)**2 + (maya.y - VAULT_ROOM_TARGET.y)**2);
          if (distToTarget < 2) {
            maya.phase = 3;
            maya.path = null;
            maya.debugRoutes = null;
            maya.state = 'HACKING';
            maya.hacking = true;
            // Initialize Mastermind solver with all possible codes
            maya.hackPossible = generateAllCodes();
            maya.hackGuesses = [];
            maya.hackTimer = 0;
            maya.action = 'At vault door - initializing crack';
            // Signal Rico to start moving
            rico.sig = 'GO';
          }
          // Re-evaluate path every 10 frames
          else if (maya.replanTimer >= 10) {
            maya.replanTimer = 0;
            
            // Try smartMove to vault room
            if (smartMove(maya, VAULT_ROOM_TARGET.x, VAULT_ROOM_TARGET.y)) {
              maya.action = `→ vault room via ${maya.routeType} (${maya.routeScore})`;
              maya.frozen = false;
            } else {
              // smartMove failed - try intermediate points
              let foundRoute = false;
              
              const intermediates = [
                {x: 30, y: 20}, {x: 35, y: 15}, {x: 30, y: 25},
                {x: 35, y: 30}, {x: 40, y: 20}, {x: 28, y: 18},
                {x: 32, y: 28}, {x: 38, y: 25}, {x: 26, y: 20},
                {x: 34, y: 18}, {x: 40, y: 30}, {x: 28, y: 26}
              ];
              
              for (const pt of intermediates) {
                if (smartMove(maya, pt.x, pt.y)) {
                  maya.action = `Rerouting → (${pt.x},${pt.y}) [${maya.routeType}]`;
                  foundRoute = true;
                  maya.frozen = false;
                  break;
                }
              }
              
              if (!foundRoute) {
                // No route found but don't freeze - keep trying
                maya.action = '⚠️ Seeking route...';
              }
            }
          } else if (maya.path) {
            const tilesLeft = maya.path.length - maya.pi;
            maya.action = `En route [${tilesLeft}] via ${maya.routeType}`;
          }
        }
        // Phase 3: Hacking vault door (Mastermind solver)
        else if (maya.phase === 3 && maya.state === 'HACKING') {
          maya.hackTimer = (maya.hackTimer || 0) + 1;
          
          // Make a guess every 330 frames (5.5 seconds)
          if (maya.hackTimer >= 330 && !maya.hackComplete) {
            maya.hackTimer = 0;
            
            // Pick next guess
            const guess = pickNextGuess(maya.hackPossible);
            const feedback = getMastermindFeedback(guess, s.vaultCode);
            
            maya.hackGuesses.push({ guess, feedback });
            
            if (feedback.bulls === 6) {
              // CRACKED!
              maya.hackComplete = true;
              s.vaultDoorOpen = true;
              maya.action = `🔓 CRACKED in ${maya.hackGuesses.length} tries`;
              maya.phase = 4;
              maya.state = 'IDLE';
            } else {
              // Filter remaining possibilities
              maya.hackPossible = filterPossibleCodes(maya.hackPossible, guess, feedback);
              const remaining = maya.hackPossible.length;
              maya.action = `Hack [${feedback.bulls}🎯${feedback.cows}⚪] ${remaining} left`;
            }
          } else if (!maya.hackComplete) {
            const lastGuess = maya.hackGuesses.length > 0 ? maya.hackGuesses[maya.hackGuesses.length - 1] : null;
            if (lastGuess) {
              maya.action = `Analyzing... ${lastGuess.feedback.bulls}🎯${lastGuess.feedback.cows}⚪`;
            } else {
              maya.action = 'Initializing vault crack...';
            }
          }
        }
        // Phase 4: Hack complete - waiting for Rico to plant and detonate
        else if (maya.phase === 4) {
          maya.action = `✓ Vault open - awaiting Rico`;
        }
        // Phase 5: Explosion happened - enter vault, grab loot
        else if (maya.phase === 5) {
          const mayaInInnerVault = maya.x >= 36 && maya.x <= 54 && maya.y >= 36 && maya.y <= 40;
          if (mayaInInnerVault) {
            maya.lootTimer = (maya.lootTimer || 0) + 1;
            maya.action = '💰 Grabbing loot...';
            if (maya.lootTimer >= 120) { // 2 seconds
              maya.hasLoot = true;
              maya.phase = 6;
              maya.action = '💰 Got loot - heading to closet';
            }
          } else if (!maya.path) {
            move(maya, 45, 38); // Inner vault
          }
        }
        // Phase 6: Navigate to closet
        else if (maya.phase === 6) {
          const mayaInCloset = maya.x >= 1 && maya.x <= 5 && maya.y >= 37 && maya.y <= 40;
          if (mayaInCloset) {
            maya.phase = 7;
            maya.action = '🚪 In closet - waiting';
          } else {
            maya.replanTimer = (maya.replanTimer || 0) + 1;
            if (maya.replanTimer >= 10 || !maya.path) {
              maya.replanTimer = 0;
              move(maya, 3, 39); // Closet
            }
            const tilesLeft = maya.path ? maya.path.length - maya.pi : '?';
            maya.action = `→ closet [${tilesLeft}]`;
          }
        }
        // Phase 7: In closet - wait for escape
        else if (maya.phase === 7) {
          if (s.backDoorOpen) {
            maya.phase = 8;
            move(maya, 20, 40); // Back door
            maya.action = '🏃 Escaping!';
          } else {
            maya.action = '🚪 Hiding - awaiting escape';
          }
        }
        // Phase 8: Escape through back door
        else if (maya.phase === 8) {
          if (maya.y >= 41) {
            maya.escaped = true;
            maya.action = '✓ ESCAPED';
          } else if (!maya.path) {
            move(maya, 20, 42); // Out the back
          }
        }
      }

      // ========== RICO - EXPLOSIVES EXPERT ==========
      // Rico deploys when Maya starts hacking, follows same pathfinding logic
      const RICO_TARGET = {x: 45, y: 34};  // Vault room (before inner vault)
      const INNER_VAULT = {x: 45, y: 38};  // Inner vault (plant charge / grab loot)
      const CLOSET = {x: 3, y: 39};        // Closet hiding spot
      const BACK_DOOR = {x: 20, y: 40};    // Escape route
      const ricoInVaultRoom = rico.x >= 36 && rico.x <= 54 && rico.y >= 27 && rico.y <= 34;
      const ricoInInnerVault = rico.x >= 36 && rico.x <= 54 && rico.y >= 36 && rico.y <= 40;
      const ricoInCloset = rico.x >= 1 && rico.x <= 5 && rico.y >= 37 && rico.y <= 40;
      
      // Check if any guard is within 15 tiles of inner vault (for explosion timing)
      const guardsNearVault = guards.some(g => {
        const dist = Math.sqrt((g.x - INNER_VAULT.x)**2 + (g.y - INNER_VAULT.y)**2);
        return dist < 15;
      });
      
      // Update Rico's threat awareness
      rico.threat = getThreat(rico.x, rico.y, true);
      
      if (rico.state === 'IDLE' || rico.state === 'MOVING') {
        // Phase 0: Wait for Maya's GO signal (when she starts hacking)
        if (rico.phase === 0) {
          if (rico.sig === 'GO') {
            rico.sig = null;
            rico.phase = 1;
            s.ricoUsed = true;
            rico.action = 'Maya hacking - moving to vault room';
          } else {
            rico.action = 'Awaiting Maya signal';
          }
        }
        // Phase 1: Move to pit exit, wait for SAM's GO
        else if (rico.phase === 1) {
          if (rico.x < 22 || rico.y < 14) {
            if (!rico.path) move(rico, 22, 14);
            rico.action = 'Moving to pit exit';
          } else {
            // At pit exit - wait for SAM's window for Rico
            if (rico.sig === 'GO_RICO') {
              rico.sig = null;
              rico.phase = 2;
              rico.replanTimer = 0;
              rico.action = 'GO received - en route to vault room';
            } else {
              rico.action = 'At pit exit - awaiting window';
            }
          }
        }
        // Phase 2: Navigate to vault room (same logic as Maya)
        else if (rico.phase === 2) {
          rico.replanTimer = (rico.replanTimer || 0) + 1;
          
          // Check if reached vault room
          const distToTarget = Math.sqrt((rico.x - RICO_TARGET.x)**2 + (rico.y - RICO_TARGET.y)**2);
          if (distToTarget < 2) {
            rico.phase = 3;
            rico.path = null;
            rico.action = 'In vault room - awaiting vault door';
          }
          // Re-evaluate path every 10 frames
          else if (rico.replanTimer >= 10) {
            rico.replanTimer = 0;
            
            if (smartMove(rico, RICO_TARGET.x, RICO_TARGET.y)) {
              rico.action = `→ vault room via ${rico.routeType} (${rico.routeScore})`;
              rico.frozen = false;
            } else {
              let foundRoute = false;
              const intermediates = [
                {x: 30, y: 20}, {x: 35, y: 15}, {x: 30, y: 25},
                {x: 35, y: 30}, {x: 40, y: 20}, {x: 28, y: 18}
              ];
              
              for (const pt of intermediates) {
                if (smartMove(rico, pt.x, pt.y)) {
                  rico.action = `Rerouting → (${pt.x},${pt.y})`;
                  foundRoute = true;
                  rico.frozen = false;
                  break;
                }
              }
              
              if (!foundRoute) {
                // No route found but don't freeze - keep trying
                rico.action = '⚠️ Seeking route...';
              }
            }
          } else if (rico.path) {
            const tilesLeft = rico.path.length - rico.pi;
            rico.action = `En route [${tilesLeft}] via ${rico.routeType}`;
          }
        }
        // Phase 3: In vault room - wait for door to open
        else if (rico.phase === 3) {
          if (s.vaultDoorOpen) {
            rico.phase = 4;
            rico.chargeTimer = 0;
            move(rico, INNER_VAULT.x, INNER_VAULT.y);
            rico.action = 'Door open - entering inner vault';
          } else {
            rico.action = 'Awaiting vault door...';
          }
        }
        // Phase 4: Enter inner vault, plant charge
        else if (rico.phase === 4) {
          if (ricoInInnerVault) {
            // Start planting - timer handled in PLANTING state block below
            rico.state = 'PLANTING';
            rico.action = '💣 Planting charge...';
          } else if (!rico.path) {
            move(rico, INNER_VAULT.x, INNER_VAULT.y);
          }
        }
        // Phase 5: Exit to vault room, wait for explosion
        else if (rico.phase === 5) {
          if (ricoInVaultRoom && !ricoInInnerVault) {
            // Safe distance - wait for explosion
            if (!guardsNearVault && s.chargePlanted && !s.chargeExploded) {
              s.chargeExploded = true;
              rico.action = '💥 BOOM! Safe blown open';
              rico.phase = 6;
              // Maya also moves to phase 5 (get loot)
              maya.phase = 5;
            } else if (!s.chargeExploded) {
              rico.action = `⏳ Waiting... guards ${guardsNearVault ? 'too close' : 'clear'}`;
            }
          } else if (!rico.path) {
            move(rico, RICO_TARGET.x, RICO_TARGET.y);
            rico.action = 'Exiting inner vault...';
          }
        }
        // Phase 6: Re-enter vault, grab loot
        else if (rico.phase === 6) {
          if (ricoInInnerVault) {
            rico.lootTimer = (rico.lootTimer || 0) + 1;
            rico.action = '💰 Grabbing loot...';
            if (rico.lootTimer >= 120) { // 2 seconds
              rico.hasLoot = true;
              rico.phase = 7;
              rico.action = '💰 Got loot - heading to closet';
            }
          } else if (!rico.path) {
            move(rico, INNER_VAULT.x, INNER_VAULT.y);
          }
        }
        // Phase 7: Navigate to closet
        else if (rico.phase === 7) {
          if (ricoInCloset) {
            rico.phase = 8;
            rico.action = '🚪 In closet - waiting';
          } else {
            rico.replanTimer = (rico.replanTimer || 0) + 1;
            if (rico.replanTimer >= 10 || !rico.path) {
              rico.replanTimer = 0;
              move(rico, CLOSET.x, CLOSET.y);
            }
            const tilesLeft = rico.path ? rico.path.length - rico.pi : '?';
            rico.action = `→ closet [${tilesLeft}]`;
          }
        }
        // Phase 8: In closet - wait for escape
        else if (rico.phase === 8) {
          if (s.backDoorOpen) {
            rico.phase = 9;
            move(rico, BACK_DOOR.x, BACK_DOOR.y);
            rico.action = '🏃 Escaping!';
          } else {
            rico.action = '🚪 Hiding - awaiting escape';
          }
        }
        // Phase 9: Escape through back door
        else if (rico.phase === 9) {
          if (rico.y >= 41) {
            rico.escaped = true;
            rico.action = '✓ ESCAPED';
          } else if (!rico.path) {
            move(rico, BACK_DOOR.x, H);
          }
        }
      }
      // Handle PLANTING state (don't move while planting)
      if (rico.state === 'PLANTING' && rico.phase === 4) {
        rico.chargeTimer = (rico.chargeTimer || 0) + 1;
        const progress = Math.min(100, Math.floor((rico.chargeTimer / 300) * 100)); // 5 seconds = 300 frames
        rico.action = `💣 Planting charge... ${progress}%`;
        
        if (rico.chargeTimer >= 300) {
          s.chargePlanted = true;
          rico.phase = 5;
          rico.state = 'IDLE';
          move(rico, RICO_TARGET.x, RICO_TARGET.y); // Exit back to vault room
          rico.action = 'Charge set - exiting vault';
        }
      }

      // ========== SPECTATORS - OBSTACLES ==========
      const pitRoomBounds = {x1: 2, x2: 22, y1: 2, y2: 22};
      const fightRing = {x1: 7, x2: 18, y1: 9, y2: 18}; // PIT tiles - spectators surround but don't enter
      const spectatorDoor = {x: 31, y: 1};
      const MAX_SPECTATORS = 55;
      
      // Helper: check if point is in fight ring
      const inFightRing = (x, y) => {
        return x >= fightRing.x1 && x <= fightRing.x2 && 
               y >= fightRing.y1 && y <= fightRing.y2;
      };
      
      // Helper: get valid wander point (not in fight ring)
      const getWanderPoint = () => {
        let tx, ty, attempts = 0;
        do {
          tx = Math.floor(Math.random() * (pitRoomBounds.x2 - pitRoomBounds.x1)) + pitRoomBounds.x1;
          ty = Math.floor(Math.random() * (pitRoomBounds.y2 - pitRoomBounds.y1)) + pitRoomBounds.y1;
          attempts++;
        } while (inFightRing(tx, ty) && attempts < 50);
        return {x: tx, y: ty};
      };
      
      // Process each spectator
      s.spectators.forEach(spec => {
        spec.leaveTimer--;
        spec.moveTimer--;
        
        if (spec.state === 'WANDER') {
          // Time to leave?
          if (spec.leaveTimer <= 0) {
            spec.state = 'LEAVING';
            spec.path = civilianPath(spec.x, spec.y, spectatorDoor.x, spectatorDoor.y, map);
            spec.pi = 1;
          }
          // Pick new wander target (use pathfinding)
          else if (spec.moveTimer <= 0 || !spec.path) {
            const target = getWanderPoint();
            spec.path = civilianPath(spec.x, spec.y, target.x, target.y, map);
            spec.pi = 1;
            spec.moveTimer = 120 + Math.floor(Math.random() * 180); // Move every 2-5 sec
          }
        }
        
        if (spec.state === 'ENTERING') {
          // Walking from door to pit room - get path if needed
          if (!spec.path) {
            const target = getWanderPoint();
            spec.path = civilianPath(spec.x, spec.y, target.x, target.y, map);
            spec.pi = 1;
          }
          // Check if entered pit room
          if (spec.x <= 22 && spec.y >= 3) {
            spec.state = 'WANDER';
            spec.leaveTimer = 12600; // 210 seconds
          }
        }
        
        // Follow path (same as crew/guards)
        if (spec.path && spec.pi < spec.path.length) {
          const target = spec.path[spec.pi];
          const dx = target.x - spec.x;
          const dy = target.y - spec.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d > 0.3) {
            const speed = 0.02; // Slow wandering
            spec.x += (dx/d) * speed;
            spec.y += (dy/d) * speed;
          } else {
            spec.pi++;
          }
        } else {
          spec.path = null; // Path complete
        }
      });
      
      // Remove spectators that reached the exit
      s.spectators = s.spectators.filter(spec => {
        if (spec.state === 'LEAVING' && spec.y <= 1.5) return false;
        return true;
      });
      
      // Spawn new spectators if below max
      const inPitRoom = s.spectators.filter(sp => sp.x <= 23).length;
      if (inPitRoom < MAX_SPECTATORS && Math.random() < 0.003) { // ~0.3% chance per frame
        const target = getWanderPoint();
        s.spectators.push({
          x: spectatorDoor.x,
          y: spectatorDoor.y,
          id: s.nextSpectatorId++,
          state: 'ENTERING',
          path: civilianPath(spectatorDoor.x, spectatorDoor.y, target.x, target.y, map),
          pi: 1,
          leaveTimer: 1800 + Math.floor(Math.random() * 1800), // 30-60 seconds
          moveTimer: 0
        });
      }

      // (Movement logging removed - no longer needed)

      s.frame++;
      setTick(t => t + 1);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [paused, map, tick]);

  // ========== RENDER ==========
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = S.current;
    const {crew, guards, cams, spectators} = s;
    const [sam, maya] = crew;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W*T, H*T);

    // Map
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      ctx.fillStyle = COL[map[y][x]];
      ctx.fillRect(x*T, y*T, T, T);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5;
      ctx.strokeRect(x*T, y*T, T, T);
    }
    
    // Coordinate labels on perimeter walls
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#888';
    // Top wall (y=0) - show x coordinates every 5
    for (let x=0; x<W; x+=5) {
      ctx.fillText(x.toString(), x*T + T/2, T/2);
    }
    // Bottom wall (y=H-1) - show x coordinates every 5
    for (let x=0; x<W; x+=5) {
      ctx.fillText(x.toString(), x*T + T/2, (H-1)*T + T/2);
    }
    // Left wall (x=0) - show y coordinates every 5
    for (let y=0; y<H; y+=5) {
      ctx.fillText(y.toString(), T/2, y*T + T/2);
    }
    // Right wall (x=W-1) - show y coordinates every 5
    for (let y=0; y<H; y+=5) {
      ctx.fillText(y.toString(), (W-1)*T + T/2, y*T + T/2);
    }
    
    // Patrol zone corridor coloring
    for (let y=1; y<H-1; y++) for (let x=1; x<W-1; x++) {
      if (map[y][x] !== FLOOR) continue;
      const inNoPatrol = noPatrol.some(z => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2);
      if (inNoPatrol) continue;
      
      // Color based on zone
      if (y < ZONE_SPLIT) {
        ctx.fillStyle = zoneTop.color;  // Blue for top zone
      } else {
        ctx.fillStyle = zoneBottom.color;  // Orange for bottom zone
      }
      ctx.fillRect(x*T, y*T, T, T);
    }
    
    // Draw zone divider line
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, ZONE_SPLIT * T);
    ctx.lineTo(W * T, ZONE_SPLIT * T);
    ctx.stroke();
    ctx.setLineDash([]);

    // Room Zones (safe zones)
    ctx.fillStyle = 'rgba(60,120,80,0.15)';
    ctx.fillRect(1*T, 1*T, 23*T, 23*T);
    ctx.fillStyle = 'rgba(120,60,60,0.15)';
    ctx.fillRect(40*T, 1*T, 12*T, 10*T);
    ctx.fillRect(37*T, 28*T, 16*T, 10*T);

    // Camera cones (with wall blocking)
    cams.forEach(c => {
      const cx=(c.x+0.5)*T, cy=(c.y+0.5)*T;
      const rayCount = 20;
      const points = [];
      
      // Cast rays across the FOV
      for (let i = 0; i <= rayCount; i++) {
        const angle = c.a - c.fov/2 + (c.fov * i / rayCount);
        let hitDist = c.r;
        
        // Trace ray until wall or max range
        for (let d = 0.5; d <= c.r; d += 0.5) {
          const checkX = Math.floor(c.x + 0.5 + Math.cos(angle) * d);
          const checkY = Math.floor(c.y + 0.5 + Math.sin(angle) * d);
          
          if (checkX < 0 || checkX >= W || checkY < 0 || checkY >= H) {
            hitDist = d;
            break;
          }
          
          const tile = map[checkY][checkX];
          if (tile === WALL || tile === DOOR) {
            hitDist = d;
            break;
          }
        }
        
        points.push({
          x: cx + Math.cos(angle) * hitDist * T,
          y: cy + Math.sin(angle) * hitDist * T
        });
      }
      
      // Draw cone polygon
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = c.on ? 'rgba(255,200,50,0.25)' : 'rgba(100,100,100,0.1)';
      ctx.fill();
      
      // Camera dot
      ctx.fillStyle = c.on ? '#fc3' : '#666';
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill();
    });

    // Guard current target line (for roaming)
    guards.forEach(g => {
      if (g.roamTarget) {
        ctx.strokeStyle = 'rgba(255,80,80,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo((g.x+0.5)*T, (g.y+0.5)*T);
        ctx.lineTo((g.roamTarget.x+0.5)*T, (g.roamTarget.y+0.5)*T);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (g.path && g.pi < g.path.length) {
        ctx.strokeStyle = 'rgba(255,100,100,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo((g.x+0.5)*T, (g.y+0.5)*T);
        for (let i = g.pi; i < g.path.length; i++) {
          ctx.lineTo((g.path[i].x+0.5)*T, (g.path[i].y+0.5)*T);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Guard vision cones (with wall blocking)
    guards.forEach(g => {
      const gx=(g.x+0.5)*T, gy=(g.y+0.5)*T;
      const rayCount = 30; // Number of rays to cast
      const points = [];
      
      // Cast rays across the FOV
      for (let i = 0; i <= rayCount; i++) {
        const angle = g.facing - g.fov/2 + (g.fov * i / rayCount);
        let hitDist = g.range;
        
        // Trace ray until wall or max range
        for (let d = 0.5; d <= g.range; d += 0.5) {
          const checkX = Math.floor(g.x + 0.5 + Math.cos(angle) * d);
          const checkY = Math.floor(g.y + 0.5 + Math.sin(angle) * d);
          
          if (checkX < 0 || checkX >= W || checkY < 0 || checkY >= H) {
            hitDist = d;
            break;
          }
          
          const tile = map[checkY][checkX];
          if (tile === WALL || tile === DOOR) {
            hitDist = d;
            break;
          }
        }
        
        points.push({
          x: gx + Math.cos(angle) * hitDist * T,
          y: gy + Math.sin(angle) * hitDist * T
        });
      }
      
      // Draw cone polygon
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = g.state==='INVEST' ? 'rgba(255,50,50,0.35)' : 'rgba(255,150,150,0.15)';
      ctx.fill();
    });

    // Guards
    guards.forEach(g => {
      const gx=(g.x+0.5)*T, gy=(g.y+0.5)*T;
      ctx.fillStyle = g.state==='INVEST' ? '#f55' : '#c44';
      ctx.beginPath(); ctx.arc(gx, gy, T*0.4, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.cos(g.facing)*T*0.5, gy + Math.sin(g.facing)*T*0.5);
      ctx.stroke();
    });

    // Maya debug routes - show all evaluated candidates
    if (maya.debugRoutes && maya.debugRoutes.length > 0) {
      // Draw non-chosen routes first (dim)
      maya.debugRoutes.filter(r => !r.chosen).forEach(route => {
        if (route.path && route.path.length > 1) {
          ctx.strokeStyle = 'rgba(255,100,100,0.2)';  // Dim red for rejected
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo((route.path[0].x+0.5)*T, (route.path[0].y+0.5)*T);
          for (let i = 1; i < route.path.length; i++) {
            ctx.lineTo((route.path[i].x+0.5)*T, (route.path[i].y+0.5)*T);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Label with score
          const mid = route.path[Math.floor(route.path.length/2)];
          ctx.fillStyle = 'rgba(255,100,100,0.4)';
          ctx.font = '7px monospace';
          ctx.fillText(`${route.name}:${route.score.toFixed(0)}`, (mid.x+0.5)*T, (mid.y+0.5)*T - 3);
        }
      });
      
      // Draw chosen route (bright)
      const chosen = maya.debugRoutes.find(r => r.chosen);
      if (chosen && chosen.path && chosen.path.length > 1) {
        ctx.strokeStyle = 'rgba(50,255,150,0.6)';  // Bright green for chosen
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo((chosen.path[0].x+0.5)*T, (chosen.path[0].y+0.5)*T);
        for (let i = 1; i < chosen.path.length; i++) {
          ctx.lineTo((chosen.path[i].x+0.5)*T, (chosen.path[i].y+0.5)*T);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Label chosen route
        const mid = chosen.path[Math.floor(chosen.path.length/2)];
        ctx.fillStyle = 'rgba(50,255,150,0.8)';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(`✓${chosen.name}:${chosen.score.toFixed(0)}`, (mid.x+0.5)*T, (mid.y+0.5)*T - 5);
      }
    }

    // Crew paths (actual A* path being followed)
    crew.forEach(c => {
      if (c.path && c.pi < c.path.length) {
        // Path color based on crew member
        const pathColor = c.name === 'SAM' ? 'rgba(255,200,50,0.5)' : 
                          c.name === 'MAYA' ? 'rgba(74,158,255,0.5)' : 
                          'rgba(74,255,122,0.5)';
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo((c.x+0.5)*T, (c.y+0.5)*T);
        for (let i = c.pi; i < c.path.length; i++) {
          ctx.lineTo((c.path[i].x+0.5)*T, (c.path[i].y+0.5)*T);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw destination marker
        const dest = c.path[c.path.length - 1];
        ctx.fillStyle = pathColor;
        ctx.beginPath();
        ctx.arc((dest.x+0.5)*T, (dest.y+0.5)*T, 4, 0, Math.PI*2);
        ctx.fill();
      }
    });

    // Spectators (civilians - obstacles only, same size as crew)
    spectators.forEach(spec => {
      const sx = (spec.x + 0.5) * T;
      const sy = (spec.y + 0.5) * T;
      
      // Body - gray/neutral color (same size as crew)
      ctx.fillStyle = spec.state === 'LEAVING' ? '#666' : '#888';
      ctx.beginPath();
      ctx.arc(sx, sy, T * 0.35, 0, Math.PI * 2);
      ctx.fill();
      
      // Outline
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Crew
    crew.forEach(c => {
      const cx=(c.x+0.5)*T, cy=(c.y+0.5)*T;
      ctx.fillStyle = c.frozen ? '#888' : c.color;
      ctx.beginPath(); ctx.arc(cx, cy, T*0.35, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = c.frozen ? '#f55' : '#fff'; 
      ctx.lineWidth = c.frozen ? 2 : 1.5; 
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(c.name, cx, cy - T*0.5);
    });

    // Labels
    ctx.fillStyle = '#555'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
    ctx.fillText('PIT', 10*T, 5*T);
    ctx.fillText('SERVER', 42*T, 5*T);
    ctx.fillText('VAULT ROOM', 40*T, 30*T);
    ctx.fillText('VAULT', 42*T, 38*T);
    ctx.fillText('ENTRANCE', 28*T, 2*T);
    
    // Vault door indicator
    ctx.fillStyle = s.vaultDoorOpen ? '#4ade80' : '#ef4444';
    ctx.fillText(s.vaultDoorOpen ? '🚪 OPEN' : '🔒 LOCKED', 47*T, 35*T);
    
    // Zone labels
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
    ctx.fillText('TOP ZONE', 28*T, 10*T);
    ctx.fillStyle = 'rgba(255, 150, 100, 0.5)';
    ctx.fillText('BOTTOM ZONE', 28*T, 30*T);
  }, [tick, map]);

  const s = S.current;
  const [sam, maya, rico] = s.crew;
  
  const successCount = s.runHistory.filter(r => r.result === 'SUCCESS').length;
  const failCount = s.runHistory.filter(r => r.result === 'FAIL').length;
  const successRate = s.runHistory.length > 0 ? ((successCount / s.runHistory.length) * 100).toFixed(0) : 0;

  return (
    <div className="bg-gray-900 p-3 min-h-screen flex flex-col items-center">
      <h1 className="text-xl font-bold text-yellow-500 mb-1">THE HOUSE ALWAYS WINS</h1>
      <p className="text-gray-500 text-xs mb-2">M4/M5: Vault Hack + Rico Deployment</p>
      
      {/* Run Stats Bar */}
      <div className="flex items-center gap-4 mb-2 px-4 py-2 bg-gray-800 rounded border border-gray-700">
        <span className="text-gray-400 text-sm">Run #{s.runNumber}</span>
        <span className="text-green-400 text-sm">✓ {successCount}</span>
        <span className="text-red-400 text-sm">✗ {failCount}</span>
        <span className="text-yellow-400 text-sm">{successRate}% win</span>
        <button 
          onClick={() => { s.autoRun = !s.autoRun; setTick(t=>t+1); }}
          className={`px-2 py-0.5 rounded text-xs ${s.autoRun ? 'bg-green-700 text-white' : 'bg-gray-600 text-gray-300'}`}
        >
          {s.autoRun ? '⏸ Auto-Run ON' : '▶ Auto-Run OFF'}
        </button>
      </div>
      
      {/* Vault Code & Hack Progress */}
      <div className="flex items-center gap-4 mb-2 px-4 py-2 bg-gray-800 rounded border border-gray-700">
        <span className="text-gray-500 text-sm">VAULT:</span>
        <span className="font-mono text-sm tracking-wide">
          {s.vaultCode.map((d, i) => (
            <span key={i} className={maya.hackComplete ? 'text-green-400' : 'text-red-500'}>
              {maya.hackComplete ? d : '▓'}
            </span>
          ))}
        </span>
        {maya.hacking && !maya.hackComplete && (
          <span className="text-yellow-400 text-sm">
            Try #{(maya.hackGuesses?.length || 0) + 1}
            {maya.hackGuesses?.length > 0 && (
              <span className="text-gray-400 ml-2">
                ({maya.hackGuesses[maya.hackGuesses.length-1]?.feedback.bulls || 0}/6 🎯)
              </span>
            )}
          </span>
        )}
        {maya.hackComplete && (
          <span className="text-green-400 text-sm">
            ✓ CRACKED in {maya.hackGuesses?.length || 0} tries
          </span>
        )}
        {s.vaultDoorOpen && (
          <span className="text-green-400 text-sm">🚪 OPEN</span>
        )}
      </div>
      
      {/* Run History Log */}
      {s.runHistory.length > 0 && (
        <div className="mb-2 max-w-2xl w-full bg-gray-800 rounded border border-gray-700 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm font-bold">Run History ({s.runHistory.length} runs)</span>
            <span className="text-gray-500 text-xs">Click textarea below → Ctrl+A → Ctrl+C</span>
          </div>
          <div className="max-h-32 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left px-1">#</th>
                  <th className="text-left px-1">Result</th>
                  <th className="text-left px-1">Reason</th>
                  <th className="text-left px-1">Time</th>
                  <th className="text-left px-1">Rico</th>
                </tr>
              </thead>
              <tbody>
                {s.runHistory.slice(-10).reverse().map((r, i) => (
                  <tr key={i} className={r.result === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>
                    <td className="px-1">{r.run}</td>
                    <td className="px-1">{r.result === 'SUCCESS' ? '✓' : '✗'}</td>
                    <td className="px-1 text-gray-400 truncate max-w-[150px]">{r.reason}</td>
                    <td className="px-1">{r.timeSeconds}s</td>
                    <td className="px-1">{r.ricoUsed ? '⚠' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <textarea 
            readOnly 
            value={JSON.stringify(s.runHistory, null, 2)} 
            className="w-full h-32 bg-black text-green-400 text-xs font-mono p-2 rounded border-2 border-yellow-600 mt-2 cursor-text select-all"
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      {s.success && (
        <div className="bg-green-900/50 border border-green-500 rounded px-4 py-2 mb-2">
          <span className="text-green-400 font-bold">✓ MISSION SUCCESS</span>
          {s.autoRun && <span className="text-green-600 text-sm ml-2">(restarting...)</span>}
          <span className="text-green-600 text-sm ml-2">
            {s.ricoUsed ? '(RICO deployed)' : '(Clean run)'} — {(s.frame/60).toFixed(1)}s
          </span>
        </div>
      )}
      {s.alarm && (
        <div className="bg-red-900/50 border border-red-500 rounded px-4 py-2 mb-2 max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-red-400 font-bold">✗ MISSION FAILED</span>
            <span className="text-red-600 text-sm">({s.reason})</span>
            {s.autoRun && <span className="text-red-600 text-sm">(restarting...)</span>}
            <button 
              onClick={() => {
                const log = JSON.stringify(s.failLog, null, 2);
                navigator.clipboard.writeText(log);
              }}
              className="px-2 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs"
            >
              📋 Copy
            </button>
          </div>
          <textarea 
            readOnly 
            value={JSON.stringify(s.failLog, null, 2)} 
            className="w-full h-32 bg-black/50 text-red-300 text-xs font-mono p-2 rounded border border-red-800"
          />
        </div>
      )}

      <div className="flex gap-3">
        <div className="bg-gray-800 rounded p-2 text-xs font-mono w-44">
          <div className="text-gray-400 border-b border-gray-700 pb-1 mb-2">CREW STATUS</div>
          {s.crew.map((c,i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold" style={{color:c.color}}>{c.name}</span>
                {c.frozen && <span className="text-red-400 text-xs">⚠️</span>}
                {c.path && <span className="text-green-400 text-xs">→{c.path.length - c.pi}</span>}
                {c.routeType && <span className="text-cyan-400 text-xs">[{c.routeType}]</span>}
              </div>
              <div className="text-gray-400 text-xs leading-tight">{c.action}</div>
              {c.routeOptions && <div className="text-gray-600 text-xs leading-tight">{c.routeOptions}</div>}
            </div>
          ))}
          
          <div className="text-gray-400 border-b border-gray-700 pb-1 mb-2 mt-3">GUARDS</div>
          {s.guards.map((g,i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-red-400">{g.name} <span className={g.zone === 'TOP' ? 'text-blue-400' : g.zone === 'BOTTOM' ? 'text-orange-400' : 'text-purple-400'}>({g.zone})</span></span>
              <span className="text-gray-500">
                {g.state === 'INVEST' ? '⚠️ alert' : g.scanPhase > 0 ? '👀 scan' : g.path ? '🚶' : '⏸'}
              </span>
            </div>
          ))}
          
          <div className="text-gray-400 border-b border-gray-700 pb-1 mb-2 mt-3">SECURITY</div>
          <div className={s.vault ? 'text-red-400' : 'text-green-400'}>
            Vault: {s.vault ? '🔒 Locked' : '🔓 Open'}
          </div>
          <div className="text-gray-500">
            Cams: {s.cams.filter(c=>c.on).length}/3 online
          </div>
          {maya.threat > 0 && (
            <div className={maya.threat > 50 ? 'text-red-400' : maya.threat > 20 ? 'text-yellow-400' : 'text-gray-500'}>
              MAYA threat: {maya.threat}
            </div>
          )}
        </div>

        <canvas ref={canvasRef} width={W*T} height={H*T} className="rounded border border-gray-700" />
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={() => setPaused(!paused)} className="px-4 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>
        <button onClick={reset} className="px-4 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded text-sm">
          🔄 Reset
        </button>
      </div>

      <p className="text-gray-500 text-xs mt-2 max-w-lg text-center">
        SAM tracks guards → MAYA replans every 10 frames → considers guard direction → FREEZE only if no route exists
      </p>
    </div>
  );
}
