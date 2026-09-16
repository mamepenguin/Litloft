import AVFoundation
import Foundation
import MediaPlayer
import Testing
import UIKit

@testable import Litloft

@MainActor
private final class PlayerRig {
    let player: MediaPlayer
    let session = FakeAudioSession()
    private(set) var ticks: [MediaTick] = []

    init(jar: CookieJar = SlowCookieJar()) {
        player = MediaPlayer(jar: jar, audioSession: session)
        player.onTick = { [unowned self] in ticks.append($0) }
    }

    var sequence: [Int] { ticks.map(\.appliedSeq) }

    /// The first tick carrying a sequence at or above `seq`.
    func firstTick(atOrAbove seq: Int) -> MediaTick? {
        ticks.first { $0.appliedSeq >= seq }
    }

    func waitFor(timeout: Duration = .seconds(5), _ condition: () -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while !condition() {
            if ContinuousClock.now > deadline { return false }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return true
    }
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerTests {
        private let remote = MediaSource(
            url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
            title: "A recording",
            artist: nil,
            artworkURL: nil
        )

        private func local(seconds: Double) throws -> MediaSource {
            MediaSource(url: try ToneFile.make(seconds: seconds), title: "Tone", artist: nil, artworkURL: nil)
        }

        // MARK: ordering

        @Test("a command that arrives while a load is still running waits for it")
        func commandsApplyInOrder() async {
            let rig = PlayerRig()

            let load = rig.player.apply(.load(remote), seq: 1)
            let play = rig.player.apply(.play, seq: 2)
            // Both, not just the last: without the chain, the play finishes
            // first and the load lands after it.
            await load.value
            await play.value

            #expect(rig.sequence == rig.sequence.sorted(), "went backwards: \(rig.sequence)")
            #expect(rig.sequence.last == 2)
        }

        @Test("a run of commands reports each one in turn")
        func everyCommandIsReported() async {
            let rig = PlayerRig()

            rig.player.apply(.load(remote), seq: 1)
            rig.player.apply(.pause, seq: 2)
            rig.player.apply(.setVolume(0.5), seq: 3)
            await rig.player.apply(.seek(0), seq: 4).value

            var seen: [Int] = []
            for seq in rig.sequence where seen.last != seq {
                seen.append(seq)
            }
            #expect(seen == [1, 2, 3, 4])
        }

        // MARK: remote commands

        @Test("a press on the lock screen does not claim a web command landed")
        func remoteDoesNotAdvanceTheSequence() async {
            let rig = PlayerRig()
            await rig.player.apply(.load(remote), seq: 4).value

            await rig.player.applyFromRemote(.play).value
            await rig.player.applyFromRemote(.pause).value

            #expect(rig.sequence.allSatisfy { $0 <= 4 })
            #expect(rig.sequence.last == 4)
        }

        /// The press is queued behind a web command that has not run yet. Taking
        /// the sequence when the press arrives, rather than when it runs, would
        /// set it back below that command.
        @Test("a press queued behind a web command does not move the sequence back")
        func remoteQueuedBehindWebCommand() async {
            let rig = PlayerRig()
            await rig.player.apply(.pause, seq: 1).value

            rig.player.apply(.seek(0), seq: 2)
            await rig.player.applyFromRemote(.play).value

            #expect(rig.sequence == rig.sequence.sorted(), "went backwards: \(rig.sequence)")
            #expect(rig.sequence.last == 2)
        }

        @Test("a remote press still takes effect")
        func remoteStillActs() async throws {
            let rig = PlayerRig()
            await rig.player.apply(.load(try local(seconds: 3)), seq: 1).value
            await rig.player.apply(.play, seq: 2).value
            // Asserting only the end state would pass on a player that was
            // never playing.
            #expect(rig.ticks.last?.paused == false)

            await rig.player.applyFromRemote(.pause).value

            #expect(rig.ticks.last?.paused == true)
            await rig.player.apply(.unload, seq: 3).value
        }

        // MARK: seeking

        /// A tick at the seek's sequence tells the web its hold can go; if the
        /// position in it is still the old one, the thumb jumps back and a
        /// stale position can be saved.
        @Test("a seek is acknowledged only once the position has moved")
        func seekIsAcknowledgedAfterItLands() async throws {
            let rig = PlayerRig()
            await rig.player.apply(.load(try local(seconds: 4)), seq: 1).value
            await rig.player.apply(.pause, seq: 2).value

            await rig.player.apply(.seek(2.5), seq: 3).value

            let acknowledged = try #require(rig.firstTick(atOrAbove: 3))
            #expect(abs(acknowledged.time - 2.5) < 0.05, "acknowledged at \(acknowledged.time)")
            await rig.player.apply(.unload, seq: 4).value
        }

        // MARK: audio session

        /// Holding the audio session makes the whole app eligible for background
        /// audio, the web view's own media included.
        @Test("the audio session is not taken before there is anything to play")
        func sessionIsNotTakenEarly() async {
            let rig = PlayerRig()

            await rig.player.apply(.play, seq: 1).value

            #expect(rig.session.log.isEmpty)
        }

        @Test("the audio session is taken with a file and given back with it")
        func sessionFollowsTheFile() async {
            let rig = PlayerRig()

            await rig.player.apply(.load(remote), seq: 1).value
            #expect(rig.session.isHeld)

            await rig.player.apply(.unload, seq: 2).value
            #expect(rig.session.isHeld == false)
            #expect(rig.session.log == ["take", "release"])
        }

        // MARK: navigation

        @Test("a full navigation stops the file and takes it off the lock screen")
        func navigationStopsPlayback() async {
            let rig = PlayerRig()
            await rig.player.apply(.load(remote), seq: 5).value
            #expect(rig.session.isHeld)

            await rig.player.stopForNavigation().value

            #expect(rig.session.isHeld == false)
            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
            #expect(rig.sequence.last == 5, "the web did not ask for this")
        }

        @Test("a navigation with nothing playing gives nothing back")
        func navigationWithNothingLoaded() async {
            let rig = PlayerRig()

            await rig.player.stopForNavigation().value

            #expect(rig.session.log.isEmpty)
        }

        // MARK: reporting

        @Test("a paused player still reports, since the clock is not running")
        func pauseIsReported() async {
            let rig = PlayerRig()

            await rig.player.apply(.pause, seq: 7).value

            #expect(rig.ticks.last?.paused == true)
            #expect(rig.ticks.last?.appliedSeq == 7)
        }

        @Test("a length the player cannot know is reported as none")
        func unknownDurationIsZero() async {
            let rig = PlayerRig()

            await rig.player.apply(.pause, seq: 1).value

            #expect(rig.ticks.last?.duration == 0)
        }

        @Test("volume is carried through to the player")
        func volumeIsApplied() async {
            let rig = PlayerRig()

            await rig.player.apply(.setVolume(0.25), seq: 1).value

            #expect(rig.ticks.last?.volume == 0.25)
        }

        @Test("coming back on screen reports where the file got to")
        func foregroundReports() async {
            let rig = PlayerRig()
            await rig.player.apply(.load(remote), seq: 3).value
            let before = rig.ticks.count

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            await Task.yield()

            #expect(rig.ticks.count > before)
            #expect(rig.ticks.last?.appliedSeq == 3, "a tick nobody asked for must not move the sequence")
            await rig.player.apply(.unload, seq: 4).value
        }
    }
}
