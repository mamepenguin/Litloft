import AVFoundation
import Foundation
import Testing

@testable import Litloft

/// A jar that makes the async half of loading observable.
@MainActor
private final class SlowCookieJar: CookieJar {
    var delayNanoseconds: UInt64 = 20_000_000

    func setCookie(_ cookie: HTTPCookie) async {}
    func deleteCookie(_ cookie: HTTPCookie) async {}

    func allCookies() async -> [HTTPCookie] {
        try? await Task.sleep(nanoseconds: delayNanoseconds)
        return []
    }
}

@MainActor
struct MediaPlayerTests {
    private func makePlayer() -> (player: MediaPlayer, ticks: () -> [MediaTick]) {
        let player = MediaPlayer(jar: SlowCookieJar())
        var ticks: [MediaTick] = []
        player.onTick = { ticks.append($0) }
        return (player, { ticks })
    }

    private let source = MediaSource(
        url: URL(string: "http://litloft.local:3000/api/files/abc/stream")!,
        title: "A recording",
        artist: nil,
        artworkURL: nil,
        startAt: 0
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

    @Test("volume is carried through to the player")
    func volumeIsApplied() async {
        let (player, ticks) = makePlayer()

        await player.apply(.setVolume(0.25), seq: 1).value

        #expect(ticks().last?.volume == 0.25)
    }
}
