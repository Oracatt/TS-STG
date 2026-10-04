import { DrawList } from './core.js';
export interface DrawQueueOptions { defaultLayer?: number; priorityForLayer?: (layer: number) => number | undefined; }
export interface DrawQueueOrder { order?: number; secondary?: number; }
export interface DrawQueuePlacement extends DrawQueueOrder { layer?: number | null; }
export interface DrawQueueFlush {
  minimumLayer?: number; maximumLayer?: number; minimumPriority?: number; maximumPriority?: number;
}
export class LayeredDrawQueue extends DrawList {
  constructor(options?: DrawQueueOptions);
  defaultLayer: number; priorityForLayer: (layer: number) => number | undefined;
  entries: unknown[]; sequence: number; sorted: boolean;
  reset(): this; layerPriority(layer: number): number; drainCommands(): void;
  enqueue(layer: number, callback: (draw: DrawList) => void, options?: DrawQueueOrder): this;
  enqueuePriority(priority: number, callback: (draw: DrawList) => void, options?: DrawQueuePlacement): this;
  enqueueDrawable(callback: (draw: DrawList) => void, options?: DrawQueuePlacement & { priority?: number }): this;
  flush<T extends DrawList>(target: T, options?: DrawQueueFlush): T;
}
