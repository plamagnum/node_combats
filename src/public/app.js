const state = {
  token: localStorage.getItem('combats_token') || '',
  user: null,
  bots: [],
  activeBattle: null,
  history: [],
  shopItems: [],
  shopFilter: 'all',
  pvpMyBattle: null,
  pvpChallenges: [],
  pvpHistory: [],
  pvpPollTimer: null,
  currentTab: 'arena',
  authMode: 'login',
  adminUsers: [],
  adminBots: [],
  adminItems: [],
};

const STAT_LABELS = {
  strength: 'Сила',
  agility: 'Спритність',
  intuition: 'Інтуїція',
  endurance: 'Витривалість',
};

const SLOT_LABELS = {
  weapon: 'Зброя',
  armor: 'Броня',
  helmet: 'Шолом',
  ring: 'Кільце',
};

const $ = (id) => document.getElementById(id);

function showToast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Помилка запиту');
  }
  return data;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBonuses(b = {}) {
  const parts = [];
  if (b.damageMin || b.damageMax) parts.push(`Шкода +${b.damageMin || 0}–${b.damageMax || 0}`);
  if (b.armor) parts.push(`Броня +${b.armor}`);
  if (b.strength) parts.push(`Сил +${b.strength}`);
  if (b.agility) parts.push(`Спр +${b.agility}`);
  if (b.intuition) parts.push(`Інт +${b.intuition}`);
  if (b.endurance) parts.push(`Вит +${b.endurance}`);
  return parts.length ? parts.join(' • ') : 'Без бонусів';
}

// ==================== AUTH ====================

function setAuthMode(mode) {
  state.authMode = mode;
  $('tab-login').classList.toggle('active', mode === 'login');
  $('tab-register').classList.toggle('active', mode === 'register');
  $('auth-submit').textContent =
    mode === 'login' ? 'Увійти на арену' : 'Створити персонажа і грати';
}

$('tab-login').addEventListener('click', () => setAuthMode('login'));
$('tab-register').addEventListener('click', () => setAuthMode('register'));

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  try {
    const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('combats_token', data.token);
    showToast(state.authMode === 'login' ? 'Вітаємо на арені!' : 'Персонажа створено!');
    await enterApp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-logout').addEventListener('click', () => {
  stopPvpPolling();
  localStorage.removeItem('combats_token');
  state.token = '';
  state.user = null;
  state.activeBattle = null;
  state.pvpMyBattle = null;
  $('app-screen').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
});

// ==================== NAVIGATION ====================

function switchMainTab(tab) {
  state.currentTab = tab;
  ['arena', 'pvp', 'shop', 'admin'].forEach((t) => {
    $(`nav-${t}`).classList.toggle('active', t === tab);
    $(`view-${t}`).classList.toggle('hidden', t !== tab);
  });

  if (tab === 'pvp') {
    loadPvpState();
    startPvpPolling();
  } else {
    stopPvpPolling();
  }

  if (tab === 'shop') {
    loadShop();
  }
  if (tab === 'admin') {
    loadAdminData();
  }
}

$('nav-arena').addEventListener('click', () => switchMainTab('arena'));
$('nav-pvp').addEventListener('click', () => switchMainTab('pvp'));
$('nav-shop').addEventListener('click', () => switchMainTab('shop'));
$('nav-admin').addEventListener('click', () => switchMainTab('admin'));

// ==================== CHARACTER & ARENA (PvE) ====================

