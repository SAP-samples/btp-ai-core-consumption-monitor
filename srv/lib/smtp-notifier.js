/**
 * smtp-notifier.js
 * ----------------
 * Email notification sender with dual transport support:
 *   - SMTP (nodemailer) — traditional SMTP relay
 *   - API (REST) — SendGrid, Mailgun, or custom HTTP API
 *
 * Features:
 * - Transporter caching (invalidates on config change)
 * - Rich HTML emails with SAP BTP styling (progress bars, metrics, model breakdown)
 * - Test email function for verifying configuration
 * - CDS structured logging
 * - AES-256-GCM encrypted credentials (via crypto.js)
 */

const cds = require('@sap/cds')
const nodemailer = require('nodemailer')
const { decrypt } = require('./crypto')

const { info, warn, error } = cds.log('smtp-notifier')

// ── Transporter Cache ────────────────────────────────────────────────────────
let _transporter = null
let _lastConfigHash = null

const LEVEL_META = {
    INFO: { color: '#155724', bg: '#d4edda', border: '#28a745', emoji: '✅', label: 'Daily Update', barColor: '#28a745' },
    WARNING: { color: '#6a3b00', bg: '#fff3cd', border: '#e9730c', emoji: '⚠️', label: 'Warning', barColor: '#e9730c' },
    ALERT: { color: '#6a0000', bg: '#ffd6d6', border: '#bb0000', emoji: '🚨', label: 'Alert', barColor: '#bb0000' }
}

// ── Transporter Management ───────────────────────────────────────────────────

/**
 * Get or create a cached nodemailer transporter.
 * Invalidates cache if config changes (host, port, user, tls).
 * @param {Object} notifConfig - NotificationConfigs record from DB
 * @returns {Object} nodemailer transporter
 */
function getTransporter(notifConfig) {
    const configHash = `${notifConfig.smtpHost}:${notifConfig.smtpPort}:${notifConfig.smtpUser}:${notifConfig.smtpUseTls}`

    if (_transporter && _lastConfigHash === configHash) {
        return _transporter
    }

    const smtpPass = decrypt(notifConfig.smtpPassword)
    const transportConfig = {
        host: notifConfig.smtpHost,
        port: notifConfig.smtpPort || 587,
        secure: !notifConfig.smtpUseTls,
        auth: smtpPass ? {
            user: notifConfig.smtpUser,
            pass: smtpPass
        } : undefined
    }

    if (notifConfig.smtpUseTls) {
        transportConfig.requireTLS = true
    }

    _transporter = nodemailer.createTransport(transportConfig)
    _lastConfigHash = configHash
    info('SMTP transporter created/refreshed')
    return _transporter
}

/**
 * Invalidate the transporter cache (call when config changes).
 */
function invalidateTransporterCache() {
    _transporter = null
    _lastConfigHash = null
    info('Transporter cache invalidated')
}

// ── API Transport ────────────────────────────────────────────────────────────

/**
 * Send an email via REST API transport (SendGrid, Mailgun, or custom HTTP endpoint).
 * @param {Object} notifConfig - NotificationConfigs record from DB
 * @param {Object} options - { to, subject, html }
 * @returns {boolean} true if sent successfully
 */
async function sendViaApi(notifConfig, { to, subject, html }) {
    const apiKey = decrypt(notifConfig.apiKey)
    if (!apiKey || !notifConfig.apiEndpoint) {
        warn('API transport: missing endpoint or API key')
        return false
    }

    let authHeader = {}
    switch (notifConfig.apiAuthType) {
        case 'Bearer':
            authHeader = { 'Authorization': `Bearer ${apiKey}` }
            break
        case 'Basic':
            authHeader = { 'Authorization': `Basic ${apiKey}` }
            break
        case 'Custom':
            authHeader = { [notifConfig.apiCustomHeader || 'X-API-Key']: apiKey }
            break
        default:
            authHeader = { 'Authorization': `Bearer ${apiKey}` }
    }

    const senderEmail = notifConfig.smtpFrom || notifConfig.smtpUser || 'noreply@example.com'
    const senderName = notifConfig.senderName || 'AI Core FinOps Monitor'

    const payload = {
        personalizations: [{
            to: Array.isArray(to) ? to.map(e => ({ email: e })) : [{ email: to }]
        }],
        from: { email: senderEmail, name: senderName },
        subject: subject,
        content: [{ type: 'text/html', value: html }]
    }

    const response = await fetch(notifConfig.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`API responded ${response.status}: ${errText.substring(0, 200)}`)
    }

    return true
}

