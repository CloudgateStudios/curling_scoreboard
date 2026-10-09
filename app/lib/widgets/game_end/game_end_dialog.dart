import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';

/// The report shown when a game finishes: the final score, then each end.
/// It fills the display, like the game setup screen that follows it.
class GameEndDialog extends StatelessWidget {
  const GameEndDialog({required this.gameObject, super.key});

  final CurlingGame gameObject;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final game = gameObject;

    return Dialog.fullscreen(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.gameEndDialogTitle, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 12),
            // The result is the headline. Each team's name sits on its rock
            // color, in the text color chosen to read on it, which a name
            // printed in yellow on a pale background did not.
            SizedBox(
              height: 120,
              child: Row(
                children: [
                  Expanded(
                    child: _FinalScore(
                      team: game.team1,
                      score: game.team1TotalScore,
                      scoreFirst: false,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _FinalScore(
                      team: game.team2,
                      score: game.team2TotalScore,
                      scoreFirst: true,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Expanded(child: GameSummaryWidget(game: game)),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 8,
                  ),
                  child: Text(
                    l10n.gameEndDialogButtonLabelDismiss,
                    style: const TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A team's name and final score on its rock color. The two scores face
/// each other across the middle of the screen.
class _FinalScore extends StatelessWidget {
  const _FinalScore({
    required this.team,
    required this.score,
    required this.scoreFirst,
  });

  final CurlingTeam team;
  final int score;
  final bool scoreFirst;

  @override
  Widget build(BuildContext context) {
    final name = Expanded(
      // A long team name shrinks to one line instead of wrapping.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: scoreFirst ? Alignment.centerRight : Alignment.centerLeft,
        child: Text(
          team.name,
          style: const TextStyle(fontSize: 44, fontWeight: FontWeight.bold),
        ),
      ),
    );
    final total = Text(
      score.toString(),
      style: const TextStyle(fontSize: 80, fontWeight: FontWeight.bold),
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      decoration: BoxDecoration(
        color: team.color,
        borderRadius: BorderRadius.circular(20),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: team.textColor),
        child: Row(
          spacing: 20,
          children: scoreFirst ? [total, name] : [name, total],
        ),
      ),
    );
  }
}

/// The game end by end: what each team scored and how long each end took.
class GameSummaryWidget extends StatelessWidget {
  const GameSummaryWidget({required this.game, super.key});

  final CurlingGame game;

  // Rows are this tall when there is room, and share the height evenly when
  // a long game needs more of them than fit.
  static const _rowHeight = 56.0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final ends = game.ends;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SummaryRow(
          height: 40,
          cells: [
            _HeaderCell(l10n.gameEndDialogEndTableHeader),
            _HeaderCell(game.team1.name),
            _HeaderCell(game.team2.name),
            _HeaderCell(l10n.gameEndDialogEndTimeTableHeader),
            _HeaderCell(l10n.gameEndDialogGameTimeTableHeader),
          ],
        ),
        for (final (index, end) in ends.indexed)
          Flexible(
            child: _SummaryRow(
              height: _rowHeight,
              cells: [
                _Cell(end.endNumber.toString()),
                _ScoreCell(
                  team: game.team1,
                  score: end.scoringTeam == ScoringTeam.team1 ? end.score : 0,
                ),
                _ScoreCell(
                  team: game.team2,
                  score: end.scoringTeam == ScoringTeam.team2 ? end.score : 0,
                ),
                _Cell(
                  _minutes(
                    Duration(
                      seconds:
                          end.gameTimeInSeconds -
                          (index == 0 ? 0 : ends[index - 1].gameTimeInSeconds),
                    ),
                  ),
                ),
                _Cell(_hours(Duration(seconds: end.gameTimeInSeconds))),
              ],
            ),
          ),
      ],
    );
  }

  String _minutes(Duration duration) =>
      '${_twoDigits(duration.inMinutes.remainder(60).abs())}:'
      '${_twoDigits(duration.inSeconds.remainder(60).abs())}';

  String _hours(Duration duration) =>
      '${_twoDigits(duration.inHours)}:${_minutes(duration)}';

  String _twoDigits(int n) => n.toString().padLeft(2, '0');
}

/// One line of the summary. Every row splits the width the same way, so the
/// columns line up without a table working out their widths from the text.
class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.cells, required this.height});

  final List<Widget> cells;
  final double height;

  // End, the two teams, end time, game time.
  static const _flex = [2, 3, 3, 3, 3];

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.black12)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (index, cell) in cells.indexed)
            Expanded(
              flex: _flex[index],
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: cell,
              ),
            ),
        ],
      ),
    );
  }
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        text,
        style: const TextStyle(fontSize: 24, color: Colors.black54),
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        text,
        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
      ),
    );
  }
}

/// What a team scored in an end. An end they scored in is filled with their
/// rock color, as it is on the scoreboard; the rest fade back.
class _ScoreCell extends StatelessWidget {
  const _ScoreCell({required this.team, required this.score});

  final CurlingTeam team;
  final int score;

  @override
  Widget build(BuildContext context) {
    final scored = score > 0;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scored ? team.color : null,
        borderRadius: BorderRadius.circular(10),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          score.toString(),
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.bold,
            color: scored ? team.textColor : Colors.black26,
          ),
        ),
      ),
    );
  }
}
