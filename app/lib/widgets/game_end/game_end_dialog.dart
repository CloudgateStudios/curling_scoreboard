import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';

class GameEndDialog extends StatelessWidget {
  const GameEndDialog({required this.gameObject, super.key});

  final CurlingGame gameObject;

  @override
  Widget build(BuildContext context) {
    return StatefulBuilder(
      builder: (context, setState) {
        return AlertDialog(
          title: Text(context.l10n.gameEndDialogTitle),
          content: GameSummaryWidget(
            team1Name: gameObject.team1.name,
            team2Name: gameObject.team2.name,
            team1Color: gameObject.team1.color,
            team2Color: gameObject.team2.color,
            ends: gameObject.ends,
            team1TotalScore: gameObject.team1TotalScore,
            team2TotalScore: gameObject.team2TotalScore,
          ),
          actions: [
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
              },
              child: Text(
                context.l10n.gameEndDialogButtonLabelDismiss,
                style: const TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class GameSummaryWidget extends StatelessWidget {
  const GameSummaryWidget({
    required this.team1Name,
    required this.team2Name,
    required this.team1Color,
    required this.team2Color,
    required this.ends,
    required this.team1TotalScore,
    required this.team2TotalScore,
    super.key,
  });

  final String team1Name;
  final String team2Name;
  final Color team1Color;
  final Color team2Color;
  final List<CurlingEnd> ends;
  final int team1TotalScore;
  final int team2TotalScore;

  @override
  Widget build(BuildContext context) {
    return Table(
      border: const TableBorder(
        horizontalInside: BorderSide(width: 2, color: Colors.blue),
      ),
      columnWidths: const <int, TableColumnWidth>{
        0: IntrinsicColumnWidth(),
        1: IntrinsicColumnWidth(),
        2: IntrinsicColumnWidth(),
        3: IntrinsicColumnWidth(),
        4: IntrinsicColumnWidth(),
      },
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      children: <TableRow>[
        TableRow(
          children: <Widget>[
            GameEndTableHeaderText(
              text: context.l10n.gameEndDialogEndTableHeader,
            ),
            GameEndTableHeaderText(text: team1Name, color: team1Color),
            GameEndTableHeaderText(text: team2Name, color: team2Color),
            GameEndTableHeaderText(
              text: context.l10n.gameEndDialogEndTimeTableHeader,
            ),
            GameEndTableHeaderText(
              text: context.l10n.gameEndDialogGameTimeTableHeader,
            ),
          ],
        ),
        for (final end in ends)
          TableRow(
            children: <Widget>[
              GameEndTableCellText(text: end.endNumber.toString()),
              GameEndTableCellText(
                text: (end.scoringTeam == ScoringTeam.team1)
                    ? end.score.toString()
                    : '0',
              ),
              GameEndTableCellText(
                text: (end.scoringTeam == ScoringTeam.team2)
                    ? end.score.toString()
                    : '0',
              ),
              GameEndTableCellText(
                text: (end.endNumber == 1)
                    ? _printDurationInMinutes(
                        Duration(seconds: end.gameTimeInSeconds),
                      )
                    : _printDurationInMinutes(
                        Duration(
                          seconds:
                              end.gameTimeInSeconds -
                              ends[end.endNumber - 2].gameTimeInSeconds,
                        ),
                      ),
              ),
              GameEndTableCellText(
                text: _printDurationInHours(
                  Duration(seconds: end.gameTimeInSeconds),
                ),
              ),
            ],
          ),
        TableRow(
          children: <Widget>[
            GameEndTableCellText(
              text: context.l10n.gameEndDialogTotalsTableHeader,
            ),
            GameEndTableCellText(
              text: team1TotalScore.toString(),
              color: team1Color,
            ),
            GameEndTableCellText(
              text: team2TotalScore.toString(),
              color: team2Color,
            ),
            const GameEndTableCellText(text: ''),
            const GameEndTableCellText(text: ''),
          ],
        ),
      ],
    );
  }

  String _printDurationInMinutes(Duration duration) {
    final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
    final twoDigitSeconds = twoDigits(duration.inSeconds.remainder(60).abs());
    return '$twoDigitMinutes:$twoDigitSeconds';
  }

  String _printDurationInHours(Duration duration) {
    final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
    final twoDigitSeconds = twoDigits(duration.inSeconds.remainder(60).abs());
    return '${twoDigits(duration.inHours)}:$twoDigitMinutes:$twoDigitSeconds';
  }

  String twoDigits(int n) => n.toString().padLeft(2, '0');
}

class GameEndTableHeaderText extends StatelessWidget {
  const GameEndTableHeaderText({
    required this.text,
    this.color = Colors.black,
    super.key,
  });

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 10, 20, 10),
      child: Text(
        text,
        style: TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 40,
          color: color,
        ),
      ),
    );
  }
}

class GameEndTableCellText extends StatelessWidget {
  const GameEndTableCellText({
    required this.text,
    this.color = Colors.black,
    super.key,
  });

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: color),
    );
  }
}
