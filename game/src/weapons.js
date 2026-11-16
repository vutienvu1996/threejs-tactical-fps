// Weapons: the buyable catalogue and the first-person view model. Each weapon
// is one definition (damage, magazine, fire rate, spread, price); the rig owns
// the per-weapon ammunition, the view model, the muzzle flash and the reload
// animation. main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, kind: 'pistol', sound: 'pistol',
    damage: 26, headMult: 2.5, pellets: 1, mag: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.4, spreadStill: 0.004, spreadMove: 0.02,
    range: 42, kick: 0.006, auto: false,
  },
  smg: {
    id: 'smg', name: 'VK-9 Raptor', price: 1200, kind: 'smg', sound: 'smg',
    damage: 22, headMult: 2.5, pellets: 1, mag: 28, reserve: 84,
    fireGap: 0.09, reloadTime: 1.7, spreadStill: 0.006, spreadMove: 0.026,
    range: 34, kick: 0.004, auto: true,
  },
  rifle: {
    id: 'rifle', name: 'LB-7 Longbow', price: 2500, kind: 'rifle', sound: 'rifle',
    damage: 34, headMult: 2.5, pellets: 1, mag: 25, reserve: 75,
    fireGap: 0.11, reloadTime: 2.0, spreadStill: 0.0022, spreadMove: 0.024,
    range: 60, kick: 0.008, auto: true,
  },
  shotgun: {
    id: 'shotgun', name: 'BR-12 Breacher', price: 1800, kind: 'shotgun', sound: 'shotgun',
    damage: 12, headMult: 2.0, pellets: 8, mag: 6, reserve: 24,
    fireGap: 0.9, reloadTime: 2.4, spreadStill: 0.03, spreadMove: 0.045,
    range: 16, kick: 0.02, auto: false,
  },
  marksman: {
    id: 'marksman', name: 'ND-50 Needle', price: 4200, kind: 'marksman', sound: 'marksman',
    damage: 88, headMult: 2.2, pellets: 1, mag: 5, reserve: 15,
    fireGap: 1.1, reloadTime: 2.6, spreadStill: 0.0006, spreadMove: 0.03,
    range: 80, kick: 0.03, auto: false,
  },
};

export const GRENADE_DEF = { id: 'grenade', name: 'SPARK Frag', price: 300, max: 2 };
export const ARMOR_DEF = { id: 'armor', name: 'Kevlar Vest', price: 650, armor: 50 };

export function createWeaponRig(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8a94a6), roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a2f38), roughness: 0.65, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  function part(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'pistol') {
      model.add(part(0.07, 0.09, 0.2, 0, 0, 0, dark));
      model.add(part(0.05, 0.05, 0.1, 0, 0.01, -0.14, metal));
      model.add(part(0.06, 0.1, 0.05, 0, -0.08, 0.06, dark));
    } else if (kind === 'smg') {
      model.add(part(0.08, 0.1, 0.34, 0, 0, 0, dark));
      model.add(part(0.04, 0.04, 0.3, 0, 0.02, -0.3, metal));
      model.add(part(0.05, 0.16, 0.06, 0, -0.11, -0.02, metal));
      model.add(part(0.06, 0.07, 0.18, 0, -0.02, 0.24, dark));
    } else if (kind === 'rifle') {
      model.add(part(0.08, 0.1, 0.46, 0, 0, 0, dark));
      model.add(part(0.04, 0.04, 0.42, 0, 0.025, -0.4, metal));
      model.add(part(0.07, 0.08, 0.2, 0, -0.02, 0.3, dark));
      model.add(part(0.05, 0.05, 0.08, 0, 0.08, -0.05, accent));
    } else if (kind === 'shotgun') {
      model.add(part(0.1, 0.11, 0.5, 0, 0, 0, dark));
      model.add(part(0.07, 0.07, 0.42, 0, 0.02, -0.42, metal));
      model.add(part(0.06, 0.06, 0.16, 0, -0.06, -0.18, metal));
      model.add(part(0.07, 0.08, 0.2, 0, -0.02, 0.32, dark));
    } else {
      model.add(part(0.07, 0.09, 0.62, 0, 0, 0, dark));
      model.add(part(0.035, 0.035, 0.5, 0, 0.02, -0.5, metal));
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), accent);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
      model.add(part(0.06, 0.07, 0.2, 0, -0.02, 0.34, dark));
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }

  const models = {};
  for (const kind of ['pistol', 'smg', 'rifle', 'shotgun', 'marksman']) {
    models[kind] = buildModel(kind);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = {
    pistol: { def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
  };
  let currentId = 'pistol';
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, bobPhase: 0, ads: 0 };
  models.pistol.visible = true;

  function current() {
    return owned[currentId];
  }

  function step(dt, moving, movingSpeed) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((state.adsTarget ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    const model = models[current().def.kind];
    state.bobPhase += dt * (moving ? movingSpeed * 1.9 : 0);
    const bob = moving ? Math.sin(state.bobPhase) * 0.008 : 0;
    model.position.set(0.24 - state.ads * 0.1, -0.2 + bob + state.ads * 0.045, -0.42 + state.kick);
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const progress = 1 - state.reloadLeft / current().def.reloadTime;
      model.rotation.x = -0.6 * Math.sin(progress * Math.PI);
      if (state.reloadLeft === 0) {
        const need = current().def.mag - current().mag;
        const take = Math.min(need, current().reserve);
        current().mag += take;
        current().reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.material.opacity = state.flash > 0 ? (state.flash / 0.06) * 0.9 : 0;
    flash.rotation.z = state.flash * 6;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
  }

  return {
    owned,
    state,
    current,
    currentId() {
      return currentId;
    },
    step,
    ready() {
      const weapon = current();
      return weapon.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = current().def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (current().mag <= 0) return false;
      current().mag -= 1;
      return true;
    },
    reload() {
      const weapon = current();
      if (state.reloadLeft > 0 || weapon.mag === weapon.def.mag || weapon.reserve === 0) return false;
      state.reloadLeft = weapon.def.reloadTime;
      return true;
    },
    spread(speed, aiming) {
      const def = current().def;
      const moving = Math.min(1, speed / 5.2) * def.spreadMove;
      const ads = aiming ? 0.45 : 1;
      return (def.spreadStill + moving) * ads;
    },
    setAds(on) {
      state.adsTarget = on;
    },
    equip(id) {
      if (!owned[id] || id === currentId) return false;
      models[current().def.kind].visible = false;
      currentId = id;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      models[current().def.kind].visible = true;
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { def: WEAPONS[id], mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    refillReserves() {
      for (const weapon of Object.values(owned)) {
        weapon.reserve = weapon.def.reserve;
      }
    },
    reset() {
      for (const id of Object.keys(owned)) {
        if (id !== 'pistol') delete owned[id];
      }
      models[current().def.kind].visible = false;
      currentId = 'pistol';
      owned.pistol.mag = WEAPONS.pistol.mag;
      owned.pistol.reserve = WEAPONS.pistol.reserve;
      models.pistol.visible = true;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
