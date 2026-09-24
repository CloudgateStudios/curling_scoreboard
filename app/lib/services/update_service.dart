import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/services/web_platform.dart' as platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The build identifier baked in at compile time. The deploy workflows pass
/// the commit SHA; local and test builds leave it empty, which turns update
/// checks off entirely.
const _buildId = String.fromEnvironment('BUILD_ID');

/// Watches for a newer deployment of the web app and reloads the page to pick
/// it up, but only when the caller says it is safe to do so.
///
/// Two signals are used. The deploy workflow writes the new build ID to
/// `appConfig/scoreboard` in Firestore, which reaches every open scoreboard
/// within seconds. As a fallback, `build.json` is fetched from the hosting
/// site at startup, once a day at [dailyCheckHour] local time, and whenever
/// the app returns to the foreground.
class UpdateService {
  UpdateService({
    required this.currentBuildId,
    required SharedPreferences prefs,
    required Stream<String?> Function() remoteBuildIds,
    required Future<String?> Function() fetchDeployedBuildId,
    required VoidCallback reloadPage,
    DateTime Function() clock = DateTime.now,
  }) : _prefs = prefs,
       _remoteBuildIds = remoteBuildIds,
       _fetchDeployedBuildId = fetchDeployedBuildId,
       _reloadPage = reloadPage,
       _clock = clock;

  /// Creates the service for the running app. Returns null when update checks
  /// do not apply: native builds, or builds without a build ID.
  static UpdateService? forCurrentPlatform(SharedPreferences prefs) {
    if (!kIsWeb || _buildId.isEmpty) return null;
    return UpdateService(
      currentBuildId: _buildId,
      prefs: prefs,
      remoteBuildIds: () => FirebaseFirestore.instance
          .doc('appConfig/scoreboard')
          .snapshots()
          .map((snapshot) => snapshot.data()?['buildId'] as String?),
      fetchDeployedBuildId: platform.fetchDeployedBuildId,
      reloadPage: platform.reloadPage,
    );
  }

  /// If a reload for a given build did not actually load it (for example a
  /// stale cache), wait this long before trying that build again rather than
  /// reloading in a loop.
  static const retryReloadAfter = Duration(minutes: 10);

  /// The local hour of the daily fallback check. Clubs are closed at 1 AM,
  /// so there is no game to interrupt.
  static const dailyCheckHour = 1;

  /// Time from [now] until the next daily check.
  @visibleForTesting
  static Duration timeUntilNextDailyCheck(DateTime now) {
    // Building the target from calendar fields keeps it at 1 AM wall clock
    // time across daylight saving changes.
    var next = DateTime(now.year, now.month, now.day, dailyCheckHour);
    if (!next.isAfter(now)) {
      next = DateTime(now.year, now.month, now.day + 1, dailyCheckHour);
    }
    return next.difference(now);
  }

  static const _lastReloadTargetKey = 'updateLastReloadTarget';
  static const _lastReloadAtKey = 'updateLastReloadAt';

  final String currentBuildId;
  final SharedPreferences _prefs;
  final Stream<String?> Function() _remoteBuildIds;
  final Future<String?> Function() _fetchDeployedBuildId;
  final VoidCallback _reloadPage;
  final DateTime Function() _clock;

  /// True once a build other than the running one has been deployed.
  final ValueNotifier<bool> updateAvailable = ValueNotifier(false);

  String? _targetBuildId;
  StreamSubscription<String?>? _remoteSubscription;
  Timer? _dailyCheckTimer;
  AppLifecycleListener? _lifecycleListener;

  void start() {
    _remoteSubscription = _remoteBuildIds().listen(
      _onDeployedBuildId,
      onError: (Object e) => debugPrint('UpdateService listener error: $e'),
    );
    _scheduleDailyCheck();
    _lifecycleListener = AppLifecycleListener(
      onResume: () => unawaited(checkNow()),
    );
    unawaited(checkNow());
  }

  void _scheduleDailyCheck() {
    _dailyCheckTimer = Timer(timeUntilNextDailyCheck(_clock()), () {
      unawaited(checkNow());
      _scheduleDailyCheck();
    });
  }

  /// Fetches the deployed build ID from the hosting site.
  Future<void> checkNow() async {
    try {
      _onDeployedBuildId(await _fetchDeployedBuildId());
    } on Object catch (e) {
      debugPrint('UpdateService.checkNow error: $e');
    }
  }

  void _onDeployedBuildId(String? buildId) {
    if (buildId == null || buildId.isEmpty) return;
    _targetBuildId = buildId == currentBuildId ? null : buildId;
    updateAvailable.value = _targetBuildId != null;
  }

  /// Reloads the page if a newer build is available. Call this only when
  /// nothing would be lost, such as when no game is in progress.
  ///
  /// Returns true if a reload was started.
  bool reloadIfUpdateAvailable() {
    final target = _targetBuildId;
    if (target == null) return false;

    final lastTarget = _prefs.getString(_lastReloadTargetKey);
    final lastAtMillis = _prefs.getInt(_lastReloadAtKey);
    final now = _clock();
    if (lastTarget == target && lastAtMillis != null) {
      final lastAt = DateTime.fromMillisecondsSinceEpoch(lastAtMillis);
      if (now.difference(lastAt) < retryReloadAfter) return false;
    }

    // Record the attempt before reloading. The writes land in local storage
    // synchronously on web, so they survive the reload.
    unawaited(_prefs.setString(_lastReloadTargetKey, target));
    unawaited(_prefs.setInt(_lastReloadAtKey, now.millisecondsSinceEpoch));
    _reloadPage();
    return true;
  }

  void dispose() {
    unawaited(_remoteSubscription?.cancel());
    _dailyCheckTimer?.cancel();
    _lifecycleListener?.dispose();
    updateAvailable.dispose();
  }
}
