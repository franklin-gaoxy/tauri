/** 输入弹层与轻提示：不用 window.prompt，WebView2 里样式和交互都不可控 */

export function askFileName(dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">新建文件</div>
        <div class="modal-sub"></div>
        <input class="modal-input" type="text" placeholder="文件名，例如：新笔记" />
        <div class="modal-actions">
          <button type="button" class="btn-ghost modal-cancel">取消</button>
          <button type="button" class="btn-primary modal-ok">创建</button>
        </div>
      </div>`;

    const input = overlay.querySelector<HTMLInputElement>('.modal-input')!;
    overlay.querySelector<HTMLElement>('.modal-sub')!.textContent = dir;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      } else if (e.key === 'Enter' && document.activeElement === input) {
        e.preventDefault();
        submit();
      }
    };

    const done = (value: string | null) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    const submit = () => {
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return;
      }
      done(value);
    };

    overlay.querySelector<HTMLElement>('.modal-ok')!.addEventListener('click', submit);
    overlay.querySelector<HTMLElement>('.modal-cancel')!.addEventListener('click', () => done(null));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(null);
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    input.focus();
  });
}

export function toast(message: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}
