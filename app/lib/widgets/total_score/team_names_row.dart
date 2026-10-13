import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';

/// Each team's name on its rock color, under its total score, so the
/// players can see the right name went to the right rocks.
///
/// Tapping it calls [onPressed], which changes the teams.
class TeamNamesRow extends StatelessWidget {
  const TeamNamesRow({
    required this.team1,
    required this.team2,
    this.onPressed,
    super.key,
  });

  final CurlingTeam team1;
  final CurlingTeam team2;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final team in [team1, team2])
          Expanded(
            child: Material(
              color: team.color,
              child: InkWell(
                onTap: onPressed,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 4,
                  ),
                  // A long team name shrinks to one line instead of wrapping.
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      team.name,
                      style: TextStyle(
                        color: team.textColor,
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
