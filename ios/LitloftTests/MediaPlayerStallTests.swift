import Foundation
import MediaPlayer
import Testing

@testable import Litloft

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerStallTests {
        private func stream(
            cutAfter: TimeInterval,
            outage: TimeInterval? = nil
        ) async throws -> (BreakingStream, MediaSource) {
            let server = try BreakingStream(file: try ToneFile.make(seconds: 120), cutAfter: cutAfter, outage: outage)
            let url = try await server.start()
            return (server, MediaSource(url: url, title: "Stream", artist: nil, artworkURL: nil))
        }

        @Test("a stream that stops answering while playing is reported stalled, not failed")
        func stoppedStreamIsStalled() async throws {
            let (server, source) = try await stream(cutAfter: 3)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value

            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.stalled == true })
            #expect(rig.last?.status == .ready)
            let rate = MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] as? Double
            #expect(rate == 0, "the lock screen still counts on")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("a stall ends once the stream answers again and playback moves")
        func stallEndsWhenTheStreamReturns() async throws {
            let (server, source) = try await stream(cutAfter: 3, outage: 8)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.stalled == true })
            let stalledAt = rig.last?.time ?? 0

            #expect(await rig.waitFor(timeout: .seconds(60)) { rig.last?.stalled == false })
            #expect(await rig.waitFor { (rig.last?.time ?? 0) > stalledAt + 0.5 }, "playback did not move on")
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("starting to play is not a stall")
        func startIsNotAStall() async throws {
            let (server, source) = try await stream(cutAfter: 1_000)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value

            #expect(await rig.waitFor(timeout: .seconds(10)) { (rig.last?.time ?? 0) > 2 })
            #expect(!rig.states.contains { $0.stalled })
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("the next file does not start out stalled")
        func nextFileIsNotStalled() async throws {
            let (server, source) = try await stream(cutAfter: 3)
            defer { server.stop() }
            let rig = PlayerRig()
            await rig.load(source, as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor(timeout: .seconds(30)) { rig.last?.stalled == true })

            await rig.load(try tone(seconds: 3), as: "b")

            #expect(rig.last?.loadId == "b")
            #expect(rig.last?.stalled == false)
            await rig.player.apply(.unload, loadId: "b").value
        }
    }
}
