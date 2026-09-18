import Foundation
import MediaPlayer
import Testing
import UIKit
import WebKit

@testable import Litloft

@MainActor
private final class Offered {
    var files: [URL] = []
}

@MainActor
private final class RecordingOpener: URLOpener {
    nonisolated(unsafe) var opened: [URL] = []

    func open(_ url: URL) {
        opened.append(url)
    }
}

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

            coordinator.webView(webView, didCommit: nil)
            // Waits behind whatever the navigation queued, without stopping
            // anything itself.
            await player.apply(.setVolume(1), loadId: nil).value

            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo == nil)
        }

        /// Asking for a file starts a navigation that turns into a download and
        /// never replaces the page, so what the viewer is listening to stays.
        @Test("a navigation that never arrives leaves the player alone")
        func downloadKeepsThePlayer() async throws {
            let model = WebViewModel(serverURL: URL(string: "http://litloft.local:3000")!)
            let coordinator = WebView.Coordinator(model: model)
            let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
            coordinator.attachBridge(to: webView)
            let player = try #require(coordinator.player)

            let tone = try ToneFile.make(seconds: 3)
            let source = MediaSource(url: tone, title: "Kept", artist: nil, artworkURL: nil)
            await player.apply(.load(source), loadId: "a").value

            coordinator.webView(webView, didStartProvisionalNavigation: nil)
            await player.apply(.setVolume(1), loadId: nil).value

            #expect(MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Kept")
            await player.apply(.unload, loadId: "a").value
        }

        // MARK: a dead page

        private func openShell(active: Bool, opener: URLOpener = SystemURLOpener()) async throws -> OpenShell {
            try await LocalLitloft.require()
            let model = WebViewModel(serverURL: URL(string: "http://localhost:3000/")!)
            let coordinator = WebView.Coordinator(model: model, opener: opener)
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

        /// A file taken as a download stops the load that was fetching it, and
        /// the page the viewer is reading never moved.
        @Test("a download leaves the page it was asked from, and the model says so")
        func downloadLeavesThePageUp() async throws {
            let shell = try await openShell(active: true)
            let (coordinator, webView, model) = (shell.coordinator, shell.webView, shell.model)
            let attachment = HTTPURLResponse(
                url: URL(string: "http://localhost:3000/api/files/abc/download")!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Disposition": "attachment; filename=\"a.mp4\""]
            )!

            model.markLoading()
            #expect(coordinator.policy(for: attachment, isForMainFrame: true, pageOnScreen: true) == .download)
            coordinator.webView(
                webView,
                didFailProvisionalNavigation: nil,
                withError: NSError(domain: "WebKitErrorDomain", code: 102)
            )

            #expect(model.state == .loaded)
            withExtendedLifetime(coordinator) {}
        }

        /// The whole way through WebKit: a real page sends itself somewhere
        /// else, and the shell answers the policy question for it.
        @Test("a page that sends itself off the origin is handed to the system")
        func offOriginNavigationIsHandedOver() async throws {
            let opener = RecordingOpener()
            let shell = try await openShell(active: true, opener: opener)
            let (coordinator, webView, model) = (shell.coordinator, shell.webView, shell.model)
            let wasShowing = try #require(webView.url)

            _ = try? await webView.evaluateJavaScript("location.href = 'https://example.com/article'; 1")

            #expect(await waitUntil { opener.opened == [URL(string: "https://example.com/article")!] })
            #expect(webView.url == wasShowing, "the shell went there itself")
            #expect(model.state == .loaded, "the page the viewer is on was reported as gone")
            withExtendedLifetime(coordinator) {}
        }

        /// The address the viewer typed never puts a page on screen: it sends
        /// them somewhere else, or it answers with a file. The shell says so
        /// itself — or the app sits blank with no way back to the address
        /// picker (R-0 8).
        @Test("a first load that puts no page up leaves a way out", arguments: [
            StubServer.Answer.redirect(destination: "https://example.com/article"),
            StubServer.Answer.attachment(named: "recording.mp4")
        ])
        func firstLoadWithNoPage(answer: StubServer.Answer) async throws {
            let server = try StubServer(answer)
            defer { server.stop() }
            let address = try await server.start()
            let opener = RecordingOpener()
            let model = WebViewModel(serverURL: address)
            let coordinator = WebView.Coordinator(model: model, opener: opener)
            let offered = Offered()
            coordinator.downloads.offer = { offered.files.append($0) }
            let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
            coordinator.attachBridge(to: webView)
            webView.navigationDelegate = coordinator

            coordinator.start(webView)

            #expect(await waitUntil { if case .failed = model.state { return true } else { return false } },
                    "the app was left blank with no way out, state is \(model.state)")
            if case .attachment = answer {
                #expect(await waitUntil { offered.files.count == 1 }, "the file was not handed to the viewer")
            } else {
                #expect(await waitUntil { opener.opened == [URL(string: "https://example.com/article")!] })
            }
            withExtendedLifetime(coordinator) {}
        }

        /// The back-forward list still names the page a dead process took
        /// away, so the shell keeps the fact itself rather than asking.
        @Test("the page a dead process took with it is not still on screen")
        func deadPageIsNotOnScreen() async throws {
            let shell = try await openShell(active: false)
            let (coordinator, webView) = (shell.coordinator, shell.webView)
            #expect(coordinator.hasPageOnScreen, "a page was loaded and committed")

            try killContent(of: webView)

            #expect(await waitUntil { !coordinator.hasPageOnScreen })
            #expect(webView.backForwardList.currentItem != nil, "the list forgot it, so nothing was proved")
            withExtendedLifetime(coordinator) {}
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
