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

/// Asks which of the club's [leagues] a game is in, listing the ones in a
/// draw at [now] first. Completes with null if dismissed.
Future<League?> showLeagueChooser(
  BuildContext context, {
  required List<League> leagues,
  required DateTime now,
}) {
  return showDialog<League>(
    context: context,
    builder: (_) => _LeagueChooser(leagues: leagues, now: now),
  );
}

/// A modal listing a club's leagues as large buttons. A club can have ten
/// or so, so they go two across once there are more than a few, and the
/// rows share the height instead of scrolling: every league is on screen.
class _LeagueChooser extends StatelessWidget {
  const _LeagueChooser({required this.leagues, required this.now});

  final List<League> leagues;
  final DateTime now;

  static const _rowHeight = 96.0;
  static const _spacing = 12.0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    // Whatever is on the ice now comes first.
    final ordered = [
      for (final playing in [true, false])
        for (final league in leagues)
          if (league.isPlayingAt(now) == playing) league,
    ];
    final columns = ordered.length > 3 ? 2 : 1;
    final rows = [
      for (var i = 0; i < ordered.length; i += columns)
        ordered.sublist(
          i,
          i + columns > ordered.length ? ordered.length : i + columns,
        ),
    ];

    return Dialog(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: columns == 1 ? 560 : 960),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.leagueChooserTitle,
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              for (final (index, row) in rows.indexed)
                Flexible(
                  child: Padding(
                    padding: EdgeInsets.only(top: index == 0 ? 0 : _spacing),
                    child: SizedBox(
                      height: _rowHeight,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: _spacing,
                        children: [
                          for (final league in row)
                            Expanded(
                              child: LeagueChooserOption(
                                league: league,
                                playing: league.isPlayingAt(now),
                              ),
                            ),
                          // Keeps an odd league out the same width as the
                          // rest.
                          for (var i = row.length; i < columns; i++)
                            const Spacer(),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(
                    l10n.matchupPickerCancelButtonLabel,
                    style: const TextStyle(fontSize: 32),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One league in the league chooser. Tapping it chooses the league.
class LeagueChooserOption extends StatelessWidget {
  const LeagueChooserOption({
    required this.league,
    required this.playing,
    super.key,
  });

  final League league;

  /// Whether the league is in a draw right now, which is marked.
  final bool playing;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: playing
            ? Colors.blueAccent.withValues(alpha: 0.16)
            : null,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      ),
      onPressed: () => Navigator.pop(context, league),
      // A long league name shrinks to its button instead of wrapping.
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              league.name,
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),
            if (playing)
              Text(
                context.l10n.leaguePlayingNowLabel,
                style: const TextStyle(fontSize: 20),
              ),
          ],
        ),
      ),
    );
  }
}

/// A full screen for choosing the two teams of a league game.
///
/// Every team in the league is one large button. The first team tapped
/// throws the first rock color and the second the other, and the two slots
/// at the top show who has been picked. Pops with a [LeagueMatchup], or with
/// null if cancelled.
///
/// The screen has no title and no way to change league: both live on the
/// game setup screen, which leaves this one to the teams.
class LeagueMatchupPicker extends StatefulWidget {
  const LeagueMatchupPicker({
    required this.league,
    required this.rockColors,
    this.initial,
    super.key,
  });

  final League league;
  final RockColors rockColors;

  /// The teams to start from, when changing a matchup already picked.
  final LeagueMatchup? initial;

  @override
  State<LeagueMatchupPicker> createState() => _LeagueMatchupPickerState();
}

class _LeagueMatchupPickerState extends State<LeagueMatchupPicker> {
  LeagueTeam? _team1;
  LeagueTeam? _team2;

