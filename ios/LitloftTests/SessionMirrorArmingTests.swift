import Foundation
import Testing
import WebKit

@testable import Litloft

@MainActor
struct SessionMirrorArmingTests {
    @Test("SPEC-IOS-001: the model's mirror is armed by the first main-frame commit on its server")
    func armedAtTheServersCommit() async throws {
        let stub = try StubServer(.page(html: "<html><body>Litloft</body></html>"))
        let url = try await stub.start()
        defer { stub.stop() }
        let model = WebViewModel(serverURL: url)
        let coordinator = WebView.Coordinator(model: model)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        coordinator.attachBridge(to: webView)
        webView.navigationDelegate = coordinator
        #expect(model.sessionMirror.state == .notArmed)

        coordinator.start(webView)

        #expect(await eventually(timeout: .seconds(10)) { model.sessionMirror.state == .armed })
        withExtendedLifetime(coordinator) {}
    }
}
