import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Watches a club's active bonspiel plans, emitting each one's data by
/// document ID.
typedef ClubBonspielsWatcher =
    Stream<Map<String, Map<String, dynamic>>> Function(String clubId);

/// Watches the games of a bonspiel's state, as the functions work them out:
/// who is in each game so far. Emits null while there is no state yet.
typedef BonspielStateWatcher =
    Stream<Map<String, dynamic>?> Function(String clubId, String bonspielId);

/// The active bonspiels of the club this scoreboard is paired with, with who
/// is in each game so far, which is what lets the setup screen offer the
/// sheet's next game.
///
/// An unpaired scoreboard has none. A paired one keeps the last bonspiels it
/// saw, so they are still there when it starts up offline, which on a
/// bonspiel weekend at a rink with poor wifi is when it matters.
class BonspielService {
  BonspielService(
    this._prefs,
    this._registration, {
    ClubBonspielsWatcher? watch,
    BonspielStateWatcher? watchState,
  }) : _watch = watch ?? _watchFirestore,
       _watchState = watchState ?? _watchStateFirestore {
    if (_registration.isRegistered) bonspiels.value = _readCache();
  }

  final SharedPreferences _prefs;
  final RegistrationService _registration;
  final ClubBonspielsWatcher _watch;
  final BonspielStateWatcher _watchState;

  static const _cacheKey = 'bonspiels';

  /// How long to wait before watching again after a watch fails.
  @visibleForTesting
  static const retryDelay = Duration(minutes: 15);

  /// The club's active bonspiels, the earliest first. Empty when there are
  /// none or the scoreboard is not paired.
  final ValueNotifier<List<Bonspiel>> bonspiels = ValueNotifier(const []);

  StreamSubscription<Map<String, Map<String, dynamic>>>? _subscription;
  final _stateSubscriptions =
      <String, StreamSubscription<Map<String, dynamic>?>>{};
  Map<String, Map<String, dynamic>> _plans = {};
  final _states = <String, Map<String, dynamic>>{};
  Timer? _retry;

  static CollectionReference<Map<String, dynamic>> _bonspielsOf(
    String clubId,
  ) => FirebaseFirestore.instance
      .collection('clubs')
      .doc(clubId)
      .collection('bonspiels');

  static Stream<Map<String, Map<String, dynamic>>> _watchFirestore(
    String clubId,
  ) => _bonspielsOf(clubId)
      .where('active', isEqualTo: true)
      .snapshots()
      .map((snapshot) => {for (final doc in snapshot.docs) doc.id: doc.data()});

  static Stream<Map<String, dynamic>?> _watchStateFirestore(
    String clubId,
    String bonspielId,
  ) => _bonspielsOf(clubId)
      .doc(bonspielId)
      .collection('state')
      .doc('current')
      .snapshots()
      // Only the games: the rest holds timestamps, and nothing here needs it.
      .map((snapshot) => snapshot.data()?['games'] as Map<String, dynamic>?);

  /// Starts following the paired club's bonspiels. Call again after pairing
  /// or disconnecting, which changes the club to follow.
  void start() {
    _stop();

    final clubId = _registration.clubId;
    if (clubId == null) {
      // Another club's bonspiels must not linger.
      bonspiels.value = const [];
      unawaited(_prefs.remove(_cacheKey));
      return;
    }

    _subscription = _watch(clubId).listen(
      (plans) {
        _plans = plans;
        // A state is followed for as long as its bonspiel is active.
        for (final id in _stateSubscriptions.keys.toList()) {
          if (plans.containsKey(id)) continue;
          unawaited(_stateSubscriptions.remove(id)?.cancel());
          _states.remove(id);
        }
        for (final id in plans.keys) {
          _stateSubscriptions[id] ??= _watchState(clubId, id).listen((games) {
            if (games == null) {
              _states.remove(id);
            } else {
              _states[id] = games;
            }
            _publish();
          }, onError: (Object e) => debugPrint('BonspielService state: $e'));
        }
        _publish();
      },
      // The rules turned the read away, most likely because this scoreboard
      // has not been given its claims yet. The bonspiels last seen are the
      // best there is; a failed watch is finished, so try again later.
      onError: (Object e) {
        debugPrint('BonspielService watch error: $e');
        _retry = Timer(retryDelay, start);
      },
    );
  }

  void _publish() {
    bonspiels.value = _sorted([
      for (final MapEntry(:key, :value) in _plans.entries)
        ?Bonspiel.tryParse(key, value, _states[key]),
    ]);
    unawaited(
      _prefs.setString(
        _cacheKey,
        jsonEncode({for (final b in bonspiels.value) b.id: b.toJson()}),
      ),
    );
  }

  static List<Bonspiel> _sorted(List<Bonspiel> bonspiels) =>
      bonspiels..sort((a, b) => a.startDate.compareTo(b.startDate));

  List<Bonspiel> _readCache() {
    final cached = _prefs.getString(_cacheKey);
    if (cached == null) return const [];
    try {
      final decoded = jsonDecode(cached);
      if (decoded is! Map<String, dynamic>) return const [];
      return _sorted([
        for (final MapEntry(:key, :value) in decoded.entries)
          ?Bonspiel.fromJson(key, value),
      ]);
    } on FormatException {
      return const [];
    }
  }

  void _stop() {
    unawaited(_subscription?.cancel());
    _subscription = null;
    for (final subscription in _stateSubscriptions.values) {
      unawaited(subscription.cancel());
    }
    _stateSubscriptions.clear();
    _states.clear();
    _plans = {};
    _retry?.cancel();
    _retry = null;
  }

  void dispose() {
    _stop();
    bonspiels.dispose();
  }
}
