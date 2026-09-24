# iOS app

The iOS app shows the same Litloft you use in a browser, but plays audio and video itself. A file keeps playing with the screen locked or another app in front, and a video moves into a picture-in-picture window when you leave the app.

It is not on the App Store. You build it from `ios/` in this repository.

## Building and installing

1. Open `ios/Litloft.xcodeproj` in Xcode.
2. To install on a phone, copy `ios/Config/Local.xcconfig.example` to `ios/Config/Local.xcconfig` and fill in your Apple Developer team id and a bundle id that team owns. The simulator builds without it.
3. Select your phone and run.

## Connecting

On first launch, enter your server's address with its port, for example `192.168.1.50:3000`, and press **Connect**. The phone must be on the same network. The app remembers the address.

If the server cannot be reached, the app shows **Cannot reach Litloft** with **Try again** and **Change server**.

## Listening to audio

An audio file gets Litloft's own controls: play / pause, a seek bar, and a speed button that steps from 1× to 2×. Playback continues when you leave the app or lock the phone, and the lock screen and Control Center show the file and control it. Choose AirPlay and other outputs from the system controls.

Resume, history and autoplay work as in a browser — see [Viewers and players](viewers-and-players.md#audio-player).

## Watching video

The controls, gestures and chapters are the same as in a browser.

- **Leaving the app** moves the video into a picture-in-picture window, where it keeps playing. Coming back puts it back in the page.
- **Picture-in-Picture** in the settings sheet opens that window without leaving the app.
- **Locking the screen** keeps the sound but stops the picture.
- The mini player is not used in the app; picture in picture takes its place.

### Messages under the controls

- **Loading…** — waiting for data. If the server stops answering (the Mac sleeps, a drive is unmounted), it stays, and playback resumes by itself when the server is back.
- **Could not load this file** — open the file again later to retry.

### When playback stops

Leaving the file's page, or pressing **Lock** in the sidebar, stops playback. If iOS closes the page while the app is in the background, the audio keeps playing, but it stops when you return and the page reloads.

## Links and downloads

- Links to other sites, `mailto:` and `tel:` links open in Safari, Mail or Phone. Playback carries on meanwhile.
- Litloft's own pages open in the app. **Open in new tab** opens the page where you are, because the app has no tabs.
- **Download** hands the file to iOS: choose Save to Files, or send it to another app.

## Limitations

- **YouTube and other web videos** (`.loft` files) play in the page and stop when you leave the app. For a YouTube video, use **Open in the iOS player** in the settings sheet: from there, leaving the app moves it into picture in picture. Litloft's controls and subtitles are not shown there.
- **Subtitles** are not shown in picture in picture or in the iOS full-screen player.
- **A long press** on text starts a text selection, as in Safari.
