import AVFoundation
import Foundation
import UIKit
import os

/// Plays Litloft's media natively so it keeps going when the app is not on
/// screen. The web app stays in charge: it sends commands and draws the
/// controls, and this reports what the player is doing.
@MainActor
final class MediaPlayer {
    /// Matches `MEDIA_CLOCK_ACTIVE_MS` on the web side, which is what consumes
    /// these.
    private static let tickInterval = CMTime(value: 1, timescale: 4)

    private let player = AVPlayer()
    private let jar: CookieJar
    private let audioSession: AudioSession
    private let cookieReadLimit: Duration
    let nowPlaying = NowPlaying()

    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?
    private var statusObservation: NSKeyValueObservation?
    private var waitingObservation: NSKeyValueObservation?

    private var source: MediaSource?
    /// The web side's id for the file now held; commands naming another are
    /// stale and do nothing.
    private var loadId: String?
    private var ended = false
    private var publishedDuration = 0.0

    /// Only the latest seek's completion counts: one overtaken by another
    /// still completes, and while the file is loading it even says it
    /// finished. Once it lands, the web side's latest seek is settled, even
    /// when the one that landed came from the lock screen after it.
    private var latestSeek = 0
    private var webSeekId: String?
    private var reachedSeekId: String?

    /// Loading reads the cookie jar, so it cannot be synchronous, and a command
    /// that follows a load must not run first. Nothing else waits here.
    private var pending: Task<Void, Never>?

    var onState: ((MediaState) -> Void)?

    /// `cookieReadLimit`: WebKit answers from another process, and every later
    /// command — a pause pressed on the lock screen included — waits behind a
    /// load until it does. Two seconds is far past a normal answer and still
    /// short enough for a press to feel answered.
    init(
        jar: CookieJar,
        audioSession: AudioSession = SystemAudioSession(),
        cookieReadLimit: Duration = .seconds(2)
    ) {
        self.jar = jar
        self.audioSession = audioSession
        self.cookieReadLimit = cookieReadLimit
        player.allowsExternalPlayback = true

        watchForForeground()
        watchForWaiting()
        nowPlaying.onPlay = { [weak self] in self?.applyFromRemote(.play) }
        nowPlaying.onPause = { [weak self] in self?.applyFromRemote(.pause) }
        nowPlaying.onSeek = { [weak self] time in
            self?.applyFromRemote(.seek(time: time, seekId: nil))
        }
    }

    isolated deinit {
        for observer in [endObserver, foregroundObserver].compactMap({ $0 }) {
            NotificationCenter.default.removeObserver(observer)
        }
        statusObservation?.invalidate()
        waitingObservation?.invalidate()
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        // Torn down with a file still loaded — the web view went away with the
        // server it belonged to — so nobody else will give these back.
        if source != nil {
            player.pause()
            nowPlaying.clear()
            audioSession.release()
        }
    }

