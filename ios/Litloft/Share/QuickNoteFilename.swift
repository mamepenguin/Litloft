import Foundation

/// Web Quick Note's `deriveQuickNoteStem`, for the same input and local time.
enum QuickNoteFilename {
    private static let maxStemCodePoints = 80
    private static let maxStemBytes = 240

    static func stem(for body: String, at date: Date) -> String {
        var stem = stripLeadingMarker(firstNonEmptyLine(of: body))
        if stem.lowercased().hasSuffix(".md") {
            stem.removeLast(3)
        }
        stem = replaceUnsafeCharacters(in: stem)
        stem = collapseWhitespace(in: stem)
        stem = stem.replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
        stem = trimUnsafeEdges(stem)
        stem = trimUnsafeEdges(truncate(stem))
        if stem.isEmpty {
            return "note-\(timestamp(date))"
        }
        return stem
    }

    static func timestamp(_ date: Date) -> String {
        let parts = Calendar(identifier: .gregorian).dateComponents(
            [.year, .month, .day, .hour, .minute, .second], from: date
        )
        func pad(_ value: Int?) -> String {
            String(format: "%02d", value ?? 0)
        }
        return "\(parts.year ?? 0)\(pad(parts.month))\(pad(parts.day))-"
            + "\(pad(parts.hour))\(pad(parts.minute))\(pad(parts.second))"
    }

    private static func firstNonEmptyLine(of body: String) -> String {
        // Swift treats CRLF as one Character, so splitting on "\n" would not
        // split a Windows line ending.
        let normalized = body.replacingOccurrences(of: "\r\n", with: "\n")
        for line in normalized.split(separator: "\n", omittingEmptySubsequences: false) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return ""
    }

    private static func stripLeadingMarker(_ line: String) -> String {
        if matches(line, "^#{1,6}[ \t]+") {
            return replacing(line, "^#{1,6}[ \t]+").trimmingCharacters(in: .whitespaces)
        }
        if matches(line, "^>[ \t]*") {
            return replacing(line, "^>[ \t]*").trimmingCharacters(in: .whitespaces)
        }
        if matches(line, "^(?:[-*+]|[0-9]{1,9}[.)])[ \t]+") {
            let rest = replacing(line, "^(?:[-*+]|[0-9]{1,9}[.)])[ \t]+")
            return replacing(rest, "^\\[[ xX]\\][ \t]*").trimmingCharacters(in: .whitespaces)
        }
        return line
    }

    private static func replaceUnsafeCharacters(in stem: String) -> String {
        var unsafe = CharacterSet(charactersIn: "/\\")
        unsafe.formUnion(.controlCharacters)
        return String(String.UnicodeScalarView(stem.unicodeScalars.map { scalar in
            unsafe.contains(scalar) ? Unicode.Scalar("-") : scalar
        }))
    }

    private static func collapseWhitespace(in stem: String) -> String {
        stem.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    }

    private static func trimUnsafeEdges(_ stem: String) -> String {
        var value = stem
        while value.hasPrefix(".") { value.removeFirst() }
        while let last = value.last, last == "." || last == " " { value.removeLast() }
        return value.trimmingCharacters(in: .whitespaces)
    }

    private static func truncate(_ stem: String) -> String {
        var result = ""
        var codePoints = 0
        var bytes = 0
        for character in stem {
            let size = character.utf8.count
            if codePoints + 1 > maxStemCodePoints || bytes + size > maxStemBytes { break }
            result.append(character)
            codePoints += 1
            bytes += size
        }
        return result
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func replacing(_ text: String, _ pattern: String) -> String {
        text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
    }
}
