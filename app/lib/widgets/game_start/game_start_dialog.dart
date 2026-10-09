import 'dart:async';

import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/src/version.dart';
import 'package:curling_scoreboard/widgets/game_start/league_matchup_picker.dart';
import 'package:flutter/material.dart';

/// The screen a game is set up on. It fills the display: there is nothing
/// behind it worth seeing, and it cannot be dismissed without starting a
/// game. Pops with the [CurlingGame] to play.
class GameStartDialog extends StatefulWidget {
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
  State<GameStartDialog> createState() => _GameStartDialogState();
}

class _GameStartDialogState extends State<GameStartDialog> {
  int _ends = Constants.defaultTotalEnds;
  int _playersPerTeam = Constants.defaultNumberOfPlayersPerTeam;
  int _hammerTeam = Constants.defaultHammerTeam;

  // The teams of a league game, picked on their own screen. Null for an
  // open game.
  LeagueMatchup? _matchup;

  // A league the user chose by hand. Until they do, the league is whatever
  // the clock suggests, worked out afresh each time it is needed because
  // this screen can sit open from one day to the next.
  League? _chosenLeague;

  // A double tap on the picker's Done would otherwise land on whatever is
  // under it here as the picker closes. The setup screen sits out the
  // moment after.
  bool _guarded = false;

  League? _currentLeague() =>
      _matchup?.league ??
      _chosenLeague ??
      League.suggested(widget.leagues, widget.now());

  Future<void> _chooseLeague() async {
    final league = await showLeagueChooser(
      context,
      leagues: widget.leagues,
      now: widget.now(),
    );
    if (league == null || !mounted) return;
    setState(() {
      // Teams belong to their league.
      if (league.id != _matchup?.league.id) _matchup = null;
      _chosenLeague = league;
    });
  }

  Future<void> _pickTeams(RockColors colors) async {
    // With no league to go on, ask for it first.
    final league =
        _currentLeague() ??
        await showLeagueChooser(
          context,
          leagues: widget.leagues,
          now: widget.now(),
        );
    if (league == null || !mounted) return;
    setState(() => _chosenLeague = league);

    final picked = await showDialog<LeagueMatchup>(
      context: context,
      builder: (_) => LeagueMatchupPicker(
        league: league,
        rockColors: colors,
        initial: _matchup,
      ),
    );
    if (!mounted) return;
    setState(() {
      if (picked != null) _matchup = picked;
      _guarded = true;
    });
    await Future<void>.delayed(GameStartDialog.pickerGuardDuration);
    if (mounted) setState(() => _guarded = false);
  }

  void _start(RockColors colors) {
    final matchup = _matchup;
    final team1 = CurlingTeam(
      name: matchup?.team1.name ?? colors.team1.name,
      colorName: colors.team1.name,
      teamId: matchup?.team1.id,
      externalId: matchup?.team1.externalId,
      color: colors.team1.color,
      textColor: colors.team1.textColor,
      hasHammer: _hammerTeam == 0,
      hadLastStoneFirstEnd: _hammerTeam == 0,
    );
    final team2 = CurlingTeam(
      name: matchup?.team2.name ?? colors.team2.name,
      colorName: colors.team2.name,
      teamId: matchup?.team2.id,
      externalId: matchup?.team2.externalId,
      color: colors.team2.color,
      textColor: colors.team2.textColor,
      hasHammer: _hammerTeam == 1,
      hadLastStoneFirstEnd: _hammerTeam == 1,
    );

    Navigator.pop(
      context,
      CurlingGame(
        team1: team1,
        team2: team2,
        numberOfEnds: _ends,
        numberOfPlayersPerTeam: _playersPerTeam,
        league: matchup == null
            ? null
            : GameLeague(id: matchup.league.id, name: matchup.league.name),
      ),
    );
  }

  String _timePerEnd(int minutesPerEnd) =>
      context.l10n.gameStartDialogTimePerEndByPlayersButtonLabel(
        minutesPerEnd.toString(),
        _printDuration(Duration(minutes: minutesPerEnd * _ends)),
      );

