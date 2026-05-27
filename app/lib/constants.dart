import 'package:flutter/material.dart';

class Constants {
  // Colors
  static const MaterialColor primaryThemeColor = Colors.blue;
  static const Color redTeamColor = Colors.red;
  static const Color yellowTeamColor = Colors.yellow;
  static const Color emptyScoreColor = Colors.white;
  static Color actionGreyColor = Colors.grey[300]!;
  static Color textDefaultColor = Colors.black;
  static Color textHighContrastColor = Colors.white;

  // Default Values
  static const int defaultTotalEnds = 8;
  static const int defaultNumberOfPlayersPerTeam = 4;
  static const int defaultHammerTeam = 0;

  // Basic Constants
  static const int minutesPerEndFourPlayers = 15;
  static const int minutesPerEndTwoPlayers = 12;
  static const int curlingClubLayoutMaxScore = 12;
}
