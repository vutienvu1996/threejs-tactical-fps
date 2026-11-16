// Rounds and money: the match state machine. One match is first to 5 round
// wins (at most 9 rounds). A round is buy -> freeze -> live, and ends on an
// elimination, a detonation, a defuse or the clock. The economy lives here:
// kills, round bonuses and the buy catalogue.
import { WEAPONS, GRENADE_DEF, ARMOR_DEF } from './weapons.js';

export const BUY_SECONDS = 20;
export const FREEZE_SECONDS = 3;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 25;
export const PLANT_SECONDS = 3;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export const BUY_ITEMS = [
  { id: 'smg', kind: 'weapon', name: 'VK-9 Raptor', detail: 'SMG · fast, close range', price: WEAPONS.smg.price, damage: 22, fireRate: 'fast', range: 'short' },
  { id: 'rifle', kind: 'weapon', name: 'LB-7 Longbow', detail: 'Rifle · accurate, all-round', price: WEAPONS.rifle.price, damage: 34, fireRate: 'medium', range: 'long' },
  { id: 'shotgun', kind: 'weapon', name: 'BR-12 Breacher', detail: 'Shotgun · 8 pellets, close', price: WEAPONS.shotgun.price, damage: 96, fireRate: 'slow', range: 'short' },
  { id: 'marksman', kind: 'weapon', name: 'ND-50 Needle', detail: 'Marksman · one-shot headshot', price: WEAPONS.marksman.price, damage: 88, fireRate: 'slow', range: 'very long' },
  { id: 'grenade', kind: 'grenade', name: 'SPARK Frag', detail: 'Grenade · throw with G', price: GRENADE_DEF.price, damage: 90, fireRate: '-', range: 'blast' },
  { id: 'armor', kind: 'armor', name: 'Kevlar Vest', detail: 'Armor · absorbs half damage', price: ARMOR_DEF.price, damage: 0, fireRate: '-', range: '-' },
];

export function createMatch(callbacks) {
  const state = {
    phase: 'buy',
    phaseTime: BUY_SECONDS,
    round: 1,
    scoreEmber: 0,
    scoreCinder: 0,
    roundTime: ROUND_SECONDS,
    money: 800,
    kills: 0,
    deaths: 0,
    planted: false,
    plantSite: null,
    fuseLeft: 0,
    plantProgress: 0,
    roundWinner: null,
    winReason: '',
    matchWinner: null,
  };

  function setPhase(phase, time) {
    state.phase = phase;
    state.phaseTime = time;
  }

  function startRound() {
    state.planted = false;
    state.plantSite = null;
    state.fuseLeft = 0;
    state.plantProgress = 0;
    state.roundTime = ROUND_SECONDS;
    state.roundWinner = null;
    state.winReason = '';
    setPhase('buy', BUY_SECONDS);
    callbacks.onBuyPhase(state);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.roundWinner = winner;
    state.winReason = reason;
    if (winner === 'EMBER') {
      state.scoreEmber += 1;
      state.money += 300;
    } else {
      state.scoreCinder += 1;
      state.money += 200;
    }
    callbacks.onRoundEnd(state);
    if (state.scoreEmber >= WIN_ROUNDS || state.scoreCinder >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.scoreEmber > state.scoreCinder ? 'EMBER' : 'CINDER';
      setPhase('matchEnd', 0);
      callbacks.onMatchEnd(state);
    } else {
      setPhase('roundEnd', 4.5);
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function tick(dt) {
    if (state.phase === 'buy') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        setPhase('freeze', FREEZE_SECONDS);
        callbacks.onFreeze(state);
      }
    } else if (state.phase === 'freeze') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        setPhase('live', 0);
        callbacks.onLive(state);
      }
    } else if (state.phase === 'live') {
      if (state.planted) {
        state.fuseLeft -= dt;
        if (state.fuseLeft <= 0) {
          state.planted = false;
          callbacks.onDetonate(state);
          endRound('EMBER', 'Charge detonated at ' + state.plantSite);
          return;
        }
      } else {
        state.roundTime -= dt;
        if (state.roundTime <= 0) {
          endRound('CINDER', 'Time expired — site held');
          return;
        }
      }
    } else if (state.phase === 'roundEnd') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) nextRound();
    }
  }

  function plant(site) {
    if (state.phase !== 'live' || state.planted) return false;
    state.planted = true;
    state.plantSite = site;
    state.fuseLeft = FUSE_SECONDS;
    state.money += 300;
    callbacks.onPlant(state);
    return true;
  }

  function defuse() {
    if (!state.planted) return;
    state.planted = false;
    endRound('CINDER', 'Charge defused');
  }

  function addKillReward() {
    state.kills += 1;
    state.money += 150;
  }

  function buy(itemId) {
    const item = BUY_ITEMS.find((entry) => entry.id === itemId);
    if (!item || state.money < item.price) return null;
    state.money -= item.price;
    return item;
  }

  return {
    state,
    tick,
    startRound,
    endRound,
    nextRound,
    plant,
    defuse,
    addKillReward,
    buy,
    deployNow() {
      if (state.phase === 'buy') {
        setPhase('freeze', FREEZE_SECONDS);
        callbacks.onFreeze(state);
      }
    },
    resetMatch() {
      state.round = 1;
      state.scoreEmber = 0;
      state.scoreCinder = 0;
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.matchWinner = null;
      startRound();
    },
  };
}
