import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// ========== MAP CONSTANTS ==========
const W = 50; // Width
const H = 35; // Height

// Tile types
const FLOOR = 0;
const WALL = 1;
const DOOR = 2;
const STAIRS = 3;
const ELEVATOR = 4;
const ARENA = 5;
const CASINO = 6;
const VAULT = 7;
const SERVICE = 8;
const WINDOW = 9;

// Colors for floor types
const FLOOR_COLORS = {
  [FLOOR]: 0x333344,
  [ARENA]: 0x3d2a1a,
  [CASINO]: 0x1a3d2a,
  [VAULT]: 0x3d3a1a,
  [SERVICE]: 0x2a2a2a,
  [WINDOW]: 0x8B6914,
};

// ========== FLOOR 1: GROUND LEVEL ==========
const makeFloor1 = () => {
  const m = Array(H).fill(0).map(() => Array(W).fill(FLOOR));

  // Outer walls
  for (let x = 0; x < W; x++) {
    m[0][x] = WALL;
    m[H-1][x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    m[y][0] = WALL;
    m[y][W-1] = WALL;
  }

  // Main entrance (bottom center)
  m[H-1][24] = DOOR;
  m[H-1][25] = DOOR;

  // === LOBBY (bottom center, x=15-35, y=25-34) ===
  for (let y = 25; y < H-1; y++) {
    m[y][15] = WALL; // Left wall
    m[y][35] = WALL; // Right wall
  }
  for (let x = 15; x <= 35; x++) {
    m[25][x] = WALL; // Top wall
  }
  m[25][25] = DOOR; // Door to bar

  // === BOXING ARENA (left side, x=1-15, y=5-34) ===
  for (let y = 5; y < H-1; y++) {
    m[y][15] = WALL;
  }
  for (let x = 1; x <= 15; x++) {
    m[5][x] = WALL;
  }
  m[5][8] = DOOR; // Door to back area
  m[28][15] = DOOR; // Door to lobby
  // Arena floor
  for (let y = 10; y < 28; y++) {
    for (let x = 3; x < 13; x++) {
      m[y][x] = ARENA;
    }
  }

  // === CASINO FLOOR (right side, x=35-49, y=5-34) ===
  // Left wall extends all the way to back
  for (let y = 1; y < H-1; y++) {
    m[y][35] = WALL;
  }
  for (let x = 35; x < W-1; x++) {
    m[5][x] = WALL;
  }
  m[28][35] = DOOR; // Door to lobby
  // Casino floor
  for (let y = 8; y < 30; y++) {
    for (let x = 38; x < 48; x++) {
      m[y][x] = CASINO;
    }
  }

  // === BAR/LOUNGE (center, x=15-35, y=12-25) ===
  for (let x = 15; x <= 35; x++) {
    m[12][x] = WALL; // Top wall of bar
  }
  m[12][25] = DOOR; // Door to back/loading area

  // === STAIRS (east perimeter wall, by the casino) ===
  m[16][47] = STAIRS;
  m[16][48] = STAIRS;
  m[17][47] = STAIRS;
  m[17][48] = STAIRS;

  // === CAGE (back area, behind bar - where cash is handled) ===
  // Wall separating cage from bar
  for (let x = 16; x < 35; x++) {
    m[5][x] = WALL;
  }

  // === TELLER WINDOWS on south cage wall facing casino (patrons exchange money for chips here) ===
  // y=5 is the shared wall between cage and casino; spread evenly x=37,40,43,46
  m[5][37] = WINDOW;
  m[5][40] = WINDOW;
  m[5][43] = WINDOW;
  m[5][46] = WINDOW;

  // === FREIGHT ELEVATOR (in front of cage) ===
  m[6][32] = ELEVATOR;
  m[6][33] = ELEVATOR;

  // === LOADING DOCK (back left) ===
  for (let y = 1; y < 6; y++) {
    m[y][15] = WALL; // Right wall of loading dock
  }
  m[3][15] = DOOR; // Door from loading dock to cage
  m[0][8] = DOOR; // Exit to outside (truck entrance)

  return m;
};

// ========== FLOOR 2: OPERATIONS ==========
const makeFloor2 = () => {
  const m = Array(H).fill(0).map(() => Array(W).fill(FLOOR));

  // Outer walls
  for (let x = 0; x < W; x++) {
    m[0][x] = WALL;
    m[H-1][x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    m[y][0] = WALL;
    m[y][W-1] = WALL;
  }

  // === PERIMETER HALLWAY ===
  // Inner walls creating the hallway
  for (let x = 5; x < W-5; x++) {
    m[5][x] = WALL; // Top inner wall
    m[H-6][x] = WALL; // Bottom inner wall
  }
  for (let y = 5; y < H-5; y++) {
    m[y][5] = WALL; // Left inner wall
    m[y][W-6] = WALL; // Right inner wall
  }

  // === STAFF BREAK ROOM (left) ===
  for (let x = 6; x < 18; x++) {
    m[12][x] = WALL; // Bottom wall
  }
  for (let y = 6; y < 12; y++) {
    m[y][18] = WALL; // Right wall
  }
  m[12][12] = DOOR; // Door to hallway (bottom)
  m[5][12] = DOOR; // Door from hallway (top)
  // Closet in break room
  for (let x = 6; x < 10; x++) {
    m[8][x] = WALL;
  }
  m[8][7] = DOOR;

  // === SECURITY OFFICE (center) ===
  for (let y = 12; y < 22; y++) {
    m[y][18] = WALL; // Left wall
    m[y][32] = WALL; // Right wall
  }
  for (let x = 18; x <= 32; x++) {
    m[12][x] = WALL; // Top wall
    m[22][x] = WALL; // Bottom wall
  }
  m[12][22] = DOOR; // Door from top (staggered — no straight-through spine)
  m[22][28] = DOOR; // Door from bottom (staggered)

  // === MANAGER'S OFFICE (above security) ===
  for (let x = 18; x <= 32; x++) {
    m[8][x] = WALL;
  }
  m[5][22] = DOOR; // Door from hallway (staggered)
  m[8][28] = DOOR; // Door to security area (staggered)

  // === COUNTING ROOM (right side) ===
  for (let y = 6; y < 18; y++) {
    m[y][38] = WALL; // Left wall
  }
  for (let x = 38; x < W-6; x++) {
    m[18][x] = WALL; // Bottom wall
  }
  m[5][40] = DOOR; // Door from hallway
  m[18][40] = DOOR; // Door to lower area
  // Closet
  for (let y = 6; y < 10; y++) {
    m[y][42] = WALL;
  }
  m[10][42] = WALL;
  for (let x = 42; x < W-6; x++) {
    m[10][x] = WALL;
  }
  m[10][43] = DOOR;

  // === STAIRS (same position as Floor 1 — east perimeter) ===
  m[16][47] = STAIRS;
  m[16][48] = STAIRS;
  m[17][47] = STAIRS;
  m[17][48] = STAIRS;

  // === CLOSETS (scattered) ===
  // Top left closet
  for (let x = 6; x < 10; x++) m[6][x] = WALL;
  for (let y = 6; y < 8; y++) m[y][10] = WALL;
  // Top right closet
  for (let x = W-10; x < W-6; x++) m[6][x] = WALL;
  for (let y = 6; y < 8; y++) m[y][W-10] = WALL;

  return m;
};

// ========== BASEMENT: VAULT LEVEL ==========
const makeBasement = () => {
  const m = Array(H).fill(0).map(() => Array(W).fill(FLOOR));

  // Outer walls
  for (let x = 0; x < W; x++) {
    m[0][x] = WALL;
    m[H-1][x] = WALL;
  }
  for (let y = 0; y < H; y++) {
    m[y][0] = WALL;
    m[y][W-1] = WALL;
  }

  // === MAINTENANCE AREA (wraps around back) ===
  for (let x = 1; x < W-1; x++) {
    m[5][x] = WALL; // South wall of maintenance
  }
  m[5][12] = DOOR; // Door to left side
  m[5][25] = DOOR; // Door to center
  m[5][40] = DOOR; // Door to right side
  // Maintenance floor
  for (let y = 1; y < 5; y++) {
    for (let x = 1; x < W-1; x++) {
      m[y][x] = SERVICE;
    }
  }

  // === FREIGHT ELEVATOR (same position as Floor 1 - moved in front of cage area) ===
  m[6][32] = ELEVATOR;
  m[6][33] = ELEVATOR;

  // === SERVER ROOM (back right) ===
  for (let y = 1; y < 8; y++) {
    m[y][38] = WALL;
  }
  for (let x = 38; x < W-1; x++) {
    m[8][x] = WALL;
  }
  m[5][40] = DOOR; // Door from maintenance
  m[3][38] = DOOR; // entrance from the maintenance corridor (else the room is sealed)

  // === SAFETY DEPOSIT BOXES (left side) ===
  for (let y = 8; y < 28; y++) {
    m[y][12] = WALL;
  }
  for (let x = 1; x < 12; x++) {
    m[8][x] = WALL;
    m[28][x] = WALL;
  }
  m[8][6] = DOOR; // Door from maintenance
  m[28][6] = DOOR; // Door to lower left

  // === VAULT (center) ===
  for (let y = 12; y < 26; y++) {
    m[y][18] = WALL; // Left wall
    m[y][32] = WALL; // Right wall
  }
  for (let x = 18; x <= 32; x++) {
    m[12][x] = WALL; // Top wall
    m[26][x] = WALL; // Bottom wall
  }
  m[12][25] = DOOR; // Main vault door (from checkpoint)
  // Vault floor
  for (let y = 13; y < 26; y++) {
    for (let x = 19; x < 32; x++) {
      m[y][x] = VAULT;
    }
  }

  // === SECURITY CHECKPOINT (in front of vault) ===
  for (let x = 15; x <= 35; x++) {
    m[10][x] = WALL;
  }
  m[10][25] = DOOR; // Door from upper area
  m[5][25] = DOOR; // Already set

  // === MECHANICAL ROOM (right side) ===
  for (let y = 10; y < 28; y++) {
    m[y][38] = WALL;
  }
  for (let x = 38; x < W-1; x++) {
    m[10][x] = WALL;
    m[28][x] = WALL;
  }
  m[10][42] = DOOR; // Door from upper area
  m[28][42] = DOOR; // Door to lower area

  // === STAIRS (same position — east, mechanical room side) ===
  m[16][47] = STAIRS;
  m[16][48] = STAIRS;
  m[17][47] = STAIRS;
  m[17][48] = STAIRS;

  return m;
};

// NOTE: This is the canonical level-design source. The runnable, no-build
// version lives in design/casino3d.html (CDN React+Babel+three). Keep them in
// sync, or move to a Vite app when we wire it to the brain's StateFrame feed.

// ========== 3D COMPONENT ==========
export default function Casino3D() {
  const containerRef = useRef();
  const [currentFloor, setCurrentFloor] = useState(1);
  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const meshGroupRef = useRef();

  const floors = {
    1: { name: 'Floor 1 - Ground Level', make: makeFloor1 },
    2: { name: 'Floor 2 - Operations', make: makeFloor2 },
    0: { name: 'Basement - Vault Level', make: makeBasement },
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      200
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(W/2, 50, H/2);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    camera.position.set(W/2, 50, H/2 + 25);
    camera.lookAt(W/2, 0, H/2);

    let frame = 0;
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;
      const t = frame * 0.002;
      camera.position.x = W/2 + Math.sin(t) * 35;
      camera.position.z = H/2 + Math.cos(t) * 35;
      camera.lookAt(W/2, 0, H/2);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (!meshGroupRef.current) return;
    while (meshGroupRef.current.children.length > 0) {
      meshGroupRef.current.remove(meshGroupRef.current.children[0]);
    }
    const map = floors[currentFloor].make();

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x222233 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x654321 });
    const stairsMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4a });
    const elevatorMat = new THREE.MeshStandardMaterial({ color: 0x7a7a4a });

    const floorGeo = new THREE.PlaneGeometry(W, H);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x333344 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W/2, 0, H/2);
    floor.receiveShadow = true;
    meshGroupRef.current.add(floor);

    const wallHeight = 3;

    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (map[y][x] === WALL) {
          const startX = x;
          while (x < W && map[y][x] === WALL) x++;
          const length = x - startX;
          const geo = new THREE.BoxGeometry(length, wallHeight, 1);
          const wall = new THREE.Mesh(geo, wallMat);
          wall.position.set(startX + length/2, wallHeight/2, y + 0.5);
          wall.castShadow = true;
          meshGroupRef.current.add(wall);
        } else { x++; }
      }
    }

    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (map[y][x] === WALL) {
          const startY = y;
          while (y < H && map[y][x] === WALL) y++;
          const length = y - startY;
          const geo = new THREE.BoxGeometry(1, wallHeight, length);
          const wall = new THREE.Mesh(geo, wallMat);
          wall.position.set(x + 0.5, wallHeight/2, startY + length/2);
          wall.castShadow = true;
          meshGroupRef.current.add(wall);
        } else { y++; }
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = map[y][x];
        if (tile === DOOR) {
          const geo = new THREE.BoxGeometry(1, wallHeight * 0.7, 1);
          const door = new THREE.Mesh(geo, doorMat);
          door.position.set(x + 0.5, wallHeight * 0.35, y + 0.5);
          meshGroupRef.current.add(door);
        } else if (tile === WINDOW) {
          const counterMat = new THREE.MeshStandardMaterial({ color: 0x8B6914 });
          const slotMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
          const counter = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.4), counterMat);
          counter.position.set(x + 0.5, 1.2, y + 0.5);
          meshGroupRef.current.add(counter);
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.05), slotMat);
          slot.position.set(x + 0.5, 1.27, y + 0.35);
          meshGroupRef.current.add(slot);
          const partition = new THREE.Mesh(new THREE.BoxGeometry(1, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
          partition.position.set(x + 0.5, 1.9, y + 0.4);
          meshGroupRef.current.add(partition);
        } else if (tile === STAIRS) {
          const geo = new THREE.BoxGeometry(1, 0.5, 1);
          const stairs = new THREE.Mesh(geo, stairsMat);
          stairs.position.set(x + 0.5, 0.25, y + 0.5);
          meshGroupRef.current.add(stairs);
        } else if (tile === ELEVATOR) {
          const geo = new THREE.BoxGeometry(1, 0.3, 1);
          const elev = new THREE.Mesh(geo, elevatorMat);
          elev.position.set(x + 0.5, 0.15, y + 0.5);
          meshGroupRef.current.add(elev);
        } else if (FLOOR_COLORS[tile]) {
          const geo = new THREE.PlaneGeometry(1, 1);
          const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLORS[tile] });
          const floorTile = new THREE.Mesh(geo, mat);
          floorTile.rotation.x = -Math.PI / 2;
          floorTile.position.set(x + 0.5, 0.01, y + 0.5);
          meshGroupRef.current.add(floorTile);
        }
      }
    }

    if (currentFloor === 1) {
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5a });
      const postMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      const ropeMat = new THREE.MeshStandardMaterial({ color: 0xdd2222 });
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x444455 });

      const ringX = 8, ringY = 19, ringSize = 6, ringHeight = 0.8;
      const platform = new THREE.Mesh(new THREE.BoxGeometry(ringSize, ringHeight, ringSize), ringMat);
      platform.position.set(ringX, ringHeight/2, ringY);
      meshGroupRef.current.add(platform);

      const postHeight = 2, postRadius = 0.15, halfRing = ringSize/2 - 0.3;
      [[ringX-halfRing,ringY-halfRing],[ringX+halfRing,ringY-halfRing],[ringX-halfRing,ringY+halfRing],[ringX+halfRing,ringY+halfRing]].forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8), postMat);
        post.position.set(px, ringHeight + postHeight/2, pz);
        meshGroupRef.current.add(post);
      });

      [0.5, 1.0, 1.5].forEach(rh => {
        const ropeFB = new THREE.Mesh(new THREE.BoxGeometry(ringSize - 0.4, 0.05, 0.05), ropeMat);
        ropeFB.position.set(ringX, ringHeight + rh, ringY - halfRing);
        meshGroupRef.current.add(ropeFB);
        const ropeFB2 = ropeFB.clone();
        ropeFB2.position.set(ringX, ringHeight + rh, ringY + halfRing);
        meshGroupRef.current.add(ropeFB2);
        const ropeLR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, ringSize - 0.4), ropeMat);
        ropeLR.position.set(ringX - halfRing, ringHeight + rh, ringY);
        meshGroupRef.current.add(ropeLR);
        const ropeLR2 = ropeLR.clone();
        ropeLR2.position.set(ringX + halfRing, ringHeight + rh, ringY);
        meshGroupRef.current.add(ropeLR2);
      });

      for (let row = 0; row < 2; row++) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4 + row * 0.2, 8), seatMat);
        seat.position.set(2 - row * 0.3, 0.2 + row * 0.1, ringY);
        meshGroupRef.current.add(seat);
      }
      for (let row = 0; row < 2; row++) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4 + row * 0.2, 8), seatMat);
        seat.position.set(14 + row * 0.3, 0.2 + row * 0.1, ringY);
        meshGroupRef.current.add(seat);
      }
      for (let row = 0; row < 2; row++) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4 + row * 0.2, 1), seatMat);
        seat.position.set(ringX, 0.2 + row * 0.1, 25 + row * 0.3);
        meshGroupRef.current.add(seat);
      }
      for (let row = 0; row < 2; row++) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4 + row * 0.2, 1), seatMat);
        seat.position.set(ringX, 0.2 + row * 0.1, 13 - row * 0.3);
        meshGroupRef.current.add(seat);
      }

      const spotLight = new THREE.PointLight(0xffaa44, 1.5, 20);
      spotLight.position.set(ringX, 8, ringY);
      meshGroupRef.current.add(spotLight);

      const slotMat = new THREE.MeshStandardMaterial({ color: 0x884422 });
      const slotScreenMat = new THREE.MeshStandardMaterial({ color: 0x22aa44, emissive: 0x115522 });
      const tableMat = new THREE.MeshStandardMaterial({ color: 0x228844 });
      const tableBaseMat = new THREE.MeshStandardMaterial({ color: 0x442211 });

      for (let row = 0; row < 5; row++) {
        const slotY = 12 + row * 3.5;
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), slotMat);
        cabinet.position.set(44.5, 0.9, slotY);
        meshGroupRef.current.add(cabinet);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), slotScreenMat);
        screen.position.set(44.5, 1.3, slotY - 0.4);
        meshGroupRef.current.add(screen);
        const cabinet2 = cabinet.clone(); cabinet2.position.set(45.5, 0.9, slotY); meshGroupRef.current.add(cabinet2);
        const screen2 = screen.clone(); screen2.position.set(45.5, 1.3, slotY - 0.4); meshGroupRef.current.add(screen2);
        const cabinet3 = cabinet.clone(); cabinet3.position.set(46.5, 0.9, slotY); meshGroupRef.current.add(cabinet3);
        const screen3 = screen.clone(); screen3.position.set(46.5, 1.3, slotY - 0.4); meshGroupRef.current.add(screen3);
      }

      for (let i = 0; i < 2; i++) {
        const tableY = 12 + i * 6;
        const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.15, 16), tableMat);
        tableTop.position.set(40, 0.85, tableY);
        meshGroupRef.current.add(tableTop);
        const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8), tableBaseMat);
        tableBase.position.set(40, 0.4, tableY);
        meshGroupRef.current.add(tableBase);
        const dealer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.3), tableBaseMat);
        dealer.position.set(40, 0.93, tableY - 1.5);
        meshGroupRef.current.add(dealer);
      }

      for (let i = 0; i < 3; i++) {
        const tableX = 39 + i * 3.5;
        const bjTable = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 16, 1, false, 0, Math.PI), tableMat);
        bjTable.position.set(tableX, 0.8, 32);
        bjTable.rotation.y = Math.PI;
        meshGroupRef.current.add(bjTable);
        const bjEdge = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.1), tableMat);
        bjEdge.position.set(tableX, 0.8, 33.3);
        meshGroupRef.current.add(bjEdge);
        const bjBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.8), tableBaseMat);
        bjBase.position.set(tableX, 0.375, 32.5);
        meshGroupRef.current.add(bjBase);
      }

      const rouletteX = 40, rouletteY = 24;
      const rouletteTable = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 2.5), tableMat);
      rouletteTable.position.set(rouletteX, 0.85, rouletteY);
      meshGroupRef.current.add(rouletteTable);
      const wheelBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 16), tableBaseMat);
      wheelBase.position.set(rouletteX - 1.2, 1.0, rouletteY);
      meshGroupRef.current.add(wheelBase);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      wheel.position.set(rouletteX - 1.2, 1.2, rouletteY);
      meshGroupRef.current.add(wheel);
      const rouletteBase = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 1.5), tableBaseMat);
      rouletteBase.position.set(rouletteX, 0.4, rouletteY);
      meshGroupRef.current.add(rouletteBase);

      const casinoLight = new THREE.PointLight(0x44ff88, 0.8, 25);
      casinoLight.position.set(42, 6, 20);
      meshGroupRef.current.add(casinoLight);
    }
  }, [currentFloor]);

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center gap-4">
        <h1 className="text-white text-lg font-bold">THE HOUSE ALWAYS WINS</h1>
        <div className="flex gap-2">
          <button onClick={() => setCurrentFloor(2)} className={`px-3 py-1 rounded text-sm ${currentFloor === 2 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Floor 2</button>
          <button onClick={() => setCurrentFloor(1)} className={`px-3 py-1 rounded text-sm ${currentFloor === 1 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Floor 1</button>
          <button onClick={() => setCurrentFloor(0)} className={`px-3 py-1 rounded text-sm ${currentFloor === 0 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Basement</button>
        </div>
        <span className="text-gray-400 text-sm">{floors[currentFloor].name}</span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
