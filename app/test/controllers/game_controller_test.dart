import 'package:curling_scoreboard/constants.dart';
import 'package:curling_scoreboard/controllers/controllers.dart';
import 'package:curling_scoreboard/models/models.dart';
import 'package:curling_scoreboard/services/sync_service.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records what would have been written to Firestore instead of writing it.
class _FakeSyncService implements SyncService {
  final liveGamePushes = <Map<String, dynamic>>[];
  final completedGames = <Map<String, dynamic>>[];

  int liveGameClears = 0;

  @override
  Future<void> clearLiveGame() async {
    liveGameClears++;
  }

  @override
  Future<void> pushLiveGame(CurlingGame game) async {
    liveGamePushes.add(game.toJson());
  }

  @override
  Future<void> saveCompletedGame(CurlingGame game) async {
    completedGames.add(game.toJson());
  }

  @override
  SyncError? get lastError => null;

  @override
  Future<void> pushDeviceStatus(Map<String, dynamic> status) async {}
}

CurlingGame _game({
  int numberOfEnds = 8,
  int numberOfPlayersPerTeam = 4,
  bool team1HadLastStoneFirstEnd = false,
}) => CurlingGame(
  team1: CurlingTeam(
    name: 'Red',
    color: Colors.red,
    textColor: Colors.white,
    hasHammer: team1HadLastStoneFirstEnd,
    hadLastStoneFirstEnd: team1HadLastStoneFirstEnd,
  ),
  team2: CurlingTeam(
    name: 'Yellow',
    color: Colors.yellow,
    textColor: Colors.black,
    hasHammer: !team1HadLastStoneFirstEnd,
    hadLastStoneFirstEnd: !team1HadLastStoneFirstEnd,
  ),
  numberOfEnds: numberOfEnds,
  numberOfPlayersPerTeam: numberOfPlayersPerTeam,
);

CurlingEnd _end(int endNumber, int score, [ScoringTeam? team]) =>
    CurlingEnd(endNumber: endNumber, score: score, scoringTeam: team);

