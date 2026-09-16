import SwiftUI
import WebKit

struct RootView: View {
    @State private var settings = ServerSettings()

    var body: some View {
        if let serverURL = settings.serverURL {
            WebShell(serverURL: serverURL) {
                changeServer(from: serverURL)
            }
            .id(serverURL)
        } else {
            ServerSetupView(initialText: settings.lastAddress) { url in
                settings.use(url)
            }
        }
    }

    /// Leaving a server takes its session with it. The data store is
    /// process-wide, so this reaches the same jar the web view uses.
    private func changeServer(from serverURL: URL) {
        Task {
            await SessionCookies.forget(
                from: WKWebsiteDataStore.default().httpCookieStore,
                host: serverURL.host() ?? ""
            )
            settings.forget()
        }
    }
}
