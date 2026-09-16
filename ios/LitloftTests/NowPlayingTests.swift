import AVFoundation
import Foundation
import MediaPlayer
import Testing

@testable import Litloft

private var published: [String: Any] {
    MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
}

private func state(
    title: String = "A recording",
    artist: String? = "Someone",
    duration: Double = 427,
    time: Double = 12,
    rate: Double = 1
) -> NowPlaying.State {
    NowPlaying.State(title: title, artist: artist, duration: duration, time: time, rate: rate)
}

private let source = MediaSource(
    url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
    title: "耳ソージは気持ちいいゾ",
    artist: "Litloft",
    artworkURL: nil
)

/// `MPNowPlayingInfoCenter` is process-wide, and `.serialized` only orders a
/// suite against itself, so everything that touches it lives in this one.
@MainActor
@Suite(.serialized)
struct LockScreenTests {
    @Test("what the lock screen is given is what the file is")
    func publishesTheFile() {
        let nowPlaying = NowPlaying()
        defer { nowPlaying.clear() }

        nowPlaying.update(state())

        #expect(published[MPMediaItemPropertyTitle] as? String == "A recording")
        #expect(published[MPMediaItemPropertyArtist] as? String == "Someone")
        #expect(published[MPMediaItemPropertyPlaybackDuration] as? Double == 427)
        #expect(published[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? Double == 12)
        #expect(published[MPNowPlayingInfoPropertyPlaybackRate] as? Double == 1)
    }

    /// A duration of zero is "not known", not "zero seconds": publishing it as
    /// a length gives the lock screen a scrubber already at the end.
    @Test("an unknown length is published as a live stream, not as zero")
    func unknownLength() {
        let nowPlaying = NowPlaying()
        defer { nowPlaying.clear() }

        nowPlaying.update(state(duration: 0))

        #expect(published[MPMediaItemPropertyPlaybackDuration] == nil)
        #expect(published[MPNowPlayingInfoPropertyIsLiveStream] as? Bool == true)
    }

    @Test("a length that becomes known stops it being a live stream")
    func lengthArrivesLate() {
        let nowPlaying = NowPlaying()
        defer { nowPlaying.clear() }

        nowPlaying.update(state(duration: 0))
        nowPlaying.update(state(duration: 427))

        #expect(published[MPMediaItemPropertyPlaybackDuration] as? Double == 427)
        #expect(published[MPNowPlayingInfoPropertyIsLiveStream] as? Bool == false)
    }

    @Test("the toggle follows what is actually playing")
    func toggleFollowsState() {
        let nowPlaying = NowPlaying()
        defer { nowPlaying.clear() }

        var calls: [String] = []
        nowPlaying.onPlay = { calls.append("play") }
        nowPlaying.onPause = { calls.append("pause") }

        nowPlaying.isPlaying = false
        nowPlaying.onTogglePlayPause()
        nowPlaying.isPlaying = true
        nowPlaying.onTogglePlayPause()

        #expect(calls == ["play", "pause"])
    }

    @Test("clearing leaves nothing behind for the next file")
    func clearing() {
        let nowPlaying = NowPlaying()
        nowPlaying.update(state())

        nowPlaying.clear()

        #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
    }

    @Test("loading a file puts it on the lock screen")
    func loadPublishesTheFile() async {
        let player = MediaPlayer(jar: SlowCookieJar())
        defer { player.applyFromRemote(.unload) }

        await player.apply(.load(source), seq: 1).value

        #expect(published[MPMediaItemPropertyTitle] as? String == "耳ソージは気持ちいいゾ")
        #expect(published[MPMediaItemPropertyArtist] as? String == "Litloft")
    }

    @Test("unloading takes it off again")
    func unloadClearsTheLockScreen() async {
        let player = MediaPlayer(jar: SlowCookieJar())

        await player.apply(.load(source), seq: 1).value
        await player.apply(.unload, seq: 2).value

        #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
    }

    @Test("nothing is on the lock screen before a file is loaded")
    func nothingBeforeLoad() async {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        let player = MediaPlayer(jar: SlowCookieJar())

        await player.apply(.pause, seq: 1).value

        #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
    }
}
