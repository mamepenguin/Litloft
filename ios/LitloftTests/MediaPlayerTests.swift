import AVFoundation
import Foundation
import UIKit
import MediaPlayer
import Testing

@testable import Litloft

@MainActor
struct MediaPlayerTests {
    private struct Rig {
        let player: MediaPlayer
        let ticks: () -> [MediaTick]
        let session: FakeAudioSession
    }

    private func makeRig() -> Rig {
        let session = FakeAudioSession()
        let player = MediaPlayer(jar: SlowCookieJar(), audioSession: session)
        var ticks: [MediaTick] = []
        player.onTick = { ticks.append($0) }
        return Rig(player: player, ticks: { ticks }, session: session)
    }

    private func makePlayer() -> (player: MediaPlayer, ticks: () -> [MediaTick]) {
        let rig = makeRig()
        return (rig.player, rig.ticks)
    }

    /// Holding the audio session makes the whole app eligible for background
    /// audio, the web view's own media included.
    @Test("the audio session is not taken before there is anything to play")
    func sessionIsNotTakenEarly() async {
        let rig = makeRig()
        let (player, session) = (rig.player, rig.session)

        await player.apply(.play, seq: 1).value

        #expect(session.log.isEmpty)
    }

    @Test("the audio session is taken with a file and given back with it")
    func sessionFollowsTheFile() async {
        let rig = makeRig()
        let (player, session) = (rig.player, rig.session)

        await player.apply(.load(source), seq: 1).value
        #expect(session.isHeld)

        await player.apply(.unload, seq: 2).value
        #expect(session.isHeld == false)
        #expect(session.log == ["take", "release"])
    }

    private let source = MediaSource(
        url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
        title: "A recording",
        artist: nil,
        artworkURL: nil
    )

    @Test("a command that arrives while a load is still running waits for it")
    func commandsApplyInOrder() async {
        let (player, ticks) = makePlayer()

        player.apply(.load(source), seq: 1)
        let last = player.apply(.play, seq: 2)
        await last.value

        let sequence = ticks().map(\.appliedSeq)
        #expect(sequence == sequence.sorted(), "appliedSeq must never go backwards, got \(sequence)")
        #expect(sequence.last == 2)
    }

    @Test("a run of commands reports each one in turn")
    func everyCommandIsReported() async {
        let (player, ticks) = makePlayer()

        player.apply(.load(source), seq: 1)
        player.apply(.pause, seq: 2)
        player.apply(.setVolume(0.5), seq: 3)
        await player.apply(.seek(0), seq: 4).value

        // A seek settling emits again for the same command, so the claim is
        // about the order commands are reported in, not the tick count.
        var seen: [Int] = []
        for seq in ticks().map(\.appliedSeq) where seen.last != seq {
            seen.append(seq)
        }
        #expect(seen == [1, 2, 3, 4])
    }

    @Test("a paused player still reports, since the clock is not running")
    func pauseIsReported() async {
        let (player, ticks) = makePlayer()

        await player.apply(.pause, seq: 7).value

        #expect(ticks().last?.paused == true)
        #expect(ticks().last?.appliedSeq == 7)
    }

    @Test("a length the player cannot know is reported as none")
    func unknownDurationIsZero() async {
        let (player, ticks) = makePlayer()

        await player.apply(.pause, seq: 1).value

        #expect(ticks().last?.duration == 0)
    }

    @Test("a press on the lock screen does not claim a web command landed")
    func remoteDoesNotAdvanceTheSequence() async {
        let (player, ticks) = makePlayer()
        await player.apply(.load(source), seq: 4).value

        await player.applyFromRemote(.play).value
        await player.applyFromRemote(.pause).value

        #expect(ticks().map(\.appliedSeq).allSatisfy { $0 <= 4 })
        #expect(ticks().last?.appliedSeq == 4)
    }

    @Test("a remote press still takes effect")
    func remoteStillActs() async {
        let (player, ticks) = makePlayer()
        await player.apply(.load(source), seq: 1).value
        await player.apply(.play, seq: 2).value
        // Asserting only the end state would pass on a player that was never
        // playing, which is most of them in a test.
        #expect(ticks().last?.paused == false)

        await player.applyFromRemote(.pause).value

        #expect(ticks().last?.paused == true)
    }

    @Test("coming back on screen reports where the file got to")
    func foregroundReports() async {
        let (player, ticks) = makePlayer()
        await player.apply(.load(source), seq: 3).value
        let before = ticks().count

        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        await Task.yield()

        #expect(ticks().count > before)
        #expect(ticks().last?.appliedSeq == 3, "a tick nobody asked for must not move the sequence")
    }

    @Test("volume is carried through to the player")
    func volumeIsApplied() async {
        let (player, ticks) = makePlayer()

        await player.apply(.setVolume(0.25), seq: 1).value

        #expect(ticks().last?.volume == 0.25)
    }
}
