/**
 * Creates the Android release signing key — without a JDK.
 *
 * `keytool` is the usual way to do this, but it ships with the JDK and there is no
 * JDK on this machine (the APK is built in CI). Android's signing config accepts a
 * PKCS#12 keystore just as happily as a JKS one, and PKCS#12 is a plain crypto
 * container that node-forge can write. So: RSA 2048, a self-signed certificate good
 * for thirty years, written as release.p12.
 *
 * Why bother at all: every build has to be signed with the SAME key, or Android
 * refuses to install the new APK over the old one and you would have to uninstall
 * first — which throws away every expense you have logged.
 *
 *   npm run keystore
 *
 * The file is gitignored. Keep a copy somewhere safe: lose it and you can never
 * update an installed app in place again.
 */
import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import forge from 'node-forge'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'release.p12')
const ALIAS = 'spend'
const YEARS = 30

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(
    `release.p12 already exists.\n\n` +
      `Generating a new one would give you a different signing identity, and Android\n` +
      `would then refuse to install the next build over the app already on your phone.\n` +
      `Pass --force only if you mean to start again from a clean install.`,
  )
  process.exit(1)
}

// 24 bytes of base64 is plenty, and it never has to be typed by hand.
const password = randomBytes(24).toString('base64url')

console.log('generating a 2048-bit RSA key…')
const keys = forge.pki.rsa.generateKeyPair(2048)

const cert = forge.pki.createCertificate()
cert.publicKey = keys.publicKey
cert.serialNumber = '01' + randomBytes(8).toString('hex')
cert.validity.notBefore = new Date()
cert.validity.notAfter = new Date()
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + YEARS)

const subject = [
  { name: 'commonName', value: 'Spend' },
  { name: 'organizationName', value: 'Spend' },
]
cert.setSubject(subject)
// Self-signed: issuer and subject are the same party.
cert.setIssuer(subject)
cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true }])
cert.sign(keys.privateKey, forge.md.sha256.create())

const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
  algorithm: '3des',
  friendlyName: ALIAS,
})
const der = forge.asn1.toDer(p12Asn1).getBytes()
const bytes = Buffer.from(der, 'binary')

await writeFile(OUT, bytes)

// The base64 runs to a few thousand characters, which is no use scrolling past in a
// terminal — so the values go to a file to copy from. Gitignored, like the key.
const secretsFile = resolve(root, 'keystore-secrets.txt')
await writeFile(
  secretsFile,
  `Three secrets for the GitHub repository.
Settings > Secrets and variables > Actions > New repository secret.

Keep this file out of the repository (it is gitignored) and delete it once the
secrets are in GitHub. Store release.p12 and the password in a password manager:
they are the only way to ship an update that installs over the app already on
your phone.

Generated ${new Date().toISOString().slice(0, 10)}, certificate valid until ${cert.validity.notAfter
    .toISOString()
    .slice(0, 10)}.

=== ANDROID_KEYSTORE_BASE64 ===
${bytes.toString('base64')}

=== ANDROID_KEYSTORE_PASSWORD ===
${password}

=== ANDROID_KEY_ALIAS ===
${ALIAS}
`,
)

console.log(`
Wrote release.p12 (${bytes.length} bytes), valid until ${cert.validity.notAfter.toISOString().slice(0, 10)}.
Wrote keystore-secrets.txt — open it and copy the three values into GitHub.

Both files are gitignored. Keep the keystore and its password somewhere safe: they
are the only way to publish an update that installs over an existing copy of the app.
`)
