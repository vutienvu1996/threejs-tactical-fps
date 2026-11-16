// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, kill feed,
// minimap, buy menu and the overlays. It never touches the simulation; main.js
// pushes numbers in and reads the buy/deploy callbacks out.
import { BUY_ITEMS } from './rounds.js';
import { SITES } from './map.js';

const OVERLAY_COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Round-based tactical FPS in the Kiln Yard. Plant the charge at FURNACE or CRANE, or eliminate the CINDER team. Accuracy beats speed — stop, aim, fire.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const playButton = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  const damageDir = $('damage-dir');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreEmber = $('score-ember');
  const scoreCinder = $('score-cinder');
  const roundLabel = $('round-label');
  const aliveEmber = $('alive-ember');
  const aliveCinder = $('alive-cinder');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const plantBar = $('plant-bar');
  const plantLabel = $('plant-label');
  const plantFill = $('plant-fill');
  const buyMenu = $('buy-menu');
  const buyGrid = $('buy-grid');
  const buyMoney = $('buy-money');
  const deployButton = $('deploy');
  const minimap = $('minimap');
  const minimapCtx = minimap.getContext('2d');
  const spectateNote = $('spectate-note');

  let hitTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastHealth = -1;
  let lastArmor = -1;

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(value) {
      const hp = Math.max(0, Math.round(value));
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthNum.textContent = String(hp);
      healthFill.style.width = `${hp}%`;
      healthFill.classList.toggle('low', hp <= 30);
    },
    setArmor(value) {
      const armor = Math.max(0, Math.round(value));
      if (armor === lastArmor) return;
      lastArmor = armor;
      armorNum.textContent = String(armor);
    },
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      const money = Math.round(value);
      if (money === lastMoney) return;
      lastMoney = money;
      moneyValue.textContent = `$${money}`;
      buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds, planted, fuseLeft) {
      timerValue.textContent = planted ? formatTime(fuseLeft) : formatTime(seconds);
      timerValue.classList.toggle('planted', planted);
    },
    setScore(ember, cinder, round) {
      scoreEmber.textContent = String(ember);
      scoreCinder.textContent = String(cinder);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setAlive(ember, cinder) {
      aliveEmber.textContent = `EMBER ${ember} alive`;
      aliveCinder.textContent = `CINDER ${cinder} alive`;
    },
    setCrosshairGap(pixels) {
      crosshair.style.setProperty('--gap', `${pixels.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 110) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    hurtFlash() {
      vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => vignette.classList.remove('on'), 220);
    },
    damageFrom(angleRadians) {
      damageDir.style.transform = `translate(-50%, -50%) rotate(${angleRadians}rad)`;
      damageDir.classList.add('on');
      setTimeout(() => damageDir.classList.remove('on'), 500);
    },
    killfeed(html) {
      const entry = document.createElement('div');
      entry.className = 'feed-entry';
      entry.innerHTML = html;
      killfeed.prepend(entry);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => entry.classList.add('fade'), 4200);
      setTimeout(() => entry.remove(), 5000);
    },
    showBanner(title, sub, good) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.classList.toggle('good', good);
      banner.classList.toggle('bad', !good);
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, 3400);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showPlant(label, progress) {
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantBar.hidden = false;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showSpectate(text) {
      spectateNote.textContent = text;
      spectateNote.hidden = false;
    },
    hideSpectate() {
      spectateNote.hidden = true;
    },
    showBuy(money, ownedWeapons, grenades, hasArmor, callbacks) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${Math.round(money)}`;
      buyGrid.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const card = document.createElement('div');
        card.className = 'buy-card';
        let state = '';
        let disabled = false;
        if (item.kind === 'weapon') {
          if (ownedWeapons.includes(item.id)) {
            state = 'OWNED';
            disabled = true;
          }
        } else if (item.kind === 'grenade') {
          if (grenades >= 2) {
            state = `OWNED ×${grenades}`;
            disabled = true;
          } else if (grenades > 0) {
            state = `OWNED ×${grenades}`;
          }
        } else if (item.kind === 'armor') {
          if (hasArmor) {
            state = 'OWNED';
            disabled = true;
          }
        }
        if (!disabled && money < item.price) disabled = true;
        card.innerHTML = `
          <div class="buy-name">${item.name}</div>
          <div class="buy-detail">${item.detail}</div>
          <div class="buy-stats"><span>DMG ${item.damage}</span><span>${item.fireRate}</span><span>${item.range}</span></div>
          <button type="button" ${disabled ? 'disabled' : ''}>${state || '$' + item.price}</button>`;
        const button = card.querySelector('button');
        button.addEventListener('click', () => callbacks.onBuy(item.id));
        buyGrid.appendChild(card);
      }
      deployButton.onclick = () => callbacks.onDeploy();
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, data) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = mode === 'matchEnd' ? data.title : text.title;
      overlayCopy.textContent = mode === 'matchEnd' ? data.copy : text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    drawMinimap(map, player, bots, now) {
      const ctx = minimapCtx;
      const width = minimap.width;
      const height = minimap.height;
      const scaleX = width / 50;
      const scaleZ = height / 38;
      const toX = (x) => (x + 25) * scaleX;
      const toY = (z) => (z + 19) * scaleZ;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#12151b';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#2b313d';
      for (const [x1, z1, x2, z2] of map.wallRects) {
        if (x2 - x1 > 20 || z2 - z1 > 20) continue; // skip the floor slab
        ctx.fillRect(toX(x1), toY(z1), (x2 - x1) * scaleX, (z2 - z1) * scaleZ);
      }
      for (const [key, site] of Object.entries(SITES)) {
        ctx.beginPath();
        ctx.arc(toX(site.center.x), toY(site.center.z), 7, 0, Math.PI * 2);
        ctx.fillStyle = key === 'A' ? '#ff6b2c' : '#3ec6b8';
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#101318';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(key, toX(site.center.x), toY(site.center.z));
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (bot.ally) {
          ctx.fillStyle = '#f5a524';
          ctx.beginPath();
          ctx.arc(toX(bot.body.position.x), toY(bot.body.position.z), 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (now - bot.lastShotAt < 2.5) {
          ctx.fillStyle = '#e5484d';
          ctx.beginPath();
          ctx.arc(toX(bot.body.position.x), toY(bot.body.position.z), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (player.state.alive) {
        const px = toX(player.body.position.x);
        const py = toY(player.body.position.z);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.atan2(-Math.sin(player.state.yaw), Math.cos(player.state.yaw)));
        ctx.fillStyle = '#ece7db';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  };
}
