/* Warmup storefront: what the pages do. Uses WARMUP (the facts) and WarmupCore (the logic). */
(() => {
  'use strict';

  const catalog = window.WARMUP;
  const core = window.WarmupCore;
  if (!catalog || !core) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const byId = (list, id) => list.find((item) => item.id === id);

  // Each part of the page adds a function here that re-reads its own controls.
  // They all run again when the page is shown, because the browser restores
  // form controls (and sometimes the whole page) when you come back to it.
  const syncs = [];

  // The hero plays its entrance once. This makes sure it always ends fully shown,
  // even where the browser pauses animations (a background tab, a preview).
  window.setTimeout(() => document.documentElement.classList.add('is-settled'), 1800);

  /* ------------------------------------------------------------------
     Menu on narrow screens
     ------------------------------------------------------------------ */
  const menuBtn = $('#menu-btn');
  const menu = $('#menu');
  if (menuBtn && menu) {
    const setMenu = (open) => {
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      $('use', menuBtn).setAttribute('href', open ? '#i-close' : '#i-menu');
    };
    menuBtn.addEventListener('click', () => setMenu(menu.hidden));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        setMenu(false);
        menuBtn.focus();
      }
    });
    window.matchMedia('(min-width: 62.01rem)').addEventListener('change', (event) => {
      if (event.matches) setMenu(false);
    });
    syncs.push(() => setMenu(false));
  }

  /* ------------------------------------------------------------------
     Temperature control (home)
     ------------------------------------------------------------------ */
  const heat = $('#heat');
  const target = $('#target');
  if (heat && target) {
    const targetNum = $('#target-num');
    const modeName = $('#mode-name');
    const modeText = $('#mode-text');
    const chips = $$('.chip', heat);
    const startF = Number(target.getAttribute('value'));
    let touched = false;

    const showTarget = (f) => {
      const t = core.heatFraction(catalog, f);
      const mode = core.modeFor(catalog, f);
      targetNum.textContent = String(f);
      modeName.textContent = mode.name;
      modeText.textContent = mode.text;
      target.setAttribute('aria-valuetext', `${f}°F, ${mode.name}`);
      heat.style.setProperty('--heat-color', core.heatColor(t));
      heat.style.setProperty('--glow-b', (0.62 + 0.62 * t).toFixed(3));
      heat.style.setProperty('--glow-s', (0.35 + 1.1 * t).toFixed(3));
      for (const chip of chips) {
        if (Number(chip.dataset.target) === f) chip.setAttribute('aria-current', 'true');
        else chip.removeAttribute('aria-current');
      }
    };

    target.addEventListener('input', () => {
      touched = true;
      showTarget(Number(target.value));
    });
    for (const chip of chips) {
      chip.addEventListener('click', () => {
        touched = true;
        target.value = chip.dataset.target;
        showTarget(Number(target.value));
      });
    }
    showTarget(Number(target.value));
    syncs.push(() => {
      // A slider the browser restored to another value counts as the visitor's own setting.
      if (Number(target.value) !== startF) touched = true;
      showTarget(Number(target.value));
    });

    // Once, the first time the control is on screen, it warms from the bottom of the scale up to Auto.
    if (!reduceMotion.matches && 'IntersectionObserver' in window) {
      const watcher = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        if (touched) return;
        const end = Number(target.value);
        let f = catalog.targetMin;
        const step = () => {
          if (touched) return;
          target.value = String(f);
          showTarget(f);
          if (f < end) {
            f += 1;
            window.setTimeout(step, 130);
          }
        };
        step();
      }, { threshold: 0.6 });
      watcher.observe($('.scale', heat));
    }
  }

  /* ------------------------------------------------------------------
     App screens (home)
     ------------------------------------------------------------------ */
  const tabs = $$('.tab');
  const panel = $('#app-panel');
  if (tabs.length && panel) {
    const screens = $$('img', panel);
    const selectTab = (tab, focus = false) => {
      for (const other of tabs) {
        const on = other === tab;
        other.setAttribute('aria-selected', String(on));
        other.tabIndex = on ? 0 : -1;
      }
      for (const screen of screens) screen.classList.toggle('is-on', screen.dataset.screen === tab.dataset.screen);
      panel.setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
        if (move) {
          event.preventDefault();
          selectTab(tabs[(index + move + tabs.length) % tabs.length], true);
        } else if (event.key === 'Home') {
          event.preventDefault();
          selectTab(tabs[0], true);
        } else if (event.key === 'End') {
          event.preventDefault();
          selectTab(tabs[tabs.length - 1], true);
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     Bag (every page). Saved on this device only.
     ------------------------------------------------------------------ */
  const STORE_KEY = 'warmup-site.bag.v2';
  const bagDialog = $('#bag');
  const bagBody = $('#bag-body');
  const bagTotal = $('#bag-total');
  const bagCount = $('#bag-count');
  const bagOpen = $('#bag-open');
  const bagLive = $('#bag-live');
  const bagStatus = $('#bag-status');
  const bagNote = $('#bag-note');
  const checkout = $('#checkout');
  const hasBag = Boolean(bagDialog && bagOpen);

  const loadBag = () => {
    try {
      return core.sanitizeBag(catalog, JSON.parse(window.localStorage.getItem(STORE_KEY) || '[]'));
    } catch {
      return [];
    }
  };
  const saveBag = () => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(bag));
    } catch {
      // Private browsing can block storage. The bag then lasts for this visit.
    }
  };

  let bag = loadBag();

  // While the bag is open the rest of the page is silent to screen readers,
  // so the open bag speaks through its own status line.
  const say = (text) => {
    if (!hasBag) return;
    (bagDialog.open ? bagStatus : bagLive).textContent = text;
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  };

  // Drawing the bag again replaces its buttons, so the keyboard is handed back
  // to the button that was pressed, or to the nearest thing left.
  const focusAfterChange = (index, step) => {
    const rows = $$('.line', bagBody);
    const row = rows[Math.min(index, rows.length - 1)];
    if (!row) {
      ($('.bag__empty a', bagBody) || $('#bag-close')).focus();
      return;
    }
    const wanted = $(`[data-step="${step}"]`, row);
    (wanted && !wanted.disabled ? wanted : $('[data-step="fewer"]', row)).focus();
  };

  const changeQuantity = (index, quantity, step) => {
    bag = core.setQuantity(catalog, bag, index, quantity);
    saveBag();
    renderBag();
    say(bag.length ? `${core.plural(core.bagCount(bag))} in bag` : 'Bag is empty');
    focusAfterChange(index, step);
  };

  const stepButton = (step, label, iconName) => {
    const button = el('button');
    button.type = 'button';
    button.dataset.step = step;
    button.setAttribute('aria-label', label);
    button.append(icon(iconName));
    return button;
  };

  const renderLine = (line, index) => {
    const parts = core.describeLine(catalog, line);
    const summary = parts.join(', ');
    const row = el('div', 'line');

    const thumb = el('div', 'line__thumb');
    thumb.dataset.color = line.color;
    const img = el('img');
    img.src = byId(catalog.colors, line.color).image;
    img.alt = '';
    thumb.append(img);

    const text = el('div', 'line__text');
    text.append(el('b', '', 'Warmup hoodie'), ...parts.map((part) => el('span', '', part)));

    const side = el('div', 'line__side');
    const qty = el('div', 'qty');
    const fewer = stepButton('fewer', `${line.quantity === 1 ? 'Remove from bag' : 'One fewer'}: ${summary}`, 'minus');
    fewer.addEventListener('click', () => changeQuantity(index, line.quantity - 1, 'fewer'));
    const more = stepButton('more', `One more: ${summary}`, 'plus');
    more.disabled = line.quantity >= catalog.maxQuantity;
    more.addEventListener('click', () => changeQuantity(index, line.quantity + 1, 'more'));
    const count = el('span');
    count.append(el('span', 'sr', 'Quantity '), String(line.quantity));
    qty.append(fewer, count, more);
    side.append(el('span', 'line__price', core.money(core.unitPrice(catalog, line) * line.quantity)), qty);

    row.append(thumb, text, side);
    return row;
  };

  const renderBag = () => {
    if (!hasBag) return;
    const items = core.bagCount(bag);
    bagBody.replaceChildren();
    if (bag.length === 0) {
      const empty = el('div', 'bag__empty');
      const build = el('a', 'btn', 'Build a hoodie');
      build.href = 'hoodie.html';
      build.addEventListener('click', () => bagDialog.close());
      empty.append(el('p', '', 'Your bag is empty. Build a hoodie and it will show up here.'), build);
      bagBody.append(empty);
    } else {
      bagBody.append(...bag.map(renderLine));
    }
    bagTotal.textContent = core.money(core.bagTotal(catalog, bag));
    checkout.hidden = bag.length === 0;
    bagNote.textContent = catalog.guarantee;
    bagCount.textContent = String(items);
    bagCount.hidden = items === 0;
    bagOpen.setAttribute('aria-label', items === 0 ? 'Open bag, empty' : `Open bag, ${core.plural(items)}`);
  };

  if (hasBag) {
    bagOpen.addEventListener('click', () => {
      renderBag();
      bagStatus.textContent = '';
      bagDialog.showModal();
    });
    $('#bag-close').addEventListener('click', () => bagDialog.close());
    // Closing the bag hands the keyboard back to the button that opened it.
    bagDialog.addEventListener('close', () => bagOpen.focus());
    bagDialog.addEventListener('click', (event) => {
      // A click on the dimmed area outside the panel closes the bag.
      if (event.target === bagDialog) bagDialog.close();
    });
    checkout.addEventListener('click', () => {
      bagNote.textContent = 'Checkout is not connected yet. Your bag is saved on this device.';
    });
    // Another tab changed the bag: show the same thing here.
    window.addEventListener('storage', (event) => {
      if (event.key !== STORE_KEY) return;
      bag = loadBag();
      renderBag();
    });
    renderBag();
    syncs.push(() => {
      bag = loadBag();
      renderBag();
    });
  }

  /* ------------------------------------------------------------------
     Build your hoodie (hoodie page)
     ------------------------------------------------------------------ */
  const form = $('#build-form');
  if (form && hasBag) {
    const preview = $('#preview');
    const previewImg = $('#preview-img');
    const colorName = $('#color-name');
    const total = $('#total');
    const addBtn = $('#add-btn');
    let addedTimer = 0;

    const readConfig = () => {
      const data = new FormData(form);
      return {
        color: String(data.get('color')),
        print: String(data.get('print')),
        size: String(data.get('size')),
        power: String(data.get('power')),
      };
    };

    const showColor = (id, instant = false) => {
      const color = byId(catalog.colors, id);
      if (!color) return;
      colorName.textContent = color.name;
      if (preview.dataset.color === id) return;
      preview.dataset.color = id;
      const swap = () => {
        // A slower picture for a color picked earlier must not replace the one picked last.
        if (preview.dataset.color !== id) return;
        previewImg.src = color.image;
        previewImg.alt = `${color.name} Warmup hoodie, front view`;
        previewImg.classList.remove('is-swapping');
      };
      if (instant) {
        swap();
        return;
      }
      const next = new Image();
      previewImg.classList.add('is-swapping');
      next.onload = () => window.setTimeout(swap, reduceMotion.matches ? 0 : 160);
      next.onerror = swap;
      next.src = color.image;
    };

    const resetAddButton = () => {
      window.clearTimeout(addedTimer);
      addBtn.textContent = 'Add to bag';
    };

    const refresh = (instant = false) => {
      const config = readConfig();
      showColor(config.color, instant);
      total.textContent = core.money(core.unitPrice(catalog, config));
    };

    // A link such as hoodie.html?color=bone opens with that color picked.
    const wanted = new URLSearchParams(window.location.search).get('color');
    const wantedInput = wanted && byId(catalog.colors, wanted) ? $(`input[name="color"][value="${wanted}"]`, form) : null;
    if (wantedInput) wantedInput.checked = true;
    refresh(true);
    syncs.push(() => {
      refresh(true);
      resetAddButton();
    });

    form.addEventListener('change', () => {
      refresh();
      resetAddButton();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const before = core.bagCount(bag);
      bag = core.addToBag(catalog, bag, readConfig());
      const added = core.bagCount(bag) > before;
      window.clearTimeout(addedTimer);
      addedTimer = window.setTimeout(resetAddButton, 2400);
      if (!added) {
        // A line stops at the most the store allows.
        addBtn.textContent = `You already have ${catalog.maxQuantity} of these`;
        say(`Not added. You already have ${catalog.maxQuantity} of this hoodie in your bag.`);
        return;
      }
      saveBag();
      renderBag();
      say(`Added. ${core.plural(core.bagCount(bag))} in bag`);
      addBtn.textContent = 'Added to bag';
      bagCount.classList.remove('is-bumped');
      void bagCount.offsetWidth;
      bagCount.classList.add('is-bumped');
    });
  }

  // Coming back to a page: read every control again.
  window.addEventListener('pageshow', () => {
    for (const sync of syncs) sync();
  });
})();
