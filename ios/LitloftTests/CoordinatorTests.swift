import Foundation
import MediaPlayer
import Testing
import WebKit

@testable import Litloft

extension SharedMediaState {
    @MainActor
    @Suite
    struct CoordinatorTests {
        /// Lock replaces the page with `window.location`, so the web side's
        /// teardown never runs; this is the only place left to stop it.
        @Test("a full navigation stops what the shell is playing")
        func navigationStopsThePlayer() async throws {
            let model = WebViewModel(serverURL: URL(string: "http://litloft.local:3000")!)
            let coordinator = WebView.Coordinator(model: model)
            let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
            coordinator.attachBridge(to: webView)
            let player = try #require(coordinator.player)

            let tone = try ToneFile.make(seconds: 3)
            await player.apply(.load(MediaSource(url: tone, title: "Locked", artist: nil, artworkURL: nil)), seq: 1)
                .value
            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Locked")

            coordinator.webView(webView, didStartProvisionalNavigation: nil)
            // Waits behind whatever the navigation queued, without stopping
            // anything itself.
            await player.applyFromRemote(.setVolume(1)).value

            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        }
    }
}
