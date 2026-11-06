# Privacy policy

Herdhand is an Android app published by PulseCzar. It is open source, so you can check every statement here against the code.

## What Herdhand does with your data

- Herdhand has no account, no sign-in and no server of its own.
- Herdhand has no analytics, no advertising, no crash reporting and no tracking.
- Herdhand sends no data to PulseCzar or to any third party.
- Herdhand connects only to the machines you add, over SSH.

## What stays on your phone

Herdhand saves these items on your phone, in Android's storage for the app:

- In secure storage (`expo-secure-store`): the password and the trusted host key fingerprint of each machine.
- In app storage (`AsyncStorage`): each machine's name, address, port and user name, your folders and their order, which spaces are collapsed, and your settings.

Herdhand does not back this data up (`allowBackup` is off). Removing a machine deletes its password and fingerprint. Uninstalling the app deletes all of it.

## What passes over the connection

Herdhand sends your user name, your password and your input to the machine you chose. It reads the text of your Herdr spaces, tabs and panes from that machine and shows it on the screen. This data goes only between your phone and your machine. Herdhand does not copy it anywhere else.

## Permissions

- Notifications: Herdhand shows one notification while a connection is open. It is a local notification.
- Biometrics or screen lock: the app lock uses Android's own prompt. Herdhand never receives your fingerprint, face or PIN.

## Dependencies

The app includes no analytics or advertising library and no library that sends data to a third party. Google Play itself may collect usage and crash data about the install. That is covered by Google's privacy policy, not this one.

## Changes and contact

A change to this policy is a change to this file in the public repository. Its history shows every version.

Publisher: PulseCzar.
Contact: support@pulseczar.com
