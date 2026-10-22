export const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const IGNORED = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'out', 'target']);

export function isIncludedPath(path: string): boolean {
  return !path.split('/').some((part) => part.startsWith('.') || IGNORED.has(part));
}

export function isSource(path: string): boolean {
  return isIncludedPath(path) && SOURCE.test(path) && !/\.d\.[cm]?ts$/i.test(path);
}

export function isConfig(path: string): boolean {
  return (
    isIncludedPath(path) && /(?:^|\/)(?:package|tsconfig(?:\.[\w-]+)?|jsconfig)\.json$/.test(path)
  );
}
