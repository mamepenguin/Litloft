import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

private let frame = SurfaceGeometry(left: 0, width: 390, height: 219, anchor: .fixed, top: 50, stick: nil)

@MainActor
private func onScreen(_ rig: PlayerRig) -> WKWebView {
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 600))
    UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.windows.first }
        .first?
        .addSubview(webView)
    rig.player.surface.attach(to: webView)
    return webView
}

private func video(_ source: MediaSource) -> MediaSource {
    MediaSource(url: source.url, title: source.title, artist: nil, artworkURL: nil, kind: .video)
}

extension SharedMediaState {
    @MainActor
    @Suite
    struct MediaPlayerVideoTests {
        @Test("a loaded video is shown where the page puts it")
        func videoIsShown() async throws {
            let rig = PlayerRig()
            let webView = onScreen(rig)
            defer { webView.removeFromSuperview() }
            await rig.load(video(try tone(seconds: 3)), as: "a")

            await rig.player.apply(.surface(frame), loadId: "a").value

            #expect(!rig.player.surface.view.isHidden)
            #expect(rig.player.surface.view.frame.minY == 50)
            await rig.player.apply(.unload, loadId: "a").value
            #expect(rig.player.surface.view.isHidden, "still shown after the file went")
        }

        @Test("audio has nothing to show, whatever the page says")
        func audioIsNotShown() async throws {
            let rig = PlayerRig()
            let webView = onScreen(rig)
            defer { webView.removeFromSuperview() }
            await rig.load(try tone(seconds: 3), as: "a")

            await rig.player.apply(.surface(frame), loadId: "a").value

            #expect(rig.player.surface.view.isHidden)
            await rig.player.apply(.unload, loadId: "a").value
        }

        @Test("the next file hides the previous video until the page places it")
        func nextFileStartsHidden() async throws {
            let rig = PlayerRig()
            let webView = onScreen(rig)
            defer { webView.removeFromSuperview() }
            await rig.load(video(try tone(seconds: 3)), as: "a")
            await rig.player.apply(.surface(frame), loadId: "a").value

            await rig.load(video(try tone(seconds: 3)), as: "b")
            #expect(rig.player.surface.view.isHidden)

            await rig.player.apply(.surface(frame), loadId: "a").value
            #expect(rig.player.surface.view.isHidden, "placed by the previous file's page")
            await rig.player.apply(.unload, loadId: "b").value
        }

        @Test("a surface or picture-in-picture change reports nothing it did not change")
        func surfaceDoesNotReport() async throws {
            let rig = PlayerRig()
            await rig.load(video(try tone(seconds: 3)), as: "a")
            #expect(await rig.waitFor { rig.last?.status == .ready })
            try await Task.sleep(for: .milliseconds(200))
            let before = rig.states.count

            await rig.player.apply(.surface(frame), loadId: "a").value

            #expect(rig.states.count == before)
            #expect(rig.last?.pip == false)
            await rig.player.apply(.unload, loadId: "a").value
        }
    }
}
