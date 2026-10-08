/// Native builds have no hosted deployment to check against.
Future<String?> fetchDeployedBuildId() async => null;

/// Native builds cannot reload themselves.
void reloadPage() {}

/// Native builds have no browser to describe.
String? userAgent() => null;
