import type { SeriesBook } from '../details-service/providers/hardcover.js'
import { escapeHtml } from '../utils/index.js'

export type PendingVolume = SeriesBook & {
    released: boolean
}

export const pendingVolumes = (
    trackedVolume: number,
    books: SeriesBook[],
    notifiedPositions: number[],
    now = new Date()
): PendingVolume[] => {
    const today = now.toISOString().slice(0, 10)

    return books
        .filter(book => book.position > trackedVolume && !notifiedPositions.includes(book.position))
        .sort((a, b) => a.position - b.position)
        .map(book => ({
            ...book,
            released: Boolean(book.releaseDate && book.releaseDate <= today),
        }))
}

export const formatNewVolumesMessage = ({ name, trackedVolume, volumes, detailsUrl }: {
    name: string
    trackedVolume: number
    volumes: PendingVolume[]
    detailsUrl?: string | null
}) => {
    const lines = volumes.map(volume => {
        const title = volume.title ? ` — ${escapeHtml(volume.title)}` : ''
        const availability = volume.released
            ? `available since ${volume.releaseDate}`
            : volume.releaseDate
                ? `expected ${volume.releaseDate}`
                : 'release date TBA'

        return `• Vol. ${volume.position}${title} (${availability})`
    })

    const message = [
        `📚 <b>New volumes available!</b>\n`,
        `<b>${escapeHtml(name)}</b>`,
        `You are on vol. ${trackedVolume}.\n`,
        ...lines,
    ]

    if (detailsUrl) message.push('', escapeHtml(detailsUrl))

    return message.join('\n')
}

export type VolumeReportEntry = {
    name: string
    trackedVolume: number
    pending: PendingVolume[]
    detailsUrl?: string | null
}

export const formatVolumeReport = (entries: VolumeReportEntry[]) => {
    const withPending = entries.filter(entry => entry.pending.length > 0)

    if (withPending.length < 1) {
        return { messages: [], summary: "You're up to date on all tracked series." }
    }

    const messages = withPending.map(entry => formatNewVolumesMessage({
        name: entry.name,
        trackedVolume: entry.trackedVolume,
        volumes: entry.pending,
        detailsUrl: entry.detailsUrl,
    }))

    const volumeCount = withPending.reduce((total, entry) => total + entry.pending.length, 0)

    return {
        messages,
        summary: `Found ${volumeCount} pending volume(s) across ${withPending.length} series.`,
    }
}
