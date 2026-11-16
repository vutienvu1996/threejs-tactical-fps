// Emberline: boot, the fixed-step loop, combat resolution and the round flow.
// The simulation runs at a fixed 60 Hz; rendering follows the display. Shot
// mode (?shot=start|buy|plant|duel&seed=N) stages one deterministic frame,
// renders it twice and freezes it for the screenshot taker.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp } from './rng.js';
import { createAudio } from './audio.js';
import { createMap, SPAWNS, SITES, PLAYER_SPAWN } from './map.js';
import { createPlayer } from './player.js';
import { createWeaponRig, GRENADE_DEF, ARMOR_DEF } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenade.js';
import { createTracers, createSparks, createExplosion } from './fx.js';
import { createMatch, PLANT_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);
// A small warm light riding with the camera: it lifts the view model and the
// ground at the player's feet out of the dusk without flattening the scene.
const cameraLight = new THREE.PointLight(new THREE.Color(0xffe0b3), 9, 6, 1.5);
camera.add(cameraLight);

const audio = createAudio();
const map = createMap(scene);
const hud = createHud();
const bots = createBots(scene, map, camera, random);
const player = createPlayer(map.colliders, PLAYER_SPAWN);
const rig = createWeaponRig(camera);
const tracers = createTracers(scene);
const sparks = createSparks(scene);
const explosion = createExplosion(scene);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const eye = new THREE.Vector3();
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tempVec = new THREE.Vector3();
const hitNormal = new THREE.Vector3();

let grenadesOwned = 0;
let playerDiedLastRound = false;
let spectateBot = null;
let triggerConsumed = false;
let lastWeaponId = null;
let plantHeld = 0;
let stepTimer = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();

const grenades = createGrenades(scene, map.colliders, (position) => {
  explosion.trigger(position, 6);
  audio.explosion();
  const victims = bots.aliveBots('CINDER');
  for (const bot of victims) {
    const distance = bot.body.position.distanceTo(position);
    if (distance > 6) continue;
    const damage = Math.round(90 - (distance / 6) * 70);
    const died = bots.damage(bot, damage, 'torso', 'player');
    if (died) {
      hud.killfeed(`<b>You</b> <span class="dim">fragged</span> <b>${bot.name}</b>`);
      onBotKilled(bot, 'player');
    }
  }
});

function aliveEnemies() {
  return bots.aliveCount('CINDER');
}

function checkRoundEnd() {
  const matchState = match.state;
  if (matchState.phase !== 'live') return;
  if (aliveEnemies() === 0) {
    match.endRound('EMBER', 'CINDER team eliminated');
    return;
  }
  if (!player.state.alive && bots.aliveCount('EMBER') === 0) {
    match.endRound('CINDER', 'EMBER team eliminated');
  }
}

function onBotKilled(bot, killer) {
  // The kill reward is for enemies only; allies can no longer be hit by the
  // player's weapons, and this guard keeps a future path from paying for one.
  if (killer === 'player' && bot.team === 'CINDER') {
    match.addKillReward();
    audio.kill();
  }
  checkRoundEnd();
}

function damagePlayer(amount, fromPosition) {
  if (!player.state.alive) return;
  let remaining = amount;
  if (player.state.armor > 0) {
    const absorbed = Math.min(player.state.armor, remaining * 0.5);
    player.state.armor -= absorbed;
    remaining -= absorbed;
  }
  player.state.health -= remaining;
  audio.hurt();
  hud.hurtFlash();
  if (fromPosition) {
    const dx = fromPosition.x - player.body.position.x;
    const dz = fromPosition.z - player.body.position.z;
    const worldAngle = Math.atan2(dx, dz);
    hud.damageFrom(worldAngle + player.state.yaw);
  }
  hud.setHealth(player.state.health);
  hud.setArmor(player.state.armor);
  if (player.state.health <= 0) {
    player.state.health = 0;
    player.state.alive = false;
    match.state.deaths += 1;
    if (document.pointerLockElement) document.exitPointerLock();
    const allies = bots.aliveBots('EMBER');
    spectateBot = allies.length > 0 ? allies[0] : null;
    hud.showSpectate(spectateBot ? `You are down — spectating ${spectateBot.name}` : 'You are down');
    checkRoundEnd();
  }
}

