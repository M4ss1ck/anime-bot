import { afterEach, describe, expect, test } from 'bun:test'
import { prisma } from '../src/db/prisma.ts'
import { recordRun } from '../src/metrics/task-runs.ts'

const originalTaskRunUpsert = prisma.taskRun.upsert

type UpsertArgs = {
    where: { name: string }
    create: Record<string, unknown>
    update: Record<string, unknown>
}

function mockTaskRunUpsert(fail = false) {
    const calls: UpsertArgs[] = []

    prisma.taskRun.upsert = ((args: UpsertArgs) => {
        calls.push(args)
        return fail ? Promise.reject(new Error('db down')) : Promise.resolve({})
    }) as unknown as typeof prisma.taskRun.upsert

    return calls
}

afterEach(() => {
    prisma.taskRun.upsert = originalTaskRunUpsert
})

describe('recordRun', () => {
    test('records a successful run with its duration and returned detail', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('new_volumes_check', async () => '3 volume(s) notified')

        expect(calls).toHaveLength(1)
        expect(calls[0]?.where).toEqual({ name: 'new_volumes_check' })
        expect(calls[0]?.create.lastStatus).toBe('ok')
        expect(calls[0]?.create.lastDetail).toBe('3 volume(s) notified')
        expect(calls[0]?.create.runCount).toBe(1)
        expect(calls[0]?.create.failCount).toBe(0)
        expect(typeof calls[0]?.create.lastDurationMs).toBe('number')
        expect(calls[0]?.update.runCount).toEqual({ increment: 1 })
    })

    test('records a failed run with the error message as detail', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('new_season_check', async () => {
            throw new Error('anilist unreachable')
        })

        expect(calls[0]?.create.lastStatus).toBe('failed')
        expect(String(calls[0]?.create.lastDetail)).toContain('anilist unreachable')
        expect(calls[0]?.create.failCount).toBe(1)
        expect(calls[0]?.update.failCount).toEqual({ increment: 1 })
    })

    test('leaves detail empty when the task returns nothing', async () => {
        const calls = mockTaskRunUpsert()

        await recordRun('daily_summary', async () => undefined)

        expect(calls[0]?.create.lastStatus).toBe('ok')
        expect(calls[0]?.create.lastDetail).toBeNull()
    })

    test('never rejects, even when its own write fails', async () => {
        mockTaskRunUpsert(true)

        expect(await recordRun('daily_summary', async () => undefined)).toBeUndefined()
    })

    test('never rejects when the task throws', async () => {
        mockTaskRunUpsert(true)

        expect(await recordRun('daily_summary', async () => {
            throw new Error('boom')
        })).toBeUndefined()
    })
})
