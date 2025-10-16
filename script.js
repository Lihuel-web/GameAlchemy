// script.js
const dataPath = 'alchemy-recipes.json';

// ===== Estado de juego y datos =====
let discoveredElements = loadGame() || {
  base: ["Singularidad", "Expansión"],
  combined: []
};

let recipesRaw = [];
let recipeMap = new Map();        // "A|B" -> outputs[]
let producers = new Map();        // output -> Array<[A,B]>
let allPossibleElements = [];
let definitions = {};
let kidDefinitions = {};
let enDefinitions = {};
let enKidDefinitions = {};
let justifications = {};
let enJustifications = {};
let aliases = {};
let storySegments = [];

let lang = localStorage.getItem('lang') || 'es';

// ===== Utilidades =====
const norm = s => String(s).trim();
function resolveAlias(name) {
  const n = norm(name);
  return aliases[n] || n;
}
const keyFor = (a, b) => [norm(a), norm(b)]
  .map(resolveAlias)
  .sort((x, y) => x.localeCompare(y, 'es'))
  .join('|');

function loadGame() {
  const saved = localStorage.getItem('discoveredElements');
  try {
    if (!saved) return { base: ["Singularidad", "Expansión"], combined: [] };
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.base) || !Array.isArray(parsed.combined))
      throw new Error('Invalid save');
    return parsed;
  } catch {
    localStorage.removeItem('discoveredElements');
    return { base: ["Singularidad", "Expansión"], combined: [] };
  }
}

function saveGame(state) {
  localStorage.setItem('discoveredElements', JSON.stringify(state));
}

// ===== UI strings =====
const UI = {
  es: {
    glossaryTitle: 'Glosario',
    pediaIntro: 'Haz clic en un elemento para ver su definición rigurosa y su explicación en palabras sencillas. Al crear una combinación, se mostrará su justificación.',
    craftingHint: 'Arrastra aquí dos elementos para combinarlos',
    nonCombHeader: 'Elementos No Combinables por ahora',
    reset: 'Reiniciar juego',
    diagram: 'Ver Diagrama',
    story: 'Ver Relato',
    langBtn: 'English',
    created: 'Has creado',
    nothing: 'No ha pasado nada...',
    rigorous: 'Rigurosa',
    simple: 'En palabras sencillas',
    directPrecursors: 'Precursores directos',
    pathHeader: 'Ruta de elaboración (resumen)',
    storyUnlocksWith: 'Se desbloquea con:',
    storyLockedMsg: 'Sigue combinando para desbloquear este capítulo.'
  },
  en: {
    glossaryTitle: 'Glossary',
    pediaIntro: 'Click any element to see its rigorous definition and a plain-language explanation. When you create a combo, its justification will appear here.',
    craftingHint: 'Drag two elements here to combine',
    nonCombHeader: 'Currently Non-combinable Elements',
    reset: 'Reset Game',
    diagram: 'View Diagram',
    story: 'View Story',
    langBtn: 'Español',
    created: 'You created',
    nothing: 'Nothing happened...',
    rigorous: 'Rigorous',
    simple: 'In plain words',
    directPrecursors: 'Direct precursors',
    pathHeader: 'Build route (summary)',
    storyUnlocksWith: 'Unlocks with:',
    storyLockedMsg: 'Keep combining to unlock this chapter.'
  }
};

function applyUILanguage() {
  const t = UI[lang];
  // Botones
  document.getElementById('reset-button').textContent = t.reset;
  document.getElementById('diagram-toggle-button').textContent = t.diagram;
  document.getElementById('story-toggle-button').textContent = t.story;
  document.getElementById('lang-toggle-button').textContent = t.langBtn;
  // Áreas
  document.getElementById('crafting-area').textContent = t.craftingHint;
  const nonComb = document.querySelector('#non-combinable-section h2');
  if (nonComb) nonComb.textContent = t.nonCombHeader;
  const gTitle = document.getElementById('glossary-title');
  if (gTitle) gTitle.textContent = t.glossaryTitle;
  const pIntro = document.getElementById('pedia-intro');
  if (pIntro) pIntro.textContent = t.pediaIntro;
}

