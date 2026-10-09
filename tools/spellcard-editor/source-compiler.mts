import ts from 'typescript';
import {SourceMap} from 'node:module';
import type {SourceMapPayload} from 'node:module';
import {validateSpellSource} from './source.js';

export interface SpellSourceDiagnostic {
  fileName: string;
  line: number;
  column: number;
  code: number;
  message: string;
}

export class SpellSourceSyntaxError extends SyntaxError {
  constructor(readonly diagnostics: readonly SpellSourceDiagnostic[]) {
    super(diagnostics.map(diagnostic =>
      `${diagnostic.fileName}:${diagnostic.line}:${diagnostic.column}: TS${diagnostic.code} ${diagnostic.message}`
    ).join('\n'));
    this.name = 'SpellSourceSyntaxError';
  }
}

export interface CompiledSpellSource {
  code: string;
  fileName: string;
  sourceMap: SourceMap | null;
}

export function isSpellSourceFile(fileName: string): boolean {
  return /\.(?:m?ts|m?js)$/i.test(fileName) && !/\.d\.m?ts$/i.test(fileName);
}

/** Transpile a preview copy. The author's original text is never evaluated,
 * reformatted or overwritten here; ordinary JS keeps native syntax checking. */
export function compileSpellSource(source: unknown, fileName = 'untitled.spell.ts'): CompiledSpellSource {
  const text = validateSpellSource(source);
  if (!isSpellSourceFile(fileName)) throw new TypeError('只支持 JavaScript 或 TypeScript 文件（.js、.mjs、.ts 或 .mts）。');
  if (/\.m?js$/i.test(fileName)) return {code: text, fileName, sourceMap: null};
  const result = ts.transpileModule(text, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
      useDefineForClassFields: false,
      sourceMap: true,
      inlineSources: true,
      newLine: ts.NewLineKind.LineFeed,
    },
  });
  const diagnostics = (result.diagnostics ?? [])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => {
      const location = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return {fileName, line: (location?.line ?? 0) + 1, column: (location?.character ?? 0) + 1,
        code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')};
    });
  if (diagnostics.length) throw new SpellSourceSyntaxError(diagnostics);
  // This payload is produced by the compiler above, never by an authored file.
  const payload = JSON.parse(result.sourceMapText!) as SourceMapPayload;
  const sourceMap = new SourceMap(payload);
  const inlineMap = Buffer.from(result.sourceMapText!, 'utf8').toString('base64');
  const code = result.outputText.replace(/\/\/# sourceMappingURL=[^\r\n]*\s*$/, '') +
    `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${inlineMap}\n`;
  return {code, fileName, sourceMap};
}

/** Neither native backend consumes source maps. Map its generated JS stack in
 * the desktop host, including QuickJS locations that omit a column. */
export function mapSpellSourceError(error: string, generatedFile: string, compiled: CompiledSpellSource): string {
  if (!compiled.sourceMap) return error;
  const escaped = generatedFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return error.replace(new RegExp(`${escaped}:(\\d+)(?::(\\d+))?`, 'g'), (location, line: string, column?: string) => {
    const original = compiled.sourceMap!.findOrigin(Number(line), Number(column ?? 1));
    if (!('lineNumber' in original)) return location;
    return `${compiled.fileName}:${original.lineNumber}:${original.columnNumber}`;
  });
}
