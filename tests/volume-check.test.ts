import { afterEach, describe, expect, test } from 'bun:test'
import axios from 'axios'
import { getSeriesBooks } from '../src/details-service/providers/hardcover.ts'
import { formatNewVolumesMessage, formatVolumeReport, pendingVolumes } from '../src/middleware/volume-releases.ts'
import type { PendingVolume } from '../src/middleware/volume-releases.ts'

const originalPost = axios.post
const originalToken = process.env.HARDCOVER_API_TOKEN

function mockPost(response: unknown) {
    const calls: { query: string, variables: Record<string, unknown> }[] = []

    axios.post = ((url: string, body: { query: string, variables: Record<string, unknown> }) => {
        calls.push(body)
        return Promise.resolve({ data: response })
    }) as typeof axios.post

    return calls
}

afterEach(() => {
    axios.post = originalPost
    process.env.HARDCOVER_API_TOKEN = originalToken
})

describe('getSeriesBooks', () => {
    test('returns the positioned books of a series', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'

        const calls = mockPost({
            data: {
                series_by_pk: {
                    id: 12717,
                    book_series: [
                        { position: 1, book: { id: 1, title: 'Dungeon Crawler Carl', release_date: '2020-09-21' } },
                        { position: 2, book: { id: 2, title: 'Carl\'s Doomsday Scenario', release_date: '2021-01-19' } },
                    ],
                },
            },
        })

        expect(await getSeriesBooks('12717')).toEqual([
            { position: 1, title: 'Dungeon Crawler Carl', releaseDate: '2020-09-21' },
            { position: 2, title: 'Carl\'s Doomsday Scenario', releaseDate: '2021-01-19' },
        ])
        expect(calls[0]?.variables).toEqual({ id: 12717 })
    })

    test('skips entries without a position and returns them sorted', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'
        mockPost({
            data: {
                series_by_pk: {
                    book_series: [
                        { position: 3, book: { id: 3, title: 'Third' } },
                        { position: null, book: { id: 9, title: 'Companion novella' } },
                        { position: 1, book: { id: 1, title: 'First' } },
                    ],
                },
            },
        })

        expect(await getSeriesBooks('12717')).toEqual([
            { position: 1, title: 'First' },
            { position: 3, title: 'Third' },
        ])
    })

    test('keeps one book per position, using the earliest edition release date', async () => {
        process.env.HARDCOVER_API_TOKEN = 'test-token'
        mockPost({
            data: {
                series_by_pk: {
                    book_series: [
                        { position: 8, book: { id: 1, title: 'A Parade of Horribles: Book 8', release_date: '2026-05-12' } },
                        { position: 8, book: { id: 2, title: 'A Parade of Horribles', release_date: '2026-05-11' } },
                        { position: 8, book: { id: 3, title: 'A Parade of Horribles', release_date: null } },
                    ],
                },
            },
        })

        expect(await getSeriesBooks('12717')).toEqual([
            { position: 8, title: 'A Parade of Horribles', releaseDate: '2026-05-11' },
        ])
    })

    test('returns nothing without a token', async () => {
        delete process.env.HARDCOVER_API_TOKEN

        expect(await getSeriesBooks('12717')).toEqual([])
    })
})

describe('pendingVolumes', () => {
    const books = [
        { position: 7, title: 'Vol 7', releaseDate: '2024-05-01' },
        { position: 8, title: 'Vol 8', releaseDate: '2025-05-01' },
        { position: 9, title: 'Vol 9', releaseDate: '2026-01-10' },
        { position: 10, title: 'Vol 10', releaseDate: '2026-12-01' },
        { position: 11, title: 'Vol 11' },
    ]

    test('returns released and announced volumes above the tracked one', () => {
        expect(pendingVolumes(8, books, [], new Date('2026-08-02'))).toEqual([
            { position: 9, title: 'Vol 9', releaseDate: '2026-01-10', released: true },
            { position: 10, title: 'Vol 10', releaseDate: '2026-12-01', released: false },
            { position: 11, title: 'Vol 11', releaseDate: undefined, released: false },
        ])
    })

    test('excludes volumes already notified about', () => {
        const pending = pendingVolumes(8, books, [9, 10], new Date('2026-08-02'))

        expect(pending.map(volume => volume.position)).toEqual([11])
    })

    test('returns nothing when the tracked volume is the last one', () => {
        expect(pendingVolumes(11, books, [], new Date('2026-08-02'))).toEqual([])
    })
})

