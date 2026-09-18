import AVFoundation

extension AVPlayerItem {
    /// The end of the last loaded range, not the sum of them: after seeking
    /// back, a leftover range ahead would overstate what is continuously ready.
    var bufferedSeconds: Double {
        guard let last = loadedTimeRanges.last?.timeRangeValue else { return 0 }
        return CMTimeAdd(last.start, last.duration).finiteSeconds
    }
}
