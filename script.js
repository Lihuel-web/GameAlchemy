// script.js
const dataPath = 'alchemy-recipes.json';

let discoveredElements = loadGame() || {
  base: ["Singularidad", "Expansión"],
  combined: []
};

let recipesRaw = [];          // como vengan del JSON (recipes o combinaciones viejas)
let recipeMap = new Map();    // llave canónica "A|B" -> outputs[]
let allPossibleElements = [];
let definitions = {};
let justifications = {};

function loadGame() {
  const saved = localStorage.getItem('discoveredElements');
  return saved ? JSON.parse(saved) : { base: ["Singularidad", "Expansión"], combined: [] };
}

// helpers de normalización
const norm = s => String(s).trim();
const keyFor = (a, b) => [norm(a), norm(b)].sort((x, y) => x.localeCompare(y, 'es')).join('|');

document.addEventListener('DOMContentLoaded', () => {
  const elementsContainer = document.getElementById('elements');
  const craftingArea = document.getElementById('crafting-area');
  const resultsArea = document.getElementById('combination-results');
  const pedia = document.getElementById('pedia-content');

  // Modal diagrama
  const diagramButton = document.getElementById('diagram-toggle-button');
  const diagramModal = document.getElementById('diagram-modal');
  const diagramCloseBtn = document.getElementById('diagram-close-button');

  fetch(dataPath)
    .then(r => r.json())
    .then(data => {
      allPossibleElements = (data.elements.base || []).concat(data.elements.combined || []);
      definitions = data.definitions || {};
      justifications = data.justifications || {};

      // 1) Soportar tu formato antiguo (combinations como concatenaciones)
      if (data.combinations && !data.recipes) {
        recipesRaw = migrateOldCombinations(data.combinations);
      } else {
        recipesRaw = data.recipes || [];
      }

      // 2) Construir mapa canónico
      recipeMap.clear();
      recipesRaw.forEach(({ inputs, outputs }) => {
        if (!Array.isArray(inputs) || inputs.length !== 2) return;
        const k = keyFor(inputs[0], inputs[1]);
        const outs = (outputs || []).map(norm);
        recipeMap.set(k, (recipeMap.get(k) || []).concat(outs));
      });

      initGame();
    })
    .catch(err => console.error('Error loading game data:', err));

  function migrateOldCombinations(combos) {
    // combos: { "A B concatenados": [outputs...] }
    const migrated = [];
    const names = new Set(allPossibleElements.map(norm));
    const trySplit = (concatKey) => {
      // Encuentra cualquier prefijo válido que deje un sufijo válido
      for (const e1 of names) {
        if (concatKey.startsWith(e1)) {
          const rest = concatKey.slice(e1.length);
          for (const e2 of names) {
            if (rest === e2) return [e1, e2];
          }
        }
      }
      return null;
    };

    Object.entries(combos).forEach(([k, outs]) => {
      const pair = trySplit(norm(k));
      if (pair) migrated.push({ inputs: pair, outputs: outs.map(norm) });
    });
    return migrated;
  }

  function initGame() {
    // Reset visual
    elementsContainer.innerHTML = '';
    (discoveredElements.base || []).forEach(createElementDiv);
    (discoveredElements.combined || []).forEach(createElementDiv);
    updateNonCombinableElements();
  }

  function createElementDiv(elementName) {
    const name = norm(elementName);
    const elDiv = document.createElement('div');
    elDiv.textContent = name;
    elDiv.className = 'element';
    elDiv.setAttribute('data-element', name);
    elDiv.setAttribute('draggable', true);
    elDiv.title = definitions[name] || '—';

    // drag desktop
    elDiv.ondragstart = (e) => e.dataTransfer.setData('text', name);

    // doble clic desktop: mover a “no combinables” si marcado
    elDiv.ondblclick = (e) => {
      if (e.currentTarget.classList.contains('non-combinable')) {
        addElementToNonCombinableSection(e.currentTarget);
      }
    };

    // clic: mostrar definición
    elDiv.addEventListener('click', () => {
      showDefinition(name);
    });

    // táctil
    handleMobileDoubleTap(elDiv);
    handleTouchDrag(elDiv, document.getElementById('crafting-area'));

    elementsContainer.appendChild(elDiv);
  }

  // panel de definiciones
  function showDefinition(name) {
    const def = definitions[name] || 'Definición no disponible.';
    pedia.innerHTML = `<h3>${name}</h3><p>${def}</p>`;
  }

  // drag over y drop
  craftingArea.ondragover = e => e.preventDefault();
  craftingArea.ondrop = e => {
    e.preventDefault();
    const elementName = e.dataTransfer.getData('text');
    handleElementDrop(elementName);
  };

  function handleElementDrop(elementName) {
    const current = [...craftingArea.querySelectorAll('.element')];
    if (current.length >= 2) return;

    const original = document.querySelector(`.element[data-element="${CSS.escape(elementName)}"]`);
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
    const names = [...craftingArea.querySelectorAll('.element')].map(el => el.getAttribute('data-element'));
    if (names.length !== 2) return;

    const results = combineElements(names[0], names[1]);
    craftingArea.innerHTML = '';

    if (results && results.length) {
      const created = [];
      for (const r of results.slice(0, 4)) {
        if (!discoveredElements.combined.includes(r) && !discoveredElements.base.includes(r)) {
          discoveredElements.combined.push(r);
          createElementDiv(r);
          created.push(r);
        } else {
          created.push(r);
        }
      }
      resultsArea.textContent = `Has creado: ${created.join(', ')}`;
      saveGame(discoveredElements);
      updateNonCombinableElements();

      // Justificación
      const k = keyFor(names[0], names[1]);
      if (justifications[k]) {
        const html = `<h3>${names[0]} + ${names[1]}</h3><p>${justifications[k]}</p>`;
        appendExplanation(html);
      }
    } else {
      resultsArea.textContent = 'No ha pasado nada...';
    }
  }

  function appendExplanation(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    pedia.prepend(box);
  }

  // “no combinables” mejorado
  function updateNonCombinableElements() {
    const disc = new Set(discoveredElements.base.concat(discoveredElements.combined).map(norm));
    const container = document.getElementById('non-combinable-elements');
    container.innerHTML = '';

    for (const name of disc) {
      const couldProduceNew = canProduceUndiscovered(name, disc);
      const el = document.querySelector(`.element[data-element="${CSS.escape(name)}"]`);
      if (!el) continue;
      if (!couldProduceNew) {
        el.classList.add('non-combinable');
        addElementToNonCombinableSection(el);
      } else {
        el.classList.remove('non-combinable');
      }
    }
  }

  function canProduceUndiscovered(elementName, discoveredSet) {
    // existe receta {elementName, X} con X ya descubierto y algún output no descubierto
    for (const [k, outs] of recipeMap.entries()) {
      const [a, b] = k.split('|');
      if (a === elementName || b === elementName) {
        const other = a === elementName ? b : a;
        if (discoveredSet.has(other)) {
          if (outs.some(o => !discoveredSet.has(o))) return true;
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
    // mostrar definición al hacer clic
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
    resultsArea.textContent = '';
    document.getElementById('non-combinable-elements').innerHTML = '';
    document.getElementById('pedia-content').innerHTML =
      '<p>Haz clic en un elemento para ver su definición. Al crear una combinación, se mostrará su justificación.</p>';

    initGame();
  }

  document.getElementById('reset-button').addEventListener('click', resetGame);

  // ===== Diagrama con Vis.js =====
  function renderDiagram() {
    const container = document.getElementById('network-container');
    container.innerHTML = '';

    const discovered = discoveredElements.base.concat(discoveredElements.combined);
    const nodeSet = new Set(discovered);

    const nodesArray = [...nodeSet].map(name => ({ id: name, label: name }));
    const edgesArray = [];

    for (const [k, outs] of recipeMap.entries()) {
      const [a, b] = k.split('|');
      for (const r of outs) {
        if (nodeSet.has(r)) {
          if (nodeSet.has(a)) edgesArray.push({ from: a, to: r, arrows: 'to' });
          if (nodeSet.has(b)) edgesArray.push({ from: b, to: r, arrows: 'to' });
        }
      }
    }

    const nodes = new vis.DataSet(nodesArray);
    const edges = new vis.DataSet(edgesArray);

    const options = {
      layout: { improvedLayout: true },
      physics: { enabled: true, stabilization: { iterations: 250 } },
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

    element.addEventListener('touchend', (e) => {
      moving = false;
      // ver si cayó dentro del área de crafteo
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
});
