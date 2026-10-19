import Testing

/// Everything that touches process-wide media state — the now-playing centre,
/// the remote command centre, the audio session — sits under this one parent.
/// `.serialized` only orders a suite against its own members and those nested
/// in it, so two suites each marked serialized still run against each other.
@Suite(.serialized)
enum SharedMediaState {}
