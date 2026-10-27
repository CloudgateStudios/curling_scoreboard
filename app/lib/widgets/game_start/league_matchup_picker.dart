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
///
/// During a bonspiel, [bonspielName] adds a way back to its games, which
/// calls [onBonspiel] and completes with null.
Future<League?> showLeagueChooser(
  BuildContext context, {
  required List<League> leagues,
  required DateTime now,
  String? bonspielName,
  VoidCallback? onBonspiel,
}) {
  return showDialog<League>(
    context: context,
    builder: (_) => _LeagueChooser(
      leagues: leagues,
      now: now,
      bonspielName: bonspielName,
      onBonspiel: onBonspiel,
    ),
  );
}

/// A modal listing a club's leagues as large buttons. A club can have ten
/// or so, so they go two across once there are more than a few, and the
/// rows share the height instead of scrolling: every league is on screen.
class _LeagueChooser extends StatelessWidget {
  const _LeagueChooser({
    required this.leagues,
    required this.now,
    this.bonspielName,
    this.onBonspiel,
  });

  final List<League> leagues;
  final DateTime now;
  final String? bonspielName;
  final VoidCallback? onBonspiel;

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
              Row(
                children: [
                  if (bonspielName case final name?)
                    // A long name shrinks rather than pushing Cancel off a
                    // chooser sized for one league.
                    Flexible(
                      child: TextButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          onBonspiel?.call();
                        },
                        icon: const Icon(Icons.arrow_back, size: 32),
                        label: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            l10n.leagueChooserBonspielButtonLabel(name),
                            style: const TextStyle(fontSize: 32),
                          ),
                        ),
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
/// Every team in the league is one large button. The two rock colors at the
/// top show who has been picked, and one of them is ringed as the color the
/// next team tapped goes to: the first color to begin with, then the other.
/// Tapping a color rings it instead. Pops with a [LeagueMatchup], or with
/// null if cancelled.
///
/// The screen has no title and no way to change league: both live on the
/// game setup screen, which leaves this one to the teams.
class LeagueMatchupPicker extends StatefulWidget {
  const LeagueMatchupPicker({
    required this.league,
    required this.rockColors,
    this.initial,
    this.initialTeam1,
    this.initialTeam2,
    this.moreTeams = const [],
    super.key,
  });

  /// Its teams are the ones offered first.
  final League league;
  final RockColors rockColors;

  /// The teams to start from, when changing a matchup already picked.
  final LeagueMatchup? initial;

  /// Teams already known for one color or the other, when [initial] is not
  /// given: a bonspiel game whose other team is still to come.
  final LeagueTeam? initialTeam1;
  final LeagueTeam? initialTeam2;

  /// Teams kept behind a "show all" button: in a bonspiel, all those not
  /// likely to be in the game, which can be up to 64.
  final List<LeagueTeam> moreTeams;

  @override
  State<LeagueMatchupPicker> createState() => _LeagueMatchupPickerState();
}

class _LeagueMatchupPickerState extends State<LeagueMatchupPicker> {
  LeagueTeam? _team1;
  LeagueTeam? _team2;

  /// The color the next team tapped goes to: 1 or 2, or null once both are
  /// picked and none has been tapped since.
  int? _target;
  late bool _showAll;

  @override
  void initState() {
    super.initState();
    _team1 = widget.initial?.team1 ?? widget.initialTeam1;
    _team2 = widget.initial?.team2 ?? widget.initialTeam2;
    _target = _firstEmpty();
    // With nobody likely, there is nothing else to show first.
    _showAll = widget.league.teams.isEmpty;
  }

  int? _firstEmpty() => _team1 == null
      ? 1
      : _team2 == null
      ? 2
      : null;

  /// A team goes to the ringed color, and the ring moves on to the other
  /// color if that one is still empty. Tapping a team that is already
  /// picked takes it back out and rings its color.
  void _tapTeam(LeagueTeam team) {
    setState(() {
      if (_team1?.id == team.id) {
        _team1 = null;
        _target = 1;
      } else if (_team2?.id == team.id) {
        _team2 = null;
        _target = 2;
      } else {
        // With both picked and no color tapped, another tap replaces the
        // second team: the usual slip is the second tap landing on the
        // wrong button.
        final target = _target ?? 2;
        if (target == 1) {
          _team1 = team;
        } else {
          _team2 = team;
        }
        final other = target == 1 ? 2 : 1;
        _target = (other == 1 ? _team1 : _team2) == null ? other : null;
      }
    });
  }

