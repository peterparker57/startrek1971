// On-screen keypad for phone use. Buttons drive the hidden #cmd input
// via synthetic input events so the teletype echo continues to work,
// and ENTER triggers the form's submit handler.

const KEYS = [
  ['1', '2', '3', 'I'],
  ['4', '5', '6', 'D'],
  ['7', '8', '9', 'S'],
  ['.', '0', '?', { label: '⌫', action: 'back' }],
  [
    { label: 'ENTER', action: 'enter', span: 3 },
    { label: '⌨', action: 'kbd' },
  ],
];

export class Keypad {
  constructor(rootEl, inputEl, formEl) {
    this.root = rootEl;
    this.input = inputEl;
    this.form = formEl;
    this._render();
    this._wire();
  }

  _render() {
    this.root.innerHTML = '';
    for (const row of KEYS) {
      for (const cell of row) {
        const def = typeof cell === 'string' ? { label: cell, key: cell } : cell;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kp-key';
        if (def.action) btn.classList.add('kp-' + def.action);
        if (def.span && def.span > 1) btn.style.gridColumn = 'span ' + def.span;
        btn.textContent = def.label;
        btn.dataset.key = def.key || '';
        btn.dataset.action = def.action || 'char';
        this.root.appendChild(btn);
      }
    }
  }

  _wire() {
    this.root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.kp-key');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'enter') return this._enter();
      if (action === 'back') return this._back();
      if (action === 'kbd') return this._toggleKbd();
      this._char(btn.dataset.key);
    });
  }

  _char(ch) {
    if (this.input.disabled) return;
    this.input.value = (this.input.value + ch).toUpperCase();
    this._notifyInput();
  }

  _back() {
    if (this.input.disabled) return;
    if (!this.input.value.length) return;
    this.input.value = this.input.value.slice(0, -1);
    this._notifyInput();
  }

  _enter() {
    if (this.input.disabled) return;
    if (typeof this.form.requestSubmit === 'function') {
      this.form.requestSubmit();
    } else {
      this.form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  }

  _toggleKbd() {
    const showing = this.input.getAttribute('inputmode') !== 'none';
    if (showing) {
      this.input.setAttribute('inputmode', 'none');
      this.input.blur();
    } else {
      this.input.setAttribute('inputmode', 'text');
      if (!this.input.disabled) this.input.focus();
    }
  }

  _notifyInput() {
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
