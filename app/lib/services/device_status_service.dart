import 'dart:async';

import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:curling_scoreboard/services/update_service.dart';
import 'package:curling_scoreboard/services/web_platform.dart' as platform;
import 'package:curling_scoreboard/src/version.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Tells the backend what is running on this scoreboard, so the admin portal
/// can show each sheet's app version and whether it is still checking in.
///
/// The status is sent when the app starts, right after pairing, whenever the
/// app returns to the foreground, when a new build is deployed, and every
/// [Constants.deviceStatusHeartbeat] in between. Everything in it is
/// self-reported, so it is for display only.
class DeviceStatusService {
  DeviceStatusService({
    required Future<void> Function(Map<String, dynamic> status) write,
    UpdateService? updateService,
    SyncError? Function()? lastSyncError,
    this.buildId = Constants.buildId,
    String? Function() userAgent = platform.userAgent,
    DateTime Function() clock = DateTime.now,
  }) : _write = write,
       _updateService = updateService,
       _lastSyncError = lastSyncError,
       _userAgent = userAgent,
       _clock = clock;

  /// The build this app was compiled from. Empty for local and test builds.
  final String buildId;

  final Future<void> Function(Map<String, dynamic> status) _write;
  final UpdateService? _updateService;
  final SyncError? Function()? _lastSyncError;
  final String? Function() _userAgent;
  final DateTime Function() _clock;

  DateTime? _sessionStartedAt;
  Timer? _heartbeatTimer;
  AppLifecycleListener? _lifecycleListener;

  void start() {
    _sessionStartedAt = _clock();
    _heartbeatTimer = Timer.periodic(
      Constants.deviceStatusHeartbeat,
      (_) => reportNow(),
    );
    _lifecycleListener = AppLifecycleListener(onResume: reportNow);
    _updateService?.updateAvailable.addListener(reportNow);
    reportNow();
  }

  /// Sends the current status. Does nothing while the scoreboard is unpaired.
  void reportNow() => unawaited(_write(buildStatus()));

  /// What gets stored in the sheet's `device` field. Values that do not apply
  /// to this device are left out rather than sent as null.
  @visibleForTesting
  Map<String, dynamic> buildStatus() {
    final now = _clock();
    final view = WidgetsBinding.instance.platformDispatcher.views.firstOrNull;
    final syncError = _lastSyncError?.call();

    return {
      'appVersion': packageVersion,
      if (buildId.isNotEmpty) 'buildId': buildId,
      'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
      // The web build is compiled to WebAssembly, and browsers that cannot
      // run it silently fall back to JavaScript.
      if (kIsWeb) 'renderer': kIsWasm ? 'wasm' : 'js',
      'userAgent': ?_userAgent(),
      if (view != null)
        'screen': {
          'width': (view.physicalSize.width / view.devicePixelRatio).round(),
          'height': (view.physicalSize.height / view.devicePixelRatio).round(),
          'pixelRatio': view.devicePixelRatio,
        },
      'timezone': now.timeZoneName,
      'utcOffsetMinutes': now.timeZoneOffset.inMinutes,
      // Compared with the server's lastSeenAt, this shows a wrong clock.
      'clientTime': now,
      // Start of this run of the app. If it keeps moving, the scoreboard is
      // reloading or crashing.
      'sessionStartedAt': _sessionStartedAt ?? now,
      'updateTargetBuildId': ?_updateService?.targetBuildId,
      'lastReloadAttemptAt': ?_updateService?.lastReloadAttemptAt,
      if (syncError != null)
        'lastSyncError': {
          'operation': syncError.operation,
          'message': syncError.message,
          'at': syncError.at,
        },
    };
  }

  void dispose() {
    _heartbeatTimer?.cancel();
    _lifecycleListener?.dispose();
    _updateService?.updateAvailable.removeListener(reportNow);
  }
}
