package com.pulseczar.herdhand.ssh

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.Security
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import net.schmizz.keepalive.KeepAliveProvider
import net.schmizz.keepalive.KeepAliveRunner
import net.schmizz.sshj.DefaultConfig
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.common.SecurityUtils
import net.schmizz.sshj.connection.channel.direct.Session
import net.schmizz.sshj.userauth.UserAuthException
import org.bouncycastle.jce.provider.BouncyCastleProvider

internal const val TIMEOUT_MS = 15_000
private const val KEEPALIVE_SECONDS = 15
// sshj drops the link after this many keepalives in a row get no reply: about 5 minutes, so a
// short time in the background or a brief network gap does not end it. sshj's default is 5.
private const val KEEPALIVE_MAX_MISSED = 20
private const val READ_BUFFER_CHARS = 8192
// The `onClosed` reason for a disconnect the person asked for; JavaScript tells it from a drop.
private const val DISCONNECT_REQUESTED = "disconnect requested"

class ConnectOptions : Record {
  @Field val host: String = ""
  @Field val port: Int = 22
  @Field val user: String = ""
  /** Null signs in with the phone key. */
  @Field val password: String? = null
  @Field val trustedFingerprint: String? = null
  @Field val label: String = ""
}

// The error message carries the fingerprint the host presented, so JavaScript can show it.
class HostKeyUnknownException(fingerprint: String) : CodedException("HOST_KEY_UNKNOWN", fingerprint, null)
class HostKeyChangedException(fingerprint: String) : CodedException("HOST_KEY_CHANGED", fingerprint, null)
class AuthFailedException(cause: Throwable) : CodedException("AUTH_FAILED", "Login failed", cause)
class UnreachableException(cause: Throwable) : CodedException("UNREACHABLE", cause.message ?: "Cannot reach host", cause)
class NotConnectedException : CodedException("NOT_CONNECTED", "Not connected", null)

/**
 * One SSH connection that runs one plain command at a time (no terminal). Output arrives as
 * `onData` events; `onClosed` fires when the command ends or the connection drops.
 * While connected, `ConnectionService` holds the connection in the background; its notice's
 * Disconnect action closes the connection and sends `onClosed` with a reason of its own.
 */
class SshModule : Module() {
  @Volatile private var client: SSHClient? = null
  private var session: Session? = null
  @Volatile private var command: Session.Command? = null

  // Expo runs every module's async functions on one shared thread, and an SSH call can block for
  // seconds. The SSH calls run on a thread of their own, one at a time, so they never hold up
  // other modules (secure storage, the app lock) and never race each other.
  private val sshThread = Executors.newSingleThreadExecutor()
  private val sshQueue = CoroutineScope(sshThread.asCoroutineDispatcher() + SupervisorJob())
  // Pairing waits for the machine for several seconds; on its own queue it does not hold up the
  // open connection's commands.
  private val pairQueue = CoroutineScope(Executors.newSingleThreadExecutor().asCoroutineDispatcher() + SupervisorJob())

  override fun definition() = ModuleDefinition {
    Name("Ssh")

    Events("onData", "onClosed")

    OnCreate {
      useFullBouncyCastle()
      listenForDisconnect()
    }

    AsyncFunction("connect") { options: ConnectOptions -> connect(options) }.runOnQueue(sshQueue)

    AsyncFunction("exec") { line: String -> exec(line) }.runOnQueue(sshQueue)

    AsyncFunction("write") { text: String -> write(text) }.runOnQueue(sshQueue)

    AsyncFunction("close") { close() }.runOnQueue(sshQueue)

    AsyncFunction("getPhoneKey") { PhoneKey.describe() }.runOnQueue(pairQueue)

    AsyncFunction("pair") { options: PairOptions -> pair(options) }.runOnQueue(pairQueue)

    OnDestroy {
      listeningContext?.unregisterReceiver(disconnectReceiver)
      sshThread.execute { close() }
      sshThread.shutdown()
    }
  }

  private val context: Context?
    get() = appContext.reactContext

  private val disconnectReceiver = object : BroadcastReceiver() {
    // The receiver runs on the main thread, where Android forbids network calls.
    override fun onReceive(context: Context, intent: Intent) {
      sshQueue.launch { disconnectOnRequest() }
    }
  }

  private var listeningContext: Context? = null

  /** Forgets the command first, so its reader thread reports no drop for this close. */
  private fun disconnectOnRequest() {
    if (client == null) return
    closeCommand()
    sendEvent("onClosed", mapOf("reason" to DISCONNECT_REQUESTED))
    close()
  }