function renderCharacter() {
  const u = state.user;
  if (!u) return;

  const eff = u.effectiveStats || { ...u.stats, damageMin: 0, damageMax: 0, armor: 0 };

  $('header-user').textContent = `${u.username} • Рів. ${u.level} • ${u.gold} зол. (${u.role})`;
  $('nav-admin').classList.toggle('hidden', u.role !== 'admin');

  $('char-name').textContent = u.username;
  $('char-level').textContent = `Рівень ${u.level}`;
  $('char-hp-text').textContent = `${u.hp} / ${u.maxHp}`;
  $('char-hp-bar').style.width = `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`;

  const nextXp = u.nextLevelXp || u.level * 100;
  $('char-xp-text').textContent = `${u.xp} / ${nextXp}`;
  $('char-xp-bar').style.width = `${Math.max(0, Math.min(100, (u.xp / nextXp) * 100))}%`;

  $('char-gold').textContent = u.gold;
  $('char-wins').textContent = u.wins;
  $('char-losses').textContent = u.losses;
  $('char-free-stats').textContent = `Вільних: ${u.freeStats}`;

  const list = $('char-stats-list');
  list.innerHTML = '';
  Object.entries(STAT_LABELS).forEach(([key, label]) => {
    const baseVal = u.stats[key];
    const bonus = (eff[key] || baseVal) - baseVal;
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${label}</span>
      <div>
        <strong>${baseVal}</strong>${bonus > 0 ? ` <span class="bonus-tag">(+${bonus})</span>` : ''}
        ${
          u.freeStats > 0
            ? `<button class="btn btn-primary btn-xs" data-alloc="${key}">+1</button>`
            : ''
        }
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('[data-alloc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api('/api/game/stats/allocate', {
          method: 'POST',
          body: JSON.stringify({ stat: btn.dataset.alloc }),
        });
        state.user = data.user;
        renderCharacter();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  const minDmg = Math.max(3, Math.round(eff.strength * 1.5) + (eff.damageMin || 0));
  const maxDmg = Math.max(minDmg, Math.round(eff.strength * 2.4 + 4) + (eff.damageMax || 0));
  $('char-combat-summary').innerHTML = `
    <span>Шкода: <strong>${minDmg}–${maxDmg}</strong></span>
    <span>Броня: <strong>${eff.armor || 0}</strong></span>
  `;

  const eqList = $('char-equipped-list');
  eqList.innerHTML = '';
  Object.entries(SLOT_LABELS).forEach(([slot, label]) => {
    const item = u.equipment?.[slot];
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="muted">${label}</span>
      <strong>${item ? escapeHtml(item.name) : '—'}</strong>
    `;
    eqList.appendChild(li);
  });
}

$('btn-heal').addEventListener('click', async () => {
  try {
    const data = await api('/api/game/heal', { method: 'POST' });
    state.user = data.user;
    renderCharacter();
    showToast('Здоров\'я повністю відновлено!');
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderBots() {
  const grid = $('bots-grid');
  grid.innerHTML = '';
  if (!state.bots.length) {
    grid.innerHTML = '<div class="muted">Немає активних ботів. Додайте їх в адмін-панелі.</div>';
    return;
  }

  state.bots.forEach((bot) => {
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(bot.name)}</h3>
        <div class="bot-meta">${escapeHtml(bot.title)} • Рівень ${bot.level}</div>
        <div class="bot-meta">HP: ${bot.maxHp} | Сил: ${bot.stats.strength} | Спр: ${bot.stats.agility} | Інт: ${bot.stats.intuition}</div>
        <div class="bot-meta">Нагорода: +${bot.rewardXp} XP, +${bot.rewardGold} золота</div>
      </div>
      <button class="btn btn-primary btn-sm" data-fight-bot="${bot._id}">В бій!</button>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-fight-bot]').forEach((btn) => {
    btn.addEventListener('click', () => startBattle(btn.dataset.fightBot));
  });
}

function renderHistory() {
  const container = $('battle-history');
  container.innerHTML = '';
  if (!state.history.length) {
    container.innerHTML = '<div class="muted">Історія боїв поки порожня.</div>';
    return;
  }
  const statusMap = {
    won: { label: 'Перемога', cls: 'status-won' },
    lost: { label: 'Поразка', cls: 'status-lost' },
    draw: { label: 'Нічия', cls: 'status-draw' },
  };
  state.history.forEach((item) => {
    const st = statusMap[item.status] || { label: item.status, cls: '' };
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span>vs ${escapeHtml(item.botName)} [Рів. ${item.botLevel}] (${item.round} раунд.)</span>
      <span class="${st.cls}">${st.label}${item.reward?.xp ? ` (+${item.reward.xp} XP)` : ''}</span>
    `;
    container.appendChild(div);
  });
}

function renderBattle() {
  const battle = state.activeBattle;
  if (!battle) {
    $('bot-lobby').classList.remove('hidden');
    $('battle-arena').classList.add('hidden');
    return;
  }

  $('bot-lobby').classList.add('hidden');
  $('battle-arena').classList.remove('hidden');

  $('battle-round').textContent = battle.round;
  $('vs-player-name').textContent = `${state.user.username} [Рів. ${state.user.level}]`;
  $('vs-player-hp').textContent = `${battle.playerHp} / ${battle.playerMaxHp}`;
  $('vs-player-bar').style.width = `${Math.max(0, (battle.playerHp / battle.playerMaxHp) * 100)}%`;

  $('vs-bot-name').textContent = `${battle.botName} [Рів. ${battle.botLevel}]`;
  $('vs-bot-hp').textContent = `${battle.botHp} / ${battle.botMaxHp}`;
  $('vs-bot-bar').style.width = `${Math.max(0, (battle.botHp / battle.botMaxHp) * 100)}%`;

  const isActive = battle.status === 'active';
  $('battle-controls').classList.toggle('hidden', !isActive);
  $('battle-action-row').classList.toggle('hidden', !isActive);
  $('btn-flee').classList.toggle('hidden', !isActive);
  $('battle-finish-banner').classList.toggle('hidden', isActive);

  if (!isActive) {
    if (battle.status === 'won') {
      $('battle-finish-text').textContent = `Перемога! +${battle.reward?.xp || 0} XP та +${battle.reward?.gold || 0} золота.`;
    } else if (battle.status === 'lost') {
      $('battle-finish-text').textContent = 'Поразка! Відновіть HP та спробуйте знову.';
    } else {
      $('battle-finish-text').textContent = 'Нічия!';
    }
  }

  const logEl = $('combat-log');
  logEl.innerHTML = '';
  [...battle.log].reverse().forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry log-${entry.type}`;
    row.textContent = `[Раунд ${entry.round}] ${entry.text}`;
    logEl.appendChild(row);
  });
}

async function startBattle(botId) {
  try {
    const data = await api('/api/game/battles/start', {
      method: 'POST',
      body: JSON.stringify({ botId }),
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
}

$('btn-turn').addEventListener('click', async () => {
  if (!state.activeBattle) return;
  const attackZone = document.querySelector('input[name="attackZone"]:checked')?.value;
  const blockPair = document.querySelector('input[name="blockPair"]:checked')?.value;
  try {
    const data = await api(`/api/game/battles/${state.activeBattle._id}/turn`, {
      method: 'POST',
      body: JSON.stringify({ attackZone, blockPair }),
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-flee').addEventListener('click', async () => {
  if (!state.activeBattle) return;
  try {
    const data = await api(`/api/game/battles/${state.activeBattle._id}/flee`, {
      method: 'POST',
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-back-lobby').addEventListener('click', async () => {
  state.activeBattle = null;
  await loadGameState();
});

// ==================== SHOP & EQUIPMENT ====================

async function loadShop() {
  try {
    const [meData, shopData] = await Promise.all([
      api('/api/auth/me'),
      api('/api/shop/items'),
    ]);
    state.user = meData.user;
    state.shopItems = shopData.items;
    renderCharacter();
    renderShopAndGear();
  } catch (err) {
    showToast(err.message, true);
  }
}

$('shop-filters').querySelectorAll('[data-slot-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.shopFilter = btn.dataset.slotFilter;
    $('shop-filters')
      .querySelectorAll('[data-slot-filter]')
      .forEach((b) => b.classList.toggle('active', b === btn));
    renderShopAndGear();
  });
});

function renderShopAndGear() {
  const u = state.user;
  if (!u) return;

  $('shop-gold').textContent = u.gold;

  // Equipped slots
  const slotsEl = $('equipment-slots');
  slotsEl.innerHTML = '';
  Object.entries(SLOT_LABELS).forEach(([slot, label]) => {
    const item = u.equipment?.[slot];
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <div>
        <div class="muted">${label}</div>
        <strong>${item ? escapeHtml(item.name) : 'Порожньо'}</strong>
        ${item ? `<div class="bonus-tag">${formatBonuses(item.bonuses)}</div>` : ''}
      </div>
      ${
        item
          ? `<button class="btn btn-ghost btn-xs" data-unequip="${slot}">Зняти</button>`
          : ''
      }
    `;
    slotsEl.appendChild(row);
  });

  slotsEl.querySelectorAll('[data-unequip]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/shop/unequip/${btn.dataset.unequip}`, { method: 'POST' });
        state.user = res.user;
        renderCharacter();
        renderShopAndGear();
        showToast('Спорядження знято');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  // Inventory
  const invEl = $('inventory-list');
  invEl.innerHTML = '';
  const inv = u.inventory || [];
  if (!inv.length) {
    invEl.innerHTML = '<div class="muted">Інвентар порожній. Купіть спорядження у лавці!</div>';
  } else {
    inv.forEach((item) => {
      if (!item || !item._id) return;
      const equippedId = u.equipment?.[item.slot]?._id;
      const isEquipped = equippedId && equippedId === item._id;
      const row = document.createElement('div');
      row.className = 'inv-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name)}</strong> <span class="muted">(${SLOT_LABELS[item.slot]})</span>
          <div class="bonus-tag">${formatBonuses(item.bonuses)}</div>
        </div>
        <div class="action-group">
          ${
            isEquipped
              ? '<span class="badge badge-gold">Одягнено</span>'
              : `<button class="btn btn-primary btn-xs" data-equip="${item._id}">Одягнути</button>`
          }
          <button class="btn btn-danger btn-xs" data-sell="${item._id}">Продати (+${Math.max(1, Math.floor(item.price * 0.5))})</button>
        </div>
      `;
      invEl.appendChild(row);
    });

    invEl.querySelectorAll('[data-equip]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/shop/equip/${btn.dataset.equip}`, { method: 'POST' });
          state.user = res.user;
          renderCharacter();
          renderShopAndGear();
          showToast('Предмет одягнено!');
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    invEl.querySelectorAll('[data-sell]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/shop/sell/${btn.dataset.sell}`, { method: 'POST' });
          state.user = res.user;
          renderCharacter();
          renderShopAndGear();
          showToast(`Продано за +${res.refund} золота`);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  // Shop catalog
  const grid = $('shop-items-grid');
  grid.innerHTML = '';
  const ownedIds = new Set(inv.map((i) => i?._id).filter(Boolean));
  const items = state.shopItems.filter(
    (it) => state.shopFilter === 'all' || it.slot === state.shopFilter
  );

  items.forEach((item) => {
    const owned = ownedIds.has(item._id);
    const canAfford = u.gold >= item.price;
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="bot-meta">${SLOT_LABELS[item.slot]} • Мін. рівень: ${item.minLevel}</div>
        <div class="bonus-tag" style="margin: 4px 0;">${formatBonuses(item.bonuses)}</div>
        <div class="bot-meta">${escapeHtml(item.description || '')}</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <strong>${item.price} зол.</strong>
        <button class="btn btn-primary btn-sm" data-buy="${item._id}" ${owned || !canAfford ? 'disabled' : ''}>
          ${owned ? 'В інвентарі' : canAfford ? 'Купити' : 'Мало золота'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/shop/buy/${btn.dataset.buy}`, { method: 'POST' });
        state.user = res.user;
        renderCharacter();
        renderShopAndGear();
        showToast(`Куплено: ${res.item.name}`);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

// ==================== PvP ARENA ====================

function startPvpPolling() {
  stopPvpPolling();
  state.pvpPollTimer = setInterval(() => {
    if (state.currentTab === 'pvp' && state.token) {
      loadPvpState(true);
    }
  }, 2500);
}

function stopPvpPolling() {
  if (state.pvpPollTimer) {
    clearInterval(state.pvpPollTimer);
    state.pvpPollTimer = null;
  }
}

async function loadPvpState(silent = false) {
  try {
    const data = await api('/api/pvp/state');
    state.user = data.user;
    state.pvpMyBattle = data.myBattle;
    state.pvpChallenges = data.openChallenges;
    state.pvpHistory = data.history;
    renderCharacter();
    renderPvp();
  } catch (err) {
    if (!silent) showToast(err.message, true);
  }
}

function renderPvp() {
  const b = state.pvpMyBattle;

  if (b && (b.status === 'active' || b.status === 'finished')) {
    $('pvp-lobby').classList.add('hidden');
    $('pvp-arena').classList.remove('hidden');

    $('pvp-round').textContent = b.round;
    $('pvp-c-name').textContent = `${b.challengerName} [Рів. ${b.challengerLevel}]`;
    $('pvp-c-hp').textContent = `${b.challengerHp} / ${b.challengerMaxHp}`;
    $('pvp-c-bar').style.width = `${Math.max(0, (b.challengerHp / b.challengerMaxHp) * 100)}%`;

    $('pvp-o-name').textContent = `${b.opponentName} [Рів. ${b.opponentLevel}]`;
    $('pvp-o-hp').textContent = `${b.opponentHp} / ${b.opponentMaxHp}`;
    $('pvp-o-bar').style.width = `${Math.max(0, (b.opponentHp / b.opponentMaxHp) * 100)}%`;

    const isActive = b.status === 'active';
    $('btn-pvp-flee').classList.toggle('hidden', !isActive);
    $('pvp-controls').classList.toggle('hidden', !isActive || b.myMoveSubmitted);
    $('pvp-action-row').classList.toggle('hidden', !isActive || b.myMoveSubmitted);
    $('pvp-finish-banner').classList.toggle('hidden', isActive);

    const statusBanner = $('pvp-status-banner');
    if (isActive) {
      statusBanner.classList.remove('hidden');
      if (b.myMoveSubmitted) {
        statusBanner.textContent = '⏳ Ваш хід прийнято. Очікуємо вибір суперника...';
      } else if (b.opponentMoveSubmitted) {
        statusBanner.textContent = '⚡ Суперник уже зробив хід! Оберіть удар і блок.';
      } else {
        statusBanner.textContent = '⚔️ Оберіть зону удару та блок для цього раунду.';
      }
    } else {
      statusBanner.classList.add('hidden');
      $('pvp-finish-text').textContent = b.isDraw
        ? 'PvP дуель завершилась нічиєю!'
        : `Переможець дуелі: ${b.winnerName}!`;
    }

    const logEl = $('pvp-log');
    logEl.innerHTML = '';
    [...b.log].reverse().forEach((entry) => {
      const row = document.createElement('div');
      row.className = `log-entry log-${entry.type}`;
      row.textContent = `[Раунд ${entry.round}] ${entry.text}`;
      logEl.appendChild(row);
    });
    return;
  }

  $('pvp-lobby').classList.remove('hidden');
  $('pvp-arena').classList.add('hidden');

  const isWaiting = Boolean(b && b.status === 'waiting');
  $('pvp-waiting-box').classList.toggle('hidden', !isWaiting);
  $('btn-pvp-create').disabled = isWaiting;

  const list = $('pvp-challenges-list');
  list.innerHTML = '';
  if (!state.pvpChallenges.length) {
    list.innerHTML = '<div class="muted">Відкритих викликів поки немає. Киньте виклик першим або відкрийте гру в іншому вікні під другим гравцем!</div>';
  } else {
    state.pvpChallenges.forEach((ch) => {
      const isMine = ch.challengerId === state.user.id;
      const card = document.createElement('div');
      card.className = 'bot-card';
      card.innerHTML = `
        <div>
          <h3>${escapeHtml(ch.challengerName)}</h3>
          <div class="bot-meta">Рівень ${ch.challengerLevel} • HP: ${ch.challengerHp}/${ch.challengerMaxHp}</div>
        </div>
        ${
          isMine
            ? '<span class="badge badge-gold">Ваша заявка</span>'
            : `<button class="btn btn-primary btn-sm" data-accept-pvp="${ch.id}">Прийняти бій!</button>`
        }
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('[data-accept-pvp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/pvp/challenges/${btn.dataset.acceptPvp}/accept`, {
            method: 'POST',
          });
          state.pvpMyBattle = res.battle;
          renderPvp();
          showToast('PvP дуель розпочато!');
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  const histEl = $('pvp-history');
  histEl.innerHTML = '';
  if (!state.pvpHistory.length) {
    histEl.innerHTML = '<div class="muted">Ви ще не брали участі у PvP дуелях.</div>';
  } else {
    state.pvpHistory.forEach((h) => {
      const won = h.winnerId === state.user.id;
      const cls = h.isDraw ? 'status-draw' : won ? 'status-won' : 'status-lost';
      const label = h.isDraw ? 'Нічия' : won ? 'Перемога' : 'Поразка';
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <span>${escapeHtml(h.challengerName)} vs ${escapeHtml(h.opponentName || '—')} (${h.round} раунд.)</span>
        <span class="${cls}">${label}</span>
      `;
      histEl.appendChild(div);
    });
  }
}

$('btn-pvp-create').addEventListener('click', async () => {
  try {
    const res = await api('/api/pvp/challenges', { method: 'POST' });
    state.pvpMyBattle = res.battle;
    showToast('Заявку на PvP створено');
    await loadPvpState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-cancel').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  try {
    await api(`/api/pvp/challenges/${state.pvpMyBattle.id}/cancel`, { method: 'POST' });
    state.pvpMyBattle = null;
    showToast('Заявку скасовано');
    await loadPvpState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-refresh').addEventListener('click', () => loadPvpState());

$('btn-pvp-turn').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  const attackZone = document.querySelector('input[name="pvpAttackZone"]:checked')?.value;
  const blockPair = document.querySelector('input[name="pvpBlockPair"]:checked')?.value;
  try {
    const res = await api(`/api/pvp/battles/${state.pvpMyBattle.id}/turn`, {
      method: 'POST',
      body: JSON.stringify({ attackZone, blockPair }),
    });
    state.pvpMyBattle = res.battle;
    state.user = res.user;
    renderCharacter();
    renderPvp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-flee').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  try {
    const res = await api(`/api/pvp/battles/${state.pvpMyBattle.id}/flee`, { method: 'POST' });
    state.pvpMyBattle = res.battle;
    state.user = res.user;
    renderCharacter();
    renderPvp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-back').addEventListener('click', async () => {
  state.pvpMyBattle = null;
  await loadPvpState();
});

// ==================== ADMIN PANEL (CRUD + UPGRADES) ====================

function switchAdminSubtab(sub) {
  ['users', 'bots', 'items'].forEach((s) => {
    $(`admin-tab-${s}`).classList.toggle('active', s === sub);
    $(`admin-${s}-section`).classList.toggle('hidden', s !== sub);
  });
}

$('admin-tab-users').addEventListener('click', () => switchAdminSubtab('users'));
$('admin-tab-bots').addEventListener('click', () => switchAdminSubtab('bots'));
$('admin-tab-items').addEventListener('click', () => switchAdminSubtab('items'));

$('btn-toggle-create-user').addEventListener('click', () => {
  $('create-user-form').classList.toggle('hidden');
});
$('btn-toggle-create-bot').addEventListener('click', () => {
  $('create-bot-form').classList.toggle('hidden');
});
$('btn-toggle-create-item').addEventListener('click', () => {
  $('create-item-form').classList.toggle('hidden');
});

async function loadAdminData() {
  try {
    const [uData, bData, iData] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/bots'),
      api('/api/admin/items'),
    ]);
    state.adminUsers = uData.users;
    state.adminBots = bData.bots;
    state.adminItems = iData.items;
    renderAdminUsers();
    renderAdminBots();
    renderAdminItems();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderAdminUsers() {
  const tbody = $('admin-users-tbody');
  tbody.innerHTML = '';

  state.adminUsers.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td><span class="badge">${u.role}</span></td>
      <td>Рів. ${u.level}<br/><span class="muted">${u.hp}/${u.maxHp} HP</span></td>
      <td>${u.gold}</td>
      <td>Сил: ${u.stats.strength} | Спр: ${u.stats.agility} | Інт: ${u.stats.intuition} | Вит: ${u.stats.endurance}</td>
      <td>
        <div class="upgrade-group">
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="strength">+1 Сил</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="agility">+1 Спр</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="intuition">+1 Інт</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="endurance">+1 Вит</button>
          <button class="btn btn-primary btn-xs" data-upg-id="${u.id}" data-upg-key="level">+1 Рів</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="gold">+100 Зол</button>
        </div>
      </td>
      <td>
        <div class="action-group">
          <button class="btn btn-ghost btn-xs" data-edit-user="${u.id}">Ред.</button>
          <button class="btn btn-danger btn-xs" data-del-user="${u.id}">Видал.</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-upg-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.upgId;
      const key = btn.dataset.upgKey;
      const delta = key === 'gold' ? 100 : 1;
      try {
        const res = await api(`/api/admin/users/${id}/upgrade`, {
          method: 'POST',
          body: JSON.stringify({ [key]: delta, fullHeal: true }),
        });
        if (state.user && state.user.id === id) {
          state.user = res.user;
          renderCharacter();
        }
        showToast(`Покращено ${key} (+${delta}) для ${res.user.username}`);
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = state.adminUsers.find((x) => x.id === btn.dataset.editUser);
      if (!target) return;
      openEditModal(target);
    });
  });

  tbody.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цього персонажа?')) return;
      try {
        await api(`/api/admin/users/${btn.dataset.delUser}`, { method: 'DELETE' });
        showToast('Персонажа видалено');
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
        role: fd.get('role'),
        level: Number(fd.get('level')),
        gold: Number(fd.get('gold')),
        stats: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Персонажа створено');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

function openEditModal(user) {
  const form = $('edit-user-form');
  form.id.value = user.id;
  form.username.value = user.username;
  form.password.value = '';
  form.role.value = user.role;
  form.level.value = user.level;
  form.gold.value = user.gold;
  form.freeStats.value = user.freeStats;
  form.strength.value = user.stats.strength;
  form.agility.value = user.stats.agility;
  form.intuition.value = user.stats.intuition;
  form.endurance.value = user.stats.endurance;
  $('edit-modal-title').textContent = `Редагування: ${user.username}`;
  $('edit-modal').classList.remove('hidden');
}

$('btn-close-modal').addEventListener('click', () => {
  $('edit-modal').classList.add('hidden');
});

$('edit-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  try {
    const res = await api(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value || undefined,
        role: form.role.value,
        level: Number(form.level.value),
        gold: Number(form.gold.value),
        freeStats: Number(form.freeStats.value),
        stats: {
          strength: Number(form.strength.value),
          agility: Number(form.agility.value),
          intuition: Number(form.intuition.value),
          endurance: Number(form.endurance.value),
        },
        fullHeal: true,
      }),
    });
    if (state.user && state.user.id === id) {
      state.user = res.user;
      renderCharacter();
    }
    $('edit-modal').classList.add('hidden');
    showToast('Зміни збережено');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderAdminBots() {
  const tbody = $('admin-bots-tbody');
  tbody.innerHTML = '';

  state.adminBots.forEach((b) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${escapeHtml(b.title)}</td>
      <td>Рів. ${b.level} / ${b.maxHp} HP</td>
      <td>+${b.rewardXp} XP, +${b.rewardGold} зол.</td>
      <td>Сил: ${b.stats.strength} | Спр: ${b.stats.agility} | Інт: ${b.stats.intuition} | Вит: ${b.stats.endurance}</td>
      <td>
        <div class="action-group">
          <button class="btn btn-ghost btn-xs" data-buff-bot="${b._id}">+2 Стати</button>
          <button class="btn btn-danger btn-xs" data-del-bot="${b._id}">Видал.</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-buff-bot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bot = state.adminBots.find((x) => x._id === btn.dataset.buffBot);
      if (!bot) return;
      try {
        await api(`/api/admin/bots/${bot._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            level: bot.level + 1,
            stats: {
              strength: bot.stats.strength + 2,
              agility: bot.stats.agility + 2,
              intuition: bot.stats.intuition + 2,
              endurance: bot.stats.endurance + 2,
            },
          }),
        });
        showToast(`Бота ${bot.name} підсилено`);
        await loadAdminData();
        await loadGameState();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-del-bot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цього бота?')) return;
      try {
        await api(`/api/admin/bots/${btn.dataset.delBot}`, { method: 'DELETE' });
        showToast('Бота видалено');
        await loadAdminData();
        await loadGameState();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-bot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/bots', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        title: fd.get('title'),
        level: Number(fd.get('level')),
        rewardXp: Number(fd.get('rewardXp')),
        rewardGold: Number(fd.get('rewardGold')),
        stats: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Нового бота створено');
    await loadAdminData();
    await loadGameState();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderAdminItems() {
  const tbody = $('admin-items-tbody');
  tbody.innerHTML = '';
  state.adminItems.forEach((it) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(it.name)}</strong></td>
      <td>${SLOT_LABELS[it.slot] || it.slot}</td>
      <td>${it.price} зол. / Рів. ${it.minLevel}</td>
      <td class="bonus-tag">${formatBonuses(it.bonuses)}</td>
      <td><button class="btn btn-danger btn-xs" data-del-item="${it._id}">Видал.</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-del-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цей предмет із магазину?')) return;
      try {
        await api(`/api/admin/items/${btn.dataset.delItem}`, { method: 'DELETE' });
        showToast('Предмет видалено');
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/items', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        slot: fd.get('slot'),
        price: Number(fd.get('price')),
        minLevel: Number(fd.get('minLevel')),
        description: fd.get('description'),
        bonuses: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
          damageMin: Number(fd.get('damageMin')),
          damageMax: Number(fd.get('damageMax')),
          armor: Number(fd.get('armor')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Предмет додано до магазину');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== BOOTSTRAP ====================

async function loadGameState() {
  const [botsData, battlesData] = await Promise.all([
    api('/api/game/bots'),
    api('/api/game/battles/state'),
  ]);
  state.bots = botsData.bots;
  state.activeBattle = battlesData.activeBattle;
  state.history = battlesData.history;
  renderBots();
  renderHistory();
  renderBattle();
}

async function enterApp() {
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  renderCharacter();
  await loadGameState();
}

async function init() {
  if (!state.token) return;
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    await enterApp();
  } catch {
    localStorage.removeItem('combats_token');
    state.token = '';
  }
}

init();
