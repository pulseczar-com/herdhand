package com.pulseczar.herdhand.ssh

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

private const val CHANNEL_ID = "connection"
private const val NOTIFICATION_ID = 1
private const val EXTRA_LABEL = "label"

/** The broadcast the notice's Disconnect action sends; `SshModule` receives it. */
const val ACTION_DISCONNECT = "com.pulseczar.herdhand.ssh.DISCONNECT"

/**
 * A foreground service that only shows a quiet notice, "Connected to <machine>", with a
 * Disconnect action. While it runs, Android keeps the app's process, and so the SSH
 * connection, alive in the background. `SshModule` starts it on connect and stops it on close.
 */
class ConnectionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val label = intent?.getStringExtra(EXTRA_LABEL) ?: ""
    ServiceCompat.startForeground(this, NOTIFICATION_ID, makeNotice(label), serviceType())
    // A restart after Android ends the process would hold no connection.
    return START_NOT_STICKY
  }

  private fun makeNotice(label: String) =
    NotificationCompat.Builder(this, makeChannel())
      .setSmallIcon(R.drawable.ic_connection_notice)
      .setContentTitle("Connected to $label")
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(openAppIntent())
      .addAction(0, "Disconnect", disconnectIntent())
      .build()

  /** A low-importance channel: the notice makes no sound and shows no pop-up. */
  private fun makeChannel(): String {
    val channel = NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
      .setName("Connection")
      .build()
    NotificationManagerCompat.from(this).createNotificationChannel(channel)
    return CHANNEL_ID
  }

  private fun openAppIntent(): PendingIntent? =
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

  private fun disconnectIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      this,
      0,
      Intent(ACTION_DISCONNECT).setPackage(packageName),
      PendingIntent.FLAG_IMMUTABLE,
    )

  companion object {
    fun start(context: Context, label: String) {
      val intent = Intent(context, ConnectionService::class.java).putExtra(EXTRA_LABEL, label)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ConnectionService::class.java))
    }
  }
}

// The type `specialUse` exists from Android 14; older versions take no type.
private fun serviceType(): Int =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
  } else {
    0
  }
