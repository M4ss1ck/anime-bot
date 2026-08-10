import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { searchDefaultDetails } from '../src/details-service/index.js'
import { anilistProvider } from '../src/details-service/providers/anilist.js'
import { googleBooksProvider } from '../src/details-service/providers/google-books.js'
import { hardcoverProvider } from '../src/details-service/providers/hardcover.js'
import { kitsuProvider } from '../src/details-service/providers/kitsu.js'
import type { MediaDetails } from '../src/details-service/types.js'

function detailsOf(overrides: Pick<MediaDetails, 'provider' | 'id' | 'title'> & Partial<MediaDetails>): MediaDetails {
    return {
        kind: 'reading',
        providerLabel: overrides.provider,
        ...overrides,
    }
}

afterEach(() => {
    mock.restore()
})

describe('searchDefaultDetails', () => {
    it('returns only hardcover results for reading when hardcover has matches', async () => {
        const hit = detailsOf({ provider: 'hardcover', id: 'b1', title: 'Some Novel' })
        const hardcoverSearch = spyOn(hardcoverProvider, 'search').mockResolvedValue([hit])
        const anilistSearch = spyOn(anilistProvider, 'search').mockResolvedValue([])
        const googleSearch = spyOn(googleBooksProvider, 'search').mockResolvedValue([])

        const results = await searchDefaultDetails('reading', 'some novel', 5)

        expect(results).toEqual([hit])
        expect(hardcoverSearch).toHaveBeenCalledTimes(1)
        expect(anilistSearch).not.toHaveBeenCalled()
        expect(googleSearch).not.toHaveBeenCalled()
    })

    it('falls back to all reading providers when hardcover returns nothing', async () => {
        const fallbackHit = detailsOf({ provider: 'anilist', id: '42', title: 'Fallback Novel' })
        spyOn(hardcoverProvider, 'search').mockResolvedValue([])
        spyOn(anilistProvider, 'search').mockResolvedValue([fallbackHit])
        spyOn(googleBooksProvider, 'search').mockResolvedValue([])

        const results = await searchDefaultDetails('reading', 'fallback novel', 5)

        expect(results).toEqual([fallbackHit])
    })

    it('falls back to all reading providers when hardcover throws', async () => {
        const fallbackHit = detailsOf({ provider: 'google-books', id: 'g1', title: 'Rescue Novel' })
        spyOn(hardcoverProvider, 'search').mockRejectedValue(new Error('boom'))
        spyOn(anilistProvider, 'search').mockResolvedValue([])
        spyOn(googleBooksProvider, 'search').mockResolvedValue([fallbackHit])

        const results = await searchDefaultDetails('reading', 'rescue novel', 5)

        expect(results).toEqual([fallbackHit])
    })

    it('uses anilist as the default for anime without calling kitsu', async () => {
        const hit = detailsOf({ provider: 'anilist', id: '7', title: 'Some Anime', kind: 'anime' })
        const anilistSearch = spyOn(anilistProvider, 'search').mockResolvedValue([hit])
        const kitsuSearch = spyOn(kitsuProvider, 'search').mockResolvedValue([])

        const results = await searchDefaultDetails('anime', 'some anime', 5)

        expect(results).toEqual([hit])
        expect(anilistSearch).toHaveBeenCalledTimes(1)
        expect(kitsuSearch).not.toHaveBeenCalled()
    })
})
