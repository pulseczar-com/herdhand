package com.pulseczar.herdhand.ssh

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import java.security.MessageDigest
import java.security.PublicKey
import net.schmizz.sshj.common.Buffer
import net.schmizz.sshj.transport.verification.HostKeyVerifier

/**
 * Accepts only the trusted fingerprint. With none trusted yet, it refuses and keeps the
 * presented one, so the app can ask before any password is sent.
 */
class TrustOnFirstUseVerifier(private val trusted: String?) : HostKeyVerifier {
  private var presented: String? = null

  override fun verify(hostname: String, port: Int, key: PublicKey): Boolean {
    val fingerprint = sha256Fingerprint(key)
    presented = fingerprint
    return fingerprint == trusted
  }

  override fun findExistingAlgorithms(hostname: String, port: Int): List<String> = emptyList()

  /** The error for a refused host key, or null when the key was accepted or never seen. */
  fun rejection(): CodedException? {
    val fingerprint = presented ?: return null
    if (fingerprint == trusted) return null
    if (trusted == null) return HostKeyUnknownException(fingerprint)
    return HostKeyChangedException(fingerprint)
  }
}

/** The OpenSSH form: "SHA256:" and the unpadded base64 of the key blob's SHA-256. */
private fun sha256Fingerprint(key: PublicKey): String {
  val blob = Buffer.PlainBuffer().putPublicKey(key).compactData
  val digest = MessageDigest.getInstance("SHA-256").digest(blob)
  return "SHA256:" + Base64.encodeToString(digest, Base64.NO_PADDING or Base64.NO_WRAP)
}
