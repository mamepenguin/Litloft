import AVFoundation
import Foundation
import MediaPlayer
import Testing
import UIKit

@testable import Litloft

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerLifecycleTests {
        // MARK: the lock screen

        @Test("a press on the lock screen acts on the file loaded")
        func remoteActsOnTheLoadedFile() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(rig.last?.paused == false)

            await rig.player.applyFromRemote(.pause).value

            #expect(rig.last?.paused == true)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("loading a file takes the lock-screen transport")
        func loadTakesTheTransport() async throws {
            let rig = PlayerRig()
            #expect(rig.player.nowPlaying.hasCommands == false)

            await rig.load(try tone(seconds: 3), as: "a")
            #expect(rig.player.nowPlaying.hasCommands)

            await rig.player.apply(.unload, loadId: "a").value
            #expect(rig.player.nowPlaying.hasCommands == false)
        }

        @Test("the lock-screen toggle pauses what plays and plays what is paused")
        func toggleFollowsThePlayer() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            await rig.player.apply(.play, loadId: "a").value

            rig.player.nowPlaying.onTogglePlayPause()
            #expect(await rig.waitFor { rig.last?.paused == true })

            rig.player.nowPlaying.onTogglePlayPause()
            #expect(await rig.waitFor { rig.last?.paused == false })
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("the lock screen learns the length once the file reports it")
        func lengthReachesTheLockScreen() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")

            #expect(await rig.waitFor { (rig.last?.duration ?? 0) > 0 })

            let info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            let length = try #require(info[MPMediaItemPropertyPlaybackDuration] as? Double)
            #expect(abs(length - 3) < 0.1)
            #expect(info[MPNowPlayingInfoPropertyIsLiveStream] as? Bool == false)
            await rig.player.apply(.unload, loadId: "a").value
        }

        // MARK: the end of a file

        @Test("a file played to its end is reported ended")
        func playsToTheEnd() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 0.6), as: "a")
            await rig.player.apply(.play, loadId: "a").value

            #expect(await rig.waitFor { rig.last?.ended == true })
            #expect(rig.last?.paused == true)
            await rig.player.apply(.unload, loadId: "a").value
        }

        /// A media element starts over; AVPlayer at its end ignores play.
        @Test("play after the end starts the file again")
        func playAfterTheEndRestarts() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 0.6), as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor { rig.last?.ended == true })

            await rig.player.apply(.play, loadId: "a").value

            #expect(rig.last?.ended == false)
            #expect(rig.last?.paused == false)
            #expect(await rig.waitFor { (rig.last?.time ?? 1) < 0.5 })
            await rig.player.apply(.unload, loadId: "a").value
        }

        /// Otherwise the next file's first report says it has ended, and
        /// autoplay skips it.
        @Test("the next file does not start out ended")
        func nextFileIsNotEnded() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 0.6), as: "a")
            await rig.player.apply(.play, loadId: "a").value
            #expect(await rig.waitFor { rig.last?.ended == true })

            await rig.load(try tone(seconds: 3), as: "b")

            let first = try #require(rig.states.first { $0.loadId == "b" })
            #expect(first.ended == false)
            await rig.player.apply(.unload, loadId: "b").value
        }

        // MARK: speed and volume

        @Test("a paused player reports the speed chosen, not zero")
        func pausedReportsChosenRate() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")

            await rig.player.apply(.setRate(1.5), loadId: nil).value

            #expect(rig.last?.paused == true)
            #expect(rig.last?.rate == 1.5)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("choosing a speed while paused does not start playback")
        func rateWhilePausedStaysPaused() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })

            await rig.player.apply(.setRate(1.5), loadId: nil).value
            try? await Task.sleep(for: .milliseconds(300))

            #expect(rig.last?.paused == true)
            await rig.player.apply(.unload, loadId: "a").value
        }

        // MARK: the audio session

        /// Holding the audio session makes the whole app eligible for background
        /// audio, the web view's own media included.
        @Test("the audio session is not taken before there is anything to play")
        func sessionIsNotTakenEarly() async {
            let rig = PlayerRig()

            await rig.player.apply(.play, loadId: nil).value

            #expect(rig.session.log.isEmpty)
        }

        @Test("the audio session is taken with a file and given back with it")
        func sessionFollowsTheFile() async throws {
            let rig = PlayerRig()

            await rig.load(try tone(seconds: 3), as: "a")
            #expect(rig.session.isHeld)

            await rig.player.apply(.unload, loadId: "a").value
            #expect(rig.session.isHeld == false)
            #expect(rig.session.log == ["take", "release"])
        }

        // MARK: navigation and teardown

        @Test("a full navigation stops the file and takes it off the lock screen")
        func navigationStopsPlayback() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")

            await rig.player.stopForNavigation().value

            #expect(rig.session.isHeld == false)
            #expect(rig.last?.loadId == nil)
            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        }

        @Test("a navigation with nothing playing gives nothing back")
        func navigationWithNothingLoaded() async {
            let rig = PlayerRig()

            await rig.player.stopForNavigation().value

            #expect(rig.session.log.isEmpty)
        }

        @Test("a player dropped with a file loaded gives back what it held")
        func droppedPlayerCleansUp() async throws {
            let session = try await loadAndDrop()

            #expect(session.isHeld == false)
            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        }

        private func loadAndDrop() async throws -> FakeAudioSession {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            #expect(rig.session.isHeld)
            return rig.session
        }

        @Test("coming back on screen reports where the file got to")
        func foregroundReports() async throws {
            let rig = PlayerRig()
            await rig.load(try tone(seconds: 3), as: "a")
            let before = rig.states.count

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)

            #expect(await rig.waitFor { rig.states.count > before })
            #expect(rig.last?.loadId == "a")
            await rig.player.apply(.unload, loadId: "a").value
        }
    }
}
