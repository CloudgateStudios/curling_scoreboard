import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:flutter/material.dart';
import 'package:material_segmented_control/material_segmented_control.dart';

class GameStartDialog extends StatelessWidget {
  const GameStartDialog({
    this.rockColors,
    this.leagues = const [],
    this.now = DateTime.now,
    super.key,
  });

  /// The paired club's rock colors. Red and yellow when null.
  final RockColors? rockColors;

  /// The paired club's active leagues. League games are only offered when
  /// there are some.
  final List<League> leagues;

  /// The scoreboard's local time, which decides the league suggested for a
  /// league game.
  final DateTime Function() now;

  /// How long the setup screen ignores taps after the team picker closes.
  @visibleForTesting
  static const pickerGuardDuration = Duration(milliseconds: 700);

  @override
  Widget build(BuildContext context) {
    var settingsTotalEnds = Constants.defaultTotalEnds;
    var currentNumberOfEndsSelectedIndex = Constants.defaultTotalEnds;

    final numberOfEnds = {
      2: const Padding(
        padding: EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: GameStartSegmentControlText(text: '2'),
      ),
      4: const GameStartSegmentControlText(text: '4'),
      6: const GameStartSegmentControlText(text: '6'),
      8: const GameStartSegmentControlText(text: '8'),
      10: const GameStartSegmentControlText(text: '10'),
    };

    var settingsNumberOfPlayersPerTeam =
        Constants.defaultNumberOfPlayersPerTeam;
    var currentNumberOfPlayersPerTeamSelectedIndex =
        Constants.defaultNumberOfPlayersPerTeam;

    final colors = rockColors ?? RockColors.defaults(context.l10n);

    // The teams of a league game, picked on their own screen. Null for an
    // open game.
    LeagueMatchup? matchup;

    // A double tap on the picker's Done would otherwise land on whatever
    // is under it here as the picker closes. The setup screen sits out the
    // moment after.
    var guarded = false;

    var settingsHammerTeam = Constants.defaultHammerTeam;
    var currentHammerTeamSelectedIndex = Constants.defaultHammerTeam;

    return StatefulBuilder(
      builder: (context, setState) {
        // In a league game the hammer goes to a team, so the choice shows
        // the teams' names once they are picked.
        final hammerChoices = {
          0: Padding(
            padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
            child: GameStartSegmentControlText(
              text: matchup?.team1.name ?? colors.team1.name,
            ),
          ),
          1: Padding(
            // Team names run longer than color names and need the room.
            padding: EdgeInsets.symmetric(horizontal: matchup == null ? 0 : 30),
            child: GameStartSegmentControlText(
              text: matchup?.team2.name ?? colors.team2.name,
            ),
          ),
        };

        // In order to have the text update correctly need to have this inside
        // the stateful builder context.
        final numberOfPlayersPerTeam = {
          0: GameStartSegmentControlText(
            text: '0',
            subtext: context.l10n.gameStartDialogZeroPlayersButtonLabel,
          ),
          2: Padding(
            padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
            child: GameStartSegmentControlText(
              text: '2',
              subtext: context.l10n
                  .gameStartDialogTimePerEndByPlayersButtonLabel(
                    Constants.minutesPerEndTwoPlayers.toString(),
                    _printDuration(
                      Duration(
                        minutes:
                            Constants.minutesPerEndTwoPlayers *
                            settingsTotalEnds,
                      ),
                    ),
                  ),
            ),
          ),
          4: GameStartSegmentControlText(
            text: '4',
            subtext: context.l10n.gameStartDialogTimePerEndByPlayersButtonLabel(
              Constants.minutesPerEndFourPlayers.toString(),
              _printDuration(
                Duration(
                  minutes:
                      Constants.minutesPerEndFourPlayers * settingsTotalEnds,
                ),
              ),
            ),
          ),
        };

        return AbsorbPointer(
          absorbing: guarded,
          child: AlertDialog(
            title: Text(context.l10n.gameStartDialogTitle),
            // The form is laid out at a fixed size for a large scoreboard
            // display. Scaling it down keeps it whole on smaller screens
            // instead of overflowing and clipping the controls.
            content: FittedBox(
              fit: BoxFit.scaleDown,
              child: Form(
                child: IntrinsicWidth(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (leagues.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 20),
                          child: _LeagueBar(
                            colors: colors,
                            matchup: matchup,
                            suggested: LeagueMatchupPicker.suggestedLeague(
                              leagues,
                              now(),
                            ),
                            onPick: () async {
                              final picked = await showDialog<LeagueMatchup>(
                                context: context,
                                builder: (_) => LeagueMatchupPicker(
                                  leagues: leagues,
                                  rockColors: colors,
                                  now: now,
                                  initial: matchup,
                                ),
                              );
                              if (!context.mounted) return;
                              setState(() {
                                if (picked != null) matchup = picked;
                                guarded = true;
                              });
                              await Future<void>.delayed(pickerGuardDuration);
                              if (context.mounted) {
                                setState(() => guarded = false);
                              }
                            },
                            onClear: () => setState(() => matchup = null),
                          ),
                        ),
                      Table(
                        defaultColumnWidth: const IntrinsicColumnWidth(),
                        defaultVerticalAlignment:
                            TableCellVerticalAlignment.middle,
                        children: [
                          _settingRow(
                            label: context
                                .l10n
                                .gameStartDialogFormLabelNumberOfEnds,
                            control: MaterialSegmentedControl(
                              children: numberOfEnds,
                              selectionIndex: currentNumberOfEndsSelectedIndex,
                              borderColor: Colors.grey,
                              selectedColor: Colors.blueAccent,
                              unselectedColor: Colors.white,
                              selectedTextStyle: const TextStyle(
                                color: Colors.white,
                              ),
                              unselectedTextStyle: const TextStyle(
                                color: Colors.black,
                              ),
                              borderWidth: 1,
                              borderRadius: 20,
                              horizontalPadding: const EdgeInsets.all(10),
                              verticalOffset: 25,
                              onSegmentTapped: (index) {
                                setState(() {
                                  currentNumberOfEndsSelectedIndex = index;
                                  settingsTotalEnds = index;
                                });
                              },
                            ),
                          ),
                          _settingRow(
                            label: context
                                .l10n
                                .gameStartDialogFormLabelPlayersPerTeam,
                            control: MaterialSegmentedControl(
                              children: numberOfPlayersPerTeam,
                              selectionIndex:
                                  currentNumberOfPlayersPerTeamSelectedIndex,
                              borderColor: Colors.grey,
                              selectedColor: Colors.blueAccent,
                              unselectedColor: Colors.white,
                              selectedTextStyle: const TextStyle(
                                color: Colors.white,
                              ),
                              unselectedTextStyle: const TextStyle(
                                color: Colors.black,
                              ),
                              borderWidth: 1,
                              borderRadius: 20,
                              horizontalPadding: const EdgeInsets.all(10),
                              verticalOffset: 25,
                              onSegmentTapped: (index) {
                                setState(() {
                                  currentNumberOfPlayersPerTeamSelectedIndex =
                                      index;
                                  settingsNumberOfPlayersPerTeam = index;
                                });
                              },
                            ),
                          ),
                          _settingRow(
                            label: context
                                .l10n
                                .gameStartDialogFormLabelFirstEndHammer,
                            control: MaterialSegmentedControl(
                              children: hammerChoices,
                              selectionIndex: currentHammerTeamSelectedIndex,
                              borderColor: Colors.grey,
                              selectedColor: Colors.blueAccent,
                              unselectedColor: Colors.white,
                              selectedTextStyle: const TextStyle(
                                color: Colors.white,
                              ),
                              unselectedTextStyle: const TextStyle(
                                color: Colors.black,
                              ),
                              borderWidth: 1,
                              borderRadius: 20,
                              horizontalPadding: const EdgeInsets.all(10),
                              verticalOffset: 25,
                              onSegmentTapped: (index) {
                                setState(() {
                                  currentHammerTeamSelectedIndex = index;
                                  settingsHammerTeam = index;
                                });
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actions: [
              const Padding(
                padding: EdgeInsets.only(left: 20),
                child: Text(
                  'v$packageVersion',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
              ElevatedButton(
                onPressed: () {
                  final league = matchup?.league;
                  final team1 = CurlingTeam(
                    name: matchup?.team1.name ?? colors.team1.name,
                    colorName: colors.team1.name,
                    teamId: matchup?.team1.id,
                    externalId: matchup?.team1.externalId,
                    color: colors.team1.color,
                    textColor: colors.team1.textColor,
                    hasHammer: settingsHammerTeam == 0,
                    hadLastStoneFirstEnd: settingsHammerTeam == 0,
                  );
                  final team2 = CurlingTeam(
                    name: matchup?.team2.name ?? colors.team2.name,
                    colorName: colors.team2.name,
                    teamId: matchup?.team2.id,
                    externalId: matchup?.team2.externalId,
                    color: colors.team2.color,
                    textColor: colors.team2.textColor,
                    hasHammer: settingsHammerTeam == 1,
                    hadLastStoneFirstEnd: settingsHammerTeam == 1,
                  );

                  final newCurlingGame = CurlingGame(
                    team1: team1,
                    team2: team2,
                    numberOfEnds: settingsTotalEnds,
                    numberOfPlayersPerTeam: settingsNumberOfPlayersPerTeam,
                    league: league == null
                        ? null
                        : GameLeague(id: league.id, name: league.name),
                  );

                  Navigator.pop(context, newCurlingGame);
                },
                child: Text(
                  context.l10n.gameStartDialogButtonLabelStartGame,
                  style: const TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  TableRow _settingRow({required String label, required Widget control}) {
    return TableRow(
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 20),
          child: Text(label, style: const TextStyle(fontSize: 40)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Align(alignment: Alignment.centerLeft, child: control),
        ),
      ],
    );
  }

  String _printDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
    return '${twoDigits(duration.inHours)}:$twoDigitMinutes';
  }
}

class GameStartSegmentControlText extends StatelessWidget {
  const GameStartSegmentControlText({
    required this.text,
    this.subtext = '',
    super.key,
  });

  final String text;
  final String subtext;

  @override
  Widget build(BuildContext context) {
    if (subtext == '') {
      return basicText(text);
    } else {
      return Column(
        children: [
          basicText(text),
          Text(
            subtext,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      );
    }
  }

  Text basicText(String text) {
    return Text(
      text,
      style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
    );
  }
}

/// The one thing league games add to the setup screen: a bar that opens the
/// team picker, and afterwards shows the teams that were picked. Leaving it
/// alone starts an open game.
class _LeagueBar extends StatelessWidget {
  const _LeagueBar({
    required this.colors,
    required this.matchup,
    required this.suggested,
    required this.onPick,
    required this.onClear,
  });

  final RockColors colors;
  final LeagueMatchup? matchup;

  /// The league playing now, named on the bar before teams are picked.
  final League? suggested;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final matchup = this.matchup;

    return Material(
      color: Colors.blueAccent.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onPick,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 20),
          child: Row(
            children: [
              Expanded(
                child: matchup == null
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            suggested == null
                                ? l10n.gameStartDialogLeagueBarTitle
                                : l10n.gameStartDialogLeagueBarTitlePlaying(
                                    suggested!.name,
                                  ),
                            style: const TextStyle(
                              fontSize: 40,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            l10n.gameStartDialogLeagueBarPickTeams,
                            style: const TextStyle(fontSize: 30),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            matchup.league.name,
                            style: const TextStyle(fontSize: 30),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              _TeamChip(
                                color: colors.team1,
                                name: matchup.team1.name,
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
                              _TeamChip(
                                color: colors.team2,
                                name: matchup.team2.name,
                              ),
                            ],
                          ),
                        ],
                      ),
              ),
              if (matchup == null)
                const Icon(Icons.chevron_right, size: 60)
              else
                IconButton(
                  iconSize: 50,
                  tooltip: l10n.gameStartDialogLeagueBarClearTooltip,
                  onPressed: onClear,
                  icon: const Icon(Icons.close),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TeamChip extends StatelessWidget {
  const _TeamChip({required this.color, required this.name});

  final RockColor color;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      decoration: BoxDecoration(
        color: color.color,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        name,
        style: TextStyle(
          fontSize: 40,
          fontWeight: FontWeight.bold,
          color: color.textColor,
        ),
      ),
    );
  }
}
