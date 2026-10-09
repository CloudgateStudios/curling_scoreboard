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

  /// Clears any live game left on the sheet. Game state is not persisted, so
  /// whenever the app starts there is no game in progress; anything still
  /// marked live was abandoned by a reload or crash.
  Future<void> clearLiveGame() async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.update({'liveGame': FieldValue.delete()});
      _recordSuccess();
    } on Exception catch (e) {
      _recordError('clearLiveGame', e);
    }
  }

  Future<void> pushLiveGame(CurlingGame game) async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.update({
        'liveGame': {
          // Lets readers expire a live game whose scoreboard went away
          // without finishing it.
          'updatedAt': FieldValue.serverTimestamp(),
          'currentEnd': game.currentPlayingEnd,
          'league': ?game.league?.toJson(),
          'team1': {
            'name': game.team1.name,
            'color': _colorOf(game.team1),
            ..._leagueTeamOf(game.team1),
            'score': game.team1TotalScore,
            'hasHammer': game.team1.hasHammer,
          },
          'team2': {
            'name': game.team2.name,
            'color': _colorOf(game.team2),
            ..._leagueTeamOf(game.team2),
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
      // One batch, so the completed game and the cleared live game land
      // together and are queued ahead of the next game's first push.
      final batch = FirebaseFirestore.instance.batch()
        ..set(_sheetRef.collection('games').doc(), {
          'startedAt': Timestamp.fromDate(game.startedAt),
          'finishedAt': Timestamp.now(),
          'numberOfEnds': game.numberOfEnds,
          'league': ?game.league?.toJson(),
          'team1': {
            'name': game.team1.name,
            'color': _colorOf(game.team1),
            ..._leagueTeamOf(game.team1),
            'totalScore': game.team1TotalScore,
            'hadLastStoneFirstEnd': game.team1.hadLastStoneFirstEnd,
          },
          'team2': {
            'name': game.team2.name,
            'color': _colorOf(game.team2),
            ..._leagueTeamOf(game.team2),
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
        })
        ..update(_sheetRef, {'liveGame': FieldValue.delete()});
      await batch.commit();
      _recordSuccess();
    } on Exception catch (e) {
      _recordError('saveCompletedGame', e);
    }
  }

  // Recorded with the game so it still reads correctly if the club later
  // changes its rocks.
  Map<String, dynamic> _colorOf(CurlingTeam team) =>
      RockColor(name: team.colorName, color: team.color).toJson();

  // Which league team this is, so a score can be matched to it however the
  // team is later renamed. Empty outside league games.
  Map<String, dynamic> _leagueTeamOf(CurlingTeam team) => {
    'teamId': ?team.teamId,
    'externalId': ?team.externalId,
  };

  String? _teamNameFor(CurlingGame game, ScoringTeam? team) => switch (team) {
    ScoringTeam.team1 => game.team1.name,
    ScoringTeam.team2 => game.team2.name,
    null => null,
  };
}
