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
            WebView(model: model)

            if case .failed(let message) = model.state {
                ConnectionErrorView(
                    message: message,
                    onRetry: { model.retry() },
                    onChangeServer: onChangeServer
                )
            }
        }
    }
}
