import { js as beautifyJs } from 'js-beautify';

/** Pretty-print JavaScript (great for decoded one-line bookmarklets). */
export function formatJs(code: string): string {
  return beautifyJs(code, {
    indent_size: 2,
    space_in_empty_paren: true,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: false,
  });
}
