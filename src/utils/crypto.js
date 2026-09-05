import CryptoJS from 'crypto-js'

const SECRET = 'AI-PCB-REPAIR-LOCAL-KEY-v1'

export function encryptText(plain) {
  if (!plain) return ''
  return CryptoJS.AES.encrypt(plain, SECRET).toString()
}

export function decryptText(cipher) {
  if (!cipher) return ''
  try {
    return CryptoJS.AES.decrypt(cipher, SECRET).toString(CryptoJS.enc.Utf8)
  } catch {
    return ''
  }
}