  String _printDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60).abs());
    return '${twoDigits(duration.inHours)}:$twoDigitMinutes';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = widget.rockColors ?? RockColors.defaults(l10n);
    final matchup = _matchup;

    // Every band shares the height, so the controls grow with the screen
    // and line up down both edges.
    return AbsorbPointer(
      absorbing: _guarded,
      child: Dialog.fullscreen(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 16,
            children: [
              if (widget.leagues.isNotEmpty)
                Expanded(
                  flex: 11,
                  child: _LeagueBar(
                    colors: colors,
                    matchup: matchup,
                    league: _currentLeague,
                    now: widget.now,
                    canChangeLeague: widget.leagues.length > 1,
                    onChooseLeague: _chooseLeague,
                    onPickTeams: () => _pickTeams(colors),
                    onClear: () => setState(() => _matchup = null),
                  ),
                ),
              Expanded(
                flex: 10,
                child: _SettingRow(
                  label: l10n.gameStartDialogFormLabelNumberOfEnds,
                  child: _Segments<int>(
                    selected: _ends,
                    onSelected: (ends) => setState(() => _ends = ends),
                    segments: const {
                      2: GameStartSegmentControlText(text: '2'),
                      4: GameStartSegmentControlText(text: '4'),
                      6: GameStartSegmentControlText(text: '6'),
                      8: GameStartSegmentControlText(text: '8'),
                      10: GameStartSegmentControlText(text: '10'),
                    },
                  ),
                ),
              ),
              Expanded(
                flex: 13,
                child: _SettingRow(
                  label: l10n.gameStartDialogFormLabelPlayersPerTeam,
                  child: _Segments<int>(
                    selected: _playersPerTeam,
                    onSelected: (players) =>
                        setState(() => _playersPerTeam = players),
                    segments: {
                      0: GameStartSegmentControlText(
                        text: '0',
                        subtext: l10n.gameStartDialogZeroPlayersButtonLabel,
                      ),
                      2: GameStartSegmentControlText(
                        text: '2',
                        subtext: _timePerEnd(Constants.minutesPerEndTwoPlayers),
                      ),
                      4: GameStartSegmentControlText(
                        text: '4',
                        subtext: _timePerEnd(
                          Constants.minutesPerEndFourPlayers,
                        ),
                      ),
                    },
                  ),
                ),
              ),
              Expanded(
                flex: 10,
                child: _SettingRow(
                  label: l10n.gameStartDialogFormLabelFirstEndHammer,
                  // In a league game the hammer goes to a team, so the
                  // choice shows the teams' names once they are picked.
                  child: _Segments<int>(
                    selected: _hammerTeam,
                    onSelected: (team) => setState(() => _hammerTeam = team),
                    segments: {
                      0: GameStartSegmentControlText(
                        text: matchup?.team1.name ?? colors.team1.name,
                      ),
                      1: GameStartSegmentControlText(
                        text: matchup?.team2.name ?? colors.team2.name,
                      ),
                    },
                  ),
                ),
              ),
              Expanded(
                flex: 8,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      'v$packageVersion',
                      style: TextStyle(color: Colors.grey),
                    ),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.bottomRight,
                      child: ElevatedButton(
                        onPressed: () => _start(colors),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 8,
                          ),
                          child: Text(
                            l10n.gameStartDialogButtonLabelStartGame,
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
            ],
          ),
        ),
      ),
    );
  }
}

/// A setting's name beside its control. Every row gives the name the same
/// share of the width, so the controls all start and end together.
class _SettingRow extends StatelessWidget {
  const _SettingRow({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          flex: 3,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(label, style: const TextStyle(fontSize: 40)),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(flex: 7, child: child),
      ],
    );
  }
}

/// A row of choices of which one is selected. The segments split the width
/// evenly and fill the height they are given, which the segmented control
/// package this replaced could not do: it sized each segment to its text.
class _Segments<T> extends StatelessWidget {
  const _Segments({
    required this.segments,
    required this.selected,
    required this.onSelected,
  });

