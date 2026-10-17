import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// What one side of a bonspiel game shows until its team is known: where the
/// team will come from.
String describeBonspielSide(
  BuildContext context,
  Bonspiel bonspiel,
  BonspielSide? side,
) {
  final l10n = context.l10n;
  return switch (side) {
    LinkedSide(:final from, :final winner) => () {
      final label = bonspiel.gameById(from)?.label ?? '?';
      return winner
          ? l10n.bonspielSideWinnerOf(label)
          : l10n.bonspielSideLoserOf(label);
    }(),
    PlacedSide() || null => l10n.bonspielSideToBeDecided,
  };
}

/// "Sat 2:00 PM"
String _when(DateTime start) => DateFormat.E().add_jm().format(start);

/// Takes the league bar's place on the setup screen during a bonspiel. Its
/// left side names the game this sheet plays next and changes it; its right
/// side shows the game's teams, opening the team picker to fill in any that
/// are not known yet. The cross sets the game aside for an open game.
class BonspielBar extends StatelessWidget {
  const BonspielBar({
    required this.bonspiel,
    required this.game,
    required this.teams,
    required this.colors,
    required this.onChooseGame,
    required this.onPickTeams,
    required this.onClear,
    super.key,
  });

  final Bonspiel bonspiel;

  /// Null when the sheet has no game in the current draw, or an open game was
  /// chosen.
  final BonspielGame? game;

  /// The game's teams as far as they are known.
  final (LeagueTeam?, LeagueTeam?) teams;
  final RockColors colors;
  final VoidCallback onChooseGame;
  final VoidCallback onPickTeams;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final game = this.game;
    final draw = game == null ? null : bonspiel.drawOf(game);
    final radius = BorderRadius.circular(20);
    final (team1, team2) = teams;

