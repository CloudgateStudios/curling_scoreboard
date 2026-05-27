import 'package:curling_scoreboard_flutter/constants.dart';
import 'package:flutter/material.dart';

class ScoreboardCurlingClubLayout extends StatelessWidget {
  const ScoreboardCurlingClubLayout({
    required this.team1Scores,
    required this.team2Scores,
    required this.team1Color,
    required this.team2Color,
    required this.team1TextColor,
    required this.team2TextColor,
    required this.scoreRowColor,
    required this.scoreRowTextColor,
    required this.onPressed,
    super.key,
  });

  final List<int> team1Scores;
  final List<int> team2Scores;
  final Color team1Color;
  final Color team2Color;
  final Color team1TextColor;
  final Color team2TextColor;
  final Color scoreRowColor;
  final Color scoreRowTextColor;
  final void Function(int) onPressed;

  static const int maxScore = Constants.curlingClubLayoutMaxScore;

  @override
  Widget build(BuildContext context) {
    final team1Cumulative = _calculateCumulativeMap(team1Scores);
    final team2Cumulative = _calculateCumulativeMap(team2Scores);

    return LayoutBuilder(
      builder: (context, constraints) {
        final widthPerItem = constraints.maxWidth / maxScore;

        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: List.generate(maxScore, (index) {
            final scoreValue = index + 1;
            final team1End = team1Cumulative[scoreValue];
            final team2End = team2Cumulative[scoreValue];

            return Container(
              width: widthPerItem,
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(
                    width: 2,
                  ),
                  right: BorderSide(
                    width: 2,
                  ),
                ),
              ),
              child: Column(
                children: [
                  // Team 1 Row (Top)
                  Expanded(
                    child: Container(
                      alignment: Alignment.center,
                      child: team1End != null
                          ? InkWell(
                              onTap: () => onPressed(team1End),
                              child: _EndMarker(
                                endNumber: team1End,
                                color: team1Color,
                                textColor: team1TextColor,
                              ),
                            )
                          : null,
                    ),
                  ),
                  // Middle Row (The Number)
                  Container(
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: scoreRowColor,
                      border: const Border.symmetric(
                        horizontal: BorderSide(
                          width: 2,
                        ),
                      ),
                    ),
                    child: Text(
                      scoreValue.toString(),
                      style: TextStyle(
                        color: scoreRowTextColor,
                        fontWeight: FontWeight.bold,
                        fontSize: 20,
                      ),
                    ),
                  ),
                  // Team 2 Row (Bottom)
                  Expanded(
                    child: Container(
                      alignment: Alignment.center,
                      child: team2End != null
                          ? InkWell(
                              onTap: () => onPressed(team2End),
                              child: _EndMarker(
                                endNumber: team2End,
                                color: team2Color,
                                textColor: team2TextColor,
                              ),
                            )
                          : null,
                    ),
                  ),
                ],
              ),
            );
          }),
        );
      },
    );
  }

  Map<int, int> _calculateCumulativeMap(List<int> scores) {
    final map = <int, int>{};
    var currentTotal = 0;
    for (var i = 0; i < scores.length; i++) {
      final score = scores[i];
      if (score > 0) {
        currentTotal += score;
        if (currentTotal <= maxScore) {
          map[currentTotal] = i + 1; // End number is index + 1
        }
      }
    }
    return map;
  }
}

class _EndMarker extends StatelessWidget {
  const _EndMarker({
    required this.endNumber,
    required this.color,
    required this.textColor,
  });

  final int endNumber;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(4),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 2,
              offset: const Offset(1, 1),
            ),
          ],
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            return Text(
              endNumber.toString(),
              style: TextStyle(
                color: textColor,
                fontWeight: FontWeight.bold,
                fontSize: constraints.maxWidth * 0.5,
              ),
            );
          },
        ),
      ),
    );
  }
}
