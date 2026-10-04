import { LayeredDrawQueue } from '../layered-render.js';
import { TOUHOU_LAYER_PRIORITIES } from './render-order.js';
export { TOUHOU_LAYER_PRIORITIES, TOUHOU_OWNER_PRIORITIES, effectiveAnmLayer, anmDrawPriority } from './render-order.js';

/** Original layer table and ANM registration-order bridge. The shared queue
 * itself knows only numeric priorities, command batches and drawable callbacks.
 */
export class TouhouRenderQueue extends LayeredDrawQueue {
  constructor({ defaultLayer = 0, layerPriorities = TOUHOU_LAYER_PRIORITIES } = {}) {
    super({ defaultLayer, priorityForLayer: layer => layerPriorities[layer] });
    this.layerPriorities = layerPriorities;
    this.seen = new Set();
  }
  reset() { super.reset(); this.seen.clear(); return this; }
  enqueueAnm(vm, view) {
    this.drainCommands(); if (this.seen.has(vm)) return this; this.seen.add(vm);
    const priority = vm.drawPriority;
    if (priority === undefined) return this; // No original callback for this layer.
    const capturedView = { ...view };
    return this.enqueueDrawable(target => vm.drawSelf(target, capturedView), {
      layer: vm.effectiveLayer, priority, secondary: +vm.renderSecondary, order: vm.renderOrder,
    });
  }
  enqueue(layer, callback, { order = Infinity } = {}) {
    if (!Number.isFinite(layer)) throw new TypeError('Render layer must be finite');
    const priority = this.layerPriorities[layer];
    if (priority === undefined) throw new RangeError(`No original ANM callback for layer ${layer}`);
    return this.enqueuePriority(priority, callback, { order, layer });
  }
}
