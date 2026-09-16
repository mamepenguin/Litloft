import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let model: WebViewModel

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true

        // Overscroll reveals this rather than a band in the wrong theme.
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.scrollView.alwaysBounceHorizontal = false

        context.coordinator.lastReloadToken = model.reloadToken
        context.coordinator.start(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastReloadToken != model.reloadToken else { return }
        context.coordinator.lastReloadToken = model.reloadToken
        webView.load(URLRequest(url: model.serverURL))
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: WebViewModel
        let cookies = CookieBridge()
        var lastReloadToken = 0

        init(model: WebViewModel) {
            self.model = model
        }

        /// The stored session has to be in the jar before the first request,
        /// or the load lands on the unlock screen.
        func start(_ webView: WKWebView) {
            Task {
                await cookies.attach(to: webView.configuration.websiteDataStore.httpCookieStore)
                webView.load(URLRequest(url: model.serverURL))
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            model.markLoading()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            model.markLoaded()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            model.markFailed(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            model.markFailed(error)
        }

        // Litloft draws its own context menus; the system callout would fight them.
        func webView(
            _ webView: WKWebView,
            contextMenuConfigurationFor elementInfo: WKContextMenuElementInfo
        ) async -> UIContextMenuConfiguration? {
            nil
        }
    }
}
