import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/registration_service.dart';
import 'package:flutter/foundation.dart';

class SyncService {
  SyncService(this._registration);

  final RegistrationService _registration;

  DocumentReference<Map<String, dynamic>> get _sheetRef =>
      FirebaseFirestore.instance
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

  Future<void> saveCompletedGame(
    CurlingGame game, {
    required DateTime startedAt,
  }) async {
    if (!_registration.isRegistered) return;
    try {
      await _sheetRef.collection('games').add({
        'startedAt': Timestamp.fromDate(startedAt),
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
        'ends': game.ends
            .map(
              (e) => {
                'endNumber': e.endNumber,
                'scoringTeam': e.scoringTeamName,
                'score': e.score,
                'gameTimeInSeconds': e.gameTimeInSeconds,
              },
            )
            .toList(),
      });
      await _sheetRef.update({'liveGame': FieldValue.delete()});
    } on Exception catch (e) {
      debugPrint('SyncService.saveCompletedGame error: $e');
    }
  }
}
