import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:curling_scoreboard_flutter/models/models.dart';

class CurlingGame {
  CurlingGame({
    required this.team1,
    required this.team2,
    required this.numberOfEnds,
    required this.numberOfPlayersPerTeam,
    this.ends = const [],
    this.scoreboardStyle = ScoreboardStyle.baseball,
    this.currentPlayingEnd = 1,
  });

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
  );

  CurlingTeam team1;
  CurlingTeam team2;
  int numberOfEnds;
  int numberOfPlayersPerTeam;
  List<CurlingEnd> ends;
  ScoreboardStyle scoreboardStyle;
  int currentPlayingEnd;

  Map<String, dynamic> toJson() => {
    'team1': team1.toJson(),
    'team2': team2.toJson(),
    'numberOfEnds': numberOfEnds,
    'numberOfPlayersPerTeam': numberOfPlayersPerTeam,
    'scoreboardStyle': scoreboardStyle.name,
    'currentPlayingEnd': currentPlayingEnd,
    'ends': ends.map((e) => e.toJson()).toList(),
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

  int get team1TotalScore {
    return ends
        .where((end) => end.scoringTeamName == team1.name)
        .map((end) => end.score)
        .fold(0, (a, b) => a + b);
  }

  int get team2TotalScore {
    return ends
        .where((end) => end.scoringTeamName == team2.name)
        .map((end) => end.score)
        .fold(0, (a, b) => a + b);
  }

  List<int> get team1ScoresByEnd {
    final returnValue = <int>[];

    for (final end in ends) {
      if (end.scoringTeamName == team1.name) {
        returnValue.add(end.score);
      } else {
        returnValue.add(0);
      }
    }

    return returnValue;
  }

  List<int> get team2ScoresByEnd {
    final returnValue = <int>[];

    for (final end in ends) {
      if (end.scoringTeamName == team2.name) {
        returnValue.add(end.score);
      } else {
        returnValue.add(0);
      }
    }

    return returnValue;
  }

  void evaluateHammer() {
    final lastEnd = ends.last;

    //Check for Doubles game first and make sure a blank end switches hammer
    if (numberOfPlayersPerTeam == 2 && lastEnd.score == 0) {
      if (team1.hasHammer) {
        team1.hasHammer = false;
        team2.hasHammer = true;
      } else {
        team1.hasHammer = true;
        team2.hasHammer = false;
      }

      return;
    }

    //Check for a blank end and do nothing to retain hammer on current team
    if (lastEnd.score == 0) {
      return;
    }

    //Normal end hammer detection
    if (lastEnd.scoringTeamName == team1.name) {
      team1.hasHammer = false;
      team2.hasHammer = true;
    } else {
      team1.hasHammer = true;
      team2.hasHammer = false;
    }
  }

  CurlingTeam whichTeamHasHammer() {
    if (team1.hasHammer) {
      return team1;
    } else {
      return team2;
    }
  }
}

enum ScoreboardStyle { baseball, club }
