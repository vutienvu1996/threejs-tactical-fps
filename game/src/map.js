// Kiln Yard: an abandoned foundry yard at dusk, built from boxes. Three lanes
// (Furnace lane north, Crane lane south, mid) join a west attacker spawn to two
// objective sites in the east. Every solid box is a collider for movement and a
// surface bullets stop on; the waypoint graph is what bots navigate on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'FURNACE', center: new THREE.Vector3(15, 0, -11), radius: 3.4 },
  B: { name: 'CRANE', center: new THREE.Vector3(15, 0, 11), radius: 3.4 },
};

// The player's own spawn, one step behind the ally bots so nobody shares a spot.
export const PLAYER_SPAWN = new THREE.Vector3(-23, 0, 0);

export const SPAWNS = {
  EMBER: [
    new THREE.Vector3(-21, 0, -2),
    new THREE.Vector3(-21, 0, 0),
    new THREE.Vector3(-21, 0, 2),
  ],
  CINDER: [
    new THREE.Vector3(21, 0, -3),
    new THREE.Vector3(21, 0, 0),
    new THREE.Vector3(21, 0, 3),
    new THREE.Vector3(19, 0, 5),
  ],
};

// Waypoint nodes the bots walk on; edges are listed both ways and were placed so
// no edge crosses a wall. Node ids are indexes into this array.
const WAYPOINTS = [
  [-21, 0], [-16, 0], [-16, -12], [-16, 12], [-8, 0], [-8, -12], [-8, 12],
  [0, 0], [0, -12], [0, 12], [4, -3], [4, 3], [10, -12], [10, 12],
  [15, -11], [15, 11], [20, -6], [20, 6], [20, 0], [10, 0],
  [18, -13], [18, 13], [-12, -9], [-12, 9], [-12, -3], [-12, 3],
  [4, -9], [4, 9],
];
const EDGES = [
  [0, 1], [1, 2], [1, 3], [1, 4], [2, 22], [3, 23], [4, 7], [4, 24], [4, 25],
  [5, 8], [5, 22], [6, 9], [6, 23], [7, 10], [7, 11], [7, 19], [8, 12],
  [8, 26], [9, 13], [9, 27], [10, 19], [10, 26], [11, 19], [11, 27],
  [12, 14], [12, 20], [12, 26], [13, 15], [13, 21], [13, 27],
  [14, 16], [14, 19], [14, 20], [15, 17], [15, 19], [15, 21],
  [16, 18], [17, 18], [19, 10], [19, 11], [19, 14], [19, 15],
  [20, 14], [21, 15], [22, 24], [23, 25], [24, 4], [25, 4],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }
  const glowA = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ember), emissive: new THREE.Color(PALETTE.ember),
    emissiveIntensity: 1.6, roughness: 0.4,
  });
  const glowB = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.teal), emissive: new THREE.Color(PALETTE.teal),
    emissiveIntensity: 1.2, roughness: 0.4,
  });

  const colliders = [];
  const shootables = [];
  const wallRects = []; // x1,z1,x2,z2 for the minimap, in world units

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      wallRects.push([x - width / 2, z - depth / 2, x + width / 2, z + depth / 2]);
    }
    return mesh;
  }

  // Ground and outer walls (48 x 36 m yard, 5 m walls).
  box(48.8, 0.4, 36.8, 0, -0.2, 0, 'floor');
  box(0.4, 5, 36.8, -24.2, 2.5, 0, 'wall');
  box(0.4, 5, 36.8, 24.2, 2.5, 0, 'wall');
  box(48.8, 5, 0.4, 0, 2.5, -18.2, 'wall');
  box(48.8, 5, 0.4, 0, 2.5, 18.2, 'wall');

  // Lane walls: z = -6 and z = +6, each with a west door (x -14..-10) and an
  // east connector (x 2..6) so every lane stays reachable.
  for (const z of [-6, 6]) {
    box(10, 3.2, 0.4, -19, 1.6, z, 'wallDark');
    box(12, 3.2, 0.4, -4, 1.6, z, 'wallDark');
    box(18, 3.2, 0.4, 15, 1.6, z, 'wallDark');
  }

  // Central foundry block in the east yard, splitting the two approaches.
  box(4, 2.6, 3, 14, 1.3, 0, 'wall');

  // Cover: crates, containers and pillars, placed off the waypoint lines.
  box(1.2, 1.2, 1.2, -18, 0.6, -12, 'crate');
  box(1.2, 1.2, 1.2, -18, 0.6, 12, 'crate');
  box(3.2, 2.4, 1.4, -12, 1.2, -12, 'container');
  box(3.2, 2.4, 1.4, -12, 1.2, 12, 'containerB');
  box(1.2, 1.2, 1.2, -4.5, 0.6, -1.6, 'crate');
  box(1.2, 1.2, 1.2, -4.5, 0.6, 1.6, 'crate');
  box(1.2, 1.2, 1.2, 0, 0.6, -12, 'crate');
  box(1.2, 1.2, 1.2, 0, 0.6, 12, 'crate');
  box(1.2, 1.2, 1.2, 4, 0.6, -9, 'crate');
  box(1.2, 1.2, 1.2, 4, 0.6, 9, 'crate');
  box(3.2, 2.4, 1.4, 10, 1.2, -14.5, 'containerB');
  box(3.2, 2.4, 1.4, 10, 1.2, 14.5, 'container');
  box(1.2, 1.2, 1.2, 18, 0.6, -8.4, 'crate');
  box(1.2, 1.2, 1.2, 18, 0.6, 8.4, 'crate');
  box(1.2, 1.2, 1.2, 12, 0.6, -3.4, 'crate');
  box(1.2, 1.2, 1.2, 12, 0.6, 3.4, 'crate');
  box(1.2, 1.2, 1.2, -20, 0.6, -8, 'crate');
  box(1.2, 1.2, 1.2, -20, 0.6, 8, 'crate');

  // The furnace at site A: a glowing kiln mouth and a chimney.
  box(4, 4.5, 3, 19, 2.25, -14, 'wallDark');
  const kiln = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.3), glowA);
  kiln.position.set(17, 1.1, -14);
  kiln.rotation.y = Math.PI / 2;
  group.add(kiln);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 7, 12), materials.wall);
  chimney.position.set(20.5, 3.5, -15.5);
  chimney.castShadow = true;
  group.add(chimney);
  colliders.push(new THREE.Box3().setFromObject(chimney));

  // The crane gantry over site B: two legs and a top beam.
  box(0.8, 5.5, 0.8, 15, 2.75, 8, 'container');
  box(0.8, 5.5, 0.8, 15, 2.75, 14, 'container');
  box(0.8, 0.8, 6.8, 15, 5.5, 11, 'container');

  // Lane paint: thin dark strips on the floor marking the three lanes.
  function strip(width, depth, x, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.04, depth),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wallDark), roughness: 0.95 }),
    );
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  strip(40, 1.2, -2, -12);
  strip(40, 1.2, -2, 0);
  strip(40, 1.2, -2, 12);

  // Site markers: a glowing ring and a soft light beam at each objective.
  const markers = {};
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(key === 'A' ? PALETTE.ember : PALETTE.teal),
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.05, site.center.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(key === 'A' ? PALETTE.ember : PALETTE.teal),
        transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.set(site.center.x, 3.5, site.center.z);
    group.add(beam);
    markers[key] = { ring, beam };
  }

  // Light: dusk hemisphere, a low warm key from the west, a cool fill, and two
  // small point lights warming the sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.55));
  const key = new THREE.DirectionalLight(new THREE.Color(0xffe0b3), 2.4);
  key.position.set(-14, 16, 6);
  key.target.position.set(6, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.teal), 0.35);
  fill.position.set(12, 10, -12);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 26, 16, 1.6);
  furnaceLight.position.set(16.5, 2.2, -13);
  scene.add(furnaceLight);
  const craneLight = new THREE.PointLight(new THREE.Color(PALETTE.teal), 14, 14, 1.6);
  craneLight.position.set(15, 3, 11);
  scene.add(craneLight);

  const nodes = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const adjacency = nodes.map(() => []);
  for (const [a, b] of EDGES) {
    if (!adjacency[a].includes(b)) adjacency[a].push(b);
    if (!adjacency[b].includes(a)) adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    wallRects,
    nodes,
    adjacency,
    markers,
    group,
    nearestNode(position) {
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const dx = nodes[i].x - position.x;
        const dz = nodes[i].z - position.z;
        const distance = dx * dx + dz * dz;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      return best;
    },
    // Breadth-first route from one node to another, as a list of node ids.
    route(from, to) {
      if (from === to) return [to];
      const previous = new Array(nodes.length).fill(-1);
      const queue = [from];
      previous[from] = from;
      while (queue.length > 0) {
        const current = queue.shift();
        for (const next of adjacency[current]) {
          if (previous[next] !== -1) continue;
          previous[next] = current;
          if (next === to) {
            const path = [to];
            let node = to;
            while (node !== from) {
              node = previous[node];
              path.unshift(node);
            }
            return path;
          }
          queue.push(next);
        }
      }
      return [to];
    },
    siteAt(position) {
      for (const [key, site] of Object.entries(SITES)) {
        const dx = position.x - site.center.x;
        const dz = position.z - site.center.z;
        if (dx * dx + dz * dz <= site.radius * site.radius) return key;
      }
      return null;
    },
  };
}
