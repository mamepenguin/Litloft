import CoreMedia

extension CMTime {
    /// Zero rather than a guess when the time is unknown.
    var finiteSeconds: Double {
        let value = CMTimeGetSeconds(self)
        return value.isFinite ? value : 0
    }
}
