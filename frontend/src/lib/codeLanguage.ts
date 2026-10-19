import hljs from "highlight.js";

import { fileNameParts } from "./fileNameParts";

/**
 * Whole filenames that name a language on their own.
 */
export const LANGUAGE_BY_NAME = new Map<string, string>([
  ["makefile", "makefile"],
  ["justfile", "makefile"],
  ["dockerfile", "dockerfile"],
  ["gemfile", "ruby"],
  ["rakefile", "ruby"],
  ["brewfile", "ruby"],
  ["vagrantfile", "ruby"],
]);

/**
 * Extensions, and the leading segment of a dotfile, mapped to a highlight.js
 * language.
 *
 * Absence is a decision, not an omission: `.vue`, `.svelte`, `.tf`, `.rst`,
 * `.csv` and `.log` have no grammar in the bundle, and a name with no entry
 * is rendered without colour rather than handed to a grammar that will
 * describe it wrongly.
 */
export const LANGUAGE_BY_TOKEN = new Map<string, string>([
  ["rs", "rust"],
  ["go", "go"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["swift", "swift"],
  ["dart", "dart"],
  ["rb", "ruby"],
  ["php", "php"],
  ["lua", "lua"],
  ["r", "r"],
  ["py", "python"],
  ["c", "c"],
  ["h", "c"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["hpp", "cpp"],
  ["cs", "csharp"],
  ["java", "java"],
  ["scala", "scala"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["ts", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["tsx", "typescript"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "javascript"],
  ["json", "json"],
  ["css", "css"],
  ["html", "xml"],
  ["xml", "xml"],
  ["yml", "yaml"],
  ["yaml", "yaml"],
  ["toml", "ini"],
  ["ini", "ini"],
  ["cfg", "ini"],
  ["conf", "ini"],
  ["env", "ini"],
  ["properties", "ini"],
  ["editorconfig", "ini"],
  ["gitconfig", "ini"],
  ["gitmodules", "ini"],
  ["npmrc", "ini"],
  ["babelrc", "json"],
  ["eslintrc", "json"],
  ["prettierrc", "json"],
  ["gradle", "groovy"],
  ["cmake", "cmake"],
  ["mk", "makefile"],
  ["dockerfile", "dockerfile"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["sql", "sql"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["proto", "protobuf"],
  ["patch", "diff"],
  ["diff", "diff"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["adoc", "asciidoc"],
  ["tex", "latex"],
]);

/**
 * The highlight.js language for a filename, or `null` when there is none.
 *
 * `null` means the text is rendered without colour. The alternative —
 * `highlightAuto` — reads the content and guesses, which on a short file or a
 * configuration file lands confidently on the wrong grammar, and a wrong
 * colour says something false about the code with nothing on screen to
 * suggest it was a guess.
 */
export function codeLanguageFor(filename: string): string | null {
  const { base, token } = fileNameParts(filename);
  const name = LANGUAGE_BY_NAME.get(base) ?? (token === null ? undefined : LANGUAGE_BY_TOKEN.get(token));
  if (name === undefined) return null;
  // A name the bundle does not carry would make `hljs.highlight` throw.
  return hljs.getLanguage(name) ? name : null;
}
