/**
 * crypto.js
 * ---------
 * AES-256-GCM encryption/decryption for sensitive fields (passwords, secrets).
 * Key is derived from the XSUAA client secret (stable across deployments).
 * For local dev without XSUAA, falls back to ENCRYPTION_KEY env var or skips encryption.
 */

const crypto = require('crypto')
const cds = require('@sap/cds')

const { info, warn } = cds.log('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // GCM standard
const TAG_LENGTH = 16 // Auth tag
const PREFIX = 'enc:' // Prefix to identify encrypted values

let _encryptionKey = null

/**
 * Get the 32-byte encryption key.
 * Derived from XSUAA clientsecret (production) or ENCRYPTION_KEY env var (local dev).
 * Returns null if no key is available (encryption disabled).
 */
function getKey() {
    if (_encryptionKey) return _encryptionKey

    // Try XSUAA client secret first
    try {
        const { filterServices } = require('@sap/xsenv')
        const xsuaaBindings = filterServices(b => b.label === 'xsuaa' || /.*xsuaa.*/.test(b.name))
        if (xsuaaBindings.length > 0 && xsuaaBindings[0].credentials?.clientsecret) {
            const secret = xsuaaBindings[0].credentials.clientsecret
            _encryptionKey = crypto.createHash('sha256').update(secret).digest()
            info('Encryption key derived from XSUAA client secret')
            return _encryptionKey
        }
    } catch (e) {
        // No XSUAA binding available
    }

    // Fallback to environment variable
    if (process.env.ENCRYPTION_KEY) {
        _encryptionKey = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest()
        info('Encryption key derived from ENCRYPTION_KEY env var')
        return _encryptionKey
    }

    warn('No encryption key available — passwords will be stored in plain text')
    return null
}

/**
 * Encrypt a plain text value.
 * Returns the encrypted string prefixed with 'enc:' or the original value if no key.
 * @param {string} plainText - Value to encrypt
 * @returns {string} Encrypted value (or original if no key)
 */
function encrypt(plainText) {
    if (!plainText || plainText.startsWith(PREFIX)) return plainText // Already encrypted or empty

    const key = getKey()
    if (!key) return plainText // No key — store plain

    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plainText, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag()

    // Format: enc:<iv_hex>:<tag_hex>:<ciphertext_hex>
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt an encrypted value.
 * Returns the plain text or the original value if not encrypted.
 * @param {string} encryptedText - Value to decrypt (must start with 'enc:')
 * @returns {string} Decrypted value (or original if not encrypted)
 */
function decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.startsWith(PREFIX)) return encryptedText // Not encrypted

    const key = getKey()
    if (!key) {
        warn('Cannot decrypt — no encryption key available')
        return '' // Can't decrypt without key
    }

    try {
        const parts = encryptedText.slice(PREFIX.length).split(':')
        if (parts.length !== 3) return encryptedText // Malformed

        const iv = Buffer.from(parts[0], 'hex')
        const tag = Buffer.from(parts[1], 'hex')
        const ciphertext = parts[2]

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(tag)

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
    } catch (e) {
        warn(`Decryption failed: ${e.message}`)
        return '' // Decryption error — return empty
    }
}

/**
 * Check if a value is encrypted.
 * @param {string} value
 * @returns {boolean}
 */
function isEncrypted(value) {
    return value && value.startsWith(PREFIX)
}

module.exports = { encrypt, decrypt, isEncrypted }