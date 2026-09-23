import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';

class SyncService {
  SyncService(this._registration);

  final RegistrationService _registration;

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
    } on Exception catch (e) {
      debugPrint('SyncService.pushLiveGame error: $e');
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
    } on Exception catch (e) {
      debugPrint('SyncService.saveCompletedGame error: $e');
    }
  }

  String? _teamNameFor(CurlingGame game, ScoringTeam? team) => switch (team) {
    ScoringTeam.team1 => game.team1.name,
    ScoringTeam.team2 => game.team2.name,
    null => null,
  };
}