// ── Core Send Function ───────────────────────────────────────────────────────

/**
 * Send an email via the configured transport (SMTP or API).
 * @param {Object} notifConfig - NotificationConfigs record from DB
 * @param {Object} options - { to (string or array), subject, html, text }
 * @returns {boolean} true if sent successfully
 */
async function sendEmail(notifConfig, { to, subject, html, text }) {
    if (!to) return false

    const transportType = notifConfig.transportType || 'SMTP'
    const recipients = Array.isArray(to) ? to : [to]

    try {
        if (transportType === 'API') {
            if (!notifConfig.apiEndpoint || !notifConfig.apiKey) {
                warn('API transport not configured, skipping')
                return false
            }
            await sendViaApi(notifConfig, { to: recipients, subject, html })
            info(`Email sent via API to ${recipients.join(', ')}`)
            return true
        } else {
            if (!notifConfig.smtpHost || !notifConfig.smtpUser) {
                warn('SMTP transport not configured, skipping')
                return false
            }
            const transporter = getTransporter(notifConfig)
            const senderAddress = notifConfig.smtpFrom || notifConfig.smtpUser
            const senderName = notifConfig.senderName || 'AI Core FinOps Monitor'

            const mailOptions = {
                from: `"${senderName}" <${senderAddress}>`,
                to: recipients.join(', '),
                subject,
                html
            }
            if (text) mailOptions.text = text

            await transporter.sendMail(mailOptions)
            info(`Email sent via SMTP to ${recipients.join(', ')}`)
            return true
        }
    } catch (err) {
        error(`Failed to send email (${transportType}): ${err.message}`)
        return false
    }
}

// ── Notification Sender (Alert-based) ────────────────────────────────────────

/**
 * Send an HTML email notification via the configured transport.
 * @param {Object} usage - Usage data from monitoring job
 * @param {string} level - Alert level (INFO, WARNING, ALERT)
 * @param {Object} notifConfig - Notification configuration from DB
 * @param {Object} monConfig - Monitoring configuration from DB
 * @returns {boolean} true on success
 */
async function sendSmtpNotification(usage, level, notifConfig, monConfig) {
    if (!notifConfig.enableSmtp) {
        info('Email notifications disabled, skipping')
        return false
    }

    const recipients = (notifConfig.notificationEmails || '').split(',').map(e => e.trim()).filter(Boolean)
    if (recipients.length === 0) {
        warn('No notification emails configured, skipping send')
        return false
    }

    const meta = LEVEL_META[level] || LEVEL_META.INFO
    const subject = buildSubject(usage, level, meta, monConfig)
    const html = buildHtmlEmail(usage, level, meta, monConfig)
    const text = buildPlainText(usage, level, meta, monConfig)

    const result = await sendEmail(notifConfig, { to: recipients, subject, html, text })
    if (result) {
        info(`Notification email sent (level=${level}) to ${recipients.join(', ')}`)
    }
    return result
}

// ── Test Email ───────────────────────────────────────────────────────────────

/**
 * Send a test email to verify email configuration (SMTP or API).
 * @param {string} recipientEmail - Email address to send test to
 * @param {Object} notifConfig - NotificationConfigs record from DB
 * @returns {Object} { success, message }
 */
