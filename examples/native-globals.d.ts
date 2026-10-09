import type {NativeHost} from '@ts-stg/thlib';

declare global {
  var tsstg: NativeHost;
  var __tsstg_game: {
    update(mask?: number): unknown;
    render(): unknown[][];
    snapshot(): unknown;
    destroy?(): void;
  };
  var __TOUHOU_FRAMEWORK_OPTIONS: {character?: number; autostart?: boolean} | undefined;
}

export {};
