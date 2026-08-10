import { describe, expect, it } from 'bun:test'
import { readingResultButtonLabel } from '../src/middleware/novel-search-results.js'

describe('readingResultButtonLabel', () => {
    it('returns the plain title without a provider prefix', () => {
        expect(readingResultButtonLabel({ title: 'Classroom of the Elite' })).toBe('Classroom of the Elite')
    })

    it('truncates titles longer than 48 characters to 48 with an ellipsis', () => {
        const label = readingResultButtonLabel({ title: 'A'.repeat(60) })
        expect(label).toBe(`${'A'.repeat(45)}...`)
        expect(label.length).toBe(48)
    })

    it('keeps a 48-character title untouched', () => {
        const title = 'B'.repeat(48)
        expect(readingResultButtonLabel({ title })).toBe(title)
    })
})
