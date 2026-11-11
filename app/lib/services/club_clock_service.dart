import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:curling_scoreboard/services/rock_colors_service.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether the club this scoreboard is paired with shows times on a 24 hour
/// clock, as its admins set it beside the club's time zone.
///
/// The same setting is read by the admin portal (`admin/src/lib/clock.ts`),
/// the display pages (`functions/src/display/assets/clock.js`) and webhook
/// posts and stream titles (`functions/src/clock.ts`); they change together.
///
/// The scoreboard is on the 12 hour clock by default and never needs this to
/// work. A paired scoreboard picks up its club's clock, and keeps the last
/// one it saw so it is still right when it starts up offline.
class ClubClockService {
  ClubClockService(this._prefs, this._registration, {ClubConfigWatcher? watch})
    : _watch = watch ?? _watchFirestore {
    if (_registration.isRegistered) {
      use24HourClock.value = _prefs.getBool(_cacheKey) ?? false;
    }
  }

  final SharedPreferences _prefs;
  final RegistrationService _registration;
  final ClubConfigWatcher _watch;

  static const _cacheKey = 'clubClock24h';

  /// True when the club chose the 24 hour clock; false for the 12 hour one,
  /// which is also what an unpaired scoreboard uses.
  final ValueNotifier<bool> use24HourClock = ValueNotifier(false);

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
          .doc('club')
          .snapshots()
          .map((snapshot) => snapshot.data());

  /// Starts following the paired club's clock. Call again after pairing or
  /// disconnecting, which changes the club to follow.
  void start() {
    unawaited(_subscription?.cancel());
    _subscription = null;
    _retry?.cancel();
    _retry = null;

    final clubId = _registration.clubId;
    if (clubId == null) {
      // Back to the default; another club's clock must not linger.
      use24HourClock.value = false;
      unawaited(_prefs.remove(_cacheKey));
      return;
    }

    _subscription = _watch(clubId).listen(
      (config) {
        final use24Hour = config?['clock'] == '24h';
        use24HourClock.value = use24Hour;
        unawaited(_prefs.setBool(_cacheKey, use24Hour));
      },
      // The rules turned the read away, most likely because this scoreboard
      // has not been given its claims yet. The clock last seen is the best
      // there is; a failed watch is finished, so try again later.
      onError: (Object e) {
        debugPrint('ClubClockService watch error: $e');
        _retry = Timer(retryDelay, start);
      },
    );
  }

  void dispose() {
    _retry?.cancel();
    unawaited(_subscription?.cancel());
    use24HourClock.dispose();
  }
}
