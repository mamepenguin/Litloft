import Foundation
import MediaPlayer
import Testing
import UIKit
import WebKit

@testable import Litloft

@MainActor
private struct OpenShell {
    let coordinator: WebView.Coordinator
    let webView: WKWebView
    let model: WebViewModel
}

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
            let source = MediaSource(url: tone, title: "Locked", artist: nil, artworkURL: nil)
            await player.apply(.load(source), loadId: "a").value
            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Locked")

            coordinator.webView(webView, didStartProvisionalNavigation: nil)
            // Waits behind whatever the navigation queued, without stopping
            // anything itself.
            await player.apply(.setVolume(1), loadId: nil).value

            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        }

        // MARK: a dead page

        private func openShell(active: Bool) async throws -> OpenShell {
            try await LocalLitloft.require()
            let model = WebViewModel(serverURL: URL(string: "http://localhost:3000/")!)
            let coordinator = WebView.Coordinator(model: model)
            coordinator.isActive = { active }
            let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
            coordinator.attachBridge(to: webView)
            webView.navigationDelegate = coordinator
            coordinator.start(webView)
            #expect(await waitUntil { model.state == .loaded && webView.url != nil })
            return OpenShell(coordinator: coordinator, webView: webView, model: model)
        }

        private func killContent(of webView: WKWebView) throws {
            let pid = try #require((webView.value(forKey: "_webProcessIdentifier") as? NSNumber)?.int32Value)
            try #require(pid > 0)
            try #require(kill(pid, SIGKILL) == 0)
        }

        private func playTone(on coordinator: WebView.Coordinator) async throws {
            let player = try #require(coordinator.player)
            let tone = try ToneFile.make(seconds: 30)
            let source = MediaSource(url: tone, title: "Background", artist: nil, artworkURL: nil)
            await player.apply(.load(source), loadId: "a").value
            await player.apply(.play, loadId: "a").value
        }

        private func playing(_ coordinator: WebView.Coordinator) -> Bool {
            let title = MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String
            return title == "Background" && coordinator.player?.nowPlaying.isPlaying == true
        }

        @Test("a page that dies on screen is put back at once")
        func deadPageOnScreenIsReloaded() async throws {
            let shell = try await openShell(active: true)
            let (coordinator, webView, model) = (shell.coordinator, shell.webView, shell.model)
            try await playTone(on: coordinator)
            try killContent(of: webView)

            #expect(await waitUntil { !playing(coordinator) }, "no navigation started")
            #expect(await waitUntil { model.state == .loaded && webView.url?.host() == "localhost" })
            withExtendedLifetime(coordinator) {}
        }

        @Test("a page that dies off screen waits, and the audio keeps going")
        func deadPageOffScreenWaits() async throws {
            let shell = try await openShell(active: false)
            let (coordinator, webView, model) = (shell.coordinator, shell.webView, shell.model)
            try await playTone(on: coordinator)
            try killContent(of: webView)

            // Long past the moment WebKit would have reloaded it itself.
            try await Task.sleep(for: .seconds(3))
            #expect(webView.url == nil, "the page came back while off screen")
            #expect(playing(coordinator))

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            #expect(await waitUntil { !playing(coordinator) }, "the page was not put back")
            #expect(await waitUntil { model.state == .loaded && webView.url?.host() == "localhost" })

            // Put back once: later returns are ordinary and must not reload.
            try await playTone(on: coordinator)
            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
            try await Task.sleep(for: .seconds(1))
            #expect(playing(coordinator), "a later return reloaded the page")
            withExtendedLifetime(coordinator) {}
        }

        @Test("a page is put back where the viewer was")
        func deadPageKeepsItsAddress() async throws {
            let shell = try await openShell(active: false)
            let (coordinator, webView, model) = (shell.coordinator, shell.webView, shell.model)
            _ = try await webView.evaluateJavaScript("history.pushState(null, '', '/unlock'); 1")
            #expect(await waitUntil { webView.url?.path() == "/unlock" })
            try killContent(of: webView)
            #expect(await waitUntil { webView.url == nil })

            NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)

            #expect(await waitUntil { model.state == .loaded && webView.url?.path() == "/unlock" })
            withExtendedLifetime(coordinator) {}
        }

        private func waitUntil(timeout: Duration = .seconds(10), _ condition: () -> Bool) async -> Bool {
            let deadline = ContinuousClock.now + timeout
            while !condition() {
                if ContinuousClock.now > deadline { return false }
                try? await Task.sleep(for: .milliseconds(50))
            }
            return true
        }
    }
}
