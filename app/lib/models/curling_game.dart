import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/models/models.dart';

class CurlingGame {
  CurlingGame({
    required this.team1,
    required this.team2,
    required this.numberOfEnds,
    required this.numberOfPlayersPerTeam,
    this.ends = const [],
    this.scoreboardStyle = ScoreboardStyle.baseball,
    this.currentPlayingEnd = 1,
    DateTime? startedAt,
  }) : startedAt = startedAt ?? DateTime.now();

  factory CurlingGame.fromJson(Map<String, dynamic> json) => CurlingGame(
    team1: CurlingTeam.fromJson(json['team1'] as Map<String, dynamic>),
    team2: CurlingTeam.fromJson(json['team2'] as Map<String, dynamic>),
    numberOfEnds: json['numberOfEnds'] as int,
    numberOfPlayersPerTeam: json['numberOfPlayersPerTeam'] as int,
    scoreboardStyle: ScoreboardStyle.values.byName(
      json['scoreboardStyle'] as String,
    ),
    ends: (json['ends'] as List<dynamic>)
        .map((e) => CurlingEnd.fromJson(e as Map<String, dynamic>))
        .toList(),
    currentPlayingEnd: json['currentPlayingEnd'] as int,
    startedAt: json['startedAt'] == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(json['startedAt'] as int),
  );

  CurlingTeam team1;
  CurlingTeam team2;
  int numberOfEnds;
  int numberOfPlayersPerTeam;
  List<CurlingEnd> ends;
  ScoreboardStyle scoreboardStyle;
  int currentPlayingEnd;
  DateTime startedAt;

  Map<String, dynamic> toJson() => {
    'team1': team1.toJson(),
    'team2': team2.toJson(),
    'numberOfEnds': numberOfEnds,
    'numberOfPlayersPerTeam': numberOfPlayersPerTeam,
    'scoreboardStyle': scoreboardStyle.name,
    'currentPlayingEnd': currentPlayingEnd,
    'ends': ends.map((e) => e.toJson()).toList(),
    'startedAt': startedAt.millisecondsSinceEpoch,
  };

  String get currentPlayingEndForDisplay {
    if (currentPlayingEnd <= numberOfEnds) {
      return currentPlayingEnd.toString();
    } else {
      return 'E';
    }
  }

  bool get isGameComplete {
    if ((ends.length >= numberOfEnds) && (team1TotalScore != team2TotalScore)) {
      return true;
    } else {
      return false;
    }
  }

  int get minutesPerEnd {
    if (numberOfPlayersPerTeam == 4) {
      return Constants.minutesPerEndFourPlayers;
    } else {
      return Constants.minutesPerEndTwoPlayers;
    }
  }

  int get team1TotalScore => _totalScoreFor(ScoringTeam.team1);

  int get team2TotalScore => _totalScoreFor(ScoringTeam.team2);

  List<int> get team1ScoresByEnd => _scoresByEndFor(ScoringTeam.team1);

  List<int> get team2ScoresByEnd => _scoresByEndFor(ScoringTeam.team2);

  int _totalScoreFor(ScoringTeam team) => ends
      .where((end) => end.scoringTeam == team)
      .map((end) => end.score)
      .fold(0, (a, b) => a + b);

  List<int> _scoresByEndFor(ScoringTeam team) => [
    for (final end in ends)
      if (end.scoringTeam == team) end.score else 0,
  ];

  /// Recalculates which team holds the hammer.
  ///
  /// Every recorded end is replayed from the start of the game rather than
  /// looking only at the most recent one. That keeps the result a pure
  /// function of the ends, so correcting an earlier end produces the same
  /// answer as if the ends had been entered that way to begin with, and
  /// calling this repeatedly never drifts.
  void evaluateHammer() {
    // Last stone in the first end is the hammer for the first end.
    var team1HasHammer = team1.hadLastStoneFirstEnd;

    for (final end in ends) {
      if (end.score == 0) {
        // A blank end normally retains the hammer, but in doubles it switches.
        if (numberOfPlayersPerTeam == 2) {
          team1HasHammer = !team1HasHammer;
        }
        continue;
      }

      // Scoring gives up the hammer to the other team.
      team1HasHammer = end.scoringTeam != ScoringTeam.team1;
    }

    team1.hasHammer = team1HasHammer;
    team2.hasHammer = !team1HasHammer;
  }

  ScoringTeam whichTeamHasHammer() =>
      team1.hasHammer ? ScoringTeam.team1 : ScoringTeam.team2;
}

enum ScoreboardStyle { baseball, club }
