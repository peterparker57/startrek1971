const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Teletype {
  constructor(outputEl, inputEl, formEl, sound = null) {
    this.out = outputEl;
    this.input = inputEl;
    this.form = formEl;
    this.sound = sound;
    this.charDelayMs = 8;
    this.lineDelayMs = 0;
    this._tail = null;        // current text node accumulating output
    this._inputNode = null;   // dedicated text node during ask()
    this._wireInputSync();
    this._wireRefocus();
  }

  setSpeed(charsPerSecond) {
    this.charDelayMs = charsPerSecond > 0 ? 1000 / charsPerSecond : 0;
    if (this.sound) this.sound.setCharDuration(this.charDelayMs || 80);
  }

  setDelayMs(ms) {
    this.charDelayMs = Math.max(0, ms);
    if (this.sound) this.sound.setCharDuration(this.charDelayMs || 80);
  }

  scrollToBottom() {
    this.out.scrollTop = this.out.scrollHeight;
  }

  _ensureTail() {
    if (!this._tail || this._tail.parentNode !== this.out) {
      this._tail = document.createTextNode('');
      this.out.appendChild(this._tail);
    }
    return this._tail;
  }

  _appendText(text) {
    this._ensureTail();
    this._tail.data += text;
  }

  appendBlock(el) {
    this.out.appendChild(el);
    this._tail = null;
    this.scrollToBottom();
  }

  async typeInto(el, text) {
    if (!text) return;
    if (this.sound) this.sound.resume();
    let node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      node = document.createTextNode('');
      el.appendChild(node);
    }
    if (this.charDelayMs <= 0) {
      node.data += text;
      this.scrollToBottom();
      return;
    }
    for (const ch of text) {
      node.data += ch;
      this.scrollToBottom();
      if (this.sound) this.sound.tick(ch);
      if (ch !== '\n' || this.lineDelayMs > 0) {
        await sleep(ch === '\n' ? this.lineDelayMs : this.charDelayMs);
      }
    }
  }

  _wireInputSync() {
    this.input.addEventListener('input', () => {
      if (!this._inputNode) return;
      this._inputNode.data = this.input.value.toUpperCase();
      this.scrollToBottom();
    });
  }

  _wireRefocus() {
    const refocus = () => {
      if (!this.input.disabled) this.input.focus({ preventScroll: true });
      if (this.sound) this.sound.resume();
    };
    document.addEventListener('click', refocus);
    document.addEventListener('touchstart', refocus, { passive: true });
    window.addEventListener('focus', refocus);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refocus();
    });
  }

  async print(text) {
    if (!text) return;
    if (this.sound) this.sound.resume();
    if (this.charDelayMs <= 0) {
      this._appendText(text);
      this.scrollToBottom();
      return;
    }
    for (const ch of text) {
      this._appendText(ch);
      this.scrollToBottom();
      if (this.sound) this.sound.tick(ch);
      if (ch !== '\n' || this.lineDelayMs > 0) {
        await sleep(ch === '\n' ? this.lineDelayMs : this.charDelayMs);
      }
    }
  }

  async println(text = '') {
    await this.print(text + '\n');
  }

  async ask(prompt = '') {
    if (prompt) await this.print(prompt);
    this.input.value = '';
    this.input.disabled = false;
    this._inputNode = document.createTextNode('');
    this.out.appendChild(this._inputNode);
    this._tail = this._inputNode;
    this.out.classList.add('awaiting-input');
    this.input.focus({ preventScroll: true });

    return new Promise((resolve) => {
      const handler = (ev) => {
        ev.preventDefault();
        const value = this.input.value;
        this._inputNode.data = value.toUpperCase() + '\n';
        this._inputNode = null;
        this._tail = null;
        this.input.value = '';
        this.input.disabled = true;
        this.out.classList.remove('awaiting-input');
        this.form.removeEventListener('submit', handler);
        this.scrollToBottom();
        resolve(value);
      };
      this.form.addEventListener('submit', handler);
    });
  }
}
