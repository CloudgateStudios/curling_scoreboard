import 'dart:convert';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

/// Reads the build ID from `build.json`, which the deploy workflow writes
/// alongside the app. Returns null if the file is missing.
Future<String?> fetchDeployedBuildId() async {
  // The query string and no-store both keep any cache from answering.
  final url = 'build.json?t=${DateTime.now().millisecondsSinceEpoch}';
  final response = await web.window
      .fetch(url.toJS, web.RequestInit(cache: 'no-store'))
      .toDart;
  if (!response.ok) return null;

  final body = (await response.text().toDart).toDart;
  final json = jsonDecode(body) as Map<String, dynamic>;
  return json['buildId'] as String?;
}

void reloadPage() => web.window.location.reload();
