/**
 * smtp-notifier.js
 * ----------------
 * SMTP email notification sender using nodemailer.
 * Sends rich HTML emails with SAP BTP styling.
 */

const cds = require('@sap/cds')
const nodemailer = require('nodemailer')
const { decrypt } = require('./crypto')

const { info, warn, error } = cds.log('smtp-notifier')

const LEVEL_META = {
    INFO: { color: '#155724', bg: '#d4edda', border: '#28a745', emoji: '✅', label: 'Daily Update', barColor: '#28a745' },
    WARNING: { color: '#6a3b00', bg: '#fff3cd', border: '#e9730c', emoji: '⚠️', label: 'Warning', barColor: '#e9730c' },
    ALERT: { color: '#6a0000', bg: '#ffd6d6', border: '#bb0000', emoji: '🚨', label: 'Alert', barColor: '#bb0000' }
}

/**
 * Send an HTML email notification via SMTP.
 * @param {Object} usage - Usage data from monitoring job
 * @param {string} level - Alert level (INFO, WARNING, ALERT)
 * @param {Object} notifConfig - Notification configuration from DB
 * @param {Object} monConfig - Monitoring configuration from DB
 * @returns {boolean} true on success
 */
async function sendSmtpNotification(usage, level, notifConfig, monConfig) {
    if (!notifConfig.enableSmtp) {
        info('SMTP notifications disabled, skipping')
        return false
    }

    const recipients = (notifConfig.notificationEmails || '').split(',').map(e => e.trim()).filter(Boolean)
    if (recipients.length === 0) {
        warn('No notification emails configured, skipping SMTP send')
        return false
    }

    const meta = LEVEL_META[level] || LEVEL_META.INFO
    const subject = buildSubject(usage, level, meta, monConfig)
    const html = buildHtmlEmail(usage, level, meta, monConfig)
    const plainText = buildPlainText(usage, level, meta, monConfig)

    const smtpPass = decrypt(notifConfig.smtpPassword)
    const transportConfig = {
        host: notifConfig.smtpHost,
        port: notifConfig.smtpPort || 587,
        secure: !notifConfig.smtpUseTls, // secure=true for SSL (port 465), false for STARTTLS
        auth: smtpPass ? {
            user: notifConfig.smtpUser,
            pass: smtpPass
        } : undefined
    }

    if (notifConfig.smtpUseTls) {
        transportConfig.requireTLS = true
    }

    try {
        const transporter = nodemailer.createTransport(transportConfig)

        const senderAddress = notifConfig.smtpFrom || notifConfig.smtpUser
        const senderName = notifConfig.senderName || 'AI Core FinOps Monitor'

        await transporter.sendMail({
            from: `"${senderName}" <${senderAddress}>`,
            to: recipients.join(', '),
            subject,
            text: plainText,
            html
        })

        info(`SMTP email sent to ${recipients.join(', ')} (level=${level})`)
        return true
    } catch (err) {
        error(`Failed to send SMTP email: ${err.message}`)
        return false
    }
}

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
        '',
        `Reporting period: ${usage.periodStart || usage.fromDate} → ${usage.periodEnd || usage.toDate}`,
        `Day ${usage.daysElapsed} of ${usage.daysInMonth}`,
        '',
        'Top Consumers:',
        ...Object.entries(usage.byApplication || {}).slice(0, 5).map(
            ([app, cu]) => `  • ${app}: ${cu.toFixed(6)} CU`
        )
    ].join('\n')
}

