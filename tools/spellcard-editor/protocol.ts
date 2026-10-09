import type {NativeHost} from '@ts-stg/thlib';
import type {TouhouBossPresentation, TouhouBulletField, TouhouEnemy, TouhouGame, TouhouLaserField, TouhouPlayer, TouhouRNG} from '@ts-stg/thlib/touhou';
import type {SpellMetadata} from './metadata.js';

export interface SpellContext {
  boss: TouhouEnemy; player: TouhouPlayer; bullets: TouhouBulletField; lasers: TouhouLaserField;
  game: TouhouGame; random: TouhouRNG; presentation: TouhouBossPresentation;
  sound?: (id: number, x?: number) => void; clear(): void;
}
export interface SpellRunner {
  readonly frame: number; readonly alive: boolean; readonly completed?: boolean;
  update(): unknown; stop(): void; snapshot?(): unknown;
}
export type SpellFactory = (context: SpellContext) => SpellRunner;
export interface SpellModule {spellCard: unknown; createSpell: SpellFactory;}
export type PreviewCommand = {action: 'pause'|'play'|'restart'|'step'} | {action: 'seek'; frame: number} | {action: 'invincible'; value: boolean};
export type QueuedCommand = PreviewCommand & {id: number};
export interface PreviewControl {
  revision: number; documentRevision: number; commands: QueuedCommand[];
  document?: SpellMetadata; modulePath?: string; invincible?: boolean; input?: number;
}
export interface PreviewReceipt {documentRevision?: number; commandId?: number; accepted?: boolean; updated?: boolean;}
export interface PreviewBounds {x: number; y: number; width: number; height: number; visible: boolean;}
export interface PreviewStatus {
  revision?: number; documentRevision?: number; requestedDocumentRevision?: number; commandId?: number;
  document?: SpellMetadata|null; frame?: number; loading?: boolean; playing?: boolean; settling?: boolean; seeking?: boolean;
  waitingForControl?: boolean; transportWarning?: string|null; invincible?: boolean; exited?: boolean; gamePaused?: boolean;
  completed?: boolean; bullets?: number; lasers?: number; error?: string|null; running?: boolean;
  errorStack?: string;
  player?: {x: number; y: number; lives: number; bombs: number; deaths: number; state: number}|null;
}
export interface SourceDocument {source?: string|null; path?: string|null; cancelled?: boolean;}
export interface DesktopFrame {id: number; width: number; height: number; pixels: Uint8Array;}
export interface EditorBridge {
  desktop: true;
  loadInitialDocument(): Promise<SourceDocument>; loadDraft(): Promise<SourceDocument>;
  saveDraft(source: string): Promise<{saved: boolean}>; openDocument(): Promise<SourceDocument>;
  saveDocument(source: string, options?: {saveAs?: boolean; fileName?: string}): Promise<SourceDocument>;
  preview: {
    update(value: {source: string; fileName?: string}): Promise<PreviewReceipt>;
    bounds(value: PreviewBounds): Promise<PreviewReceipt>; control(value: PreviewCommand): Promise<PreviewReceipt>;
    status(): Promise<PreviewStatus>; input(mask: number): Promise<{accepted: boolean}>;
    onFrame(callback: (frame: DesktopFrame) => void): () => void;
  };
}
export type PreviewHost = NativeHost;

declare global { interface Window { spellCardEditor?: EditorBridge; } }
