import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Watches a club's active leagues, emitting each one's data by document ID.
typedef ClubLeaguesWatcher =
    Stream<Map<String, Map<String, dynamic>>> Function(String clubId);

/// The active leagues of the club this scoreboard is paired with, which is
/// what lets a game be started as a league game.
///
/// An unpaired scoreboard has none, and league games are simply not offered.
/// A paired one keeps the last leagues it saw, so they are still there when
/// it starts up offline.
class LeagueService {
  LeagueService(this._prefs, this._registration, {ClubLeaguesWatcher? watch})
    : _watch = watch ?? _watchFirestore {
    if (_registration.isRegistered) leagues.value = _readCache();
  }

  final SharedPreferences _prefs;
  final RegistrationService _registration;
  final ClubLeaguesWatcher _watch;

  static const _cacheKey = 'leagues';

  /// How long to wait before watching again after the watch fails.
  @visibleForTesting
  static const retryDelay = Duration(minutes: 15);

  /// The club's active leagues, sorted by name. Empty when there are none or
  /// the scoreboard is not paired.
  final ValueNotifier<List<League>> leagues = ValueNotifier(const []);

  StreamSubscription<Map<String, Map<String, dynamic>>>? _subscription;
  Timer? _retry;

  static Stream<Map<String, Map<String, dynamic>>> _watchFirestore(
    String clubId,
  ) => FirebaseFirestore.instance
      .collection('clubs')
      .doc(clubId)
      .collection('leagues')
      .where('active', isEqualTo: true)
      .snapshots()
      .map((snapshot) => {for (final doc in snapshot.docs) doc.id: doc.data()});

  /// Starts following the paired club's leagues. Call again after pairing or
  /// disconnecting, which changes the club to follow.
  void start() {
    unawaited(_subscription?.cancel());
    _subscription = null;
    _retry?.cancel();
    _retry = null;

    final clubId = _registration.clubId;
    if (clubId == null) {
      // Another club's teams must not linger.
      leagues.value = const [];
      unawaited(_prefs.remove(_cacheKey));
      return;
    }

    _subscription = _watch(clubId).listen(
      (documents) {
        leagues.value = _parse(documents);
        unawaited(
          _prefs.setString(
            _cacheKey,
            jsonEncode({
              for (final league in leagues.value) league.id: league.toJson(),
            }),
          ),
        );
      },
      // The rules turned the read away, most likely because this scoreboard
      // has not been given its claims yet. The leagues last seen are the
      // best there is; a failed watch is finished, so try again later.
      onError: (Object e) {
        debugPrint('LeagueService watch error: $e');
        _retry = Timer(retryDelay, start);
      },
    );
  }

  static List<League> _parse(Map<String, dynamic> documents) => [
    for (final MapEntry(:key, :value) in documents.entries)
      ?League.tryParse(key, value),
  ]..sort((a, b) => League.compareNames(a.name, b.name));

  List<League> _readCache() {
    final cached = _prefs.getString(_cacheKey);
    if (cached == null) return const [];
    try {
      final decoded = jsonDecode(cached);
      return decoded is Map<String, dynamic> ? _parse(decoded) : const [];
    } on FormatException {
      return const [];
    }
  }

  void dispose() {
    _retry?.cancel();
    unawaited(_subscription?.cancel());
    leagues.dispose();
  }
}
