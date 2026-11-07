package com.pulseczar.herdhand.ssh

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.ECGenParameterSpec
import net.schmizz.sshj.common.Buffer
import net.schmizz.sshj.userauth.keyprovider.KeyPairWrapper
import net.schmizz.sshj.userauth.keyprovider.KeyProvider

private const val KEYSTORE = "AndroidKeyStore"
private const val ALIAS = "herdhand-phone-key"
private const val CURVE = "secp256r1"
private const val KEY_TYPE = "ecdsa-sha2-nistp256"

/**
 * This phone's SSH key: one ECDSA P-256 key in the Android Keystore, made the first time it is
 * needed. The private key never leaves the Keystore. It needs no unlock, so the app can sign in
 * again in the background; the app lock guards the person in front of the phone.
 */
object PhoneKey {
  fun provider(): KeyProvider = KeyPairWrapper(loadOrCreate())

  /** The public key as an authorized_keys line without a comment, its fingerprint, and when it was made. */
  fun describe(): Map<String, Any> {
    val publicKey = loadOrCreate().public
    val blob = Buffer.PlainBuffer().putPublicKey(publicKey).compactData
    return mapOf(
      "publicKey" to "$KEY_TYPE ${Base64.encodeToString(blob, Base64.NO_WRAP)}",
      "fingerprint" to sha256Fingerprint(publicKey),
      "createdAt" to openKeyStore().getCreationDate(ALIAS).time.toDouble(),
    )
  }

  private fun loadOrCreate(): KeyPair {
    val entry = openKeyStore().getEntry(ALIAS, null) as? KeyStore.PrivateKeyEntry
    if (entry != null) return KeyPair(entry.certificate.publicKey, entry.privateKey)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    generator.initialize(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .build(),
    )
    return generator.generateKeyPair()
  }

  private fun openKeyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
}
