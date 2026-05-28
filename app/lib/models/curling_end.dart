class CurlingEnd {
  CurlingEnd({
    required this.endNumber,
    required this.score,
    this.scoringTeamName,
    this.gameTimeInSeconds = -1,
  });

  factory CurlingEnd.fromJson(Map<String, dynamic> json) => CurlingEnd(
    endNumber: json['endNumber'] as int,
    score: json['score'] as int,
    scoringTeamName: json['scoringTeamName'] as String?,
    gameTimeInSeconds: json['gameTimeInSeconds'] as int? ?? -1,
  );

  int endNumber;
  String? scoringTeamName;
  int score;
  int gameTimeInSeconds;

  Map<String, dynamic> toJson() => {
    'endNumber': endNumber,
    'score': score,
    'scoringTeamName': scoringTeamName,
    'gameTimeInSeconds': gameTimeInSeconds,
  };
}
