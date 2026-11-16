// The SPARK frag: a thrown sphere with gravity, a bounce off the map's boxes and
// a fuse. It hurts only the thrower's enemies, so a bad throw costs a grenade,
// not a teammate. The explosion itself (damage + visuals) is main.js's job;
// this file owns the flight.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FUSE_AFTER_BOUNCE = 1.1;
const FUSE_MAX = 2.4;

export function createGrenades(scene, colliders, onExplode) {
  const active = [];
  const probe = new THREE.Box3();
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 });
  const geometry = new THREE.SphereGeometry(0.09, 10, 8);

  function collides(position) {
    probe.min.set(position.x - 0.09, position.y - 0.09, position.z - 0.09);
    probe.max.set(position.x + 0.09, position.y + 0.09, position.z + 0.09);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  const previous = new THREE.Vector3();
  const center = new THREE.Vector3();

  function throwGrenade(from, direction, speed = 13) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from);
    scene.add(mesh);
    active.push({
      mesh,
      velocity: new THREE.Vector3(direction.x * speed, direction.y * speed + 2.4, direction.z * speed),
      fuse: FUSE_MAX,
      bounced: false,
    });
  }

  function step(dt) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const grenade = active[i];
      grenade.fuse -= dt;
      grenade.velocity.y -= GRAVITY * dt;
      const previousCopy = previous.copy(grenade.mesh.position);
      grenade.mesh.position.addScaledVector(grenade.velocity, dt);
      const hit = collides(grenade.mesh.position);
      if (hit) {
        grenade.mesh.position.copy(previousCopy);
        hit.getCenter(center);
        const dx = previousCopy.x - center.x;
        const dy = previousCopy.y - center.y;
        const dz = previousCopy.z - center.z;
        const abs = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
        const axis = abs.indexOf(Math.max(...abs));
        if (axis === 0) grenade.velocity.x *= -0.45;
        else if (axis === 1) grenade.velocity.y *= -0.45;
        else grenade.velocity.z *= -0.45;
        grenade.velocity.multiplyScalar(0.8);
        if (!grenade.bounced) {
          grenade.bounced = true;
          grenade.fuse = Math.min(grenade.fuse, FUSE_AFTER_BOUNCE);
        }
      }
      if (grenade.mesh.position.y < 0.09) {
        grenade.mesh.position.y = 0.09;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.45;
        grenade.velocity.x *= 0.8;
        grenade.velocity.z *= 0.8;
        if (!grenade.bounced) {
          grenade.bounced = true;
          grenade.fuse = Math.min(grenade.fuse, FUSE_AFTER_BOUNCE);
        }
      }
      if (grenade.fuse <= 0) {
        const position = grenade.mesh.position.clone();
        scene.remove(grenade.mesh);
        active.splice(i, 1);
        onExplode(position);
      }
    }
  }

  return {
    throwGrenade,
    step,
    clear() {
      for (const grenade of active) scene.remove(grenade.mesh);
      active.length = 0;
    },
    count() {
      return active.length;
    },
  };
}
