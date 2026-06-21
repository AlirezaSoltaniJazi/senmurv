import { lstatSync } from 'node:fs';

// Filter out symbolic links: Prettier 3.x errors when an explicit path is a symlink,
// and we intentionally check in symlinks like `.claude/claude.md` → `../agents.md`
// so several AI tools can share one source of instructions.
const realFiles = (files) =>
  files.filter((file) => {
    try {
      return !lstatSync(file).isSymbolicLink();
    } catch {
      return false;
    }
  });

const quote = (file) => `"${file}"`;

const eslintAndPrettier = (files) => {
  const list = realFiles(files);
  if (list.length === 0) return [];
  const joined = list.map(quote).join(' ');
  return [`eslint --fix ${joined}`, `prettier --write ${joined}`];
};

const prettierOnly = (files) => {
  const list = realFiles(files);
  if (list.length === 0) return [];
  return [`prettier --write ${list.map(quote).join(' ')}`];
};

export default {
  'src/**/*.{ts,tsx}': eslintAndPrettier,
  'tests/**/*.{ts,tsx}': eslintAndPrettier,
  '*.{json,md,yml}': prettierOnly,
};