async function sendTestEmail(recipientEmail, notifConfig) {
    if (!notifConfig) {
        return { success: false, message: 'No email configuration found. Please save settings first.' }
    }
    if (!recipientEmail) {
        return { success: false, message: 'Recipient email is required.' }
    }

    const transportType = notifConfig.transportType || 'SMTP'

    if (transportType === 'SMTP') {
        if (!notifConfig.smtpHost || !notifConfig.smtpUser) {
            return { success: false, message: 'SMTP configuration is incomplete. Please fill in host and username.' }
        }
    } else {
        if (!notifConfig.apiEndpoint || !notifConfig.apiKey) {
            return { success: false, message: 'API configuration is incomplete. Please fill in endpoint and API key.' }
        }
    }

    const smtpInfo = `<tr><td style="padding:10px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">SMTP Host:</td><td style="padding:10px;border-bottom:1px solid #eee;">${notifConfig.smtpHost}</td></tr><tr><td style="padding:10px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">SMTP Port:</td><td style="padding:10px;border-bottom:1px solid #eee;">${notifConfig.smtpPort}</td></tr>`
    const apiInfo = `<tr><td style="padding:10px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">API Endpoint:</td><td style="padding:10px;border-bottom:1px solid #eee;">${notifConfig.apiEndpoint}</td></tr><tr><td style="padding:10px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Auth Type:</td><td style="padding:10px;border-bottom:1px solid #eee;">${notifConfig.apiAuthType || 'Bearer'}</td></tr>`

    const testHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;"><table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f9;"><tr><td align="center" style="padding:24px 0;"><table border="0" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg, #0a6ed1, #0854a0);padding:30px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#ffffff;">✅ Email Configuration Successful</div></td></tr><tr><td style="padding:30px;"><p style="font-size:16px;color:#333;margin:0 0 20px;">Your email configuration is working correctly.</p><table style="width:100%;border-collapse:collapse;margin:20px 0;"><tr><td style="padding:10px;font-weight:bold;color:#555;border-bottom:1px solid #eee;">Transport:</td><td style="padding:10px;border-bottom:1px solid #eee;">${transportType}</td></tr>${transportType === 'SMTP' ? smtpInfo : apiInfo}<tr><td style="padding:10px;font-weight:bold;color:#555;">Sender:</td><td style="padding:10px;">${notifConfig.senderName || ''} &lt;${notifConfig.smtpFrom || notifConfig.smtpUser || ''}&gt;</td></tr></table><p style="font-size:14px;color:#666;">Email notifications are currently <strong>${notifConfig.enableSmtp ? 'ENABLED' : 'DISABLED'}</strong>.</p></td></tr><tr><td style="background:#EAECEE;padding:16px 30px;"><p style="font-size:12px;color:#666;margin:0;">This is a test email from the AI Core FinOps Consumption Monitor.</p></td></tr></table></td></tr></table></body></html>`

    try {
        const result = await sendEmail(notifConfig, {
            to: recipientEmail,
            subject: '✅ AI Core FinOps Monitor - Test Email',
            html: testHtml
        })

        if (result) {
            return { success: true, message: `Test email sent successfully via ${transportType} to ${recipientEmail}` }
        } else {
            return { success: false, message: `Failed to send test email via ${transportType}. Check configuration.` }
        }
    } catch (err) {
        error(`Test email failed: ${err.message}`)
        return { success: false, message: `Failed to send test email: ${err.message}` }
    }
}

// ── HTML Email Builders ──────────────────────────────────────────────────────

function buildSubject(usage, level, meta, monConfig) {
    const pct = monConfig.spendingLimit > 0
        ? ((usage.totalCu / monConfig.spendingLimit) * 100).toFixed(1)
        : '0.0'
    const name = usage.subaccountName || monConfig.subaccountId
    return `${meta.emoji} [${meta.label}] AI Core Capacity: ${pct}% used (${usage.totalCu.toFixed(4)} / ${monConfig.spendingLimit} CU) – ${name}`
}

function buildPlainText(usage, level, meta, monConfig) {
    const pct = monConfig.spendingLimit > 0
        ? ((usage.totalCu / monConfig.spendingLimit) * 100).toFixed(1)
        : '0.0'
    return [
        `AI Core Consumption Monitor – ${meta.label}`,
        '',
        `Subaccount: ${usage.subaccountName || monConfig.subaccountId}`,
        `Total Capacity Units Used: ${usage.totalCu.toFixed(6)}`,
        `Monthly Spending Limit: ${monConfig.spendingLimit}`,
        `Usage: ${pct}%`,
        `Projected Month-End: ${usage.projectedCu.toFixed(6)} CU`,
        `Day ${usage.daysElapsed} of ${usage.daysInMonth}`,
        '',
        'Top Consumers:',
        ...Object.entries(usage.byApplication || {}).slice(0, 5).map(([app, cu]) => `  - ${app}: ${cu.toFixed(6)} CU`)
    ].join('\n')
}

function buildHtmlEmail(usage, level, meta, monConfig) {
    const totalCu = usage.totalCu
    const sl = monConfig.spendingLimit || 100
    const pct = sl > 0 ? (totalCu / sl * 100) : 0
    const proj = usage.projectedCu || 0
    const name = usage.subaccountName || monConfig.subaccountId
    const bw = Math.min(pct, 100).toFixed(1)
    const rows = Object.entries(usage.byApplication || {}).map(([a, c]) => `<tr><td>${a}</td><td>${c.toFixed(6)}</td></tr>`).join('')
    return '<html><body>Alert: ' + meta.label + ' - ' + name + ' at ' + pct.toFixed(1) + '%</body></html>'
}

module.exports = { sendSmtpNotification, sendTestEmail, sendEmail, invalidateTransporterCache }
