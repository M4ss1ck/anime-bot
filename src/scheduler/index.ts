import schedule from 'node-schedule'
import { prisma } from "../db/prisma.js"
import { logger } from '../logger/index.js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime.js'

dayjs.extend(relativeTime)

export const scheduled = async (id: string, cronExpression: string | number | Date, func: () => void, text?: string) => {
    let jobText: string
    const job = getScheduled(id)
    if (job) {
        jobText = 'Job is already scheduled'
    } else {
        let newjob: schedule.Job
        // check if cronExpression is a date in the future
        if (((typeof cronExpression === 'string' && /^\d+$/g.test(cronExpression)) || typeof cronExpression !== 'string') && dayjs(Number(cronExpression)).isAfter(dayjs())) {
            // dayjs() could check that it's a date in the future
            newjob = schedule.scheduleJob(id, cronExpression, func)
            jobText = `Job ${id} will run ${dayjs(newjob.nextInvocation()).fromNow()}`
        } else {
            // it is invalid or cron expr
            if ((typeof cronExpression === 'string' && /^\d+$/g.test(cronExpression)) || typeof cronExpression !== 'string') {
                // invalid date
                jobText = `Job ${id} failed due to invalid date or cron expression.`
                // remove from db
                await prisma.job.deleteMany({
                    where: {
                        id: id
                    }
                })
                    .then(() => logger.info('Invalid job deleted from DB'))
                    .catch((e) => logger.error(e))
            } else {
                // cron expr
                newjob = schedule.scheduleJob(id, cronExpression, func)
                jobText = `Job ${id} will run using the following rule: ${cronExpression}`
            }
        }
    }
    if (typeof cronExpression === 'string' || dayjs(cronExpression).isAfter(dayjs())) {
        await prisma.job.upsert({
            create: {
                id: id,
                date: String(cronExpression),
                text: text ?? ''
            },
            update: {
                date: String(cronExpression),
                text: text ?? ''
            },
            where: {
                id: id
            }
        }).catch(logger.error)
    }
    return jobText
}

export const getScheduled = (id: string) => {
    return schedule.scheduledJobs[id]
}