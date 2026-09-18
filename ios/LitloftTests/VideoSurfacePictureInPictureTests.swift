import AVFoundation
import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

@MainActor
private final class FakePictureInPicture: PictureInPicture {
    var isActive = false
    var isPossible = true
    var starts = 0
    var stops = 0
    var onStarting: ((Bool) -> Void)?
    var onChange: (() -> Void)?

    func start() {
        starts += 1
        onStarting?(true)
        isActive = true
        onStarting?(false)
        onChange?()
    }

    func stop() {
        stops += 1
        isActive = false
        onChange?()
    }

    /// The system starts it by itself when the app leaves the screen.
    func startAutomatically() {
        onStarting?(true)
    }

    func failToStart() {
        onStarting?(false)
        onChange?()
    }
}

@MainActor
private struct Rig {
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
    let player = AVPlayer()
    let pip = FakePictureInPicture()
    let surface: VideoSurface

    init() {
        let pictureInPicture = pip
        surface = VideoSurface(player: player, pictureInPicture: { _ in pictureInPicture })
        UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first }
            .first?
            .addSubview(webView)
        surface.attach(to: webView)
        surface.showsVideo(true)
        surface.place(SurfaceGeometry(left: 0, width: 390, height: 219, anchor: .fixed, top: 0, stick: nil))
    }

    func close() {
        webView.removeFromSuperview()
    }

    func leaveScreen() {
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    func comeBack() {
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    var attached: Bool { surface.view.playerLayer.player != nil }
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct VideoSurfacePictureInPictureTests {
        @Test("picture in picture is offered only for a video, and asked of the system")
        func startsAndStops() {
            let rig = Rig()
            defer { rig.close() }
            #expect(rig.surface.isPictureInPicturePossible)

            rig.surface.setPictureInPicture(true)
            #expect(rig.pip.starts == 1)
            #expect(rig.surface.isPictureInPictureActive)

            rig.surface.setPictureInPicture(false)
            #expect(rig.pip.stops == 1)

            rig.surface.showsVideo(false)
            #expect(!rig.surface.isPictureInPicturePossible, "offered with no video loaded")
        }

        @Test("it ends with the file it was playing")
        func endsWithTheFile() {
            let rig = Rig()
            defer { rig.close() }
            rig.surface.setPictureInPicture(true)

            rig.surface.showsVideo(false)

            #expect(rig.pip.stops == 1)
            #expect(!rig.surface.isPictureInPictureActive)
        }

        @Test("the layer stays while it starts, and is let go if the start fails off screen")
        func failedStartLetsGo() {
            let rig = Rig()
            defer { rig.close() }

            rig.pip.startAutomatically()
            rig.leaveScreen()
            #expect(rig.attached, "let go while picture in picture was starting")

            rig.pip.failToStart()

            #expect(!rig.attached, "the player kept its layer off screen, so the sound would stop")
        }

        @Test("a picture in picture that stops while the app is away lets the layer go too")
        func stoppedOffScreenLetsGo() {
            let rig = Rig()
            defer { rig.close() }
            rig.surface.setPictureInPicture(true)
            rig.leaveScreen()
            #expect(rig.attached, "picture in picture needs the layer")

            rig.pip.stop()

            #expect(!rig.attached)
        }

        @Test("coming back from the background closes it, and takes the layer again")
        func comingBackCloses() {
            let rig = Rig()
            defer { rig.close() }
            rig.pip.startAutomatically()
            rig.leaveScreen()
            rig.pip.isActive = true

            rig.comeBack()

            #expect(rig.pip.stops == 1)
            #expect(rig.attached)
        }

        /// Control Center and the notification shade make the app inactive
        /// without taking it off screen.
        @Test("a moment of inactivity does not close it")
        func inactivityKeepsIt() {
            let rig = Rig()
            defer { rig.close() }
            rig.surface.setPictureInPicture(true)

            rig.comeBack()

            #expect(rig.pip.stops == 0)
            #expect(rig.surface.isPictureInPictureActive)
        }
    }
}
