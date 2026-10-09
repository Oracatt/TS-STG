
export interface DrawQueueOptions { defaultLayer?: number; priorityForLayer?: (layer: number) => number | undefined; }

export interface DrawQueueOrder { order?: number; secondary?: number; }

export interface DrawQueuePlacement extends DrawQueueOrder { layer?: number | null; }

export interface DrawQueueFlush {
  minimumLayer?: number; maximumLayer?: number; minimumPriority?: number; maximumPriority?: number;
}

import { DrawList } from './render.js';

export type DrawQueueEntry = { layer: number | null; priority: number; secondary?: number; order?: number; sequence: number } & ({commands: import('./core-types.js').DrawCommand[]; callback?: undefined} | {callback: (draw: DrawList) => void; commands?: undefined});

const compareEntries = (a: DrawQueueEntry, b: DrawQueueEntry) => a.priority - b.priority || (a.secondary ?? 0) - (b.secondary ?? 0) ||
  ((a.order ?? Infinity) - (b.order ?? Infinity)) || a.sequence - b.sequence;

/** Stable cross-owner rendering. A configurable map relates logical layers to
 * callback priorities; the default is identity. Captured command batches and
 * deferred drawable callbacks share the same ordering and partial flush rules.
 */
export class LayeredDrawQueue extends DrawList {

  declare defaultLayer: number;
  declare priorityForLayer: (layer: number) => number | undefined;
  declare entries: DrawQueueEntry[];
  declare sequence: number;
  declare sorted: boolean;

  constructor({ defaultLayer = 0, priorityForLayer = layer => layer }: DrawQueueOptions = {}) {
    super(); this.defaultLayer = defaultLayer; this.priorityForLayer = priorityForLayer;
    this.entries = []; this.sequence = 0; this.sorted = true;
  }
  reset(): this { super.reset(); this.entries.length = 0; this.sequence = 0; this.sorted = true; return this; }
  layerPriority(layer: number): number {
    if (!Number.isFinite(layer)) throw new TypeError('Render layer must be finite');
    const priority = this.priorityForLayer(layer);
    if (!Number.isFinite(priority)) throw new RangeError(`No finite render priority for layer ${layer}`);
    return priority!;
  }
  drainCommands(): void {
    if (this.commands.length) {
      const priority = this.layerPriority(this.defaultLayer);
      this.sorted = false;
      this.entries.push({ layer: this.defaultLayer, priority, sequence: this.sequence++, commands: this.commands.splice(0) });
    }
  }
  /** Capture commands immediately, before later mutations of application state. */
  enqueue(layer: number, callback: (draw: DrawList) => void, options: DrawQueueOrder = {}): this {
    return this.enqueuePriority(this.layerPriority(layer), callback, { ...options, layer });
  }
  enqueuePriority(priority: number, callback: (draw: DrawList) => void, { order = Infinity, layer = null, secondary = 0 }: DrawQueuePlacement = {}): this {
    if (!Number.isFinite(priority)) throw new TypeError('Render priority must be finite');
    this.drainCommands(); const draw = new DrawList(); callback(draw); this.sorted = false;
    this.entries.push({ layer, priority, secondary, order, sequence: this.sequence++, commands: draw.commands }); return this;
  }
  /** Defer a generic drawable until flush. Its ordering is captured now. */
  enqueueDrawable(callback: (draw: DrawList) => void, { layer = this.defaultLayer, priority = this.layerPriority(layer!), secondary = 0, order = Infinity }: DrawQueuePlacement & { priority?: number } = {}): this {
    if (!Number.isFinite(priority)) throw new TypeError('Render priority must be finite');
    if (typeof callback !== 'function') throw new TypeError('Drawable callback required');
    this.drainCommands(); this.sorted = false;
    this.entries.push({ layer, priority, secondary, order, sequence: this.sequence++, callback }); return this;
  }
  flush<T extends DrawList>(target: T, { minimumLayer = -Infinity, maximumLayer = Infinity, minimumPriority = -Infinity, maximumPriority = Infinity }: DrawQueueFlush = {}): T {
    if ((target as DrawList) === this) throw new TypeError('Render queue cannot flush into itself'); this.drainCommands();
    if (!this.sorted) { this.entries.sort(compareEntries); this.sorted = true; }
    const retained = [];
    for (const entry of this.entries) {
      if ((entry.layer !== null && (entry.layer < minimumLayer || entry.layer > maximumLayer)) || entry.priority < minimumPriority || entry.priority > maximumPriority) {
        retained.push(entry); continue;
      }
      if (entry.callback) entry.callback(target); else for (const command of entry.commands) target.push(command);
    }
    this.entries = retained; return target;
  }
}
