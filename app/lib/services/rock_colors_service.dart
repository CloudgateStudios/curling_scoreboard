import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Watches a club's `config/scoreboard` document, emitting its data, or null
/// while it does not exist.
typedef ClubConfigWatcher =
    Stream<Map<String, dynamic>?> Function(String clubId);

/// The rock colors of the club this scoreboard is paired with.
///
/// The scoreboard is red and yellow by default and never needs this to work.
/// A paired scoreboard picks up the colors its club has chosen, and keeps
/// the last ones it saw so they are still right when it starts up offline.
class RockColorsService {
  RockColorsService(this._prefs, this._registration, {ClubConfigWatcher? watch})
    : _watch = watch ?? _watchFirestore {
    if (_registration.isRegistered) clubColors.value = _readCache();
  }

  final SharedPreferences _prefs;
  final RegistrationService _registration;
  final ClubConfigWatcher _watch;

  static const _cacheKey = 'rockColors';

  /// The club's colors, or null to use the defaults: the scoreboard is not
  /// paired, or its club has not chosen any.
  final ValueNotifier<RockColors?> clubColors = ValueNotifier(null);

  /// How long to wait before watching again after the watch fails.
  @visibleForTesting
  static const retryDelay = Duration(minutes: 15);

  StreamSubscription<Map<String, dynamic>?>? _subscription;
  Timer? _retry;

  static Stream<Map<String, dynamic>?> _watchFirestore(String clubId) =>
      FirebaseFirestore.instance
          .collection('clubs')
          .doc(clubId)
          .collection('config')
          .doc('scoreboard')
          .snapshots()
          .map((snapshot) => snapshot.data());

  /// Starts following the paired club's colors. Call again after pairing or
  /// disconnecting, which changes the club to follow.
  void start() {
    unawaited(_subscription?.cancel());
    _subscription = null;
    _retry?.cancel();
    _retry = null;

    final clubId = _registration.clubId;
    if (clubId == null) {
      // Back to the defaults; another club's colors must not linger.
      clubColors.value = null;
      unawaited(_prefs.remove(_cacheKey));
      return;
    }

    _subscription = _watch(clubId).listen(
      (config) {
        final colors = RockColors.tryParse(config?['rockColors']);
        clubColors.value = colors;
        if (colors == null) {
          unawaited(_prefs.remove(_cacheKey));
        } else {
          unawaited(_prefs.setString(_cacheKey, jsonEncode(colors.toJson())));
        }
      },
      // The rules turned the read away, most likely because this scoreboard
      // has not been given its claims yet. The colors last seen are the best
      // there is; a failed watch is finished, so try again later.
      onError: (Object e) {
        debugPrint('RockColorsService watch error: $e');
        _retry = Timer(retryDelay, start);
      },
    );
  }

  RockColors? _readCache() {
    final cached = _prefs.getString(_cacheKey);
    if (cached == null) return null;
    try {
      return RockColors.tryParse(jsonDecode(cached));
    } on FormatException {
      return null;
    }
  }

  void dispose() {
    _retry?.cancel();
    unawaited(_subscription?.cancel());
    clubColors.dispose();
  }
}