function buildHtmlEmail(usage, level, meta, monConfig) {
    const totalCu = usage.totalCu
    const spendingLimit = monConfig.spendingLimit || 100
    const pct = spendingLimit > 0 ? (totalCu / spendingLimit * 100) : 0
    const projectedCu = usage.projectedCu || 0
    const subaccountName = usage.subaccountName || monConfig.subaccountId
    const barWidth = Math.min(pct, 100).toFixed(1)
    const barRemaining = (100 - Math.min(pct, 100)).toFixed(1)

    // Application breakdown rows
    const appRows = Object.entries(usage.byApplication || {}).map(([app, cu], i) => {
        const appPct = totalCu > 0 ? (cu / totalCu * 100).toFixed(1) : '0.0'
        const rowBg = i % 2 === 1 ? ' style="background-color:#f4f6f9;"' : ''
        return `<tr${rowBg}>
            <td style="padding:9px 14px;border-bottom:1px solid #d5dadd;font-size:13px;color:#223548;">${app}</td>
            <td style="padding:9px 14px;border-bottom:1px solid #d5dadd;text-align:right;font-size:13px;">${cu.toFixed(6)}</td>
            <td style="padding:9px 14px;border-bottom:1px solid #d5dadd;text-align:right;font-size:13px;">${appPct}%</td>
        </tr>`
    }).join('')

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f9;">
<tr><td align="center" style="padding:24px 0;">
<table border="0" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;">

<!-- Alert banner -->
<tr><td style="padding:24px 48px 0;">
<table width="100%"><tr>
<td style="background-color:${meta.bg};border-left:4px solid ${meta.border};padding:16px 20px;border-radius:4px;">
<div style="font-size:16px;font-weight:700;color:${meta.color};">${meta.emoji} ${meta.label} — AI Core Capacity Usage</div>
<div style="font-size:14px;color:${meta.color};margin-top:6px;">Consumption is at <strong>${pct.toFixed(1)}%</strong> of your monthly spending limit.</div>
</td></tr></table>
</td></tr>

<!-- Subaccount -->
<tr><td style="padding:20px 48px 0;">
<div style="font-size:20px;font-weight:700;color:#223548;">${subaccountName}</div>
<div style="font-size:12px;color:#354a5f;margin-top:4px;">Day ${usage.daysElapsed} of ${usage.daysInMonth} &nbsp;·&nbsp; ${usage.fetchDate || ''}</div>
</td></tr>

<!-- Key metrics -->
<tr><td style="padding:20px 48px 0;">
<table width="100%"><tr>
<td width="32%" style="background:#f4f6f9;border-radius:6px;padding:14px;text-align:center;">
<div style="font-size:22px;font-weight:700;color:#0057d2;">${totalCu.toFixed(4)}</div>
<div style="font-size:11px;color:#354a5f;margin-top:3px;">CU Used</div></td>
<td width="2%"></td>
<td width="32%" style="background:#f4f6f9;border-radius:6px;padding:14px;text-align:center;">
<div style="font-size:22px;font-weight:700;color:#223548;">${spendingLimit.toFixed(2)}</div>
<div style="font-size:11px;color:#354a5f;margin-top:3px;">Monthly Limit</div></td>
<td width="2%"></td>
<td width="32%" style="background:#f4f6f9;border-radius:6px;padding:14px;text-align:center;">
<div style="font-size:22px;font-weight:700;color:${meta.color};">${projectedCu.toFixed(4)}</div>
<div style="font-size:11px;color:#354a5f;margin-top:3px;">Projected</div></td>
</tr></table>
</td></tr>

<!-- Progress bar -->
<tr><td style="padding:20px 48px 0;">
<table width="100%" style="background:#d5dadd;border-radius:4px;height:14px;"><tr>
<td width="${barWidth}%" style="background:${meta.barColor};border-radius:4px;height:14px;font-size:1px;">&nbsp;</td>
<td width="${barRemaining}%"></td>
</tr></table>
<div style="font-size:11px;color:#354a5f;margin-top:6px;">${pct.toFixed(1)}% of ${spendingLimit} CU &nbsp;|&nbsp; Warning at ${monConfig.warningThresholdPct}% &nbsp;|&nbsp; Alert at ${monConfig.alertThresholdPct}%</div>
</td></tr>

<!-- Model breakdown -->
<tr><td style="padding:24px 48px;">
<div style="font-size:15px;font-weight:700;color:#223548;margin-bottom:12px;">Consumption by Model</div>
<table width="100%" style="border:1px solid #d5dadd;border-radius:6px;border-collapse:separate;font-size:13px;">
<thead><tr style="background:#f4f6f9;">
<th style="padding:10px 14px;text-align:left;color:#354a5f;font-weight:700;border-bottom:2px solid #d5dadd;">Model</th>
<th style="padding:10px 14px;text-align:right;color:#354a5f;font-weight:700;border-bottom:2px solid #d5dadd;">CU</th>
<th style="padding:10px 14px;text-align:right;color:#354a5f;font-weight:700;border-bottom:2px solid #d5dadd;">Share</th>
</tr></thead>
<tbody>${appRows}</tbody>
<tfoot><tr style="background:#f4f6f9;">
<td style="padding:10px 14px;font-weight:700;">Total</td>
<td style="padding:10px 14px;text-align:right;font-weight:700;">${totalCu.toFixed(6)}</td>
<td style="padding:10px 14px;text-align:right;font-weight:700;">100%</td>
</tr></tfoot>
</table>
</td></tr>

<!-- Footer -->
<tr><td style="background:#EAECEE;padding:20px 48px;">
<div style="font-size:12px;color:#354a5f;">Generated by AI Core FinOps Dashboard on ${usage.fetchDate || new Date().toISOString().split('T')[0]}</div>
</td></tr>

</table></td></tr></table>
</body></html>`
}

module.exports = {
    sendSmtpNotification
}