void main() {
  late _FakeSyncService sync;
  late GameController controller;
  late int notifications;

  setUp(() {
    sync = _FakeSyncService();
    notifications = 0;
    controller = GameController(syncService: sync)
      ..addListener(() => notifications++);
  });

  tearDown(() => controller.dispose());

  group('before a game is started', () {
    test('shows a placeholder game with the clock stopped', () {
      expect(controller.game.team1.name, 'Red');
      expect(controller.game.team2.name, 'Yellow');
      expect(controller.game.numberOfEnds, Constants.defaultTotalEnds);
      expect(controller.game.ends, isEmpty);
      expect(controller.isClockRunning, isFalse);
      expect(controller.totalTimerSeconds, 0);
      expect(controller.overUnderInSeconds, 0);
    });
  });

  group('startGame', () {
    test('puts the game on the scoreboard and starts the clock', () {
      fakeAsync((async) {
        final game = _game();
        controller.startGame(game);

        expect(controller.game, same(game));
        expect(controller.isClockRunning, isTrue);
        expect(notifications, 1);
        expect(sync.completedGames, isEmpty);
      });
    });

    test('publishes the game as live in the first end before any score', () {
      fakeAsync((async) {
        controller.startGame(_game());

        expect(sync.liveGamePushes, hasLength(1));
        expect(sync.liveGamePushes.single['currentPlayingEnd'], 1);
        expect(controller.game.team1TotalScore, 0);
        expect(controller.game.team2TotalScore, 0);
      });
    });

    test('works out the time allowed for each end, plus the extra end', () {
      fakeAsync((async) {
        controller.startGame(_game());

        const perEnd = Constants.minutesPerEndFourPlayers * 60;
        expect(
          controller.fullGameDuration,
          const Duration(minutes: 8 * Constants.minutesPerEndFourPlayers),
        );
        expect(controller.secondsPerEnd, [
          for (var end = 1; end <= 9; end++) perEnd * end,
        ]);
      });
    });

    test('uses the doubles end length for two players a team', () {
      fakeAsync((async) {
        controller.startGame(_game(numberOfEnds: 6, numberOfPlayersPerTeam: 2));

        const perEnd = Constants.minutesPerEndTwoPlayers * 60;
        expect(controller.secondsPerEnd, hasLength(7));
        expect(controller.secondsPerEnd.first, perEnd);
        expect(controller.secondsPerEnd.last, perEnd * 7);
      });
    });
  });

  group('game clock', () {
    test('ticks once a second and notifies listeners each time', () {
      fakeAsync((async) {
        controller.startGame(_game());
        notifications = 0;

        async.elapse(const Duration(seconds: 3));

        expect(controller.totalTimerSeconds, 3);
        expect(notifications, 3);
      });
    });

    test('tracks over and under against the end being played', () {
      fakeAsync((async) {
        controller.startGame(_game());
        final endOneTarget = controller.secondsPerEnd[0];
        final endTwoTarget = controller.secondsPerEnd[1];

        async.elapse(const Duration(seconds: 10));
        expect(controller.overUnderInSeconds, 10 - endOneTarget);

        controller.enterScore(_end(1, 1, ScoringTeam.team1));
        async.elapse(const Duration(seconds: 1));
        expect(controller.overUnderInSeconds, 11 - endTwoTarget);
      });
    });

    test('goes over once the time for the end has run out', () {
      fakeAsync((async) {
        controller.startGame(_game());

        async.elapse(Duration(seconds: controller.secondsPerEnd[0] + 5));

        expect(controller.overUnderInSeconds, 5);
      });
    });

    test('stops when the game is finished', () {
      fakeAsync((async) {
        controller.startGame(_game());
        async.elapse(const Duration(seconds: 4));

        controller.finishGame();
        async.elapse(const Duration(seconds: 10));

        expect(controller.isClockRunning, isFalse);
        expect(controller.totalTimerSeconds, 4);
      });
    });
  });

  group('enterScore', () {
    test('records the end, moves play on and pushes the live game', () {
      fakeAsync((async) {
        controller.startGame(_game());
        notifications = 0;
        sync.liveGamePushes.clear();

        final accepted = controller.enterScore(_end(1, 2, ScoringTeam.team2));

        expect(accepted, isTrue);
        expect(controller.game.ends, hasLength(1));
        expect(controller.game.currentPlayingEnd, 2);
        expect(controller.game.team2TotalScore, 2);
        expect(notifications, 1);
        expect(sync.liveGamePushes, hasLength(1));
        expect(sync.liveGamePushes.single['currentPlayingEnd'], 2);
        expect(sync.completedGames, isEmpty);
      });
    });

    test('a blank end keeps the hammer with the same team', () {
      fakeAsync((async) {
        controller.startGame(_game());
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team2);
        sync.liveGamePushes.clear();

        controller.enterScore(_end(1, 0));

        expect(controller.game.ends.single.scoringTeam, isNull);
        expect(controller.game.team1TotalScore, 0);
        expect(controller.game.team2TotalScore, 0);
        expect(controller.game.currentPlayingEnd, 2);
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team2);
        expect(sync.liveGamePushes, hasLength(1));
      });
    });

    test('a blank end passes the hammer in doubles', () {
      fakeAsync((async) {
        controller
          ..startGame(_game(numberOfPlayersPerTeam: 2))
          ..enterScore(_end(1, 0));

        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team1);
      });
    });

    test('the hammer goes to the team that did not score', () {
      fakeAsync((async) {
        controller
          ..startGame(_game())
          ..enterScore(_end(1, 1, ScoringTeam.team2));
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team1);

        controller.enterScore(_end(2, 3, ScoringTeam.team1));
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team2);
      });
    });

    test('play stops advancing at the extra end', () {
      fakeAsync((async) {
        controller
          ..startGame(_game(numberOfEnds: 2))
          ..enterScore(_end(1, 1, ScoringTeam.team1))
          ..enterScore(_end(2, 1, ScoringTeam.team2));
        expect(controller.game.currentPlayingEnd, 3);
        expect(controller.game.currentPlayingEndForDisplay, 'E');

        controller.enterScore(_end(3, 1, ScoringTeam.team1));
        expect(controller.game.currentPlayingEnd, 3);
        expect(controller.game.ends, hasLength(3));
      });
    });

    test('refuses an end past the extra end without pushing', () {
      fakeAsync((async) {
        controller.startGame(_game(numberOfEnds: 2)..currentPlayingEnd = 4);
        notifications = 0;
        sync.liveGamePushes.clear();

        final accepted = controller.enterScore(_end(4, 1, ScoringTeam.team1));

        expect(accepted, isFalse);
        expect(controller.game.ends, isEmpty);
        expect(notifications, 0);
        expect(sync.liveGamePushes, isEmpty);
      });
    });

    test('does not finish the game itself once it is complete', () {
      fakeAsync((async) {
        controller
          ..startGame(_game(numberOfEnds: 1))
          ..enterScore(_end(1, 1, ScoringTeam.team1));

        expect(controller.game.isGameComplete, isTrue);
        expect(controller.isClockRunning, isTrue);
        expect(sync.completedGames, isEmpty);
      });
    });
  });

  group('editScore', () {
    test('corrects a past end, rechecks the hammer and pushes', () {
      fakeAsync((async) {
        controller
          ..startGame(_game())
          ..enterScore(_end(1, 2, ScoringTeam.team2))
          ..enterScore(_end(2, 1, ScoringTeam.team1));
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team2);
        sync.liveGamePushes.clear();
        notifications = 0;

        controller.editScore(2, 0, null);

        expect(controller.game.ends[1].score, 0);
        expect(controller.game.ends[1].scoringTeam, isNull);
        expect(controller.game.team1TotalScore, 0);
        expect(controller.game.team2TotalScore, 2);
        // End 1 went to team 2, then end 2 is now blank: team 1 keeps it.
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team1);
        expect(controller.game.currentPlayingEnd, 3);
        expect(notifications, 1);
        expect(sync.liveGamePushes, hasLength(1));
        expect(sync.completedGames, isEmpty);
      });
    });

    test('can move the points of an earlier end to the other team', () {
      fakeAsync((async) {
        controller
          ..startGame(_game())
          ..enterScore(_end(1, 2, ScoringTeam.team2))
          ..enterScore(_end(2, 0))
          ..editScore(1, 2, ScoringTeam.team1);

        expect(controller.game.team1ScoresByEnd, [2, 0]);
        expect(controller.game.team2ScoresByEnd, [0, 0]);
        expect(controller.game.whichTeamHasHammer(), ScoringTeam.team2);
      });
    });
  });

  group('finishGame', () {
    test('stops the clock and saves the completed game once', () {
      fakeAsync((async) {
        controller
          ..startGame(_game())
          ..enterScore(_end(1, 3, ScoringTeam.team1));
        sync.liveGamePushes.clear();
        notifications = 0;

        controller.finishGame();

        expect(controller.isClockRunning, isFalse);
        expect(notifications, 1);
        expect(sync.completedGames, hasLength(1));
        expect(sync.completedGames.single['ends'], hasLength(1));
        expect(sync.liveGamePushes, isEmpty);
      });
    });

    test('resetForNextGame clears the ends and the clock', () {
      fakeAsync((async) {
        controller.startGame(_game());
        async.elapse(const Duration(seconds: 7));
        controller
          ..enterScore(_end(1, 3, ScoringTeam.team1))
          ..finishGame();
        notifications = 0;

        controller.resetForNextGame();

        expect(controller.game.ends, isEmpty);
        expect(controller.totalTimerSeconds, 0);
        expect(controller.overUnderInSeconds, 0);
        expect(notifications, 1);
        // One from starting the game and one from the score; none from the
        // reset.
        expect(sync.liveGamePushes, hasLength(2));
        expect(sync.completedGames, hasLength(1));
      });
    });

    test('the next game starts its clock from zero', () {
      fakeAsync((async) {
        controller.startGame(_game());
        async.elapse(const Duration(seconds: 5));
        controller
          ..finishGame()
          ..resetForNextGame()
          ..startGame(_game(numberOfEnds: 6));

        async.elapse(const Duration(seconds: 2));

        expect(controller.totalTimerSeconds, 2);
        expect(controller.secondsPerEnd, hasLength(7));
      });
    });
  });

  test('changing the scoreboard style notifies listeners', () {
    controller.scoreboardStyle = ScoreboardStyle.club;

    expect(controller.scoreboardStyle, ScoreboardStyle.club);
    expect(controller.game.scoreboardStyle, ScoreboardStyle.club);
    expect(notifications, 1);
    expect(sync.liveGamePushes, isEmpty);
  });
}