  private fun listenForDisconnect() {
    val context = context ?: return
    ContextCompat.registerReceiver(
      context,
      disconnectReceiver,
      IntentFilter(ACTION_DISCONNECT),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
    listeningContext = context
  }

  private fun connect(options: ConnectOptions) {
    close()
    val verifier = TrustOnFirstUseVerifier(listOfNotNull(options.trustedFingerprint))
    val ssh = SSHClient(strongConfig())
    ssh.addHostKeyVerifier(verifier)
    ssh.connectTimeout = TIMEOUT_MS
    // sshj starts the keepalive thread on connect only if the interval is already set.
    ssh.connection.keepAlive.keepAliveInterval = KEEPALIVE_SECONDS
    (ssh.connection.keepAlive as KeepAliveRunner).maxAliveCount = KEEPALIVE_MAX_MISSED
    try {
      ssh.connect(options.host, options.port)
      signIn(ssh, options)
    } catch (error: Exception) {
      closeQuietly(ssh)
      throw verifier.rejection() ?: toCodedException(error)
    }
    client = ssh
    startHold(options.label)
  }

  private fun signIn(ssh: SSHClient, options: ConnectOptions) {
    val password = options.password
    if (password == null) {
      ssh.authPublickey(options.user, PhoneKey.provider())
    } else {
      ssh.authPassword(options.user, password)
    }
  }

  /**
   * Starts the notice that holds the connection in the background. Android refuses this once
   * the app is in the background; the connection then works without the hold.
   */
  private fun startHold(label: String) {
    val context = context ?: return
    try {
      ConnectionService.start(context, label)
    } catch (error: IllegalStateException) {
      Log.w("Ssh", "Cannot hold the connection in the background", error)
    }
  }

  private fun exec(line: String) {
    val ssh = client ?: throw NotConnectedException()
    closeCommand()
    val newSession = ssh.startSession()
    val newCommand = try {
      newSession.exec(line)
    } catch (error: Exception) {
      runCatching { newSession.close() }
      throw error
    }
    session = newSession
    command = newCommand
    drain(newCommand.errorStream)
    streamOutput(newCommand)
  }

  private fun write(text: String) {
    val output = command?.outputStream ?: throw NotConnectedException()
    output.write(text.toByteArray(Charsets.UTF_8))
    output.flush()
  }

  private fun close() {
    context?.let { ConnectionService.stop(it) }
    closeCommand()
    client?.let { closeQuietly(it) }
    client = null
  }

  /**
   * Sends stdout to JavaScript as text; the reader keeps UTF-8 characters whole across reads.
   * Events stop once `close` or a newer `exec` replaces the command, so JavaScript hears
   * `onClosed` only when the command exits or the connection drops.
   */
  private fun streamOutput(running: Session.Command) {
    Thread {
      val reason = try {
        val reader = InputStreamReader(running.inputStream, Charsets.UTF_8)
        val buffer = CharArray(READ_BUFFER_CHARS)
        while (true) {
          val count = reader.read(buffer)
          if (count < 0) break
          if (command === running) sendEvent("onData", mapOf("text" to String(buffer, 0, count)))
        }
        "ended"
      } catch (error: IOException) {
        error.message ?: "connection lost"
      }
      if (command === running) sendEvent("onClosed", mapOf("reason" to reason))
    }.start()
  }

  /** Reads and drops stderr, so a full stderr window never stalls the command. */
  private fun drain(stream: InputStream) {
    Thread {
      try {
        val buffer = ByteArray(READ_BUFFER_CHARS)
        while (stream.read(buffer) >= 0) Unit
      } catch (_: IOException) {
      }
    }.start()
  }

  /** Forgets the command first, so its reader thread sends no events while it closes. */
  private fun closeCommand() {
    val oldCommand = command
    val oldSession = session
    command = null
    session = null
    try {
      oldCommand?.close()
      oldSession?.close()
    } catch (_: IOException) {
    }
  }
}

internal fun closeQuietly(ssh: SSHClient) {
  try {
    ssh.disconnect()
  } catch (_: IOException) {
  }
}

/**
 * Android ships a cut-down provider named "BC" that misses algorithms such as X25519, so the
 * full one takes its place, first in the list. sshj then asks for no provider by name: the
 * first that can do the job answers, which is BouncyCastle for everything but a Keystore key.
 * Only the Keystore's own provider can sign with the phone key.
 */
private fun useFullBouncyCastle() {
  Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME)
  Security.insertProviderAt(BouncyCastleProvider(), 1)
  SecurityUtils.setSecurityProvider(null)
  SecurityUtils.setRegisterBouncyCastle(false)
}

/** sshj's defaults without SHA-1, MD5 or CBC algorithms. */
internal fun strongConfig(): DefaultConfig {
  val config = DefaultConfig()
  // Sends keepalive requests and drops the connection after missed replies; the default only
  // sends ignore packets and never notices a dead link.
  config.keepAliveProvider = KeepAliveProvider.KEEP_ALIVE
  config.setKeyExchangeFactories(config.keyExchangeFactories.filterNot { isWeak(it.name) })
  config.setCipherFactories(config.cipherFactories.filterNot { isWeak(it.name) })
  config.setMACFactories(config.macFactories.filterNot { isWeak(it.name) })
  config.setKeyAlgorithms(config.keyAlgorithms.filterNot { isWeak(it.name) })
  return config
}

// "ssh-rsa" and "ssh-dss" sign with SHA-1; RSA keys still work through rsa-sha2-256/512.
private fun isWeak(name: String): Boolean =
  name.contains("cbc") ||
    name.contains("sha1") ||
    name.contains("md5") ||
    name.startsWith("ssh-rsa") ||
    name.startsWith("ssh-dss")

internal fun toCodedException(error: Exception): CodedException = when (error) {
  is UserAuthException -> AuthFailedException(error)
  is UnknownHostException, is ConnectException, is NoRouteToHostException, is SocketTimeoutException ->
    UnreachableException(error)
  else -> CodedException("SSH_ERROR", error.message ?: error.javaClass.simpleName, error)
}
