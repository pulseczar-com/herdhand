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
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.Security
import java.util.Timer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.schedule
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
// A `run` command that takes longer is stopped. A hung command must not hold its channel forever.
private const val RUN_TIMEOUT_MS = 20_000L
// How long `run` waits for the exit code after the output ends.
private const val RUN_EXIT_WAIT_SECONDS = 5L
// The most stdout one `run` command may print: a transcript page, not a download.
private const val RUN_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
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

/** A streaming command and the channel it runs on. */
private class Stream(val session: Session, val command: Session.Command)

/**
 * One SSH connection that streams plain commands (no terminal), each on a channel of its own and
 * named by an id. A new `exec` with an id ends the old stream of that id; streams with other ids
 * run beside it. Output arrives as `onData` events and `onClosed` fires when a command ends or
 * the connection drops; both name the stream. `run` is another way to use the same connection: a
 * one-shot command on a channel of its own, which answers with its whole output and never
 * touches the streams.
 * While connected, `ConnectionService` holds the connection in the background; its notice's
 * Disconnect action closes the connection and sends `onClosed` with a reason of its own for each
 * stream.
 */
class SshModule : Module() {
  @Volatile private var client: SSHClient? = null
  // The reader threads of the streams read this map too.
  private val streams = ConcurrentHashMap<String, Stream>()

  // Expo runs every module's async functions on one shared thread, and an SSH call can block for
  // seconds. The SSH calls run on a thread of their own, one at a time, so they never hold up
  // other modules (secure storage, the app lock) and never race each other.
  private val sshThread = Executors.newSingleThreadExecutor()
  private val sshQueue = CoroutineScope(sshThread.asCoroutineDispatcher() + SupervisorJob())
  // `run` waits for its command, so it has a queue of its own: the streaming command's write and
  // close calls never wait behind a read.
  private val runQueue = CoroutineScope(Executors.newSingleThreadExecutor().asCoroutineDispatcher() + SupervisorJob())
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

    AsyncFunction("exec") { id: String, line: String -> exec(id, line) }.runOnQueue(sshQueue)

    AsyncFunction("run") { line: String -> run(line) }.runOnQueue(runQueue)

    AsyncFunction("write") { id: String, text: String -> write(id, text) }.runOnQueue(sshQueue)

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

