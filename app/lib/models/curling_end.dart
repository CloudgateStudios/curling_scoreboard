class CurlingEnd {
  CurlingEnd({
    required this.endNumber,
    required this.score,
    this.scoringTeamName,
    this.gameTimeInSeconds = -1,
  });
  int endNumber;
  String? scoringTeamName;
  int score;
  int gameTimeInSeconds;
}
