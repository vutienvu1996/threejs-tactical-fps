// Transient combat effects, all pooled so the hot loop allocates nothing:
// tracer lines, impact sparks and one reusable explosion bloom.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createTracers(scene, count = 24) {
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    pool.push({ line, life: 0 });
  }
  let next = 0;
  const positions = new Float32Array(6);

  return {
    fire(from, to, color = 0xffc46b) {
      const slot = pool[next];
      next = (next + 1) % pool.length;
      positions[0] = from.x;
      positions[1] = from.y;
      positions[2] = from.z;
      positions[3] = to.x;
      positions[4] = to.y;
      positions[5] = to.z;
      slot.line.geometry.attributes.position.array.set(positions);
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.material.color.setHex(color);
      slot.line.material.opacity = 0.9;
      slot.line.visible = true;
      slot.life = 0.09;
    },
    step(dt) {
      for (const slot of pool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) {
          slot.line.visible = false;
        } else {
          slot.line.material.opacity = slot.life / 0.09 * 0.9;
        }
      }
    },
  };
}

export function createSparks(scene, count = 10) {
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  let next = 0;
  return {
    burst(position, normal) {
      const slot = pool[next];
      next = (next + 1) % pool.length;
      slot.mesh.position.copy(position);
      slot.mesh.lookAt(position.x + normal.x, position.y + normal.y, position.z + normal.z);
      slot.mesh.material.opacity = 0.95;
      slot.mesh.visible = true;
      slot.life = 0.12;
    },
    step(dt) {
      for (const slot of pool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.mesh.material.opacity = Math.max(0, slot.life / 0.12) * 0.95;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
  };
}

export function createExplosion(scene) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, depthWrite: false }),
  );
  sphere.visible = false;
  scene.add(sphere);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 22, 1.4);
  scene.add(light);
  let life = 0;
  let radius = 6;

  return {
    trigger(position, blastRadius) {
      radius = blastRadius;
      sphere.position.copy(position);
      light.position.copy(position);
      sphere.visible = true;
      life = 0.55;
    },
    step(dt) {
      if (life <= 0) return;
      life -= dt;
      const progress = 1 - Math.max(0, life) / 0.55;
      const scale = 0.4 + progress * radius;
      sphere.scale.setScalar(scale);
      sphere.material.opacity = Math.max(0, 0.75 * (1 - progress));
      light.intensity = Math.max(0, 90 * (1 - progress));
      if (life <= 0) {
        sphere.visible = false;
        light.intensity = 0;
      }
    },
  };
}
