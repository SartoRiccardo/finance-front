import { test } from 'node:test'
import assert from 'node:assert/strict'
import { money } from './money.ts'

// ICU separators vary (U+00A0 / U+202F) — normalize before comparing.
const norm = (s: string) => s.replace(/[\s  ]/g, ' ')

test('money sign + it-IT format', () => {
  assert.equal(norm(money('12.5', 'spend')), '-12,50 €')
  assert.equal(norm(money('12.5', 'earn')), '+12,50 €')
  assert.equal(norm(money(7)), '7,00 €')
})