  @override
  void initState() {
    super.initState();
    _team1 = widget.initial?.team1;
    _team2 = widget.initial?.team2;
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
    final team1 = _team1;
    final team2 = _team2;

    return Dialog.fullscreen(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: 84,
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
            const SizedBox(height: 12),
            Expanded(
              child: _TileGrid(
                children: [
                  for (final team in widget.league.teams)
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
            const SizedBox(height: 12),
            // Bottom right, where the setup screen's Start Game is too.
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
                  onPressed: team1 == null || team2 == null
                      ? null
                      : () => Navigator.pop(
                          context,
                          LeagueMatchup(
                            league: widget.league,
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

/// One button in a [_TileGrid].
class _Tile {
  const _Tile({required this.label, required this.onTap, this.color});

  final String label;
  final VoidCallback onTap;

  /// The rock color this tile has been picked for, if any.
  final RockColor? color;
}

/// Lays tiles out on a fixed grid that fills the space it is given without
/// scrolling, so every team is on screen at once.
class _TileGrid extends StatelessWidget {
  const _TileGrid({required this.children});

  final List<_Tile> children;

  static const _columns = 4;
  static const _rows = 4;
  static const _spacing = 12.0;
  static const _padding = 12.0;

  // Low enough that most leagues land on it, so their text matches too.
  // Only a league with an unusually long team name goes smaller.
  static const _maxFontSize = 40.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final count = children.length;
        if (count == 0) return const SizedBox.shrink();

        // Always laid out as four by four, which holds the thirteen teams
        // of the largest league expected. A smaller league leaves cells
        // empty instead of growing its buttons, so the screen looks the
        // same from one league to the next. Only a league too big for the
        // grid changes it.
        final columns = count <= _columns * _rows ? _columns : _columns + 1;
        final neededRows = (count / columns).ceil();
        final rows = neededRows < _rows ? _rows : neededRows;
        final width =
            (constraints.maxWidth - _spacing * (columns - 1)) / columns;
        final height = (constraints.maxHeight - _spacing * (rows - 1)) / rows;

        final style = TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: _fontSize(context, width, height),
        );

        return GridView.count(
          crossAxisCount: columns,
          mainAxisSpacing: _spacing,
          crossAxisSpacing: _spacing,
          childAspectRatio: width / height,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            for (final tile in children)
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: tile.color?.color,
                  foregroundColor: tile.color?.textColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  padding: const EdgeInsets.all(_padding),
                ),
                onPressed: tile.onTap,
                // The size is worked out to fit; this only catches what the
                // measurement could not foresee, such as a fallback font.
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(tile.label, style: style),
                ),
              ),
          ],
        );
      },
    );
  }

  /// One size for every tile: the largest at which the longest name still
  /// fits. Sizing each name by itself made short names shout over long ones.
  double _fontSize(BuildContext context, double width, double height) {
    const probe = 100.0;
    final base = DefaultTextStyle.of(
      context,
    ).style.copyWith(fontWeight: FontWeight.bold, fontSize: probe);
    final scaler = MediaQuery.textScalerOf(context);

    var widest = 0.0;
    for (final tile in children) {
      final painter = TextPainter(
        text: TextSpan(text: tile.label, style: base),
        textDirection: Directionality.of(context),
        textScaler: scaler,
        maxLines: 1,
      )..layout();
      if (painter.width > widest) widest = painter.width;
      painter.dispose();
    }
    if (widest == 0) return _maxFontSize;

    final byWidth = probe * (width - _padding * 2) / widest;
    // Leave the button some air above and below the name.
    final byHeight = (height - _padding * 2) * 0.6;
    return [_maxFontSize, byWidth, byHeight].reduce((a, b) => a < b ? a : b);
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
            child: Row(
              children: [
                Text(color.name, style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 16),
                Expanded(
                  child: _FittedLabel(
                    team?.name ?? context.l10n.matchupPickerEmptySlotLabel,
                    bold: team != null,
                    fontSize: 36,
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
  const _FittedLabel(this.label, {required this.fontSize, this.bold = true});

  final String label;
  final bool bold;

  /// The size to aim for.
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          label,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}
