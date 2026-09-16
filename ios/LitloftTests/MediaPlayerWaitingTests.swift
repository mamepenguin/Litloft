import Foundation
import MediaPlayer
import Testing

@testable import Litloft

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerWaitingTests {
        private func stream(
            cutAfter: TimeInterval,
            outage: TimeInterval? = nil
        ) async throws -> (BreakingStream, MediaSource) {
            let server = try BreakingStream(file: try ToneFile.make(seconds: 120), cutAfter: cutAfter, outage: outage)
            let url = try await server.start()
            return (server, MediaSource(url: url, title: "Stream", artist: nil, artworkURL: nil))
        }

        private var lockScreenRate: Double? {
            MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Double
        }

        @Test("a stream that stops answering while playing is reported waiting, not failed")
        func stoppedStreamIsWaiting() async throws {
            let (server, source) = try await stream(cutAfter: 3)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor(timeout: .seconds(10)) { (rig.last?.time ?? 0) > 1 })

            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.waiting == true })
            #expect(rig.last?.status == .ready)
            #expect(lockScreenRate == 0, "the lock screen still counts on")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("playing on from a point the stream can no longer reach is reported waiting")
        func playIntoAGoneStreamIsWaiting() async throws {
            let (server, source) = try await stream(cutAfter: 1)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })
            try await Task.sleep(for: .seconds(2))

            rig.player.apply(.seek(time: 100, seekId: "far"), loadId: "a")
            await rig.player.apply(.play, loadId: "a").value

            #expect(await rig.waitFor(timeout: .seconds(10)) { rig.last?.waiting == true })
            #expect(lockScreenRate == 0)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("pausing while waiting ends the wait")
        func pauseEndsTheWait() async throws {
            let (server, source) = try await stream(cutAfter: 3)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.waiting == true })

            await rig.player.apply(.pause, loadId: "a").value

            #expect(await rig.waitFor { rig.last?.waiting == false })
            #expect(rig.last?.paused == true)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("the wait ends once the stream answers again, and the lock screen counts on")
        func waitEndsWhenTheStreamReturns() async throws {
            let (server, source) = try await stream(cutAfter: 3, outage: 8)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor(timeout: .seconds(10)) { (rig.last?.time ?? 0) > 1 })
            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.waiting == true })
            let waitedAt = rig.last?.time ?? 0

            #expect(await rig.waitFor(timeout: .seconds(60)) { rig.last?.waiting == false })
            #expect(lockScreenRate == 1, "the lock screen stayed stopped")
            #expect(await rig.waitFor { (rig.last?.time ?? 0) > waitedAt + 0.5 }, "playback did not move on")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a stream that keeps answering is not reported waiting once it plays")
        func playingIsNotWaiting() async throws {
            let (server, source) = try await stream(cutAfter: 1_000)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value

            #expect(await rig.waitFor(timeout: .seconds(10)) { (rig.last?.time ?? 0) > 2 })
            #expect(rig.last?.waiting == false)
            await rig.player.apply(.unload, loadId: "a").value
        }
    }
}
