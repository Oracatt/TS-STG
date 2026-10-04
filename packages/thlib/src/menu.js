import { Keys } from './input.js';

/** Entries may provide action, enabled, description, value and adjust(direction). */
export class Menu {
  constructor({ title = 'TS-STG', subtitle = '', entries = [], onCancel, x = 655, y = 235, width = 270 } = {}) {
    this.title = title; this.subtitle = subtitle; this.entries = entries;
    this.onCancel = onCancel; this.index = 0; this.x = x; this.y = y; this.width = width;
    this.active = true;
    this._repeat = 0;
  }
  isEnabled(entry) { return typeof entry.enabled === 'function' ? entry.enabled() : entry.enabled !== false; }
  move(direction) {
    if (!this.entries.length) return;
    for (let i = 0; i < this.entries.length; i++) {
      this.index = (this.index + direction + this.entries.length) % this.entries.length;
      if (this.isEnabled(this.entries[this.index])) return;
    }
  }
  update(input, context) {
    if (!this.active) return;
    const direction = input.down(Keys.DOWN) ? 1 : input.down(Keys.UP) ? -1 : 0;
    if (input.pressed(Keys.DOWN) || input.pressed(Keys.UP)) { this.move(direction); this._repeat = 20; }
    else if (direction && --this._repeat <= 0) { this.move(direction); this._repeat = 7; }
    else if (!direction) this._repeat = 0;
    const entry = this.entries[this.index];
    if (entry && this.isEnabled(entry)) {
      if (input.pressed(Keys.LEFT)) entry.adjust?.(-1, context);
      if (input.pressed(Keys.RIGHT)) entry.adjust?.(1, context);
      if (input.pressed(Keys.CONFIRM) || input.pressed(Keys.SHOOT)) entry.action?.(context, entry);
    }
    if (input.pressed(Keys.CANCEL)) this.onCancel?.(context);
  }
  draw(draw) {
    const { x, y, width } = this;
    const visibleCount = Math.max(1, Math.min(this.entries.length, Math.floor((680 - y) / 44)));
    const first = Math.max(0, Math.min(this.index - visibleCount + 1, this.entries.length - visibleCount));
    const fitted = (text, size, available = width - 12) => Math.max(10, Math.min(size, available / (String(text).length * 0.58 || 1)));
    draw.rect(x - 24, y - 110, width + 36, visibleCount * 44 + 160, 0x111a2aed);
    draw.rect(x - 24, y - 110, width + 36, 2, 0xaf86b788);
    draw.text(this.title, x, y - 85, fitted(this.title, 28), 0xffdeefff);
    if (this.subtitle) draw.text(this.subtitle, x, y - 42, fitted(this.subtitle, 13), 0xa6b8d3ff);
    if (visibleCount < this.entries.length) draw.text(`${this.index + 1} / ${this.entries.length}`, x + width - 70, y - 20, 11, 0x8294aeff);
    this.entries.slice(first, first + visibleCount).forEach((entry, offset) => {
      const index = first + offset;
      const yy = y + offset * 44, selected = index === this.index, enabled = this.isEnabled(entry);
      if (selected) { draw.rect(x - 12, yy - 8, width, 36, 0x67869a33); draw.rect(x - 12, yy - 8, 3, 36, 0xf3a9d4ff); }
      const label = typeof entry.label === 'function' ? entry.label() : entry.label;
      const value = typeof entry.value === 'function' ? entry.value() : entry.value;
      const text = `${selected ? '> ' : '  '}${label}${value !== undefined ? `  ${value}` : ''}`;
      draw.text(text, x, yy, fitted(text, 19), !enabled ? 0x526079ff : selected ? 0xffe5f2ff : 0xbac9ddff);
    });
    const description = this.entries[this.index]?.description;
    if (description) draw.text(description, x - 4, y + visibleCount * 44 + 10, fitted(description, 12), 0x8294aeff);
  }
}
