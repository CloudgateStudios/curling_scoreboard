import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
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

    final hammerChoices = {
      0: Padding(
        padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
        child: GameStartSegmentControlText(text: colors.team1.name),
      ),
      1: GameStartSegmentControlText(text: colors.team2.name),
    };

    var leagueGame = false;
    League? selectedLeague;
    LeagueTeam? team1Pick;
    LeagueTeam? team2Pick;

    var settingsHammerTeam = Constants.defaultHammerTeam;
    var currentHammerTeamSelectedIndex = Constants.defaultHammerTeam;

    return StatefulBuilder(
      builder: (context, setState) {
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

        return AlertDialog(
          title: Text(context.l10n.gameStartDialogTitle),
          // The form is laid out at a fixed size for a large scoreboard
          // display. Scaling it down keeps it whole on smaller screens
          // instead of overflowing and clipping the controls.
          content: FittedBox(
            fit: BoxFit.scaleDown,
            child: Form(
              child: Table(
                defaultColumnWidth: const IntrinsicColumnWidth(),
                defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                children: [
                  if (leagues.isNotEmpty)
                    _settingRow(
                      label: context.l10n.gameStartDialogFormLabelGameType,
                      control: MaterialSegmentedControl(
                        children: {
                          0: Padding(
                            padding: const EdgeInsets.fromLTRB(50, 0, 50, 0),
                            child: GameStartSegmentControlText(
                              text: context.l10n.gameStartDialogGameTypeOpen,
                            ),
                          ),
                          1: GameStartSegmentControlText(
                            text: context.l10n.gameStartDialogGameTypeLeague,
                          ),
                        },
                        selectionIndex: leagueGame ? 1 : 0,
                        borderColor: Colors.grey,
                        selectedColor: Colors.blueAccent,
                        unselectedColor: Colors.white,
                        selectedTextStyle: const TextStyle(color: Colors.white),
                        unselectedTextStyle: const TextStyle(
                          color: Colors.black,
                        ),
                        borderWidth: 1,
                        borderRadius: 20,
                        horizontalPadding: const EdgeInsets.all(10),
                        verticalOffset: 25,
                        onSegmentTapped: (index) {
                          setState(() {
                            leagueGame = index == 1;
                            if (leagueGame) {
                              selectedLeague ??= _suggestedLeague();
                            }
                          });
                        },
                      ),
                    ),
                  if (leagueGame)
                    _settingRow(
                      label: context.l10n.gameStartDialogFormLabelLeague,
                      control: OutlinedButton(
                        style: _pickerButtonStyle,
                        onPressed: () async {
                          final league = await _pick<League>(
                            context,
                            title: context.l10n.leaguePickerDialogTitle,
                            // Whatever is on the ice now comes first.
                            items: [
                              ...leagues.where((l) => l.isPlayingAt(now())),
                              ...leagues.where((l) => !l.isPlayingAt(now())),
                            ],
                            label: (league) => league.name,
                          );
                          if (league == null ||
                              league.id == selectedLeague?.id) {
                            return;
                          }
                          setState(() {
                            selectedLeague = league;
                            team1Pick = null;
                            team2Pick = null;
                          });
                        },
                        child: Text(
                          selectedLeague?.name ??
                              context.l10n.gameStartDialogPickLeagueButtonLabel,
                        ),
                      ),
                    ),
                  if (leagueGame)
                    _settingRow(
                      label: context.l10n.gameStartDialogFormLabelTeams,
                      control: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _teamButton(
                            context,
                            color: colors.team1,
                            league: selectedLeague,
                            picked: team1Pick,
                            other: team2Pick,
                            onPicked: (team) =>
                                setState(() => team1Pick = team),
                          ),
                          const SizedBox(width: 20),
                          _teamButton(
                            context,
                            color: colors.team2,
                            league: selectedLeague,
                            picked: team2Pick,
                            other: team1Pick,
                            onPicked: (team) =>
                                setState(() => team2Pick = team),
                          ),
                        ],
                      ),
                    ),
                  _settingRow(
                    label: context.l10n.gameStartDialogFormLabelNumberOfEnds,
                    control: MaterialSegmentedControl(
                      children: numberOfEnds,
                      selectionIndex: currentNumberOfEndsSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
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
                    label: context.l10n.gameStartDialogFormLabelPlayersPerTeam,
                    control: MaterialSegmentedControl(
                      children: numberOfPlayersPerTeam,
                      selectionIndex:
                          currentNumberOfPlayersPerTeamSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
                      borderWidth: 1,
                      borderRadius: 20,
                      horizontalPadding: const EdgeInsets.all(10),
                      verticalOffset: 25,
                      onSegmentTapped: (index) {
                        setState(() {
                          currentNumberOfPlayersPerTeamSelectedIndex = index;
                          settingsNumberOfPlayersPerTeam = index;
                        });
                      },
                    ),
                  ),
                  _settingRow(
                    label: context.l10n.gameStartDialogFormLabelFirstEndHammer,
                    control: MaterialSegmentedControl(
                      children: hammerChoices,
                      selectionIndex: currentHammerTeamSelectedIndex,
                      borderColor: Colors.grey,
                      selectedColor: Colors.blueAccent,
                      unselectedColor: Colors.white,
                      selectedTextStyle: const TextStyle(color: Colors.white),
                      unselectedTextStyle: const TextStyle(color: Colors.black),
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
              // A league game is between two of the league's teams.
              onPressed:
                  leagueGame &&
                      (selectedLeague == null ||
                          team1Pick == null ||
                          team2Pick == null)
                  ? null
                  : () {
                      final league = leagueGame ? selectedLeague : null;
                      final team1 = CurlingTeam(
                        name: league == null
                            ? colors.team1.name
                            : team1Pick!.name,
                        colorName: colors.team1.name,
                        teamId: league == null ? null : team1Pick!.id,
                        externalId: league == null
                            ? null
                            : team1Pick!.externalId,
                        color: colors.team1.color,
                        textColor: colors.team1.textColor,
                        hasHammer: settingsHammerTeam == 0,
                        hadLastStoneFirstEnd: settingsHammerTeam == 0,
                      );
                      final team2 = CurlingTeam(
                        name: league == null
                            ? colors.team2.name
                            : team2Pick!.name,
                        colorName: colors.team2.name,
                        teamId: league == null ? null : team2Pick!.id,
                        externalId: league == null
                            ? null
                            : team2Pick!.externalId,
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
        );
      },
    );
  }

  /// The league to start with: the one playing now, or the club's only one.
  /// With several to choose from and no clear answer, the user picks.
  League? _suggestedLeague() {
    final playing = leagues.where((l) => l.isPlayingAt(now())).toList();
    if (playing.length == 1) return playing.single;
    return leagues.length == 1 ? leagues.single : null;
  }

  static final ButtonStyle _pickerButtonStyle = OutlinedButton.styleFrom(
    textStyle: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
    padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
  );

  /// A button in a rock color that picks the team throwing it.
  Widget _teamButton(
    BuildContext context, {
    required RockColor color,
    required League? league,
    required LeagueTeam? picked,
    required LeagueTeam? other,
    required ValueChanged<LeagueTeam> onPicked,
  }) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: color.color,
        foregroundColor: color.textColor,
        disabledBackgroundColor: color.color.withValues(alpha: 0.3),
        textStyle: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold),
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
      ),
      onPressed: league == null
          ? null
          : () async {
              final team = await _pick<LeagueTeam>(
                context,
                title: context.l10n.teamPickerDialogTitle(color.name),
                // A team cannot play itself.
                items: [
                  for (final team in league.teams)
                    if (team.id != other?.id) team,
                ],
                label: (team) => team.name,
              );
              if (team != null) onPicked(team);
            },
      child: Text(
        picked?.name ??
            context.l10n.gameStartDialogPickTeamButtonLabel(color.name),
      ),
    );
  }

  Future<T?> _pick<T>(
    BuildContext context, {
    required String title,
    required List<T> items,
    required String Function(T) label,
  }) {
    return showDialog<T>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text(title, style: const TextStyle(fontSize: 32)),
        children: [
          for (final item in items)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, item),
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              child: Text(label(item), style: const TextStyle(fontSize: 32)),
            ),
        ],
      ),
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
