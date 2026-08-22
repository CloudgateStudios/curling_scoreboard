/// Which of the two teams in a game scored an end.
///
/// Ends are attributed to a slot rather than a team name so that two teams
/// sharing a display name cannot both be credited with the same points.
enum ScoringTeam { team1, team2 }

class CurlingEnd {
  CurlingEnd({
    required this.endNumber,
    required this.score,
    this.scoringTeam,
    this.gameTimeInSeconds = -1,
  });

  factory CurlingEnd.fromJson(Map<String, dynamic> json) => CurlingEnd(
    endNumber: json['endNumber'] as int,
    score: json['score'] as int,
    scoringTeam: _scoringTeamFromJson(json),
    gameTimeInSeconds: json['gameTimeInSeconds'] as int? ?? -1,
  );

  int endNumber;
  ScoringTeam? scoringTeam;
  int score;
  int gameTimeInSeconds;

  Map<String, dynamic> toJson() => {
    'endNumber': endNumber,
    'score': score,
    'scoringTeam': scoringTeam?.name,
    'gameTimeInSeconds': gameTimeInSeconds,
  };

  /// Reads the scoring team, tolerating games written before ends were
  /// attributed by slot. Those stored the team's display name instead.
  static ScoringTeam? _scoringTeamFromJson(Map<String, dynamic> json) {
    final value = json['scoringTeam'] as String?;
    if (value == null) {
      return null;
    }

    return ScoringTeam.values.asNameMap()[value];
  }
}