describe('formatNewVolumesMessage', () => {
    test('lists each pending volume with its availability', () => {
        const message = formatNewVolumesMessage({
            name: 'Chrysalis',
            trackedVolume: 8,
            detailsUrl: 'https://hardcover.app/series/chrysalis',
            volumes: [
                { position: 9, title: 'Chrysalis Vol.9', releaseDate: '2026-01-10', released: true },
                { position: 10, title: undefined, releaseDate: '2026-12-01', released: false },
                { position: 11, title: 'Vol 11', releaseDate: undefined, released: false },
            ],
        })

        expect(message).toContain('<b>Chrysalis</b>')
        expect(message).toContain('You are on vol. 8')
        expect(message).toContain('Vol. 9 — Chrysalis Vol.9 (available since 2026-01-10)')
        expect(message).toContain('Vol. 10 (expected 2026-12-01)')
        expect(message).toContain('Vol. 11 — Vol 11 (release date TBA)')
        expect(message).toContain('https://hardcover.app/series/chrysalis')
    })

    test('escapes titles', () => {
        const message = formatNewVolumesMessage({
            name: 'Ranking of Kings <3',
            trackedVolume: 1,
            volumes: [{ position: 2, title: 'A & B', releaseDate: undefined, released: false }],
        })

        expect(message).toContain('Ranking of Kings &lt;3')
        expect(message).toContain('A &amp; B')
    })
})

describe('formatVolumeReport', () => {
    const volume = (position: number): PendingVolume => ({
        position,
        title: `Vol ${position}`,
        releaseDate: '2026-01-10',
        released: true,
    })

    test('lists every pending volume of a series', () => {
        const { messages, summary } = formatVolumeReport([
            { name: 'Chrysalis', trackedVolume: 8, pending: [volume(9), volume(10), volume(11)] },
        ])

        expect(messages).toHaveLength(1)
        expect(messages[0]).toContain('<b>Chrysalis</b>')
        expect(messages[0]).toContain('Vol. 9')
        expect(messages[0]).toContain('Vol. 10')
        expect(messages[0]).toContain('Vol. 11')
        expect(summary).toBe('Found 3 pending volume(s) across 1 series.')
    })

    test('counts a single pending volume', () => {
        const { messages, summary } = formatVolumeReport([
            { name: 'Chrysalis', trackedVolume: 10, pending: [volume(11)] },
        ])

        expect(messages).toHaveLength(1)
        expect(summary).toBe('Found 1 pending volume(s) across 1 series.')
    })

    test('reports being up to date when nothing is pending', () => {
        const { messages, summary } = formatVolumeReport([
            { name: 'Chrysalis', trackedVolume: 11, pending: [] },
            { name: 'Ranking of Kings', trackedVolume: 4, pending: [] },
        ])

        expect(messages).toEqual([])
        expect(summary).toBe("You're up to date on all tracked series.")
    })

    test('emits one message per series and counts across series', () => {
        const { messages, summary } = formatVolumeReport([
            { name: 'Chrysalis', trackedVolume: 8, pending: [volume(9), volume(10)] },
            { name: 'Skipped', trackedVolume: 3, pending: [] },
            { name: 'Ranking of Kings', trackedVolume: 4, pending: [volume(5)] },
        ])

        expect(messages).toHaveLength(2)
        expect(messages[0]).toContain('<b>Chrysalis</b>')
        expect(messages[1]).toContain('<b>Ranking of Kings</b>')
        expect(summary).toBe('Found 3 pending volume(s) across 2 series.')
    })
})
