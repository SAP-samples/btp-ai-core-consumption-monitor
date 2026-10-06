/**
 * cms-sync.js
 * -----------
 * Syncs the SAP Cloud Management Service directory structure into local tables:
 *   - CMSDirectories           : Business Units (L1) + Applications (L2)
 *   - CMSDirectorySubaccounts  : directory → subaccount mapping (incl. nested)
 *   - Subaccounts              : discovered subaccount master (discoveredViaCms=true)
 *
 * Idempotent per day (guarded by CMSDirectories.lastSynced). No-op when CMS
 * is not configured — callers fall back to manually-managed subaccounts.
 */

const cds = require('@sap/cds')
const { getCMSCredentials, fetchAccountStructure } = require('./cms-client')
const { info } = cds.log('cms')

/** Today's date as YYYY-MM-DD (CDS Date format). */
function todayISO() {
    return new Date().toISOString().split('T')[0]
}

/** Collect all subaccount GUIDs (+ names/regions) under a node, recursing into children. */
function collectSubaccounts(node) {
    const subs = []
    if (Array.isArray(node.subaccounts)) {
        for (const sa of node.subaccounts) {
            if (sa.guid) subs.push({ guid: sa.guid, displayName: sa.displayName, region: sa.region })
        }
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) subs.push(...collectSubaccounts(child))
    }
    return subs
}

/**
 * Run the CMS sync. Returns a human-readable status string.
 * @param {boolean} force  skip the once-per-day guard (used by refreshCMSDirectories)
 */
async function syncCMSDirectories(force = false) {
    if (!getCMSCredentials()) {
        return 'CMS not configured — using manually-managed subaccounts'
    }

    const db = cds.db || await cds.connect.to('db')
    const today = todayISO()

    if (!force) {
        const alreadySynced = await db.run(
            SELECT.one.from('aicorefin.CMSDirectories').where({ lastSynced: today })
        )
        if (alreadySynced) return 'CMS directories already synced today, skipping'
    }

    const accountData = await fetchAccountStructure()
    if (!accountData || !accountData.children) {
        return 'CMS returned no directory data'
    }

    const dirEntries = []
    const subaccountMappings = []
    const discoveredSubaccounts = {}  // keyed by guid → { name, region, parentDirectoryGuid, businessUnitGuid }

    const level1Dirs = (accountData.children || []).filter(c => c.guid && c.displayName)
    for (const dir of level1Dirs) {
        dirEntries.push({
            guid: dir.guid,
            displayName: dir.displayName,
            description: dir.description || '',
            parentGuid: accountData.guid,
            level: 'BusinessUnit',
            lastSynced: today
        })

        // All subaccounts under this Business Unit (incl. nested) map to it
        for (const sa of collectSubaccounts(dir)) {
            subaccountMappings.push({ directoryGuid: dir.guid, subaccountGuid: sa.guid })
            discoveredSubaccounts[sa.guid] = {
                subaccountName: sa.displayName || '',
                region: sa.region || '',
                parentDirectoryGuid: dir.guid,
                businessUnitGuid: dir.guid
            }
        }

        // Level 2 directories → Applications
        const level2Dirs = (dir.children || []).filter(c => c.guid && c.displayName)
        for (const subDir of level2Dirs) {
            dirEntries.push({
                guid: subDir.guid,
                displayName: subDir.displayName,
                description: subDir.description || '',
                parentGuid: dir.guid,
                level: 'Application',
                lastSynced: today
            })
            for (const sa of collectSubaccounts(subDir)) {
                subaccountMappings.push({ directoryGuid: subDir.guid, subaccountGuid: sa.guid })
                // Application is the nearest directory; Business Unit is its parent
                discoveredSubaccounts[sa.guid] = {
                    subaccountName: sa.displayName || '',
                    region: sa.region || '',
                    parentDirectoryGuid: subDir.guid,
                    businessUnitGuid: dir.guid
                }
            }
        }
    }

    // Also capture subaccounts attached directly to the Global Account (no directory)
    for (const sa of (accountData.subaccounts || [])) {
        if (sa.guid && !discoveredSubaccounts[sa.guid]) {
            discoveredSubaccounts[sa.guid] = {
                subaccountName: sa.displayName || '',
                region: sa.region || '',
                parentDirectoryGuid: null,
                businessUnitGuid: null
            }
        }
    }

    // Replace CMS directory tables wholesale (only when we got valid data)
    if (dirEntries.length > 0) {
        await db.run(DELETE.from('aicorefin.CMSDirectories'))
        await db.run(UPSERT.into('aicorefin.CMSDirectories').entries(dirEntries))
    }
    await db.run(DELETE.from('aicorefin.CMSDirectorySubaccounts'))
    if (subaccountMappings.length > 0) {
        await db.run(UPSERT.into('aicorefin.CMSDirectorySubaccounts').entries(subaccountMappings))
    }

    // Upsert discovered subaccounts into the master, preserving isMonitored
    const guids = Object.keys(discoveredSubaccounts)
    if (guids.length > 0) {
        const existing = await db.run(
            SELECT.from('aicorefin.Subaccounts').columns('subaccountId', 'isMonitored')
                .where({ subaccountId: { in: guids } })
        )
        const monitoredMap = {}
        for (const row of existing) monitoredMap[row.subaccountId] = row.isMonitored

        const subEntries = guids.map(guid => ({
            subaccountId: guid,
            subaccountName: discoveredSubaccounts[guid].subaccountName,
            region: discoveredSubaccounts[guid].region,
            parentDirectoryGuid: discoveredSubaccounts[guid].parentDirectoryGuid,
            businessUnitGuid: discoveredSubaccounts[guid].businessUnitGuid,
            discoveredViaCms: true,
            isMonitored: monitoredMap[guid] || false
        }))
        await db.run(UPSERT.into('aicorefin.Subaccounts').entries(subEntries))
    }

    const status = `${dirEntries.length} CMS directories synced (${level1Dirs.length} Business Units, ${guids.length} subaccounts discovered)`
    info(status)
    return status
}

module.exports = { syncCMSDirectories }
