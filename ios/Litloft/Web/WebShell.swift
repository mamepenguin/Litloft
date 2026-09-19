import SwiftUI

struct WebShell: View {
    let onChangeServer: () -> Void

    @State private var model: WebViewModel

    init(serverURL: URL, onChangeServer: @escaping () -> Void) {
        self.onChangeServer = onChangeServer
        _model = State(initialValue: WebViewModel(serverURL: serverURL))
    }

    var body: some View {
        ZStack {
            // Fills where the web view does not reach. The web view stays out
            // of the top safe area as the PWA's page does: the page's overlays
            // do not avoid it.
            band.ignoresSafeArea()

            WebView(model: model)
                .ignoresSafeArea(edges: .bottom)

            if case .failed(let message) = model.state {
                ConnectionErrorView(
                    message: message,
                    onRetry: { model.retry() },
                    onChangeServer: onChangeServer
                )
            }
        }
    }

    private var band: Color {
        guard let color = model.pageColor else { return Color(.systemBackground) }
        return Color(red: color.red, green: color.green, blue: color.blue)
    }
}
