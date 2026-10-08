import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';

/// A sync write that failed, kept so it can be reported with the device
/// status. Nothing else surfaces these: writes are fire and forget.
typedef SyncError = ({String operation, String message, DateTime at});

class SyncService {
  SyncService(this._registration);

  final RegistrationService _registration;

  /// The most recent failed write since the app started, if any.
  SyncError? get lastError => _lastError;
  SyncError? _lastError;

  /// Whether [error] means the sheet no longer accepts this scoreboard. The
  /// rules only let the paired scoreboard write to a sheet, so a refused
  /// write means another device has been paired with it or it has gone.
  @visibleForTesting
  static bool isPairingLostError(Object error) =>
      error is FirebaseException &&
      (error.code == 'permission-denied' || error.code == 'not-found');

  // A write that goes through proves the pairing is intact, which also
  // recovers from a refusal that turned out to be temporary.
  void _recordSuccess() => _registration.pairingLost.value = false;

  void _recordError(String operation, Exception e) {
    debugPrint('SyncService.$operation error: $e');
    if (isPairingLostError(e)) _registration.pairingLost.value = true;
    _lastError = (
      operation: operation,
      message: e is FirebaseException ? e.code : e.runtimeType.toString(),
      at: DateTime.now(),
    );
  }

  DocumentReference<Map<String, dynamic>> get _sheetRef => FirebaseFirestore
      .instance
      .collection('clubs')
      .doc(_registration.clubId)
      .collection('sheets')
      .doc(_registration.sheetId);

  Future<void> pushLiveGame(CurlingGame game) async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.update({
        'liveGame': {
          'currentEnd': game.currentPlayingEnd,
          'team1': {
            'name': game.team1.name,
            'score': game.team1TotalScore,
            'hasHammer': game.team1.hasHammer,
          },
          'team2': {
            'name': game.team2.name,
            'score': game.team2TotalScore,
            'hasHammer': game.team2.hasHammer,
          },
        },
      });
      _recordSuccess();
    } on Exception catch (e) {
      _recordError('pushLiveGame', e);
    }
  }

  /// Overwrites the sheet's `device` field with [status], stamped with the
  /// server's time so the admin portal can tell when it last heard from this
  /// scoreboard.
  Future<void> pushDeviceStatus(Map<String, dynamic> status) async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.update({
        'device': {...status, 'lastSeenAt': FieldValue.serverTimestamp()},
      });
      _recordSuccess();
    } on Exception catch (e) {
      _recordError('pushDeviceStatus', e);
    }
  }

  Future<void> saveCompletedGame(CurlingGame game) async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.collection('games').add({
        'startedAt': Timestamp.fromDate(game.startedAt),
        'finishedAt': Timestamp.now(),
        'numberOfEnds': game.numberOfEnds,
        'team1': {
          'name': game.team1.name,
          'totalScore': game.team1TotalScore,
          'hadLastStoneFirstEnd': game.team1.hadLastStoneFirstEnd,
        },
        'team2': {
          'name': game.team2.name,
          'totalScore': game.team2TotalScore,
          'hadLastStoneFirstEnd': game.team2.hadLastStoneFirstEnd,
        },
        'ends': [
          for (final e in game.ends)
            {
              'endNumber': e.endNumber,
              // The display name is kept as-is so existing readers,
              // including the public games API, are unaffected.
              // scoringTeamSlot is the unambiguous value to prefer.
              'scoringTeam': _teamNameFor(game, e.scoringTeam),
              'scoringTeamSlot': e.scoringTeam?.name,
              'score': e.score,
              'gameTimeInSeconds': e.gameTimeInSeconds,
            },
        ],
      });
      await _sheetRef.update({'liveGame': FieldValue.delete()});
      _recordSuccess();
    } on Exception catch (e) {
      _recordError('saveCompletedGame', e);
    }
  }

  String? _teamNameFor(CurlingGame game, ScoringTeam? team) => switch (team) {
    ScoringTeam.team1 => game.team1.name,
    ScoringTeam.team2 => game.team2.name,
    null => null,
  };
}
