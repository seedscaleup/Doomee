/**
 * D6(b) — Fails the build on user-visible strings hard-coded in JSX.
 *
 * Biome has no such rule, so we walk the TypeScript AST ourselves and flag:
 *   - JsxText nodes containing letters;
 *   - literal values on translatable props (title, placeholder, aria-label, alt).
 *
 * Escape hatch: put `i18n-exempt` in a comment on the line above.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const SCAN_DIRS = ['src']
const TRANSLATABLE_PROPS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label'])
const EXEMPT_MARKER = 'i18n-exempt'
const HAS_LETTER = /\p{L}{2,}/u

type Finding = { file: string; line: number; text: string }

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectFiles(full))
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const COMMENT_LINE = /^\s*(\{?\/\*|\*|\/\/)/
const COMMENT_END = /\*\/\}?\s*$/

/**
 * The marker may sit on the offending line, or anywhere in the comment block
 * immediately above it — comments wrap, and a one-line-only lookback would
 * silently ignore the exemption.
 */
function isExempt(source: ts.SourceFile, pos: number): boolean {
  const { line } = source.getLineAndCharacterOfPosition(pos)
  const lines = source.getFullText().split('\n')

  if ((lines[line] ?? '').includes(EXEMPT_MARKER)) return true

  for (let cursor = line - 1; cursor >= 0; cursor -= 1) {
    const text = lines[cursor] ?? ''
    if (text.includes(EXEMPT_MARKER)) return true
    if (!COMMENT_LINE.test(text) && !COMMENT_END.test(text)) break
  }

  return false
}

function scan(file: string): Finding[] {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  const findings: Finding[] = []

  const report = (pos: number, value: string) => {
    if (isExempt(source, pos)) return
    const { line } = source.getLineAndCharacterOfPosition(pos)
    findings.push({ file: relative(ROOT, file), line: line + 1, text: value.trim() })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) {
      report(node.getStart(source), node.text)
    }

    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text
      const initializer = node.initializer
      if (TRANSLATABLE_PROPS.has(name) && initializer && ts.isStringLiteral(initializer)) {
        if (HAS_LETTER.test(initializer.text))
          report(node.getStart(source), `${name}="${initializer.text}"`)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return findings
}

const files = SCAN_DIRS.flatMap((dir) => collectFiles(join(ROOT, dir)))
const findings = files.flatMap(scan)

if (findings.length > 0) {
  console.error(`\n✖ ${findings.length} hard-coded user-facing string(s) found:\n`)
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${JSON.stringify(f.text)}`)
  console.error(`\nUse next-intl (CLAUDE.md rule 6), or add a "${EXEMPT_MARKER}" comment.\n`)
  process.exit(1)
}

console.warn(`✔ check:i18n — no hard-coded strings in ${files.length} .tsx file(s)`)
