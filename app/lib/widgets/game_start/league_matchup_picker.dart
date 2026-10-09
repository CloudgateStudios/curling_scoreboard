import 'package:curling_scoreboard/l10n/l10n.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:flutter/material.dart';

/// The league and the two teams of a league game. [team1] throws the first
/// rock color and [team2] the second.
@immutable
class LeagueMatchup {
  const LeagueMatchup({
    required this.league,
    required this.team1,
    required this.team2,
  });

  final League league;
  final LeagueTeam team1;
  final LeagueTeam team2;
}

/// A full screen for choosing the two teams of a league game.
///
/// Every team in the league is one large button. The first team tapped
/// throws the first rock color and the second the other, and the two slots
/// at the top show who has been picked. Pops with a [LeagueMatchup], or with
/// null if cancelled.
class LeagueMatchupPicker extends StatefulWidget {
  const LeagueMatchupPicker({
    required this.leagues,
    required this.rockColors,
    required this.now,
    this.initial,
    super.key,
  });

  /// The club's active leagues. Must not be empty.
  final List<League> leagues;
  final RockColors rockColors;

  /// The scoreboard's local time, which decides the league to start on.
  final DateTime Function() now;

  /// The matchup to start from, when changing one already picked.
  final LeagueMatchup? initial;

  /// The league to offer first: the only one in a draw at [now], or the
  /// club's only league. Null when there is no clear answer.
  static League? suggestedLeague(List<League> leagues, DateTime now) {
    final playing = leagues.where((l) => l.isPlayingAt(now)).toList();
    if (playing.length == 1) return playing.single;
    return leagues.length == 1 ? leagues.single : null;
  }

  @override
  State<LeagueMatchupPicker> createState() => _LeagueMatchupPickerState();
}

class _LeagueMatchupPickerState extends State<LeagueMatchupPicker> {
  League? _league;
  LeagueTeam? _team1;
  LeagueTeam? _team2;

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    _league =
        initial?.league ??
        LeagueMatchupPicker.suggestedLeague(widget.leagues, widget.now());
    _team1 = initial?.team1;
    _team2 = initial?.team2;
  }

  void _chooseLeague(League? league) {
    setState(() {
      _league = league;
      _team1 = null;
      _team2 = null;
    });
  }

  /// The first tap fills the first color, the second tap the other. Tapping
  /// a team that is already picked takes it back out.
  void _tapTeam(LeagueTeam team) {
    setState(() {
      if (_team1?.id == team.id) {
        _team1 = null;
      } else if (_team2?.id == team.id) {
        _team2 = null;
      } else if (_team1 == null) {
        _team1 = team;
      } else {
        // With both picked, another tap replaces the second team: the
        // usual slip is the second tap landing on the wrong button.
        _team2 = team;
      }
    });
  }

  void _swap() {
    setState(() {
      final team1 = _team1;
      _team1 = _team2;
      _team2 = team1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final league = _league;
    final team1 = _team1;
    final team2 = _team2;

    return Dialog.fullscreen(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    league?.name ?? l10n.matchupPickerChooseLeagueTitle,
                    style: const TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (league != null && widget.leagues.length > 1)
                  TextButton(
                    onPressed: () => _chooseLeague(null),
                    child: Text(
                      l10n.matchupPickerChangeLeagueButtonLabel,
                      style: const TextStyle(fontSize: 24),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (league == null)
              Expanded(
                child: _TileGrid(
                  children: [
                    // Whatever is on the ice now comes first.
                    for (final playing in [true, false])
                      for (final l in widget.leagues)
                        if (l.isPlayingAt(widget.now()) == playing)
                          _Tile(label: l.name, onTap: () => _chooseLeague(l)),
                  ],
                ),
              )
            else ...[
              SizedBox(
                height: 110,
                child: Row(
                  children: [
                    Expanded(
                      child: _Slot(
                        color: widget.rockColors.team1,
                        team: team1,
                        onClear: () => setState(() => _team1 = null),
                      ),
                    ),
                    IconButton(
                      iconSize: 48,
                      tooltip: l10n.matchupPickerSwapTooltip,
                      onPressed: team1 == null && team2 == null ? null : _swap,
                      icon: const Icon(Icons.swap_horiz),
                    ),
                    Expanded(
                      child: _Slot(
                        color: widget.rockColors.team2,
                        team: team2,
                        onClear: () => setState(() => _team2 = null),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _TileGrid(
                  children: [
                    for (final team in league.teams)
                      _Tile(
                        label: team.name,
                        color: team.id == team1?.id
                            ? widget.rockColors.team1
                            : team.id == team2?.id
                            ? widget.rockColors.team2
                            : null,
                        onTap: () => _tapTeam(team),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(
                    l10n.matchupPickerCancelButtonLabel,
                    style: const TextStyle(fontSize: 32),
                  ),
                ),
                const SizedBox(width: 24),
                ElevatedButton(
                  onPressed: league == null || team1 == null || team2 == null
                      ? null
                      : () => Navigator.pop(
                          context,
                          LeagueMatchup(
                            league: league,
                            team1: team1,
                            team2: team2,
                          ),
                        ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 8,
                    ),
                    child: Text(
                      l10n.matchupPickerDoneButtonLabel,
                      style: const TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Lays tiles out to fill the space they are given without scrolling, so
/// every team is on screen at once and as large as it can be.
class _TileGrid extends StatelessWidget {
  const _TileGrid({required this.children});

  final List<Widget> children;

  static const _spacing = 12.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final count = children.length;
        if (count == 0) return const SizedBox.shrink();

        // Four across suits a league of up to sixteen; beyond that, add
        // columns before the rows get too short to read.
        final columns = count <= 16 ? (count < 4 ? count : 4) : 5;
        final rows = (count / columns).ceil();
        final width =
            (constraints.maxWidth - _spacing * (columns - 1)) / columns;
        final height = (constraints.maxHeight - _spacing * (rows - 1)) / rows;

        return GridView.count(
          crossAxisCount: columns,
          mainAxisSpacing: _spacing,
          crossAxisSpacing: _spacing,
          childAspectRatio: width / height,
          physics: const NeverScrollableScrollPhysics(),
          children: children,
        );
      },
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.onTap, this.color});

  final String label;
  final VoidCallback onTap;

  /// The rock color this tile has been picked for, if any.
  final RockColor? color;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: color?.color,
        foregroundColor: color?.textColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        padding: const EdgeInsets.all(12),
      ),
      onPressed: onTap,
      child: _FittedLabel(label),
    );
  }
}

/// One of the two rock colors, showing the team picked for it.
class _Slot extends StatelessWidget {
  const _Slot({required this.color, required this.team, required this.onClear});

  final RockColor color;
  final LeagueTeam? team;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final team = this.team;
    return Material(
      color: color.color,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        // Tapping a filled slot empties it.
        onTap: team == null ? null : onClear,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: DefaultTextStyle.merge(
            style: TextStyle(color: color.textColor),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(color.name, style: const TextStyle(fontSize: 20)),
                Expanded(
                  child: _FittedLabel(
                    team?.name ?? context.l10n.matchupPickerEmptySlotLabel,
                    bold: team != null,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A name at a large size, shrunk only as far as it must be to fit.
class _FittedLabel extends StatelessWidget {
  const _FittedLabel(this.label, {this.bold = true});

  final String label;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 36,
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}
