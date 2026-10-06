/**
 * cms-client.js
 * -------------
 * Client for SAP Cloud Management Service (CMS / "cis" service, plan central-viewer).
 * Reads the BTP global account hierarchy (directories + subaccounts) so the app
 * can auto-discover subaccounts and group them by Business Unit / Application.
 *
 * CMS is OPTIONAL. If the `cis` service is not bound, getCMSCredentials() returns
 * null and callers fall back to manually-managed subaccounts.
 *
 * All endpoints come from the service binding (region-correct automatically):
 *   - token URL : credentials.uaa.url
 *   - API URL   : credentials.endpoints.accounts_service_url
 */

const cds = require('@sap/cds')
const { info, warn } = cds.log('cms')

/**
 * Resolve CMS credentials from VCAP_SERVICES.
 * Supports a managed `cis` binding and a user-provided `btprc-cms` service.
 * Returns null when CMS is not configured.
 */
function getCMSCredentials() {
    try {
        const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}')

        // Managed CIS service (plan: central-viewer)
        const cisService = vcap['cis'] && vcap['cis'][0] && vcap['cis'][0].credentials
        if (cisService) {
            return {
                clientid: (cisService.uaa && cisService.uaa.clientid) || cisService.clientid,
                clientsecret: (cisService.uaa && cisService.uaa.clientsecret) || cisService.clientsecret,
                url: (cisService.uaa && cisService.uaa.url) || cisService.url,
                apiurl: (cisService.endpoints && cisService.endpoints.accounts_service_url)
                    || cisService.apiurl
                    || 'https://accounts-service.cfapps.eu10.hana.ondemand.com'
            }
        }

        // User-provided service named btprc-cms
        const ups = vcap['user-provided'] || []
        const cmsCreds = (ups.find(s => s.name === 'btprc-cms') || {}).credentials
        if (cmsCreds) {
            return {
                clientid: cmsCreds.clientid || cmsCreds.clientId,
                clientsecret: cmsCreds.clientsecret || cmsCreds.clientSecret,
                url: cmsCreds.url || cmsCreds.tokenUrl,
                apiurl: cmsCreds.apiurl || cmsCreds.apiUrl
            }
        }

        return null
    } catch (e) {
        warn('Failed to read CMS credentials:', e.message)
        return null
    }
}

/**
 * Fetch an OAuth2 access token via client-credentials.
 */
async function fetchToken(creds) {
    const tokenUrl = creds.url.endsWith('/oauth/token') ? creds.url : `${creds.url}/oauth/token`

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString('base64')
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        throw new Error(`CMS token request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.access_token
}

/**
 * Fetch the full global account structure (directories + subaccounts) from CMS.
 * Returns null when CMS is not configured.
 */
async function fetchAccountStructure() {
    const creds = getCMSCredentials()
    if (!creds) {
        info('CMS credentials not configured, skipping')
        return null
    }

    info('Fetching account structure from CMS...')
    const token = await fetchToken(creds)

    const apiUrl = creds.apiurl.endsWith('/') ? creds.apiurl.slice(0, -1) : creds.apiurl

    const response = await fetch(`${apiUrl}/accounts/v1/globalAccount?expand=true`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })

    if (!response.ok) {
        throw new Error(`CMS API call failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    info('CMS account structure fetched successfully')
    return data
}

module.exports = { getCMSCredentials, fetchAccountStructure }
