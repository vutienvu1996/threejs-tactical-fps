// Bots: two teams of simple soldiers that walk the map's waypoint graph, hold
// positions, see and hear, and shoot back in bursts. Allies (EMBER) escort the
// player toward a site; defenders (CINDER) hold the sites and defuse a planted
// charge. One shared think loop, one shared mover, no per-frame allocation in
// the hot path beyond what three.js needs.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './mover.js';
import { clamp, range } from './rng.js';

const BOT_SPEED = 4.2;
const VISION_RANGE = 30;
const VISION_HALF_ANGLE = 0.96;
const HEAR_RANGE = 26;
const BOT_DAMAGE = 14;
const DEFUSE_SECONDS = 5;

const EMBER_NAMES = ['EMBER-1', 'EMBER-2', 'EMBER-3'];
const CINDER_NAMES = ['CINDER-1', 'CINDER-2', 'CINDER-3', 'CINDER-4'];

export function createBots(scene, map, camera, random) {
  const mover = createMover(map.colliders);
  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE;
  const losRaycaster = new THREE.Raycaster();
  losRaycaster.far = VISION_RANGE;

  const eye = new THREE.Vector3();
  const targetEye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const temp = new THREE.Vector3();
  const muzzleWorld = new THREE.Vector3();

  const bots = [];
  let botCounter = 0;

  function buildMesh(team) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x14161a), roughness: 0.8, metalness: 0.1 });
    const suit = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'EMBER' ? 0x3a332a : 0x27313a), roughness: 0.75, metalness: 0.1,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: new THREE.Color(team === 'EMBER' ? PALETTE.accent : PALETTE.teal),
      roughness: 0.5, metalness: 0.2, emissive: new THREE.Color(team === 'EMBER' ? PALETTE.accent : PALETTE.teal),
      emissiveIntensity: 0.7,
    });
    function part(width, height, depth, x, y, z, material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    }
    const legL = part(0.17, 0.52, 0.19, -0.11, 0.26, 0, dark);
    const legR = part(0.17, 0.52, 0.19, 0.11, 0.26, 0, dark);
    const torso = part(0.52, 0.62, 0.3, 0, 0.95, 0, suit);
    const pad = part(0.56, 0.1, 0.32, 0, 1.24, 0, trim);
    const head = part(0.27, 0.27, 0.27, 0, 1.46, 0, dark);
    const visor = part(0.2, 0.07, 0.02, 0, 1.48, -0.14, trim);
    const gun = part(0.07, 0.09, 0.72, 0.18, 1.12, -0.3, dark);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0.18, 1.14, -0.68);
    group.add(muzzle);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.copy(muzzle.position);
    group.add(flash);
    // Health bar above the head, shown once the bot has taken damage.
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x0a0c0e, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    barBg.position.set(0, 1.78, 0);
    const barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.045),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(team === 'EMBER' ? PALETTE.accent : PALETTE.teal), transparent: true, opacity: 0.95, depthWrite: false }),
    );
    barFg.position.set(0, 1.78, 0.001);
    const bar = new THREE.Group();
    bar.add(barBg, barFg);
    bar.visible = false;
    group.add(bar);
    scene.add(group);
    return { group, torso, head, legL, legR, gun, muzzle, flash, bar, barFg, trim };
  }

  function makeBot(team, index, spawn) {
    const name = team === 'EMBER' ? EMBER_NAMES[index] : CINDER_NAMES[index];
    const parts = buildMesh(team);
    const bot = {
      id: botCounter,
      name,
      team,
      ally: team === 'EMBER',
      body: {
        position: new THREE.Vector3(spawn.x, 0, spawn.z),
        velocity: new THREE.Vector3(),
        radius: 0.34,
        height: 1.72,
        onGround: true,
      },
      yaw: team === 'EMBER' ? -Math.PI / 2 : Math.PI / 2,
      health: 100,
      armor: 0,
      alive: true,
      state: 'route',
      route: [],
      routeIndex: 0,
      holdNode: -1,
      holdUntil: 0,
      target: null,
      targetIsPlayer: false,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -100,
      investigateAt: -100,
      investigatePos: new THREE.Vector3(),
      thinkTimer: random() * 0.15,
      fireTimer: 0,
      burstLeft: 0,
      burstPause: 0,
      reactUntil: 0,
      strafeDir: 1,
      strafeTimer: 0,
      flashTimer: 0,
      fall: 0,
      defuseProgress: 0,
      defusing: false,
      skill: range(random, 0.8, 1.1),
      site: team === 'EMBER' ? (index % 2 === 0 ? 'A' : 'B') : null,
      lastShotAt: -100,
      parts,
      hitMeshes: [],
    };
    botCounter += 1;
    for (const [mesh, partName] of [[parts.torso, 'torso'], [parts.head, 'head'], [parts.legL, 'legs'], [parts.legR, 'legs']]) {
      mesh.userData.bot = bot;
      mesh.userData.part = partName;
      bot.hitMeshes.push(mesh);
    }
    return bot;
  }

  function spawnAll(emberSpawns, cinderSpawns) {
    for (const bot of bots) scene.remove(bot.parts.group);
    bots.length = 0;
    botCounter = 0;
    emberSpawns.forEach((spawn, i) => bots.push(makeBot('EMBER', i, spawn)));
    cinderSpawns.forEach((spawn, i) => bots.push(makeBot('CINDER', i, spawn)));
    return bots;
  }

  function eyePosition(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
    return out;
  }

  function hasLineOfSight(from, to) {
    direction.copy(to).sub(from);
    const distance = direction.length();
    if (distance > VISION_RANGE) return false;
    direction.normalize();
    losRaycaster.set(from, direction);
    losRaycaster.far = distance;
    return losRaycaster.intersectObjects(map.shootables, false).length === 0;
  }

  function canSee(bot, targetPos, targetEyeHeight, now) {
    toTarget.copy(targetPos);
    toTarget.y += targetEyeHeight;
    eyePosition(bot, eye);
    const dx = toTarget.x - eye.x;
    const dz = toTarget.z - eye.z;
    const distance = Math.hypot(dx, dz);
    if (distance > VISION_RANGE) return false;
    if (distance > 6) {
      const angle = Math.atan2(-dx, -dz);
      let diff = angle - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > VISION_HALF_ANGLE) return false;
    }
    return hasLineOfSight(eye, toTarget);
  }

  function nearestNodeTo(position) {
    return map.nearestNode(position);
  }

  function assignRoute(bot, targetNode) {
    const from = nearestNodeTo(bot.body.position);
    bot.route = map.route(from, targetNode);
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function pickHoldNode(bot) {
    if (bot.team === 'CINDER') {
      const holds = [14, 15, 16, 17, 12, 13, 20, 21];
      return holds[Math.floor(random() * holds.length)];
    }
    return bot.site === 'A' ? 14 : 15;
  }

  function think(bot, context, now) {
    if (!bot.alive) return;
    const { player, planted, plantSite } = context;
    // Planted charge changes everyone's job — but a bot that can see an enemy
    // still fights first; it only walks to the site when it has no target.
    if (planted) {
      if (bot.team === 'CINDER') {
        const siteNode = plantSite === 'A' ? 14 : 15;
        if (bot.state !== 'defuse' && bot.state !== 'route' && bot.state !== 'engage') assignRoute(bot, siteNode);
        else if (bot.state === 'route' && bot.target === null && bot.route[bot.route.length - 1] !== siteNode) assignRoute(bot, siteNode);
      } else if (bot.state !== 'engage') {
        const siteNode = plantSite === 'A' ? 14 : 15;
        if (bot.state !== 'route' || bot.route[bot.route.length - 1] !== siteNode) assignRoute(bot, siteNode);
      }
    }
    // Look for an enemy.
    let seen = null;
    let seenIsPlayer = false;
    if (player.state.alive) {
      if (canSee(bot, player.body.position, 1.2, now)) {
        seen = player;
        seenIsPlayer = true;
      }
    }
    if (!seen) {
      for (const other of bots) {
        if (other === bot || !other.alive || other.team === bot.team) continue;
        if (canSee(bot, other.body.position, 1.2, now)) {
          seen = other;
          break;
        }
      }
    }
    if (seen) {
      if (bot.target !== seen) {
        bot.reactUntil = now + 0.35 + random() * 0.3;
        bot.burstLeft = 0;
      }
      bot.target = seen;
      bot.targetIsPlayer = seenIsPlayer;
      bot.lastSeen.copy(seen.body.position);
      bot.lastSeenAt = now;
      bot.state = 'engage';
      return;
    }
    bot.target = null;
    if (bot.state === 'engage') {
      // Lost sight: investigate the last known spot for a while.
      bot.investigatePos.copy(bot.lastSeen);
      bot.investigateAt = now;
      assignRoute(bot, nearestNodeTo(bot.lastSeen));
      bot.state = 'investigate';
      return;
    }
    if (bot.state === 'investigate') {
      if (now - bot.investigateAt > 7 || bot.routeIndex >= bot.route.length) {
        bot.state = 'route';
        bot.route = [];
      }
      return;
    }
    if (bot.state === 'hold') {
      if (now > bot.holdUntil) {
        bot.state = 'route';
        bot.route = [];
      }
      return;
    }
    if (bot.state === 'route' && bot.route.length === 0) {
      if (planted && bot.team === 'CINDER') {
        bot.state = 'defuse';
        bot.defuseProgress = 0;
        return;
      }
      if (bot.team === 'EMBER' && !planted) {
        const targetNode = bot.site === 'A' ? 14 : 15;
        if (nearestNodeTo(bot.body.position) === targetNode) {
          bot.state = 'hold';
          bot.holdNode = targetNode;
          bot.holdUntil = now + 6 + random() * 6;
          return;
        }
        assignRoute(bot, targetNode);
        return;
      }
      bot.holdNode = pickHoldNode(bot);
      bot.holdUntil = now + 8 + random() * 8;
      bot.state = 'hold';
    }
  }

  function moveToward(bot, dt, targetX, targetZ, speed) {
    const dx = targetX - bot.body.position.x;
    const dz = targetZ - bot.body.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return true;
    const wish = { x: dx / distance, z: dz / distance };
    mover.step(bot.body, dt, wish, speed, false);
    const targetYaw = Math.atan2(-dx, -dz);
    let diff = targetYaw - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += clamp(diff, -dt * 6, dt * 6);
    return distance < 0.7;
  }

  function fireBurst(bot, context, now) {
    const target = bot.target;
    if (!target) return;
    const targetAlive = target.state ? target.state.alive : target.alive;
    if (!targetAlive) {
      bot.target = null;
      return;
    }
    if (now < bot.reactUntil) return;
    if (bot.burstLeft > 0) {
      if (bot.fireTimer > 0) return;
      bot.fireTimer = 0.11;
      bot.burstLeft -= 1;
      shootOnce(bot, target, context, now);
      if (bot.burstLeft === 0) bot.burstPause = 0.7 + random() * 0.7;
      return;
    }
    if (bot.burstPause > 0) return;
    bot.burstLeft = 3 + Math.floor(random() * 3);
  }

  function shootOnce(bot, target, context, now) {
    const targetPos = target.body ? target.body.position : target.state.body.position;
    const targetSpeed = target.body
      ? Math.hypot(target.body.velocity.x, target.body.velocity.z)
      : Math.hypot(target.state.body.velocity.x, target.state.body.velocity.z);
    eyePosition(bot, eye);
    targetEye.set(targetPos.x, targetPos.y + 1.2, targetPos.z);
    const distance = eye.distanceTo(targetEye);
    const los = hasLineOfSight(eye, targetEye);
    let hitChance = 0.46 * bot.skill;
    hitChance *= clamp(1 - (distance - 8) / 34, 0.42, 1);
    hitChance *= targetSpeed > 3 ? 0.55 : targetSpeed > 0.6 ? 0.8 : 1;
    if (!los) hitChance = 0;
    bot.lastShotAt = now;
    bot.flashTimer = 0.06;
    bot.parts.muzzle.getWorldPosition(muzzleWorld);
    if (los && random() < hitChance) {
      const damage = Math.round(clamp(BOT_DAMAGE * (1 - distance / 90), 8, BOT_DAMAGE));
      context.onBotHit(bot, target, damage);
      context.tracers.fire(muzzleWorld, targetEye, 0xffd27a);
    } else {
      temp.set(
        targetEye.x + (random() * 2 - 1) * 1.4,
        targetEye.y + (random() * 2 - 1) * 0.9,
        targetEye.z + (random() * 2 - 1) * 1.4,
      );
      context.tracers.fire(muzzleWorld, temp, 0xffd27a);
    }
    context.onBotShot(bot);
  }

  function stepBot(bot, dt, context, now) {
    const parts = bot.parts;
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        parts.group.rotation.x = -bot.fall * 1.45;
        parts.group.position.y = -bot.fall * 0.08;
      }
      parts.flash.material.opacity = 0;
      return;
    }
    bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.15;
      think(bot, context, now);
    }
    bot.fireTimer = Math.max(0, bot.fireTimer - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    bot.flashTimer = Math.max(0, bot.flashTimer - dt);
    parts.flash.material.opacity = bot.flashTimer > 0 ? 0.9 : 0;

    const speed = BOT_SPEED;
    if (bot.state === 'engage' && bot.target) {
      const targetPos = bot.target.body ? bot.target.body.position : bot.target.state.body.position;
      const dx = targetPos.x - bot.body.position.x;
      const dz = targetPos.z - bot.body.position.z;
      const distance = Math.hypot(dx, dz);
      bot.yaw = Math.atan2(-dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.7 + random() * 0.8;
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      const wish = { x: 0, z: 0 };
      const nx = dx / (distance || 1);
      const nz = dz / (distance || 1);
      if (distance > 20) {
        wish.x = nx;
        wish.z = nz;
      } else if (distance < 6) {
        wish.x = -nx;
        wish.z = -nz;
      } else {
        wish.x = -nz * bot.strafeDir;
        wish.z = nx * bot.strafeDir;
      }
      mover.step(bot.body, dt, wish, speed * 0.8, false);
      fireBurst(bot, context, now);
    } else if (bot.state === 'route' || bot.state === 'investigate') {
      if (bot.routeIndex < bot.route.length) {
        const node = map.nodes[bot.route[bot.routeIndex]];
        if (moveToward(bot, dt, node.x, node.z, speed)) bot.routeIndex += 1;
      } else if (bot.state === 'route') {
        if (context.planted && bot.team === 'CINDER') {
          bot.state = 'defuse';
          bot.defuseProgress = 0;
        } else {
          bot.state = 'hold';
          bot.holdUntil = now + 4 + random() * 5;
        }
      }
    } else if (bot.state === 'hold') {
      bot.yaw += Math.sin(now * 0.5 + bot.id * 2.1) * dt * 0.6;
    } else if (bot.state === 'defuse') {
      bot.defuseProgress += dt;
      bot.yaw += dt * 0.8;
      if (bot.defuseProgress >= DEFUSE_SECONDS) {
        bot.defuseProgress = 0;
        bot.state = 'hold';
        context.onDefuse(bot);
      }
    }
    // Keep the mesh on the body and the health bar facing the camera.
    parts.group.position.copy(bot.body.position);
    parts.group.rotation.y = bot.yaw;
    parts.group.rotation.x = 0;
    if (bot.health < 100) {
      parts.bar.visible = true;
      parts.bar.quaternion.copy(camera.quaternion);
      parts.barFg.scale.x = Math.max(0.02, bot.health / 100);
      parts.barFg.position.x = -(0.56 * (1 - bot.health / 100)) / 2;
    } else {
      parts.bar.visible = false;
    }
    // Low-health retreat: fall back along the graph away from the threat.
    if (bot.alive && bot.health < 35 && bot.state === 'engage' && bot.target) {
      const targetPos = bot.target.body ? bot.target.body.position : bot.target.state.body.position;
      let bestNode = -1;
      let bestDistance = 0;
      for (let i = 0; i < map.nodes.length; i += 1) {
        const d = Math.hypot(map.nodes[i].x - targetPos.x, map.nodes[i].z - targetPos.z);
        if (d > bestDistance) {
          bestDistance = d;
          bestNode = i;
        }
      }
      assignRoute(bot, bestNode);
      bot.state = 'route';
    }
  }

  function damage(bot, amount, part, attacker) {
    if (!bot.alive) return false;
    // A hit interrupts a defuse in progress: the bot has to start over.
    if (bot.state === 'defuse') {
      bot.defuseProgress = 0;
      bot.state = 'route';
      bot.route = [];
    }
    let remaining = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, remaining * 0.5);
      bot.armor -= absorbed;
      remaining -= absorbed;
    }
    bot.health -= remaining;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.target = null;
      bot.defusing = false;
      return true;
    }
    return false;
  }

  function reset(bot, spawn) {
    bot.body.position.set(spawn.x, 0, spawn.z);
    bot.body.velocity.set(0, 0, 0);
    bot.yaw = bot.team === 'EMBER' ? -Math.PI / 2 : Math.PI / 2;
    bot.health = 100;
    bot.armor = 0;
    bot.alive = true;
    bot.state = 'route';
    bot.route = [];
    bot.routeIndex = 0;
    bot.target = null;
    bot.lastSeenAt = -100;
    bot.investigateAt = -100;
    bot.fireTimer = 0;
    bot.burstLeft = 0;
    bot.burstPause = 0;
    bot.flashTimer = 0;
    bot.fall = 0;
    bot.defuseProgress = 0;
    bot.defusing = false;
    bot.parts.group.rotation.set(0, bot.yaw, 0);
    bot.parts.group.position.copy(bot.body.position);
    bot.parts.bar.visible = false;
  }

  function hearShot(position, shooterTeam) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === shooterTeam || bot.state === 'engage') continue;
      const dx = bot.body.position.x - position.x;
      const dz = bot.body.position.z - position.z;
      if (dx * dx + dz * dz > HEAR_RANGE * HEAR_RANGE) continue;
      if (nowRef.current - bot.investigateAt < 4) continue;
      bot.investigatePos.copy(position);
      bot.investigateAt = nowRef.current;
      assignRoute(bot, nearestNodeTo(position));
      bot.state = 'investigate';
    }
  }

  const nowRef = { current: 0 };

  return {
    bots,
    spawnAll,
    stepBot,
    damage,
    reset,
    hearShot,
    eyePosition,
    nowRef,
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    aliveBots(team) {
      return bots.filter((bot) => bot.alive && bot.team === team);
    },
    hitMeshes(team) {
      const meshes = [];
      for (const bot of bots) {
        if (bot.alive && (!team || bot.team === team)) meshes.push(...bot.hitMeshes);
      }
      return meshes;
    },
    resetAll(emberSpawns, cinderSpawns) {
      bots.forEach((bot, i) => {
        reset(bot, bot.team === 'EMBER' ? emberSpawns[i % emberSpawns.length] : cinderSpawns[i % cinderSpawns.length]);
      });
    },
  };
}
