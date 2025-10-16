// script.js
const dataPath = 'alchemy-recipes.json';

// ====== i18n UI strings ======
const I18N = {
  es: {
    dragHint: 'Arrastra aquí dos elementos para combinarlos',
    created: 'Has creado',
    nothing: 'No ha pasado nada...',
    reset: 'Resetear Juego',
    diagram: 'Ver Diagrama',
    story: 'Ver Relato',
    nonCombTitle: 'Elementos No Combinables por ahora',
    pediaTitle: 'Glosario',
    pediaIntro: 'Haz clic en un elemento para ver su definición rigurosa y su explicación en palabras sencillas. Al crear una combinación, se mostrará su justificación.',
    rigorous: 'Rigurosa',
    kid: 'En palabras sencillas',
    producedBy: 'Se puede obtener combinando',
    fromBases: 'Ruta posible desde las bases',
    lockedStory: 'Sigue combinando para desbloquear este capítulo.',
    unlocksWith: 'Se desbloquea con',
    noDef: 'Definición no disponible.',
    noKid: 'Explicación en palabras sencillas no disponible.',
    noPath: 'No se encontró una ruta desde las bases con las recetas actuales.',
    fallbackNote: '(definición no disponible en EN — mostrando ES)',
  },
  en: {
    dragHint: 'Drag two elements here to combine',
    created: 'You created',
    nothing: 'Nothing happened...',
    reset: 'Reset Game',
    diagram: 'View Diagram',
    story: 'View Story',
    nonCombTitle: 'Not Combinable for now',
    pediaTitle: 'Glossary',
    pediaIntro: 'Click an element to see its rigorous definition and a plain-language explanation. When you make a combination, its justification will appear here.',
    rigorous: 'Rigorous',
    kid: 'Plain language',
    producedBy: 'Producible by combining',
    fromBases: 'Possible route from bases',
    lockedStory: 'Keep combining to unlock this chapter.',
    unlocksWith: 'Unlocks with',
    noDef: 'Definition not available.',
    noKid: 'Plain-language explanation not available.',
    noPath: 'No route from bases found with current recipes.',
    fallbackNote: '(no EN definition — showing ES)',
  }
};

const LANG_KEYS = ['es', 'en'];
let currentLang = loadLang();

let discoveredElements = loadGame() || {
  base: ["Singularidad", "Expansión"],
  combined: []
};

