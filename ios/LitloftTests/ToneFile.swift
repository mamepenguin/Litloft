import Foundation

/// A real file AVPlayer can open, so a test can watch the position move and a
/// file run out instead of asserting on a player that never had anything in it.
enum ToneFile {
    static func make(seconds: Double, name: String = UUID().uuidString) throws -> URL {
        let sampleRate = 8_000
        let frames = Int(Double(sampleRate) * seconds)
        var samples = Data(capacity: frames * 2)
        for index in 0..<frames {
            let value = Int16(sin(Double(index) * 2 * .pi * 440 / Double(sampleRate)) * 8_000)
            withUnsafeBytes(of: value.littleEndian) { samples.append(contentsOf: $0) }
        }

        var file = Data()
        func append<T: FixedWidthInteger>(_ value: T) {
            withUnsafeBytes(of: value.littleEndian) { file.append(contentsOf: $0) }
        }
        file.append(contentsOf: Array("RIFF".utf8))
        append(UInt32(36 + samples.count))
        file.append(contentsOf: Array("WAVEfmt ".utf8))
        append(UInt32(16))
        append(UInt16(1))
        append(UInt16(1))
        append(UInt32(sampleRate))
        append(UInt32(sampleRate * 2))
        append(UInt16(2))
        append(UInt16(16))
        file.append(contentsOf: Array("data".utf8))
        append(UInt32(samples.count))
        file.append(samples)

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).wav")
        try file.write(to: url)
        return url
    }
}
