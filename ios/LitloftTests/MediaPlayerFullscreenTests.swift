import AVFoundation
import AVKit
import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

private let movie = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("Fixtures/tiny.mp4")

private let twoSeconds = CMTime(seconds: 2, preferredTimescale: 600)

private let frame = SurfaceGeometry(left: 0, width: 390, height: 219, anchor: .fixed, top: 50, stick: nil)

@MainActor
private final class Rig {
    let fullscreen = FakeSystemFullscreen()
    let pip = FakePictureInPicture()
    let rig: PlayerRig
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))

    init(systemPlayer: SystemFullscreen? = nil) {
        let pip = pip
        rig = PlayerRig(pictureInPicture: { _ in pip }, fullscreen: systemPlayer ?? fullscreen)
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first }
            .first?
            .addSubview(webView)
        rig.player.surface.attach(to: webView)
    }

    var avPlayer: AVPlayer? { rig.player.surface.view.playerLayer.player }

    func load(_ kind: MediaKind, as loadId: String) async throws {
        let url = kind == .video ? movie : try tone(seconds: 3).url
        await rig.load(MediaSource(url: url, title: "A file", artist: nil, artworkURL: nil, kind: kind), as: loadId)
        await rig.player.apply(.surface(frame), loadId: loadId).value
    }

    /// What the shell presented over the window, once UIKit has put it there.
    var presented: AVPlayerViewController? {
        webView.window?.rootViewController?.presentedViewController as? AVPlayerViewController
    }

    func waitUntilPresented() async -> AVPlayerViewController? {
        _ = await rig.waitFor { self.presented?.view.window != nil && self.presented?.isBeingPresented == false }
        return presented
    }

    func waitUntilGone() async -> Bool {
        await rig.waitFor { self.presentedAnywhere == nil }
    }

    private var presentedAnywhere: UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first?.rootViewController?.presentedViewController }
            .first
    }

    func close() async {
        await rig.player.apply(.unload, loadId: nil).value
        _ = await waitUntilGone()
        webView.removeFromSuperview()
    }
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerFullscreenTests {
        @Test("the page's request shows the player's own video in the system's fullscreen player")
        func presentsThePlayersVideo() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")

            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(rig.fullscreen.presented.count == 1)
            #expect(rig.fullscreen.presented.first === rig.avPlayer)
            await rig.close()
        }

        @Test("audio has no picture to show in fullscreen")
        func audioIsNotPresented() async throws {
            let rig = Rig()
            try await rig.load(.audio, as: "a")

            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(rig.fullscreen.presented.isEmpty)
            await rig.close()
        }

        @Test("a request about a file no longer loaded does nothing")
        func staleRequestDoesNothing() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            try await rig.load(.video, as: "b")

            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(rig.fullscreen.presented.isEmpty)
            await rig.close()
        }

        @Test("a second request while it is up presents nothing more")
        func presentedOnce() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")

            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(rig.fullscreen.presented.count == 1)
            await rig.close()
        }

        @Test("while it is up, only it starts picture in picture when the app leaves; afterwards the page's does again")
        func pictureInPictureIsHandedOver() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            #expect(rig.pip.startsAutomatically)

            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            #expect(!rig.pip.startsAutomatically)

            rig.fullscreen.end()
            #expect(rig.pip.startsAutomatically)
            await rig.close()
        }

        @Test("the page's picture in picture closes as the fullscreen player opens")
        func pagePictureInPictureCloses() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.pip(active: true), loadId: "a").value
            #expect(rig.pip.isActive)

            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(!rig.pip.isActive)
            await rig.close()
        }

        @Test("when it goes away the page is told where the viewer left the video, even paused")
        func endReportsThePosition() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            let player = try #require(rig.avPlayer)
            await player.seek(to: twoSeconds, toleranceBefore: .zero, toleranceAfter: .zero)
            let before = rig.rig.states.count

            rig.fullscreen.end()

            #expect(rig.rig.states.count > before, "the page was never told")
            #expect(abs((rig.rig.last?.time ?? 0) - 2) < 0.1)
            #expect(rig.rig.last?.paused == true)
            await rig.close()
        }

        @Test("closing the system's player leaves the video where the viewer left it", arguments: [1, 2])
        func closingKeepsThePosition(round: Int) async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            let player = try #require(rig.avPlayer)

            for _ in 0..<round {
                await rig.rig.player.apply(.fullscreen, loadId: "a").value
                #expect(await rig.rig.waitFor { system.isActive })
                await player.seek(to: twoSeconds, toleranceBefore: .zero, toleranceAfter: .zero)
                try await Task.sleep(for: .milliseconds(600))
                system.dismiss()
                try await Task.sleep(for: .milliseconds(600))
            }

            #expect(abs(player.currentTime().seconds - 2) < 0.1)
            #expect(abs((rig.rig.last?.time ?? 0) - 2) < 0.1)
            await rig.close()
        }

    }

    /// The real system player, presented over the test host's window.
    @MainActor
    @Suite
    struct SystemFullscreenPlayerTests {
        @Test("the system's player shows the page's own player, and closing it tells the page")
        func realPlayerShowsAndReports() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")

            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            #expect(system.isActive)
            #expect(system.player === rig.avPlayer)
            #expect(!rig.pip.startsAutomatically)
            let before = rig.rig.states.count

            system.dismiss()

            #expect(await rig.rig.waitFor { !system.isActive })
            #expect(rig.pip.startsAutomatically)
            #expect(rig.rig.states.count > before, "the page was never told")
            await rig.close()
        }

        @Test("closing it the viewer's way, through AVKit's callback, tells the page")
        func viewerCloseTellsThePage() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            let controller = try #require(await rig.waitUntilPresented())
            let before = rig.rig.states.count

            controller.dismiss(animated: true)
            let coordinator = try #require(controller.transitionCoordinator)
            system.playerViewController(controller, willEndFullScreenPresentationWithAnimationCoordinator: coordinator)

            #expect(await rig.rig.waitFor { !system.isActive })
            #expect(await rig.rig.waitFor { rig.pip.startsAutomatically })
            #expect(rig.rig.states.count > before, "the page was never told")
            await rig.close()
        }

        @Test("a picture in picture it started keeps it active after it leaves the screen, until it stops or fails",
              arguments: [true, false])
        func pictureInPictureKeepsItActive(stops: Bool) async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            let controller = try #require(await rig.waitUntilPresented())

            system.playerViewControllerWillStartPictureInPicture(controller)
            system.dismiss()
            #expect(await rig.waitUntilGone())
            #expect(system.isActive)
            #expect(!rig.pip.startsAutomatically)

            if stops {
                system.playerViewControllerDidStopPictureInPicture(controller)
            } else {
                system.playerViewController(controller, failedToStartPictureInPictureWithError: CancellationError())
            }
            #expect(!system.isActive)
            #expect(rig.pip.startsAutomatically)
            await rig.close()
        }

        @Test("another file leaves the system's picture in picture in charge until it stops")
        func anotherFileKeepsItsPictureInPicture() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            let controller = try #require(await rig.waitUntilPresented())
            system.playerViewControllerWillStartPictureInPicture(controller)

            try await rig.load(.video, as: "b")
            #expect(await rig.waitUntilGone())
            #expect(system.isActive)
            #expect(!rig.pip.startsAutomatically)

            system.playerViewControllerDidStopPictureInPicture(controller)
            #expect(rig.pip.startsAutomatically)
            await rig.rig.player.apply(.fullscreen, loadId: "b").value
            #expect(system.player === rig.avPlayer)
            system.dismiss()
            await rig.close()
        }

        @Test("a request the system cannot present leaves the page's picture in picture as it was")
        func refusedPresentChangesNothing() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            rig.webView.removeFromSuperview()

            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            #expect(!system.isActive)
            #expect(rig.pip.startsAutomatically)
            await rig.close()
        }

        @Test("leaving the app with it on screen lets go of the player, and coming back shows it again")
        func backgroundWhileOnScreen() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            let player = try #require(rig.avPlayer)
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            _ = await rig.waitUntilPresented()

            NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
            #expect(system.player == nil)

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            #expect(system.player === player)
            system.dismiss()
            await rig.close()
        }

        @Test("after it closes, leaving the app lets go of the player; it shows it again next time")
        func backgroundAfterClosing() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            _ = await rig.waitUntilPresented()
            system.dismiss()
            #expect(await rig.waitUntilGone())

            NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
            #expect(system.player == nil)
            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)

            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            #expect(system.player === rig.avPlayer)
            system.dismiss()
            await rig.close()
        }

        @Test("its picture in picture keeps the player while the app is away, and lets go when it stops there")
        func pictureInPictureAway() async throws {
            let system = SystemFullscreenPlayer()
            let rig = Rig(systemPlayer: system)
            try await rig.load(.video, as: "a")
            let player = try #require(rig.avPlayer)
            await rig.rig.player.apply(.fullscreen, loadId: "a").value
            let controller = try #require(await rig.waitUntilPresented())
            system.playerViewControllerWillStartPictureInPicture(controller)
            system.dismiss()
            #expect(await rig.waitUntilGone())

            NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
            #expect(system.player === player)

            system.playerViewControllerDidStopPictureInPicture(controller)
            #expect(system.player == nil)
            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            await rig.close()
        }

        @Test("a video moved back from its end, by any player, plays on from there")
        func movedBackFromTheEnd() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            #expect(await rig.rig.waitFor { rig.rig.last?.status == .ready })
            await rig.rig.player.apply(.seek(time: 9.5, seekId: "s"), loadId: "a").value
            await rig.rig.player.apply(.play, loadId: "a").value
            #expect(await rig.rig.waitFor(timeout: .seconds(5)) { rig.rig.last?.ended == true })
            let player = try #require(rig.avPlayer)

            let threeSeconds = CMTime(seconds: 3, preferredTimescale: 600)
            await player.seek(to: threeSeconds, toleranceBefore: .zero, toleranceAfter: .zero)

            #expect(await rig.rig.waitFor { rig.rig.last?.ended == false })
            await rig.rig.player.apply(.play, loadId: "a").value
            #expect(player.currentTime().seconds > 2.9, "play started over")
            await rig.close()
        }

        @Test("another file puts the fullscreen player away", arguments: [MediaKind.video, .audio])
        func anotherFileDismisses(kind: MediaKind) async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            try await rig.load(kind, as: "b")

            #expect(!rig.fullscreen.isActive)
            #expect(rig.pip.startsAutomatically)
            await rig.close()
        }

        @Test("unloading puts the fullscreen player away")
        func unloadDismisses() async throws {
            let rig = Rig()
            try await rig.load(.video, as: "a")
            await rig.rig.player.apply(.fullscreen, loadId: "a").value

            await rig.rig.player.apply(.unload, loadId: "a").value

            #expect(!rig.fullscreen.isActive)
            await rig.close()
        }
    }
}