function damageBotTarget(bot, amount, part, attackerName) {
  const died = bots.damage(bot, amount, part, attackerName);
  if (died) onBotKilled(bot, attackerName);
  return died;
}

const botContext = {
  player,
  planted: false,
  plantSite: null,
  tracers,
  onBotShot(bot) {
    if (bot.targetIsPlayer) audio.distantShot();
  },
  onBotHit(bot, target, damage) {
    if (target === player) {
      damagePlayer(damage, bot.body.position);
    } else {
      const died = damageBotTarget(target, damage, 'torso', bot.name);
      if (died) hud.killfeed(`<b>${bot.name}</b> <span class="dim">dropped</span> <b>${target.name}</b>`);
    }
  },
  onDefuse(bot) {
    match.defuse();
    hud.killfeed(`<b>${bot.name}</b> <span class="dim">defused the charge</span>`);
  },
};

const match = createMatch({
  onBuyPhase(state) {
    grenades.clear();
    rig.refillReserves();
    if (playerDiedLastRound) {
      rig.reset();
      grenadesOwned = 0;
      player.state.armor = 0;
    }
    playerDiedLastRound = false;
    player.reset(PLAYER_SPAWN);
    bots.resetAll(SPAWNS.EMBER, SPAWNS.CINDER);
    spectateBot = null;
    hud.hideSpectate();
    hud.hideBanner();
    hud.setHealth(100);
    hud.setArmor(player.state.armor);
    hud.setAmmo(rig.current().mag, rig.current().reserve, rig.current().def.name);
    hud.setMoney(state.money);
    hud.setScore(state.scoreEmber, state.scoreCinder, state.round);
    hud.showBuy(state.money, Object.keys(rig.owned), grenadesOwned, player.state.armor > 0, {
      onBuy: buyItem,
      onDeploy: deployAndLock,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onFreeze(state) {
    hud.hideBuy();
    hud.showBanner(`ROUND ${state.round}`, 'Hold position — round starts', true);
    audio.buy();
  },
  onLive() {
    hud.hideBanner();
    // The round is live but the mouse may still be free (the player bought
    // without locking, or the buy timer ran out): offer one click to lock in.
    if (!shot && !input.state.locked && player.state.alive) hud.showOverlay('paused', 0);
  },
  onRoundEnd(state) {
    playerDiedLastRound = !player.state.alive;
    hud.hidePlant();
    hud.hideBuy();
    const won = state.roundWinner === 'EMBER';
    hud.showBanner(
      won ? 'ROUND WON' : 'ROUND LOST',
      `${state.winReason} · EMBER ${state.scoreEmber} — ${state.scoreCinder} CINDER`,
      won,
    );
    if (won) audio.roundWin();
    else audio.roundLose();
  },
  onMatchEnd(state) {
    const won = state.matchWinner === 'EMBER';
    hud.hideBuy();
    hud.showOverlay('matchEnd', {
      title: won ? 'EMBER WINS THE MATCH' : 'CINDER WINS THE MATCH',
      copy: `Final score EMBER ${state.scoreEmber} — ${state.scoreCinder} CINDER. You scored ${state.kills} eliminations.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlant(state) {
    hud.showBanner('CHARGE PLANTED', `Detonation in ${state.fuseLeft | 0}s — defend site ${state.plantSite}`, true);
    audio.plantBeep(true);
  },
  onDetonate(state) {
    const site = SITES[state.plantSite];
    explosion.trigger(new THREE.Vector3(site.center.x, 1, site.center.z), 8);
    audio.explosion();
  },
});

function deployAndLock() {
  match.deployNow();
  input.requestLock();
}

function buyItem(itemId) {
  const item = match.buy(itemId);
  if (!item) return;
  audio.buy();
  if (item.kind === 'weapon') {
    rig.buy(itemId);
    rig.equip(itemId);
    hud.setAmmo(rig.current().mag, rig.current().reserve, rig.current().def.name);
  } else if (item.kind === 'grenade') {
    grenadesOwned = Math.min(2, grenadesOwned + 1);
  } else if (item.kind === 'armor') {
    player.state.armor = ARMOR_DEF.armor;
    hud.setArmor(player.state.armor);
  }
  hud.setMoney(match.state.money);
  hud.showBuy(match.state.money, Object.keys(rig.owned), grenadesOwned, player.state.armor > 0, {
    onBuy: buyItem,
    onDeploy: deployAndLock,
  });
}

function shoot(spread) {
  const weapon = rig.current();
  if (!rig.takeRound()) {
    audio.dryFire();
    rig.reload();
    return false;
  }
  player.eyePosition(eye);
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(eye).addScaledVector(direction, 0.6);
  muzzle.y -= 0.12;
  scene.updateMatrixWorld(true);
  raycaster.set(eye, direction);
  const targets = map.shootables.concat(bots.hitMeshes('CINDER'));
  const hit = raycaster.intersectObjects(targets, false)[0];
  const def = weapon.def;
  let endPoint = tempVec.copy(direction).multiplyScalar(60).add(eye);
  if (hit) {
    endPoint = hit.point;
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const part = hit.object.userData.part;
      const distance = hit.distance;
      const falloff = clamp(1 - Math.max(0, distance - def.range * 0.5) / def.range, 0.4, 1);
      const partMult = part === 'head' ? def.headMult : part === 'legs' ? 0.8 : 1;
      const damage = Math.max(1, Math.round(def.damage * falloff * partMult));
      const died = damageBotTarget(bot, damage, part, 'player');
      hud.hitMarker(died, shot ? 4000 : 110);
      if (!died) audio.hit();
      if (died) {
        hud.killfeed(`<b>You</b> <span class="dim">dropped</span> <b>${bot.name}</b> <span class="dim">${def.name}${part === 'head' ? ' · headshot' : ''}</span>`);
      }
    } else {
      hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      sparks.burst(hit.point, hitNormal);
    }
  }
  tracers.fire(muzzle, endPoint, 0xffc46b);
  rig.pullTrigger();
  player.recoil(def.kick + random() * 0.003, (random() * 2 - 1) * 0.003);
  audio.shot(def.sound);
  bots.hearShot(player.body.position, 'EMBER');
  hud.setAmmo(weapon.mag, weapon.reserve, def.name);
  return true;
}

function throwGrenade() {
  if (grenadesOwned <= 0) return;
  grenadesOwned -= 1;
  player.eyePosition(eye);
  camera.getWorldDirection(direction);
  grenades.throwGrenade(eye, direction, 13);
  audio.grenadePin();
}

function syncCamera() {
  if (player.state.alive) {
    player.eyePosition(eye);
    camera.position.copy(eye);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  } else if (spectateBot && spectateBot.alive) {
    bots.eyePosition(spectateBot, eye);
    camera.position.copy(eye);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
  }
}

function aimAt(point) {
  const body = player.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + player.state.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function step(dt) {
  elapsed += dt;
  bots.nowRef.current = elapsed;
  match.tick(dt);
  botContext.planted = match.state.planted;
  botContext.plantSite = match.state.plantSite;

  const phase = match.state.phase;
  if (phase === 'live' && player.state.alive) {
    player.step(dt, input.state.keys);
    if (player.moving() && player.state.body.onGround) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = 0.42;
        audio.step();
      }
    }
    // Planting: hold E inside a site.
    const site = map.siteAt(player.body.position);
    if (site && !match.state.planted && input.state.keys.has('KeyE')) {
      plantHeld += dt;
      hud.showPlant(`PLANTING CHARGE — SITE ${site}`, plantHeld / PLANT_SECONDS);
      if (plantHeld >= PLANT_SECONDS) {
        plantHeld = 0;
        hud.hidePlant();
        match.plant(site);
      }
    } else {
      if (plantHeld > 0) hud.hidePlant();
      plantHeld = 0;
    }
  }
  if (phase === 'live' || phase === 'roundEnd' || phase === 'matchEnd') {
    for (const bot of bots.bots) bots.stepBot(bot, dt, botContext, elapsed);
  }
  rig.step(dt, player.moving(), player.groundSpeed());
  grenades.step(dt);
  tracers.step(dt);
  sparks.step(dt);
  explosion.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.state.alive && match.state.phase === 'live') player.look(look.x, look.y);
    player.state.aiming = input.state.aiming && player.state.alive;
    rig.setAds(player.state.aiming);
    const targetFov = player.state.aiming ? 55 : 74;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
    // Switching weapons re-arms the trigger: a semi-auto must fire on the
    // next press even if the previous weapon's trigger was released less
    // than a frame ago (at very low frame rates no frame may run between
    // release and press, which would otherwise leave it stuck).
    const currentWeaponId = rig.current().def.id;
    if (currentWeaponId !== lastWeaponId) {
      lastWeaponId = currentWeaponId;
      triggerConsumed = false;
    }
    if (input.state.firing && player.state.alive && match.state.phase === 'live') {
      const def = rig.current().def;
      if (rig.ready()) {
        if (def.auto || !triggerConsumed) {
          shoot(shot ? 0 : rig.spread(player.groundSpeed(), player.state.aiming));
          triggerConsumed = true;
        }
      } else if (rig.current().mag === 0 && rig.current().reserve > 0) {
        rig.reload();
      }
    }
    if (!input.state.firing) triggerConsumed = false;
    if (input.takePressed('KeyR') && player.state.alive) {
      if (rig.reload()) audio.reload();
    }
    if (input.takePressed('Digit1')) rig.equip('pistol');
    if (input.takePressed('Digit2')) {
      const owned = Object.keys(rig.owned).filter((id) => id !== 'pistol');
      if (owned.length > 0) rig.equip(owned[owned.length - 1]);
    }
    if (input.takePressed('KeyG') && player.state.alive && match.state.phase === 'live') throwGrenade();
    if (input.takePressed('KeyB') && match.state.phase === 'buy') {
      hud.showBuy(match.state.money, Object.keys(rig.owned), grenadesOwned, player.state.armor > 0, {
        onBuy: buyItem,
        onDeploy: deployAndLock,
      });
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // HUD refresh (cheap setters skip unchanged values).
    hud.setHealth(player.state.health);
    hud.setArmor(player.state.armor);
    hud.setAmmo(rig.current().mag, rig.current().reserve, rig.current().def.name);
    hud.setMoney(match.state.money);
    hud.setTimer(match.state.roundTime, match.state.planted, match.state.fuseLeft);
    hud.setScore(match.state.scoreEmber, match.state.scoreCinder, match.state.round);
    hud.setAlive(bots.aliveCount('EMBER'), bots.aliveCount('CINDER'));
    hud.setCrosshairGap(4 + rig.spread(player.groundSpeed(), player.state.aiming) * 900);
    hud.drawMinimap(map, player, bots.bots, elapsed);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function teleportBot(bot, x, z, yaw) {
  bot.body.position.set(x, 0, z);
  bot.body.velocity.set(0, 0, 0);
  bot.yaw = yaw;
  bot.state = 'hold';
  bot.holdUntil = 9999;
  bot.route = [];
  bot.parts.group.position.copy(bot.body.position);
  bot.parts.group.rotation.set(0, yaw, 0);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  const ember = bots.bots.filter((bot) => bot.team === 'EMBER');
  const cinder = bots.bots.filter((bot) => bot.team === 'CINDER');
  if (name === 'start') {
    match.state.phase = 'live';
    match.state.roundTime = 92;
    player.reset(new THREE.Vector3(-11, 0, 0));
    player.state.yaw = -Math.PI / 2;
    teleportBot(cinder[0], 1, -1.5, Math.PI / 2);
    teleportBot(cinder[1], 4, 2.5, Math.PI / 2);
    teleportBot(cinder[2], 8, -5, Math.PI / 2);
    teleportBot(ember[0], -8, -4, -Math.PI / 2);
    settle(30);
    aimAt(new THREE.Vector3(1, 1.25, -1.5));
    hud.setTimer(92, false, 0);
  } else if (name === 'buy') {
    match.state.money = 3400;
    match.state.phase = 'buy';
    match.state.phaseTime = 14;
    player.reset(new THREE.Vector3(-21, 0, 0));
    player.state.yaw = -Math.PI / 2;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.5, 0));
    hud.showBuy(match.state.money, Object.keys(rig.owned), 1, false, {
      onBuy: () => {},
      onDeploy: () => {},
    });
  } else if (name === 'plant') {
    match.state.phase = 'live';
    match.state.roundTime = 60;
    match.state.planted = true;
    match.state.plantSite = 'A';
    match.state.fuseLeft = 18;
    botContext.planted = true;
    botContext.plantSite = 'A';
    player.reset(new THREE.Vector3(11, 0, -7));
    teleportBot(cinder[0], 18, -8, Math.PI * 0.75);
    teleportBot(cinder[1], 20, -13, Math.PI / 2);
    teleportBot(ember[0], 12, -13, -Math.PI / 2);
    settle(30);
    aimAt(new THREE.Vector3(15, 1.2, -11));
    hud.setTimer(60, true, 18);
  } else if (name === 'duel') {
    match.state.phase = 'live';
    match.state.roundTime = 74;
    player.reset(new THREE.Vector3(0, 0, 0));
    player.state.yaw = -Math.PI / 2;
    teleportBot(cinder[0], 5.5, 0.3, Math.PI / 2);
    teleportBot(cinder[1], 9, -3, Math.PI / 2);
    teleportBot(ember[0], -4, -3, -Math.PI / 2);
    settle(20);
    aimAt(new THREE.Vector3(5.5, 1.25, 0.3));
    shoot(0);
    settle(6);
    aimAt(new THREE.Vector3(5.5, 1.2, 0.3));
    shoot(0);
    settle(3);
    hud.setTimer(74, false, 0);
  }
  hud.setHealth(player.state.health);
  hud.setArmor(player.state.armor);
  hud.setAmmo(rig.current().mag, rig.current().reserve, rig.current().def.name);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.scoreEmber, match.state.scoreCinder, match.state.round);
  hud.setAlive(bots.aliveCount('EMBER'), bots.aliveCount('CINDER'));
  hud.drawMinimap(map, player, bots.bots, elapsed);
  paintTwiceThenReady();
}

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    audio.unlock();
  } else if (match.state.phase === 'live' && player.state.alive) {
    // The round is live but the mouse is free: offer one click to lock back in.
    hud.showOverlay('paused', 0);
  } else if (!started) {
    hud.showOverlay('start', 0);
  }
  // During buy and freeze the overlay stays hidden; the buy menu is the screen.
});

hud.onPlay(() => {
  if (shot) return;
  if (match.state.phase === 'matchEnd') {
    match.resetMatch();
    return;
  }
  // During the buy phase the mouse stays free so the buy menu is clickable;
  // the lock is taken when the round goes live (Deploy, or this button then).
  if (match.state.phase === 'live' && player.state.alive) input.requestLock();
  else hud.hideOverlay();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bots.spawnAll(SPAWNS.EMBER, SPAWNS.CINDER);
syncCamera();

// A read-only test hook, only when the page is opened with ?debug: it exposes
// the live state so a scripted play-test can watch the match without touching
// the game's own code paths. It ships inert in normal play.
if (params.get('debug') !== null) {
  window.__emberline = {
    match, player, bots, rig, map,
    get grenadesOwned() {
      return grenadesOwned;
    },
    // Test-only: fast-forward the simulation by N seconds, running the same
    // fixed-step function the live loop runs. Headless software rendering
    // runs at ~2 fps, so wall-clock waits would take minutes; this advances
    // the match, the bots and the grenades exactly as the loop would.
    ff(seconds) {
      const count = Math.max(0, Math.round(seconds * 60));
      for (let i = 0; i < count; i += 1) step(FIXED_STEP);
      syncCamera();
    },
    sync() {
      syncCamera();
    },
    // Test-only: re-render the buy menu with the current money (the menu
    // normally re-renders on every purchase; this is for scripted tests that
    // set the money directly).
    refreshBuy() {
      if (match.state.phase === 'buy') {
        hud.showBuy(match.state.money, Object.keys(rig.owned), grenadesOwned, player.state.armor > 0, {
          onBuy: buyItem,
          onDeploy: deployAndLock,
        });
      }
    },
  };
}

if (shot) {
  runShot(shot);
} else {
  match.startRound();
  hud.showOverlay('start', 0);
  requestAnimationFrame(frame);
}