// ===== Touch helpers =====
let lastTapTime = 0;
let lastTapElement = null;

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', () => {
  const elementsContainer = document.getElementById('elements');
  const craftingArea = document.getElementById('crafting-area');
  const resultsArea = document.getElementById('combination-results');
  const pedia = document.getElementById('pedia-content');

  // Modales
  const diagramButton = document.getElementById('diagram-toggle-button');
  const diagramModal = document.getElementById('diagram-modal');
  const diagramCloseBtn = document.getElementById('diagram-close-button');

  const storyButton = document.getElementById('story-toggle-button');
  const storyModal = document.getElementById('story-modal');
  const storyCloseBtn = document.getElementById('story-close-button');
  const storyContainer = document.getElementById('story-container');

  // Idioma
  const langBtn = document.getElementById('lang-toggle-button');
  langBtn.addEventListener('click', () => {
    lang = (lang === 'es') ? 'en' : 'es';
    localStorage.setItem('lang', lang);
    applyUILanguage();
    // Re-render tooltips de elementos con definiciones en el idioma actual
    document.querySelectorAll('.element').forEach(el => {
      const name = el.getAttribute('data-element');
      el.title = getDef(name);
    });
    // Reescribir el panel si ya había contenido
    const selected = document.querySelector('.element.selected');
    if (selected) showDefinition(selected.getAttribute('data-element'));
  });

  fetch(dataPath)
    .then(r => r.json())
    .then(data => {
      allPossibleElements = (data.elements?.base || []).concat(data.elements?.combined || []);
      definitions = data.definitions || {};
      kidDefinitions = data.kid_definitions || {};
      enDefinitions = data.en_definitions || {};       // opcional
      enKidDefinitions = data.en_kid_definitions || {}; // opcional
      justifications = data.justifications || {};
      enJustifications = data.en_justifications || {};  // opcional
      aliases = data.aliases || {};
      storySegments = (data.story && data.story.segments) ? data.story.segments : [];

      if (data.combinations && !data.recipes) {
        recipesRaw = migrateOldCombinations(data.combinations);
      } else {
        recipesRaw = data.recipes || [];
      }

      // Mapa canónico de recetas
      recipeMap.clear();
      producers.clear();
      for (const { inputs, outputs } of recipesRaw) {
        if (!Array.isArray(inputs) || inputs.length !== 2) continue;
        const a = resolveAlias(inputs[0]);
        const b = resolveAlias(inputs[1]);
        const k = keyFor(a, b);
        const outs = (outputs || []).map(o => resolveAlias(o));

        recipeMap.set(k, Array.from(new Set([...(recipeMap.get(k) || []), ...outs])));

        // Índice inverso: out -> [[a,b], ...]
        for (const out of outs) {
          const arr = producers.get(out) || [];
          arr.push([a, b]);
          producers.set(out, arr);
        }
      }

      initGame();
      applyUILanguage();
    })
    .catch(err => console.error('Error loading game data:', err));

  function migrateOldCombinations(combos) {
    const migrated = [];
    const names = new Set(allPossibleElements.map(n => resolveAlias(n)));
    function trySplit(concatKey) {
      const canonKey = resolveAlias(concatKey);
      for (const e1 of names) {
        if (canonKey.startsWith(e1)) {
          const rest = canonKey.slice(e1.length);
          if (names.has(rest)) return [e1, rest];
        }
      }
      return null;
    }
    Object.entries(combos).forEach(([k, outs]) => {
      const pair = trySplit(norm(k));
      if (pair) migrated.push({ inputs: pair, outputs: outs.map(o => resolveAlias(o)) });
    });
    return migrated;
  }

  function initGame() {
    elementsContainer.innerHTML = '';
    (discoveredElements.base || []).forEach(createElementDiv);
    (discoveredElements.combined || []).forEach(createElementDiv);
    updateNonCombinableElements();
  }

  function createElementDiv(elementName) {
    const name = resolveAlias(elementName);
    const elDiv = document.createElement('div');
    elDiv.textContent = name;
    elDiv.className = 'element';
    elDiv.setAttribute('data-element', name);
    elDiv.setAttribute('draggable', true);
    elDiv.title = getDef(name);

    // drag desktop
    elDiv.ondragstart = (e) => e.dataTransfer.setData('text', name);

    // marcar seleccionado para refrescar panel en cambio de idioma
    elDiv.addEventListener('click', () => {
      document.querySelectorAll('.element.selected').forEach(n => n.classList.remove('selected'));
      elDiv.classList.add('selected');
      showDefinition(name);
    });

    // doble clic desktop: enviar a no combinables si aplica
    elDiv.ondblclick = (e) => {
      if (e.currentTarget.classList.contains('non-combinable')) {
        addElementToNonCombinableSection(e.currentTarget);
      }
    };

    // táctil
    handleMobileDoubleTap(elDiv);
    handleTouchDrag(elDiv, document.getElementById('crafting-area'));

    elementsContainer.appendChild(elDiv);
  }

  function getDef(name) {
    if (lang === 'en') {
      return enDefinitions[name] || definitions[name] || '—';
    }
    return definitions[name] || '—';
  }

  function getKidDef(name) {
    if (lang === 'en') {
      return enKidDefinitions[name] || kidDefinitions[name] || '(no translation — showing ES) ' + (kidDefinitions[name] || '—');
    }
    return kidDefinitions[name] || '—';
  }

  function getJustification(key) {
    if (lang === 'en') {
      return enJustifications[key] || justifications[key] || '(no translation — showing ES) ' + (justifications[key] || '');
    }
    return justifications[key] || '';
  }

  function showDefinition(name) {
    const t = UI[lang];
    const def = getDef(name) || (lang === 'en' ? '(no translation — showing ES)' : 'Definición no disponible.');
    const kid = getKidDef(name) || (lang === 'en' ? '(no translation — showing ES)' : 'Explicación en palabras sencillas no disponible.');

    // Proveniencia: precursores directos y una ruta resumida
    const direct = (producers.get(name) || []).map(([a, b]) => `${a} + ${b} → ${name}`);
    const path = buildOnePathSummary(name); // Array de pasos "A + B → OUT"

    const directHTML = direct.length
      ? `<ul>${direct.map(s => `<li>${s}</li>`).join('')}</ul>`
      : `<p style="opacity:.8">—</p>`;

    const pathHTML = path.length
      ? `<ol>${path.map(s => `<li>${s}</li>`).join('')}</ol>`
      : `<p style="opacity:.8">—</p>`;

    const html = `
      <h3>${name}</h3>
      <p><strong>${t.rigorous}:</strong> ${def}</p>
      <p><strong>${t.simple}:</strong> ${kid}</p>
      <hr/>
      <h4>${t.directPrecursors}</h4>
      ${directHTML}
      <h4>${t.pathHeader}</h4>
      ${pathHTML}
    `;
    document.getElementById('pedia-content').innerHTML = html;
  }

  // ===== Drag & Drop =====
  craftingArea.ondragover = e => e.preventDefault();
  craftingArea.ondrop = e => {
    e.preventDefault();
    const elementName = e.dataTransfer.getData('text');
    handleElementDrop(elementName);
  };

  function handleElementDrop(elementName) {
    const current = [...craftingArea.querySelectorAll('.element')];
    if (current.length >= 2) return;

    const original = document.querySelector(`.element[data-element="${CSS.escape(resolveAlias(elementName))}"]`);
    if (!original) return;

    const clone = original.cloneNode(true);
    clone.classList.add('in-crafting-area');
    clone.removeAttribute('draggable');
    craftingArea.appendChild(clone);

    if (current.length + 1 === 2) checkCombination();
  }

  function combineElements(a, b) {
    const k = keyFor(a, b);
    return recipeMap.get(k) || null;
  }

  function checkCombination() {
    const t = UI[lang];
    const names = [...craftingArea.querySelectorAll('.element')].map(el => el.getAttribute('data-element'));
    if (names.length !== 2) return;

    const results = combineElements(names[0], names[1]);
    craftingArea.innerHTML = '';

    if (results && results.length) {
      const created = [];
      for (const r0 of results.slice(0, 6)) {
        const r = resolveAlias(r0);
        if (!discoveredElements.combined.includes(r) && !discoveredElements.base.includes(r)) {
          discoveredElements.combined.push(r);
          createElementDiv(r);
        }
        created.push(r);
      }
      resultsArea.textContent = `${t.created}: ${names[0]} + ${names[1]} → ${created.join(', ')}`;
      saveGame(discoveredElements);
      updateNonCombinableElements();

      const k = keyFor(names[0], names[1]);
      const just = getJustification(k);
      if (just) appendExplanation(`<h3>${names[0]} + ${names[1]}</h3><p>${just}</p>`);
    } else {
      resultsArea.textContent = t.nothing;
    }
  }

  function appendExplanation(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    document.getElementById('pedia-content').prepend(box);
  }

  // ===== No combinables =====
  function updateNonCombinableElements() {
    const disc = new Set(discoveredElements.base.concat(discoveredElements.combined).map(resolveAlias));
    const container = document.getElementById('non-combinable-elements');
    container.innerHTML = '';

    for (const name of disc) {
      const could = canProduceUndiscovered(name, disc);
      const el = document.querySelector(`.element[data-element="${CSS.escape(name)}"]`);
      if (!el) continue;
      if (!could) {
        el.classList.add('non-combinable');
        addElementToNonCombinableSection(el);
      } else {
        el.classList.remove('non-combinable');
      }
    }
  }

  function canProduceUndiscovered(elementName, discoveredSet) {
    for (const [k, outs] of recipeMap.entries()) {
      const [a, b] = k.split('|');
      if (a === elementName || b === elementName) {
        const other = a === elementName ? b : a;
        if (discoveredSet.has(other)) {
          if (outs.some(o => !discoveredSet.has(resolveAlias(o)))) return true;
        }
      }
    }
    return false;
  }

  function addElementToNonCombinableSection(element) {
    const container = document.getElementById('non-combinable-elements');
    const clone = element.cloneNode(true);
    clone.classList.add('in-menu');
    clone.removeAttribute('draggable');
    clone.addEventListener('click', () => showDefinition(clone.getAttribute('data-element')));
    container.appendChild(clone);
  }

  function resetGame() {
    discoveredElements = { base: ["Singularidad", "Expansión"], combined: [] };
    localStorage.removeItem('discoveredElements');

    document.getElementById('elements').innerHTML = '';
    document.getElementById('crafting-area').innerHTML = '';
    document.getElementById('combination-results').textContent = '';
    document.getElementById('non-combinable-elements').innerHTML = '';

    const intro = UI[lang].pediaIntro;
    document.getElementById('pedia-content').innerHTML = `<p>${intro}</p>`;

    initGame();
  }
  document.getElementById('reset-button').addEventListener('click', resetGame);

  // ===== Diagrama jerárquico con Vis.js =====
  function renderDiagram() {
    const container = document.getElementById('network-container');
    container.innerHTML = '';

    const discovered = discoveredElements.base.concat(discoveredElements.combined).map(resolveAlias);
    const nodeSet = new Set(discovered);

    const nodesArray = [...nodeSet].map(name => ({ id: name, label: name }));
    const edgesArray = [];

    for (const [k, outs] of recipeMap.entries()) {
      const [a, b] = k.split('|');
      for (const r of outs) {
        const res = resolveAlias(r);
        if (nodeSet.has(res)) {
          if (nodeSet.has(a)) edgesArray.push({ from: a, to: res, arrows: 'to' });
          if (nodeSet.has(b)) edgesArray.push({ from: b, to: res, arrows: 'to' });
        }
      }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);

    const options = {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          sortMethod: 'directed',
          nodeSpacing: 180,
          levelSeparation: 160
        }
      },
      physics: { enabled: false },
      interaction: { dragNodes: true, zoomView: true, dragView: true }
    };

    new vis.Network(container, { nodes, edges }, options);
  }

  diagramButton.addEventListener('click', () => {
    diagramModal.classList.add('visible');
    diagramModal.setAttribute('aria-hidden', 'false');
    renderDiagram();
  });
  diagramCloseBtn.addEventListener('click', () => {
    diagramModal.classList.remove('visible');
    diagramModal.setAttribute('aria-hidden', 'true');
  });
  diagramModal.addEventListener('click', (e) => {
    if (e.target === diagramModal) {
      diagramModal.classList.remove('visible');
      diagramModal.setAttribute('aria-hidden', 'true');
    }
  });

  // ===== Relato =====
  function renderStory() {
    const t = UI[lang];
    storyContainer.innerHTML = '';
    const disc = new Set(discoveredElements.base.concat(discoveredElements.combined).map(resolveAlias));

    storySegments.forEach(seg => {
      const unlocked = (seg.requires || []).every(r => disc.has(resolveAlias(r)));
      const card = document.createElement('div');
      card.className = 'story-segment' + (unlocked ? '' : ' story-locked');
      const reqs = (seg.requires || []).map(resolveAlias).join(', ');
      card.innerHTML = `
        <h3 class="story-title">${unlocked ? '' : '🔒 '}${seg.title}</h3>
        <div class="story-requires"><strong>${t.storyUnlocksWith}</strong> ${reqs || '—'}</div>
        <p>${unlocked ? seg.text : t.storyLockedMsg}</p>
      `;
      storyContainer.appendChild(card);
    });
  }

  storyButton.addEventListener('click', () => {
    storyModal.classList.add('visible');
    storyModal.setAttribute('aria-hidden', 'false');
    renderStory();
  });
  storyCloseBtn.addEventListener('click', () => {
    storyModal.classList.remove('visible');
    storyModal.setAttribute('aria-hidden', 'true');
  });
  storyModal.addEventListener('click', (e) => {
    if (e.target === storyModal) {
      storyModal.classList.remove('visible');
      storyModal.setAttribute('aria-hidden', 'true');
    }
  });

  // ===== Soporte móvil =====
  function handleMobileDoubleTap(element) {
    element.addEventListener('touchstart', function (e) {
      const t = Date.now();
      const dt = t - lastTapTime;
      if (dt < 300 && dt > 0 && lastTapElement === e.target) {
        if (e.target.classList.contains('non-combinable')) {
          addElementToNonCombinableSection(e.target);
        }
      }
      lastTapTime = t;
      lastTapElement = e.target;
    }, { passive: true });
  }

  function handleTouchDrag(element, craftingAreaEl) {
    let offsetX = 0, offsetY = 0;
    let moving = false;

    element.addEventListener('touchstart', (e) => {
      const rect = element.getBoundingClientRect();
      const touch = e.touches[0];
      offsetX = touch.clientX - rect.left;
      offsetY = touch.clientY - rect.top;
      moving = true;
      element.style.position = 'absolute';
      element.style.zIndex = 1000;
      moveAt(touch.clientX, touch.clientY);
      e.preventDefault();
    }, { passive: false });

    element.addEventListener('touchmove', (e) => {
      if (!moving) return;
      const touch = e.touches[0];
      moveAt(touch.clientX, touch.clientY);
      e.preventDefault();
    }, { passive: false });

    element.addEventListener('touchend', () => {
      moving = false;
      const craftRect = craftingAreaEl.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const inside =
        rect.left > craftRect.left &&
        rect.right < craftRect.right &&
        rect.top > craftRect.top &&
        rect.bottom < craftRect.bottom;

      element.style.position = '';
      element.style.left = '';
      element.style.top = '';
      element.style.zIndex = '';

      if (inside) {
        handleElementDrop(element.getAttribute('data-element'));
      }
    });

    function moveAt(x, y) {
      element.style.left = x - offsetX + 'px';
      element.style.top = y - offsetY + 'px';
    }
  }

  // ===== Ruta resumida (proveniencia) =====
  // Genera UNA ruta compacta hacia 'target' (preferencia por insumos ya descubiertos o base)
  function buildOnePathSummary(target) {
    const MAX_DEPTH = 8;
    const MAX_STEPS = 22;
    const baseSet = new Set((discoveredElements.base || []).map(resolveAlias));
    const visited = new Set();
    const steps = [];

    function choosePairsFor(tgt) {
      const arr = producers.get(tgt) || [];
      // Priorizar parejas con ambos insumos descubiertos o base
      const discSet = new Set(discoveredElements.base.concat(discoveredElements.combined).map(resolveAlias));
      return arr
        .map(([a, b]) => [a, b])
        .sort((p, q) => {
          const score = ([x, y]) =>
            (discSet.has(x) ? 1 : 0) + (discSet.has(y) ? 1 : 0) + (baseSet.has(x) ? 1 : 0) + (baseSet.has(y) ? 1 : 0);
          return score(q) - score(p);
        });
    }

    function dfs(tgt, depth) {
      if (depth > MAX_DEPTH || steps.length > MAX_STEPS) return false;
      if (baseSet.has(tgt)) return true;
      if (visited.has(tgt)) return false;
      visited.add(tgt);

      const options = choosePairsFor(tgt);
      if (!options.length) return baseSet.has(tgt); // podría ser base sin productores

      for (const [a, b] of options) {
        const okA = baseSet.has(a) || dfs(a, depth + 1);
        const okB = baseSet.has(b) || dfs(b, depth + 1);
        if (okA && okB) {
          steps.push(`${a} + ${b} → ${tgt}`);
          return true;
        }
      }
      return false;
    }

    // Construir steps desde hojas a target y luego invertir para presentación cronológica
    const success = dfs(resolveAlias(target), 0);
    return success ? steps.reverse() : [];
  }

});