  void _clear(int slot) {
    setState(() {
      if (slot == 1) {
        _team1 = null;
      } else {
        _team2 = null;
      }
      _target = slot;
    });
  }

  void _swap() {
    setState(() {
      final team1 = _team1;
      _team1 = _team2;
      _team2 = team1;
      // The ring stays on whichever color is still to be picked.
      _target = _firstEmpty() ?? _target;
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
              height: 96,
              child: Row(
                children: [
                  Expanded(
                    child: _Slot(
                      color: widget.rockColors.team1,
                      team: team1,
                      targeted: _target == 1,
                      onTap: () => setState(() => _target = 1),
                      onClear: () => _clear(1),
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
                      targeted: _target == 2,
                      onTap: () => setState(() => _target = 2),
                      onClear: () => _clear(2),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _TileGrid(
                children: [
                  for (final team in [
                    ...widget.league.teams,
                    if (_showAll) ...widget.moreTeams,
                  ])
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
                if (widget.moreTeams.isNotEmpty &&
                    widget.league.teams.isNotEmpty)
                  TextButton(
                    onPressed: () => setState(() => _showAll = !_showAll),
                    child: Text(
                      _showAll
                          ? l10n.matchupPickerLikelyTeamsButtonLabel
                          : l10n.matchupPickerAllTeamsButtonLabel(
                              widget.league.teams.length +
                                  widget.moreTeams.length,
                            ),
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

/// One of the two rock colors, showing the team picked for it. A thick ring
/// marks the color the next team tapped goes to, and the color flashes when
/// a team lands on it so the pick is seen.
class _Slot extends StatefulWidget {
  const _Slot({
    required this.color,
    required this.team,
    required this.targeted,
    required this.onTap,
    required this.onClear,
  });

  final RockColor color;
  final LeagueTeam? team;
  final bool targeted;

  /// Rings this color, so the next team tapped goes here.
  final VoidCallback onTap;

  /// Takes the team back out.
  final VoidCallback onClear;

  @override
  State<_Slot> createState() => _SlotState();
}

class _SlotState extends State<_Slot> with SingleTickerProviderStateMixin {
  static const _ringWidth = 7.0;
  static const _ringGap = 4.0;

  // Starts at the end, where the flash has faded and the scale is back.
  late final _flash = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 400),
    value: 1,
  );

  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 1, end: 1.04), weight: 1),
    TweenSequenceItem(tween: Tween(begin: 1.04, end: 1), weight: 2),
  ]).animate(CurvedAnimation(parent: _flash, curve: Curves.easeOut));

  @override
  void didUpdateWidget(_Slot oldWidget) {
    super.didUpdateWidget(oldWidget);
    final team = widget.team;
    if (team != null && team.id != oldWidget.team?.id) {
      _flash.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _flash.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final color = widget.color;
    final team = widget.team;
    final radius = BorderRadius.circular(16);
    final ringRadius = BorderRadius.circular(16 + _ringWidth + _ringGap);

    return ScaleTransition(
      scale: _scale,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: ringRadius,
          border: Border.all(
            width: _ringWidth,
            // The blue the setup screen marks its choices with. Kept in
            // place when unringed, so the slot does not jump.
            color: widget.targeted ? Colors.blueAccent : Colors.transparent,
          ),
        ),
        child: Padding(
          // A DecoratedBox paints its border over the child, so the child
          // is held clear of the ring as well as the gap.
          padding: const EdgeInsets.all(_ringWidth + _ringGap),
          child: Material(
            color: color.color,
            borderRadius: radius,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: widget.onTap,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(left: 16, right: 4),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(color: color.textColor),
                      child: Row(
                        children: [
                          Text(
                            color.name,
                            style: const TextStyle(fontSize: 22),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: _FittedLabel(
                              team?.name ??
                                  (widget.targeted
                                      ? l10n.matchupPickerEmptySlotLabel
                                      : ''),
                              bold: team != null,
                              fontSize: 36,
                            ),
                          ),
                          if (team != null)
                            IconButton(
                              iconSize: 36,
                              color: color.textColor,
                              tooltip: l10n.matchupPickerClearSlotTooltip(
                                color.name,
                              ),
                              onPressed: widget.onClear,
                              icon: const Icon(Icons.cancel),
                            )
                          else
                            const SizedBox(width: 12),
                        ],
                      ),
                    ),
                  ),
                  // A white wash that fades out as the team lands.
                  IgnorePointer(
                    child: FadeTransition(
                      opacity: ReverseAnimation(_flash),
                      child: ColoredBox(
                        color: Colors.white.withValues(alpha: 0.6),
                      ),
                    ),
                  ),
                ],
              ),
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
