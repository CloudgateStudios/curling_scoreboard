import 'dart:async';

import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:flutter/foundation.dart';

/// Holds the game on the scoreboard and the rules for playing it: the game
/// clock, entering and editing scores, and finishing a game.
///
/// It keeps the paired sheet up to date through [SyncService] as the game
/// changes. Listeners are notified whenever anything shown on the scoreboard
/// changes, including every tick of the clock.
class GameController extends ChangeNotifier {
  GameController({required SyncService syncService})
    : _syncService = syncService;

  final SyncService _syncService;

  // A placeholder game to show until one is started from the game start
  // dialog. None of it is used once a real game begins.
  CurlingGame _game = CurlingGame(
    team1: CurlingTeam(
      name: 'Red',
      color: Constants.redTeamColor,
      textColor: Constants.textHighContrastColor,
      hasHammer: false,
    ),
    team2: CurlingTeam(
      name: 'Yellow',
      color: Constants.yellowTeamColor,
      textColor: Constants.textDefaultColor,
      hasHammer: true,
      hadLastStoneFirstEnd: true,
    ),
    numberOfEnds: Constants.defaultTotalEnds,
    numberOfPlayersPerTeam: Constants.defaultNumberOfPlayersPerTeam,
  );

  Timer? _timer;
  int _totalTimerSeconds = 0;
  int _overUnderInSeconds = 0;
  Duration _fullGameDuration = Duration.zero;
  List<int> _secondsPerEnd = [];

  /// The game currently on the scoreboard.
  CurlingGame get game => _game;

  /// Seconds the game clock has run since the game started.
  int get totalTimerSeconds => _totalTimerSeconds;

  /// How far the clock is ahead of (positive) or behind (negative) the time
  /// allowed up to the end of the end being played.
  int get overUnderInSeconds => _overUnderInSeconds;

  /// The time allowed for every regular end of the game.
  Duration get fullGameDuration => _fullGameDuration;

  /// The clock time by which each end should be finished, in seconds. There
  /// is one entry per end plus one for the extra end.
  List<int> get secondsPerEnd => List.unmodifiable(_secondsPerEnd);

  /// Whether the game clock is running.
  bool get isClockRunning => _timer?.isActive ?? false;

  /// The scoreboard layout for the current game.
  ScoreboardStyle get scoreboardStyle => _game.scoreboardStyle;

  set scoreboardStyle(ScoreboardStyle style) {
    _game.scoreboardStyle = style;
    notifyListeners();
  }

  /// Puts [game] on the scoreboard and starts the game clock.
  void startGame(CurlingGame game) {
    _game = game;
    _startTimer();
    notifyListeners();

    // Publish the game straight away so it shows as live during the first
    // end, rather than only once the first score has been entered.
    unawaited(_syncService.pushLiveGame(_game));
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _totalTimerSeconds += 1;
      _overUnderInSeconds =
          _totalTimerSeconds - _secondsPerEnd[_game.currentPlayingEnd - 1];
      notifyListeners();
    });

    _calculateSecondsPerEnd();
  }

  void _calculateSecondsPerEnd() {
    _fullGameDuration = Duration(
      minutes: _game.numberOfEnds * _game.minutesPerEnd,
    );

    final secondsPerEnd = _fullGameDuration.inSeconds ~/ _game.numberOfEnds;
    _secondsPerEnd = List.generate(_game.numberOfEnds, (index) {
      return secondsPerEnd * (index + 1);
    });

    // Need to make sure we add in padding for the extra end
    _secondsPerEnd.add(secondsPerEnd * (_game.numberOfEnds + 1));
  }

  /// Records [curlingEnd] as the next end and moves play on to the end after.
  ///
  /// Returns false, changing nothing, if every end including the extra end
  /// has already been played. Callers should check [CurlingGame.isGameComplete]
  /// afterwards and finish the game if it is.
  bool enterScore(CurlingEnd curlingEnd) {
    // Don't allow for entering scores if we have filled all the ends
    if (_game.currentPlayingEnd > _game.numberOfEnds + 1) {
      return false;
    }

    if (_game.currentPlayingEnd + 1 <= _game.numberOfEnds + 1) {
      _game.currentPlayingEnd++;
    }

    final currentEndList = _game.ends.toList()..add(curlingEnd);

    _game
      ..ends = currentEndList
      ..evaluateHammer();
    notifyListeners();

    unawaited(_syncService.pushLiveGame(_game));
    return true;
  }

  /// Corrects the score of an end that has already been played. [end] is the
  /// end number, starting at 1.
  void editScore(int end, int score, ScoringTeam? team) {
    final originalEndScore = _game.ends.elementAt(end - 1)
      ..scoringTeam = team
      ..score = score;

    _game.ends[end - 1] = originalEndScore;
    _game.evaluateHammer();
    notifyListeners();

    unawaited(_syncService.pushLiveGame(_game));
  }

  /// Stops the game clock and saves the game as completed.
  void finishGame() {
    _timer?.cancel();
    notifyListeners();

    unawaited(_syncService.saveCompletedGame(_game));
  }

  /// Clears the finished game's ends and the clock, ready for the next game
  /// to be started.
  void resetForNextGame() {
    if (_game.ends.isNotEmpty) {
      _game.ends.clear();
    }

    _totalTimerSeconds = 0;
    _overUnderInSeconds = 0;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