let recipesRaw = [];
let recipeMap = new Map();     // "A|B" -> outputs[]
let reverseMap = new Map();    // "Output" -> array of [A,B]
let allPossibleElements = [];
let definitions = {};          // ES
let kidDefinitions = {};       // ES
let definitions_en = {};       // EN (opcional en JSON)
let kidDefinitions_en = {};    // EN (opcional en JSON)
let justifications = {};
let aliases = {};
let storySegments = [];
let storySegments_en = [];     // EN (opcional)

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

  // Lang toggle
  const langToggleBtn = document.getElementById('lang-toggle-button');
  applyI18N(); // inicializa textos UI

  fetch(dataPath)
    .then(r => r.json())
    .then(data => {
      allPossibleElements = (data.elements?.base || []).concat(data.elements?.combined || []);
      definitions = data.definitions || {};
      kidDefinitions = data.kid_definitions || {};
      // opcionales EN
      definitions_en = data.definitions_en || {};
      kidDefinitions_en = data.kid_definitions_en || {};

      justifications = data.justifications || {};
      aliases = data.aliases || {};
      storySegments = (data.story && data.story.segments) ? data.story.segments : [];
      storySegments_en = (data.story && (data.story.segments_en || data.story.segmentsEn || [])) || [];

      // Preparar recetas
      if (data.combinations && !data.recipes) {
        recipesRaw = migrateOldCombinations(data.combinations);
      } else {
        recipesRaw = data.recipes || [];
      }

      // construir mapa canónico directo e inverso
      recipeMap.clear();
      reverseMap.clear();
      recipesRaw.forEach(({ inputs, outputs }) => {
        if (!Array.isArray(inputs) || inputs.length !== 2) return;
        const a = resolveAlias(inputs[0]);
        const b = resolveAlias(inputs[1]);
        const k = keyFor(a, b);
        const outs = (outputs || []).map(o => resolveAlias(o));
        // directo
        recipeMap.set(k, Array.from(new Set((recipeMap.get(k) || []).concat(outs))));
        // inverso
        outs.forEach(out => {
          const arr = reverseMap.get(out) || [];
          arr.push([a, b]);
          reverseMap.set(out, arr);
        });
      });

      initGame();
    })
    .catch(err => console.error('Error loading game data:', err));

  function loadLang() {
    const saved = localStorage.getItem('alchemy_lang');
    return LANG_KEYS.includes(saved) ? saved : 'es';
  }
  function saveLang(lang) {
    localStorage.setItem('alchemy_lang', lang);
  }

  function applyI18N() {
    const t = I18N[currentLang];
    document.getElementById('crafting-area').textContent = t.dragHint;
    document.getElementById('reset-button').textContent = t.reset;
    document.getElementById('diagram-toggle-button').textContent = t.diagram;
    document.getElementById('story-toggle-button').textContent = t.story;
    document.getElementById('noncomb-title').textContent = t.nonCombTitle;
    document.getElementById('pedia-title').textContent = t.pediaTitle;
    document.getElementById('pedia-intro').textContent = t.pediaIntro;
    const btn = document.getElementById('lang-toggle-button');
    btn.textContent = currentLang.toUpperCase();
    btn.setAttribute('aria-pressed', currentLang === 'en' ? 'true' : 'false');
  }

  // helpers
  const norm = s => String(s ?? '').trim();
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
    const elementsContainer = document.getElementById('elements');
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
    elDiv.title = getDefinition(name) || '—';

    // drag desktop
    elDiv.ondragstart = (e) => e.dataTransfer.setData('text', name);

    // clic: mostrar definiciones + procedencia
    elDiv.addEventListener('click', () => showDefinition(name));

    // táctil
    handleMobileDoubleTap(elDiv);
    handleTouchDrag(elDiv, document.getElementById('crafting-area'));

    document.getElementById('elements').appendChild(elDiv);
  }

  // === Definiciones + Procedencia ===
  function getDefinition(name) {
    if (currentLang === 'en') {
      return definitions_en[name] || definitions[name] || null;
    }
    return definitions[name] || null;
  }
  function getKidDefinition(name) {
    if (currentLang === 'en') {
      return kidDefinitions_en[name] || kidDefinitions[name] || null;
    }
    return kidDefinitions[name] || null;
  }

  function showDefinition(name) {
    const t = I18N[currentLang];

    const def = getDefinition(name);
    const kid = getKidDefinition(name);

    // Precursores directos: todas las combinaciones [A,B] que producen 'name'
    const parents = (reverseMap.get(resolveAlias(name)) || []).map(([a,b]) => [resolveAlias(a), resolveAlias(b)]);

    // Ruta sugerida desde bases: BFS sobre grafo dirigido de recetas
    const route = findShortestRouteFromBases(name);

    const fallback = (currentLang === 'en' && (definitions_en[name] == null && kidDefinitions_en[name] == null))
      ? ` <em>${t.fallbackNote}</em>` : '';

    const parentChips = parents.length
      ? parents.map(([a,b]) => chipPairHTML(a,b)).join('')
      : '<span>—</span>';

    const routeHTML = route.length
      ? routeToHTML(route)
      : `<p>${t.noPath}</p>`;

    const html = `
      <h3>${name}</h3>
      <p><strong>${t.rigorous}:</strong> ${def || t.noDef}${fallback}</p>
      <p><strong>${t.kid}:</strong> ${kid || t.noKid}${fallback}</p>

      <div class="provenance-block">
        <h4>${t.producedBy}</h4>
        <div class="chips">${parentChips}</div>
      </div>

      <div class="route-block">
        <h4>${t.fromBases}</h4>
        ${routeHTML}
      </div>
    `;

    document.getElementById('pedia-content').innerHTML = html;

    // Activar navegación al hacer click en chips
    document.querySelectorAll('.chip[data-el]').forEach(ch => {
      ch.addEventListener('click', () => {
        const target = ch.getAttribute('data-el');
        showDefinition(target);
        scrollToElementCard(target);
      });
    });
  }

  function chipPairHTML(a,b) {
    // Cada par muestra chips navegables a los elementos A y B
    return `
      <div class="chip-pair">
        <button class="chip" data-el="${a}" type="button">${a}</button>
        <span class="chip-plus"> + </span>
        <button class="chip" data-el="${b}" type="button">${b}</button>
      </div>
    `;
  }

  function routeToHTML(route) {
    // route es una secuencia: E0, E1, ..., En = objetivo
    // mostramos como chips navegables con → entre medias
    const parts = route.map((e, i) => {
      const sep = (i === route.length - 1) ? '' : '<span class="route-arrow"> → </span>';
      return `<button class="chip route" data-el="${e}" type="button">${e}</button>${sep}`;
    }).join('');
    return `<div class="chips route-chips">${parts}</div>`;
  }

  function scrollToElementCard(name) {
    const card = document.querySelector(`.element[data-element="${CSS.escape(name)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('pulse');
      setTimeout(() => card.classList.remove('pulse'), 700);
    }
  }

  // === BFS para ruta desde bases ===
  function findShortestRouteFromBases(target) {
    const tgt = resolveAlias(target);
    const disc = new Set(allDiscovered()); // limitar a lo conocido para no “spoilear”
    // También permitimos pasos intermedios no descubiertos para no bloquear rutas útiles:
    // cambia a 'false' si quieres estrictamente rutas sólo con descubiertos.
    const ALLOW_UNDISCOVERED_STEPS = true;

    // Construimos un grafo de forward: from [A,B] produce O
    const adj = new Map(); // E -> set of outputs alcanzables si combino con algún otro E'
    for (const [k, outs] of recipeMap.entries()) {
      const [a, b] = k.split('|');
      outs.forEach(o => {
        // registramos aristas a->o y b->o (heurística para BFS simple)
        if (!adj.has(a)) adj.set(a, new Set());
        if (!adj.has(b)) adj.set(b, new Set());
        adj.get(a).add(o);
        adj.get(b).add(o);
      });
    }

    const bases = discoveredElements.base.map(resolveAlias);
    if (bases.includes(tgt)) return [tgt];

    // BFS estándar
    const q = [];
    const prev = new Map(); // nodo -> anterior
    bases.forEach(b => { q.push(b); prev.set(b, null); });

    const seen = new Set(bases);
    while (q.length) {
      const u = q.shift();
      const outs = adj.get(u) || new Set();
      for (const v of outs) {
        if (seen.has(v)) continue;
        // filtro si no queremos “spoilers”
        if (!ALLOW_UNDISCOVERED_STEPS && !disc.has(v)) continue;
        seen.add(v);
        prev.set(v, u);
        if (v === tgt) {
          // reconstruir ruta
          const path = [];
          let cur = v;
          while (cur !== null) {
            path.push(cur);
            cur = prev.get(cur);
          }
          return path.reverse();
        }
        q.push(v);
      }
    }
    return [];
  }

  function allDiscovered() {
    return discoveredElements.base.concat(discoveredElements.combined).map(resolveAlias);
  }

  // Drag & Drop
  document.getElementById('crafting-area').ondragover = e => e.preventDefault();
  document.getElementById('crafting-area').ondrop = e => {
    e.preventDefault();
    const elementName = e.dataTransfer.getData('text');
    handleElementDrop(elementName);
  };

  function handleElementDrop(elementName) {
    const craftingArea = document.getElementById('crafting-area');
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
    const craftingArea = document.getElementById('crafting-area');
    const resultsArea = document.getElementById('combination-results');
    const t = I18N[currentLang];

    const names = [...craftingArea.querySelectorAll('.element')].map(el => el.getAttribute('data-element'));
    if (names.length !== 2) return;

    const results = combineElements(names[0], names[1]);
    craftingArea.innerHTML = '';

    if (results && results.length) {
      const created = [];
      for (const r0 of results.slice(0, 8)) {
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
      if (justifications[k]) {
        const html = `<h3>${names[0]} + ${names[1]}</h3><p>${justifications[k]}</p>`;
        appendExplanation(html);
      }

      // Refrescar procedencias si el usuario estaba viendo una definición
      const lastShown = document.querySelector('#pedia-content h3');
      if (lastShown) {
        const lastName = lastShown.textContent.trim();
        if (lastName) showDefinition(lastName);
      }
    } else {
      resultsArea.textContent = t.nothing;
    }
  }

  function appendExplanation(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    document.getElementById('pedia-content').prepend(box);
  }

  // No combinables
  function updateNonCombinableElements() {
    const disc = new Set(allDiscovered());
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

  function saveGame(state) {
    localStorage.setItem('discoveredElements', JSON.stringify(state));
  }

  function resetGame() {
    discoveredElements = { base: ["Singularidad", "Expansión"], combined: [] };
    localStorage.removeItem('discoveredElements');

    document.getElementById('elements').innerHTML = '';
    document.getElementById('crafting-area').innerHTML = '';
    document.getElementById('combination-results').textContent = '';
    document.getElementById('non-combinable-elements').innerHTML = '';
    document.getElementById('pedia-content').innerHTML =
      `<p id="pedia-intro">${I18N[currentLang].pediaIntro}</p>`;

    initGame();
  }

  document.getElementById('reset-button').addEventListener('click', resetGame);

  // ===== Diagrama con Vis.js =====
  function renderDiagram() {
    const container = document.getElementById('network-container');
    container.innerHTML = '';

    const discovered = allDiscovered();
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
    const t = I18N[currentLang];
    storyContainer.innerHTML = '';
    const disc = new Set(allDiscovered());

    const segs = (currentLang === 'en' && storySegments_en.length) ? storySegments_en : storySegments;

    segs.forEach(seg => {
      const reqsArr = (seg.requires || []).map(resolveAlias);
      const unlocked = reqsArr.every(r => disc.has(r));
      const card = document.createElement('div');
      card.className = 'story-segment' + (unlocked ? '' : ' story-locked');
      const reqs = reqsArr.join(', ');
      card.innerHTML = `
        <h3 class="story-title">${unlocked ? '' : '🔒 '}${seg.title}</h3>
        <div class="story-requires"><strong>${t.unlocksWith}:</strong> ${reqs || '—'}</div>
        <p>${unlocked ? seg.text : t.lockedStory}</p>
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
  let lastTapTime = 0;
  let lastTapElement = null;
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

  // ===== Toggle idioma =====
  langToggleBtn.addEventListener('click', () => {
    const idx = LANG_KEYS.indexOf(currentLang);
    currentLang = LANG_KEYS[(idx + 1) % LANG_KEYS.length];
    saveLang(currentLang);
    applyI18N();

    // refrescar pedia si hay un elemento mostrado
    const lastShown = document.querySelector('#pedia-content h3');
    if (lastShown) showDefinition(lastShown.textContent.trim());
  });
});

