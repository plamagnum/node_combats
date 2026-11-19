/* exported openAvatarEditor, avatarSvg */
// Малювання SVG-аватара та редактор вигляду (стать, зачіска, головний убір, взуття тощо)
const AVATAR_LABELS = {
  gender: 'Стать',
  skin: 'Колір шкіри',
  hairStyle: 'Зачіска',
  hairColor: 'Колір волосся',
  hat: 'Головний убір',
  top: 'Одяг (верх)',
  pants: 'Низ',
  shoes: 'Взуття',
  accessory: 'Аксесуар',
};

const AVATAR_VALUE_LABELS = {
  male: 'Чоловік',
  female: 'Жінка',
  light: 'Світла',
  tan: 'Смаглява',
  brown: 'Коричнева',
  dark: 'Темна',
  none: 'Немає',
  short: 'Коротка',
  long: 'Довга',
  ponytail: 'Хвіст',
  black: 'Чорне',
  blond: 'Русяве',
  red: 'Руде',
  white: 'Біле',
  cap: 'Кепка',
  helmet: 'Шолом',
  wizard: 'Капелюх мага',
  crown: 'Корона',
  tunic: 'Туніка',
  armor: 'Броня',
  dress: 'Сукня',
  pants: 'Штани',
  skirt: 'Спідниця',
  boots: 'Чоботи',
  sandals: 'Сандалі',
  glasses: 'Окуляри',
  scarf: 'Шарф',
  cape: 'Плащ',
};

const SKIN_COLORS = { light: '#f6d5b8', tan: '#e0a97a', brown: '#a8714a', dark: '#6b4430' };
const HAIR_COLORS = {
  black: '#1c1c1c',
  brown: '#5a3a22',
  blond: '#d9b25f',
  red: '#b4441f',
  white: '#e8e8e8',
};

function avatarSvg(user, size = 140) {
  const a = {
    skin: 'light',
    hairStyle: 'short',
    hairColor: 'brown',
    hat: 'none',
    top: 'tunic',
    pants: 'pants',
    shoes: 'boots',
    accessory: 'none',
    ...(user.avatar || {}),
  };
  const female = user.gender === 'female';
  const skin = SKIN_COLORS[a.skin];
  const hair = HAIR_COLORS[a.hairColor];
  const p = [];
  const bodyW = female ? 30 : 38;
  const bx = 60 - bodyW / 2;

  if (a.accessory === 'cape') p.push('<path d="M38 74 L82 74 L90 150 L30 150 Z" fill="#8b1e2d"/>');
  if (a.hairStyle === 'long')
    p.push(`<rect x="39" y="30" width="42" height="52" rx="14" fill="${hair}"/>`);
  if (a.hairStyle === 'ponytail')
    p.push(`<ellipse cx="86" cy="52" rx="7" ry="18" fill="${hair}"/>`);

  // ноги
  p.push(
    `<rect x="46" y="112" width="11" height="34" fill="${skin}"/><rect x="63" y="112" width="11" height="34" fill="${skin}"/>`,
  );
  if (a.pants === 'pants')
    p.push(
      '<rect x="44" y="108" width="14" height="30" fill="#3b4a6b"/><rect x="62" y="108" width="14" height="30" fill="#3b4a6b"/><rect x="44" y="104" width="32" height="10" fill="#3b4a6b"/>',
    );
  if (a.pants === 'skirt') p.push('<path d="M42 106 L78 106 L84 134 L36 134 Z" fill="#7a3b6b"/>');

  // тулуб і руки
  p.push(
    `<rect x="${bx - 8}" y="76" width="9" height="32" rx="4" fill="${skin}"/><rect x="${bx + bodyW - 1}" y="76" width="9" height="32" rx="4" fill="${skin}"/>`,
  );
  p.push(`<rect x="${bx}" y="72" width="${bodyW}" height="40" rx="8" fill="${skin}"/>`);
  if (a.top === 'tunic')
    p.push(
      `<rect x="${bx}" y="72" width="${bodyW}" height="38" rx="8" fill="#3f7d4e"/><rect x="${bx - 8}" y="76" width="9" height="16" rx="4" fill="#3f7d4e"/><rect x="${bx + bodyW - 1}" y="76" width="9" height="16" rx="4" fill="#3f7d4e"/>`,
    );
  if (a.top === 'armor')
    p.push(
      `<rect x="${bx}" y="72" width="${bodyW}" height="40" rx="8" fill="#8a929c"/><rect x="${bx + 4}" y="78" width="${bodyW - 8}" height="6" fill="#aab2bb"/><rect x="${bx - 9}" y="72" width="12" height="10" rx="4" fill="#aab2bb"/><rect x="${bx + bodyW - 3}" y="72" width="12" height="10" rx="4" fill="#aab2bb"/>`,
    );
  if (a.top === 'dress')
    p.push(
      `<path d="M${bx} 74 L${bx + bodyW} 74 L${bx + bodyW + 10} 128 L${bx - 10} 128 Z" fill="#b0407a"/>`,
    );
  if (a.accessory === 'scarf')
    p.push(
      '<rect x="46" y="66" width="28" height="8" rx="4" fill="#d9a21b"/><rect x="66" y="70" width="7" height="18" fill="#d9a21b"/>',
    );

  // взуття
  if (a.shoes === 'boots')
    p.push(
      '<rect x="43" y="132" width="16" height="16" rx="3" fill="#4a2f1c"/><rect x="61" y="132" width="16" height="16" rx="3" fill="#4a2f1c"/>',
    );
  if (a.shoes === 'sandals')
    p.push(
      '<rect x="43" y="144" width="16" height="4" fill="#b5834a"/><rect x="61" y="144" width="16" height="4" fill="#b5834a"/>',
    );

  // голова
  p.push(
    `<rect x="52" y="60" width="16" height="10" fill="${skin}"/><circle cx="60" cy="44" r="22" fill="${skin}"/>`,
  );
  if (a.hairStyle !== 'none')
    p.push(`<path d="M37 44 A23 23 0 0 1 83 44 L83 38 Q60 22 37 38 Z" fill="${hair}"/>`);
  p.push(
    '<circle cx="52" cy="46" r="2.4" fill="#222"/><circle cx="68" cy="46" r="2.4" fill="#222"/>',
  );
  p.push(
    female
      ? '<path d="M54 56 Q60 61 66 56" stroke="#b03a48" stroke-width="2.2" fill="none"/>'
      : '<path d="M54 57 L66 57" stroke="#5a2d2d" stroke-width="2" fill="none"/>',
  );
  if (female) p.push('<path d="M48 41 l-3 -2 M72 41 l3 -2" stroke="#222" stroke-width="1.4"/>');
  if (a.accessory === 'glasses')
    p.push(
      '<circle cx="52" cy="46" r="6" fill="none" stroke="#222" stroke-width="1.6"/><circle cx="68" cy="46" r="6" fill="none" stroke="#222" stroke-width="1.6"/><path d="M58 46 h4" stroke="#222" stroke-width="1.6"/>',
    );

  // головні убори
  if (a.hat === 'cap')
    p.push(
      '<path d="M37 40 A23 23 0 0 1 83 40 Z" fill="#2f5fa8"/><rect x="60" y="36" width="30" height="6" rx="3" fill="#244b86"/>',
    );
  if (a.hat === 'helmet')
    p.push(
      '<path d="M36 46 A24 24 0 0 1 84 46 L84 38 A24 24 0 0 0 36 38 Z" fill="#9aa2ad"/><path d="M36 48 A24 26 0 0 1 84 48 L84 40 A24 22 0 0 0 36 40 Z" fill="#8a929c"/><rect x="57" y="18" width="6" height="14" fill="#c0392b"/>',
    );
  if (a.hat === 'wizard')
    p.push(
      '<path d="M30 36 L90 36 L60 -2 Z" fill="#4b3a8f" transform="translate(0 4)"/><rect x="30" y="36" width="60" height="6" rx="3" fill="#3a2d73"/>',
    );
  if (a.hat === 'crown')
    p.push('<path d="M42 28 L46 14 L54 24 L60 12 L66 24 L74 14 L78 28 Z" fill="#e6b422"/>');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 150" width="${size}" height="${Math.round(size * 1.25)}" role="img" aria-label="Аватар">${p.join('')}</svg>`;
}

