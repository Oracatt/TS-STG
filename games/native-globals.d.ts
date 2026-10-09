import type { NativeHost } from '@ts-stg/thlib';
declare global {
 var tsstg: NativeHost;
 var __tsstg_game: unknown;
 var __TH20_DEMO_OPTIONS: import('./touhou20/main.js').Th20DemoOptions|undefined;
}
export {};
