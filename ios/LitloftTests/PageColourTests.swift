import Foundation
import Testing
import UIKit
import WebKit

@testable import Litloft

@MainActor
@Suite
struct PageColourTests {
    private let server = URL(string: "http://litloft.local:3000/")!

    @Test("the shell has no page colour until the page sends one")
    func noColourAtFirst() {
        #expect(WebViewModel(serverURL: server).pageColor == nil)
    }

    @Test("the colour the page sends is the one the shell keeps, the latest winning")
    func pageColourReachesTheModel() async throws {
        let model = WebViewModel(serverURL: server)
        let coordinator = WebView.Coordinator(model: model)
        let configuration = WKWebViewConfiguration()
        coordinator.bridge.install(in: configuration)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), configuration: configuration)
        coordinator.attachBridge(to: webView)
        webView.loadHTMLString("<!doctype html><body></body>", baseURL: server)
        #expect(await waitUntil { (try? await webView.evaluateJavaScript("location.host")) as? String == "litloft.local:3000" })

        _ = try await webView.evaluateJavaScript(
            "webkit.messageHandlers.litloft.postMessage({type: 'page.background', color: '#1a0e10'}); 0"
        )
        #expect(await waitUntil { model.pageColor == PageColor(red: 0x1A / 255, green: 0x0E / 255, blue: 0x10 / 255) })

        _ = try await webView.evaluateJavaScript(
            "webkit.messageHandlers.litloft.postMessage({type: 'page.background', color: '#ffffff'}); 0"
        )
        #expect(await waitUntil { model.pageColor == PageColor(red: 1, green: 1, blue: 1) })
        withExtendedLifetime(coordinator) {}
    }

    private func waitUntil(timeout: Duration = .seconds(10), _ condition: () async -> Bool) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while !(await condition()) {
            if ContinuousClock.now > deadline { return false }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return true
    }
}