    /// While the app is off screen the web view is suspended and nothing
    /// delivered to it arrives. A player that stopped out there stops
    /// reporting, so the web side would never hear what became of it.
    private func watchForForeground() {
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.report() }
        }
    }

    /// Waiting stops the timebase, so the ticks that would carry it stop too.
    private func watchForWaiting() {
        waitingObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in self?.report() }
        }
    }

    // MARK: commands

    /// A press on the lock screen is about whatever is loaded now.
    @discardableResult
    func applyFromRemote(_ command: MediaCommand) -> Task<Void, Never> {
        apply(command, loadId: loadId)
    }

    /// A full navigation replaces the page that owned this playback without
    /// its teardown running — Lock is one — so the shell stops it itself.
    @discardableResult
    func stopForNavigation() -> Task<Void, Never> {
        apply(.unload, loadId: loadId)
    }

    @discardableResult
    func apply(_ command: MediaCommand, loadId: String?) -> Task<Void, Never> {
        let previous = pending
        let task = Task { [weak self] in
            await previous?.value
            await self?.perform(command, loadId: loadId)
        }
        pending = task
        return task
    }

    private func perform(_ command: MediaCommand, loadId commandLoadId: String?) async {
        if case .load(let source) = command, let commandLoadId {
            await load(source, loadId: commandLoadId)
            report()
            return
        }
        // Player-wide settings carry no id; everything else is about one file.
        if let commandLoadId, commandLoadId != loadId { return }

        switch command {
        case .load:
            return
        case .play:
            play()
        case .pause:
            player.pause()
        case .seek(let time, let seekId):
            seek(to: time, seekId: seekId)
        case .setRate(let rate):
            // Setting a rate starts playback; only carry it while playing.
            if player.rate != 0 { player.rate = Float(rate) }
            player.defaultRate = Float(rate)
        case .setVolume(let volume):
            player.volume = Float(volume)
        case .unload:
            unload()
        }
        report()
    }

    private func play() {
        // Nothing to play means nothing to hold the session for, and holding it
        // would let the web view's own media outlive the screen.
        guard player.currentItem != nil else { return }
        // At the end AVPlayer ignores play; a media element starts over.
        if ended {
            ended = false
            player.seek(to: .zero)
        }
        audioSession.take()
        player.play()
    }

    private func load(_ source: MediaSource, loadId: String) async {
        // AVURLAsset takes cookies at construction; the jar is where the
        // session lives, so it is read here rather than kept in step.
        let cookies = await sessionCookies(for: source.url.host() ?? "")
        let asset = AVURLAsset(url: source.url, options: [AVURLAssetHTTPCookiesKey: cookies])

        replaceItem(with: AVPlayerItem(asset: asset))
        self.source = source
        self.loadId = loadId
        audioSession.take()
        nowPlaying.takeCommands()

        nowPlaying.clearArtwork()
        if let artworkURL = source.artworkURL {
            nowPlaying.showArtwork(from: artworkURL, cookies: cookies)
        }
    }

    private func unload() {
        // Every page load arrives here too; with nothing loaded there is no
        // session or lock-screen entry to give back.
        guard source != nil else { return }
        player.pause()
        replaceItem(with: nil)
        stopTicking()
        source = nil
        loadId = nil
        nowPlaying.clear()
        audioSession.release()
    }

    /// Not awaited: a seek on a file that failed to load never completes, and
    /// everything behind it would wait for good.
    private func seek(to time: Double, seekId: String?) {
        guard player.currentItem?.status != .failed else { return }
        if let seekId { webSeekId = seekId }
        latestSeek += 1
        let seek = latestSeek
        ended = false
        player.seek(
            to: CMTime(seconds: time, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        ) { [weak self] _ in
            Task { @MainActor in self?.reached(seek) }
        }
    }

    private func reached(_ seek: Int) {
        guard seek == latestSeek else { return }
        reachedSeekId = webSeekId
        report()
    }

    // MARK: the item

    /// Past the limit the file loads without them: a public drive plays, and a
    /// protected one fails to load rather than holding up everything behind it.
    private func sessionCookies(for host: String) async -> [HTTPCookie] {
        let jar = self.jar
        let limit = cookieReadLimit
        return await withCheckedContinuation { continuation in
            let answer = FirstAnswer(continuation)
            Task { @MainActor in
                answer.give(SessionCookies.session(in: await jar.allCookies(), host: host))
            }
            Task { @MainActor in
                try? await Task.sleep(for: limit)
                answer.give([])
            }
        }
    }

    private func replaceItem(with item: AVPlayerItem?) {
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        statusObservation?.invalidate()
        statusObservation = nil
        latestSeek += 1
        webSeekId = nil
        reachedSeekId = nil
        ended = false
        publishedDuration = 0

        player.replaceCurrentItem(with: item)
        startTicking()

        guard let item else { return }
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.finish() }
        }
        // Readiness and failure arrive whether or not anything is playing, and
        // nothing else would report them while paused.
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in self?.report() }
        }
    }

    private func finish() {
        ended = true
        report()
    }
}

// MARK: reporting

extension MediaPlayer {
    /// A stream that stops answering leaves the player here for good rather
    /// than failing it, and so does every start until the first data arrives.
    private var waiting: Bool {
        player.timeControlStatus == .waitingToPlayAtSpecifiedRate
    }

    private var status: MediaStatus {
        switch player.currentItem?.status {
        case .readyToPlay: .ready
        case .failed: .failed
        default: .loading
        }
    }

    private func report() {
        let state = currentState()
        publishNowPlaying(duration: state.duration)
        onState?(state)
    }

    private func currentState() -> MediaState {
        MediaState(
            loadId: loadId,
            status: status,
            seekId: reachedSeekId,
            time: seconds(player.currentTime()),
            // Zero rather than a guess when the length is unknown: the web side
            // treats a non-positive duration as "no usable length".
            duration: seconds(player.currentItem?.duration ?? .indefinite),
            paused: player.rate == 0,
            rate: Double(player.defaultRate),
            volume: Double(player.volume),
            buffered: bufferedSeconds(),
            ended: ended,
            waiting: waiting
        )
    }

    /// Elapsed time is published when something changes rather than on every
    /// tick; the system extrapolates from the position and rate. The length
    /// usually arrives after the load, so a new one is published too.
    private func publishNowPlaying(duration: Double) {
        guard let source else { return }
        publishedDuration = duration
        nowPlaying.isPlaying = player.rate != 0
        nowPlaying.update(NowPlaying.State(
            title: source.title,
            artist: source.artist,
            duration: duration,
            time: seconds(player.currentTime()),
            // The rate stays up while waiting; the lock screen would count on.
            rate: waiting ? 0 : Double(player.rate)
        ))
    }

    /// A periodic observer only fires while the timebase runs; everything else
    /// is reported where it happens.
    private func startTicking() {
        guard timeObserver == nil else { return }
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: Self.tickInterval,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    /// The lock screen only needs republishing when the length changes; the
    /// web side needs every position.
    private func tick() {
        let state = currentState()
        if source != nil, state.duration != publishedDuration {
            publishNowPlaying(duration: state.duration)
        }
        onState?(state)
    }

    private func stopTicking() {
        guard let timeObserver else { return }
        player.removeTimeObserver(timeObserver)
        self.timeObserver = nil
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
}
