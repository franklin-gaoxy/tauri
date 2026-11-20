/**
 * 菜单栏：仿 Typora 的下拉菜单，支持分隔线、快捷键提示、勾选状态、禁用态与多级子菜单。
 * 每次打开都重建内容，保证勾选/可用状态与当前状态一致。
 */
export interface MenuItem {
  label?: string | (() => string);
  hint?: string;
  run?: () => void;
  separator?: true;
  submenu?: MenuItem[];
  checked?: () => boolean;
  disabled?: () => boolean;
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

const resolveLabel = (label: MenuItem['label']) => (typeof label === 'function' ? label() : (label ?? ''));

/** 子菜单贴在父项右侧；贴到窗口边缘时翻到左边 */
function placeSub(sub: HTMLElement) {
  sub.style.left = '100%';
  sub.style.top = '-4px';
  sub.style.right = 'auto';
  const rect = sub.getBoundingClientRect();
  if (rect.right > window.innerWidth - 6) {
    sub.style.left = 'auto';
    sub.style.right = '100%';
  }
  if (rect.bottom > window.innerHeight - 6) {
    sub.style.top = `${Math.min(0, window.innerHeight - rect.bottom - 8)}px`;
  }
}

function buildItems(pop: HTMLElement, items: MenuItem[], onSelect: () => void) {
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      pop.appendChild(sep);
      continue;
    }

    // 有子菜单的项用 div：子菜单是它的后代，button 内不能再嵌交互元素
    const row = document.createElement(item.submenu ? 'div' : 'button') as HTMLElement & { disabled?: boolean };
    if (row instanceof HTMLButtonElement) row.type = 'button';
    row.className = 'menu-item';
    row.addEventListener('mousedown', (e) => e.preventDefault());

    const disabled = item.disabled?.() ?? false;
    if (disabled) {
      row.disabled = true;
      row.classList.add('is-disabled');
    }

    const check = document.createElement('span');
    check.className = 'menu-check';
    check.textContent = item.checked?.() ? '✓' : '';
    row.appendChild(check);

    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = resolveLabel(item.label);
    row.appendChild(label);

    if (item.submenu) {
      row.classList.add('has-sub');
      const arrow = document.createElement('span');
      arrow.className = 'menu-arrow';
      arrow.textContent = '▸';
      row.appendChild(arrow);

      const sub = document.createElement('div');
      sub.className = 'menu-pop';
      sub.hidden = true;
      buildItems(sub, item.submenu, onSelect);
      row.appendChild(sub);

      row.addEventListener('mouseenter', () => {
        if (disabled) return;
        // 同级只保留一个展开的子菜单
        pop.querySelectorAll<HTMLElement>('.menu-pop').forEach((el) => {
          el.hidden = true;
        });
        sub.hidden = false;
        placeSub(sub);
      });
      row.addEventListener('mouseleave', () => {
        sub.hidden = true;
      });
      pop.appendChild(row);
      continue;
    }

    if (item.hint) {
      const hint = document.createElement('span');
      hint.className = 'menu-hint';
      hint.textContent = item.hint;
      row.appendChild(hint);
    }

    row.addEventListener('click', () => {
      if (disabled) return;
      onSelect();
      item.run?.();
    });
    pop.appendChild(row);
  }
}

export function createMenuBar(host: HTMLElement, menus: MenuDef[]) {
  let openIndex = -1;
  const buttons: HTMLButtonElement[] = [];
  const pops: HTMLElement[] = [];

  const hideAll = () => {
    host.querySelectorAll<HTMLElement>('.menu-pop').forEach((el) => {
      el.hidden = true;
    });
    buttons.forEach((btn) => btn.classList.remove('active'));
  };

  const close = () => {
    if (openIndex < 0) return;
    hideAll();
    openIndex = -1;
  };
  const openAt = (index: number) => {
    if (openIndex === index) return;
    hideAll();
    openIndex = index;
    pops[index].textContent = '';
    buildItems(pops[index], menus[index].items, close);
    buttons[index].classList.add('active');
    pops[index].hidden = false;
  };

  menus.forEach((def, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'menu';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.textContent = def.label;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openIndex === index) close();
      else openAt(index);
    });
    btn.addEventListener('mouseenter', () => {
      if (openIndex >= 0) openAt(index);
    });

    const pop = document.createElement('div');
    pop.className = 'menu-pop';
    pop.hidden = true;

    wrap.append(btn, pop);
    host.appendChild(wrap);
    buttons.push(btn);
    pops.push(pop);
  });

  document.addEventListener('mousedown', (e) => {
    if (openIndex < 0) return;
    const target = e.target as Node;
    if (pops[openIndex].contains(target) || buttons[openIndex].contains(target)) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('blur', close);

  return { close };
}
