import SwiftUI

struct ConnectionErrorView: View {
    let message: String
    let onRetry: () -> Void
    let onChangeServer: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)

            Text("Cannot reach Litloft")
                .font(.title2.weight(.semibold))

            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 10) {
                Button(action: onRetry) {
                    Text("Try again")
                        .frame(maxWidth: 220)
                }
                .buttonStyle(.borderedProminent)

                Button(action: onChangeServer) {
                    Text("Change server")
                        .frame(maxWidth: 220)
                }
                .buttonStyle(.bordered)
            }
            .controlSize(.large)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
