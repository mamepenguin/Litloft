# iOS app

The iOS app shows the same Litloft web app you use in a browser. It exists to
do what a browser on the phone cannot: audio plays through the app itself, so
it keeps going with the screen locked or another app in front.

It is not on the App Store. You build it from `ios/` in this repository.

## Building and installing

1. Open `ios/Litloft.xcodeproj` in Xcode.
2. To install on a phone, copy `ios/Config/Local.xcconfig.example` to
   `ios/Config/Local.xcconfig` and fill in your Apple Developer team id and a
   bundle id that team owns. The file is not tracked by git. The simulator
   builds without it.
3. Select your phone and run.

## Connecting

On first launch the app asks for the address of your Litloft server,
including the port — for example `192.168.1.50:3000`. The phone has to be on
the same network. A plain `http://` address works for local addresses.

The app remembers the address. If the server cannot be reached, the app shows
its own error screen with a **Retry** button.

## Listening to audio

When you open an audio file, the app plays it instead of the page, and the
page shows Litloft's own controls in place of the browser's audio bar:

- a play / pause button;
- a seek bar with the position and length;
- a speed button that steps through 1×, 1.25×, 1.5×, 1.75× and 2×.

Playback continues when the app leaves the screen or the phone locks. The lock
screen and Control Center show the file's title, its folder and its Litloft
thumbnail, and their play, pause and position controls act on the file. Audio
output such as AirPlay is chosen from the system controls.

Resuming from where you stopped, the listening history and autoplay work as
they do in a browser — see [Viewers and players](viewers-and-players.md#audio-player).

### What the messages under the controls mean

- **Loading…** — the app is waiting for data. It shows for a moment every time
  playback starts. If the server stops answering while you listen (the Mac
  sleeps, the drive is unmounted), it stays, and playback continues by itself
  once the server answers again. Pause still works while it shows.
- **Could not load this file** — the file could not be opened. The controls
  are disabled. Opening the file again later tries again.

### When playback stops

- Leaving the file's page, or locking Litloft with the lock button, stops
  playback.
- If iOS ends the page while it is in the background, the audio keeps playing.
  The page is loaded again when you return to the app, and playback stops then.
  The listening position saved is the last one from before the page ended.

## Limitations

- **Video** still plays in the page, so it stops when the app leaves the
  screen.
- **Links to other sites** in notes do nothing when tapped.
- **A long press** on some text starts a text selection, as it does in Safari.
