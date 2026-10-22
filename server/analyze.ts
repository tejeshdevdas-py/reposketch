import ts from 'typescript';
import path from 'node:path/posix';
import type { Analysis, Repository, Reference, FileNode, Edge } from '../shared/types.js';
import { isSource } from './files.js';

const ROOT = '/repo/';
const defaults: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  allowJs: true,
  resolveJsonModule: true,
  jsx: ts.JsxEmit.ReactJSX,
};

export function analyzeRepository(files: Record<string, string>, repository: Repository): Analysis {
  const sourcePaths = Object.keys(files).filter(isSource).sort();
  if (!sourcePaths.length)
    throw new Error('No JavaScript or TypeScript source files were found in this repository.');
  const sources = new Set(sourcePaths);
  const warnings = new Set<string>();
  const configs = new Map<string, ts.CompilerOptions>();
  const entries = new Map<string, string>();
  const virtualFiles = new Map(Object.entries(files).map(([p, text]) => [ROOT + p, text]));
  const directories = new Set<string>(['/repo', '/']);
  for (const p of virtualFiles.keys()) {
    let dir = path.dirname(p);
    while (dir !== '/') {
      directories.add(dir);
      dir = path.dirname(dir);
    }
  }
  const host: ts.ModuleResolutionHost = {
    fileExists: (p) => virtualFiles.has(path.normalize(p)),
    readFile: (p) => virtualFiles.get(path.normalize(p)),
    directoryExists: (p) => directories.has(path.normalize(p)),
    getCurrentDirectory: () => '/repo',
    realpath: (p) => p,
  };

  for (const [p, text] of Object.entries(files)) {
    if (/(^|\/)(tsconfig|jsconfig)\.json$/.test(p)) {
      const parsed = ts.parseConfigFileTextToJson(p, text);
      if (parsed.error) {
        warnings.add(`${p}: configuration could not be parsed; using relative imports only.`);
        continue;
      }
      if (parsed.config.extends)
        warnings.add(
          `${p}: inherited configuration is not loaded. Aliases defined only in the parent may be unresolved.`,
        );
      if (parsed.config.references?.length)
        warnings.add(
          `${p}: referenced configuration files are not loaded. Aliases or workspace settings defined there may be unresolved; external import classifications are provisional.`,
        );
      const converted = ts.convertCompilerOptionsFromJson(
        parsed.config.compilerOptions ?? {},
        ROOT + path.dirname(p),
      );
      configs.set(path.dirname(p), {
        ...defaults,
        ...converted.options,
        pathsBasePath: path.normalize(ROOT + path.dirname(p)),
      });
      if (converted.errors.length) warnings.add(`${p}: some compiler settings are unsupported.`);
    }
    if (path.basename(p) === 'package.json') {
      try {
        const pkg = JSON.parse(text);
        const candidates = [
          pkg.source,
          pkg.main,
          pkg.module,
          ...(typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {})),
        ];
        for (const candidate of candidates)
          if (typeof candidate === 'string')
            entries.set(path.normalize(path.join(path.dirname(p), candidate)), `Declared in ${p}`);
      } catch {
        warnings.add(`${p}: package metadata could not be parsed.`);
      }
    }
  }

  function optionsFor(p: string): ts.CompilerOptions {
    let dir = path.dirname(p);
    while (true) {
      if (configs.has(dir)) return configs.get(dir)!;
      if (dir === '.') return defaults;
      dir = path.dirname(dir);
    }
  }

  const nodes: FileNode[] = [];
  const edges: Edge[] = [];
  for (const p of sourcePaths) {
    const source = files[p];
    const ast = ts.createSourceFile(p, source, ts.ScriptTarget.Latest, true);
    const imports: Reference[] = [];
    const options = optionsFor(p);
    const diagnostics = (ast as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics;
    if (diagnostics?.length)
      warnings.add(`${p}: syntax errors found; some dependencies may be missing.`);
    function add(specifier: string, node: ts.Node, kind: Reference['kind'], typeOnly = false) {
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      const resolved = ts.resolveModuleName(specifier, ROOT + p, options, host).resolvedModule;
      const targetPath = resolved?.resolvedFileName.replace(/^\/repo\//, '');
      const target = targetPath && sources.has(targetPath) ? targetPath : undefined;
      const aliasMatch = Object.keys(options.paths ?? {}).some((alias) => {
        const star = alias.indexOf('*');
        return star < 0
          ? alias === specifier
          : specifier.startsWith(alias.slice(0, star)) && specifier.endsWith(alias.slice(star + 1));
      });
      const external =
        !target &&
        !specifier.startsWith('.') &&
        !specifier.startsWith('/') &&
        !specifier.startsWith('#') &&
        !specifier.startsWith('@/') &&
        !specifier.startsWith('~/') &&
        !aliasMatch &&
        !targetPath;
      imports.push({ specifier, line, kind, typeOnly, target, external });
      if (target)
        edges.push({
          id: `${p}:${line}:${imports.length}`,
          source: p,
          target,
          line,
          kind,
          typeOnly,
        });
    }
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyTypes =
          !!clause?.isTypeOnly ||
          (!clause?.name &&
            !!bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((e) => e.isTypeOnly));
        add(node.moduleSpecifier.text, node, 'import', onlyTypes);
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        const clause = node.exportClause;
        const onlyTypes =
          node.isTypeOnly ||
          (!!clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((e) => e.isTypeOnly));
        add(node.moduleSpecifier.text, node, 'export', onlyTypes);
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        add(node.moduleReference.expression.text, node, 'require', node.isTypeOnly);
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteralLike(node.argument.literal)
      ) {
        add(node.argument.literal.text, node, 'import', true);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg))
          add(
            arg.text,
            node,
            node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic' : 'require',
          );
        else
          warnings.add(
            `${p}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: computed import cannot be resolved statically.`,
          );
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    let entryReason = entries.get(p);
    if (!entryReason && /^(?:src\/)?(?:main|index|app|server)\.[cm]?[jt]sx?$/i.test(p))
      entryReason = 'Conventional entry filename';
    nodes.push({
      id: p,
      path: p,
      name: path.basename(p),
      directory: path.dirname(p),
      source,
      lines: source.split('\n').length,
      imports,
      entryReason,
      url: repository.isDemo
        ? undefined
        : `${repository.url}/blob/${repository.commit}/${p.split('/').map(encodeURIComponent).join('/')}`,
    });
  }
  const allImports = nodes.flatMap((n) => n.imports);
  const packages = new Set(
    allImports
      .filter((i) => i.external)
      .map((i) =>
        i.specifier.startsWith('@')
          ? i.specifier.split('/').slice(0, 2).join('/')
          : i.specifier.split('/')[0],
      ),
  );
  const unresolved = allImports.filter((i) => !i.target && !i.external).length;
  if (unresolved)
    warnings.add(
      `${unresolved} reference${unresolved === 1 ? '' : 's'} could not be linked to an analyzed source file. These may be assets, generated files, workspace packages, or unsupported aliases.`,
    );
  return {
    repository,
    files: nodes,
    edges,
    warnings: [...warnings],
    stats: {
      files: nodes.length,
      connections: edges.length,
      packages: packages.size,
      unresolved,
      lines: nodes.reduce((sum, n) => sum + n.lines, 0),
    },
  };
}
