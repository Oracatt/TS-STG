export type { TouhouShooter as Th20Shooter, TouhouSht as Th20Sht } from '@ts-stg/thlib/touhou/shot-data';
import type { TouhouSht } from '@ts-stg/thlib/touhou/shot-data';
export function parseTh20Sht(source:Uint8Array|ArrayBuffer):TouhouSht;
