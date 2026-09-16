import AVFoundation
import Foundation
import UIKit
import os

/// Plays Litloft's media natively so it keeps going when the app is not on
/// screen. The web app stays in charge: it sends commands and draws the
/// controls, and this reports back.
@MainActor
final class MediaPlayer {
    /// Matches `MEDIA_CLOCK_ACTIVE_MS` on the web side, which is what consumes
    /// these.
    private static let tickInterval = CMTime(value: 1, timescale: 4)

    private let player = AVPlayer()
    private let jar: CookieJar
    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "Litloft", category: "player")

    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?
    private var appliedSeq = 0
    private var ended = false

    /// Loading has to read the cookie jar, so it cannot be synchronous. Every
    /// command goes through the same chain rather than only that one being
    /// different — otherwise a later command applies first and `appliedSeq`,
    /// which the web side relies on to order readings, goes backwards.
    private var pending: Task<Void, Never>?
    private let nowPlaying = NowPlaying()
    private var source: MediaSource?

    var onTick: ((MediaTick) -> Void)?

    init(jar: CookieJar) {
        self.jar = jar
        player.allowsExternalPlayback = true

        nowPlaying.takeCommands()
        watchForForeground()
        nowPlaying.onPlay = { [weak self] in self?.applyFromRemote(.play) }
        nowPlaying.onPause = { [weak self] in self?.applyFromRemote(.pause) }
        nowPlaying.onSeek = { [weak self] time in self?.applyFromRemote(.seek(time)) }
    }

    isolated deinit {
        for observer in [endObserver, foregroundObserver].compactMap({ $0 }) {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    /// While the app is off screen the web view is suspended and nothing
    /// delivered to it arrives. Playing media self-corrects on the next tick,
    /// but one that stopped out there — it ran out, a call interrupted it —
    /// stops ticking, so the web side would never hear what became of it.
    private func watchForForeground() {
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.emitTick() }
        }
    }

    /// A press on the lock screen is not a command the web side issued, so it
    /// carries the sequence already applied rather than advancing it —
    /// advancing would tell the web that one of its own commands had landed.
    @discardableResult
    func applyFromRemote(_ command: MediaCommand) -> Task<Void, Never> {
        apply(command, seq: appliedSeq)
    }

    @discardableResult
    func apply(_ command: MediaCommand, seq: Int) -> Task<Void, Never> {
        let previous = pending
        let task = Task { [weak self] in
            await previous?.value
            await self?.perform(command, seq: seq)
        }
        pending = task
        return task
    }

    private func perform(_ command: MediaCommand, seq: Int) async {
        switch command {
        case .load(let source):
            await load(source)
        case .play:
            activateAudioSession()
            player.play()
        case .pause:
            player.pause()
        case .seek(let time):
            seek(to: time)
        case .setRate(let rate):
            // Setting a rate starts playback; only carry it while playing.
            if player.rate != 0 { player.rate = Float(rate) }
            player.defaultRate = Float(rate)
        case .setVolume(let volume):
            player.volume = Float(volume)
        case .unload:
            unload()
        }

        appliedSeq = seq
        publishNowPlaying()
        emitTick()
    }

    private func load(_ source: MediaSource) async {
        // AVURLAsset takes cookies at construction; the jar is where the
        // session lives, so it is read here rather than kept in step.
        let cookies = SessionCookies.session(in: await jar.allCookies(), host: source.url.host() ?? "")
        let asset = AVURLAsset(url: source.url, options: [AVURLAssetHTTPCookiesKey: cookies])

        replaceItem(with: AVPlayerItem(asset: asset))
        ended = false
        self.source = source
        activateAudioSession()

        nowPlaying.clearArtwork()
        if let artworkURL = source.artworkURL {
            nowPlaying.showArtwork(from: artworkURL, cookies: cookies)
        }
    }

    private func replaceItem(with item: AVPlayerItem?) {
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        player.replaceCurrentItem(with: item)
        startTicking()

        guard let item else { return }
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.finish()
            }
        }
    }

    private func unload() {
        player.pause()
        replaceItem(with: nil)
        stopTicking()
        ended = false
        source = nil
        nowPlaying.clear()
    }

    private func finish() {
        ended = true
        publishNowPlaying()
        emitTick()
    }

    private func publishNowPlaying() {
        guard let source else { return }
        nowPlaying.isPlaying = player.rate != 0
        nowPlaying.update(NowPlaying.State(
            title: source.title,
            artist: source.artist,
            duration: seconds(player.currentItem?.duration ?? .indefinite),
            time: seconds(player.currentTime()),
            rate: Double(player.rate)
        ))
    }

    private func seek(to time: Double) {
        ended = false
        player.seek(
            to: CMTime(seconds: time, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.emitTick() }
        }
    }

    /// A periodic observer only fires while the timebase runs, so every applied
    /// command emits as well — otherwise a pause would be the last thing the
    /// web side heard about.
    private func startTicking() {
        guard timeObserver == nil else { return }
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: Self.tickInterval,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.emitTick() }
        }
    }

    private func stopTicking() {
        guard let timeObserver else { return }
        player.removeTimeObserver(timeObserver)
        self.timeObserver = nil
    }

    private func emitTick() {
        onTick?(MediaTick(
            appliedSeq: appliedSeq,
            time: seconds(player.currentTime()),
            // Zero rather than a guess when the length is unknown: the web side
            // treats a non-positive duration as "no usable length".
            duration: seconds(player.currentItem?.duration ?? .indefinite),
            paused: player.rate == 0,
            rate: Double(player.defaultRate),
            volume: Double(player.volume),
            buffered: bufferedSeconds(),
            ended: ended
        ))
    }

    /// The end of the last loaded range, not the sum of them: after seeking
    /// back, a leftover range ahead would overstate what is continuously ready.
    private func bufferedSeconds() -> Double {
        guard let last = player.currentItem?.loadedTimeRanges.last?.timeRangeValue else { return 0 }
        return seconds(CMTimeAdd(last.start, last.duration))
    }

    private func seconds(_ time: CMTime) -> Double {
        let value = CMTimeGetSeconds(time)
        return value.isFinite ? value : 0
    }

    private func activateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            log.error("could not take the audio session: \(error, privacy: .public)")
        }
    }
}
