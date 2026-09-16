import Foundation

/// The wire shape shared with `frontend/src/lib/nativeBridge.ts`. Both sides
/// are hand-written, so a change here is a change there.
struct ShellMessage: Codable, Equatable {
    let type: String
    let seq: Int
}

enum ShellMessageType {
    static let ping = "ping"
    static let pong = "pong"
}
