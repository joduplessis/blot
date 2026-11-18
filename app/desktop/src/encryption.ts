import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

export const deriveKey = (pin: string, salt: string) => {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) throw new Error('Enter a six-digit PIN.')

    return scryptSync(pin, Buffer.from(salt, 'base64'), 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export const encrypt = (value: string, key: Buffer): string => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])

    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

export const decrypt = (value: string, key: Buffer): string => {
    const data = Buffer.from(value, 'base64')
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    cipher.setAuthTag(data.subarray(12, 28))

    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8')
}
