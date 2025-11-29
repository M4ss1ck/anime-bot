import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
    // the main entry for your schema
    schema: 'prisma/schema.prisma',
    // The database URL 
    datasource: {
        // Type Safe env() helper 
        // Does not replace the need for dotenv
        url: env('DATABASE_URL')?.trim(),
    },
})