  final Map<T, Widget> segments;
  final T selected;
  final ValueChanged<T> onSelected;

  static const _radius = Radius.circular(20);

  @override
  Widget build(BuildContext context) {
    final values = segments.keys.toList();
    return DecoratedBox(
      // In front, or the segments' own fill would paint over the outline.
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey),
        borderRadius: const BorderRadius.all(_radius),
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.all(_radius),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final (index, value) in values.indexed) ...[
              if (index > 0)
                const VerticalDivider(width: 1, color: Colors.grey),
              Expanded(
                child: Material(
                  color: value == selected ? Colors.blueAccent : Colors.white,
                  child: InkWell(
                    onTap: () => onSelected(value),
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: DefaultTextStyle.merge(
                        style: TextStyle(
                          color: value == selected
                              ? Colors.white
                              : Colors.black,
                        ),
                        // Shrinks a long label, such as a team's name, to
                        // its segment instead of clipping it.
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: segments[value],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
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
        mainAxisSize: MainAxisSize.min,
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

/// The one thing league games add to the setup screen: a bar holding the
/// league and the teams. Its left side names the league and changes it; its
/// right side opens the team picker, and afterwards shows the teams that
/// were picked. Leaving the bar alone starts an open game.
class _LeagueBar extends StatefulWidget {
  const _LeagueBar({
    required this.colors,
    required this.matchup,
    required this.league,
    required this.now,
    required this.canChangeLeague,
    required this.onChooseLeague,
    required this.onPickTeams,
    required this.onClear,
  });

  final RockColors colors;
  final LeagueMatchup? matchup;

  /// The league a game started now would be in, if that is known.
  final League? Function() league;
  final DateTime Function() now;

  /// False at a club with a single league, where there is nothing to change.
  final bool canChangeLeague;
  final VoidCallback onChooseLeague;
  final VoidCallback onPickTeams;
  final VoidCallback onClear;

  @override
  State<_LeagueBar> createState() => _LeagueBarState();
}

class _LeagueBarState extends State<_LeagueBar> {
  // The setup screen is left open between games, sometimes overnight, and
  // the league on show follows the clock.
  late final Timer _refresh;

  @override
  void initState() {
    super.initState();
    _refresh = Timer.periodic(
      const Duration(minutes: 1),
      (_) => setState(() {}),
    );
  }

  @override
  void dispose() {
    _refresh.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final matchup = widget.matchup;
    final league = widget.league();
    final radius = BorderRadius.circular(20);

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
              onTap: widget.canChangeLeague ? widget.onChooseLeague : null,
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
                              league != null && league.isPlayingAt(widget.now())
                                  ? l10n.leaguePlayingNowLabel
                                  : l10n.gameStartDialogLeagueBarLeagueLabel,
                              style: const TextStyle(fontSize: 24),
                            ),
                            Text(
                              league?.name ??
                                  l10n.gameStartDialogLeagueBarChooseLeague,
                              style: const TextStyle(
                                fontSize: 40,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (widget.canChangeLeague)
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
              onTap: widget.onPickTeams,
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
                        child: matchup == null
                            ? Text(
                                l10n.gameStartDialogLeagueBarPickTeams,
                                style: const TextStyle(
                                  fontSize: 40,
                                  fontWeight: FontWeight.bold,
                                ),
                              )
                            : Row(
                                children: [
                                  _TeamChip(
                                    color: widget.colors.team1,
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
                                    color: widget.colors.team2,
                                    name: matchup.team2.name,
                                  ),
                                ],
                              ),
                      ),
                    ),
                    if (matchup == null)
                      const Icon(Icons.chevron_right, size: 60)
                    else
                      IconButton(
                        iconSize: 50,
                        tooltip: l10n.gameStartDialogLeagueBarClearTooltip,
                        onPressed: widget.onClear,
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
