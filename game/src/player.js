// The player: first-person state, look, crouch and the eye height the camera
// reads. Movement itself lives in mover.js; this file owns the player's numbers
// and the wish direction built from the keys.
import * as THREE from 'three';
import { createMover } from './mover.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ADS_SPEED = 3.4;

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders);
  const body = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    radius: RADIUS,
    height: STAND_HEIGHT,
    onGround: true,
  };
  const state = {
    body,
    yaw: -Math.PI / 2,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    aiming: false,
    health: 100,
    armor: 0,
    alive: true,
  };
  const wish = { x: 0, z: 0 };

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && !mover.overlaps(body.position.x, body.position.y, body.position.z, RADIUS, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.x = 0;
    wish.z = 0;
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.x = -sin * forward + cos * strafe;
      wish.z = -cos * forward - sin * strafe;
      const length = Math.hypot(wish.x, wish.z) || 1;
      wish.x /= length;
      wish.z /= length;
    }
    const speed = state.crouching ? CROUCH_SPEED : state.aiming ? ADS_SPEED : WALK_SPEED;
    mover.step(body, dt, wish, speed, keys.has('Space'));
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.height = STAND_HEIGHT;
    state.yaw = -Math.PI / 2;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.crouching = false;
    state.aiming = false;
    state.health = 100;
    state.armor = 0;
    state.alive = true;
  }

  return {
    state,
    body,
    step,
    look,
    recoil,
    reset,
    eyePosition(out) {
      out.set(body.position.x, body.position.y + state.eye, body.position.z);
      return out;
    },
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    moving() {
      return Math.hypot(body.velocity.x, body.velocity.z) > 0.6;
    },
  };
}
