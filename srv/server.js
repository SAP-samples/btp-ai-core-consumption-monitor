/**
 * server.js
 * ---------
 * CAP server customization.
 * - Optionally registers Job Scheduler jobs on startup (if service is bound)
 * - Serves the React UI from app/dashboard/dist
 * - The triggerCheck action always works as a manual pull button regardless
 *   of whether Job Scheduler is available.
 */

const cds = require('@sap/cds')
const path = require('path')

const { info, warn, error } = cds.log('server')

/**
 * On app startup (served), optionally register Job Scheduler jobs.
 * If Job Scheduler is NOT bound, the app still works — users can trigger
 * checks manually via the UI or API.
 */
cds.on('served', async (services) => {
    // ── CMS directory sync (optional) ─────────────────────────────────────────
    // Runs on every startup; no-op (and non-fatal) when the cis service is unbound.
    try {
        const { syncCMSDirectories } = require('./lib/cms-sync')
        const status = await syncCMSDirectories()
        info(`CMS sync: ${status}`)
    } catch (e) {
        error(`CMS sync failed (non-fatal): ${e.message}`)
    }

    // Only attempt Job Scheduler registration on CF (when VCAP_SERVICES is available)
    if (!process.env.VCAP_SERVICES) {
        info('Local mode — Job Scheduler not available. Use the "Run Check" button or triggerCheck action to pull data manually.')
        return
    }

    try {
        const { filterServices } = require('@sap/xsenv')

        // Check if jobscheduler service is bound — this is OPTIONAL
        const schedulerBindings = filterServices(binding => /.*scheduler.*/.test(binding.name))
        if (schedulerBindings.length === 0) {
            info('No Job Scheduler service bound — running in manual-trigger mode.')
            info('Usage data can be pulled via the "Run Check" button in the UI or by calling POST /service/FinOpsService/triggerCheck')
            return
        }

        info('Job Scheduler service found — registering scheduled jobs...')

        const schedulerCreds = schedulerBindings[0].credentials
        const schedulerUrl = schedulerCreds.url

        // Get the app's own URL from VCAP_APPLICATION
        let appUrl = ''
        try {
            const vcapApp = JSON.parse(process.env.VCAP_APPLICATION || '{}')
            const uris = vcapApp.uris || vcapApp.application_uris || []
            if (uris.length > 0) {
                appUrl = `https://${uris[0]}`
            }
        } catch (e) {
            warn('Could not determine app URL from VCAP_APPLICATION')
        }

        if (!appUrl) {
            warn('App URL not determined — cannot register scheduled jobs. Manual trigger still available.')
            return
        }

        const servicePath = '/service/FinOpsService'
        const jobActionUrl = `${appUrl}${servicePath}/triggerCheck`

        info(`App URL: ${appUrl}, Job action URL: ${jobActionUrl}`)

        // Get OAuth token for Job Scheduler API
        const token = await getSchedulerToken(schedulerCreds)

        // Check existing jobs
        const existingJobs = await fetchJobs(schedulerUrl, token)
        const existingJobNames = (existingJobs.results || []).map(j => j.name)
        info(`Existing jobs: ${existingJobNames.join(', ') || '(none)'}`)

        // Define our jobs
        const jobs = [
            {
                name: 'AICore_DailyUsageCheck',
                description: 'Daily AI Core capacity unit usage check and alerting',
                action: jobActionUrl,
                httpMethod: 'POST',
                active: true,
                schedules: [
                    {
                        description: 'Daily at 07:00 UTC',
                        cron: '* * * * 7 0 0',
                        active: true
                    },
                    {
                        description: 'Initial load (2 min after deploy)',
                        time: 'in 2 minutes',
                        active: true
                    }
                ]
            }
        ]

        // Create jobs that don't exist yet
        for (const job of jobs) {
            if (!existingJobNames.includes(job.name)) {
                try {
                    const created = await createJob(schedulerUrl, token, job)
                    info(`Created job '${job.name}' with ID ${created._id || created.id}`)
                } catch (e) {
                    error(`Failed to create job '${job.name}': ${e.message}`)
                }
            } else {
                info(`Job '${job.name}' already exists, skipping`)
            }
        }
    } catch (e) {
        // Job Scheduler setup failure should NOT crash the app
        error(`Job Scheduler setup failed: ${e.message}`)
        info('App will continue running in manual-trigger mode.')
    }
})

/**
 * Serve the React dashboard UI
 */
cds.on('bootstrap', (app) => {
    const express = require('express')
    const dashboardDist = path.join(__dirname, '..', 'app', 'dashboard', 'dist')

    // Serve static assets from the Vite build output
    app.use('/dashboard', express.static(dashboardDist))

    // SPA fallback: serve index.html for any sub-route
    app.use('/dashboard', (req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/assets/')) {
            res.sendFile(path.join(dashboardDist, 'index.html'))
        } else {
            next()
        }
    })
})

// ── Job Scheduler API helpers (only used if scheduler is bound) ───────────────

async function getSchedulerToken(creds) {
    const uaaCreds = creds.uaa || creds
    const tokenUrl = `${uaaCreds.url}/oauth/token`
    const authHeader = Buffer.from(`${uaaCreds.clientid}:${uaaCreds.clientsecret}`).toString('base64')

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        throw new Error(`Failed to get scheduler token: ${response.status}`)
    }

    const data = await response.json()
    return data.access_token
}

async function fetchJobs(schedulerUrl, token) {
    const response = await fetch(`${schedulerUrl}/scheduler/jobs`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.status}`)
    }

    return response.json()
}

async function createJob(schedulerUrl, token, job) {
    const response = await fetch(`${schedulerUrl}/scheduler/jobs`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(job)
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Failed to create job: ${response.status} ${text}`)
    }

    return response.json()
}

module.exports = cds.server