let avatarOptionsCache = null;
let avatarEditorCtx = null;

async function openAvatarEditor(user, { saveUrl, onSaved }) {
  if (!avatarOptionsCache) {
    avatarOptionsCache = (await api('/api/game/avatar-options')).options;
  }
  avatarEditorCtx = { user, draft: { gender: user.gender, ...user.avatar }, saveUrl, onSaved };
  $('avatar-modal-title').textContent = `Вигляд: ${user.username}`;
  renderAvatarEditor();
  $('avatar-modal').classList.remove('hidden');
}

function renderAvatarEditor() {
  const { user, draft } = avatarEditorCtx;
  $('avatar-preview').innerHTML = avatarSvg({ ...user, gender: draft.gender, avatar: draft }, 200);
  const fields = $('avatar-fields');
  fields.innerHTML = '';
  Object.entries(avatarOptionsCache).forEach(([key, values]) => {
    const label = document.createElement('label');
    label.textContent = AVATAR_LABELS[key];
    const sel = document.createElement('select');
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = AVATAR_VALUE_LABELS[v] || v;
      sel.appendChild(opt);
    });
    sel.value = draft[key];
    sel.addEventListener('change', () => {
      draft[key] = sel.value;
      $('avatar-preview').innerHTML = avatarSvg(
        { ...user, gender: draft.gender, avatar: draft },
        200,
      );
    });
    label.appendChild(sel);
    fields.appendChild(label);
  });
}

$('btn-close-avatar').addEventListener('click', () => $('avatar-modal').classList.add('hidden'));
$('btn-save-avatar').addEventListener('click', async () => {
  const { saveUrl, draft, onSaved } = avatarEditorCtx;
  try {
    const res = await api(saveUrl, { method: 'PUT', body: JSON.stringify(draft) });
    $('avatar-modal').classList.add('hidden');
    showToast('Вигляд збережено');
    onSaved(res.user);
  } catch (err) {
    showToast(err.message, true);
  }
});