    return Material(
      color: Colors.blueAccent.withValues(alpha: 0.12),
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            flex: 2,
            child: InkWell(
              onTap: onChooseGame,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              bonspiel.name,
                              style: const TextStyle(fontSize: 24),
                            ),
                            Text(
                              game?.label ?? l10n.bonspielBarChooseGame,
                              style: const TextStyle(
                                fontSize: 40,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (draw != null)
                              Text(
                                l10n.bonspielBarDrawLabel(
                                  draw.label,
                                  _when(draw.start),
                                ),
                                style: const TextStyle(fontSize: 24),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.only(left: 12),
                      child: Icon(Icons.unfold_more, size: 44),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            flex: 3,
            child: InkWell(
              onTap: game == null ? onChooseGame : onPickTeams,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerRight,
                        child: game == null
                            ? Text(
                                l10n.bonspielBarNoGame,
                                style: const TextStyle(
                                  fontSize: 40,
                                  fontWeight: FontWeight.bold,
                                ),
                              )
                            : Row(
                                children: [
                                  BonspielTeamChip(
                                    color: colors.team1,
                                    team: team1,
                                    placeholder: describeBonspielSide(
                                      context,
                                      bonspiel,
                                      game.team1,
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                    ),
                                    child: Text(
                                      l10n.matchupVersus,
                                      style: const TextStyle(fontSize: 30),
                                    ),
                                  ),
                                  BonspielTeamChip(
                                    color: colors.team2,
                                    team: team2,
                                    placeholder: describeBonspielSide(
                                      context,
                                      bonspiel,
                                      game.team2,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                    if (game == null)
                      const Icon(Icons.chevron_right, size: 60)
                    else
                      IconButton(
                        iconSize: 50,
                        tooltip: l10n.bonspielBarClearTooltip,
                        onPressed: onClear,
                        icon: const Icon(Icons.close),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A team on its rock color, or where it will come from until it is known.
class BonspielTeamChip extends StatelessWidget {
  const BonspielTeamChip({
    required this.color,
    required this.team,
    required this.placeholder,
    super.key,
  });

  final RockColor color;
  final LeagueTeam? team;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    final team = this.team;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      decoration: BoxDecoration(
        color: team == null ? color.color.withValues(alpha: 0.35) : color.color,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        team?.name ?? placeholder,
        style: TextStyle(
          fontSize: 40,
          fontWeight: team == null ? FontWeight.normal : FontWeight.bold,
          fontStyle: team == null ? FontStyle.italic : FontStyle.normal,
          color: team == null ? Colors.black87 : color.textColor,
        ),
      ),
    );
  }
}

/// What was picked in the bonspiel game chooser.
sealed class BonspielChoice {
  const BonspielChoice();
}

/// A game of the bonspiel.
class BonspielGameChoice extends BonspielChoice {
  const BonspielGameChoice(this.game);

  final BonspielGame game;
}

/// A league game instead.
class LeagueGameChoice extends BonspielChoice {
  const LeagueGameChoice();
}

/// Asks which of [bonspiel]'s games is being started on [sheetId]: this
/// sheet's games from the draw before the current one on, and the other
/// sheets' games in the current draw, for a game moved at the last minute.
/// Offers league games too when [offerLeagues]. Completes with null if
/// dismissed.
Future<BonspielChoice?> showBonspielGameChooser(
  BuildContext context, {
  required Bonspiel bonspiel,
  required String? sheetId,
  required DateTime now,
  required bool offerLeagues,
}) {
  return showDialog<BonspielChoice>(
    context: context,
    builder: (_) => _BonspielGameChooser(
      bonspiel: bonspiel,
      sheetId: sheetId,
      now: now,
      offerLeagues: offerLeagues,
    ),
  );
}

class _BonspielGameChooser extends StatelessWidget {
  const _BonspielGameChooser({
    required this.bonspiel,
    required this.sheetId,
    required this.now,
    required this.offerLeagues,
  });

  final Bonspiel bonspiel;
  final String? sheetId;
  final DateTime now;
  final bool offerLeagues;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = bonspiel.currentDraw(now);
    final currentIndex = current == null ? 0 : bonspiel.draws.indexOf(current);
    final drawIndex = {for (final (i, d) in bonspiel.draws.indexed) d.id: i};
    final sheetId = this.sheetId;

    // A draw that ran late can still be on, so the one before is kept.
    final thisSheet = sheetId == null
        ? <BonspielGame>[]
        : [
            for (final game in bonspiel.gamesOnSheet(sheetId))
              if ((drawIndex[game.drawId] ?? 0) >= currentIndex - 1) game,
          ];
    final otherSheets = current == null
        ? <BonspielGame>[]
        : [
            for (final game in bonspiel.gamesIn(current))
              if (game.sheetId != sheetId) game,
          ];

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1100),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.bonspielGameChooserTitle,
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (thisSheet.isNotEmpty) ...[
                        _Heading(l10n.bonspielGameChooserThisSheet),
                        _GameGrid(bonspiel: bonspiel, games: thisSheet),
                      ],
                      if (otherSheets.isNotEmpty) ...[
                        _Heading(l10n.bonspielGameChooserOtherSheets),
                        _GameGrid(bonspiel: bonspiel, games: otherSheets),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  if (offerLeagues)
                    TextButton(
                      onPressed: () =>
                          Navigator.pop(context, const LeagueGameChoice()),
                      child: Text(
                        l10n.bonspielGameChooserLeagueButton,
                        style: const TextStyle(fontSize: 32),
                      ),
                    ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: Text(
                      l10n.matchupPickerCancelButtonLabel,
                      style: const TextStyle(fontSize: 32),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 12),
      child: Text(
        text,
        style: const TextStyle(fontSize: 26, color: Colors.black54),
      ),
    );
  }
}

/// Games as large buttons, two across.
class _GameGrid extends StatelessWidget {
  const _GameGrid({required this.bonspiel, required this.games});

  final Bonspiel bonspiel;
  final List<BonspielGame> games;

  static const _spacing = 12.0;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        spacing: _spacing,
        runSpacing: _spacing,
        children: [
          for (final game in games)
            FractionallySizedBox(
              widthFactor: 0.49,
              child: SizedBox(
                height: 110,
                child: _GameOption(bonspiel: bonspiel, game: game),
              ),
            ),
        ],
      ),
    );
  }
}

class _GameOption extends StatelessWidget {
  const _GameOption({required this.bonspiel, required this.game});

  final Bonspiel bonspiel;
  final BonspielGame game;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final draw = bonspiel.drawOf(game);
    final (team1, team2) = bonspiel.teamsOf(game);
    final played = bonspiel.state[game.id]?.isFinal ?? false;
    final side1 =
        team1?.name ?? describeBonspielSide(context, bonspiel, game.team1);
    final side2 =
        team2?.name ?? describeBonspielSide(context, bonspiel, game.team2);

    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      ),
      onPressed: () => Navigator.pop(context, BonspielGameChoice(game)),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              [
                game.label,
                if (draw != null)
                  l10n.bonspielBarDrawLabel(draw.label, _when(draw.start)),
                if (played) l10n.bonspielGameChooserPlayed,
              ].join(' · '),
              style: const TextStyle(fontSize: 22),
            ),
            Text(
              '$side1 ${l10n.matchupVersus} $side2',
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }
}
