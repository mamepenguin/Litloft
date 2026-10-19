import AVFoundation
import Foundation
import MediaPlayer
import Testing
import UIKit

@testable import Litloft

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerTests {
        // MARK: readiness and failure

        /// Nothing else reports while paused, so without this the web side
        /// never learns the file can be played.
        @Test("a file that is never played is still reported ready")
        func readyWhilePaused() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")

            #expect(await rig.waitFor { rig.last?.status == .ready })
            #expect(rig.last?.paused == true)
            #expect(rig.last?.loadId == "a")
            #expect(abs((rig.last?.duration ?? 0) - 3) < 0.1)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a stream that is never played is still reported ready")
        func streamReadyWhilePaused() async throws {
            try await LocalLitloft.require()
            let rig = PlayerRig()
            await rig.load(LocalLitloft.stream, as: "a")

            #expect(await rig.waitFor { rig.last?.status == .ready })
            #expect(rig.last?.paused == true)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a file the server does not have is reported failed")
        func missingFileFails() async throws {
            try await LocalLitloft.require()
            let rig = PlayerRig()
            await rig.load(LocalLitloft.missing, as: "a")

            #expect(await rig.waitFor { rig.last?.status == .failed })
            #expect(rig.last?.loadId == "a")
            await rig.player.apply(.unload, loadId: "a").value
        }

        /// A seek on a failed item never completes; waiting on it held up every
        /// command behind it, the stop on Lock included.
        @Test("a seek on a failed file does not hold up what follows")
        func seekOnFailedFileDoesNotBlock() async throws {
            try await LocalLitloft.require()
            let rig = PlayerRig()
            await rig.load(LocalLitloft.missing, as: "a")
            #expect(await rig.waitFor { rig.last?.status == .failed })

            rig.player.apply(.seek(time: 10, seekId: "s"), loadId: "a")
            rig.player.apply(.unload, loadId: "a")

            let finished = await rig.waitFor(timeout: .seconds(2)) { rig.last?.loadId == nil }
            #expect(finished, "the unload never ran")
            #expect(rig.session.isHeld == false)
        }

        // MARK: seeking

        @Test("a seek is reported reached only once the position has moved")
        func seekIsReportedAtItsPosition() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 4), as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })

            rig.player.apply(.seek(time: 2.5, seekId: "s1"), loadId: "a")

            #expect(await rig.waitFor { rig.last?.seekId == "s1" })
            let reached = try #require(rig.states.first { $0.seekId == "s1" })
            #expect(abs(reached.time - 2.5) < 0.05, "reported reached at \(reached.time)")
            await rig.player.apply(.unload, loadId: "a").value
        }

        /// While loading, an overtaken seek still says it finished.
        @Test("of two seeks, only the later is reported reached", arguments: [false, true])
        func onlyTheLatestSeekIsReported(waitForReady: Bool) async throws {
            try await LocalLitloft.require()
            let rig = PlayerRig()
            await rig.load(LocalLitloft.stream, as: "a")
            if waitForReady {
                #expect(await rig.waitFor { rig.last?.status == .ready })
            }

            rig.player.apply(.seek(time: 100, seekId: "first"), loadId: "a")
            rig.player.apply(.seek(time: 200, seekId: "second"), loadId: "a")

            #expect(await rig.waitFor { rig.last?.seekId == "second" })
            try? await Task.sleep(for: .milliseconds(300))
            #expect(!rig.states.contains { $0.seekId == "first" })
            let settled = try #require(rig.states.first { $0.seekId == "second" })
            #expect(abs(settled.time - 200) < 0.5, "settled at \(settled.time)")
            await rig.player.apply(.unload, loadId: "a").value
        }

        /// The lock screen's seek lands last, so it is the one that settles
        /// the page's; otherwise the page would hold its own position for good.
        @Test("a lock-screen seek that overtakes the page's settles the page's", arguments: [false, true])
        func remoteSeekSettlesThePagesSeek(overHTTP: Bool) async throws {
            let rig = PlayerRig()
            if overHTTP {
                try await LocalLitloft.require()
                await rig.load(LocalLitloft.stream, as: "a")
            } else {
                await rig.load(try tone(seconds: 30), as: "a")
            }
            #expect(await rig.waitFor { rig.last?.status == .ready })

            rig.player.apply(.seek(time: 20, seekId: "page"), loadId: "a")
            rig.player.nowPlaying.onSeek?(5)

            #expect(await rig.waitFor { rig.last?.seekId == "page" }, "the page's seek was never settled")
            #expect(await rig.waitFor { abs((rig.last?.time ?? 0) - 5) < 0.5 }, "landed at \(rig.last?.time ?? -1)")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a lock-screen seek alone is reported without a page seek")
        func remoteSeekAloneCarriesNoId() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 30), as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })
            let before = rig.states.count

            rig.player.nowPlaying.onSeek?(12)

            #expect(await rig.waitFor { rig.states.dropFirst(before).contains { abs($0.time - 12) < 0.05 } })
            #expect(rig.states.dropFirst(before).allSatisfy { $0.seekId == nil })
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a reached seek is forgotten when the next file loads")
        func reachedSeekBelongsToItsFile() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })
            rig.player.apply(.seek(time: 1, seekId: "s"), loadId: "a")
            #expect(await rig.waitFor { rig.last?.seekId == "s" })

            await rig.load(try tone(seconds: 3), as: "b")

            #expect(rig.last?.loadId == "b")
            #expect(rig.last?.seekId == nil)
            await rig.player.apply(.unload, loadId: "b").value
        }

        // MARK: which file a command is for

        @Test("a command about a file no longer loaded does nothing")
        func staleCommandsAreDropped() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            await rig.load(try tone(seconds: 3), as: "b")
            #expect(await rig.waitFor { rig.last?.status == .ready })

            await rig.player.apply(.play, loadId: "a").value
            #expect(rig.last?.paused == true, "played for a file that is gone")

            rig.player.apply(.seek(time: 2, seekId: "old"), loadId: "a")
            await rig.player.apply(.unload, loadId: "a").value
            try? await Task.sleep(for: .milliseconds(200))

            #expect(rig.last?.loadId == "b", "unloaded the wrong file")
            #expect(!rig.states.contains { $0.seekId == "old" })
            #expect(rig.session.isHeld)
            await rig.player.apply(.unload, loadId: "b").value
        }

        @Test("a player-wide setting applies whichever file is loaded")
        func settingsNeedNoFile() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")

            await rig.player.apply(.setVolume(0.25), loadId: nil).value

            #expect(rig.last?.volume == 0.25)
            await rig.player.apply(.unload, loadId: "a").value
        }

        // MARK: ordering

        @Test("a command that arrives while a load is still running waits for it")
        func commandsWaitForTheLoad() async throws {
            let rig = PlayerRig()
            let load = rig.player.apply(.load(try tone(seconds: 3)), loadId: "a")
            let play = rig.player.apply(.play, loadId: "a")
            await load.value
            await play.value

            #expect(rig.last?.loadId == "a")
            #expect(rig.last?.paused == false, "the play ran before the file it was for")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a pause is not held up for long by a cookie read that never answers")
        func stalledCookieReadDoesNotHoldEverything() async throws {
            let rig = PlayerRig(jar: StallingCookieJar(), cookieReadLimit: .milliseconds(200))
            let started = ContinuousClock.now

            rig.player.apply(.load(try tone(seconds: 3)), loadId: "a")
            await rig.player.applyFromRemote(.pause).value

            #expect(ContinuousClock.now - started < .seconds(2))
            #expect(rig.last?.loadId == "a", "the pause did not wait for the load")
            await rig.player.apply(.unload, loadId: "a").value
        }
    }
}
