package com.pulseczar.herdhand.ssh

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.security.KeyPair
import java.util.concurrent.TimeUnit
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.common.Ed25519KeyFactory
import net.schmizz.sshj.userauth.UserAuthException
import net.schmizz.sshj.userauth.keyprovider.KeyPairWrapper
import net.schmizz.sshj.userauth.keyprovider.KeyProvider
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters

private const val SEND_TIMEOUT_SECONDS = 15L
// The pairing script checks for the phone's key once a second and appends it a second later.
private const val PROOF_TIMEOUT_MS = 10_000L
private const val PROOF_RETRY_MS = 1_000L

class PairOptions : Record {
  @Field val host: String = ""
  @Field val port: Int = 22
  @Field val user: String = ""
  /** The "SHA256:..." fingerprints of the machine's host keys, from the pairing code. */
  @Field val hostKeyFingerprints: List<String> = emptyList()
  /** The one-time Ed25519 key's 32-byte seed, in base64. */
  @Field val oneTimeKeySeed: String = ""
  /** The phone key's authorized_keys line, with its comment. */
  @Field val phoneKeyLine: String = ""
}

class PairingRefusedException : CodedException("PAIRING_REFUSED", "The machine refused the pairing code", null)
class PairingNotFinishedException : CodedException("PAIRING_NOT_FINISHED", "The phone key did not work in time", null)

/**
 * Hands the phone key to a machine that runs the pairing script, then proves the key works.
 * Signs in with the one-time key from the pairing code, accepting only the code's host keys,
 * and sends the phone key line. The machine's forced command takes that line instead of
 * running it. Returns the fingerprint of the host key the machine presented.
 * Uses connections of its own, so an open connection stays open.
 */
fun pair(options: PairOptions): String {
  val verifier = TrustOnFirstUseVerifier(options.hostKeyFingerprints)
  val ssh = makeClient(verifier)
  try {
    ssh.connect(options.host, options.port)
    ssh.socket.soTimeout = 0
    ssh.authPublickey(options.user, makeOneTimeKey(options.oneTimeKeySeed))
    sendPhoneKeyLine(ssh, options.phoneKeyLine)
  } catch (error: CodedException) {
    throw error
  } catch (error: Exception) {
    throw verifier.rejection() ?: toCodedException(error)
  } finally {
    closeQuietly(ssh)
  }
  val fingerprint = verifier.presented ?: throw PairingRefusedException()
  provePhoneKey(options, fingerprint)
  return fingerprint
}

/** sshd hands the line to the forced command; a non-zero exit means it took nothing. */
private fun sendPhoneKeyLine(ssh: SSHClient, line: String) {
  ssh.startSession().use { session ->
    val command = session.exec(line)
    command.join(SEND_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    if (command.exitStatus != 0) throw PairingRefusedException()
  }
}

private fun makeOneTimeKey(seedBase64: String): KeyProvider {
  val seed = Base64.decode(seedBase64, Base64.DEFAULT)
  val publicKey = Ed25519PrivateKeyParameters(seed, 0).generatePublicKey().encoded
  return KeyPairWrapper(KeyPair(Ed25519KeyFactory.getPublicKey(publicKey), Ed25519KeyFactory.getPrivateKey(seed)))
}

/** Signs in with the phone key until it works. The script appends it a second or two after the send. */
private fun provePhoneKey(options: PairOptions, fingerprint: String) {
  val deadline = System.currentTimeMillis() + PROOF_TIMEOUT_MS
  do {
    if (System.currentTimeMillis() >= deadline) throw PairingNotFinishedException()
    Thread.sleep(PROOF_RETRY_MS)
  } while (!canSignInWithPhoneKey(options, fingerprint))
}

private fun canSignInWithPhoneKey(options: PairOptions, fingerprint: String): Boolean {
  val ssh = makeClient(TrustOnFirstUseVerifier(listOf(fingerprint)))
  return try {
    ssh.connect(options.host, options.port)
    ssh.socket.soTimeout = 0
    ssh.authPublickey(options.user, PhoneKey.provider())
    true
  } catch (_: UserAuthException) {
    false
  } catch (error: Exception) {
    throw toCodedException(error)
  } finally {
    closeQuietly(ssh)
  }
}

private fun makeClient(verifier: TrustOnFirstUseVerifier): SSHClient {
  val ssh = SSHClient(strongConfig())
  ssh.addHostKeyVerifier(verifier)
  ssh.connectTimeout = TIMEOUT_MS
  ssh.timeout = TIMEOUT_MS
  return ssh
}
