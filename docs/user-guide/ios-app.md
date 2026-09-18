# iOS app

The iOS app shows the same Litloft web app you use in a browser. It exists to
do what a browser on the phone cannot: the app plays the audio and the video
itself, so a file keeps going with the screen locked or another app in front,
and a video moves into a picture-in-picture window by itself.

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

## Watching video

The app plays the video too, behind the page, where the player's frame is. The
controls, the seek bar, the speed, the gestures and the chapters are Litloft's
own, exactly as in a browser.

- **Leaving the app moves the video into a small window.** Going to the home
  screen, or to another app, opens iOS's picture-in-picture window and the
  video keeps playing there. Coming back to Litloft puts it back in the page.
- **The settings sheet has a Picture-in-Picture switch** for opening that
  window without leaving the app.
- **Locking the screen keeps the sound.** The picture stops, as it does for
  any video on iOS; the lock screen controls the file as it does for audio.
- **Subtitles** are drawn by the page, so they follow the file's own subtitle
  tracks and the subtitle switch in the settings sheet. They are not shown in
  the picture-in-picture window or in the system's full-screen player.
- **The mini player is not used in the app.** In a browser, scrolling a playing
  video off screen shrinks it into a corner; in the app, picture in picture
  does that job and keeps playing outside Litloft as well.

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

## Links and downloads

- **A link to another site opens in Safari.** Notes, file properties and the
  YouTube frame all lead outside Litloft, and the app hands those addresses to
  iOS rather than showing them itself. Playback carries on while you are away:
  a video moves into the picture-in-picture window and audio keeps going.
- **A `mailto:` or `tel:` link** goes to Mail or the phone, the same way.
- **Litloft's own pages open in the app.** Where a browser would open a second
  tab — Open in new tab in the folder tree — the app opens it where you are,
  because it has no tabs.
- **Download offers the file to iOS.** Choose Save to Files to keep it, or send
  it to another app. The page you were on stays where it is.

## Limitations

- **YouTube and other web videos** (`.loft` reference files) still play in the
  page, so they stop when the app leaves the screen.
- **Subtitles do not show in picture in picture.**
- **A long press** on some text starts a text selection, as it does in Safari.