  /**
   * Forgets the streams first, so their reader threads report no drop for this close. With no
   * stream open, one event with an empty id still tells JavaScript of the disconnect.
   */
  private fun disconnectOnRequest() {
    if (client == null) return
    val ids = streams.keys.toList().ifEmpty { listOf("") }
    closeStreams()
    for (id in ids) sendEvent("onClosed", mapOf("id" to id, "reason" to DISCONNECT_REQUESTED))
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
    // sshj sets this on the socket as it connects, so it also limits the wait for the server's
    // greeting. The default is no limit, and a silent server would hold the SSH thread.
    ssh.timeout = TIMEOUT_MS
    // sshj starts the keepalive thread on connect only if the interval is already set.
    ssh.connection.keepAlive.keepAliveInterval = KEEPALIVE_SECONDS
    (ssh.connection.keepAlive as KeepAliveRunner).maxAliveCount = KEEPALIVE_MAX_MISSED
    try {
      ssh.connect(options.host, options.port)
      // The keepalive decides when a link is dead; no read limit of its own.
      ssh.socket.soTimeout = 0
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

  private fun exec(id: String, line: String) {
    val ssh = client ?: throw NotConnectedException()
    closeStream(id)
    val newSession = ssh.startSession()
    val newCommand = try {
      newSession.exec(line)
    } catch (error: Exception) {
      runCatching { newSession.close() }
      throw error
    }
    streams[id] = Stream(newSession, newCommand)
    drain(newCommand.errorStream)
    streamOutput(id, newCommand)
  }

  /**
   * Runs the command on a new channel, beside the streaming command's, and answers with its
   * stdout and exit code. A watchdog closes the channel when the command runs too long, which
   * ends the read below.
   */
  private fun run(line: String): Map<String, Any> {
    val ssh = client ?: throw NotConnectedException()
    val oneShot = ssh.startSession()
    val watchdog = Timer(true)
    val isTimedOut = AtomicBoolean(false)
    try {
      val running = oneShot.exec(line)
      watchdog.schedule(RUN_TIMEOUT_MS) {
        isTimedOut.set(true)
        runCatching { oneShot.close() }
      }
      drain(running.errorStream)
      val output = readAll(running.inputStream)
      // Closing the channel can end the read as a normal end of output.
      if (isTimedOut.get()) throw CodedException("SSH_ERROR", "The command took too long", null)
      // The exit code can arrive just after the output ends.
      runCatching { running.join(RUN_EXIT_WAIT_SECONDS, TimeUnit.SECONDS) }
      return mapOf("output" to output, "exitCode" to (running.exitStatus ?: -1))
    } catch (error: Exception) {
      if (isTimedOut.get()) throw CodedException("SSH_ERROR", "The command took too long", error)
      throw error as? CodedException ?: toCodedException(error)
    } finally {
      watchdog.cancel()
      runCatching { oneShot.close() }
    }
  }

  /** All of a stream as UTF-8 text, decoded once at the end so no character is cut. */
  private fun readAll(stream: InputStream): String {
    val bytes = ByteArrayOutputStream()
    val buffer = ByteArray(READ_BUFFER_CHARS)
    while (true) {
      val count = stream.read(buffer)
      if (count < 0) break
      if (bytes.size() + count > RUN_MAX_OUTPUT_BYTES) {
        throw CodedException("SSH_ERROR", "The command printed too much", null)
      }
      bytes.write(buffer, 0, count)
    }
    return bytes.toString(Charsets.UTF_8.name())
  }

  private fun write(id: String, text: String) {
    val output = streams[id]?.command?.outputStream ?: throw NotConnectedException()
    output.write(text.toByteArray(Charsets.UTF_8))
    output.flush()
  }

  private fun close() {
    context?.let { ConnectionService.stop(it) }
    closeStreams()
    client?.let { closeQuietly(it) }
    client = null
  }

  /**
   * Sends stdout to JavaScript as text; the reader keeps UTF-8 characters whole across reads.
   * Events stop once `close` or a newer `exec` replaces the stream's command, so JavaScript hears
   * `onClosed` only when the command exits or the connection drops.
   */
  private fun streamOutput(id: String, running: Session.Command) {
    Thread {
      val reason = try {
        val reader = InputStreamReader(running.inputStream, Charsets.UTF_8)
        val buffer = CharArray(READ_BUFFER_CHARS)
        while (true) {
          val count = reader.read(buffer)
          if (count < 0) break
          if (isCurrent(id, running)) sendEvent("onData", mapOf("id" to id, "text" to String(buffer, 0, count)))
        }
        "ended"
      } catch (error: IOException) {
        error.message ?: "connection lost"
      }
      if (isCurrent(id, running)) sendEvent("onClosed", mapOf("id" to id, "reason" to reason))
    }.start()
  }

  private fun isCurrent(id: String, running: Session.Command) = streams[id]?.command === running

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

  /** Forgets the stream first, so its reader thread sends no events while it closes. */
  private fun closeStream(id: String) {
    val old = streams.remove(id) ?: return
    try {
      old.command.close()
      old.session.close()
    } catch (_: IOException) {
    }
  }

  private fun closeStreams() {
    for (id in streams.keys.toList()) closeStream(id)
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

internal fun toCodedException(error: Exception): CodedException = when {
  error is UserAuthException -> AuthFailedException(error)
  isUnreachable(error) -> UnreachableException(error)
  else -> CodedException("SSH_ERROR", error.message ?: error.javaClass.simpleName, error)
}

// sshj wraps a socket error that ends the greeting in a TransportException, so the cause counts.
private fun isUnreachable(error: Throwable): Boolean =
  generateSequence(error) { it.cause }.any {
    it is UnknownHostException || it is ConnectException || it is NoRouteToHostException || it is SocketTimeoutException
  }
